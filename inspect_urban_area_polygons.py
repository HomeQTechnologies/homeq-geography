#!/usr/bin/env python3
"""Report enclosed-shape counts and pairwise distances for urban area files.

Each urban area file should contain one enclosed area. This script counts how many
separate enclosed outer boundaries exist in the geometry:

  - Polygon: 1 enclosed shape (interior rings / holes are NOT extra shapes)
  - MultiPolygon: one enclosed shape per member polygon
  - GeometryCollection: one enclosed shape per polygon member

Only shapes with more than one enclosed part are printed, along with the distance
between each pair of parts.

Usage:
    python inspect_urban_area_polygons.py
    python inspect_urban_area_polygons.py --dir data/individual/urban_areas
"""

from __future__ import annotations

import argparse
import gzip
import json
import math
from itertools import combinations
from pathlib import Path
from typing import Any

from shapely import get_parts
from shapely.geometry import Polygon, shape
from shapely.ops import nearest_points

URBAN_AREAS_DIR = Path("data/individual/urban_areas")
EARTH_RADIUS_M = 6_371_000


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dir", type=Path, default=URBAN_AREAS_DIR, help="Urban area shape directory")
    parser.add_argument(
        "--min-polygons",
        type=int,
        default=2,
        help="Only print shapes with at least this many polygons (default: 2)",
    )
    return parser.parse_args()


def load_shape_package(path: Path) -> dict[str, Any]:
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        return json.load(handle)


def enclosed_shapes(geometry: dict[str, Any]) -> list[Polygon]:
    """Return each separate enclosed outer boundary in the geometry.

    Holes inside a polygon are ignored. A MultiPolygon with multiple members
    returns one polygon per member.
    """
    geom = shape(geometry)
    shapes = [part for part in get_parts(geom) if isinstance(part, Polygon) and not part.is_empty]
    if not shapes:
        raise ValueError(f"geometry has no enclosed polygon parts: {geom.geom_type!r}")
    return shapes


def haversine_meters(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def polygon_distance_meters(left: Polygon, right: Polygon) -> float:
    point_a, point_b = nearest_points(left, right)
    return haversine_meters(point_a.x, point_a.y, point_b.x, point_b.y)


def pairwise_distances(polygons: list[Polygon]) -> list[tuple[int, int, float]]:
    distances: list[tuple[int, int, float]] = []
    for left_index, right_index in combinations(range(len(polygons)), 2):
        distance = polygon_distance_meters(polygons[left_index], polygons[right_index])
        distances.append((left_index + 1, right_index + 1, distance))
    return distances


def format_distance_meters(distance: float) -> str:
    if distance >= 1000:
        return f"{distance / 1000:.2f} km"
    return f"{distance:.1f} m"


def inspect_shape(path: Path) -> tuple[str, int, list[tuple[int, int, float]]]:
    payload = load_shape_package(path)
    metadata = payload.get("metadata") or {}
    feature = payload.get("feature") or {}
    geometry = feature.get("geometry")
    if not geometry:
        raise ValueError(f"{path}: missing feature geometry")

    name = (metadata.get("name") or path.stem).strip()
    shapes = enclosed_shapes(geometry)
    return name, len(shapes), pairwise_distances(shapes)


def iter_urban_area_files(root: Path) -> list[Path]:
    return sorted(root.glob("*.geojson.gz"))


def main() -> None:
    args = parse_args()
    if not args.dir.is_dir():
        raise SystemExit(f"Directory not found: {args.dir}")

    files = iter_urban_area_files(args.dir)
    if not files:
        raise SystemExit(f"No .geojson.gz files found under {args.dir}")

    printed = 0
    for path in files:
        name, polygon_count, distances = inspect_shape(path)
        if polygon_count < args.min_polygons:
            continue

        print(f"{name}\t{polygon_count} enclosed shape{'s' if polygon_count != 1 else ''}")
        for left_index, right_index, distance in distances:
            print(
                f"  shape {left_index} <-> shape {right_index}: "
                f"{format_distance_meters(distance)}"
            )
        printed += 1

    print(f"\nPrinted {printed} urban area shape(s)")


if __name__ == "__main__":
    main()
