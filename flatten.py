#!/usr/bin/env python3
"""Split all GeoJSON feature collections into one file per feature.

This is a convenience entry point that runs all type-specific flatten scripts:
  - flatten_state_counties_municipalities.py
  - flatten_districts.py
  - flatten_urban_areas.py
"""

from flatten_districts import main as flatten_districts
from flatten_state_counties_municipalities import main as flatten_state_counties_municipalities
from flatten_urban_areas import main as flatten_urban_areas


def main() -> None:
    flatten_state_counties_municipalities()
    print()
    flatten_districts()
    print()
    flatten_urban_areas()


if __name__ == "__main__":
    main()
