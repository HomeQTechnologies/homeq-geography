#!/usr/bin/env python3
"""Refine mesh faces by splitting edges into five parts with vertex pruning.

For each splittable edge:
  1. Insert four vertices at 1/5, 2/5, 3/5, 4/5 along the edge.
  2. Move each new vertex perpendicular to the edge (±10°) to reduce symmetric error.
  3. Remove any inserted vertex whose removal does not worsen error.

A split is kept only if this face's symmetric error drops by more than
--min-split-improvement relative to leaving the edge unsplit:
  (sym_before - sym_after) / sym_before
Rejected edges are not split again.
"""

from __future__ import annotations

import argparse
import copy
import json
import math
import sys
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from shapely.errors import GEOSException
from extract_mesh_shapes import round_position
from refine_goteborg_manual_mesh import (
    DEFAULT_MESH,
    DEFAULT_OUTPUT,
    DEFAULT_PRIM,
    DEFAULT_REPORT,
    MIN_EDGE_LENGTH_DEG,
    FaceRefineContext,
    FaceRingState,
    VertexFaceIndex,
    boundary_vertex_ids,
    build_excluded_face_names,
    build_reference_region,
    canonical_face_name,
    compute_all_errors,
    compute_face_error,
    edge_overlap_error,
    face_subdividable_edges,
    faces_using_edge,
    filter_refinable_faces,
    find_faces_by_names,
    insert_vertex_on_shared_edge,
    list_twisted_faces,
    load_mesh_file,
    load_prim_targets,
    log,
    summarize_errors,
    sync_vertex_position,
    validate_change,
    write_report,
)

DEFAULT_MAX_SPLITS_PER_EDGE = 4
DEFAULT_MIN_SPLIT_IMPROVEMENT = 0.02
EDGE_PART_COUNT = 5
SPLIT_FRACTIONS = (0.2, 0.4, 0.6, 0.8)
PROBE_FRACTION = 0.02
INITIAL_LINE_STEP_FRACTION = 0.25
MIN_LINE_STEP_DEG = 1e-9
MAX_LINE_SEARCH_ITERS = 48
ORTHOGONAL_VARIANCE_DEG = 10
ORTHOGONAL_ANGLE_STEP_DEG = 5
MOVE_SCALE_FRACTION = 0.05


def edge_unit_vector(
    start: tuple[float, float],
    end: tuple[float, float],
) -> tuple[float, float]:
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    length = math.hypot(dx, dy)
    if length <= 1e-15:
        return (1.0, 0.0)
    return (dx / length, dy / length)


def edge_normal_unit(
    start: tuple[float, float],
    end: tuple[float, float],
) -> tuple[float, float]:
    """Unit vector perpendicular to the split edge."""
    ux, uy = edge_unit_vector(start, end)
    return (-uy, ux)


def edge_normal_near_unit_directions(
    edge_start: tuple[float, float],
    edge_end: tuple[float, float],
) -> list[tuple[float, float]]:
    """Directions within ±ORTHOGONAL_VARIANCE_DEG of the edge normal."""
    normal = edge_normal_unit(edge_start, edge_end)
    directions: list[tuple[float, float]] = []
    seen: set[tuple[float, float]] = set()
    for offset in range(
        -ORTHOGONAL_VARIANCE_DEG,
        ORTHOGONAL_VARIANCE_DEG + 1,
        ORTHOGONAL_ANGLE_STEP_DEG,
    ):
        unit = rotate_unit_vector(normal, offset)
        key = (round(unit[0], 8), round(unit[1], 8))
        if key in seen:
            continue
        seen.add(key)
        directions.append(unit)
    return directions


def edge_move_scale(
    edge_start: tuple[float, float],
    edge_end: tuple[float, float],
    ring_state: FaceRingState,
) -> float:
    edge_len = math.hypot(edge_end[0] - edge_start[0], edge_end[1] - edge_start[1])
    return max(MIN_EDGE_LENGTH_DEG, min(edge_len * MOVE_SCALE_FRACTION, vertex_move_scale(ring_state)))


@dataclass(frozen=True)
class SplitAttempt:
    mode: str
    baseline: float
    trial: float
    new_vertex_ids: tuple[str, ...]

    @property
    def relative_improvement(self) -> float:
        return relative_symmetric_improvement(self.baseline, self.trial)


