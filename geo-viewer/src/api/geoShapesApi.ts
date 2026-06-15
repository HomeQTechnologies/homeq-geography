import axios from "axios";
import {
  mapGeoSuggestV4Results,
  type GeoSuggestV4Result,
} from "../lib/geoSuggestAdapter";
import type { GeoSearchSuggestion } from "../lib/types";
import type { GeoShapeV3 } from "../lib/v3ShapeAdapter";

const apiClient = axios.create();

export interface GeoShapeSearchRequest {
  query: string;
  shapeTypes?: string;
  showAll?: boolean;
  ignoreCache?: boolean;
  amount?: number;
}

export interface GeoShapeListRequest {
  shapeType: string;
  showAll?: boolean;
  ignoreCache?: boolean;
}

export interface GeoShapeV3ListResponse {
  shapes: Array<{
    id: number;
    main_id: number;
    type: string;
    text: string;
    hash: string;
    shape: string;
    parent?: { type: string; id: number; name: string };
  }>;
}

export async function searchGeoShapes({
  query,
  shapeTypes,
  showAll,
  ignoreCache,
  amount = 100,
}: GeoShapeSearchRequest): Promise<{ results: GeoSearchSuggestion[]; totalSuggestions: number }> {
  const { data } = await apiClient.get<{ results: GeoSuggestV4Result[]; total_suggestions?: number }>(
    "/api/v4/geo/suggest/",
    {
      params: {
        query,
        amount,
        ...(shapeTypes ? { shape_types: shapeTypes } : {}),
        ...(showAll ? { show_all: "1" } : {}),
        ...(ignoreCache ? { ignore_cache: "1" } : {}),
      },
      ...(ignoreCache ? { headers: { "Cache-Control": "no-store" } } : {}),
    },
  );

  return {
    results: mapGeoSuggestV4Results(data.results ?? []),
    totalSuggestions: data.total_suggestions ?? data.results?.length ?? 0,
  };
}

export async function listGeoShapesByType({
  shapeType,
  showAll,
  ignoreCache,
}: GeoShapeListRequest): Promise<GeoShapeV3ListResponse> {
  const { data } = await apiClient.get<GeoShapeV3ListResponse>("/api/v3/geo/shapes", {
    params: {
      shape_type: shapeType,
      ...(showAll ? { show_all: "1" } : {}),
      ...(ignoreCache ? { ignore_cache: "1" } : {}),
    },
    ...(ignoreCache ? { headers: { "Cache-Control": "no-store" } } : {}),
  });

  return data;
}

export type { GeoShapeV3 };
