"""Shared helpers for flattening GeoJSON feature collections into shape packages."""

from __future__ import annotations

import gzip
import json
import re
import unicodedata
from collections.abc import Callable
from pathlib import Path
from typing import Any

GEOJSON_DIR = Path("data/geojson")
OUTPUT_DIR = Path("data/individual")
METADATA_FIELDS = ("id", "old_id", "type", "name", "hash")

# feature_type, metadata_type, filename name key, metadata match name key,
# filename disambiguation code key, metadata old_id resolver (None = name only)
FlattenNaming = tuple[
    str,
    str,
    str,
    str | None,
    str | None,
    Callable[[dict[str, Any]], int | str] | None,
]

STATE_COUNTIES_MUNICIPALITIES_SOURCES: dict[str, FlattenNaming] = {
    "municipalities": (
        "municipality",
        "municipality",
        "namnkortform",
        "namnkortform",
        "kommunkod",
        lambda properties: int(properties["kommunkod"]),
    ),
    "counties": (
        "county",
        "county",
        "namnkortform",
        "beslutatnamn",
        "lanskod",
        lambda properties: int(properties["lanskod"]),
    ),
    "state": ("state", "country", "namnkortform", None, None, None),
}

URBAN_AREAS_SOURCES: dict[str, FlattenNaming] = {}

ALL_FLATTEN_SOURCES = {
    **STATE_COUNTIES_MUNICIPALITIES_SOURCES,
}


def slugify(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value))
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "unnamed"


def feature_basename(
    feature_type: str,
    properties: dict[str, Any],
    name_key: str,
    code_key: str | None = None,
    *,
    disambiguate: bool = False,
) -> str:
    if code_key and properties.get(code_key) is not None:
        code = slugify(str(properties[code_key]))
        return f"{feature_type}.{code}"

    name = slugify(properties.get(name_key, "unnamed"))
    if disambiguate and code_key and properties.get(code_key) is not None:
        name = f"{name}-{slugify(properties[code_key])}"
    return f"{feature_type}.{name}"


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


def empty_metadata(metadata_type: str, name: str) -> dict[str, Any]:
    return {
        "id": None,
        "old_id": None,
        "type": metadata_type,
        "name": name,
        "hash": "",
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


def write_output(path: Path, output: dict[str, Any]) -> None:
    with gzip.open(path, "wb") as handle:
        handle.write(json.dumps(output, ensure_ascii=False).encode("utf-8"))


def write_viewer_json(path: Path, geojson: dict[str, Any]) -> None:
    path.write_text(json.dumps(geojson, ensure_ascii=False), encoding="utf-8")


def write_package_geojson(path: Path, output: dict[str, Any]) -> None:
    path.write_text(json.dumps(output, ensure_ascii=False), encoding="utf-8")


def flatten_file(
    source: Path,
    output_dir: Path,
    naming: FlattenNaming,
) -> tuple[int, int]:
    feature_type, metadata_type, name_key, match_name_key, code_key, _code_fn = naming

    with source.open(encoding="utf-8") as handle:
        collection = json.load(handle)

    features = collection.get("features", [])
    properties_list = [feature.get("properties", {}) for feature in features]

    out_dir = output_dir / source.stem
    out_dir.mkdir(parents=True, exist_ok=True)

    new_count = 0
    for feature, properties in zip(features, properties_list):
        if source.stem == "state":
            match_name = "Sweden"
        else:
            match_name = properties[match_name_key]

        basename = feature_basename(
            feature_type,
            properties,
            name_key,
            code_key,
        )
        existing_package = load_existing_package(out_dir, basename)
        metadata, is_new = resolve_metadata(existing_package, metadata_type, match_name)
        if is_new:
            new_count += 1
            print(f"New shape: {source.stem}/{basename}.geojson.gz")

        output = build_output(feature, metadata)
        write_output(out_dir / f"{basename}.geojson.gz", output)
        write_package_geojson(out_dir / f"{basename}.geojson", output)
        write_viewer_json(out_dir / f"{basename}.json", build_geojson(feature))

    return len(features), new_count


def run_flatten(
    sources: dict[str, FlattenNaming],
    *,
    geojson_dir: Path = GEOJSON_DIR,
    output_dir: Path = OUTPUT_DIR,
) -> tuple[int, int]:
    total = 0
    total_new = 0

    for source_stem in sorted(sources):
        naming = sources[source_stem]
        source = geojson_dir / f"{source_stem}.geojson"
        if not source.is_file():
            print(f"Skipping {source.name}: file not found")
            continue

        count, new_count = flatten_file(source, output_dir, naming)
        print(f"{source.name}: {count} features ({new_count} new)")
        total += count
        total_new += new_count

    print(f"Wrote {total} shape packages under {output_dir}/ ({total_new} new shapes)")
    return total, total_new