@dataclass(frozen=True)
class SplitDecision:
    accepted: SplitAttempt | None
    best_trial: SplitAttempt | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mesh", type=Path, default=DEFAULT_MESH)
    parser.add_argument("--prim", type=Path, default=DEFAULT_PRIM)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--face", action="append", default=[], metavar="NAME")
    parser.add_argument("--all-faces", action="store_true")
    parser.add_argument("--exclude-face", action="append", default=[], metavar="NAME")
    parser.add_argument("--limit-faces", type=int, default=0)
    parser.add_argument("--report-only", action="store_true")
    parser.add_argument(
        "--max-splits-per-edge",
        type=int,
        default=DEFAULT_MAX_SPLITS_PER_EDGE,
        help=f"Max successful five-way splits per edge chain (default: {DEFAULT_MAX_SPLITS_PER_EDGE})",
    )
    parser.add_argument(
        "--max-total-splits",
        type=int,
        default=0,
        help="Max successful splits per face (0 = unlimited, default: 0)",
    )
    parser.add_argument(
        "--min-split-improvement",
        type=float,
        default=DEFAULT_MIN_SPLIT_IMPROVEMENT,
        help=(
            "Minimum relative improvement in this face's symmetric error required "
            "to keep a split: (sym_before - sym_after) / sym_before. "
            f"Default: {DEFAULT_MIN_SPLIT_IMPROVEMENT:.0%} (must beat leaving edge unsplit by >2%)"
        ),
    )
    return parser.parse_args()


def undirected_edge_key(start_id: str, end_id: str) -> tuple[str, str]:
    return tuple(sorted((start_id, end_id)))


def relative_symmetric_improvement(baseline: float, trial: float) -> float:
    """Relative drop in this face's symmetric error from one operation.

    (sym_before - sym_after) / sym_before — e.g. 0.02 means the split reduced
    this face's error by 2% compared to leaving the edge unsplit. Not total
    mesh error and not an absolute area delta.
    """
    if baseline <= 1e-18:
        return 0.0 if trial >= baseline else 1.0
    return max(0.0, (baseline - trial) / baseline)


def relative_improvement(baseline: float, trial: float) -> float:
    return relative_symmetric_improvement(baseline, trial)


def rollback_edge_split(
    ring_state: FaceRingState,
    all_faces: list[dict[str, Any]],
    new_vertex_ids: list[str],
    affected: list[dict[str, Any]],
    backup_rings: dict[int, list[str]],
) -> None:
    for vertex_id in new_vertex_ids:
        if vertex_id in ring_state.document["vertices"]:
            del ring_state.document["vertices"][vertex_id]
    for ring_face in affected:
        ring_face["vertexIds"] = backup_rings[id(ring_face)]
    ring_state.refresh_from_document()


def insert_vertices_on_edge(
    all_faces: list[dict[str, Any]],
    start_id: str,
    end_id: str,
    new_vertex_ids: list[str],
) -> None:
    """Insert vertices in ring order from start toward end."""
    anchor = start_id
    tail = end_id
    for vertex_id in reversed(new_vertex_ids):
        insert_vertex_on_shared_edge(all_faces, anchor, tail, vertex_id)
        tail = vertex_id


def remove_vertex_from_mesh(
    document: dict[str, Any],
    all_faces: list[dict[str, Any]],
    vertex_id: str,
) -> None:
    if vertex_id in document.get("vertices", {}):
        del document["vertices"][vertex_id]
    for face in all_faces:
        vertex_ids = face.get("vertexIds") or []
        if vertex_id in vertex_ids:
            vertex_ids.remove(vertex_id)


def unregister_vertex_index(
    vertex_index: VertexFaceIndex,
    vertex_id: str,
) -> None:
    if vertex_id in vertex_index.by_vertex:
        del vertex_index.by_vertex[vertex_id]


def register_vertex_index(
    vertex_index: VertexFaceIndex,
    vertex_id: str,
    affected: list[dict[str, Any]],
) -> None:
    for ring_face in affected:
        vertex_index.by_vertex.setdefault(vertex_id, []).append(ring_face)


def optimize_split_vertices(
    ring_state: FaceRingState,
    vertex_index: VertexFaceIndex,
    vertex_ids: list[str],
    ctx: FaceRefineContext,
    locked: set[str],
    *,
    edge_start: tuple[float, float],
    edge_end: tuple[float, float],
) -> None:
    for vertex_id in vertex_ids:
        line_search_vertex_after_split(
            ring_state,
            vertex_index,
            vertex_id,
            ctx,
            locked,
            edge_start=edge_start,
            edge_end=edge_end,
        )


