#!/usr/bin/env python3
"""Fetch shapes from the database by id and write them to data/draft/.

Writes the same files as flatten.py:
  - <type>.<name>.geojson.gz  (metadata + feature, compressed)
  - <type>.<name>.geojson     (metadata + feature, plain)
  - <type>.<name>.json        (plain GeoJSON FeatureCollection for viewers)

Configure the database via DATABASE_URL:
  postgresql://user:password@host:port/dbname

Usage:
    python fetch_shape.py 112
    python fetch_shape.py 112 231 4912
    python fetch_shape.py 112 231 --output-dir data/draft
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
from pathlib import Path

import psycopg2

from flatten import build_geojson, slugify

DRAFT_DIR = Path("data/draft")

FETCH_SQL = """
SELECT
    id,
    old_id,
    type,
    name,
    hash,
    ST_AsGeoJSON(polygons)::json AS geometry
FROM shapes
WHERE id = ANY(%s)
"""


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("Missing required environment variable: DATABASE_URL")
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    return url


def row_to_payload(row: tuple) -> dict:
    db_id, old_id, shape_type, name, shape_hash, geometry = row
    if geometry is None:
        raise ValueError(f"Shape id={db_id} has no geometry")

    return {
        "metadata": {
            "id": db_id,
            "old_id": old_id,
            "type": shape_type,
            "name": name,
            "hash": shape_hash,
        },
        "feature": {
            "type": "Feature",
            "geometry": geometry,
            "properties": {},
        },
    }


def fetch_shapes(connection, shape_ids: list[int]) -> list[dict]:
    with connection.cursor() as cursor:
        cursor.execute(FETCH_SQL, (shape_ids,))
        rows = cursor.fetchall()

    found_by_id = {row[0]: row for row in rows}
    missing = [shape_id for shape_id in shape_ids if shape_id not in found_by_id]
    if missing:
        raise SystemExit(f"No shape found for id(s): {', '.join(map(str, missing))}")

    payloads: list[dict] = []
    errors: list[str] = []
    for shape_id in shape_ids:
        try:
            payloads.append(row_to_payload(found_by_id[shape_id]))
        except ValueError as exc:
            errors.append(str(exc))

    if errors:
        raise SystemExit("\n".join(errors))

    return payloads


def write_shape(output_dir: Path, payload: dict) -> tuple[Path, Path, Path]:
    metadata = payload["metadata"]
    basename = f"{metadata['type']}.{slugify(metadata['name'])}"
    output_dir.mkdir(parents=True, exist_ok=True)

    gz_path = output_dir / f"{basename}.geojson.gz"
    geojson_path = output_dir / f"{basename}.geojson"
    json_path = output_dir / f"{basename}.json"

    with gzip.open(gz_path, "wb") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))

    geojson_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    json_path.write_text(
        json.dumps(build_geojson(payload["feature"]), ensure_ascii=False),
        encoding="utf-8",
    )
    return gz_path, geojson_path, json_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ids", type=int, nargs="+", help="Database id(s) of the shape(s) to fetch")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DRAFT_DIR,
        help=f"Output directory (default: {DRAFT_DIR})",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    with psycopg2.connect(database_url()) as connection:
        payloads = fetch_shapes(connection, args.ids)

    for payload in payloads:
        gz_path, geojson_path, json_path = write_shape(args.output_dir, payload)
        metadata = payload["metadata"]
        print(
            f"Wrote {metadata['type']} {metadata['name']} (id={metadata['id']}, "
            f"old_id={metadata['old_id']}) to:"
        )
        print(f"  {gz_path}")
        print(f"  {geojson_path}")
        print(f"  {json_path}")


if __name__ == "__main__":
    main()
