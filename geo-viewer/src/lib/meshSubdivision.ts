import type { Map as MapLibreMap } from "maplibre-gl";

export interface MeshVertex {
  id: string;
  position: GeoJSON.Position;
}

export interface MeshFace {
  id: string;
  name: string;
  vertexIds: string[];
  visible: boolean;
  locked?: boolean;
}

export interface MeshDocument {
  vertices: Record<string, MeshVertex>;
  faces: MeshFace[];
}

export type MeshInteractionMode =
  | "edit-vertices"
  | "extrude-edge"
  | "subdivide-face"
  | "create-face"
  | "merge-faces"
  | "delete-vertex-chain";

export function createEmptyMeshDocument(): MeshDocument {
  return { vertices: {}, faces: [] };
}

export function cloneMeshDocument(document: MeshDocument): MeshDocument {
  return {
    vertices: Object.fromEntries(
      Object.entries(document.vertices).map(([id, vertex]) => [
        id,
        {
          ...vertex,
          position: [...vertex.position] as GeoJSON.Position,
        },
      ]),
    ),
    faces: document.faces.map(face => ({
      ...face,
      vertexIds: [...face.vertexIds],
    })),
  };
}

function createVertex(position: GeoJSON.Position): MeshVertex {
  return {
    id: crypto.randomUUID(),
    position,
  };
}

export function addSquare(
  document: MeshDocument,
  center: GeoJSON.Position,
  halfSize: number,
): { document: MeshDocument; faceId: string } {
  const [lng, lat] = center;
  const vertices = [
    createVertex([lng - halfSize, lat - halfSize]),
    createVertex([lng + halfSize, lat - halfSize]),
    createVertex([lng + halfSize, lat + halfSize]),
    createVertex([lng - halfSize, lat + halfSize]),
  ];

  const faceId = crypto.randomUUID();
  const face: MeshFace = {
    id: faceId,
    name: `Face ${document.faces.length + 1}`,
    vertexIds: vertices.map(vertex => vertex.id),
    visible: true,
  };

  return {
    document: {
      vertices: {
        ...document.vertices,
        ...Object.fromEntries(vertices.map(vertex => [vertex.id, vertex])),
      },
      faces: [...document.faces, face],
    },
    faceId,
  };
}

function getFace(document: MeshDocument, faceId: string): MeshFace | undefined {
  return document.faces.find(face => face.id === faceId);
}

function getVertex(document: MeshDocument, vertexId: string): MeshVertex | undefined {
  return document.vertices[vertexId];
}

export function getFaceVertexPositions(
  document: MeshDocument,
  face: MeshFace,
): GeoJSON.Position[] {
  return face.vertexIds
    .map(vertexId => getVertex(document, vertexId)?.position)
    .filter((position): position is GeoJSON.Position => position !== undefined);
}

export function meshFaceToFeature(
  document: MeshDocument,
  face: MeshFace,
): GeoJSON.Feature<GeoJSON.Polygon> | null {
  const positions = getFaceVertexPositions(document, face);
  if (positions.length < 3) return null;

  const ring = [...positions, positions[0]];

  return {
    type: "Feature",
    properties: {
      faceId: face.id,
      name: face.name,
      locked: face.locked === true,
    },
    geometry: {
      type: "Polygon",
      coordinates: [ring],
    },
  };
}

function buildMeshBoundaryEdgeKeys(document: MeshDocument): Set<string> {
  const edgeUseCount = new Map<string, number>();

  for (const face of document.faces) {
    if (!face.visible) continue;

    for (let edgeIndex = 0; edgeIndex < face.vertexIds.length; edgeIndex += 1) {
      const startId = face.vertexIds[edgeIndex]!;
      const endId = face.vertexIds[(edgeIndex + 1) % face.vertexIds.length]!;
      const key = positionEdgeKey(document, startId, endId);
      if (!key) continue;
      edgeUseCount.set(key, (edgeUseCount.get(key) ?? 0) + 1);
    }
  }

  const boundaryEdges = new Set<string>();
  for (const [key, count] of edgeUseCount) {
    if (count === 1) {
      boundaryEdges.add(key);
    }
  }

  return boundaryEdges;
}

export function buildMeshBoundaryVertexIds(document: MeshDocument): Set<string> {
  const boundaryEdges = buildMeshBoundaryEdgeKeys(document);
  const vertexIds = new Set<string>();

  for (const face of document.faces) {
    if (!face.visible) continue;

    for (let edgeIndex = 0; edgeIndex < face.vertexIds.length; edgeIndex += 1) {
      const startId = face.vertexIds[edgeIndex]!;
      const endId = face.vertexIds[(edgeIndex + 1) % face.vertexIds.length]!;
      const key = positionEdgeKey(document, startId, endId);
      if (!key || !boundaryEdges.has(key)) continue;

      vertexIds.add(startId);
      vertexIds.add(endId);
    }
  }

  return vertexIds;
}

export function isOuterMeshVertex(document: MeshDocument, vertexId: string): boolean {
  return buildMeshBoundaryVertexIds(document).has(vertexId);
}

export function isMeshFaceLocked(face: MeshFace): boolean {
  return face.locked === true;
}

export function isMeshVertexLocked(document: MeshDocument, vertexId: string): boolean {
  return document.faces.some(face => face.locked === true && face.vertexIds.includes(vertexId));
}

export function isMeshFaceEdgeLocked(
  document: MeshDocument,
  faceId: string,
  _edgeIndex: number,
): boolean {
  const face = getFace(document, faceId);
  return face?.locked === true;
}

export function buildMeshFaceCollection(document: MeshDocument): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: document.faces
      .filter(face => face.visible)
      .map(face => meshFaceToFeature(document, face))
      .filter((feature): feature is GeoJSON.Feature<GeoJSON.Polygon> => feature !== null),
  };
}

export function buildMeshFaceLabelCollection(document: MeshDocument): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: document.faces
      .filter(face => face.visible)
      .map(face => {
        const positions = getFaceVertexPositions(document, face);
        if (positions.length < 3) return null;

        return {
          type: "Feature",
          properties: {
            faceId: face.id,
            name: face.name,
          },
          geometry: {
            type: "Point",
            coordinates: faceCentroid(document, face),
          },
        } satisfies GeoJSON.Feature<GeoJSON.Point>;
      })
      .filter((feature): feature is GeoJSON.Feature<GeoJSON.Point> => feature !== null),
  };
}

