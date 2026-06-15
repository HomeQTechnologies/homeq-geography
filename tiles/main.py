import json

from shapely import wkt
from shapely.geometry.geo import mapping
from shapely.geometry.polygon import Polygon

from geometry import Rect

with open('sweden.txt', 'r') as f:
    sweden = wkt.loads(f.read())  # Convert WKT to Shapely geometry

min_lng, min_lat, max_lng, max_lat = sweden.bounds


def geo_json_for_zoom(zoom):

    rect = Rect(max_lat, min_lng, min_lat, max_lng)
    tiles = rect.get_tiles(zoom)

    features = []
    for tile in tiles:

        rect = tile.to_rect()
        min_x, min_y, max_x, max_y = rect.left, rect.bottom, rect.right, rect.top
        # Create a Shapely Polygon for the tile
        polygon = Polygon(
            [(min_x, min_y), (max_x, min_y), (max_x, max_y), (min_x, max_y), (min_x, min_y)]  # Close the loop
        )

        if not polygon.intersection(sweden):
            continue

        # Convert to GeoJSON feature
        feature = {
            "type": "Feature",
            "geometry": mapping(polygon),  # Convert Shapely geometry to GeoJSON
            "properties": {"id": f"{tile.x}_{tile.y}_{tile.z}"},
        }
        features.append(feature)


    geojson = {"type": "FeatureCollection", "features": features}
    return geojson


for zoom in range(8, 12):
    with open(f'../sweden_tiles_z{zoom}.json', 'w') as f:
        geojson = geo_json_for_zoom(zoom)
        f.write(json.dumps(geojson))

