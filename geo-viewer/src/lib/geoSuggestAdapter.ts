import type { GeoSearchSuggestion } from "./types";

export interface GeoSuggestV4Result {
  id: number;
  name: string;
  type: string;
  hash: string;
  shape_uri: string;
  legacy_key?: string;
  parent?: { id: number; name: string; type?: string; legacy_key?: string };
  postal_code?: string;
}

export function mapGeoSuggestV4ToLegacy(suggestion: GeoSuggestV4Result): GeoSearchSuggestion {
  const id = suggestion.legacy_key ?? `${suggestion.type}.${suggestion.id}`;
  return {
    id,
    text: suggestion.name,
    hash: suggestion.hash,
    shapeUri: suggestion.shape_uri,
    parent: suggestion.parent?.name ? { name: suggestion.parent.name } : undefined,
    postalCode: suggestion.postal_code,
  };
}

export function mapGeoSuggestV4Results(results: GeoSuggestV4Result[]): GeoSearchSuggestion[] {
  return results.map(mapGeoSuggestV4ToLegacy);
}
