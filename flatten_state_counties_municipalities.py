#!/usr/bin/env python3
"""Split state, county, and municipality GeoJSON into individual shape packages.

This script is intentionally self-contained so state/county/municipality rules can
evolve independently from districts, urban areas, and mesh extraction.

Existing shape packages in the output directory are the source of truth for
id, old_id, and hash. Each package is keyed by kommunkod or lanskod.

Usage:
    python flatten_state_counties_municipalities.py
    python flatten_state_counties_municipalities.py --geojson-dir data/geojson
    python flatten_state_counties_municipalities.py --output-dir data/individual
"""

from __future__ import annotations

import argparse
import gzip
import json
import re
import unicodedata
from pathlib import Path
from typing import Any

GEOJSON_DIR = Path("data/geojson")
OUTPUT_DIR = Path("data/individual")

# feature_type, metadata_type, name_key, metadata match name key, filename code key
SOURCE_CONFIG: dict[str, tuple[str, str, str, str | None, str | None]] = {
    "municipalities": (
        "municipality",
        "municipality",
        "namnkortform",
        "namnkortform",
        "kommunkod",
    ),
    "counties": (
        "county",
        "county",
        "namnkortform",
        "beslutatnamn",
        "lanskod",
    ),
    "state": ("state", "country", "namnkortform", None, None),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--geojson-dir", type=Path, default=GEOJSON_DIR)
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


def feature_basename(
    feature_type: str,
    properties: dict[str, Any],
    name_key: str,
    code_key: str | None = None,
) -> str:
    if code_key and properties.get(code_key) is not None:
        code = slugify(str(properties[code_key]))
        return f"{feature_type}.{code}"

    name = slugify(properties.get(name_key, "unnamed"))
    return f"{feature_type}.{name}"


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


def flatten_source(source: Path, output_dir: Path, config: tuple[str, str, str, str | None, str | None]) -> tuple[int, int]:
    feature_type, metadata_type, name_key, match_name_key, code_key = config

    with source.open(encoding="utf-8") as handle:
        collection = json.load(handle)

    features = collection.get("features", [])
    out_dir = output_dir / source.stem
    new_count = 0

    for feature in features:
        properties = feature.get("properties", {})
        if source.stem == "state":
            match_name = "Sweden"
        else:
            match_name = properties[match_name_key]

        basename = feature_basename(feature_type, properties, name_key, code_key)
        existing_package = load_existing_package(out_dir, basename)
        metadata, is_new = resolve_metadata(existing_package, metadata_type, match_name)
        if is_new:
            new_count += 1
            print(f"New shape: {source.stem}/{basename}.geojson.gz")

        write_shape_package(out_dir, basename, feature, metadata)

    return len(features), new_count


def flatten_state_counties_municipalities(geojson_dir: Path, output_dir: Path) -> tuple[int, int]:
    total = 0
    total_new = 0

    for source_stem in sorted(SOURCE_CONFIG):
        config = SOURCE_CONFIG[source_stem]
        source = geojson_dir / f"{source_stem}.geojson"
        if not source.is_file():
            print(f"Skipping {source.name}: file not found")
            continue

        count, new_count = flatten_source(source, output_dir, config)
        print(f"{source.name}: {count} features ({new_count} new)")
        total += count
        total_new += new_count

    return total, total_new


def main() -> None:
    args = parse_args()
    total, total_new = flatten_state_counties_municipalities(args.geojson_dir, args.output_dir)
    print(f"Wrote {total} shape packages under {args.output_dir}/ ({total_new} new shapes)")


if __name__ == "__main__":
    main()
