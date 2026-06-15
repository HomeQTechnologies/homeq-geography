import area from "@turf/area";
import bbox from "@turf/bbox";
import md5 from "js-md5";
import type { ShapeDrawMetadata, ShapeExportType } from "./shapeDrawTypes";

/** Exact values from the draw form, preserved in the export file. */
export type ShapeExportInput = ShapeDrawMetadata;

export interface ShapeExportMetadata {
  hash: string;
  type: ShapeExportType;
  name: string;
  postal_code: string | null;
  is_public: boolean;
  notes: string;
  min_latitude: number;
  max_latitude: number;
  min_longitude: number;
  max_longitude: number;
  square_km: number;
}

export interface ShapeExportPayload {
  input: ShapeExportInput;
  metadata: ShapeExportMetadata;
  geoJson: GeoJSON.Feature<GeoJSON.MultiPolygon>;
}

export interface ShapeExportValidation {
  valid: boolean;
  errors: string[];
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(6));
}

function roundArea(value: number): number {
  return Number(value.toFixed(4));
}

export function featuresToMultiPolygon(features: GeoJSON.Feature[]): GeoJSON.MultiPolygon | null {
  const coordinates: GeoJSON.MultiPolygon["coordinates"] = [];

  for (const feature of features) {
    const geometry = feature.geometry;
    if (!geometry) continue;

    if (geometry.type === "Polygon") {
      coordinates.push(geometry.coordinates);
      continue;
    }

    if (geometry.type === "MultiPolygon") {
      coordinates.push(...geometry.coordinates);
    }
  }

  if (coordinates.length === 0) return null;

  return {
    type: "MultiPolygon",
    coordinates,
  };
}

export function buildAwsGeoJsonFeature(
  geometry: GeoJSON.MultiPolygon,
): GeoJSON.Feature<GeoJSON.MultiPolygon> {
  return {
    type: "Feature",
    properties: {},
    geometry,
  };
}

export function generateShapeHash(
  metadata: ShapeDrawMetadata,
  geometry: GeoJSON.MultiPolygon,
): string {
  return md5(
    JSON.stringify({
      name: metadata.name.trim(),
      type: metadata.type,
      isPublic: metadata.isPublic,
      notes: metadata.notes,
      geometry,
      nonce: crypto.randomUUID(),
    }),
  );
}

export function validateShapeDrawMetadata(metadata: ShapeDrawMetadata): ShapeExportValidation {
  const errors: string[] = [];
  const name = metadata.name.trim();

  if (!name) {
    errors.push("Name is required.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateShapeDrawExport(
  metadata: ShapeDrawMetadata,
  features: GeoJSON.Feature[],
): ShapeExportValidation {
  const metadataValidation = validateShapeDrawMetadata(metadata);
  const errors = [...metadataValidation.errors];
  const geometry = featuresToMultiPolygon(features);

  if (!geometry || geometry.coordinates.length === 0) {
    errors.push("Draw at least one polygon on the map.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function buildShapeExportPayload(
  metadata: ShapeDrawMetadata,
  features: GeoJSON.Feature[],
): ShapeExportPayload {
  const validation = validateShapeDrawExport(metadata, features);
  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }

  const geometry = featuresToMultiPolygon(features);
  if (!geometry) {
    throw new Error("Draw at least one polygon on the map.");
  }

  const feature = buildAwsGeoJsonFeature(geometry);
  const [minLng, minLat, maxLng, maxLat] = bbox(feature);
  const hash = generateShapeHash(metadata, geometry);

  return {
    input: {
      name: metadata.name,
      type: metadata.type,
      isPublic: metadata.isPublic,
      notes: metadata.notes,
    },
    metadata: {
      hash,
      type: metadata.type,
      name: metadata.name.trim(),
      postal_code: null,
      is_public: metadata.isPublic,
      notes: metadata.notes,
      min_latitude: roundCoordinate(minLat),
      max_latitude: roundCoordinate(maxLat),
      min_longitude: roundCoordinate(minLng),
      max_longitude: roundCoordinate(maxLng),
      square_km: roundArea(area(feature) / 1_000_000),
    },
    geoJson: feature,
  };
}

export function downloadJsonFile(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadShapePackage(metadata: ShapeDrawMetadata, features: GeoJSON.Feature[]): void {
  const payload = buildShapeExportPayload(metadata, features);
  const filename = `${payload.metadata.hash}.shape.json`;
  downloadJsonFile(filename, payload);
}