def prune_noncontributing_vertices(
    ring_state: FaceRingState,
    all_faces: list[dict[str, Any]],
    vertex_index: VertexFaceIndex,
    vertex_ids: list[str],
    ctx: FaceRefineContext,
    locked: set[str],
    affected: list[dict[str, Any]],
) -> tuple[str, ...]:
    """Drop inserted vertices that can be removed without increasing symmetric error."""
    surviving = list(vertex_ids)
    current_error = safe_face_score(ring_state, ctx)
    if current_error is None:
        return tuple(surviving)

    changed = True
    while changed and surviving:
        changed = False
        for vertex_id in list(surviving):
            ring_backup = {id(ring_face): list(ring_face.get("vertexIds") or []) for ring_face in affected}
            vertex_backup = copy.deepcopy(ring_state.document["vertices"].get(vertex_id))
            remove_vertex_from_mesh(ring_state.document, all_faces, vertex_id)
            ring_state.refresh_from_document()
            try:
                validate_change(ring_state.document, affected, set(), locked)
                trial_error = safe_face_score(ring_state, ctx)
            except ValueError:
                trial_error = None

            if trial_error is not None and trial_error <= current_error + 1e-15:
                current_error = trial_error
                surviving.remove(vertex_id)
                unregister_vertex_index(vertex_index, vertex_id)
                changed = True
                break

            for ring_face in affected:
                ring_face["vertexIds"] = ring_backup[id(ring_face)]
            if vertex_backup is not None:
                ring_state.document["vertices"][vertex_id] = vertex_backup
            ring_state.refresh_from_document()

    return tuple(surviving)


def min_quintile_edge_length() -> float:
    return MIN_EDGE_LENGTH_DEG * EDGE_PART_COUNT


def lerp_point(
    start: tuple[float, float],
    end: tuple[float, float],
    fraction: float,
) -> tuple[float, float]:
    return (
        start[0] + (end[0] - start[0]) * fraction,
        start[1] + (end[1] - start[1]) * fraction,
    )


def rotate_unit_vector(
    unit: tuple[float, float],
    angle_deg: float,
) -> tuple[float, float]:
    radians = math.radians(angle_deg)
    cos_a = math.cos(radians)
    sin_a = math.sin(radians)
    return (unit[0] * cos_a - unit[1] * sin_a, unit[0] * sin_a + unit[1] * cos_a)


def shift_by_direction(
    position: tuple[float, float],
    direction: tuple[float, float],
    distance: float,
) -> tuple[float, float]:
    return round_position((position[0] + direction[0] * distance, position[1] + direction[1] * distance))


def vertex_move_scale(ring_state: FaceRingState) -> float:
    xs = [coord[0] for coord in ring_state.coords]
    ys = [coord[1] for coord in ring_state.coords]
    return max(MIN_EDGE_LENGTH_DEG, math.hypot(max(xs) - min(xs), max(ys) - min(ys)) * MOVE_SCALE_FRACTION)


def find_best_error_direction(
    score_at: Any,
    start_pos: tuple[float, float],
    move_scale: float,
    edge_start: tuple[float, float],
    edge_end: tuple[float, float],
) -> tuple[tuple[float, float], float]:
    """Pick the signed edge-normal direction whose tiny probe most reduces error."""
    baseline_err = score_at(start_pos)
    if baseline_err is None:
        baseline_err = math.inf

    best_signed_dir = edge_normal_unit(edge_start, edge_end)
    best_err = baseline_err
    probe = max(move_scale * PROBE_FRACTION, MIN_LINE_STEP_DEG)

    for unit in edge_normal_near_unit_directions(edge_start, edge_end):
        for sign in (1.0, -1.0):
            signed_dir = (unit[0] * sign, unit[1] * sign)
            trial_err = score_at(shift_by_direction(start_pos, signed_dir, probe))
            if trial_err is not None and trial_err + 1e-15 < best_err:
                best_err = trial_err
                best_signed_dir = signed_dir

    return best_signed_dir, move_scale


