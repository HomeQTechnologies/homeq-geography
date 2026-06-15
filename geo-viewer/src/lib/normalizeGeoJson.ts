export function normalizeGeoJsonToFeatures(geoJson: unknown): GeoJSON.Feature[] {
  if (!geoJson || typeof geoJson !== "object") return [];

  const data = geoJson as GeoJSON.GeoJSON;

  if (data.type === "Feature") {
    return [data];
  }

  if (data.type === "FeatureCollection") {
    return data.features ?? [];
  }

  if ("coordinates" in data) {
    return [{ type: "Feature", properties: {}, geometry: data as GeoJSON.Geometry }];
  }

  return [];
}

export function toFeatureCollection(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features };
}
