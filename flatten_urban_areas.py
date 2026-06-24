#!/usr/bin/env python3
"""Flatten SCB urban area GeoJSON into individual shape packages.

This script is intentionally self-contained so urban-area-specific rules can
evolve independently from districts, counties, municipalities, and state.

Usage:
    python flatten_urban_areas.py
    python flatten_urban_areas.py --geojson data/geojson/urban_areas.geojson
    python flatten_urban_areas.py --output-dir data/individual/urban_areas
"""

from __future__ import annotations

import argparse
import gzip
import json
import re
import unicodedata
from pathlib import Path
from typing import Any

GEOJSON_PATH = Path("data/geojson/urban_areas.geojson")
OUTPUT_DIR = Path("data/individual/urban_areas")
METADATA_PATH = Path("existing_urban_Areas.json")

FEATURE_TYPE = "urban_area"
METADATA_TYPE = "urban_area"
NAME_KEY = "tatort"
FILENAME_KEY = "tatortskod"
BOUND_FIELDS = ("min_latitude", "max_latitude", "min_longitude", "max_longitude")
MAX_CENTER_DISTANCE_DEGREES = 0.15


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--geojson", type=Path, default=GEOJSON_PATH)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--metadata", type=Path, default=METADATA_PATH)
    return parser.parse_args()


def slugify(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value))
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "unnamed"


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


def build_output(feature: dict[str, Any], metadata: dict[str, Any]) -> dict[str, Any]:
    return {
        "metadata": metadata,
        "feature": {
            "type": "Feature",
            "geometry": feature.get("geometry"),
            "properties": feature.get("properties", {}),
        },
    }


