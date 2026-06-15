import math
from collections import namedtuple


class Rect:

    def __init__(self, top, left, bottom, right):
        self.top = top
        self.left = left
        self.bottom = bottom
        self.right = right

    def get_tiles(self, zoom: int):
        # Get the tile coordinates for the bounding corners
        t1 = Point(self.top, self.left).to_tile(zoom)
        t2 = Point(self.bottom, self.right).to_tile(zoom)

        # Determine the range of tiles by finding the min and max x and y
        x_min, x_max = min(t1.x, t2.x), max(t1.x, t2.x)
        y_min, y_max = min(t1.y, t2.y), max(t1.y, t2.y)

        # Generate all tile (x, y) coordinates within the viewport
        tiles = []
        for x in range(x_min, x_max + 1):
            for y in range(y_min, y_max + 1):
                tiles.append(Tile(x, y, zoom))

        return tiles

    def __repr__(self):
        return f"Rect(top={self.top}, left={self.left}, bottom={self.bottom}, right={self.right})"


class Tile:

    def __init__(self, x, y, zoom):
        self.x = x
        self.y = y
        self.z = zoom

    def to_rect(self) -> Rect:
        alon1 = (self.x / pow(2.0, self.z)) * 360.0 - 180.0
        alon2 = ((self.x + 1) / pow(2.0, self.z)) * 360.0 - 180.0

        an = math.pi - 2.0 * math.pi * self.y / pow(2.0, self.z)
        alat1 = 180.0 / math.pi * math.atan(0.5 * (math.exp(an) - math.exp(-an)))

        an = math.pi - 2.0 * math.pi * (self.y + 1) / pow(2.0, self.z)
        alat2 = 180.0 / math.pi * math.atan(0.5 * (math.exp(an) - math.exp(-an)))

        return Rect(alat1, alon1, alat2, alon2)

    def add_neighbours(self, radius: int):
        # Get the range of tiles to search
        x_min, x_max = self.x - radius, self.x + radius
        y_min, y_max = self.y - radius, self.y + radius

        # Generate all tile (x, y) coordinates within the radius
        tiles = []
        for x in range(x_min, x_max + 1):
            for y in range(y_min, y_max + 1):
                tiles.append(Tile(x, y, self.z))

        return tiles

    def cache_key(self):
        return f"search:v4:tiles:{self.z}:{self.x}-{self.y}"

    def __gt__(self, other):
        return self.z > other.z or (
            self.z == other.z and (self.x > other.x or (self.x == other.x and self.y > other.y))
        )

    def __eq__(self, other):
        return self.x == other.x and self.y == other.y and self.z == other.z

    def __hash__(self):
        return hash((self.x, self.y, self.z))

    def __repr__(self):
        return f"Tile(x={self.x}, y={self.y}, z={self.z})"


class Point:

    def __init__(self, lat, lng):
        self.lat = lat
        self.lng = lng

    def to_tile(self, zoom: int) -> Tile:
        # tODO . check if this really should be allwoing two functions or if it always should floor as a
        #  point always falls within the same tile no matter what.
        # Convert latitude and longitude to radians
        lat_rad = math.radians(self.lat)
        lng_rad = math.radians(self.lng)

        # Calculate the number of tiles at this zoom level
        n = 2.0**zoom

        # Calculate x tile coordinate
        x = int((self.lng + 180.0) / 360.0 * n)

        # Calculate y tile coordinate
        y = int(((1.0 - math.log(math.tan(lat_rad) + (1 / math.cos(lat_rad))) / math.pi) / 2.0) * n)

        return Tile(x, y, zoom)

    def within(self, rect: Rect) -> bool:
        return rect.top >= self.lat >= rect.bottom and rect.left <= self.lng <= rect.right

    def distance(self, other: "Point") -> float:
        # Radius of the Earth in kilometers
        R = 6371.0

        # Convert latitude and longitude from degrees to radians
        lat1 = math.radians(self.lat)
        lon1 = math.radians(self.lng)
        lat2 = math.radians(other.lat)
        lon2 = math.radians(other.lng)

        # Differences in coordinates
        dlat = lat2 - lat1
        dlng = lon2 - lon1

        # Haversine formula
        a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

        # Distance in kilometers
        distance = R * c

        return distance

