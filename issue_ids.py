#!/usr/bin/env python3
"""Issue ids and hashes for urban area shape packages missing metadata ids.

Scans data/individual/urban_areas/ and for each package with an empty id:
  - assigns the next sequential id from max_id.txt
  - assigns a new hash (random uuid4)

Updates .geojson.gz, .geojson, and .json in place and writes the new max id
back to max_id.txt.

Usage:
    python issue_ids.py
"""

from __future__ import annotations

import gzip
import json
import uuid
from pathlib import Path
from typing import Any

URBAN_AREAS_DIR = Path("data/individual/urban_areas")
MAX_ID_PATH = Path("max_id.txt")


def load_max_id(path: Path) -> int:
    value = path.read_text(encoding="utf-8").strip()
    if not value:
        raise SystemExit(f"{path}: max id is empty")
    return int(value)


def write_max_id(path: Path, max_id: int) -> None:
    path.write_text(f"{max_id}\n", encoding="utf-8")


def load_shape_package(path: Path) -> dict[str, Any]:
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        return json.load(handle)


def write_shape_package(gz_path: Path, payload: dict[str, Any]) -> None:
    encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    with gzip.open(gz_path, "wb") as handle:
        handle.write(encoded)

    geojson_path = gz_path.with_suffix("").with_suffix(".geojson")
    if geojson_path.is_file():
        geojson_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    json_path = gz_path.with_name(gz_path.name.replace(".geojson.gz", ".json"))
    if json_path.is_file():
        feature = payload.get("feature") or {}
        viewer_geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": feature.get("geometry"),
                    "properties": feature.get("properties", {}),
                }
            ],
        }
        json_path.write_text(json.dumps(viewer_geojson, ensure_ascii=False), encoding="utf-8")


def issue_ids() -> tuple[int, int]:
    if not URBAN_AREAS_DIR.is_dir():
        raise SystemExit(f"Directory not found: {URBAN_AREAS_DIR}")
    if not MAX_ID_PATH.is_file():
        raise SystemExit(f"Max id file not found: {MAX_ID_PATH}")

    next_id = load_max_id(MAX_ID_PATH) + 1
    issued = 0
    skipped = 0

    for path in sorted(URBAN_AREAS_DIR.glob("*.geojson.gz")):
        payload = load_shape_package(path)
        metadata = payload.get("metadata") or {}
        if metadata.get("id") is not None:
            skipped += 1
            continue

        name = metadata.get("name") or path.stem
        new_id = next_id
        new_hash = str(uuid.uuid4())
        next_id += 1

        print(f"Issued id {new_id} to {name} ({path.name})")

        metadata["id"] = new_id
        metadata["hash"] = new_hash
        payload["metadata"] = metadata
        write_shape_package(path, payload)
        issued += 1

    if issued:
        write_max_id(MAX_ID_PATH, next_id - 1)

    return issued, skipped


def main() -> None:
    issued, skipped = issue_ids()
    print(f"Issued {issued} id(s), left {skipped} unchanged")


if __name__ == "__main__":
    main()
