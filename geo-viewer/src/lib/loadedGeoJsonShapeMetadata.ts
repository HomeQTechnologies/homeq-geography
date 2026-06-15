import { extractShapesFromFeatures } from "./extractGeoJsonShapes";
import { getShapeKey } from "./geoJsonShapeGroups";
import type { LoadedGeoJsonFile } from "./loadedGeoJsonFiles";

export interface LoadedGeoJsonShapeMetadata {
  description: string;
}

export type LoadedGeoJsonShapeMetadataByKey = Record<string, LoadedGeoJsonShapeMetadata>;

const DESCRIPTION_PROPERTY_KEYS = ["description", "DESCRIPTION", "desc", "notes", "NOTES"];

export function getDefaultShapeDescription(feature: GeoJSON.Feature): string {
  const properties = feature.properties;
  if (!properties || typeof properties !== "object") return "";

  for (const key of DESCRIPTION_PROPERTY_KEYS) {
    const value = properties[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

export function getShapeDescription(
  metadataByKey: LoadedGeoJsonShapeMetadataByKey,
  shapeKey: string,
): string {
  return metadataByKey[shapeKey]?.description ?? "";
}

export function setShapeDescription(
  metadataByKey: LoadedGeoJsonShapeMetadataByKey,
  shapeKey: string,
  description: string,
): LoadedGeoJsonShapeMetadataByKey {
  return {
    ...metadataByKey,
    [shapeKey]: { description },
  };
}

export function buildShapeMetadataForFile(
  file: LoadedGeoJsonFile,
  existing: LoadedGeoJsonShapeMetadataByKey = {},
): LoadedGeoJsonShapeMetadataByKey {
  const shapes = extractShapesFromFeatures(file.features);
  let next = { ...existing };

  for (const shape of shapes) {
    const shapeKey = getShapeKey(file.id, shape.featureIndex, shape.shapeIndex);
    if (next[shapeKey]) continue;

    next = setShapeDescription(next, shapeKey, getDefaultShapeDescription(shape.feature));
  }

  return next;
}

export function buildShapeMetadataForLoadedFiles(
  files: LoadedGeoJsonFile[],
  existing: LoadedGeoJsonShapeMetadataByKey = {},
): LoadedGeoJsonShapeMetadataByKey {
  return files.reduce(
    (metadata, file) => buildShapeMetadataForFile(file, metadata),
    existing,
  );
}

export function pruneShapeMetadata(
  metadataByKey: LoadedGeoJsonShapeMetadataByKey,
  validShapeKeys: Set<string>,
): LoadedGeoJsonShapeMetadataByKey {
  const next: LoadedGeoJsonShapeMetadataByKey = {};

  for (const [shapeKey, metadata] of Object.entries(metadataByKey)) {
    if (validShapeKeys.has(shapeKey)) {
      next[shapeKey] = metadata;
    }
  }

  return next;
}

export function isLoadedGeoJsonShapeMetadata(value: unknown): value is LoadedGeoJsonShapeMetadata {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as LoadedGeoJsonShapeMetadata).description === "string"
  );
}

export function isLoadedGeoJsonShapeMetadataByKey(
  value: unknown,
): value is LoadedGeoJsonShapeMetadataByKey {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

  return Object.values(value).every(isLoadedGeoJsonShapeMetadata);
}