export function buildMeshVertexCollection(document: MeshDocument): GeoJSON.FeatureCollection {
  const outerVertexIds = buildMeshBoundaryVertexIds(document);

  return {
    type: "FeatureCollection",
    features: Object.values(document.vertices).map(vertex => ({
      type: "Feature",
      properties: {
        vertexId: vertex.id,
        isOuterRing: outerVertexIds.has(vertex.id),
        isLocked: isMeshVertexLocked(document, vertex.id),
      },
      geometry: {
        type: "Point",
        coordinates: vertex.position,
      },
    })),
  };
}

export function buildMeshEdgeMidpointCollection(
  document: MeshDocument,
  faceId: string | null,
): GeoJSON.FeatureCollection {
  if (!faceId) {
    return { type: "FeatureCollection", features: [] };
  }

  const face = getFace(document, faceId);
  if (!face) {
    return { type: "FeatureCollection", features: [] };
  }

  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];

  for (let edgeIndex = 0; edgeIndex < face.vertexIds.length; edgeIndex += 1) {
    const start = getVertex(document, face.vertexIds[edgeIndex]);
    const end = getVertex(document, face.vertexIds[(edgeIndex + 1) % face.vertexIds.length]);
    if (!start || !end) continue;

    features.push({
      type: "Feature",
      properties: {
        faceId: face.id,
        edgeIndex,
      },
      geometry: {
        type: "Point",
        coordinates: [
          (start.position[0] + end.position[0]) / 2,
          (start.position[1] + end.position[1]) / 2,
        ],
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function faceCentroid(document: MeshDocument, face: MeshFace): GeoJSON.Position {
  const positions = getFaceVertexPositions(document, face);
  if (positions.length === 0) return [0, 0];

  const total = positions.reduce(
    (accumulator, position) => [accumulator[0] + position[0], accumulator[1] + position[1]],
    [0, 0],
  );

  return [total[0] / positions.length, total[1] / positions.length];
}

function edgeLength(start: MeshVertex, end: MeshVertex): number {
  const dx = end.position[0] - start.position[0];
  const dy = end.position[1] - start.position[1];
  return Math.hypot(dx, dy);
}

function facesSharingUndirectedEdge(
  document: MeshDocument,
  vertexIdA: string,
  vertexIdB: string,
): Array<{ faceId: string; edgeIndex: number }> {
  const matches: Array<{ faceId: string; edgeIndex: number }> = [];

  for (const face of document.faces) {
    for (let edgeIndex = 0; edgeIndex < face.vertexIds.length; edgeIndex += 1) {
      const startId = face.vertexIds[edgeIndex];
      const endId = face.vertexIds[(edgeIndex + 1) % face.vertexIds.length];
      if (
        (startId === vertexIdA && endId === vertexIdB) ||
        (startId === vertexIdB && endId === vertexIdA)
      ) {
        matches.push({ faceId: face.id, edgeIndex });
      }
    }
  }

  return matches;
}

export function areMeshVerticesAdjacent(
  document: MeshDocument,
  vertexIdA: string,
  vertexIdB: string,
): boolean {
  if (vertexIdA === vertexIdB) return false;
  return facesSharingUndirectedEdge(document, vertexIdA, vertexIdB).length > 0;
}

export interface DeleteChainPick {
  startId: string | null;
  directionId: string | null;
  chainVertexIds: string[];
  isComplete: boolean;
}

export const EMPTY_DELETE_CHAIN_PICK: DeleteChainPick = {
  startId: null,
  directionId: null,
  chainVertexIds: [],
  isComplete: false,
};

export function getMeshVertexNeighbors(document: MeshDocument, vertexId: string): string[] {
  const neighbors = new Set<string>();

  for (const face of document.faces) {
    const index = face.vertexIds.indexOf(vertexId);
    if (index === -1) continue;

    const length = face.vertexIds.length;
    neighbors.add(face.vertexIds[(index - 1 + length) % length]!);
    neighbors.add(face.vertexIds[(index + 1) % length]!);
  }

  return [...neighbors];
}

function shortestPathAwayFrom(
  document: MeshDocument,
  fromId: string,
  toId: string,
  awayFromId: string,
): string[] | null {
  if (fromId === toId) {
    return [fromId];
  }

  const queue = [fromId];
  const visited = new Set<string>([fromId]);
  const parent = new Map<string, string | null>([[fromId, null]]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === toId) {
      const path: string[] = [];
      let node: string | null = toId;
      while (node !== null) {
        path.unshift(node);
        node = parent.get(node) ?? null;
      }
      return path;
    }

    for (const neighbor of getMeshVertexNeighbors(document, current)) {
      if (neighbor === awayFromId || visited.has(neighbor)) {
        continue;
      }
      visited.add(neighbor);
      parent.set(neighbor, current);
      queue.push(neighbor);
    }
  }

  return null;
}

export function buildDeleteChainAlongDirection(
  document: MeshDocument,
  startId: string,
  directionId: string,
  endId: string,
): string[] | null {
  if (!areMeshVerticesAdjacent(document, startId, directionId)) {
    return null;
  }

  if (endId === startId) {
    return [startId];
  }

  if (endId === directionId) {
    return [startId, directionId];
  }

  const forwardPath = shortestPathAwayFrom(document, directionId, endId, startId);
  if (!forwardPath) {
    return null;
  }

  return [startId, ...forwardPath];
}

export function pickDeleteChainVertex(
  document: MeshDocument,
  pick: DeleteChainPick,
  vertexId: string,
  outerVerticesLocked: boolean,
): DeleteChainPick | null {
  if (!isMeshVertexRemovable(document, vertexId, outerVerticesLocked)) {
    return null;
  }

  if (pick.isComplete) {
    return {
      startId: vertexId,
      directionId: null,
      chainVertexIds: [vertexId],
      isComplete: false,
    };
  }

  if (!pick.startId) {
    return {
      startId: vertexId,
      directionId: null,
      chainVertexIds: [vertexId],
      isComplete: false,
    };
  }

  if (!pick.directionId) {
    if (vertexId === pick.startId) {
      return { ...EMPTY_DELETE_CHAIN_PICK };
    }

    if (!areMeshVerticesAdjacent(document, pick.startId, vertexId)) {
      return {
        startId: vertexId,
        directionId: null,
        chainVertexIds: [vertexId],
        isComplete: false,
      };
    }

    return {
      startId: pick.startId,
      directionId: vertexId,
      chainVertexIds: [pick.startId, vertexId],
      isComplete: false,
    };
  }

  if (vertexId === pick.startId) {
    return { ...EMPTY_DELETE_CHAIN_PICK };
  }

  if (vertexId === pick.directionId) {
    return {
      startId: pick.startId,
      directionId: pick.directionId,
      chainVertexIds: [pick.startId, pick.directionId],
      isComplete: true,
    };
  }

  const chain = buildDeleteChainAlongDirection(document, pick.startId, pick.directionId, vertexId);
  if (!chain) {
    return pick;
  }

  return {
    startId: pick.startId,
    directionId: pick.directionId,
    chainVertexIds: chain,
    isComplete: true,
  };
}

export function resolveDeleteChainPreviewVertexIds(
  document: MeshDocument,
  pick: DeleteChainPick,
  hoverVertexId: string | null,
): string[] {
  if (pick.isComplete) {
    return pick.chainVertexIds;
  }

  if (pick.startId && pick.directionId && hoverVertexId) {
    const preview = buildDeleteChainAlongDirection(
      document,
      pick.startId,
      pick.directionId,
      hoverVertexId,
    );
    if (preview) {
      return preview;
    }
  }

  return pick.chainVertexIds;
}

export function buildMeshVertexChainPreviewCollection(
  document: MeshDocument,
  pick: DeleteChainPick,
  hoverVertexId: string | null,
): GeoJSON.FeatureCollection {
  const previewVertexIds = resolveDeleteChainPreviewVertexIds(document, pick, hoverVertexId);

  if (previewVertexIds.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const pointFeatures = previewVertexIds
    .map(vertexId => document.vertices[vertexId])
    .filter((vertex): vertex is MeshVertex => vertex !== undefined)
    .map(vertex => ({
      type: "Feature" as const,
      properties: { vertexId: vertex.id },
      geometry: {
        type: "Point" as const,
        coordinates: vertex.position,
      },
    }));

  if (previewVertexIds.length < 2) {
    return { type: "FeatureCollection", features: pointFeatures };
  }

  const lineCoordinates = previewVertexIds
    .map(vertexId => document.vertices[vertexId]?.position)
    .filter((position): position is GeoJSON.Position => position !== undefined);

  if (lineCoordinates.length < 2) {
    return { type: "FeatureCollection", features: pointFeatures };
  }

  return {
    type: "FeatureCollection",
    features: [
      ...pointFeatures,
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: lineCoordinates,
        },
      },
    ],
  };
}

function areAdjacentOnFace(face: MeshFace, vertexIdA: string, vertexIdB: string): boolean {
  const ids = face.vertexIds;
  const indexA = ids.indexOf(vertexIdA);
  const indexB = ids.indexOf(vertexIdB);
  if (indexA === -1 || indexB === -1) return false;

  const length = ids.length;
  return (indexA + 1) % length === indexB || (indexB + 1) % length === indexA;
}

function collectFaceVertexPath(
  vertexIds: string[],
  startIndex: number,
  endIndex: number,
): string[] {
  const path: string[] = [];
  const length = vertexIds.length;
  let index = startIndex;

  while (true) {
    path.push(vertexIds[index]!);
    if (index === endIndex) break;
    index = (index + 1) % length;
  }

  return path;
}

export function findSplittableFaceBetweenVertices(
  document: MeshDocument,
  vertexIdA: string,
  vertexIdB: string,
  preferredFaceId?: string | null,
): MeshFace | null {
  if (vertexIdA === vertexIdB) return null;
  if (facesSharingUndirectedEdge(document, vertexIdA, vertexIdB).length > 0) return null;

  const candidates = document.faces.filter(
    face =>
      face.vertexIds.includes(vertexIdA) &&
      face.vertexIds.includes(vertexIdB) &&
      !areAdjacentOnFace(face, vertexIdA, vertexIdB),
  );

  if (candidates.length === 0) return null;

  if (preferredFaceId) {
    const preferred = candidates.find(face => face.id === preferredFaceId);
    if (preferred) return preferred;
  }

  return candidates[0] ?? null;
}

export function subdivideFaceBetweenVertices(
  document: MeshDocument,
  vertexIdA: string,
  vertexIdB: string,
  preferredFaceId?: string | null,
): { document: MeshDocument; faceIdA: string; faceIdB: string } | null {
  const face = findSplittableFaceBetweenVertices(
    document,
    vertexIdA,
    vertexIdB,
    preferredFaceId,
  );
  if (!face) return null;

  const ids = face.vertexIds;
  const indexA = ids.indexOf(vertexIdA);
  const indexB = ids.indexOf(vertexIdB);
  if (indexA === -1 || indexB === -1) return null;

  const pathAB = collectFaceVertexPath(ids, indexA, indexB);
  const pathBA = collectFaceVertexPath(ids, indexB, indexA);
  if (pathAB.length < 3 || pathBA.length < 3) return null;

  const faceIdA = crypto.randomUUID();
  const faceIdB = crypto.randomUUID();

  const newFaceA: MeshFace = {
    id: faceIdA,
    name: `${face.name} A`,
    vertexIds: pathAB,
    visible: face.visible,
  };
  const newFaceB: MeshFace = {
    id: faceIdB,
    name: `${face.name} B`,
    vertexIds: pathBA,
    visible: face.visible,
  };

  return {
    document: {
      ...document,
      faces: [...document.faces.filter(entry => entry.id !== face.id), newFaceA, newFaceB],
    },
    faceIdA,
    faceIdB,
  };
}

export function buildMeshSubdividePreviewCollection(
  document: MeshDocument,
  vertexIds: string[],
): GeoJSON.FeatureCollection {
  if (vertexIds.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const pointFeatures = vertexIds
    .map(vertexId => document.vertices[vertexId])
    .filter((vertex): vertex is MeshVertex => vertex !== undefined)
    .map(vertex => ({
      type: "Feature" as const,
      properties: { vertexId: vertex.id },
      geometry: {
        type: "Point" as const,
        coordinates: vertex.position,
      },
    }));

  if (vertexIds.length < 2) {
    return { type: "FeatureCollection", features: pointFeatures };
  }

  const start = document.vertices[vertexIds[0]!];
  const end = document.vertices[vertexIds[1]!];
  if (!start || !end) {
    return { type: "FeatureCollection", features: pointFeatures };
  }

  return {
    type: "FeatureCollection",
    features: [
      ...pointFeatures,
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [start.position, end.position],
        },
      },
    ],
  };
}

const MIN_FACE_AREA = 1e-12;

function polygonSignedArea(positions: GeoJSON.Position[]): number {
  let area = 0;

  for (let index = 0; index < positions.length; index += 1) {
    const current = positions[index]!;
    const next = positions[(index + 1) % positions.length]!;
    area += current[0] * next[1] - next[0] * current[1];
  }

  return area / 2;
}

function segmentsIntersectProper(
  a1: GeoJSON.Position,
  a2: GeoJSON.Position,
  b1: GeoJSON.Position,
  b2: GeoJSON.Position,
): boolean {
  const orientation = (p: GeoJSON.Position, q: GeoJSON.Position, r: GeoJSON.Position) => {
    const value = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
    if (Math.abs(value) < 1e-12) return 0;
    return value > 0 ? 1 : 2;
  };

  const onSegment = (p: GeoJSON.Position, q: GeoJSON.Position, r: GeoJSON.Position) =>
    q[0] <= Math.max(p[0], r[0]) + 1e-12 &&
    q[0] + 1e-12 >= Math.min(p[0], r[0]) &&
    q[1] <= Math.max(p[1], r[1]) + 1e-12 &&
    q[1] + 1e-12 >= Math.min(p[1], r[1]);

  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a1, b1, a2)) return true;
  if (o2 === 0 && onSegment(a1, b2, a2)) return true;
  if (o3 === 0 && onSegment(b1, a1, b2)) return true;
  if (o4 === 0 && onSegment(b1, a2, b2)) return true;

  return false;
}

