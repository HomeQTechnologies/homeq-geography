#!/usr/bin/env bash
python3 refine_goteborg_edge_split.py \
  --mesh data/meshes/goteborg.step2.mesh.json \
  --face "Södra Skärgården" \
  --face "Hjuvik" \
  --face "Långedrag" \
  --face "Näset" \
  --face "Billdal" \
  --face "Nolered" \
  --face "Björlanda" \
  --face "Arendal" \
  --max-splits-per-edge 2 \
  --min-split-improvement 0.02 \
  --output data/meshes/goteborg.step3.mesh.json