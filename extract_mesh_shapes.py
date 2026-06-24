#!/usr/bin/env python3
"""Extract individual geoshape packages from HomeQ mesh files.

Iterates mesh files in data/meshes/. Each definition face becomes one polygon
shape; each composite becomes the dissolved union of its member faces. Final
shape ids are id-prefix + face/composite id; old_id is always null.

Output layout matches other individual shape packages:
  data/individual/<type>/<type>.<id>.geojson.gz
  data/individual/<type>/<type>.<id>.geojson
  data/individual/<type>/<type>.<id>.json

Usage:
    python extract_mesh_shapes.py
    python extract_mesh_shapes.py --meshes-dir data/meshes
    python extract_mesh_shapes.py data/meshes/stockholm-municipality.mesh.json
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

MESHES_DIR = Path("data/meshes")
OUTPUT_DIR = Path("data/individual")
MESH_FILE_TYPE = "homeq-mesh"
COORDINATE_PRECISION = 6


@dataclass(frozen=True)
class ShapeRecord:
    kind: str
    name: str
    shape_id: int
    shape_type: str
    geometry: dict[str, Any]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "mesh_files",
        nargs="*",
        type=Path,
        help="Optional mesh files to process (default: all *.mesh.json in --meshes-dir)",
    )
    parser.add_argument(
        "--meshes-dir",
        type=Path,
        default=MESHES_DIR,
        help=f"Directory containing mesh files (default: {MESHES_DIR})",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=OUTPUT_DIR,
        help=f"Root directory for individual shape packages (default: {OUTPUT_DIR})",
    )
    parser.add_argument("--dry-run", action="store_true", help="Validate and print summary without writing files")
    return parser.parse_args()


def load_mesh_file(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON ({exc})") from exc

    if not isinstance(payload, dict):
        raise ValueError("expected a JSON object")

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
        raise ValueError("file does not contain a mesh document")

    if not isinstance(document, dict):
        raise ValueError("mesh document is missing or invalid")

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


def walk_coordinates(node: Any, points: list[tuple[float, float]]) -> None:
    if isinstance(node, (list, tuple)):
        if (
            len(node) >= 2
            and isinstance(node[0], (int, float))
            and isinstance(node[1], (int, float))
            and not isinstance(node[0], bool)
        ):
            points.append((float(node[0]), float(node[1])))
            return
        for child in node:
            walk_coordinates(child, points)


def geometry_bounds(geometry: dict[str, Any]) -> dict[str, float]:
    points: list[tuple[float, float]] = []
    walk_coordinates(geometry.get("coordinates"), points)
    if not points:
        raise ValueError(f"geometry has no coordinates: {geometry.get('type')}")

    lons = [lon for lon, _lat in points]
    lats = [lat for _lon, lat in points]
    return {
        "min_latitude": round(min(lats), 6),
        "max_latitude": round(max(lats), 6),
        "min_longitude": round(min(lons), 6),
        "max_longitude": round(max(lons), 6),
    }


def compute_geometry_hash(
    name: str,
    shape_type: str,
    shape_id: int,
    geometry: dict[str, Any],
) -> str:
    payload = {
        "name": name,
        "type": shape_type,
        "id": shape_id,
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


def resolve_shape_id(id_prefix: int, entry_id: Any, label: str) -> int:
    if not isinstance(entry_id, int):
        raise ValueError(f"{label}: id must be an integer")
    return int(id_prefix) + entry_id


def build_shape_records(mesh: dict[str, Any]) -> tuple[list[ShapeRecord], list[str]]:
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

    for entry in definition.get("faces") or []:
        name = (entry.get("name") or "").strip()
        if not name:
            raise ValueError("Definition contains a face without a name")
        shape_id = resolve_shape_id(id_prefix, entry.get("id"), f'Face "{name}"')
        shape_type = str(entry.get("type") or "face")
        geometry = geometry_to_multipolygon(polygon_for_face_name(name))
        records.append(
            ShapeRecord(
                kind="face",
                name=name,
                shape_id=shape_id,
                shape_type=shape_type,
                geometry=geometry,
            )
        )

    for entry in definition.get("composites") or []:
        name = (entry.get("name") or "").strip()
        if not name:
            raise ValueError("Definition contains a composite without a name")

        member_names = [str(face_name).strip() for face_name in entry.get("faces") or []]
        valid_member_names = [face_name for face_name in member_names if face_name in faces_by_name]
        skipped = [face_name for face_name in member_names if face_name not in faces_by_name]
        if skipped:
            warnings.append(f'Composite "{name}" skipped unknown face(s): {", ".join(skipped)}')
        if not valid_member_names:
            raise ValueError(f'Composite "{name}" has no member faces that exist in the mesh')

        shape_id = resolve_shape_id(id_prefix, entry.get("id"), f'Composite "{name}"')
        shape_type = str(entry.get("type") or "composite")
        member_polygons = [polygon_for_face_name(face_name) for face_name in valid_member_names]
        merged = dissolve_polygons(member_polygons)
        geometry = geometry_to_multipolygon(merged)
        records.append(
            ShapeRecord(
                kind="composite",
                name=name,
                shape_id=shape_id,
                shape_type=shape_type,
                geometry=geometry,
            )
        )

    return records, warnings


def shape_basename(shape_type: str, shape_id: int) -> str:
    return f"{shape_type}.{shape_id}"


def build_geojson(feature: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": feature.get("geometry"),
                "properties": feature.get("properties", {}),
            }
        ],
    }


def load_existing_package(output_dir: Path, basename: str) -> dict[str, Any] | None:
    gz_path = output_dir / f"{basename}.geojson.gz"
    if not gz_path.is_file():
        return None
    with gzip.open(gz_path, "rt", encoding="utf-8") as handle:
        return json.load(handle)


def write_shape_package(output_dir: Path, basename: str, payload: dict[str, Any]) -> None:
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


def shape_record_to_payload(
    record: ShapeRecord,
    *,
    existing_package: dict[str, Any] | None,
) -> dict[str, Any]:
    previous = (existing_package or {}).get("metadata") or {}
    shape_hash = previous.get("hash") or compute_geometry_hash(
        record.name,
        record.shape_type,
        record.shape_id,
        record.geometry,
    )
    metadata = {
        "id": record.shape_id,
        "old_id": None,
        "type": record.shape_type,
        "name": record.name,
        "hash": shape_hash,
        **geometry_bounds(record.geometry),
    }
    feature = {
        "type": "Feature",
        "geometry": record.geometry,
        "properties": {},
    }
    return {
        "metadata": metadata,
        "feature": feature,
    }


def resolve_mesh_files(args: argparse.Namespace) -> list[Path]:
    if args.mesh_files:
        return args.mesh_files

    if not args.meshes_dir.is_dir():
        raise SystemExit(f"Meshes directory not found: {args.meshes_dir}")

    mesh_files = sorted(args.meshes_dir.glob("*.mesh.json"))
    if not mesh_files:
        raise SystemExit(f"No *.mesh.json files found in {args.meshes_dir}")
    return mesh_files


def process_mesh_file(mesh_path: Path, output_root: Path, *, dry_run: bool) -> tuple[int, int]:
    mesh = load_mesh_file(mesh_path)
    records, warnings = build_shape_records(mesh)

    for warning in warnings:
        print(f"Warning ({mesh_path.name}): {warning}", file=sys.stderr)

    if not records:
        raise ValueError("no shapes were generated")

    face_count = sum(1 for record in records if record.kind == "face")
    composite_count = sum(1 for record in records if record.kind == "composite")
    print(
        f"{mesh_path.name}: {len(records)} shapes "
        f"({face_count} faces, {composite_count} composites)"
    )

    if dry_run:
        for record in records[:5]:
            print(
                f"  {record.kind:9} id={record.shape_id} type={record.shape_type} name={record.name}"
            )
        if len(records) > 5:
            print(f"  ... and {len(records) - 5} more")
        return len(records), 0

    new_count = 0
    for record in records:
        out_dir = output_root / record.shape_type
        basename = shape_basename(record.shape_type, record.shape_id)
        existing_package = load_existing_package(out_dir, basename)
        if existing_package is None:
            new_count += 1
            print(f"New shape: {record.shape_type}/{basename}.geojson.gz")

        payload = shape_record_to_payload(record, existing_package=existing_package)
        write_shape_package(out_dir, basename, payload)

    return len(records), new_count


def main() -> None:
    args = parse_args()
    mesh_files = resolve_mesh_files(args)

    total = 0
    total_new = 0
    for mesh_path in mesh_files:
        if not mesh_path.is_file():
            raise SystemExit(f"Mesh file not found: {mesh_path}")

        try:
            count, new_count = process_mesh_file(mesh_path, args.output_dir, dry_run=args.dry_run)
        except ValueError as exc:
            raise SystemExit(f"{mesh_path}: {exc}") from exc

        total += count
        total_new += new_count

    print(f"Processed {len(mesh_files)} mesh file(s), {total} shapes ({total_new} new)")


if __name__ == "__main__":
    main()