function hasNonAdjacentEdgeIntersection(positions: GeoJSON.Position[]): boolean {
  const count = positions.length;
  if (count < 4) return false;

  for (let indexA = 0; indexA < count; indexA += 1) {
    const edgeAStart = positions[indexA]!;
    const edgeAEnd = positions[(indexA + 1) % count]!;

    for (let indexB = indexA + 1; indexB < count; indexB += 1) {
      if (indexB === indexA || indexB === (indexA + 1) % count || (indexB + 1) % count === indexA) {
        continue;
      }

      const edgeBStart = positions[indexB]!;
      const edgeBEnd = positions[(indexB + 1) % count]!;
      if (segmentsIntersectProper(edgeAStart, edgeAEnd, edgeBStart, edgeBEnd)) {
        return true;
      }
    }
  }

  return false;
}

function faceUsesSameVertexSet(face: MeshFace, vertexIds: string[]): boolean {
  if (face.vertexIds.length !== vertexIds.length) return false;

  const expected = new Set(vertexIds);
  return face.vertexIds.every(vertexId => expected.has(vertexId));
}

export function orderVertexIdsForFace(
  document: MeshDocument,
  vertexIds: string[],
): string[] | null {
  const uniqueVertexIds = [...new Set(vertexIds)];
  if (uniqueVertexIds.length !== vertexIds.length || uniqueVertexIds.length < 3) {
    return null;
  }

  const vertices = uniqueVertexIds
    .map(vertexId => getVertex(document, vertexId))
    .filter((vertex): vertex is MeshVertex => vertex !== undefined);
  if (vertices.length !== uniqueVertexIds.length) return null;

  const centroid = vertices.reduce<GeoJSON.Position>(
    (accumulator, vertex) => [
      accumulator[0] + vertex.position[0],
      accumulator[1] + vertex.position[1],
    ],
    [0, 0],
  );
  centroid[0] /= vertices.length;
  centroid[1] /= vertices.length;

  return vertices
    .map(vertex => ({
      id: vertex.id,
      angle: Math.atan2(vertex.position[1] - centroid[1], vertex.position[0] - centroid[0]),
    }))
    .sort((left, right) => left.angle - right.angle)
    .map(vertex => vertex.id);
}

