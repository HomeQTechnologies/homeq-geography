import { normalizeGeoJsonToFeatures, toFeatureCollection } from "./normalizeGeoJson";

export interface ParsedGeoJsonFile {
  geoJson: GeoJSON.GeoJSON;
  features: GeoJSON.Feature[];
  geometrySummary: Record<string, number>;
}

export type ParseGeoJsonFileResult =
  | { ok: true; data: ParsedGeoJsonFile }
  | { ok: false; error: string };

function summarizeGeometryTypes(features: GeoJSON.Feature[]): Record<string, number> {
  return features.reduce<Record<string, number>>((summary, feature) => {
    const type = feature.geometry?.type ?? "Unknown";
    summary[type] = (summary[type] ?? 0) + 1;
    return summary;
  }, {});
}

export function parseGeoJsonFileContent(content: string): ParseGeoJsonFileResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, error: "File is not valid JSON." };
  }

  const features = normalizeGeoJsonToFeatures(parsed).filter(feature => feature.geometry);
  if (features.length === 0) {
    return { ok: false, error: "No GeoJSON features with geometry were found." };
  }

  return {
    ok: true,
    data: {
      geoJson: toFeatureCollection(features),
      features,
      geometrySummary: summarizeGeometryTypes(features),
    },
  };
}

export function formatGeometrySummary(summary: Record<string, number>): string {
  return Object.entries(summary)
    .map(([type, count]) => `${count} ${type}${count === 1 ? "" : "s"}`)
    .join(" · ");
}
