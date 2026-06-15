import { getShapeFragments, type ShapeFragment } from "./shapeFragments";
import type { SelectedGeoShape } from "./types";

export function getEditFeatureId(shapeId: string, fragmentIndex: number): string {
  return `edit-${shapeId.replace(/\./g, "-")}-${fragmentIndex}`;
}

export function toEditableDrawFeatures(fragments: ShapeFragment[]): GeoJSON.Feature[] {
  return fragments.map(fragment => {
    const shapeId = String(fragment.feature.properties?.shapeId ?? "");
    return {
      ...fragment.feature,
      id: getEditFeatureId(shapeId, fragment.index),
    };
  });
}

function stripEditProperties(properties: GeoJSON.GeoJsonProperties): GeoJSON.GeoJsonProperties {
  if (!properties || typeof properties !== "object") return {};

  const { shapeId: _shapeId, fragmentIndex: _fragmentIndex, ...rest } = properties as Record<string, unknown>;
  return rest;
}

function fragmentsToGeoJson(fragments: ShapeFragment[]): GeoJSON.GeoJSON {
  const polygonFeatures = fragments.map(fragment => ({
    type: "Feature" as const,
    properties: stripEditProperties(fragment.feature.properties),
    geometry: fragment.feature.geometry,
  }));

  if (polygonFeatures.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  if (polygonFeatures.length === 1) {
    return polygonFeatures[0];
  }

  return {
    type: "Feature",
    properties: polygonFeatures[0].properties ?? {},
    geometry: {
      type: "MultiPolygon",
      coordinates: polygonFeatures.map(feature => feature.geometry.coordinates),
    },
  };
}

export function applyDrawEditsToShapeGeoInfo(
  shape: SelectedGeoShape,
  editedFeatures: GeoJSON.Feature[],
): { geoInfo: GeoJSON.GeoJSON; editedFragmentIndices: number[] } {
  if (!shape.geoInfo) {
    throw new Error("Cannot apply geometry edits without loaded GeoJSON.");
  }

  const allFragments = getShapeFragments(shape);
  const editedGeometryByIndex = new Map<number, GeoJSON.Polygon>();

  for (const feature of editedFeatures) {
    const fragmentIndex = feature.properties?.fragmentIndex;
    if (typeof fragmentIndex !== "number" || feature.geometry?.type !== "Polygon") continue;
    editedGeometryByIndex.set(fragmentIndex, feature.geometry);
  }

  const editedFragmentIndices = [...editedGeometryByIndex.keys()];

  if (editedFragmentIndices.length === 0) {
    return { geoInfo: shape.geoInfo, editedFragmentIndices: [] };
  }

  const mergedFragments = allFragments.map(fragment => {
    const editedGeometry = editedGeometryByIndex.get(fragment.index);
    if (!editedGeometry) return fragment;

    return {
      ...fragment,
      feature: {
        ...fragment.feature,
        geometry: editedGeometry,
      },
      ringCount: editedGeometry.coordinates.length,
      hasHoles: editedGeometry.coordinates.length > 1,
    };
  });

  return {
    geoInfo: fragmentsToGeoJson(mergedFragments),
    editedFragmentIndices,
  };
}
