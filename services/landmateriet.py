#!/usr/bin/env python3
"""
Fetch data from Lantmäteriet STAC vector API.

Endpoint:
https://api.lantmateriet.se/stac-vektor/v1

Usage:
  python fetch_lantmateriet_stac.py
  python fetch_lantmateriet_stac.py --collections
  python fetch_lantmateriet_stac.py --collection <collection_id>
  python fetch_lantmateriet_stac.py --collection <collection_id> --limit 10
  python fetch_lantmateriet_stac.py --collection <collection_id> --download-assets
"""

import argparse
import json
import os
from pathlib import Path
from urllib.parse import urljoin

import requests


BASE_URL = "https://api.lantmateriet.se/stac-vektor/v1/"

import os
from requests.auth import HTTPBasicAuth

LANTMATERIET_USERNAME = os.environ.get('LANTMATERIET_USERNAME', 'sheepsy90@gmail.com')
LANTMATERIET_PASSWORD = os.environ.get('LANTMATERIET_PASSWORD', 'broth-fractal-arose-digs-handsfree-alongside')

if not LANTMATERIET_USERNAME or not LANTMATERIET_PASSWORD:
    raise ValueError("Please configure landmäteriet access credentials.")

def get_auth():
    return HTTPBasicAuth(LANTMATERIET_USERNAME, LANTMATERIET_PASSWORD)

def get_json(url: str, params: dict | None = None) -> dict:
    response = requests.get(
        url,
        params=params,
        auth=get_auth(),
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def download_file(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)

    with requests.get(
        url,
        stream=True,
        auth=get_auth(),
        timeout=60,
    ) as response:
        response.raise_for_status()
        with destination.open("wb") as file:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    file.write(chunk)

def save_json(data: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def fetch_catalog(output_dir: Path) -> dict:
    catalog = get_json(BASE_URL)
    save_json(catalog, output_dir / "catalog.json")
    return catalog


def fetch_collections(output_dir: Path) -> dict:
    url = urljoin(BASE_URL, "collections")
    collections = get_json(url)
    save_json(collections, output_dir / "collections.json")
    return collections


def fetch_collection_items(collection_id: str, output_dir: Path, limit: int = 100) -> dict:
    url = urljoin(BASE_URL, f"collections/{collection_id}/items")
    items = get_json(url, params={"limit": limit})
    save_json(items, output_dir / f"{collection_id}_items.json")
    return items


def download_assets(items: dict, output_dir: Path) -> None:
    features = items.get("features", [])

    for feature in features:
        item_id = feature.get("id", "unknown-item")
        assets = feature.get("assets", {})

        for asset_name, asset in assets.items():
            href = asset.get("href")
            if not href:
                continue

            filename = href.split("/")[-1].split("?")[0] or f"{asset_name}.dat"
            destination = output_dir / "assets" / item_id / filename

            print(f"Downloading {asset_name} from item {item_id}")
            print(f"  {href}")
            download_file(href, destination)
            print(f"  saved to {destination}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch metadata and assets from Lantmäteriet STAC vector API."
    )
    parser.add_argument(
        "--output-dir",
        default="lantmateriet_stac_data",
        help="Directory where JSON and downloaded assets will be saved.",
    )
    parser.add_argument(
        "--collections",
        action="store_true",
        help="List available collections.",
    )
    parser.add_argument(
        "--collection",
        help="Fetch items for a specific collection ID.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=100,
        help="Maximum number of items to fetch from a collection.",
    )
    parser.add_argument(
        "--download-assets",
        action="store_true",
        help="Download asset files referenced by fetched STAC items.",
    )

    args = parser.parse_args()
    output_dir = Path(args.output_dir)

    print("Fetching STAC catalog...")
    catalog = fetch_catalog(output_dir)
    print(f"Catalog title: {catalog.get('title', 'N/A')}")

    collections = fetch_collections(output_dir)

    if args.collections or not args.collection:
        print("\nAvailable collections:")
        for collection in collections.get("collections", []):
            collection_id = collection.get("id")
            title = collection.get("title", "")
            print(f"  {collection_id} - {title}")

    if args.collection:
        print(f"\nFetching items for collection: {args.collection}")
        items = fetch_collection_items(args.collection, output_dir, limit=args.limit)

        features = items.get("features", [])
        print(f"Fetched {len(features)} item(s).")
        print(f"Saved metadata to: {output_dir / f'{args.collection}_items.json'}")

        if args.download_assets:
            download_assets(items, output_dir)

    print(f"\nDone. Output saved in: {output_dir.resolve()}")


if __name__ == "__main__":
    main()