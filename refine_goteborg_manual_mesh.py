#!/usr/bin/env python3
"""Refine goteborg.manual.mesh.json against primaromraden.geojson.

Works face-by-face: for each target face, iterate until error stops improving.
Each iteration greedily applies subdivisions, orthogonal moves, direct moves,
and joint pair transforms (scale + rotation around the pair midpoint) until no
operation can reduce error further. Locked faces are skipped.

Usage:
    python refine_goteborg_manual_mesh.py --report-only
    python refine_goteborg_manual_mesh.py --face Billdal
    python refine_goteborg_manual_mesh.py --all-faces
    python refine_goteborg_manual_mesh.py --all-faces --exclude-face "Västra Bergsjön" --exclude-face Billdal
    python refine_goteborg_manual_mesh.py --face "Västra Bergsjön" --face-passes 4
    python refine_goteborg_manual_mesh.py --output data/meshes/goteborg.refined.mesh.json
"""

from __future__ import annotations

import argparse
import copy
import json
import math
import sys
import time
import uuid
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Union

from shapely import make_valid
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, shape
from shapely.ops import nearest_points, unary_union
from shapely.prepared import prep

from extract_mesh_shapes import build_face_polygon, load_mesh_file, round_position

TargetGeometry = Union[Polygon, MultiPolygon]

DEFAULT_MESH = Path("data/meshes/goteborg.manual.mesh.json")
DEFAULT_PRIM = Path("gothenburg/geojson/primaromraden.geojson")
DEFAULT_OUTPUT = Path("data/meshes/goteborg.refined.mesh.json")
DEFAULT_REPORT = Path("data/meshes/goteborg.refined.report.json")

NAME_ALIASES: dict[str, str] = {
    "Agnesberge": "Agnesberg",
    "Härlandea": "Härlanda",
    "Källtorp": "Kålltorp",
}

COORD_PRECISION = 6
SHARP_CORNER_DEG = 45.0
MIN_EDGE_LENGTH_DEG = 0.00025
MIDPOINT_ERROR_THRESHOLD_DEG = 0.00008
SNAP_CORNER_DISTANCE_DEG = 0.00035
MOVE_STEP_FRACTIONS = (1.0, 0.25)
MOVE_REFINE_FRACTIONS = (0.5, 0.75)
ORBIT_ANGLES_DEG = (-4.0, -1.0, 1.0, 4.0)
ORBIT_REFINE_ANGLES_DEG = (-2.0, 2.0)
SCALE_FACTORS = (0.92, 0.96, 1.04, 1.08)
SCALE_REFINE_FACTORS = (0.98, 1.02)
PAIR_ANGLES_DEG = (0.0, *ORBIT_ANGLES_DEG, *ORBIT_REFINE_ANGLES_DEG)
PAIR_SCALE_FACTORS = (1.0, *SCALE_FACTORS, *SCALE_REFINE_FACTORS)
MIN_RELATIVE_IMPROVEMENT = 1e-6
NEARBY_CORNER_LIMIT = 5
DEFAULT_STOP_IOU = 0.99
DEFAULT_MAX_SUBDIVISIONS = 6
DEFAULT_MAX_MOVES = 5
DEFAULT_MAX_PAIR_OPS = 4
TOP_EDGES_PER_SUBDIVISION = 5
TOP_PAIRS_PER_TRANSFORM = 5
TOP_VERTICES_PER_MOVE = 5
INSERTED_VERTEX_OPT_ROUNDS = 1


def log(message: str) -> None:
    print(message, flush=True)


@dataclass(frozen=True)
class FaceError:
    name: str
    iou: float
    missed: float
    excess: float
    symmetric: float
    imbalance: float
    mesh_area: float
    target_area: float

    def as_dict(self) -> dict[str, float | str]:
        return {
            "name": self.name,
            "iou": round(self.iou, 6),
            "missed_area": round(self.missed, 12),
            "excess_area": round(self.excess, 12),
            "symmetric_area": round(self.symmetric, 12),
            "imbalance": round(self.imbalance, 6),
            "mesh_area": round(self.mesh_area, 12),
            "target_area": round(self.target_area, 12),
        }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mesh", type=Path, default=DEFAULT_MESH, help="Input manual mesh JSON")
    parser.add_argument("--prim", type=Path, default=DEFAULT_PRIM, help="Target primärområde GeoJSON")
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Refined mesh output path (ignored with --report-only)",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=DEFAULT_REPORT,
        help="JSON report path for per-face errors and refinement stats",
    )
    parser.add_argument(
        "--face",
        action="append",
        default=[],
        metavar="NAME",
        help="Refine this face (repeatable). Required unless --all-faces is set.",
    )
    parser.add_argument(
        "--all-faces",
        action="store_true",
        help="Refine all faces, worst error first (use --limit-faces to cap)",
    )
    parser.add_argument(
        "--exclude-face",
        action="append",
        default=[],
        metavar="NAME",
        help="With --all-faces, skip these faces (repeatable)",
    )
    parser.add_argument(
        "--limit-faces",
        type=int,
        default=0,
        help="With --all-faces, refine at most this many faces (0 = all, default: 0)",
    )
    parser.add_argument("--report-only", action="store_true", help="Compute errors without refining")
    parser.add_argument(
        "--face-passes",
        type=int,
        default=0,
        help="Max refinement iterations per face (0 = until converged, default: 0)",
    )
    parser.add_argument(
        "--max-subdivisions",
        type=int,
        default=DEFAULT_MAX_SUBDIVISIONS,
        help=f"Max subdivisions per iteration (0 = unlimited, default: {DEFAULT_MAX_SUBDIVISIONS})",
    )
    parser.add_argument(
        "--max-moves-per-face",
        type=int,
        default=DEFAULT_MAX_MOVES,
        help=f"Max vertex moves per iteration (0 = unlimited, default: {DEFAULT_MAX_MOVES})",
    )
    parser.add_argument(
        "--max-pair-ops",
        type=int,
        default=DEFAULT_MAX_PAIR_OPS,
        help=f"Max pair transform ops per iteration (0 = unlimited, default: {DEFAULT_MAX_PAIR_OPS})",
    )
    parser.add_argument(
        "--stop-iou",
        type=float,
        default=DEFAULT_STOP_IOU,
        help=f"Stop refining a face once IoU reaches this value (default: {DEFAULT_STOP_IOU})",
    )
    parser.add_argument(
        "--early-stop",
        action="store_true",
        help="Deprecated alias: stop when an iteration makes no improvement (now default)",
    )
    return parser.parse_args()


def canonical_face_name(name: str) -> str:
    return NAME_ALIASES.get(name, name)


def resolve_face_name(name: str) -> str:
    if name in NAME_ALIASES.values() or name in NAME_ALIASES:
        return canonical_face_name(name)
    return name


def build_excluded_face_names(excluded: list[str]) -> set[str]:
    names: set[str] = set()
    for raw_name in excluded:
        names.add(raw_name)
        names.add(canonical_face_name(raw_name))
        names.add(resolve_face_name(raw_name))
    return names


