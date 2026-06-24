import gzip
import json
import os
import sqlite3
from pathlib import Path

INDIVIDUAL_DIR = Path("data/individual")
DB_PATH = Path("shapes.db")

SCHEMA = """
CREATE TABLE shapes (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL,
    category TEXT NOT NULL,
    old_id INTEGER,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    hash TEXT UNIQUE,
    geometry_type TEXT,
    UNIQUE (old_id, type)
);

CREATE INDEX idx_shapes_type ON shapes(type);
CREATE INDEX idx_shapes_name ON shapes(name);
CREATE INDEX idx_shapes_category ON shapes(category);
CREATE INDEX idx_shapes_path ON shapes(path);
"""


def setup_database(db_path: Path) -> sqlite3.Connection:
    if db_path.exists():
        db_path.unlink()

    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    connection.executescript(SCHEMA)
    return connection


def resolve_shape_id(metadata_id: int | None, next_temp_id: int) -> tuple[int, int]:
    if metadata_id is not None:
        return metadata_id, next_temp_id
    return next_temp_id, next_temp_id - 1


def normalize_hash(value: str | None) -> str | None:
    if not value:
        return None
    return value


def format_shape_row(row: tuple) -> str:
    shape_id, path, name, shape_type, old_id, shape_hash = row
    return (
        f"id={shape_id} type={shape_type} old_id={old_id} "
        f'name="{name}" path={path} hash={shape_hash}'
    )


def find_collisions(
    connection: sqlite3.Connection,
    *,
    shape_id: int,
    old_id: int | None,
    shape_type: str,
    shape_hash: str | None,
) -> list[tuple[str, tuple]]:
    collisions: list[tuple[str, tuple]] = []
    row = connection.execute(
        "SELECT id, path, name, type, old_id, hash FROM shapes WHERE id = ?",
        (shape_id,),
    ).fetchone()
    if row:
        collisions.append(("id", row))

    if shape_hash is not None:
        row = connection.execute(
            "SELECT id, path, name, type, old_id, hash FROM shapes WHERE hash = ?",
            (shape_hash,),
        ).fetchone()
        if row and ("hash", row) not in collisions:
            collisions.append(("hash", row))

    if old_id is not None and shape_type:
        row = connection.execute(
            "SELECT id, path, name, type, old_id, hash FROM shapes WHERE old_id = ? AND type = ?",
            (old_id, shape_type),
        ).fetchone()
        if row and all(existing_row != row for _, existing_row in collisions):
            collisions.append(("old_id+type", row))

    return collisions


connection = setup_database(DB_PATH)
inserted = 0
skipped = 0
next_temp_id = -1

for root, _dirs, files in os.walk(INDIVIDUAL_DIR):
    category = Path(root).name

    for file in files:
        shape_path = Path(root) / file

        if shape_path.suffixes[-2:] != [".geojson", ".gz"]:
            continue

        rel_path = shape_path.as_posix()

        with gzip.open(shape_path, "rt", encoding="utf-8") as handle:
            payload = json.load(handle)

        metadata = payload.get("metadata") or {}
        feature = payload.get("feature") or {}
        geometry = feature.get("geometry") or {}

        shape_id, next_temp_id = resolve_shape_id(metadata.get("id"), next_temp_id)
        old_id = metadata.get("old_id")
        shape_type = metadata.get("type") or ""
        shape_name = metadata.get("name") or ""
        shape_hash = normalize_hash(metadata.get("hash"))

        try:
            connection.execute(
                """
                INSERT INTO shapes (
                    id,
                    path,
                    category,
                    old_id,
                    type,
                    name,
                    hash,
                    geometry_type
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    shape_id,
                    rel_path,
                    category,
                    old_id,
                    shape_type,
                    shape_name,
                    shape_hash,
                    geometry.get("type"),
                ),
            )
        except sqlite3.IntegrityError as error:
            skipped += 1
            collisions = find_collisions(
                connection,
                shape_id=shape_id,
                old_id=old_id,
                shape_type=shape_type,
                shape_hash=shape_hash,
            )
            print(f"Skipped {rel_path} ({shape_name}, {shape_type}): {error}")
            if collisions:
                by_row: dict[tuple, list[str]] = {}
                for constraint, existing in collisions:
                    by_row.setdefault(existing, []).append(constraint)
                for existing, constraints in by_row.items():
                    print(
                        f"  collides on {', '.join(constraints)} with {format_shape_row(existing)}"
                    )
            else:
                print("  could not find an existing row for this collision")
            continue

        inserted += 1

connection.commit()
connection.close()

print(f"Indexed {inserted} shapes in {DB_PATH}")
if skipped:
    print(f"Skipped {skipped} shapes due to unique constraint violations")
