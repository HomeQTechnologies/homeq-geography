#!/usr/bin/env python3
"""Clip a mesh to the perimeter geoshape defined by a reference boundary mesh.

The reference mesh must contain a single face whose vertex ring defines the
clip boundary. The source mesh is rebuilt with conforming shared-edge topology
by noding source face edges together with the reference perimeter.

Usage:
    python clip_mesh_to_perimeter.py
    python clip_mesh_to_perimeter.py \
        --reference data/meshes/malmo.mesh.json \
        --source data/meshes/malmo.base.mesh.json \
        --output data/meshes/malmo.clipped.mesh.json
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from shapely.geometry import LineString, Polygon, mapping
from shapely.ops import polygonize, unary_union
from shapely.strtree import STRtree

from extract_mesh_shapes import build_face_polygon, load_mesh_file, round_position

DEFAULT_REFERENCE_MESH = Path("data/meshes/malmo.mesh.json")
DEFAULT_SOURCE_MESH = Path("data/meshes/malmo.base.mesh.json")
DEFAULT_OUTPUT = Path("data/meshes/malmo.clipped.mesh.json")
MESH_FILE_TYPE = "homeq-mesh"
MESH_VERSION = 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--reference",
        type=Path,
        default=DEFAULT_REFERENCE_MESH,
        help="Reference mesh JSON with a single perimeter face",
    )
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE_MESH,
        help="Mesh JSON to clip",
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output mesh JSON path")
    parser.add_argument(
        "--reference-geojson",
        type=Path,
        help="Optional path to write the reference perimeter as GeoJSON",
    )
    return parser.parse_args()


def iter_ring_segments(ring: Any) -> Iterable[LineString]:
    coordinates = list(ring.coords)
    for index in range(len(coordinates) - 1):
        yield LineString([coordinates[index], coordinates[index + 1]])


def reference_polygon_from_mesh(mesh: dict[str, Any]) -> Polygon:
    document = mesh["document"]
    faces = document.get("faces") or []
    if len(faces) != 1:
        raise ValueError("reference mesh must contain exactly one perimeter face")

    return build_face_polygon(document, faces[0])


def perimeter_geojson(reference_polygon: Polygon) -> dict[str, Any]:
    return {
        "type": "Feature",
        "properties": {"name": "mesh-perimeter"},
        "geometry": mapping(reference_polygon),
    }


def clean_exterior_coords(polygon: Polygon) -> list[tuple[float, float]]:
    coords = [round_position(position) for position in polygon.exterior.coords[:-1]]

    cleaned: list[tuple[float, float]] = []
    for position in coords:
        if cleaned and cleaned[-1] == position:
            continue
        cleaned.append(position)

    if len(cleaned) >= 2 and cleaned[0] == cleaned[-1]:
        cleaned.pop()

    if len(cleaned) < 3:
        raise ValueError("polygon exterior has fewer than 3 unique vertices")

    return cleaned


def collect_source_lines(document: dict[str, Any]) -> list[LineString]:
    vertices = document["vertices"]
    lines: list[LineString] = []

    for face in document.get("faces") or []:
        vertex_ids = face.get("vertexIds") or []
        count = len(vertex_ids)
        for index in range(count):
            start = round_position(vertices[vertex_ids[index]]["position"])
            end = round_position(vertices[vertex_ids[(index + 1) % count]]["position"])
            if start == end:
                continue
            lines.append(LineString([start, end]))

    return lines


def label_polygon_cells(
    cells: list[Polygon],
    face_polygons: list[tuple[str, Polygon]],
    reference_polygon: Polygon,
) -> dict[str, list[Polygon]]:
    geometries = [polygon for _, polygon in face_polygons]
    tree = STRtree(geometries)
    cells_by_name: dict[str, list[Polygon]] = defaultdict(list)

    for cell in cells:
        if not reference_polygon.contains(cell.representative_point()):
            continue

        point = cell.representative_point()
        for index in tree.query(point):
            name, polygon = face_polygons[index]
            if polygon.contains(point):
                cells_by_name[name].append(cell)
                break

    return cells_by_name


def rebuild_document(
    source_document: dict[str, Any],
    cells_by_name: dict[str, list[Polygon]],
) -> dict[str, Any]:
    vertices: dict[str, dict[str, Any]] = {}
    position_index: dict[tuple[float, float], str] = {}
    faces: list[dict[str, Any]] = []

    def vertex_id_for_position(position: tuple[float, float]) -> str:
        if position in position_index:
            return position_index[position]

        vertex_id = str(uuid.uuid4())
        vertices[vertex_id] = {
            "id": vertex_id,
            "position": [position[0], position[1]],
        }
        position_index[position] = vertex_id
        return vertex_id

    for source_face in source_document.get("faces") or []:
        name = str(source_face.get("name") or "")
        cells = cells_by_name.get(name) or []
        if not cells:
            raise ValueError(f'district "{name}" produced no clipped cells')

        merged = unary_union(cells)
        if merged.geom_type != "Polygon":
            raise ValueError(f'district "{name}" merged to {merged.geom_type}; expected a single polygon')

        faces.append(
            {
                "id": source_face["id"],
                "name": name,
                "vertexIds": [
                    vertex_id_for_position(position)
                    for position in clean_exterior_coords(merged)
                ],
                "visible": source_face.get("visible", True),
            }
        )

    return {
        "vertices": vertices,
        "faces": faces,
    }


def summarize_topology(document: dict[str, Any], reference_polygon: Polygon) -> dict[str, Any]:
    edge_use: Counter[tuple[str, str]] = Counter()
    for face in document.get("faces") or []:
        vertex_ids = face.get("vertexIds") or []
        count = len(vertex_ids)
        for index in range(count):
            start_id = vertex_ids[index]
            end_id = vertex_ids[(index + 1) % count]
            edge_use[tuple(sorted((start_id, end_id)))] += 1

    max_overshoot = 0.0
    invalid_faces = 0
    for face in document.get("faces") or []:
        polygon = build_face_polygon(document, face)
        if not polygon.is_valid:
            invalid_faces += 1
        max_overshoot = max(max_overshoot, polygon.difference(reference_polygon).area)

    return {
        "faces": len(document.get("faces") or []),
        "vertices": len(document.get("vertices") or {}),
        "shared_edges": sum(1 for count in edge_use.values() if count == 2),
        "boundary_edges": sum(1 for count in edge_use.values() if count == 1),
        "invalid_edges": sum(1 for count in edge_use.values() if count > 2),
        "invalid_faces": invalid_faces,
        "max_overshoot_area": max_overshoot,
    }


def clip_mesh_to_perimeter(
    source_mesh: dict[str, Any],
    reference_polygon: Polygon,
) -> dict[str, Any]:
    source_document = source_mesh["document"]
    lines = collect_source_lines(source_document)
    for segment in iter_ring_segments(reference_polygon.exterior):
        lines.append(segment)

    cells = list(polygonize(unary_union(lines)))
    if not cells:
        raise ValueError("polygonize produced no cells")

    face_polygons = [
        (str(face.get("name") or ""), build_face_polygon(source_document, face))
        for face in source_document.get("faces") or []
    ]
    cells_by_name = label_polygon_cells(cells, face_polygons, reference_polygon)
    document = rebuild_document(source_document, cells_by_name)

    stats = summarize_topology(document, reference_polygon)
    if stats["invalid_edges"]:
        raise ValueError(f"clipped mesh has {stats['invalid_edges']} invalid edges")
    if stats["invalid_faces"]:
        raise ValueError(f"clipped mesh has {stats['invalid_faces']} invalid faces")

    return {
        "type": MESH_FILE_TYPE,
        "version": MESH_VERSION,
        "exportedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "definition": copy.deepcopy(source_mesh.get("definition")),
        "document": document,
    }


def main() -> int:
    args = parse_args()

    reference_mesh = load_mesh_file(args.reference)
    source_mesh = load_mesh_file(args.source)
    reference_polygon = reference_polygon_from_mesh(reference_mesh)

    if args.reference_geojson:
        args.reference_geojson.parent.mkdir(parents=True, exist_ok=True)
        args.reference_geojson.write_text(
            json.dumps(perimeter_geojson(reference_polygon), indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    mesh_file = clip_mesh_to_perimeter(source_mesh, reference_polygon)
    stats = summarize_topology(mesh_file["document"], reference_polygon)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(mesh_file, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Wrote {args.output}")
    print(
        "Summary: "
        f"{stats['faces']} faces, "
        f"{stats['vertices']} vertices, "
        f"{stats['shared_edges']} shared edges, "
        f"{stats['boundary_edges']} boundary edges, "
        f"max overshoot area {stats['max_overshoot_area']:.2e}"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001 - CLI entrypoint
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