export function createFaceFromVertices(
  document: MeshDocument,
  vertexIds: string[],
): { document: MeshDocument; faceId: string } | null {
  if (vertexIds.length !== 4) return null;

  const orderedVertexIds = orderVertexIdsForFace(document, vertexIds);
  if (!orderedVertexIds) return null;

  if (document.faces.some(face => faceUsesSameVertexSet(face, orderedVertexIds))) {
    return null;
  }

  const positions = orderedVertexIds
    .map(vertexId => getVertex(document, vertexId)?.position)
    .filter((position): position is GeoJSON.Position => position !== undefined);
  if (positions.length !== 4) return null;
  if (Math.abs(polygonSignedArea(positions)) < MIN_FACE_AREA) return null;
  if (hasNonAdjacentEdgeIntersection(positions)) return null;

  const faceId = crypto.randomUUID();
  const face: MeshFace = {
    id: faceId,
    name: `Face ${document.faces.length + 1}`,
    vertexIds: orderedVertexIds,
    visible: true,
  };

  return {
    document: {
      ...document,
      faces: [...document.faces, face],
    },
    faceId,
  };
}

export function buildMeshVertexPickPreviewCollection(
  document: MeshDocument,
  vertexIds: string[],
  options?: { hoverVertexId?: string | null; closeRing?: boolean },
): GeoJSON.FeatureCollection {
  const hoverVertexId = options?.hoverVertexId ?? null;
  const previewVertexIds = [...vertexIds];
  if (hoverVertexId && !previewVertexIds.includes(hoverVertexId)) {
    previewVertexIds.push(hoverVertexId);
  }

  if (previewVertexIds.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const pointFeatures = previewVertexIds
    .map(vertexId => document.vertices[vertexId])
    .filter((vertex): vertex is MeshVertex => vertex !== undefined)
    .map(vertex => ({
      type: "Feature" as const,
      properties: { vertexId: vertex.id },
      geometry: {
        type: "Point" as const,
        coordinates: vertex.position,
      },
    }));

  if (previewVertexIds.length < 2) {
    return { type: "FeatureCollection", features: pointFeatures };
  }

  const orderedVertexIds =
    previewVertexIds.length >= 3
      ? orderVertexIdsForFace(document, previewVertexIds)
      : previewVertexIds;
  if (!orderedVertexIds) {
    return { type: "FeatureCollection", features: pointFeatures };
  }

  const lineCoordinates = orderedVertexIds
    .map(vertexId => document.vertices[vertexId]?.position)
    .filter((position): position is GeoJSON.Position => position !== undefined);

  const shouldCloseRing =
    options?.closeRing === true ||
    (vertexIds.length === 4 && (!hoverVertexId || previewVertexIds.length === 4));
  if (shouldCloseRing && lineCoordinates.length >= 3) {
    lineCoordinates.push(lineCoordinates[0]!);
  }

  if (lineCoordinates.length < 2) {
    return { type: "FeatureCollection", features: pointFeatures };
  }

  return {
    type: "FeatureCollection",
    features: [
      ...pointFeatures,
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: lineCoordinates,
        },
      },
    ],
  };
}