def is_excluded_face(face: dict[str, Any], excluded_names: set[str]) -> bool:
    mesh_name = str(face.get("name") or "")
    return mesh_name in excluded_names or canonical_face_name(mesh_name) in excluded_names


def load_prim_targets(path: Path) -> dict[str, TargetGeometry]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    targets: dict[str, TargetGeometry] = {}

    for feature in payload.get("features") or []:
        if not isinstance(feature, dict):
            continue
        props = feature.get("properties") or {}
        name = props.get("PRIMÄRNAMN") or props.get("NAMN")
        if not name:
            continue
        geometry = make_valid(shape(feature["geometry"]))
        if geometry.is_empty or geometry.geom_type not in {"Polygon", "MultiPolygon"}:
            continue
        targets[str(name)] = geometry

    return targets


def iter_face_edges(vertex_ids: list[str]) -> Iterable[tuple[str, str]]:
    count = len(vertex_ids)
    for index in range(count):
        yield vertex_ids[index], vertex_ids[(index + 1) % count]


def build_edge_use(faces: list[dict[str, Any]]) -> Counter[tuple[str, str]]:
    edge_use: Counter[tuple[str, str]] = Counter()
    for face in faces:
        for edge in iter_face_edges(face.get("vertexIds") or []):
            edge_use[tuple(sorted(edge))] += 1
    return edge_use


def is_mesh_face_locked(face: dict[str, Any]) -> bool:
    return face.get("locked") is True


