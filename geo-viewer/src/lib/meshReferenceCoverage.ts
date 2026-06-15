import difference from "@turf/difference";
import { featureCollection } from "@turf/helpers";
import {
  featureAreaSqM,
  geoJsonToBoundaryFeature,
  isReferenceFullyCovered,
} from "./geoBoundaryClip";
import { meshFaceToFeature, type MeshDocument } from "./meshSubdivision";
import { unionPolygonFeatures } from "./unionPolygonFeatures";

export interface MeshReferenceCoverage {
  referenceAreaSqM: number;
  coveredAreaSqM: number;
  uncoveredAreaSqM: number;
  coveragePercent: number;
  fullyCoversReference: boolean;
}

function unionMeshFaceFeatures(features: GeoJSON.Feature[]): GeoJSON.Feature | null {
  if (features.length === 0) return null;
  if (features.length === 1) return features[0];
  return unionPolygonFeatures(features);
}

export function computeMeshReferenceCoverage(
  document: MeshDocument,
  referenceGeoJson: GeoJSON.GeoJSON,
): MeshReferenceCoverage | null {
  const boundary = geoJsonToBoundaryFeature(referenceGeoJson);
  if (!boundary) return null;

  const referenceAreaSqM = featureAreaSqM(boundary);
  if (referenceAreaSqM <= 0) return null;

  const meshFeatures = document.faces
    .filter(face => face.visible)
    .map(face => meshFaceToFeature(document, face))
    .filter((feature): feature is GeoJSON.Feature<GeoJSON.Polygon> => feature !== null);

  if (meshFeatures.length === 0) {
    return {
      referenceAreaSqM,
      coveredAreaSqM: 0,
      uncoveredAreaSqM: referenceAreaSqM,
      coveragePercent: 0,
      fullyCoversReference: false,
    };
  }

  const coveredUnion = unionMeshFaceFeatures(meshFeatures);
  if (!coveredUnion) {
    return {
      referenceAreaSqM,
      coveredAreaSqM: 0,
      uncoveredAreaSqM: referenceAreaSqM,
      coveragePercent: 0,
      fullyCoversReference: false,
    };
  }

  const uncovered = difference(featureCollection([boundary, coveredUnion]));
  const uncoveredAreaSqM = featureAreaSqM(uncovered);
  const coveredAreaSqM = Math.max(0, referenceAreaSqM - uncoveredAreaSqM);
  const coveragePercent = Math.min(100, (coveredAreaSqM / referenceAreaSqM) * 100);

  return {
    referenceAreaSqM,
    coveredAreaSqM,
    uncoveredAreaSqM,
    coveragePercent,
    fullyCoversReference: isReferenceFullyCovered(uncoveredAreaSqM, referenceAreaSqM),
  };
}
