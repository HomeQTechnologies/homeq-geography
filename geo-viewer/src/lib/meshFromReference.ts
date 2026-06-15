import { normalizeGeoJsonToFeatures } from "./normalizeGeoJson";
import { buildMeshDefinitionFromDocument, type MeshDefinition } from "./meshDefinition";
import type { MeshDocument, MeshFace, MeshVertex } from "./meshSubdivision";

const POSITION_MATCH_METERS = 0.5;

export interface CreateMeshFromReferenceResult {
  document: MeshDocument;
  definition: MeshDefinition;
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

function extractExteriorRings(geoJson: GeoJSON.GeoJSON): GeoJSON.Position[][] {
  const rings: GeoJSON.Position[][] = [];

  for (const feature of normalizeGeoJsonToFeatures(geoJson)) {
    const geometry = feature.geometry;
    if (!geometry) continue;

    if (geometry.type === "Polygon") {
      const ring = ringWithoutClosingDuplicate(geometry.coordinates[0] ?? []);
      if (ring.length >= 3) rings.push(ring);
      continue;
    }

    if (geometry.type === "MultiPolygon") {
      for (const polygon of geometry.coordinates) {
        const ring = ringWithoutClosingDuplicate(polygon[0] ?? []);
        if (ring.length >= 3) rings.push(ring);
      }
    }
  }

  return rings;
}

function createVertex(position: GeoJSON.Position): MeshVertex {
  return {
    id: crypto.randomUUID(),
    position,
  };
}

export function createMeshDocumentFromReference(
  referenceGeoJson: GeoJSON.GeoJSON,
): CreateMeshFromReferenceResult | null {
  const rings = extractExteriorRings(referenceGeoJson);
  if (rings.length === 0) return null;

  const vertices: Record<string, MeshVertex> = {};
  const faces: MeshFace[] = [];

  const resolveVertex = (position: GeoJSON.Position): string => {
    for (const vertex of Object.values(vertices)) {
      if (positionsEquivalent(vertex.position, position)) {
        return vertex.id;
      }
    }

    const created = createVertex(position);
    vertices[created.id] = created;
    return created.id;
  };

  rings.forEach((ring, index) => {
    const vertexIds = ring.map(resolveVertex);
    if (vertexIds.length < 3) return;

    faces.push({
      id: crypto.randomUUID(),
      name: rings.length === 1 ? "Reference" : `Reference ${index + 1}`,
      vertexIds,
      visible: true,
    });
  });

  if (faces.length === 0) return null;

  const document = { vertices, faces };
  return {
    document,
    definition: buildMeshDefinitionFromDocument(document),
  };
}