function positionsEquivalent(a: GeoJSON.Position, b: GeoJSON.Position): boolean {
  const latMeters = (a[1] - b[1]) * 111_320;
  const lngMeters =
    (a[0] - b[0]) * 111_320 * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  return Math.hypot(latMeters, lngMeters) < 0.5;
}

function edgeUsesVertices(
  document: MeshDocument,
  startId: string,
  endId: string,
  otherStartId: string,
  otherEndId: string,
): boolean {
  const start = getVertex(document, startId)?.position;
  const end = getVertex(document, endId)?.position;
  const otherStart = getVertex(document, otherStartId)?.position;
  const otherEnd = getVertex(document, otherEndId)?.position;
  if (!start || !end || !otherStart || !otherEnd) return false;

  return (
    (positionsEquivalent(start, otherStart) && positionsEquivalent(end, otherEnd)) ||
    (positionsEquivalent(start, otherEnd) && positionsEquivalent(end, otherStart))
  );
}

function positionEdgeKey(
  document: MeshDocument,
  startId: string,
  endId: string,
): string | null {
  const start = getVertex(document, startId)?.position;
  const end = getVertex(document, endId)?.position;
  if (!start || !end) return null;

  const startKey = `${start[0].toFixed(9)},${start[1].toFixed(9)}`;
  const endKey = `${end[0].toFixed(9)},${end[1].toFixed(9)}`;
  return startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
}

function findSharedEdgesBetweenFaces(
  document: MeshDocument,
  faceA: MeshFace,
  faceB: MeshFace,
): Array<{ aStartId: string; aEndId: string; bStartId: string; bEndId: string }> {
  const sharedEdges: Array<{ aStartId: string; aEndId: string; bStartId: string; bEndId: string }> =
    [];
  const seen = new Set<string>();

  for (let edgeIndex = 0; edgeIndex < faceA.vertexIds.length; edgeIndex += 1) {
    const aStartId = faceA.vertexIds[edgeIndex]!;
    const aEndId = faceA.vertexIds[(edgeIndex + 1) % faceA.vertexIds.length]!;

    for (let otherEdgeIndex = 0; otherEdgeIndex < faceB.vertexIds.length; otherEdgeIndex += 1) {
      const bStartId = faceB.vertexIds[otherEdgeIndex]!;
      const bEndId = faceB.vertexIds[(otherEdgeIndex + 1) % faceB.vertexIds.length]!;

      if (!edgeUsesVertices(document, aStartId, aEndId, bStartId, bEndId)) continue;

      const key =
        positionEdgeKey(document, aStartId, aEndId) ??
        [aStartId, aEndId].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);

      sharedEdges.push({ aStartId, aEndId, bStartId, bEndId });
    }
  }

  return sharedEdges;
}

function collectLongArc(vertexIds: string[], startId: string, endId: string): string[] | null {
  const startIndex = vertexIds.indexOf(startId);
  const endIndex = vertexIds.indexOf(endId);
  if (startIndex === -1 || endIndex === -1) return null;

  const length = vertexIds.length;
  const forward: string[] = [];
  let index = startIndex;
  forward.push(vertexIds[index]!);
  while (index !== endIndex) {
    index = (index + 1) % length;
    forward.push(vertexIds[index]!);
  }

  const backward: string[] = [];
  index = startIndex;
  backward.push(vertexIds[index]!);
  while (index !== endIndex) {
    index = (index - 1 + length) % length;
    backward.push(vertexIds[index]!);
  }

  return forward.length > backward.length ? forward : backward;
}

function collectLongArcOnFaceB(
  document: MeshDocument,
  faceB: MeshFace,
  aStartId: string,
  aEndId: string,
  bStartId: string,
  bEndId: string,
): string[] | null {
  const aStart = getVertex(document, aStartId)?.position;
  const aEnd = getVertex(document, aEndId)?.position;
  const bStart = getVertex(document, bStartId)?.position;
  const bEnd = getVertex(document, bEndId)?.position;
  if (!aStart || !aEnd || !bStart || !bEnd) return null;

  if (positionsEquivalent(aStart, bStart) && positionsEquivalent(aEnd, bEnd)) {
    return collectLongArc(faceB.vertexIds, bStartId, bEndId);
  }

  if (positionsEquivalent(aStart, bEnd) && positionsEquivalent(aEnd, bStart)) {
    return collectLongArc(faceB.vertexIds, bEndId, bStartId);
  }

  return null;
}

function unifyVertexRing(document: MeshDocument, vertexIds: string[]): string[] {
  const canonicalByPosition = new Map<string, string>();

  const resolveId = (vertexId: string): string => {
    const vertex = getVertex(document, vertexId);
    if (!vertex) return vertexId;

    const positionKey = `${vertex.position[0].toFixed(9)},${vertex.position[1].toFixed(9)}`;
    const existingId = canonicalByPosition.get(positionKey);
    if (existingId) return existingId;

    canonicalByPosition.set(positionKey, vertexId);
    return vertexId;
  };

  const unified = vertexIds.map(resolveId);
  return unified.filter((vertexId, index) => index === 0 || vertexId !== unified[index - 1]);
}

