#!/usr/bin/env python3
"""Flatten area CSV export into individual shape packages.

Reads rows from areas.csv (database export) and writes packages under
data/individual/area/ using the same layout as other individual shapes:
  area.<id>.geojson.gz
  area.<id>.geojson
  area.<id>.json

Usage:
    python flatten_areas.py
    python flatten_areas.py --csv areas.csv
    python flatten_areas.py --output-dir data/individual/area
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
from pathlib import Path
from typing import Any

from shapely import wkt
from shapely.geometry import mapping

CSV_PATH = Path("areas.csv")
OUTPUT_DIR = Path("data/individual/area")

FEATURE_TYPE = "area"
METADATA_TYPE = "area"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, default=CSV_PATH)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    return parser.parse_args()


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


def build_output(feature: dict[str, Any], metadata: dict[str, Any]) -> dict[str, Any]:
    return {
        "metadata": metadata,
        "feature": {
            "type": "Feature",
            "geometry": feature.get("geometry"),
            "properties": feature.get("properties", {}),
        },
    }


def write_shape_package(output_dir: Path, basename: str, feature: dict[str, Any], metadata: dict[str, Any]) -> None:
    output = build_output(feature, metadata)
    output_dir.mkdir(parents=True, exist_ok=True)

    gz_path = output_dir / f"{basename}.geojson.gz"
    geojson_path = output_dir / f"{basename}.geojson"
    json_path = output_dir / f"{basename}.json"

    encoded = json.dumps(output, ensure_ascii=False).encode("utf-8")
    with gzip.open(gz_path, "wb") as handle:
        handle.write(encoded)

    geojson_path.write_text(json.dumps(output, ensure_ascii=False), encoding="utf-8")
    json_path.write_text(json.dumps(build_geojson(feature), ensure_ascii=False), encoding="utf-8")


def parse_optional_int(value: str) -> int | None:
    text = (value or "").strip()
    if not text or text.lower() == "null":
        return None
    return int(text)


def wkt_to_geojson(wkt_text: str) -> dict[str, Any]:
    geometry = mapping(wkt.loads(wkt_text))
    if geometry.get("type") not in {"Polygon", "MultiPolygon"}:
        raise ValueError(f"unsupported geometry type: {geometry.get('type')}")
    return geometry


def flatten_areas(source: Path, output_dir: Path) -> tuple[int, int, int]:
    if not source.is_file():
        raise SystemExit(f"CSV file not found: {source}")

    written = 0
    new_count = 0
    skipped = 0

    with source.open(encoding="utf-8", newline="") as handle:
        for row in csv.reader(handle):
            if len(row) < 15:
                skipped += 1
                continue

            shape_id = parse_optional_int(row[0])
            old_id = parse_optional_int(row[1])
            name = row[3].strip()
            shape_hash = row[4].strip()
            min_latitude = float(row[5])
            max_latitude = float(row[6])
            min_longitude = float(row[7])
            max_longitude = float(row[8])
            wkt_text = row[14].strip()

            if shape_id is None or not name or not wkt_text:
                skipped += 1
                print(f"Skipped {name or '<unknown>'}: missing id, name, or geometry")
                continue

            try:
                geometry = wkt_to_geojson(wkt_text)
            except Exception as exc:
                skipped += 1
                print(f"Skipped {name}: {exc}")
                continue

            basename = f"{FEATURE_TYPE}.{shape_id}"
            existing_package = load_existing_package(output_dir, basename)
            previous = (existing_package or {}).get("metadata") or {}
            is_new = existing_package is None

            metadata = {
                "id": previous.get("id", shape_id),
                "old_id": previous.get("old_id", old_id),
                "type": METADATA_TYPE,
                "name": name,
                "hash": previous.get("hash", shape_hash),
                "min_latitude": round(min_latitude, 6),
                "max_latitude": round(max_latitude, 6),
                "min_longitude": round(min_longitude, 6),
                "max_longitude": round(max_longitude, 6),
            }

            feature = {
                "type": "Feature",
                "geometry": geometry,
                "properties": {},
            }

            if is_new:
                new_count += 1
                print(f"New shape: {basename}.geojson.gz")

            write_shape_package(output_dir, basename, feature, metadata)
            written += 1

    return written, new_count, skipped


def main() -> None:
    args = parse_args()
    written, new_count, skipped = flatten_areas(args.csv, args.output_dir)
    print(
        f"Wrote {written} area shape packages under {args.output_dir}/ "
        f"({new_count} new, {skipped} skipped)"
    )


if __name__ == "__main__":
    main()
