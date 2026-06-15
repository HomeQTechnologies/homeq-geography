import type { GeoSearchSuggestion } from "../lib/types";

export interface LoadedMeshReference {
  suggestion: GeoSearchSuggestion;
  geoInfo?: GeoJSON.GeoJSON;
  isLoading: boolean;
  error?: string;
}