function mergeFaceVertexRings(
  document: MeshDocument,
  faceA: MeshFace,
  faceB: MeshFace,
): string[] | null {
  const sharedEdges = findSharedEdgesBetweenFaces(document, faceA, faceB);
  if (sharedEdges.length !== 1) return null;

  const { aStartId, aEndId, bStartId, bEndId } = sharedEdges[0]!;
  const arcA = collectLongArc(faceA.vertexIds, aEndId, aStartId);
  const arcB = collectLongArcOnFaceB(document, faceB, aStartId, aEndId, bStartId, bEndId);
  if (!arcA || !arcB) return null;

  const arcBInterior = arcB.slice(1, -1);
  const rawRing = arcBInterior.length > 0 ? [...arcA, ...arcBInterior] : arcA;
  return unifyVertexRing(document, rawRing);
}

function isValidFaceVertexRing(document: MeshDocument, vertexIds: string[]): boolean {
  if (vertexIds.length < 3) return false;
  if (new Set(vertexIds).size !== vertexIds.length) return false;

  const positions = vertexIds
    .map(vertexId => getVertex(document, vertexId)?.position)
    .filter((position): position is GeoJSON.Position => position !== undefined);
  if (positions.length !== vertexIds.length) return false;
  if (Math.abs(polygonSignedArea(positions)) < MIN_FACE_AREA) return false;
  if (hasNonAdjacentEdgeIntersection(positions)) return false;

  return true;
}

export function canMergeFaces(
  document: MeshDocument,
  faceIdA: string,
  faceIdB: string,
): boolean {
  if (faceIdA === faceIdB) return false;

  const faceA = getFace(document, faceIdA);
  const faceB = getFace(document, faceIdB);
  if (!faceA || !faceB) return false;

  const mergedVertexIds = mergeFaceVertexRings(document, faceA, faceB);
  if (!mergedVertexIds) return false;

  return isValidFaceVertexRing(document, mergedVertexIds);
}

export function explainMergeFacesFailure(
  document: MeshDocument,
  faceIdA: string,
  faceIdB: string,
): string {
  if (faceIdA === faceIdB) {
    return "Select two different faces to merge.";
  }

  const faceA = getFace(document, faceIdA);
  const faceB = getFace(document, faceIdB);
  if (!faceA || !faceB) {
    return "One of the selected faces no longer exists.";
  }

  const sharedEdges = findSharedEdgesBetweenFaces(document, faceA, faceB);
  if (sharedEdges.length === 0) {
    return "These faces do not share an edge. They must be adjacent to merge.";
  }
  if (sharedEdges.length > 1) {
    return "These faces share more than one edge and cannot be merged.";
  }

  const mergedVertexIds = mergeFaceVertexRings(document, faceA, faceB);
  if (!mergedVertexIds) {
    return "Could not build a combined face from these shapes.";
  }
  if (!isValidFaceVertexRing(document, mergedVertexIds)) {
    return "The combined face would be invalid.";
  }

  return "These faces cannot be merged.";
}

export function mergeFaces(
  document: MeshDocument,
  faceIdA: string,
  faceIdB: string,
): { document: MeshDocument; mergedFaceId: string } | null {
  if (faceIdA === faceIdB) return null;

  const faceA = getFace(document, faceIdA);
  const faceB = getFace(document, faceIdB);
  if (!faceA || !faceB) return null;

  const mergedVertexIds = mergeFaceVertexRings(document, faceA, faceB);
  if (!mergedVertexIds || !isValidFaceVertexRing(document, mergedVertexIds)) return null;

  const mergedFaceId = crypto.randomUUID();
  const mergedFace: MeshFace = {
    id: mergedFaceId,
    name: `${faceA.name} + ${faceB.name}`,
    vertexIds: mergedVertexIds,
    visible: faceA.visible && faceB.visible,
  };

  return {
    document: {
      ...document,
      faces: [
        ...document.faces.filter(face => face.id !== faceIdA && face.id !== faceIdB),
        mergedFace,
      ],
    },
    mergedFaceId,
  };
}

export function buildMeshFacePickPreviewCollection(
  document: MeshDocument,
  faceIds: string[],
): GeoJSON.FeatureCollection {
  const features = faceIds
    .map(faceId => document.faces.find(face => face.id === faceId))
    .filter((face): face is MeshFace => face !== undefined)
    .map(face => meshFaceToFeature(document, face))
    .filter((feature): feature is GeoJSON.Feature<GeoJSON.Polygon> => feature !== null);

  return {
    type: "FeatureCollection",
    features,
  };
}

export function buildCompositeFaceHighlightCollection(
  document: MeshDocument,
  faceNames: string[],
): GeoJSON.FeatureCollection {
  const faceNameSet = new Set(faceNames);
  const features = document.faces
    .filter(face => face.visible !== false && faceNameSet.has(face.name))
    .map(face => meshFaceToFeature(document, face))
    .filter((feature): feature is GeoJSON.Feature<GeoJSON.Polygon> => feature !== null);

  return {
    type: "FeatureCollection",
    features,
  };
}