def line_search_along_direction(
    score_at_offset: Any,
    *,
    start_offset: float,
    max_distance: float,
) -> tuple[float, float]:
    """March along a fixed direction; reverse and halve step when error worsens."""
    err = score_at_offset(start_offset)
    if err is None:
        return start_offset, math.inf

    offset = start_offset
    step = max(max_distance * INITIAL_LINE_STEP_FRACTION, MIN_LINE_STEP_DEG)
    direction = 1.0

    for _ in range(MAX_LINE_SEARCH_ITERS):
        if step < MIN_LINE_STEP_DEG:
            break
        trial_offset = offset + direction * step
        trial_err = score_at_offset(trial_offset)
        if trial_err is not None and trial_err + 1e-15 < err:
            offset = trial_offset
            err = trial_err
            continue
        direction = -direction
        step *= 0.5

    return offset, err


def line_search_vertex_by_error(
    score_at: Any,
    start_pos: tuple[float, float],
    move_scale: float,
    edge_start: tuple[float, float],
    edge_end: tuple[float, float],
) -> tuple[tuple[float, float], float]:
    signed_dir, max_distance = find_best_error_direction(
        score_at,
        start_pos,
        move_scale,
        edge_start,
        edge_end,
    )

    def score_at_offset(offset: float) -> float | None:
        return score_at(shift_by_direction(start_pos, signed_dir, offset))

    best_offset, err = line_search_along_direction(
        score_at_offset,
        start_offset=0.0,
        max_distance=max_distance,
    )
    return shift_by_direction(start_pos, signed_dir, best_offset), err


def safe_face_score(ring_state: FaceRingState, ctx: FaceRefineContext) -> float | None:
    try:
        return ring_state.score(ctx)
    except GEOSException:
        return None


def make_vertex_scorer(
    ring_state: FaceRingState,
    vertex_index: VertexFaceIndex,
    vertex_id: str,
    ctx: FaceRefineContext,
    locked: set[str],
    *,
    anchor: tuple[float, float],
) -> Any:
    affected = vertex_index.faces_for({vertex_id})

    def score_at(position: tuple[float, float]) -> float | None:
        sync_vertex_position(ring_state, vertex_id, position)
        try:
            validate_change(ring_state.document, affected, {vertex_id}, locked)
        except ValueError:
            sync_vertex_position(ring_state, vertex_id, anchor)
            return None
        error = safe_face_score(ring_state, ctx)
        sync_vertex_position(ring_state, vertex_id, anchor)
        return error

    return score_at


def line_search_vertex_after_split(
    ring_state: FaceRingState,
    vertex_index: VertexFaceIndex,
    vertex_id: str,
    ctx: FaceRefineContext,
    locked: set[str],
    *,
    edge_start: tuple[float, float],
    edge_end: tuple[float, float],
) -> None:
    """Move new vertex perpendicular to split edge (±variance) to minimize error."""
    original = ring_state.get_coord(vertex_id)
    score_at = make_vertex_scorer(
        ring_state,
        vertex_index,
        vertex_id,
        ctx,
        locked,
        anchor=original,
    )
    move_scale = edge_move_scale(edge_start, edge_end, ring_state)
    best_pos, _err = line_search_vertex_by_error(
        score_at,
        original,
        move_scale,
        edge_start,
        edge_end,
    )

    affected = vertex_index.faces_for({vertex_id})
    sync_vertex_position(ring_state, vertex_id, best_pos)
    validate_change(ring_state.document, affected, {vertex_id}, locked)


