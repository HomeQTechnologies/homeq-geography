import { normalizeGeoJsonShapeGroup, type GeoJsonShapeGroup } from "./geoJsonShapeGroups";
import type { LoadedGeoJsonFile } from "./loadedGeoJsonFiles";
import {
  isLoadedGeoJsonShapeMetadataByKey,
  type LoadedGeoJsonShapeMetadataByKey,
} from "./loadedGeoJsonShapeMetadata";

export const LOADED_GEOJSON_DRAFT_STORAGE_KEY = "homeq.geo-viewer.loaded-geojson";

export interface LoadedGeoJsonDraft {
  files: LoadedGeoJsonFile[];
  groups: GeoJsonShapeGroup[];
  shapeMetadata: LoadedGeoJsonShapeMetadataByKey;
}

export interface PersistedLoadedGeoJsonDraft extends LoadedGeoJsonDraft {
  savedAt: string;
}

function isGeometrySummary(value: unknown): value is Record<string, number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

  return Object.entries(value).every(
    ([key, count]) => typeof key === "string" && typeof count === "number" && Number.isFinite(count),
  );
}

function isGeoJsonFeature(value: unknown): value is GeoJSON.Feature {
  if (typeof value !== "object" || value === null) return false;

  const feature = value as GeoJSON.Feature;
  return feature.type === "Feature" && typeof feature.geometry === "object" && feature.geometry !== null;
}

function isGeoJson(value: unknown): value is GeoJSON.GeoJSON {
  if (typeof value !== "object" || value === null) return false;

  const geoJson = value as GeoJSON.GeoJSON;
  if (geoJson.type === "FeatureCollection") {
    return Array.isArray(geoJson.features) && geoJson.features.every(isGeoJsonFeature);
  }

  if (geoJson.type === "Feature") {
    return isGeoJsonFeature(geoJson);
  }

  return "coordinates" in geoJson || "geometries" in geoJson;
}

function isLoadedGeoJsonFile(value: unknown): value is LoadedGeoJsonFile {
  if (typeof value !== "object" || value === null) return false;

  const file = value as LoadedGeoJsonFile;
  return (
    typeof file.id === "string" &&
    typeof file.fileName === "string" &&
    isGeoJson(file.geoJson) &&
    Array.isArray(file.features) &&
    file.features.every(isGeoJsonFeature) &&
    isGeometrySummary(file.geometrySummary) &&
    typeof file.visible === "boolean"
  );
}

function isGeoJsonShapeGroup(value: unknown): value is GeoJsonShapeGroup {
  if (typeof value !== "object" || value === null) return false;

  const group = value as GeoJsonShapeGroup;
  return (
    typeof group.id === "string" &&
    typeof group.name === "string" &&
    Array.isArray(group.shapeKeys) &&
    group.shapeKeys.every(shapeKey => typeof shapeKey === "string") &&
    (group.color === undefined || typeof group.color === "string") &&
    (group.lineColor === undefined || typeof group.lineColor === "string") &&
    (group.unionFeature === undefined || isGeoJsonFeature(group.unionFeature))
  );
}

function isPersistedLoadedGeoJsonDraft(value: unknown): value is PersistedLoadedGeoJsonDraft {
  if (typeof value !== "object" || value === null) return false;

  const draft = value as PersistedLoadedGeoJsonDraft;
  return (
    Array.isArray(draft.files) &&
    draft.files.every(isLoadedGeoJsonFile) &&
    Array.isArray(draft.groups) &&
    draft.groups.every(isGeoJsonShapeGroup) &&
    (draft.shapeMetadata === undefined || isLoadedGeoJsonShapeMetadataByKey(draft.shapeMetadata)) &&
    typeof draft.savedAt === "string"
  );
}

export function toPersistedLoadedGeoJsonDraft(draft: LoadedGeoJsonDraft): PersistedLoadedGeoJsonDraft {
  return {
    ...draft,
    savedAt: new Date().toISOString(),
  };
}

export function loadLoadedGeoJsonDraft(): LoadedGeoJsonDraft {
  try {
    const raw = localStorage.getItem(LOADED_GEOJSON_DRAFT_STORAGE_KEY);
    if (!raw) {
      return { files: [], groups: [], shapeMetadata: {} };
    }

    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return {
        files: parsed.every(isLoadedGeoJsonFile) ? parsed : [],
        groups: [],
        shapeMetadata: {},
      };
    }

    if (!isPersistedLoadedGeoJsonDraft(parsed)) {
      return { files: [], groups: [], shapeMetadata: {} };
    }

    return {
      files: parsed.files,
      groups: parsed.groups.map((group, index) => normalizeGeoJsonShapeGroup(group, index)),
      shapeMetadata: isLoadedGeoJsonShapeMetadataByKey(parsed.shapeMetadata) ? parsed.shapeMetadata : {},
    };
  } catch {
    return { files: [], groups: [], shapeMetadata: {} };
  }
}

export function saveLoadedGeoJsonDraft(draft: LoadedGeoJsonDraft): void {
  if (draft.files.length === 0 && draft.groups.length === 0) {
    clearLoadedGeoJsonDraft();
    return;
  }

  localStorage.setItem(
    LOADED_GEOJSON_DRAFT_STORAGE_KEY,
    JSON.stringify(toPersistedLoadedGeoJsonDraft(draft)),
  );
}

export function clearLoadedGeoJsonDraft(): void {
  localStorage.removeItem(LOADED_GEOJSON_DRAFT_STORAGE_KEY);
}

export function hasLoadedGeoJsonDraft(): boolean {
  const draft = loadLoadedGeoJsonDraft();
  return draft.files.length > 0 || draft.groups.length > 0;
}
