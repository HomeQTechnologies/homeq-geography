#!/usr/bin/env python3
"""Split GeoJSON feature collections into one file per feature."""

import gzip
import json
import re
import unicodedata
from pathlib import Path

GEOJSON_DIR = Path("data/geojson")
OUTPUT_DIR = Path("data/individual")
METADATA_PATH = Path("data/existing/metadata.json")
METADATA_FIELDS = ("id", "old_id", "type", "name", "hash")

# feature_type, metadata_type, filename name key, metadata match name key, code key, code extractor
NAMING = {
    "municipalities": ("municipality", "municipality", "namnkortform", "namnkortform", "kommunkod", lambda p: int(p["kommunkod"])),
    "counties": ("county", "county", "namnkortform", "beslutatnamn", "lanskod", lambda p: int(p["lanskod"])),
    "districts": ("district", "district", "distriktsnamn", "distriktsnamn", "distriktskod", lambda p: p["distriktskod"]),
    "state": ("state", "country", "namnkortform", None, None, None),
    "urban_areas": ("urban_area", "urban_area", "tatort", "tatort", "objectid", lambda p: p["objectid"]),
}


def slugify(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value))
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "unnamed"


def feature_basename(
    feature_type: str,
    properties: dict,
    name_key: str,
    code_key: str | None = None,
    *,
    disambiguate: bool = False,
) -> str:
    name = slugify(properties.get(name_key, "unnamed"))
    if disambiguate and code_key and properties.get(code_key) is not None:
        name = f"{name}-{slugify(properties[code_key])}"
    return f"{feature_type}.{name}"


def build_geojson(feature: dict) -> dict:
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


def load_metadata_index(path: Path) -> tuple[dict[tuple[str, str], list[dict]], dict[tuple[str, int], dict]]:
    records = json.loads(path.read_text(encoding="utf-8"))
    by_type_name: dict[tuple[str, str], list[dict]] = {}
    by_type_code: dict[tuple[str, int], dict] = {}
    for record in records:
        by_type_name.setdefault((record["type"], record["name"].lower()), []).append(record)
        by_type_code[(record["type"], record["old_id"])] = record
    return by_type_name, by_type_code


def lookup_metadata(
    by_type_name: dict[tuple[str, str], list[dict]],
    by_type_code: dict[tuple[str, int], dict],
    metadata_type: str,
    match_name: str,
    code: int | None,
) -> dict | None:
    matches = by_type_name.get((metadata_type, match_name.lower()), [])
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1 and code is not None:
        for match in matches:
            if match["old_id"] == code:
                return match
    if code is not None:
        return by_type_code.get((metadata_type, code))
    return None


def empty_metadata(metadata_type: str, name: str) -> dict:
    return {
        "id": None,
        "old_id": None,
        "type": metadata_type,
        "name": name,
        "hash": "",
    }


def build_output(feature: dict, metadata: dict) -> dict:
    return {
        "metadata": metadata,
        "feature": {
            "type": "Feature",
            "geometry": feature.get("geometry"),
            "properties": feature.get("properties", {}),
        },
    }


def write_output(path: Path, output: dict) -> None:
    with gzip.open(path, "wb") as handle:
        handle.write(json.dumps(output, ensure_ascii=False).encode("utf-8"))


def write_viewer_json(path: Path, geojson: dict) -> None:
    path.write_text(json.dumps(geojson, ensure_ascii=False), encoding="utf-8")


def write_package_geojson(path: Path, output: dict) -> None:
    path.write_text(json.dumps(output, ensure_ascii=False), encoding="utf-8")


def flatten_file(
    source: Path,
    output_dir: Path,
    by_type_name: dict[tuple[str, str], list[dict]],
    by_type_code: dict[tuple[str, int], dict],
) -> tuple[int, int]:
    naming = NAMING.get(source.stem)
    if naming is None:
        print(f"Skipping {source.name}: unknown naming scheme")
        return 0, 0

    feature_type, metadata_type, name_key, match_name_key, code_key, code_fn = naming

    with source.open(encoding="utf-8") as handle:
        collection = json.load(handle)

    features = collection.get("features", [])
    properties_list = [feature.get("properties", {}) for feature in features]
    name_counts = {}
    for properties in properties_list:
        name = slugify(properties.get(name_key, "unnamed"))
        name_counts[name] = name_counts.get(name, 0) + 1

    out_dir = output_dir / source.stem
    out_dir.mkdir(parents=True, exist_ok=True)

    new_count = 0
    for feature, properties in zip(features, properties_list):
        if source.stem == "state":
            match_name = "Sweden"
            code = None
        else:
            match_name = properties[match_name_key]
            code = code_fn(properties)

        existing = lookup_metadata(by_type_name, by_type_code, metadata_type, match_name, code)
        if existing is None:
            metadata = empty_metadata(metadata_type, match_name)
            new_count += 1
        else:
            metadata = {field: existing[field] for field in METADATA_FIELDS}

        name = slugify(properties.get(name_key, "unnamed"))
        basename = feature_basename(
            feature_type,
            properties,
            name_key,
            code_key,
            disambiguate=name_counts[name] > 1,
        )
        if existing is None:
            print(f"New shape: {source.stem}/{basename}.geojson.gz")

        output = build_output(feature, metadata)
        write_output(out_dir / f"{basename}.geojson.gz", output)
        write_package_geojson(out_dir / f"{basename}.geojson", output)
        write_viewer_json(out_dir / f"{basename}.json", build_geojson(feature))

    return len(features), new_count


def main() -> None:
    by_type_name, by_type_code = load_metadata_index(METADATA_PATH)
    total = 0
    total_new = 0
    for source in sorted(GEOJSON_DIR.glob("*.geojson")):
        count, new_count = flatten_file(source, OUTPUT_DIR, by_type_name, by_type_code)
        print(f"{source.name}: {count} features ({new_count} new)")
        total += count
        total_new += new_count
    print(f"Wrote {total} shape packages under {OUTPUT_DIR}/ ({total_new} new shapes)")


if __name__ == "__main__":
    main()