def empty_metadata(name: str) -> dict[str, Any]:
    return {
        "id": None,
        "old_id": None,
        "type": METADATA_TYPE,
        "name": name,
        "hash": "",
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


def bounding_box(geometry: dict[str, Any]) -> tuple[float, float, float, float]:
    points: list[tuple[float, float]] = []
    walk_coordinates(geometry.get("coordinates"), points)
    if not points:
        raise ValueError(f"geometry has no coordinates: {geometry.get('type')}")

    lons = [lon for lon, _lat in points]
    lats = [lat for _lon, lat in points]
    return min(lats), max(lats), min(lons), max(lons)


def geometry_bounds(geometry: dict[str, Any]) -> dict[str, float]:
    min_lat, max_lat, min_lon, max_lon = bounding_box(geometry)
    return {
        "min_latitude": round(min_lat, 6),
        "max_latitude": round(max_lat, 6),
        "min_longitude": round(min_lon, 6),
        "max_longitude": round(max_lon, 6),
    }


def box_center(bounds: dict[str, float]) -> tuple[float, float]:
    return (
        (bounds["min_latitude"] + bounds["max_latitude"]) / 2,
        (bounds["min_longitude"] + bounds["max_longitude"]) / 2,
    )


def center_distance(left: dict[str, float], right: dict[str, float]) -> float:
    lat1, lon1 = box_center(left)
    lat2, lon2 = box_center(right)
    return ((lat1 - lat2) ** 2 + (lon1 - lon2) ** 2) ** 0.5


def load_urban_metadata_index(path: Path) -> dict[str, list[dict[str, Any]]]:
    records = json.loads(path.read_text(encoding="utf-8"))
    by_name: dict[str, list[dict[str, Any]]] = {}

    for record in records:
        by_name.setdefault(record["name"].lower(), []).append(record)

    return by_name


def validate_urban_area_feature(feature: dict[str, Any]) -> str | None:
    """Return an error message when a feature should be skipped."""
    properties = feature.get("properties") or {}
    tatort = (properties.get(NAME_KEY) or "").strip()
    if not tatort:
        return "missing tatort name"

    tatortskod = (properties.get(FILENAME_KEY) or "").strip()
    if not tatortskod:
        return "missing tatortskod"

    geometry = feature.get("geometry")
    if not geometry or not geometry.get("coordinates"):
        return "missing geometry"

    return None


def lookup_urban_area_metadata(
    by_name: dict[str, list[dict[str, Any]]],
    tatort: str,
    bounds: dict[str, float],
    assigned_ids: set[int],
) -> dict[str, Any] | None:
    """Match urban areas by name, disambiguating duplicates via nearest bbox center.

    SCB objectid is not shapes.old_id, so never use objectid for metadata lookup.
    """
    matches = [
        record
        for record in by_name.get(tatort.lower(), [])
        if record["id"] not in assigned_ids
    ]
    if not matches:
        return None

    best = min(
        matches,
        key=lambda record: center_distance(bounds, {field: record[field] for field in BOUND_FIELDS}),
    )
    best_distance = center_distance(bounds, {field: best[field] for field in BOUND_FIELDS})
    if best_distance > MAX_CENTER_DISTANCE_DEGREES:
        return None
    return best


def feature_basename(properties: dict[str, Any]) -> str:
    tatortskod = slugify(properties.get(FILENAME_KEY, "unnamed"))
    return f"{FEATURE_TYPE}.{tatortskod}"


def write_shape_package(output_dir: Path, basename: str, feature: dict[str, Any], metadata: dict[str, Any]) -> None:
    output = build_output(feature, metadata)
    output_dir.mkdir(parents=True, exist_ok=True)

    gz_path = output_dir / f"{basename}.geojson.gz"
    geojson_path = output_dir / f"{basename}.geojson"
    json_path = output_dir / f"{basename}.json"

    with gzip.open(gz_path, "wb") as handle:
        handle.write(json.dumps(output, ensure_ascii=False).encode("utf-8"))

    geojson_path.write_text(json.dumps(output, ensure_ascii=False), encoding="utf-8")
    json_path.write_text(json.dumps(build_geojson(feature), ensure_ascii=False), encoding="utf-8")


def flatten_urban_areas(
    source: Path,
    output_dir: Path,
    metadata_path: Path,
) -> tuple[int, int, int]:
    if not source.is_file():
        raise SystemExit(f"GeoJSON file not found: {source}")
    if not metadata_path.is_file():
        raise SystemExit(f"Metadata file not found: {metadata_path}")

    with source.open(encoding="utf-8") as handle:
        collection = json.load(handle)

    features = collection.get("features", [])
    by_name = load_urban_metadata_index(metadata_path)
    assigned_ids: set[int] = set()

    written = 0
    new_count = 0
    skipped = 0

    for feature in features:
        validation_error = validate_urban_area_feature(feature)
        if validation_error:
            skipped += 1
            tatort = (feature.get("properties") or {}).get(NAME_KEY, "<unknown>")
            print(f"Skipped {tatort}: {validation_error}")
            continue

        properties = feature["properties"]
        tatort = properties[NAME_KEY].strip()
        bounds = geometry_bounds(feature["geometry"])
        existing = lookup_urban_area_metadata(by_name, tatort, bounds, assigned_ids)

        if existing is None:
            metadata = empty_metadata(tatort)
            new_count += 1
        else:
            metadata = {
                "id": existing["id"],
                "old_id": existing["old_id"],
                "type": METADATA_TYPE,
                "name": tatort,
                "hash": existing["hash"],
            }
            assigned_ids.add(existing["id"])

        metadata = {**metadata, **bounds}

        basename = feature_basename(properties)

        if existing is None:
            print(f"New shape: {basename}.geojson.gz")

        write_shape_package(output_dir, basename, feature, metadata)
        written += 1

    return written, new_count, skipped


def main() -> None:
    args = parse_args()
    written, new_count, skipped = flatten_urban_areas(args.geojson, args.output_dir, args.metadata)
    print(
        f"Wrote {written} urban area shape packages under {args.output_dir}/ "
        f"({new_count} new, {skipped} skipped)"
    )


if __name__ == "__main__":
    main()
