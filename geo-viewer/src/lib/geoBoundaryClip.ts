import area from "@turf/area";
import { featureCollection } from "@turf/helpers";
import intersect from "@turf/intersect";
import { featuresToMultiPolygon } from "./shapeExport";
import { normalizeGeoJsonToFeatures } from "./normalizeGeoJson";

const AREA_TOLERANCE_RATIO = 0.001;
const COVERAGE_TOLERANCE_RATIO = 0.002;
const CLIP_UNCHANGED_AREA_TOLERANCE_SQM = 1;
const MIN_AREA_TOLERANCE_SQM = 1;

function isPointInPolygonRing(point: GeoJSON.Position, ring: GeoJSON.Position[]): boolean {
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const xi = ring[index]?.[0];
    const yi = ring[index]?.[1];
    const xj = ring[previous]?.[0];
    const yj = ring[previous]?.[1];
    if (xi === undefined || yi === undefined || xj === undefined || yj === undefined) continue;

    const intersects =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

export function isPositionInsideBoundary(
  position: GeoJSON.Position,
  boundary: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
): boolean {
  const geometry = boundary.geometry;

  if (geometry.type === "Polygon") {
    const outerRing = geometry.coordinates[0] ?? [];
    if (!isPointInPolygonRing(position, outerRing)) return false;

    for (let holeIndex = 1; holeIndex < geometry.coordinates.length; holeIndex += 1) {
      if (isPointInPolygonRing(position, geometry.coordinates[holeIndex] ?? [])) return false;
    }

    return true;
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some(polygon => {
      const outerRing = polygon[0] ?? [];
      if (!isPointInPolygonRing(position, outerRing)) return false;

      for (let holeIndex = 1; holeIndex < polygon.length; holeIndex += 1) {
        if (isPointInPolygonRing(position, polygon[holeIndex] ?? [])) return false;
      }

      return true;
    });
  }

  return false;
}

export function areaTolerance(totalAreaSqM: number): number {
  return Math.max(totalAreaSqM * AREA_TOLERANCE_RATIO, MIN_AREA_TOLERANCE_SQM);
}

export function coverageAreaTolerance(referenceAreaSqM: number): number {
  return Math.max(referenceAreaSqM * COVERAGE_TOLERANCE_RATIO, MIN_AREA_TOLERANCE_SQM);
}

export function clipUnchangedAreaTolerance(): number {
  return CLIP_UNCHANGED_AREA_TOLERANCE_SQM;
}

export function isReferenceFullyCovered(
  uncoveredAreaSqM: number,
  referenceAreaSqM: number,
): boolean {
  if (referenceAreaSqM <= 0) return false;

  const tolerance = coverageAreaTolerance(referenceAreaSqM);
  if (uncoveredAreaSqM <= tolerance) return true;

  const coverageRatio = 1 - uncoveredAreaSqM / referenceAreaSqM;
  return coverageRatio >= 1 - COVERAGE_TOLERANCE_RATIO;
}

function isPolygonGeometry(
  geometry: GeoJSON.Geometry | null | undefined,
): geometry is GeoJSON.Polygon | GeoJSON.MultiPolygon {
  return geometry?.type === "Polygon" || geometry?.type === "MultiPolygon";
}

function toPolygonFeature(geoJson: GeoJSON.GeoJSON): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  const geometry = featuresToMultiPolygon(normalizeGeoJsonToFeatures(geoJson));
  if (!geometry || geometry.coordinates.length === 0) return null;

  return {
    type: "Feature",
    properties: {},
    geometry,
  };
}

export function geoJsonToBoundaryFeature(
  geoJson: GeoJSON.GeoJSON,
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  return toPolygonFeature(geoJson);
}

export function clipFeatureToBoundary(
  feature: GeoJSON.Feature,
  boundary: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
): GeoJSON.Feature | null {
  if (!isPolygonGeometry(feature.geometry)) return null;

  const clipped = intersect(featureCollection([boundary, feature]));
  if (!clipped || !isPolygonGeometry(clipped.geometry)) return null;

  return clipped;
}

export function featureAreaSqM(feature: GeoJSON.Feature | null | undefined): number {
  if (!feature || !isPolygonGeometry(feature.geometry)) return 0;
  return area(feature);
}
