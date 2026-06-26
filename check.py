#!/usr/bin/env python3
"""Run consistency checks on individual shape packages.

Checks performed:
- Every package has a set id and hash, and ids are globally unique.
- (old_id, type) is unique among shapes where old_id is set.
- Urban areas, districts, mesh faces, and metro areas each have exactly one
  polygon without holes.

Usage:
    python check.py
    python check.py --individual-dir data/individual
    python check.py --verbose
"""

from __future__ import annotations

import argparse
import gzip
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

INDIVIDUAL_DIR = Path("data/individual")
SINGLE_POLYGON_TYPES = frozenset(
    {
        "urban_area",
        "district",
        "face",
        "metropolitan_area",
    }
)
MAX_LISTED_ISSUES = 20


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--individual-dir",
        type=Path,
        default=INDIVIDUAL_DIR,
        help=f"Root directory with shape packages (default: {INDIVIDUAL_DIR})",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print every issue instead of only the first few per category",
    )
    return parser.parse_args()


def iter_shape_packages(root: Path) -> list[Path]:
    return sorted(root.rglob("*.geojson.gz"))


def load_shape_package(path: Path) -> dict[str, Any]:
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        return json.load(handle)


def polygon_parts_and_holes(geometry: dict[str, Any]) -> tuple[int, int]:
    geom_type = geometry.get("type")
    coordinates = geometry.get("coordinates")

    if geom_type == "Polygon":
        rings = coordinates or []
        return 1, max(0, len(rings) - 1)

    if geom_type == "MultiPolygon":
        polygons = coordinates or []
        parts = len(polygons)
        holes = sum(max(0, len(polygon) - 1) for polygon in polygons)
        return parts, holes

    return 0, 0


def relative_path(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def print_issues(title: str, issues: list[str], *, verbose: bool) -> None:
    if not issues:
        print(f"OK  {title}")
        return

    print(f"FAIL {title} ({len(issues)})")
    limit = len(issues) if verbose else min(len(issues), MAX_LISTED_ISSUES)
    for issue in issues[:limit]:
        print(f"  - {issue}")
    if not verbose and len(issues) > limit:
        print(f"  ... and {len(issues) - limit} more")


def run_checks(root: Path, *, verbose: bool) -> int:
    if not root.is_dir():
        print(f"Individual directory not found: {root}", file=sys.stderr)
        return 1

    shape_files = iter_shape_packages(root)
    if not shape_files:
        print(f"No shape packages found under {root}", file=sys.stderr)
        return 1

    missing_id: list[str] = []
    missing_hash: list[str] = []
    missing_metadata: list[str] = []
    missing_geometry: list[str] = []
    invalid_geometry_type: list[str] = []
    single_polygon_violations: list[str] = []
    duplicate_ids: list[str] = []
    duplicate_old_id_type: list[str] = []

    ids: dict[int, list[str]] = defaultdict(list)
    old_id_types: dict[tuple[int, str], list[str]] = defaultdict(list)

    for path in shape_files:
        label = relative_path(path, root)

        try:
            payload = load_shape_package(path)
        except (OSError, json.JSONDecodeError) as exc:
            missing_metadata.append(f"{label}: could not read package ({exc})")
            continue

        metadata = payload.get("metadata")
        feature = payload.get("feature")
        if not isinstance(metadata, dict):
            missing_metadata.append(f"{label}: missing metadata object")
            continue
        if not isinstance(feature, dict):
            missing_metadata.append(f"{label}: missing feature object")
            continue

        shape_id = metadata.get("id")
        shape_hash = metadata.get("hash")
        shape_type = metadata.get("type")
        old_id = metadata.get("old_id")
        name = metadata.get("name")

        if shape_id is None:
            missing_id.append(f"{label}: missing id ({shape_type!r}, {name!r})")
        else:
            ids[shape_id].append(label)

        if not shape_hash:
            missing_hash.append(f"{label}: missing hash ({shape_type!r}, id={shape_id!r})")

        if not shape_type:
            missing_metadata.append(f"{label}: missing metadata.type")
        if not name:
            missing_metadata.append(f"{label}: missing metadata.name")

        if old_id is not None and shape_type:
            old_id_types[(old_id, shape_type)].append(label)

        geometry = feature.get("geometry")
        if not geometry or not geometry.get("coordinates"):
            missing_geometry.append(f"{label}: missing geometry")
            continue

        parts, holes = polygon_parts_and_holes(geometry)
        if parts == 0:
            invalid_geometry_type.append(
                f"{label}: unsupported geometry type {geometry.get('type')!r}"
            )
            continue

        if shape_type in SINGLE_POLYGON_TYPES and (parts != 1 or holes != 0):
            single_polygon_violations.append(
                f"{label}: expected one polygon without holes, got {parts} part(s) and {holes} hole(s)"
            )

    for shape_id, paths in sorted(ids.items()):
        if len(paths) > 1:
            duplicate_ids.append(f"id {shape_id}: {', '.join(paths)}")

    for key, paths in sorted(old_id_types.items()):
        if len(paths) > 1:
            old_id, shape_type = key
            duplicate_old_id_type.append(
                f"(old_id={old_id}, type={shape_type!r}): {', '.join(paths)}"
            )

    print(f"Checked {len(shape_files)} shape packages under {root}/")
    print()

    issue_groups = [
        ("metadata structure", missing_metadata),
        ("ids are set", missing_id),
        ("hashes are set", missing_hash),
        ("ids are unique", duplicate_ids),
        ("(old_id, type) is unique when old_id is set", duplicate_old_id_type),
        ("geometry is present", missing_geometry),
        ("geometry type is supported", invalid_geometry_type),
        (
            "urban areas, districts, faces, and metro are single polygons without holes",
            single_polygon_violations,
        ),
    ]

    failures = 0
    for title, issues in issue_groups:
        print_issues(title, issues, verbose=verbose)
        failures += len(issues)

    print()
    if failures:
        print(f"Found {failures} issue(s).")
        return 1

    print("All checks passed.")
    return 0


def main() -> None:
    args = parse_args()
    raise SystemExit(run_checks(args.individual_dir, verbose=args.verbose))


if __name__ == "__main__":
    main()
