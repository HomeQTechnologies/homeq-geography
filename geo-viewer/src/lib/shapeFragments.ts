import { normalizeGeoJsonToFeatures } from "./normalizeGeoJson";
import type { SelectedGeoShape } from "./types";

export interface ShapeFragment {
  index: number;
  feature: GeoJSON.Feature<GeoJSON.Polygon>;
  ringCount: number;
  hasHoles: boolean;
}

export interface ShapeHoleRef {
  fragmentIndex: number;
  /** 0-based index among interior rings (first hole = 0). */
  holeIndex: number;
}

export interface FocusedShapeFragment {
  shapeId: string;
  /** When omitted, the whole shape (all visible parts) is focused. */
  fragmentIndex?: number;
}

export function getHoleKey(fragmentIndex: number, holeIndex: number): string {
  return `${fragmentIndex}:${holeIndex}`;
}

export function parseHoleKey(key: string): ShapeHoleRef | null {
  const [fragmentIndexRaw, holeIndexRaw] = key.split(":");
  const fragmentIndex = Number(fragmentIndexRaw);
  const holeIndex = Number(holeIndexRaw);
  if (!Number.isInteger(fragmentIndex) || !Number.isInteger(holeIndex) || holeIndex < 0) {
    return null;
  }
  return { fragmentIndex, holeIndex };
}

function polygonFragmentFeature(
  shapeId: string,
  fragmentIndex: number,
  coordinates: GeoJSON.Polygon["coordinates"],
  properties: GeoJSON.GeoJsonProperties = {},
): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    type: "Feature",
    properties: {
      ...properties,
      shapeId,
      fragmentIndex,
    },
    geometry: {
      type: "Polygon",
      coordinates,
    },
  };
}

/** Split normalized GeoJSON into selectable polygon parts (MultiPolygon members). */
export function extractFragmentsFromGeoJson(
  geoJson: GeoJSON.GeoJSON,
  shapeId: string,
): ShapeFragment[] {
  const features = normalizeGeoJsonToFeatures(geoJson);
  const fragments: ShapeFragment[] = [];
  let index = 0;

  for (const feature of features) {
    const geometry = feature.geometry;
    if (!geometry) continue;

    if (geometry.type === "MultiPolygon") {
      for (const polygonCoords of geometry.coordinates) {
        fragments.push({
          index,
          feature: polygonFragmentFeature(shapeId, index, polygonCoords, feature.properties),
          ringCount: polygonCoords.length,
          hasHoles: polygonCoords.length > 1,
        });
        index += 1;
      }
      continue;
    }

    if (geometry.type === "Polygon") {
      fragments.push({
        index,
        feature: polygonFragmentFeature(shapeId, index, geometry.coordinates, feature.properties),
        ringCount: geometry.coordinates.length,
        hasHoles: geometry.coordinates.length > 1,
      });
      index += 1;
    }
  }

  return fragments;
}

export function getShapeFragments(shape: SelectedGeoShape): ShapeFragment[] {
  if (!shape.geoInfo) return [];
  return extractFragmentsFromGeoJson(shape.geoInfo, shape.id);
}

export function getClosedHoleKeys(shape: SelectedGeoShape): Set<string> {
  return new Set((shape.closedHoles ?? []).map(hole => getHoleKey(hole.fragmentIndex, hole.holeIndex)));
}

export function isHoleClosed(
  shape: SelectedGeoShape,
  fragmentIndex: number,
  holeIndex: number,
): boolean {
  return getClosedHoleKeys(shape).has(getHoleKey(fragmentIndex, holeIndex));
}

function applyClosedHoles(fragment: ShapeFragment, closedHoleKeys: Set<string>): ShapeFragment {
  if (!fragment.hasHoles) return fragment;

  const coordinates = fragment.feature.geometry.coordinates;
  const exterior = coordinates[0];
  const openHoles = coordinates.slice(1).filter(
    (_, holeIndex) => !closedHoleKeys.has(getHoleKey(fragment.index, holeIndex)),
  );

  if (openHoles.length === coordinates.length - 1) {
    return fragment;
  }

  const nextCoordinates = openHoles.length > 0 ? [exterior, ...openHoles] : [exterior];

  return {
    index: fragment.index,
    feature: polygonFragmentFeature(
      fragment.feature.properties?.shapeId as string,
      fragment.index,
      nextCoordinates,
      fragment.feature.properties,
    ),
    ringCount: nextCoordinates.length,
    hasHoles: openHoles.length > 0,
  };
}

export function getVisibleFragments(shape: SelectedGeoShape): ShapeFragment[] {
  const hiddenFragments = new Set(shape.hiddenFragmentIndices ?? []);
  const closedHoleKeys = getClosedHoleKeys(shape);

  return getShapeFragments(shape)
    .filter(fragment => !hiddenFragments.has(fragment.index))
    .map(fragment => applyClosedHoles(fragment, closedHoleKeys));
}

export function getFragmentLabel(fragment: ShapeFragment, openHoleCount?: number): string {
  const partNumber = fragment.index + 1;
  const holes = openHoleCount ?? (fragment.hasHoles ? fragment.ringCount - 1 : 0);

  if (holes > 0) {
    return `Part ${partNumber} (${holes} hole${holes === 1 ? "" : "s"})`;
  }
  return `Part ${partNumber}`;
}

export function getHoleLabel(holeIndex: number): string {
  return `Hole ${holeIndex + 1}`;
}

export function shapeHasExpandableDetails(shape: SelectedGeoShape): boolean {
  const fragments = getShapeFragments(shape);
  return fragments.length > 1 || fragments.some(fragment => fragment.hasHoles);
}

export function isFragmentFocused(
  focus: FocusedShapeFragment | null | undefined,
  shapeId: string,
  fragmentIndex: number,
): boolean {
  if (!focus || focus.shapeId !== shapeId) return false;
  if (focus.fragmentIndex === undefined) return true;
  return focus.fragmentIndex === fragmentIndex;
}
