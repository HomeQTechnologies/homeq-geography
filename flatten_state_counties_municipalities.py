#!/usr/bin/env python3
"""Split state, county, and municipality GeoJSON into individual shape packages."""

from flatten_lib import STATE_COUNTIES_MUNICIPALITIES_SOURCES, run_flatten


def main() -> None:
    run_flatten(STATE_COUNTIES_MUNICIPALITIES_SOURCES)


if __name__ == "__main__":
    main()
