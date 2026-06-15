#!/usr/bin/env python3
"""Load individual shape files into the PostgreSQL shapes table.

Reads gzipped files from data/individual/ (metadata + feature) and upserts rows
on (old_id, type). Existing rows get updated polygons, bounding box, and hash.

Configure the database via DATABASE_URL:
  postgresql://user:password@host:port/dbname

Usage:
    python synchronize_shapes.py
    python synchronize_shapes.py --dry-run
    python synchronize_shapes.py --limit 10
    python synchronize_shapes.py --insert-only
"""

from __future__ import annotations

import psycopg2
import argparse
import gzip
import json
import os
import sys
from pathlib import Path
from typing import Any, Iterable

INDIVIDUAL_DIR = Path("data/individual")
OFFICIAL_TYPES = frozenset({"country", "county", "municipality", "district", "urban_area"})
BATCH_SIZE = 100

INSERT_SQL = """
INSERT INTO shapes (
    old_id,
    type,
    name,
    hash,
    min_latitude,
    max_latitude,
    min_longitude,
    max_longitude,
    is_public,
    notes,
    polygons,
    parent_id,
    postal_code
) VALUES (
    %(old_id)s,
    %(type)s,
    %(name)s,
    %(hash)s,
    %(min_latitude)s,
    %(max_latitude)s,
    %(min_longitude)s,
    %(max_longitude)s,
    %(is_public)s,
    %(notes)s,
    ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON(%(geometry_json)s)), 4326),
    %(parent_id)s,
    %(postal_code)s
)
ON CONFLICT (old_id, type) DO UPDATE SET
    name = EXCLUDED.name,
    hash = EXCLUDED.hash,
    min_latitude = EXCLUDED.min_latitude,
    max_latitude = EXCLUDED.max_latitude,
    min_longitude = EXCLUDED.min_longitude,
    max_longitude = EXCLUDED.max_longitude,
    is_public = EXCLUDED.is_public,
    notes = EXCLUDED.notes,
    polygons = EXCLUDED.polygons,
    parent_id = EXCLUDED.parent_id,
    postal_code = EXCLUDED.postal_code,
    update_date = NOW()
"""

INSERT_SQL_SKIP_EXISTING = """
INSERT INTO shapes (
    old_id,
    type,
    name,
    hash,
    min_latitude,
    max_latitude,
    min_longitude,
    max_longitude,
    is_public,
    notes,
    polygons,
    parent_id,
    postal_code
) VALUES (
    %(old_id)s,
    %(type)s,
    %(name)s,
    %(hash)s,
    %(min_latitude)s,
    %(max_latitude)s,
    %(min_longitude)s,
    %(max_longitude)s,
    %(is_public)s,
    %(notes)s,
    ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON(%(geometry_json)s)), 4326),
    %(parent_id)s,
    %(postal_code)s
)
ON CONFLICT (old_id, type) DO NOTHING
"""

RESET_SEQUENCE_SQL = """
SELECT setval(
    pg_get_serial_sequence('shapes', 'id'),
    COALESCE((SELECT MAX(id) FROM shapes), 1),
    true
)
"""

MAX_OLD_ID_BY_TYPE_SQL = """
SELECT type, COALESCE(MAX(old_id), 0)
FROM shapes
WHERE type = ANY(%s)
GROUP BY type
"""


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("Missing required environment variable: DATABASE_URL")
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    return url


def connect():
    return psycopg2.connect(database_url())


def iter_shape_files(root: Path) -> Iterable[Path]:
    yield from sorted(root.rglob("*.geojson.gz"))


def load_shape_file(path: Path) -> dict[str, Any]:
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        return json.load(handle)


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


def next_old_id(shape_type: str, counters: dict[str, int]) -> int:
    counters[shape_type] = counters.get(shape_type, 0) + 1
    return counters[shape_type]


def load_old_id_counters(connection, shape_types: Iterable[str]) -> dict[str, int]:
    types = list(shape_types)
    counters: dict[str, int] = {shape_type: 0 for shape_type in types}

    with connection.cursor() as cursor:
        cursor.execute(MAX_OLD_ID_BY_TYPE_SQL, (types,))
        for shape_type, max_old_id in cursor.fetchall():
            counters[shape_type] = max_old_id

    return counters