def try_split_edge_quintile(
    ring_state: FaceRingState,
    all_faces: list[dict[str, Any]],
    vertex_index: VertexFaceIndex,
    edge: tuple[str, str],
    ctx: FaceRefineContext,
    locked: set[str],
    *,
    commit: bool = True,
) -> SplitAttempt | None:
    """Split edge into five parts, optimize each new vertex, prune redundant ones."""
    start_id, end_id = edge
    if start_id in locked and end_id in locked:
        return None

    start = ring_state.get_coord(start_id)
    end = ring_state.get_coord(end_id)
    if math.hypot(end[0] - start[0], end[1] - start[1]) < min_quintile_edge_length():
        return None

    baseline = safe_face_score(ring_state, ctx)
    if baseline is None:
        return None

    new_vertex_ids = [str(uuid.uuid4()) for _ in SPLIT_FRACTIONS]
    affected = faces_using_edge(all_faces, edge)
    backup_rings = {id(ring_face): list(ring_face.get("vertexIds") or []) for ring_face in affected}

    for vertex_id, fraction in zip(new_vertex_ids, SPLIT_FRACTIONS, strict=True):
        ring_state.document["vertices"][vertex_id] = {
            "id": vertex_id,
            "position": list(round_position(lerp_point(start, end, fraction))),
        }

    insert_vertices_on_edge(all_faces, start_id, end_id, new_vertex_ids)

    try:
        ring_state.refresh_from_document()
        validate_change(ring_state.document, affected, set(new_vertex_ids), locked)
        for ring_face in affected:
            for vertex_id in new_vertex_ids:
                register_vertex_index(vertex_index, vertex_id, [ring_face])
        optimize_split_vertices(
            ring_state,
            vertex_index,
            new_vertex_ids,
            ctx,
            locked,
            edge_start=start,
            edge_end=end,
        )
        validate_change(ring_state.document, affected, set(new_vertex_ids), locked)
        surviving = prune_noncontributing_vertices(
            ring_state,
            all_faces,
            vertex_index,
            new_vertex_ids,
            ctx,
            locked,
            affected,
        )
        validate_change(ring_state.document, affected, set(surviving), locked)
    except ValueError:
        rollback_edge_split(ring_state, all_faces, new_vertex_ids, affected, backup_rings)
        for vertex_id in new_vertex_ids:
            unregister_vertex_index(vertex_index, vertex_id)
        return None

    trial = safe_face_score(ring_state, ctx)
    if trial is None:
        rollback_edge_split(ring_state, all_faces, new_vertex_ids, affected, backup_rings)
        for vertex_id in new_vertex_ids:
            unregister_vertex_index(vertex_index, vertex_id)
        return None

    attempt = SplitAttempt("quintile", baseline, trial, surviving)
    if not commit:
        rollback_edge_split(ring_state, all_faces, new_vertex_ids, affected, backup_rings)
        for vertex_id in new_vertex_ids:
            unregister_vertex_index(vertex_index, vertex_id)
        return attempt

    for vertex_id in new_vertex_ids:
        if vertex_id not in surviving:
            unregister_vertex_index(vertex_index, vertex_id)
    return attempt


def try_best_edge_split(
    ring_state: FaceRingState,
    all_faces: list[dict[str, Any]],
    vertex_index: VertexFaceIndex,
    edge: tuple[str, str],
    ctx: FaceRefineContext,
    locked: set[str],
    *,
    min_improvement: float,
) -> SplitDecision:
    """Five-way split edge; accept if relative face-error drop exceeds threshold."""
    trial = try_split_edge_quintile(
        ring_state,
        all_faces,
        vertex_index,
        edge,
        ctx,
        locked,
        commit=False,
    )
    if trial is None:
        return SplitDecision(None, None)

    if trial.relative_improvement <= min_improvement:
        return SplitDecision(None, trial)

    accepted = try_split_edge_quintile(
        ring_state,
        all_faces,
        vertex_index,
        edge,
        ctx,
        locked,
        commit=True,
    )
    return SplitDecision(accepted, trial)


def register_child_edges(
    edge_generation: dict[tuple[str, str], int],
    start_id: str,
    end_id: str,
    new_vertex_ids: tuple[str, ...],
    parent_depth: int,
) -> None:
    child_depth = parent_depth + 1
    chain = [start_id, *new_vertex_ids, end_id]
    for left, right in zip(chain[:-1], chain[1:], strict=True):
        edge_generation[undirected_edge_key(left, right)] = child_depth


def sorted_splittable_edges(
    face: dict[str, Any],
    ring_state: FaceRingState,
    ctx: FaceRefineContext,
    document: dict[str, Any],
    locked: set[str],
    *,
    exhausted: set[tuple[str, str]],
    edge_generation: dict[tuple[str, str], int],
    max_splits_per_edge: int,
) -> list[tuple[str, str]]:
    face_polygon = ring_state.polygon()
    excess = face_polygon.difference(ctx.target)
    missed = ctx.target.difference(face_polygon)
    candidates: list[tuple[str, str]] = []
    for edge in face_subdividable_edges(face, locked):
        key = undirected_edge_key(*edge)
        if key in exhausted:
            continue
        if edge_generation.get(key, 0) >= max_splits_per_edge:
            continue
        start = ring_state.get_coord(edge[0])
        end = ring_state.get_coord(edge[1])
        if math.hypot(end[0] - start[0], end[1] - start[1]) < min_quintile_edge_length():
            continue
        candidates.append(edge)

    candidates.sort(
        key=lambda edge: edge_overlap_error(
            face_polygon,
            edge,
            ctx,
            document,
            excess=excess,
            missed=missed,
        ),
        reverse=True,
    )
    return candidates