export function buildCompositeBoundaryCollection(
  document: MeshDocument,
  faceNames: string[],
): GeoJSON.FeatureCollection {
  const faceNameSet = new Set(faceNames);
  const memberFaces = document.faces.filter(
    face => face.visible !== false && faceNameSet.has(face.name),
  );
  if (memberFaces.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const edgeUseCount = new Map<string, number>();
  const edgeCoordinates = new Map<string, [GeoJSON.Position, GeoJSON.Position]>();

  for (const face of memberFaces) {
    for (let edgeIndex = 0; edgeIndex < face.vertexIds.length; edgeIndex += 1) {
      const startId = face.vertexIds[edgeIndex]!;
      const endId = face.vertexIds[(edgeIndex + 1) % face.vertexIds.length]!;
      const key = positionEdgeKey(document, startId, endId);
      if (!key) continue;

      edgeUseCount.set(key, (edgeUseCount.get(key) ?? 0) + 1);

      if (edgeCoordinates.has(key)) continue;

      const start = getVertex(document, startId);
      const end = getVertex(document, endId);
      if (!start || !end) continue;

      edgeCoordinates.set(key, [start.position, end.position]);
    }
  }

  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (const [key, count] of edgeUseCount) {
    if (count !== 1) continue;

    const coordinates = edgeCoordinates.get(key);
    if (!coordinates) continue;

    features.push({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates,
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

export function insertVertexOnSharedEdge(
  document: MeshDocument,
  faceId: string,
  edgeIndex: number,
  position?: GeoJSON.Position,
): MeshDocument {
  const face = getFace(document, faceId);
  if (!face || face.vertexIds.length < 3) return document;

  const normalizedEdgeIndex = ((edgeIndex % face.vertexIds.length) + face.vertexIds.length) % face.vertexIds.length;
  const vertexIdA = face.vertexIds[normalizedEdgeIndex];
  const vertexIdB = face.vertexIds[(normalizedEdgeIndex + 1) % face.vertexIds.length];
  const start = getVertex(document, vertexIdA);
  const end = getVertex(document, vertexIdB);
  if (!start || !end) return document;

  const nextPosition =
    position ??
    ([
      (start.position[0] + end.position[0]) / 2,
      (start.position[1] + end.position[1]) / 2,
    ] as GeoJSON.Position);
  const newVertex = createVertex(nextPosition);
  const sharedEdges = facesSharingUndirectedEdge(document, vertexIdA, vertexIdB);

  const faces = document.faces.map(currentFace => {
    const match = sharedEdges.find(entry => entry.faceId === currentFace.id);
    if (!match) return currentFace;

    const startId = currentFace.vertexIds[match.edgeIndex];
    const endId = currentFace.vertexIds[(match.edgeIndex + 1) % currentFace.vertexIds.length];
    const insertAfter =
      startId === vertexIdA && endId === vertexIdB ? match.edgeIndex : match.edgeIndex;

    const vertexIds = [...currentFace.vertexIds];
    vertexIds.splice(insertAfter + 1, 0, newVertex.id);
    return { ...currentFace, vertexIds };
  });

  return {
    vertices: {
      ...document.vertices,
      [newVertex.id]: newVertex,
    },
    faces,
  };
}

export function extrudeFaceAlongEdge(
  document: MeshDocument,
  faceId: string,
  edgeIndex: number,
): { document: MeshDocument; newFaceId: string } {
  const face = getFace(document, faceId);
  if (!face || face.vertexIds.length < 3) {
    return { document, newFaceId: "" };
  }

  const normalizedEdgeIndex = ((edgeIndex % face.vertexIds.length) + face.vertexIds.length) % face.vertexIds.length;
  const vertexIdA = face.vertexIds[normalizedEdgeIndex];
  const vertexIdB = face.vertexIds[(normalizedEdgeIndex + 1) % face.vertexIds.length];
  const vertexA = getVertex(document, vertexIdA);
  const vertexB = getVertex(document, vertexIdB);
  if (!vertexA || !vertexB) {
    return { document, newFaceId: "" };
  }

  const centroid = faceCentroid(document, face);
  const midpoint: GeoJSON.Position = [
    (vertexA.position[0] + vertexB.position[0]) / 2,
    (vertexA.position[1] + vertexB.position[1]) / 2,
  ];
  const edgeDx = vertexB.position[0] - vertexA.position[0];
  const edgeDy = vertexB.position[1] - vertexA.position[1];
  let normalX = -edgeDy;
  let normalY = edgeDx;
  const toCentroidX = centroid[0] - midpoint[0];
  const toCentroidY = centroid[1] - midpoint[1];
  if (normalX * toCentroidX + normalY * toCentroidY > 0) {
    normalX = edgeDy;
    normalY = -edgeDx;
  }

  const normalLength = Math.hypot(normalX, normalY) || 1;
  const offsetDistance = edgeLength(vertexA, vertexB);
  const offsetX = (normalX / normalLength) * offsetDistance;
  const offsetY = (normalY / normalLength) * offsetDistance;

  const vertexC = createVertex([
    vertexB.position[0] + offsetX,
    vertexB.position[1] + offsetY,
  ]);
  const vertexD = createVertex([
    vertexA.position[0] + offsetX,
    vertexA.position[1] + offsetY,
  ]);

  const newFaceId = crypto.randomUUID();
  const newFace: MeshFace = {
    id: newFaceId,
    name: `Face ${document.faces.length + 1}`,
    vertexIds: [vertexIdA, vertexIdB, vertexC.id, vertexD.id],
    visible: true,
  };

  return {
    document: {
      vertices: {
        ...document.vertices,
        [vertexC.id]: vertexC,
        [vertexD.id]: vertexD,
      },
      faces: [...document.faces, newFace],
    },
    newFaceId,
  };
}

export function moveVertex(
  document: MeshDocument,
  vertexId: string,
  position: GeoJSON.Position,
): MeshDocument {
  const vertex = getVertex(document, vertexId);
  if (!vertex || isMeshVertexLocked(document, vertexId)) return document;

  return {
    ...document,
    vertices: {
      ...document.vertices,
      [vertexId]: {
        ...vertex,
        position,
      },
    },
  };
}

export function removeFace(document: MeshDocument, faceId: string): MeshDocument {
  const faces = document.faces.filter(face => face.id !== faceId);
  const usedVertexIds = new Set(faces.flatMap(face => face.vertexIds));
  const vertices = Object.fromEntries(
    Object.entries(document.vertices).filter(([vertexId]) => usedVertexIds.has(vertexId)),
  );

  return { vertices, faces };
}

export function removeMeshVertex(document: MeshDocument, vertexId: string): MeshDocument {
  if (!getVertex(document, vertexId) || isMeshVertexLocked(document, vertexId)) return document;

  const faces = document.faces
    .map(face => ({
      ...face,
      vertexIds: face.vertexIds.filter(id => id !== vertexId),
    }))
    .filter(face => face.vertexIds.length >= 3);

  const usedVertexIds = new Set(faces.flatMap(face => face.vertexIds));
  const vertices = Object.fromEntries(
    Object.entries(document.vertices).filter(([id]) => usedVertexIds.has(id)),
  );

  return { vertices, faces };
}

export function toggleFaceVisibility(document: MeshDocument, faceId: string): MeshDocument {
  return {
    ...document,
    faces: document.faces.map(face =>
      face.id === faceId ? { ...face, visible: !face.visible } : face,
    ),
  };
}

export function renameFace(document: MeshDocument, faceId: string, name: string): MeshDocument {
  return {
    ...document,
    faces: document.faces.map(face => (face.id === faceId ? { ...face, name } : face)),
  };
}

export function toggleFaceLock(document: MeshDocument, faceId: string): MeshDocument {
  return {
    ...document,
    faces: document.faces.map(face =>
      face.id === faceId ? { ...face, locked: !face.locked } : face,
    ),
  };
}

export function bringFaceToFront(document: MeshDocument, faceId: string): MeshDocument {
  const index = document.faces.findIndex(face => face.id === faceId);
  if (index < 0 || index === document.faces.length - 1) {
    return document;
  }

  const face = document.faces[index]!;
  const faces = document.faces.filter(entry => entry.id !== faceId);
  faces.push(face);

  return {
    ...document,
    faces,
  };
}

function projectedDistance(
  map: MapLibreMap,
  a: GeoJSON.Position,
  b: GeoJSON.Position,
): number {
  const projectedA = map.project([a[0], a[1]]);
  const projectedB = map.project([b[0], b[1]]);
  return Math.hypot(projectedA.x - projectedB.x, projectedA.y - projectedB.y);
}

export function findNearestMeshVertex(
  map: MapLibreMap,
  document: MeshDocument,
  lngLat: { lng: number; lat: number },
  pixelThreshold = 14,
): string | null {
  const clickPosition: GeoJSON.Position = [lngLat.lng, lngLat.lat];
  let nearestId: string | null = null;
  let nearestDistance = pixelThreshold;

  for (const vertex of Object.values(document.vertices)) {
    const distance = projectedDistance(map, vertex.position, clickPosition);
    if (distance <= nearestDistance) {
      nearestDistance = distance;
      nearestId = vertex.id;
    }
  }

  return nearestId;
}

export function findNearestMeshEdge(
  map: MapLibreMap,
  document: MeshDocument,
  faceId: string,
  lngLat: { lng: number; lat: number },
  pixelThreshold = 14,
): number | null {
  const face = getFace(document, faceId);
  if (!face) return null;

  const clickPosition: GeoJSON.Position = [lngLat.lng, lngLat.lat];
  let nearestEdgeIndex: number | null = null;
  let nearestDistance = pixelThreshold;

  for (let edgeIndex = 0; edgeIndex < face.vertexIds.length; edgeIndex += 1) {
    const start = getVertex(document, face.vertexIds[edgeIndex]);
    const end = getVertex(document, face.vertexIds[(edgeIndex + 1) % face.vertexIds.length]);
    if (!start || !end) continue;

    const midpoint: GeoJSON.Position = [
      (start.position[0] + end.position[0]) / 2,
      (start.position[1] + end.position[1]) / 2,
    ];
    const distance = projectedDistance(map, midpoint, clickPosition);
    if (distance <= nearestDistance) {
      nearestDistance = distance;
      nearestEdgeIndex = edgeIndex;
    }
  }

  return nearestEdgeIndex;
}

export function getMeshEdgeMidpoint(
  document: MeshDocument,
  faceId: string,
  edgeIndex: number,
): GeoJSON.Position | null {
  const face = document.faces.find(entry => entry.id === faceId);
  if (!face || face.vertexIds.length < 3) return null;

  const normalizedEdgeIndex = ((edgeIndex % face.vertexIds.length) + face.vertexIds.length) % face.vertexIds.length;
  const start = document.vertices[face.vertexIds[normalizedEdgeIndex]];
  const end = document.vertices[face.vertexIds[(normalizedEdgeIndex + 1) % face.vertexIds.length]];
  if (!start || !end) return null;

  return [
    (start.position[0] + end.position[0]) / 2,
    (start.position[1] + end.position[1]) / 2,
  ];
}

export function findMeshFaceAtLngLat(
  document: MeshDocument,
  lngLat: { lng: number; lat: number },
  options?: { otherThanFaceId?: string | null },
): string | null {
  const point = [lngLat.lng, lngLat.lat] as GeoJSON.Position;
  const matches: string[] = [];

  for (let index = document.faces.length - 1; index >= 0; index -= 1) {
    const face = document.faces[index]!;
    if (!face.visible) continue;
    const positions = getFaceVertexPositions(document, face);
    if (positions.length < 3) continue;
    if (isPointInPolygon(point, positions)) {
      matches.push(face.id);
    }
  }

  if (matches.length === 0) return null;

  if (options?.otherThanFaceId) {
    return matches.find(faceId => faceId !== options.otherThanFaceId) ?? matches[0] ?? null;
  }

  return matches[0] ?? null;
}

function isPointInPolygon(point: GeoJSON.Position, ring: GeoJSON.Position[]): boolean {
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const xi = ring[index][0];
    const yi = ring[index][1];
    const xj = ring[previous][0];
    const yj = ring[previous][1];
    const intersects =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

export function isMeshVertexRemovable(
  document: MeshDocument,
  vertexId: string,
  outerVerticesLocked: boolean,
): boolean {
  if (!getVertex(document, vertexId) || isMeshVertexLocked(document, vertexId)) {
    return false;
  }

  if (outerVerticesLocked && isOuterMeshVertex(document, vertexId)) {
    return false;
  }

  return true;
}

export function removeMeshVertices(document: MeshDocument, vertexIds: Iterable<string>): MeshDocument {
  const removeIds = new Set(vertexIds);
  for (const vertexId of [...removeIds]) {
    if (!getVertex(document, vertexId) || isMeshVertexLocked(document, vertexId)) {
      removeIds.delete(vertexId);
    }
  }

  if (removeIds.size === 0) {
    return document;
  }

  const faces = document.faces
    .map(face => ({
      ...face,
      vertexIds: face.vertexIds.filter(id => !removeIds.has(id)),
    }))
    .filter(face => face.vertexIds.length >= 3);

  const usedVertexIds = new Set(faces.flatMap(face => face.vertexIds));
  const vertices = Object.fromEntries(
    Object.entries(document.vertices).filter(([id]) => usedVertexIds.has(id)),
  );

  return { vertices, faces };
}
