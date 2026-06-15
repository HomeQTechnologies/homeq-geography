import { normalizeGeoJsonToFeatures, toFeatureCollection } from "./normalizeGeoJson";

export function buildMeshReferenceOverlay(geoJson: GeoJSON.GeoJSON | undefined): GeoJSON.FeatureCollection | null {
  if (!geoJson) return null;

  const features = normalizeGeoJsonToFeatures(geoJson);
  if (features.length === 0) return null;

  return toFeatureCollection(features);
}
