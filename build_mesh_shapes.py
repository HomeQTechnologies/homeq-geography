#!/usr/bin/env python3
"""Build individual geoshape files from a HomeQ mesh file.

Each mesh definition face becomes one geoshape polygon. Each composite becomes
one geoshape whose geometry is the clean union of its member face polygons, with
internal shared edges dissolved so only the outer boundary remains.

Output matches the format used by flatten.py / fetch_shape.py:
  <type>.<slug>.geojson.gz
  <type>.<slug>.geojson
  <type>.<slug>.json

Usage:
    python build_mesh_shapes.py data/meshes/stockholm-municipality.mesh.json
    python build_mesh_shapes.py mesh.mesh.json --output-dir data/individual/area
    python build_mesh_shapes.py mesh.mesh.json --faces-only
    python build_mesh_shapes.py mesh.mesh.json --composites-only
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from shapely import make_valid, unary_union
from shapely.geometry import Polygon
from shapely.geometry.base import BaseGeometry

from flatten_lib import build_geojson, slugify

MESH_FILE_TYPE = "homeq-mesh"
COORDINATE_PRECISION = 6


@dataclass(frozen=True)
class ShapeRecord:
    kind: str
    name: str
    old_id: int
    shape_type: str
    geometry: dict[str, Any]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mesh_file", type=Path, help="Path to a .mesh.json file")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("data/individual/area"),
        help="Directory for generated shape files (default: data/individual/area)",
    )
    parser.add_argument(
        "--face-type",
        default="area",
        help='Geoshape type for faces (default: "area")',
    )
    parser.add_argument(
        "--composite-type",
        default=None,
        help="Geoshape type for composites (default: use composite definition type, normalized)",
    )
    parser.add_argument("--faces-only", action="store_true", help="Only export face shapes")
    parser.add_argument("--composites-only", action="store_true", help="Only export composite shapes")
    parser.add_argument("--dry-run", action="store_true", help="Validate and print summary without writing files")
    return parser.parse_args()


def load_mesh_file(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"{path}: invalid JSON ({exc})") from exc

    if not isinstance(payload, dict):
        raise SystemExit(f"{path}: expected a JSON object")

    if payload.get("type") == MESH_FILE_TYPE and isinstance(payload.get("document"), dict):
        document = payload["document"]
        definition = payload.get("definition")
    elif isinstance(payload.get("document"), dict):
        document = payload["document"]
        definition = payload.get("definition")
    elif "faces" in payload and "vertices" in payload:
        document = payload
        definition = payload.get("definition")
    else:
        raise SystemExit(f"{path}: file does not contain a mesh document")

    if not isinstance(document, dict):
        raise SystemExit(f"{path}: mesh document is missing or invalid")

    return {
        "document": document,
        "definition": definition if isinstance(definition, dict) else None,
    }


def round_position(position: Iterable[float]) -> tuple[float, float]:
    lon, lat = position
    return (
        round(float(lon), COORDINATE_PRECISION),
        round(float(lat), COORDINATE_PRECISION),
    )


def build_face_polygon(document: dict[str, Any], face: dict[str, Any]) -> Polygon:
    vertices = document.get("vertices") or {}
    ring: list[tuple[float, float]] = []

    for vertex_id in face.get("vertexIds") or []:
        vertex = vertices.get(vertex_id)
        if not vertex:
            raise ValueError(f'Face "{face.get("name")}" references unknown vertex {vertex_id}')
        ring.append(round_position(vertex["position"]))

    if len(ring) < 3:
        raise ValueError(f'Face "{face.get("name")}" has fewer than 3 vertices')

    if ring[0] != ring[-1]:
        ring.append(ring[0])

    polygon = Polygon(ring)
    if polygon.is_empty or not polygon.is_valid:
        polygon = make_valid(polygon)
    if polygon.is_empty:
        raise ValueError(f'Face "{face.get("name")}" produced an empty polygon')

    return polygon


def normalize_definition_type(definition_type: str | None, fallback: str) -> str:
    if not definition_type or definition_type in {"face", "composite"}:
        return fallback
    if definition_type.startswith("area"):
        return "area"
    return definition_type


def dissolve_polygons(polygons: list[Polygon]) -> BaseGeometry:
    if not polygons:
        raise ValueError("Cannot dissolve an empty polygon list")

    if len(polygons) == 1:
        geometry = polygons[0]
    else:
        geometry = unary_union(polygons)

    geometry = make_valid(geometry)
    if geometry.is_empty:
        raise ValueError("Union produced an empty geometry")

    return geometry


def geometry_to_multipolygon(geometry: BaseGeometry) -> dict[str, Any]:
    geometry = make_valid(geometry)
    if geometry.is_empty:
        raise ValueError("Geometry is empty")

    if geometry.geom_type == "Polygon":
        polygons = [geometry]
    elif geometry.geom_type == "MultiPolygon":
        polygons = list(geometry.geoms)
    elif geometry.geom_type == "GeometryCollection":
        polygons = [geom for geom in geometry.geoms if geom.geom_type in {"Polygon", "MultiPolygon"}]
        flat: list[Polygon] = []
        for geom in polygons:
            if geom.geom_type == "Polygon":
                flat.append(geom)
            else:
                flat.extend(geom.geoms)
        polygons = flat
    else:
        raise ValueError(f"Unsupported geometry type: {geometry.geom_type}")

    if not polygons:
        raise ValueError("No polygon parts found in geometry")

    coordinates: list[list[list[list[float]]]] = []
    for polygon in polygons:
        if polygon.is_empty:
            continue

        exterior = [[float(x), float(y)] for x, y in polygon.exterior.coords]
        holes = [[[float(x), float(y)] for x, y in interior.coords] for interior in polygon.interiors]
        coordinates.append([exterior, *holes])

    if not coordinates:
        raise ValueError("Geometry has no polygon coordinates")

    return {
        "type": "MultiPolygon",
        "coordinates": coordinates,
    }


def compute_geometry_hash(name: str, shape_type: str, old_id: int, geometry: dict[str, Any]) -> str:
    payload = {
        "name": name,
        "type": shape_type,
        "old_id": old_id,
        "geometry": geometry,
    }
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def build_definition_index(definition: dict[str, Any] | None, document: dict[str, Any]) -> dict[str, Any]:
    if definition is None:
        faces = []
        for index, face in enumerate(document.get("faces") or [], start=1):
            faces.append(
                {
                    "name": face.get("name", f"Face {index}"),
                    "id": index,
                    "type": "face",
                    "uuid": face.get("id", str(index)),
                }
            )
        return {"id-prefix": 0, "faces": faces, "composites": []}

    return definition


def mesh_faces_by_name(document: dict[str, Any]) -> dict[str, dict[str, Any]]:
    faces: dict[str, dict[str, Any]] = {}
    for face in document.get("faces") or []:
        if face.get("visible") is False:
            continue
        name = (face.get("name") or "").strip()
        if not name:
            raise ValueError("Mesh document contains a face without a name")
        if name in faces:
            raise ValueError(f'Duplicate mesh face name: "{name}"')
        faces[name] = face
    return faces


def resolve_old_id(id_prefix: int, entry_id: Any, label: str) -> int:
    if not isinstance(entry_id, int):
        raise ValueError(f"{label}: id must be an integer")
    return int(id_prefix) + entry_id


def build_shape_records(
    mesh: dict[str, Any],
    *,
    face_type: str,
    composite_type: str | None,
    include_faces: bool,
    include_composites: bool,
) -> tuple[list[ShapeRecord], list[str]]:
    document = mesh["document"]
    definition = build_definition_index(mesh["definition"], document)
    id_prefix = definition.get("id-prefix", 0)
    if not isinstance(id_prefix, int):
        raise ValueError("Definition id-prefix must be an integer")

    faces_by_name = mesh_faces_by_name(document)
    records: list[ShapeRecord] = []
    warnings: list[str] = []
    polygon_cache: dict[str, Polygon] = {}

    def polygon_for_face_name(face_name: str) -> Polygon:
        if face_name not in polygon_cache:
            mesh_face = faces_by_name.get(face_name)
            if mesh_face is None:
                raise ValueError(f'Unknown mesh face referenced: "{face_name}"')
            polygon_cache[face_name] = build_face_polygon(document, mesh_face)
        return polygon_cache[face_name]

    if include_faces:
        for entry in definition.get("faces") or []:
            name = (entry.get("name") or "").strip()
            if not name:
                raise ValueError("Definition contains a face without a name")
            old_id = resolve_old_id(id_prefix, entry.get("id"), f'Face "{name}"')
            shape_type = normalize_definition_type(entry.get("type"), face_type)
            geometry = geometry_to_multipolygon(polygon_for_face_name(name))
            records.append(
                ShapeRecord(
                    kind="face",
                    name=name,
                    old_id=old_id,
                    shape_type=shape_type,
                    geometry=geometry,
                )
            )

    if include_composites:
        for entry in definition.get("composites") or []:
            name = (entry.get("name") or "").strip()
            if not name:
                raise ValueError("Definition contains a composite without a name")

            member_names = [str(face_name).strip() for face_name in entry.get("faces") or []]
            valid_member_names = [face_name for face_name in member_names if face_name in faces_by_name]
            skipped = [face_name for face_name in member_names if face_name not in faces_by_name]
            if skipped:
                warnings.append(
                    f'Composite "{name}" skipped unknown face(s): {", ".join(skipped)}'
                )
            if not valid_member_names:
                raise ValueError(f'Composite "{name}" has no member faces that exist in the mesh')

            old_id = resolve_old_id(id_prefix, entry.get("id"), f'Composite "{name}"')
            shape_type = normalize_definition_type(
                entry.get("type"),
                composite_type or face_type,
            )
            member_polygons = [polygon_for_face_name(face_name) for face_name in valid_member_names]
            merged = dissolve_polygons(member_polygons)
            geometry = geometry_to_multipolygon(merged)
            records.append(
                ShapeRecord(
                    kind="composite",
                    name=name,
                    old_id=old_id,
                    shape_type=shape_type,
                    geometry=geometry,
                )
            )

    return records, warnings


def unique_basename(shape_type: str, name: str, old_id: int, used: set[str]) -> str:
    base = f"{shape_type}.{slugify(name)}"
    if base not in used:
        used.add(base)
        return base

    disambiguated = f"{base}-{old_id}"
    if disambiguated in used:
        raise ValueError(f'Filename collision for shape "{name}" ({old_id})')
    used.add(disambiguated)
    return disambiguated


def shape_record_to_payload(record: ShapeRecord) -> dict[str, Any]:
    shape_hash = compute_geometry_hash(record.name, record.shape_type, record.old_id, record.geometry)
    feature = {
        "type": "Feature",
        "geometry": record.geometry,
        "properties": {
            "mesh_kind": record.kind,
            "mesh_old_id": record.old_id,
        },
    }
    return {
        "metadata": {
            "id": None,
            "old_id": record.old_id,
            "type": record.shape_type,
            "name": record.name,
            "hash": shape_hash,
        },
        "feature": feature,
    }


def write_shape_package(output_dir: Path, basename: str, payload: dict[str, Any]) -> tuple[Path, Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)

    gz_path = output_dir / f"{basename}.geojson.gz"
    geojson_path = output_dir / f"{basename}.geojson"
    json_path = output_dir / f"{basename}.json"

    encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    with gzip.open(gz_path, "wb") as handle:
        handle.write(encoded)

    geojson_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    json_path.write_text(
        json.dumps(build_geojson(payload["feature"]), ensure_ascii=False),
        encoding="utf-8",
    )
    return gz_path, geojson_path, json_path


def main() -> None:
    args = parse_args()

    if args.faces_only and args.composites_only:
        raise SystemExit("Use only one of --faces-only or --composites-only")

    if not args.mesh_file.is_file():
        raise SystemExit(f"Mesh file not found: {args.mesh_file}")

    mesh = load_mesh_file(args.mesh_file)
    records, warnings = build_shape_records(
        mesh,
        face_type=args.face_type,
        composite_type=args.composite_type,
        include_faces=not args.composites_only,
        include_composites=not args.faces_only,
    )

    for warning in warnings:
        print(f"Warning: {warning}", file=sys.stderr)

    if not records:
        raise SystemExit("No shapes were generated")

    face_count = sum(1 for record in records if record.kind == "face")
    composite_count = sum(1 for record in records if record.kind == "composite")
    print(
        f"Prepared {len(records)} shapes from {args.mesh_file} "
        f"({face_count} faces, {composite_count} composites)"
    )

    if args.dry_run:
        for record in records[:5]:
            print(
                f"  {record.kind:9} old_id={record.old_id} type={record.shape_type} name={record.name}"
            )
        if len(records) > 5:
            print(f"  ... and {len(records) - 5} more")
        return

    used_basenames: set[str] = set()
    for record in records:
        basename = unique_basename(record.shape_type, record.name, record.old_id, used_basenames)
        payload = shape_record_to_payload(record)
        gz_path, geojson_path, json_path = write_shape_package(args.output_dir, basename, payload)
        print(f"Wrote {record.name} ({record.kind}):")
        print(f"  {gz_path}")
        print(f"  {geojson_path}")
        print(f"  {json_path}")


if __name__ == "__main__":
    try:
        main()
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
