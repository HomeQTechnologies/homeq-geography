import gzip
import json
import os
from pathlib import Path
names = []
metadatas = []
for root, _dirs, files in os.walk('data/individual/urban_areas'):
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


        old_id = metadata.get("old_id")
        shape_type = metadata.get("type") or ""
        shape_name = metadata.get("name") or ""

        if not metadata['id']:
            names.append(metadata['name'])

            metadatas.append(metadata)
            metadata['rel_path'] = rel_path

sorted_metadata = sorted(metadatas, key=lambda e: e['name'])

for e in sorted_metadata:
    print(e)

print(names)