def refine_face_edge_split(
    document: dict[str, Any],
    all_faces: list[dict[str, Any]],
    vertex_index: VertexFaceIndex,
    face: dict[str, Any],
    ctx: FaceRefineContext,
    locked: set[str],
    *,
    max_splits_per_edge: int,
    max_total_splits: int,
    min_split_improvement: float,
) -> dict[str, Any]:
    name = str(face.get("name") or "")
    ring_state = FaceRingState.from_face(document, face)
    error_before = compute_face_error(ring_state.polygon(), ctx.target, name)

    stats: dict[str, Any] = {
        "name": name,
        "algorithm": "edge-split-quintile",
        "splits_accepted": 0,
        "splits_rejected": 0,
        "edges_exhausted": 0,
        "error_before": error_before.as_dict(),
        "error_after": None,
        "split_log": [],
    }

    exhausted: set[tuple[str, str]] = set()
    edge_generation: dict[tuple[str, str], int] = {}

    while True:
        if max_total_splits > 0 and stats["splits_accepted"] >= max_total_splits:
            log(f"    stopping: reached --max-total-splits {max_total_splits}")
            break

        edges = sorted_splittable_edges(
            face,
            ring_state,
            ctx,
            document,
            locked,
            exhausted=exhausted,
            edge_generation=edge_generation,
            max_splits_per_edge=max_splits_per_edge,
        )
        if not edges:
            log("    stopping: no splittable edges left")
            break

        edge = edges[0]
        edge_key = undirected_edge_key(*edge)
        decision = try_best_edge_split(
            ring_state,
            all_faces,
            vertex_index,
            edge,
            ctx,
            locked,
            min_improvement=min_split_improvement,
        )

        if decision.accepted is None:
            stats["splits_rejected"] += 1
            exhausted.add(edge_key)
            if decision.best_trial is None:
                log(
                    f"    reject split {edge[0][:8]}..{edge[1][:8]} "
                    f"(invalid or no trial)"
                )
            else:
                best = decision.best_trial
                log(
                    f"    reject split {edge[0][:8]}..{edge[1][:8]} "
                    f"best={best.mode} rel_sym={best.relative_improvement:.2%} "
                    f"sym={best.baseline:.8f}->{best.trial:.8f} "
                    f"(need >{min_split_improvement:.0%} rel on this face)"
                )
            continue

        attempt = decision.accepted

        start_id, end_id = edge
        parent_depth = edge_generation.get(edge_key, 0)
        child_depth = parent_depth + 1
        register_child_edges(
            edge_generation,
            start_id,
            end_id,
            attempt.new_vertex_ids,
            parent_depth,
        )

        stats["splits_accepted"] += 1

        improvement = attempt.relative_improvement
        split_record = {
            "edge": [start_id, end_id],
            "mode": attempt.mode,
            "vertices_inserted": len(SPLIT_FRACTIONS),
            "vertices_kept": len(attempt.new_vertex_ids),
            "new_vertices": list(attempt.new_vertex_ids),
            "depth": child_depth,
            "relative_sym_improvement": round(improvement, 6),
            "sym_before": round(attempt.baseline, 12),
            "sym_after": round(attempt.trial, 12),
        }
        stats["split_log"].append(split_record)
        log(
            f"    accept split #{stats['splits_accepted']} depth={child_depth} "
            f"rel_sym={improvement:.2%} sym={attempt.baseline:.8f}->{attempt.trial:.8f}"
        )

    stats["edges_exhausted"] = len(exhausted)
    stats["error_after"] = compute_face_error(ring_state.polygon(), ctx.target, name).as_dict()
    return stats