def shape_file_to_row(path: Path, payload: dict[str, Any]) -> dict[str, Any]:
    metadata = payload.get("metadata") or {}
    feature = payload.get("feature") or {}
    geometry = feature.get("geometry")
    if not geometry:
        raise ValueError(f"{path}: missing feature geometry")

    shape_type = metadata.get("type")
    if shape_type not in OFFICIAL_TYPES:
        raise ValueError(f"{path}: unsupported shape type {shape_type!r}")

    name = (metadata.get("name") or "").strip()
    if not name:
        raise ValueError(f"{path}: missing shape name")

    old_id = metadata.get("old_id")
    shape_hash = metadata.get("hash", "")
    min_lat, max_lat, min_lon, max_lon = bounding_box(geometry)

    return {
        "old_id": old_id,
        "type": shape_type,
        "name": name[:255],
        "hash": shape_hash,
        "min_latitude": round(min_lat, 6),
        "max_latitude": round(max_lat, 6),
        "min_longitude": round(min_lon, 6),
        "max_longitude": round(max_lon, 6),
        "is_public": True,
        "notes": "",
        "geometry_json": json.dumps(geometry, ensure_ascii=False),
        "parent_id": None,
        "postal_code": None,
        "source_path": str(path),
        "is_new": old_id is None,
    }


def load_rows(root: Path, limit: int | None = None) -> tuple[list[dict[str, Any]], list[str]]:
    rows: list[dict[str, Any]] = []
    errors: list[str] = []

    for index, path in enumerate(iter_shape_files(root)):
        if limit is not None and index >= limit:
            break
        try:
            payload = load_shape_file(path)
            rows.append(shape_file_to_row(path, payload))
        except (OSError, json.JSONDecodeError, ValueError, KeyError) as exc:
            errors.append(f"{path}: {exc}")

    return rows, errors


def insert_rows(
    connection,
    rows: list[dict[str, Any]],
    *,
    insert_only: bool,
) -> tuple[int, int]:
    from psycopg2.extras import execute_batch

    if not rows:
        return 0, 0

    db_rows = [{key: value for key, value in row.items() if key not in {"source_path", "is_new"}} for row in rows]
    sql = INSERT_SQL_SKIP_EXISTING if insert_only else INSERT_SQL

    with connection.cursor() as cursor:
        execute_batch(cursor, sql, db_rows, page_size=BATCH_SIZE)
        affected = cursor.rowcount

    connection.commit()

    if not insert_only:
        return affected, 0

    skipped = max(len(rows) - affected, 0)
    return affected, skipped


def reset_shape_id_sequence(connection) -> None:
    with connection.cursor() as cursor:
        cursor.execute(RESET_SEQUENCE_SQL)
    connection.commit()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Parse files without writing to the database")
    parser.add_argument("--limit", type=int, default=None, help="Only process the first N shape files")
    parser.add_argument(
        "--insert-only",
        action="store_true",
        help="Only insert new shapes; skip existing (old_id, type) rows without updating polygons",
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=INDIVIDUAL_DIR,
        help=f"Directory with individual shape files (default: {INDIVIDUAL_DIR})",
    )
    return parser.parse_args()


def print_dry_run_sample(rows: list[dict[str, Any]]) -> None:
    if not rows:
        print("No rows prepared")
        return

    sample = rows[0]
    print("Sample row:")
    print(
        json.dumps(
            {key: value for key, value in sample.items() if key != "geometry_json"},
            indent=2,
            ensure_ascii=False,
        )
    )
    print(f"  geometry_json bytes: {len(sample['geometry_json'])}")


def main() -> None:
    args = parse_args()

    if not args.input_dir.is_dir():
        raise SystemExit(f"Input directory not found: {args.input_dir}")

    rows, errors = load_rows(args.input_dir, limit=args.limit)
    if errors:
        print(f"Skipped {len(errors)} files:", file=sys.stderr)
        for message in errors[:20]:
            print(f"  {message}", file=sys.stderr)
        if len(errors) > 20:
            print(f"  ... and {len(errors) - 20} more", file=sys.stderr)

    if not rows:
        raise SystemExit(f"No shape rows prepared under {args.input_dir}")

    new_rows = sum(1 for row in rows if row["is_new"])
    print(f"Prepared {len(rows)} shapes ({new_rows} without existing old_id)")

    if args.dry_run:
        print_dry_run_sample(rows)
        return

    database_url()

    with connect() as connection:
        old_id_counters = load_old_id_counters(connection, OFFICIAL_TYPES)

        for row in rows:
            if not row["is_new"]:
                continue
            row["old_id"] = next_old_id(row["type"], old_id_counters)

        missing_old_id = [row for row in rows if row["old_id"] is None]
        if missing_old_id:
            raise SystemExit(f"{len(missing_old_id)} shapes are missing old_id after assignment")

        inserted, skipped = insert_rows(connection, rows, insert_only=args.insert_only)
        reset_shape_id_sequence(connection)

    if args.insert_only:
        print(f"Inserted {inserted} shapes ({skipped} already existed, skipped)")
    else:
        print(f"Inserted/updated {inserted} shapes")


if __name__ == "__main__":
    main()
