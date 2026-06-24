#!/usr/bin/env python3
"""Flatten district GeoJSON into individual shape packages.

This script is intentionally self-contained so district-specific rules can
evolve independently from urban areas, counties, municipalities, and state.

Existing shape packages in the output directory are the source of truth for
id, old_id, and hash. Each package is keyed by distriktskod.

Usage:
    python flatten_districts.py
    python flatten_districts.py --geojson data/geojson/districts.geojson
    python flatten_districts.py --output-dir data/individual/districts
"""

from __future__ import annotations

import argparse
import gzip
import json
import re
import unicodedata
from pathlib import Path
from typing import Any

GEOJSON_PATH = Path("data/geojson/districts.geojson")
OUTPUT_DIR = Path("data/individual/districts")

FEATURE_TYPE = "district"
METADATA_TYPE = "district"
NAME_KEY = "distriktsnamn"
FILENAME_KEY = "distriktskod"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--geojson", type=Path, default=GEOJSON_PATH)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
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


def load_existing_package(output_dir: Path, basename: str) -> dict[str, Any] | None:
    gz_path = output_dir / f"{basename}.geojson.gz"
    if not gz_path.is_file():
        return None
    with gzip.open(gz_path, "rt", encoding="utf-8") as handle:
        return json.load(handle)


def empty_metadata(metadata_type: str, name: str) -> dict[str, Any]:
    return {
        "id": None,
        "old_id": None,
        "type": metadata_type,
        "name": name,
        "hash": "",
    }


def resolve_metadata(
    existing_package: dict[str, Any] | None,
    metadata_type: str,
    name: str,
) -> tuple[dict[str, Any], bool]:
    if existing_package is None:
        return empty_metadata(metadata_type, name), True

    previous = existing_package.get("metadata") or {}
    return {
        "id": previous.get("id"),
        "old_id": previous.get("old_id"),
        "type": metadata_type,
        "name": name,
        "hash": previous.get("hash", ""),
    }, False


def build_output(feature: dict[str, Any], metadata: dict[str, Any]) -> dict[str, Any]:
    return {
        "metadata": metadata,
        "feature": {
            "type": "Feature",
            "geometry": feature.get("geometry"),
            "properties": feature.get("properties", {}),
        },
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


def validate_district_feature(feature: dict[str, Any]) -> str | None:
    """Return an error message when a feature should be skipped."""
    properties = feature.get("properties") or {}
    name = (properties.get(NAME_KEY) or "").strip()
    if not name:
        return "missing distriktsnamn"

    distriktskod = properties.get(FILENAME_KEY)
    if distriktskod is None or str(distriktskod).strip() == "":
        return "missing distriktskod"

    geometry = feature.get("geometry")
    if not geometry or not geometry.get("coordinates"):
        return "missing geometry"

    return None


def feature_basename(properties: dict[str, Any]) -> str:
    distriktskod = slugify(properties.get(FILENAME_KEY, "unnamed"))
    return f"{FEATURE_TYPE}.{distriktskod}"


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


def flatten_districts(source: Path, output_dir: Path) -> tuple[int, int, int]:
    if not source.is_file():
        raise SystemExit(f"GeoJSON file not found: {source}")

    with source.open(encoding="utf-8") as handle:
        collection = json.load(handle)

    features = collection.get("features", [])
    written = 0
    new_count = 0
    skipped = 0

    for feature in features:
        validation_error = validate_district_feature(feature)
        if validation_error:
            skipped += 1
            name = (feature.get("properties") or {}).get(NAME_KEY, "<unknown>")
            print(f"Skipped {name}: {validation_error}")
            continue

        properties = feature["properties"]
        name = properties[NAME_KEY].strip()
        basename = feature_basename(properties)
        existing_package = load_existing_package(output_dir, basename)
        metadata, is_new = resolve_metadata(existing_package, METADATA_TYPE, name)
        metadata = {**metadata, **geometry_bounds(feature["geometry"])}

        if is_new:
            new_count += 1
            print(f"New shape: {basename}.geojson.gz")

        write_shape_package(output_dir, basename, feature, metadata)
        written += 1

    return written, new_count, skipped


def main() -> None:
    args = parse_args()
    written, new_count, skipped = flatten_districts(args.geojson, args.output_dir)
    print(
        f"Wrote {written} district shape packages under {args.output_dir}/ "
        f"({new_count} new, {skipped} skipped)"
    )


if __name__ == "__main__":
    main()