def refine_mesh_edge_split(
    mesh_payload: dict[str, Any],
    targets: dict[str, Any],
    *,
    face_names: list[str],
    all_faces_mode: bool,
    exclude_faces: list[str],
    limit_faces: int,
    max_splits_per_edge: int,
    max_total_splits: int,
    min_split_improvement: float,
) -> dict[str, Any]:
    from refine_goteborg_manual_mesh import face_target

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
        selected = errors if limit_faces <= 0 else errors[:limit_faces]
        work_faces = []
        for error in selected:
            for face in faces:
                if canonical_face_name(str(face.get("name") or "")) == error.name:
                    work_faces.append(face)
                    break
    else:
        raise ValueError("Specify --face NAME or --all-faces")

    work_faces, skipped_locked = filter_refinable_faces(work_faces)
    if skipped_locked:
        log(f"Skipping locked face(s): {', '.join(skipped_locked)}")
    if excluded_names:
        skipped = [
            str(face.get("name") or "")
            for face in work_faces
            if str(face.get("name") or "") in excluded_names
            or canonical_face_name(str(face.get("name") or "")) in excluded_names
        ]
        work_faces = [
            face
            for face in work_faces
            if str(face.get("name") or "") not in excluded_names
            and canonical_face_name(str(face.get("name") or "")) not in excluded_names
        ]
        if skipped:
            log(f"Skipping excluded face(s): {', '.join(skipped)}")

    stats: dict[str, Any] = {
        "algorithm": "edge-split-quintile",
        "faces_refined": len(work_faces),
        "max_splits_per_edge": max_splits_per_edge,
        "min_split_improvement": min_split_improvement,
        "total_splits_accepted": 0,
        "total_splits_rejected": 0,
        "per_face": [],
        "elapsed_seconds": 0.0,
    }

    started = time.monotonic()
    total = len(work_faces)

    for index, face in enumerate(work_faces, start=1):
        name = str(face.get("name") or "")
        log(f"[{index}/{total}] {name}")
        ctx = FaceRefineContext.from_target(face_target(face, targets, reference))
        face_stats = refine_face_edge_split(
            document,
            faces,
            vertex_index,
            face,
            ctx,
            locked,
            max_splits_per_edge=max_splits_per_edge,
            max_total_splits=max_total_splits,
            min_split_improvement=min_split_improvement,
        )
        stats["per_face"].append(face_stats)
        stats["total_splits_accepted"] += face_stats["splits_accepted"]
        stats["total_splits_rejected"] += face_stats["splits_rejected"]

        before = face_stats["error_before"]
        after = face_stats["error_after"]
        log(
            f"  done: IoU {before['iou']:.4f}->{after['iou']:.4f}  "
            f"sym {before['symmetric_area']:.8f}->{after['symmetric_area']:.8f}  "
            f"splits={face_stats['splits_accepted']} "
            f"rejected={face_stats['splits_rejected']} "
            f"exhausted_edges={face_stats['edges_exhausted']}"
        )

    stats["elapsed_seconds"] = round(time.monotonic() - started, 2)
    return stats


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
    reference = build_reference_region(document)
    before_errors = compute_all_errors(document, targets, reference)
    summarize_errors(before_errors, "Before")

    stats: dict[str, Any] = {"report_only": args.report_only}
    after_errors = before_errors

    if not args.report_only:
        if not args.face and not args.all_faces:
            print("Refinement requires --face NAME or --all-faces.", file=sys.stderr)
            return 2

        working = copy.deepcopy(json.loads(args.mesh.read_text(encoding="utf-8")))
        if args.face:
            scope = ", ".join(args.face)
        else:
            scope = "all faces" if args.limit_faces <= 0 else f"worst {args.limit_faces} faces"
            if args.exclude_face:
                scope += f" (excluding {', '.join(args.exclude_face)})"
        log(
            f"Edge-split refine {scope} "
            f"(max_splits_per_edge={args.max_splits_per_edge}, "
            f"min_improvement={args.min_split_improvement:.0%}):"
        )
        stats = refine_mesh_edge_split(
            working,
            targets,
            face_names=args.face,
            all_faces_mode=args.all_faces,
            exclude_faces=args.exclude_face,
            limit_faces=args.limit_faces,
            max_splits_per_edge=args.max_splits_per_edge,
            max_total_splits=args.max_total_splits,
            min_split_improvement=args.min_split_improvement,
        )
        after_errors = compute_all_errors(working["document"], targets, reference)
        summarize_errors(after_errors, "After")
        log(
            f"Total: {stats['total_splits_accepted']} splits accepted, "
            f"{stats['total_splits_rejected']} rejected across {stats['faces_refined']} face(s) "
            f"in {stats['elapsed_seconds']}s"
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