def filter_refinable_faces(faces: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    refinable: list[dict[str, Any]] = []
    skipped: list[str] = []
    for face in faces:
        name = str(face.get("name") or "")
        if is_mesh_face_locked(face):
            skipped.append(name)
            continue
        refinable.append(face)
    return refinable, skipped


def boundary_vertex_ids(faces: list[dict[str, Any]]) -> set[str]:
    edge_use = build_edge_use(faces)
    locked: set[str] = set()
    for (start, end), use_count in edge_use.items():
        if use_count == 1:
            locked.add(start)
            locked.add(end)
    return locked


def build_reference_region(document: dict[str, Any]) -> Polygon:
    polygons = [build_face_polygon(document, face) for face in document.get("faces") or []]
    region = make_valid(unary_union(polygons))
    if region.geom_type == "MultiPolygon":
        region = make_valid(unary_union(list(region.geoms)))
    if region.geom_type != "Polygon":
        raise ValueError("Mesh faces did not dissolve to a single reference polygon")
    return region


def clip_target(target: TargetGeometry, reference: Polygon) -> TargetGeometry:
    clipped = make_valid(target.intersection(reference))
    if clipped.is_empty or clipped.geom_type not in {"Polygon", "MultiPolygon"}:
        return target
    return clipped


def compute_face_error(mesh: Polygon, target: TargetGeometry, name: str) -> FaceError:
    mesh = make_valid(mesh)
    target = make_valid(target)
    intersection = mesh.intersection(target)
    missed = target.difference(mesh).area
    excess = mesh.difference(target).area
    union_area = mesh.union(target).area
    symmetric = missed + excess
    iou = intersection.area / union_area if union_area > 0 else 0.0
    imbalance = abs(missed - excess) / union_area if union_area > 0 else 0.0
    return FaceError(
        name=name,
        iou=iou,
        missed=missed,
        excess=excess,
        symmetric=symmetric,
        imbalance=imbalance,
        mesh_area=mesh.area,
        target_area=target.area,
    )


def compute_all_errors(
    document: dict[str, Any],
    targets: dict[str, TargetGeometry],
    reference: Polygon,
) -> list[FaceError]:
    errors: list[FaceError] = []
    for face in document.get("faces") or []:
        name = canonical_face_name(str(face.get("name") or ""))
        target = targets[name]
        mesh = build_face_polygon(document, face)
        errors.append(compute_face_error(mesh, clip_target(target, reference), name))
    return sorted(errors, key=lambda item: item.symmetric, reverse=True)


def total_symmetric_error(errors: Iterable[FaceError]) -> float:
    return sum(error.symmetric for error in errors)


def face_target(
    face: dict[str, Any],
    targets: dict[str, TargetGeometry],
    reference: Polygon,
) -> TargetGeometry:
    name = canonical_face_name(str(face.get("name") or ""))
    return targets[name]


def turning_angle_deg(
    previous: tuple[float, float],
    current: tuple[float, float],
    nxt: tuple[float, float],
) -> float:
    v1 = (previous[0] - current[0], previous[1] - current[1])
    v2 = (nxt[0] - current[0], nxt[1] - current[1])
    len1 = math.hypot(*v1)
    len2 = math.hypot(*v2)
    if len1 == 0 or len2 == 0:
        return 0.0
    dot = v1[0] * v2[0] + v1[1] * v2[1]
    cos_angle = max(-1.0, min(1.0, dot / (len1 * len2)))
    return math.degrees(math.acos(cos_angle))


def iter_target_polygons(geometry: TargetGeometry) -> Iterable[Polygon]:
    if geometry.geom_type == "Polygon":
        yield geometry
        return
    for part in geometry.geoms:
        if part.geom_type == "Polygon" and not part.is_empty:
            yield part


def polygon_corners(geometry: TargetGeometry, min_turn_deg: float = SHARP_CORNER_DEG) -> list[tuple[float, float]]:
    corners: list[tuple[float, float]] = []
    for polygon in iter_target_polygons(geometry):
        coords = list(polygon.exterior.coords)
        for index in range(1, len(coords) - 1):
            turn = turning_angle_deg(coords[index - 1], coords[index], coords[index + 1])
            if turn >= min_turn_deg:
                corners.append((coords[index][0], coords[index][1]))
    return corners


def target_reference_vertices(geometry: TargetGeometry) -> list[tuple[float, float]]:
    vertices: list[tuple[float, float]] = []
    seen: set[tuple[float, float]] = set()
    for polygon in iter_target_polygons(geometry):
        for lon, lat in polygon.exterior.coords[:-1]:
            rounded = round_position((float(lon), float(lat)))
            if rounded in seen:
                continue
            seen.add(rounded)
            vertices.append(rounded)
    return vertices


def build_raw_face_polygon(document: dict[str, Any], face: dict[str, Any]) -> Polygon:
    ring: list[tuple[float, float]] = []
    for vertex_id in face.get("vertexIds") or []:
        vertex = document["vertices"].get(vertex_id)
        if not vertex:
            raise ValueError(f'Face "{face.get("name")}" references unknown vertex {vertex_id}')
        ring.append(round_position(vertex["position"]))

    if len(ring) < 3:
        raise ValueError(f'Face "{face.get("name")}" has fewer than 3 vertices')

    compact: list[tuple[float, float]] = [ring[0]]
    for position in ring[1:]:
        if position != compact[-1]:
            compact.append(position)
    if len(compact) < 3:
        raise ValueError(f'Face "{face.get("name")}" collapsed to fewer than 3 unique vertices')

    if compact[0] != compact[-1]:
        compact.append(compact[0])

    return Polygon(compact)


def is_simple_face_polygon(polygon: Polygon) -> bool:
    return (
        not polygon.is_empty
        and polygon.geom_type == "Polygon"
        and polygon.is_valid
        and polygon.area > 0
    )


def symmetric_error(mesh: Polygon, ctx: FaceRefineContext) -> float:
    if not is_simple_face_polygon(mesh):
        return float("inf")
    return ctx.target.difference(mesh).area + mesh.difference(ctx.target).area


def polygon_from_ring_coords(coords: list[tuple[float, float]]) -> Polygon:
    ring = list(coords)
    if len(ring) < 3:
        raise ValueError("ring has fewer than 3 vertices")

    compact: list[tuple[float, float]] = [ring[0]]
    for position in ring[1:]:
        if position != compact[-1]:
            compact.append(position)
    if len(compact) < 3:
        raise ValueError("ring collapsed to fewer than 3 unique vertices")

    if compact[0] != compact[-1]:
        compact.append(compact[0])

    return Polygon(compact)


@dataclass
class FaceRefineContext:
    target: TargetGeometry
    target_boundary: Any
    prepared_target: Any
    corners: list[tuple[float, float]]
    reference_vertices: list[tuple[float, float]]

    @classmethod
    def from_target(cls, target: TargetGeometry) -> FaceRefineContext:
        valid_target = make_valid(target)
        return cls(
            target=valid_target,
            target_boundary=valid_target.boundary,
            prepared_target=prep(valid_target),
            corners=polygon_corners(valid_target),
            reference_vertices=target_reference_vertices(valid_target),
        )


@dataclass
class VertexFaceIndex:
    by_vertex: dict[str, list[dict[str, Any]]] = field(default_factory=dict)

    @classmethod
    def build(cls, faces: list[dict[str, Any]]) -> VertexFaceIndex:
        index: dict[str, list[dict[str, Any]]] = {}
        for face in faces:
            for vertex_id in face.get("vertexIds") or []:
                index.setdefault(vertex_id, []).append(face)
        return cls(by_vertex=index)

    def faces_for(self, vertex_ids: set[str]) -> list[dict[str, Any]]:
        matched: dict[int, dict[str, Any]] = {}
        for vertex_id in vertex_ids:
            for face in self.by_vertex.get(vertex_id, []):
                matched[id(face)] = face
        return list(matched.values())


@dataclass
class FaceRingState:
    document: dict[str, Any]
    face: dict[str, Any]
    ring_ids: list[str]
    coords: list[tuple[float, float]]
    index_by_id: dict[str, int]
    _polygon: Polygon | None = None

    @classmethod
    def from_face(cls, document: dict[str, Any], face: dict[str, Any]) -> FaceRingState:
        ring_ids = list(face.get("vertexIds") or [])
        coords = [vertex_position(document, vertex_id) for vertex_id in ring_ids]
        return cls(
            document=document,
            face=face,
            ring_ids=ring_ids,
            coords=coords,
            index_by_id={vertex_id: index for index, vertex_id in enumerate(ring_ids)},
            _polygon=None,
        )

    def polygon(self) -> Polygon:
        if self._polygon is None:
            self._polygon = polygon_from_ring_coords(self.coords)
        return self._polygon

    def score(self, ctx: FaceRefineContext) -> float:
        return symmetric_error(self.polygon(), ctx)

    def set_coord(self, vertex_id: str, position: tuple[float, float]) -> None:
        index = self.index_by_id[vertex_id]
        self.coords[index] = round_position(position)
        self._polygon = None

    def get_coord(self, vertex_id: str) -> tuple[float, float]:
        return self.coords[self.index_by_id[vertex_id]]

    def apply_coords_to_document(self) -> None:
        for vertex_id, position in zip(self.ring_ids, self.coords, strict=True):
            set_vertex_position(self.document, vertex_id, position)

    def refresh_from_document(self) -> None:
        self.ring_ids = list(self.face.get("vertexIds") or [])
        self.coords = [vertex_position(self.document, vertex_id) for vertex_id in self.ring_ids]
        self.index_by_id = {vertex_id: index for index, vertex_id in enumerate(self.ring_ids)}
        self._polygon = None


def face_score(document: dict[str, Any], face: dict[str, Any], ctx: FaceRefineContext) -> float:
    """Overlap error = area outside target + area missing from target."""
    return symmetric_error(build_face_polygon(document, face), ctx)


def nearby_target_corners(
    point: tuple[float, float],
    ctx: FaceRefineContext,
    *,
    limit: int = NEARBY_CORNER_LIMIT,
) -> list[tuple[float, float]]:
    corners = list(ctx.corners)
    corners.sort(key=lambda corner: math.hypot(corner[0] - point[0], corner[1] - point[1]))
    return corners[:limit]


def nearby_reference_vertices(
    point: tuple[float, float],
    ctx: FaceRefineContext,
    *,
    limit: int = NEARBY_CORNER_LIMIT,
) -> list[tuple[float, float]]:
    vertices = list(ctx.reference_vertices)
    vertices.sort(key=lambda vertex: math.hypot(vertex[0] - point[0], vertex[1] - point[1]))
    return vertices[:limit]


def fit_candidates_for_vertex(
    point: tuple[float, float],
    face_polygon: Polygon,
    ctx: FaceRefineContext,
) -> list[tuple[float, float]]:
    point_geom = Point(point)
    candidates: list[tuple[float, float]] = []

    boundary_point = nearest_points(point_geom, ctx.target_boundary)[1]
    candidates.append((boundary_point.x, boundary_point.y))

    interior_point = nearest_points(point_geom, ctx.target)[1]
    candidates.append((interior_point.x, interior_point.y))

    for corner in nearby_target_corners(point, ctx):
        candidates.append(corner)

    for reference_vertex in nearby_reference_vertices(point, ctx):
        candidates.append(reference_vertex)

    excess = make_valid(face_polygon.difference(ctx.target))
    missed = make_valid(ctx.target.difference(face_polygon))
    if not excess.is_empty:
        centroid = excess.centroid
        candidates.append((centroid.x, centroid.y))
    if not missed.is_empty:
        centroid = missed.centroid
        candidates.append((centroid.x, centroid.y))

    unique: list[tuple[float, float]] = []
    seen: set[tuple[float, float]] = set()
    for candidate in candidates:
        rounded = round_position(candidate)
        if rounded in seen:
            continue
        seen.add(rounded)
        unique.append(rounded)
    return unique


def trial_positions(
    original: tuple[float, float],
    destination: tuple[float, float],
) -> list[tuple[float, float]]:
    positions: list[tuple[float, float]] = []
    seen: set[tuple[float, float]] = set()
    for fraction in MOVE_STEP_FRACTIONS:
        position = round_position(
            (
                original[0] + (destination[0] - original[0]) * fraction,
                original[1] + (destination[1] - original[1]) * fraction,
            )
        )
        if position in seen:
            continue
        seen.add(position)
        positions.append(position)
    return positions


def orthogonal_trial_positions(
    original: tuple[float, float],
    destination: tuple[float, float],
) -> list[tuple[float, float]]:
    positions: list[tuple[float, float]] = []
    seen: set[tuple[float, float]] = set()
    for fraction in MOVE_STEP_FRACTIONS:
        lon_only = round_position(
            (
                original[0] + (destination[0] - original[0]) * fraction,
                original[1],
            )
        )
        lat_only = round_position(
            (
                original[0],
                original[1] + (destination[1] - original[1]) * fraction,
            )
        )
        for position in (lon_only, lat_only):
            if position in seen:
                continue
            seen.add(position)
            positions.append(position)
    return positions


def sync_vertex_position(
    ring_state: FaceRingState,
    vertex_id: str,
    position: tuple[float, float],
) -> None:
    if vertex_id in ring_state.index_by_id:
        ring_state.set_coord(vertex_id, position)
    set_vertex_position(ring_state.document, vertex_id, position)


def find_best_vertex_position(
    ring_state: FaceRingState,
    vertex_index: VertexFaceIndex,
    vertex_id: str,
    ctx: FaceRefineContext,
    locked: set[str],
    *,
    orthogonal: bool = False,
) -> tuple[tuple[float, float], float] | None:
    if vertex_id in locked:
        return None

    original = ring_state.get_coord(vertex_id)
    baseline = ring_state.score(ctx)
    face_polygon = ring_state.polygon()
    affected = vertex_index.faces_for({vertex_id})
    best_position = original
    best_error = baseline
    trial_fn = orthogonal_trial_positions if orthogonal else trial_positions

    for destination in fit_candidates_for_vertex(original, face_polygon, ctx)[:8]:
        for candidate in trial_fn(original, destination):
            sync_vertex_position(ring_state, vertex_id, candidate)
            try:
                validate_change(ring_state.document, affected, {vertex_id}, locked)
            except ValueError:
                sync_vertex_position(ring_state, vertex_id, original)
                continue

            error = ring_state.score(ctx)
            if error + 1e-15 < best_error:
                best_error = error
                best_position = candidate

            sync_vertex_position(ring_state, vertex_id, original)

    if best_position == original or best_error + 1e-15 >= baseline:
        return None
    return best_position, best_error


def apply_vertex_position(
    ring_state: FaceRingState,
    vertex_index: VertexFaceIndex,
    vertex_id: str,
    position: tuple[float, float],
    locked: set[str],
) -> None:
    original = ring_state.get_coord(vertex_id) if vertex_id in ring_state.index_by_id else vertex_position(ring_state.document, vertex_id)
    affected = vertex_index.faces_for({vertex_id})
    sync_vertex_position(ring_state, vertex_id, position)
    try:
        validate_change(ring_state.document, affected, {vertex_id}, locked)
    except ValueError:
        sync_vertex_position(ring_state, vertex_id, original)
        raise


def optimize_vertex_for_face(
    ring_state: FaceRingState,
    vertex_index: VertexFaceIndex,
    vertex_id: str,
    ctx: FaceRefineContext,
    locked: set[str],
    *,
    orthogonal: bool = False,
) -> bool:
    result = find_best_vertex_position(
        ring_state,
        vertex_index,
        vertex_id,
        ctx,
        locked,
        orthogonal=orthogonal,
    )
    if result is None:
        return False

    best_position, _best_error = result
    try:
        apply_vertex_position(ring_state, vertex_index, vertex_id, best_position, locked)
    except ValueError:
        return False
    return True


def optimize_inserted_vertex(
    ring_state: FaceRingState,
    vertex_index: VertexFaceIndex,
    vertex_id: str,
    ctx: FaceRefineContext,
    locked: set[str],
) -> bool:
    """Orthogonal and direct moves on a newly inserted vertex (bounded rounds)."""
    improved_any = False
    for _round in range(INSERTED_VERTEX_OPT_ROUNDS):
        improved = False
        if optimize_vertex_for_face(
            ring_state,
            vertex_index,
            vertex_id,
            ctx,
            locked,
            orthogonal=True,
        ):
            improved = True
            improved_any = True
        if optimize_vertex_for_face(ring_state, vertex_index, vertex_id, ctx, locked):
            improved = True
            improved_any = True
        if not improved:
            break
    return improved_any


def sorted_movable_vertices(
    face: dict[str, Any],
    ring_state: FaceRingState,
    locked: set[str],
    ctx: FaceRefineContext,
) -> list[str]:
    movable = face_movable_vertices(face, locked)
    movable.sort(
        key=lambda vertex_id: ctx.target_boundary.distance(Point(ring_state.get_coord(vertex_id))),
        reverse=True,
    )
    return movable


def try_best_vertex_move(
    ring_state: FaceRingState,
    vertex_index: VertexFaceIndex,
    face: dict[str, Any],
    ctx: FaceRefineContext,
    locked: set[str],
    *,
    orthogonal: bool,
) -> bool:
    for vertex_id in sorted_movable_vertices(face, ring_state, locked, ctx)[:TOP_VERTICES_PER_MOVE]:
        result = find_best_vertex_position(
            ring_state,
            vertex_index,
            vertex_id,
            ctx,
            locked,
            orthogonal=orthogonal,
        )
        if result is None:
            continue
        position, _error = result
        try:
            apply_vertex_position(ring_state, vertex_index, vertex_id, position, locked)
        except ValueError:
            continue
        return True
    return False


def greedy_vertex_moves(
    ring_state: FaceRingState,
    vertex_index: VertexFaceIndex,
    face: dict[str, Any],
    ctx: FaceRefineContext,
    locked: set[str],
    *,
    orthogonal: bool,
    safety_limit: int,
) -> int:
    count = 0
    while True:
        if safety_limit > 0 and count >= safety_limit:
            break
        if not try_best_vertex_move(
            ring_state,
            vertex_index,
            face,
            ctx,
            locked,
            orthogonal=orthogonal,
        ):
            break
        count += 1
        log_greedy_step("orthogonal" if orthogonal else "move", count, ring_state, ctx)
    return count


def vertex_position(document: dict[str, Any], vertex_id: str) -> tuple[float, float]:
    lon, lat = document["vertices"][vertex_id]["position"]
    return float(lon), float(lat)


def set_vertex_position(
    document: dict[str, Any],
    vertex_id: str,
    position: tuple[float, float],
) -> None:
    document["vertices"][vertex_id]["position"] = list(round_position(position))


def faces_using_edge(faces: list[dict[str, Any]], edge: tuple[str, str]) -> list[dict[str, Any]]:
    edge_key = tuple(sorted(edge))
    matched: list[dict[str, Any]] = []
    for face in faces:
        for pair in iter_face_edges(face.get("vertexIds") or []):
            if tuple(sorted(pair)) == edge_key:
                matched.append(face)
                break
    return matched


def validate_change(
    document: dict[str, Any],
    affected_faces: list[dict[str, Any]],
    moved_vertex_ids: set[str],
    locked: set[str],
) -> None:
    if moved_vertex_ids.intersection(locked):
        raise ValueError("Attempted to move a boundary vertex during refinement")

    for face in affected_faces:
        polygon = build_raw_face_polygon(document, face)
        if not is_simple_face_polygon(polygon):
            raise ValueError(f'Face "{face.get("name")}" has a twisted or self-intersecting ring')


def list_twisted_faces(document: dict[str, Any]) -> list[str]:
    twisted: list[str] = []
    for face in document.get("faces") or []:
        name = str(face.get("name") or "")
        try:
            polygon = build_raw_face_polygon(document, face)
        except ValueError:
            twisted.append(name)
            continue
        if not is_simple_face_polygon(polygon):
            twisted.append(name)
    return twisted


def face_ring_vertices(face: dict[str, Any]) -> list[str]:
    return list(face.get("vertexIds") or [])


def face_movable_vertices(face: dict[str, Any], locked: set[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for vertex_id in face_ring_vertices(face):
        if vertex_id in locked or vertex_id in seen:
            continue
        seen.add(vertex_id)
        ordered.append(vertex_id)
    return ordered


def face_subdividable_edges(face: dict[str, Any], locked: set[str]) -> list[tuple[str, str]]:
    """Edges that may be split: both endpoints locked (pure perimeter span) is excluded."""
    edges: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for start_id, end_id in iter_face_edges(face_ring_vertices(face)):
        if start_id in locked and end_id in locked:
            continue
        edge_key = tuple(sorted((start_id, end_id)))
        if edge_key in seen:
            continue
        seen.add(edge_key)
        edges.append((start_id, end_id))
    return edges


def face_adjacent_vertex_pairs(face: dict[str, Any], locked: set[str]) -> list[tuple[str, str]]:
    ring = face_ring_vertices(face)
    pairs: list[tuple[str, str]] = []
    for index in range(len(ring)):
        start_id = ring[index]
        end_id = ring[(index + 1) % len(ring)]
        if start_id in locked or end_id in locked:
            continue
        pairs.append((start_id, end_id))
    return pairs


def pair_center(
    first: tuple[float, float],
    second: tuple[float, float],
) -> tuple[float, float]:
    return ((first[0] + second[0]) / 2.0, (first[1] + second[1]) / 2.0)


def transform_point_from_center(
    point: tuple[float, float],
    center: tuple[float, float],
    angle_rad: float,
    scale: float,
) -> tuple[float, float]:
    offset_x = (point[0] - center[0]) * scale
    offset_y = (point[1] - center[1]) * scale
    cos_angle = math.cos(angle_rad)
    sin_angle = math.sin(angle_rad)
    return (
        center[0] + offset_x * cos_angle - offset_y * sin_angle,
        center[1] + offset_x * sin_angle + offset_y * cos_angle,
    )


def pair_transform_candidates() -> list[tuple[float, float]]:
    """Joint (angle_deg, scale) search grid for adjacent vertex pairs."""
    candidates: list[tuple[float, float]] = []
    seen: set[tuple[float, float]] = set()
    for angle_deg in (0.0, *ORBIT_ANGLES_DEG):
        for scale in (1.0, *SCALE_FACTORS):
            if abs(angle_deg) < 1e-12 and abs(scale - 1.0) < 1e-12:
                continue
            key = (angle_deg, scale)
            if key in seen:
                continue
            seen.add(key)
            candidates.append(key)
    return candidates


def iou_target_reached(error: FaceError, stop_iou: float) -> bool:
    return error.iou + 1e-12 >= stop_iou


def find_best_pair_transform_for_pair(
    ring_state: FaceRingState,
    vertex_index: VertexFaceIndex,
    first_id: str,
    second_id: str,
    ctx: FaceRefineContext,
    locked: set[str],
) -> tuple[tuple[float, float], tuple[float, float], float] | None:
    if first_id in locked or second_id in locked:
        return None

    original_first = ring_state.get_coord(first_id)
    original_second = ring_state.get_coord(second_id)
    baseline = ring_state.score(ctx)
    center = pair_center(original_first, original_second)
    affected = vertex_index.faces_for({first_id, second_id})

    best_first = original_first
    best_second = original_second
    best_error = baseline

    for angle_deg, scale in pair_transform_candidates():
        angle_rad = math.radians(angle_deg)
        candidate_first = transform_point_from_center(original_first, center, angle_rad, scale)
        candidate_second = transform_point_from_center(original_second, center, angle_rad, scale)
        sync_vertex_position(ring_state, first_id, candidate_first)
        sync_vertex_position(ring_state, second_id, candidate_second)
        try:
            validate_change(ring_state.document, affected, {first_id, second_id}, locked)
        except ValueError:
            sync_vertex_position(ring_state, first_id, original_first)
            sync_vertex_position(ring_state, second_id, original_second)
            continue

        error = ring_state.score(ctx)
        if error + 1e-15 < best_error:
            best_error = error
            best_first = candidate_first
            best_second = candidate_second

        sync_vertex_position(ring_state, first_id, original_first)
        sync_vertex_position(ring_state, second_id, original_second)

    if best_first == original_first and best_second == original_second:
        return None
    return best_first, best_second, best_error


def apply_pair_positions(
    ring_state: FaceRingState,
    vertex_index: VertexFaceIndex,
    first_id: str,
    second_id: str,
    first_pos: tuple[float, float],
    second_pos: tuple[float, float],
    locked: set[str],
) -> bool:
    original_first = ring_state.get_coord(first_id)
    original_second = ring_state.get_coord(second_id)
    affected = vertex_index.faces_for({first_id, second_id})
    sync_vertex_position(ring_state, first_id, first_pos)
    sync_vertex_position(ring_state, second_id, second_pos)
    try:
        validate_change(ring_state.document, affected, {first_id, second_id}, locked)
    except ValueError:
        sync_vertex_position(ring_state, first_id, original_first)
        sync_vertex_position(ring_state, second_id, original_second)
        return False
    return True


def sorted_adjacent_vertex_pairs(
    face: dict[str, Any],
    ring_state: FaceRingState,
    ctx: FaceRefineContext,
    document: dict[str, Any],
    locked: set[str],
) -> list[tuple[str, str]]:
    face_polygon = ring_state.polygon()
    excess = make_valid(face_polygon.difference(ctx.target))
    missed = make_valid(ctx.target.difference(face_polygon))
    adjacent_pairs = face_adjacent_vertex_pairs(face, locked)
    adjacent_pairs.sort(
        key=lambda pair: edge_overlap_error(
            face_polygon,
            pair,
            ctx,
            document,
            excess=excess,
            missed=missed,
        ),
        reverse=True,
    )
    return adjacent_pairs


def try_best_pair_transform(
    ring_state: FaceRingState,
    vertex_index: VertexFaceIndex,
    face: dict[str, Any],
    ctx: FaceRefineContext,
    document: dict[str, Any],
    locked: set[str],
) -> bool:
    for first_id, second_id in sorted_adjacent_vertex_pairs(face, ring_state, ctx, document, locked)[
        :TOP_PAIRS_PER_TRANSFORM
    ]:
        result = find_best_pair_transform_for_pair(
            ring_state,
            vertex_index,
            first_id,
            second_id,
            ctx,
            locked,
        )
        if result is None:
            continue
        first_pos, second_pos, _error = result
        if apply_pair_positions(
            ring_state,
            vertex_index,
            first_id,
            second_id,
            first_pos,
            second_pos,
            locked,
        ):
            return True
    return False


def greedy_pair_transforms(
    ring_state: FaceRingState,
    vertex_index: VertexFaceIndex,
    face: dict[str, Any],
    ctx: FaceRefineContext,
    document: dict[str, Any],
    locked: set[str],
    *,
    safety_limit: int,
) -> int:
    count = 0
    while True:
        if safety_limit > 0 and count >= safety_limit:
            break
        if not try_best_pair_transform(ring_state, vertex_index, face, ctx, document, locked):
            break
        count += 1
        log_greedy_step("pair", count, ring_state, ctx)
    return count


def try_move_vertex_for_face(
    ring_state: FaceRingState,
    vertex_index: VertexFaceIndex,
    vertex_id: str,
    ctx: FaceRefineContext,
    locked: set[str],
    *,
    orthogonal: bool = False,
) -> bool:
    return optimize_vertex_for_face(
        ring_state,
        vertex_index,
        vertex_id,
        ctx,
        locked,
        orthogonal=orthogonal,
    )


def format_pass_error(error: FaceError) -> str:
    return (
        f"IoU={error.iou:.4f} sym={error.symmetric:.8f} "
        f"missed={error.missed:.8f} excess={error.excess:.8f}"
    )


def insert_vertex_on_shared_edge(
    faces: list[dict[str, Any]],
    start_id: str,
    end_id: str,
    new_vertex_id: str,
) -> None:
    edge_key = tuple(sorted((start_id, end_id)))
    for face in faces:
        vertex_ids = face.get("vertexIds") or []
        for index, (current, nxt) in enumerate(iter_face_edges(vertex_ids)):
            if tuple(sorted((current, nxt))) != edge_key:
                continue
            vertex_ids.insert(index + 1, new_vertex_id)
            break


def edge_overlap_error(
    face_polygon: Polygon,
    edge: tuple[str, str],
    ctx: FaceRefineContext,
    document: dict[str, Any],
    *,
    excess: TargetGeometry | None = None,
    missed: TargetGeometry | None = None,
) -> float:
    start = vertex_position(document, edge[0])
    end = vertex_position(document, edge[1])
    if excess is None:
        excess = make_valid(face_polygon.difference(ctx.target))
    if missed is None:
        missed = make_valid(ctx.target.difference(face_polygon))
    edge_line = LineString([start, end])
    midpoint = edge_line.interpolate(0.5, normalized=True)

    error = ctx.target_boundary.distance(midpoint)
    if not excess.is_empty:
        error += excess.intersection(edge_line.buffer(1e-9)).area * 1_000_000.0
    if not missed.is_empty:
        error += missed.intersection(edge_line.buffer(1e-9)).area * 1_000_000.0
    return error


def try_subdivide_edge_for_face(
    ring_state: FaceRingState,
    all_faces: list[dict[str, Any]],
    vertex_index: VertexFaceIndex,
    edge: tuple[str, str],
    ctx: FaceRefineContext,
    locked: set[str],
) -> str | None:
    start_id, end_id = edge
    if start_id in locked and end_id in locked:
        return None

    start = ring_state.get_coord(start_id)
    end = ring_state.get_coord(end_id)
    if math.hypot(end[0] - start[0], end[1] - start[1]) < MIN_EDGE_LENGTH_DEG:
        return None

    baseline = ring_state.score(ctx)
    midpoint = ((start[0] + end[0]) / 2.0, (start[1] + end[1]) / 2.0)
    new_vertex_id = str(uuid.uuid4())
    affected = faces_using_edge(all_faces, edge)
    backup_rings = {id(ring_face): list(ring_face.get("vertexIds") or []) for ring_face in affected}

    ring_state.document["vertices"][new_vertex_id] = {
        "id": new_vertex_id,
        "position": list(round_position(midpoint)),
    }
    insert_vertex_on_shared_edge(all_faces, start_id, end_id, new_vertex_id)

    try:
        ring_state.refresh_from_document()
        validate_change(ring_state.document, affected, {new_vertex_id}, locked)
        optimize_inserted_vertex(ring_state, vertex_index, new_vertex_id, ctx, locked)
        validate_change(ring_state.document, affected, {new_vertex_id}, locked)
    except ValueError:
        del ring_state.document["vertices"][new_vertex_id]
        for ring_face in affected:
            ring_face["vertexIds"] = backup_rings[id(ring_face)]
        ring_state.refresh_from_document()
        return None

    if ring_state.score(ctx) + 1e-15 >= baseline:
        del ring_state.document["vertices"][new_vertex_id]
        for ring_face in affected:
            ring_face["vertexIds"] = backup_rings[id(ring_face)]
        ring_state.refresh_from_document()
        return None

    for ring_face in affected:
        vertex_index.by_vertex.setdefault(new_vertex_id, []).append(ring_face)
    return new_vertex_id


def try_best_subdivision(
    ring_state: FaceRingState,
    all_faces: list[dict[str, Any]],
    vertex_index: VertexFaceIndex,
    face: dict[str, Any],
    ctx: FaceRefineContext,
    document: dict[str, Any],
    locked: set[str],
) -> bool:
    face_polygon = ring_state.polygon()
    excess = make_valid(face_polygon.difference(ctx.target))
    missed = make_valid(ctx.target.difference(face_polygon))
    edges = sorted(
        face_subdividable_edges(face, locked),
        key=lambda edge: -edge_overlap_error(
            face_polygon,
            edge,
            ctx,
            document,
            excess=excess,
            missed=missed,
        ),
    )
    for edge in edges[:TOP_EDGES_PER_SUBDIVISION]:
        if try_subdivide_edge_for_face(
            ring_state,
            all_faces,
            vertex_index,
            edge,
            ctx,
            locked,
        ):
            return True
    return False


def log_greedy_step(phase: str, count: int, ring_state: FaceRingState, ctx: FaceRefineContext) -> None:
    log(f"      {phase} #{count}: sym={ring_state.score(ctx):.8f}")


def greedy_subdivisions(
    ring_state: FaceRingState,
    all_faces: list[dict[str, Any]],
    vertex_index: VertexFaceIndex,
    face: dict[str, Any],
    ctx: FaceRefineContext,
    document: dict[str, Any],
    locked: set[str],
    *,
    safety_limit: int,
) -> int:
    count = 0
    while True:
        if safety_limit > 0 and count >= safety_limit:
            break
        if not try_best_subdivision(
            ring_state,
            all_faces,
            vertex_index,
            face,
            ctx,
            document,
            locked,
        ):
            break
        count += 1
        log_greedy_step("subdivision", count, ring_state, ctx)
    return count


def refine_single_face(
    document: dict[str, Any],
    all_faces: list[dict[str, Any]],
    vertex_index: VertexFaceIndex,
    face: dict[str, Any],
    ctx: FaceRefineContext,
    locked: set[str],
    *,
    face_passes: int,
    max_subdivisions: int,
    max_moves: int,
    max_pair_ops: int,
    stop_iou: float,
    early_stop: bool,
) -> dict[str, Any]:
    name = str(face.get("name") or "")
    ring_state = FaceRingState.from_face(document, face)
    stats = {
        "name": name,
        "passes_run": 0,
        "vertex_moves": 0,
        "orthogonal_moves": 0,
        "pair_transforms": 0,
        "edge_subdivisions": 0,
        "error_before": compute_face_error(ring_state.polygon(), ctx.target, name).as_dict(),
        "error_after": None,
        "pass_errors": [],
        "stopped_at_iou": False,
    }

    if iou_target_reached(
        compute_face_error(ring_state.polygon(), ctx.target, name),
        stop_iou,
    ):
        log(f"    already at IoU >= {stop_iou:.2f}, skipping")
        stats["stopped_at_iou"] = True
        stats["error_after"] = stats["error_before"]
        return stats

    pass_index = 0
    while True:
        pass_index += 1
        if face_passes > 0 and pass_index > face_passes:
            break

        pass_number = pass_index
        pass_label = f"{pass_number}" if face_passes > 0 else f"{pass_number}+"
        pass_start_error = compute_face_error(ring_state.polygon(), ctx.target, name)
        if iou_target_reached(pass_start_error, stop_iou):
            log(f"    stopping: IoU {pass_start_error.iou:.4f} >= {stop_iou:.2f}")
            stats["stopped_at_iou"] = True
            break

        log(
            f"    iteration {pass_label} start: {format_pass_error(pass_start_error)}"
        )

        pass_stats = {
            "iteration": pass_number,
            "error_before": pass_start_error.as_dict(),
            "subdivisions": 0,
            "orthogonal_moves": 0,
            "vertex_moves": 0,
            "pair_transforms": 0,
        }

        pass_stats["subdivisions"] = greedy_subdivisions(
            ring_state,
            all_faces,
            vertex_index,
            face,
            ctx,
            document,
            locked,
            safety_limit=max_subdivisions,
        )
        stats["edge_subdivisions"] += pass_stats["subdivisions"]

        pass_stats["orthogonal_moves"] = greedy_vertex_moves(
            ring_state,
            vertex_index,
            face,
            ctx,
            locked,
            orthogonal=True,
            safety_limit=max_moves,
        )
        stats["orthogonal_moves"] += pass_stats["orthogonal_moves"]

        pass_stats["vertex_moves"] = greedy_vertex_moves(
            ring_state,
            vertex_index,
            face,
            ctx,
            locked,
            orthogonal=False,
            safety_limit=max_moves,
        )
        stats["vertex_moves"] += pass_stats["vertex_moves"]

        pass_stats["pair_transforms"] = greedy_pair_transforms(
            ring_state,
            vertex_index,
            face,
            ctx,
            document,
            locked,
            safety_limit=max_pair_ops,
        )
        stats["pair_transforms"] += pass_stats["pair_transforms"]

        pass_end_error = compute_face_error(ring_state.polygon(), ctx.target, name)
        pass_stats["error_after"] = pass_end_error.as_dict()
        stats["pass_errors"].append(pass_stats)
        stats["passes_run"] = pass_number

        delta_sym = pass_end_error.symmetric - pass_start_error.symmetric
        changed = (
            pass_stats["subdivisions"]
            + pass_stats["orthogonal_moves"]
            + pass_stats["vertex_moves"]
            + pass_stats["pair_transforms"]
        ) > 0
        log(
            f"    iteration {pass_label} end:   {format_pass_error(pass_end_error)}  "
            f"(Δsym={delta_sym:+.8f}, "
            f"sub={pass_stats['subdivisions']} orth={pass_stats['orthogonal_moves']} "
            f"move={pass_stats['vertex_moves']} pair={pass_stats['pair_transforms']})"
        )

        if iou_target_reached(pass_end_error, stop_iou):
            log(f"    stopping: IoU {pass_end_error.iou:.4f} >= {stop_iou:.2f}")
            stats["stopped_at_iou"] = True
            break

        if delta_sym > 1e-15:
            log("    stopping: error increased this iteration")
            break

        if not changed:
            log("    stopping: no improving operations left")
            break

        if early_stop and pass_start_error.symmetric > 0:
            relative_gain = (pass_start_error.symmetric - pass_end_error.symmetric) / pass_start_error.symmetric
            if relative_gain < MIN_RELATIVE_IMPROVEMENT:
                log(f"    early stop: improvement {relative_gain:.2e} below threshold")
                break

    stats["error_after"] = compute_face_error(ring_state.polygon(), ctx.target, name).as_dict()
    return stats


def find_faces_by_names(faces: list[dict[str, Any]], requested: list[str]) -> list[dict[str, Any]]:
    by_canonical = {canonical_face_name(str(face.get("name") or "")): face for face in faces}
    by_mesh_name = {str(face.get("name") or ""): face for face in faces}

    selected: list[dict[str, Any]] = []
    for raw_name in requested:
        canonical = resolve_face_name(raw_name)
        face = by_mesh_name.get(raw_name) or by_canonical.get(canonical)
        if face is None:
            raise ValueError(f'Unknown face "{raw_name}"')
        selected.append(face)
    return selected


def refine_mesh(
    mesh_payload: dict[str, Any],
    targets: dict[str, TargetGeometry],
    *,
    face_names: list[str],
    all_faces_mode: bool,
    exclude_faces: list[str],
    limit_faces: int,
    face_passes: int,
    max_subdivisions: int,
    max_moves_per_face: int,
    max_pair_ops: int,
    stop_iou: float,
    early_stop: bool,
) -> dict[str, Any]:
    document = mesh_payload["document"]
    faces = document.get("faces") or []
    locked = boundary_vertex_ids(faces)
    vertex_index = VertexFaceIndex.build(faces)
    reference = build_reference_region(document)
    excluded_names = build_excluded_face_names(exclude_faces)

    if face_names:
        work_faces = find_faces_by_names(faces, face_names)
    elif all_faces_mode:
        errors = compute_all_errors(document, targets, reference)
        if excluded_names:
            errors = [error for error in errors if error.name not in excluded_names]
        selected_errors = errors if limit_faces <= 0 else errors[:limit_faces]
        work_faces = []
        for error in selected_errors:
            for face in faces:
                if canonical_face_name(str(face.get("name") or "")) == error.name:
                    work_faces.append(face)
                    break
    else:
        raise ValueError("Specify --face NAME or --all-faces")

    if excluded_names:
        skipped_excluded = [
            str(face.get("name") or "")
            for face in work_faces
            if is_excluded_face(face, excluded_names)
        ]
        work_faces = [face for face in work_faces if not is_excluded_face(face, excluded_names)]
        if skipped_excluded:
            log(f"Skipping excluded face(s): {', '.join(skipped_excluded)}")

    work_faces, skipped_locked = filter_refinable_faces(work_faces)
    if skipped_locked:
        log(f"Skipping locked face(s): {', '.join(skipped_locked)}")

    stats: dict[str, Any] = {
        "faces_refined": len(work_faces),
        "faces_excluded": sorted(exclude_faces),
        "faces_skipped_locked": skipped_locked,
        "initial_symmetric_error": total_symmetric_error(compute_all_errors(document, targets, reference)),
        "per_face": [],
        "vertex_moves": 0,
        "orthogonal_moves": 0,
        "pair_transforms": 0,
        "edge_subdivisions": 0,
        "elapsed_seconds": 0.0,
    }

    started = time.monotonic()
    total = len(work_faces)

    for index, face in enumerate(work_faces, start=1):
        name = str(face.get("name") or "")
        log(f"[{index}/{total}] {name}")
        target = face_target(face, targets, reference)
        ctx = FaceRefineContext.from_target(target)
        face_stats = refine_single_face(
            document,
            faces,
            vertex_index,
            face,
            ctx,
            locked,
            face_passes=face_passes,
            max_subdivisions=max_subdivisions,
            max_moves=max_moves_per_face,
            max_pair_ops=max_pair_ops,
            stop_iou=stop_iou,
            early_stop=early_stop,
        )
        stats["per_face"].append(face_stats)
        stats["vertex_moves"] += face_stats["vertex_moves"]
        stats["orthogonal_moves"] += face_stats["orthogonal_moves"]
        stats["pair_transforms"] += face_stats["pair_transforms"]
        stats["edge_subdivisions"] += face_stats["edge_subdivisions"]

        before = face_stats["error_before"]
        after = face_stats["error_after"]
        log(
            f"  done: IoU {before['iou']:.4f}->{after['iou']:.4f}  "
            f"sym {before['symmetric_area']:.8f}->{after['symmetric_area']:.8f}  "
            f"iterations={face_stats['passes_run']}  "
            f"sub={face_stats['edge_subdivisions']} orth={face_stats['orthogonal_moves']} "
            f"move={face_stats['vertex_moves']} pair={face_stats['pair_transforms']}"
        )

    stats["elapsed_seconds"] = round(time.monotonic() - started, 2)

    final_errors = compute_all_errors(document, targets, reference)
    stats["final_symmetric_error"] = total_symmetric_error(final_errors)
    stats["mean_iou"] = sum(error.iou for error in final_errors) / len(final_errors)
    return stats


def summarize_errors(errors: list[FaceError], label: str) -> None:
    mean_iou = sum(error.iou for error in errors) / len(errors)
    total_symmetric = total_symmetric_error(errors)
    print(f"{label}: {len(errors)} faces, mean IoU {mean_iou:.4f}, total symmetric {total_symmetric:.8f}")
    print("Worst overlap (by symmetric area):")
    for error in errors[:10]:
        print(
            f"  {error.name:24} IoU={error.iou:.4f} "
            f"missed={error.missed:.8f} excess={error.excess:.8f} imbalance={error.imbalance:.4f}"
        )


def write_report(path: Path, before: list[FaceError], after: list[FaceError], stats: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "before": [error.as_dict() for error in before],
        "after": [error.as_dict() for error in after],
        "stats": stats,
    }
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()

    if not args.mesh.is_file():
        print(f"Mesh file not found: {args.mesh}", file=sys.stderr)
        return 1
    if not args.prim.is_file():
        print(f"Prim GeoJSON not found: {args.prim}", file=sys.stderr)
        return 1

    payload = load_mesh_file(args.mesh)
    document = payload["document"]
    targets = load_prim_targets(args.prim)
    faces = document.get("faces") or []

    mesh_names = {canonical_face_name(str(face.get("name") or "")) for face in faces}
    missing_targets = sorted(mesh_names - set(targets))
    if missing_targets:
        print(f"No primärområde targets for: {', '.join(missing_targets)}", file=sys.stderr)
        return 1

    reference = build_reference_region(document)
    before_errors = compute_all_errors(document, targets, reference)
    summarize_errors(before_errors, "Before")

    stats: dict[str, Any] = {"report_only": args.report_only}
    after_errors = before_errors

    if not args.report_only:
        if not args.face and not args.all_faces:
            print("Refinement requires --face NAME or --all-faces.", file=sys.stderr)
            print("Example: python refine_goteborg_manual_mesh.py --face Billdal", file=sys.stderr)
            return 2

        working = copy.deepcopy(json.loads(args.mesh.read_text(encoding="utf-8")))
        if args.face:
            scope = ", ".join(args.face)
        else:
            scope = "all faces" if args.limit_faces <= 0 else f"worst {args.limit_faces} faces"
            if args.exclude_face:
                scope += f" (excluding {', '.join(args.exclude_face)})"
        log(f"Refining {scope}:")
        stats = refine_mesh(
            working,
            targets,
            face_names=args.face,
            all_faces_mode=args.all_faces,
            exclude_faces=args.exclude_face,
            limit_faces=args.limit_faces,
            face_passes=args.face_passes,
            max_subdivisions=args.max_subdivisions,
            max_moves_per_face=args.max_moves_per_face,
            max_pair_ops=args.max_pair_ops,
            stop_iou=args.stop_iou,
            early_stop=args.early_stop,
        )
        after_errors = compute_all_errors(working["document"], targets, reference)
        summarize_errors(after_errors, "After")
        log(
            f"Total: {stats['edge_subdivisions']} subdivisions, {stats['orthogonal_moves']} orthogonal moves, "
            f"{stats['vertex_moves']} direct moves, {stats['pair_transforms']} pair transforms "
            f"across {stats['faces_refined']} face(s) in {stats['elapsed_seconds']}s"
        )

        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(working, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Wrote refined mesh to {args.output}")

        twisted = list_twisted_faces(working["document"])
        if twisted:
            print(
                f"WARNING: {len(twisted)} face(s) still have twisted rings: {', '.join(twisted)}",
                file=sys.stderr,
            )
        else:
            log("All face rings are simple (no self-intersections).")

    write_report(args.report, before_errors, after_errors, stats)
    print(f"Wrote report to {args.report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
