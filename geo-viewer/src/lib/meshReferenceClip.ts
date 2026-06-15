import {
  clipFeatureToBoundary,
  clipUnchangedAreaTolerance,
  featureAreaSqM,
  geoJsonToBoundaryFeature,
  isPositionInsideBoundary,
} from "./geoBoundaryClip";
import {
  meshFaceToFeature,
  type MeshDocument,
  type MeshFace,
  type MeshVertex,
} from "./meshSubdivision";

const POSITION_MATCH_METERS = 0.5;

export interface ClipMeshDocumentResult {
  document: MeshDocument;
  clippedCount: number;
  removedCount: number;
}

function positionsEquivalent(a: GeoJSON.Position, b: GeoJSON.Position): boolean {
  const latMeters = (a[1] - b[1]) * 111_320;
  const lngMeters =
    (a[0] - b[0]) * 111_320 * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  return Math.hypot(latMeters, lngMeters) < POSITION_MATCH_METERS;
}

function ringWithoutClosingDuplicate(ring: GeoJSON.Position[]): GeoJSON.Position[] {
  if (ring.length < 2) return ring;

  const last = ring[ring.length - 1];
  const first = ring[0];
  if (last && first && positionsEquivalent(last, first)) {
    return ring.slice(0, -1);
  }

  return ring;
}

function extractExteriorRings(feature: GeoJSON.Feature): GeoJSON.Position[][] {
  const geometry = feature.geometry;
  if (geometry.type === "Polygon") {
    return [ringWithoutClosingDuplicate(geometry.coordinates[0] ?? [])];
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.map(polygon => ringWithoutClosingDuplicate(polygon[0] ?? []));
  }

  return [];
}

function createVertex(position: GeoJSON.Position): MeshVertex {
  return {
    id: crypto.randomUUID(),
    position,
  };
}

function buildFaceFromRing(
  face: MeshFace,
  ring: GeoJSON.Position[],
  resolveVertex: (position: GeoJSON.Position) => string,
  partSuffix?: string,
): MeshFace | null {
  const vertexIds = ring.map(resolveVertex);
  if (vertexIds.length < 3) return null;

  return {
    ...face,
    id: partSuffix ? crypto.randomUUID() : face.id,
    name: partSuffix ? `${face.name} ${partSuffix}` : face.name,
    vertexIds,
  };
}

export function clipMeshDocumentToReference(
  document: MeshDocument,
  referenceGeoJson: GeoJSON.GeoJSON,
): ClipMeshDocumentResult {
  const boundary = geoJsonToBoundaryFeature(referenceGeoJson);
  if (!boundary || document.faces.length === 0) {
    return { document, clippedCount: 0, removedCount: 0 };
  }

  const removalTolerance = clipUnchangedAreaTolerance();
  const unchangedTolerance = clipUnchangedAreaTolerance();
  const vertices: Record<string, MeshVertex> = {};
  const nextFaces: MeshFace[] = [];
  let clippedCount = 0;
  let removedCount = 0;

  const resolveVertex = (position: GeoJSON.Position): string => {
    for (const vertex of Object.values(vertices)) {
      if (positionsEquivalent(vertex.position, position)) {
        return vertex.id;
      }
    }

    for (const vertex of Object.values(document.vertices)) {
      if (positionsEquivalent(vertex.position, position)) {
        vertices[vertex.id] = vertex;
        return vertex.id;
      }
    }

    const created = createVertex(position);
    vertices[created.id] = created;
    return created.id;
  };

  for (const face of document.faces) {
    const originalFeature = meshFaceToFeature(document, face);
    if (!originalFeature) {
      removedCount += 1;
      continue;
    }

    const originalAreaSqM = featureAreaSqM(originalFeature);
    const clippedFeature = clipFeatureToBoundary(originalFeature, boundary);
    const clippedAreaSqM = featureAreaSqM(clippedFeature);
    const extendsOutside = face.vertexIds.some(vertexId => {
      const vertex = document.vertices[vertexId];
      return vertex ? !isPositionInsideBoundary(vertex.position, boundary) : false;
    });

    if (!clippedFeature || clippedAreaSqM <= removalTolerance) {
      removedCount += 1;
      continue;
    }

    if (
      !extendsOutside &&
      originalAreaSqM - clippedAreaSqM <= unchangedTolerance
    ) {
      nextFaces.push(face);
      for (const vertexId of face.vertexIds) {
        const vertex = document.vertices[vertexId];
        if (vertex) {
          vertices[vertex.id] = vertex;
        }
      }
      continue;
    }

    clippedCount += 1;
    const rings = extractExteriorRings(clippedFeature).filter(ring => ring.length >= 3);
    if (rings.length === 0) {
      removedCount += 1;
      continue;
    }

    rings.forEach((ring, index) => {
      const partSuffix = rings.length > 1 ? `(part ${index + 1})` : undefined;
      const nextFace = buildFaceFromRing(face, ring, resolveVertex, partSuffix);
      if (nextFace) {
        nextFaces.push(nextFace);
      } else {
        removedCount += 1;
      }
    });
  }

  const usedVertexIds = new Set(nextFaces.flatMap(face => face.vertexIds));
  const prunedVertices = Object.fromEntries(
    Object.entries(vertices).filter(([vertexId]) => usedVertexIds.has(vertexId)),
  );

  return {
    document: {
      vertices: prunedVertices,
      faces: nextFaces,
    },
    clippedCount,
    removedCount,
  };
}
