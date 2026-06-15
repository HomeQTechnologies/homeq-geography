import { featureCollection } from "@turf/helpers";
import union from "@turf/union";

function isPolygonGeometry(
  geometry: GeoJSON.Geometry | null | undefined,
): geometry is GeoJSON.Polygon | GeoJSON.MultiPolygon {
  return geometry?.type === "Polygon" || geometry?.type === "MultiPolygon";
}

function isValidPolygonCoordinates(coordinates: GeoJSON.Polygon["coordinates"]): boolean {
  return coordinates.some(ring => Array.isArray(ring) && ring.length >= 4);
}

function flattenPolygonFeatures(features: GeoJSON.Feature[]): GeoJSON.Feature<GeoJSON.Polygon>[] {
  const polygonFeatures: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

  for (const feature of features) {
    if (!isPolygonGeometry(feature.geometry)) continue;

    if (feature.geometry.type === "Polygon") {
      if (!isValidPolygonCoordinates(feature.geometry.coordinates)) continue;
      polygonFeatures.push({
        type: "Feature",
        properties: { ...feature.properties },
        geometry: feature.geometry,
      });
      continue;
    }

    for (const coordinates of feature.geometry.coordinates) {
      if (!isValidPolygonCoordinates(coordinates)) continue;
      polygonFeatures.push({
        type: "Feature",
        properties: { ...feature.properties },
        geometry: {
          type: "Polygon",
          coordinates,
        },
      });
    }
  }

  return polygonFeatures;
}

export function unionPolygonFeatures(features: GeoJSON.Feature[]): GeoJSON.Feature | null {
  const polygonFeatures = flattenPolygonFeatures(features);
  if (polygonFeatures.length < 2) return null;

  try {
    const collection = featureCollection(polygonFeatures);
    if (!collection?.features?.length || collection.features.length < 2) {
      return null;
    }

    const result = union(collection);
    if (!result?.geometry || !isPolygonGeometry(result.geometry)) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}

export function canUnionPolygonFeatures(features: GeoJSON.Feature[]): boolean {
  return flattenPolygonFeatures(features).length >= 2;
}
