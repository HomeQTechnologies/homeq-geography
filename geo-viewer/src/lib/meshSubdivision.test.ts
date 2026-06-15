import { describe, expect, it, vi } from "vitest";
import {
  addSquare,
  bringFaceToFront,
  buildCompositeBoundaryCollection,
  buildMeshFaceLabelCollection,
  buildMeshVertexCollection,
  createEmptyMeshDocument,
  extrudeFaceAlongEdge,
  isOuterMeshVertex,
  isMeshVertexLocked,
  isMeshFaceEdgeLocked,
  toggleFaceLock,
  renameFace,
  getFaceVertexPositions,
  getMeshEdgeMidpoint,
  insertVertexOnSharedEdge,
  removeMeshVertex,
  moveVertex,
  subdivideFaceBetweenVertices,
  findSplittableFaceBetweenVertices,
  createFaceFromVertices,
  orderVertexIdsForFace,
  mergeFaces,
  canMergeFaces,
  explainMergeFacesFailure,
  type MeshDocument,
} from "./meshSubdivision";

vi.stubGlobal("crypto", {
  randomUUID: (() => {
    let counter = 0;
    return () => {
      counter += 1;
      return `id-${counter}`;
    };
  })(),
});

describe("meshSubdivision", () => {
  it("creates a square with four shared vertices", () => {
    const result = addSquare(createEmptyMeshDocument(), [18, 59], 0.01);

    expect(Object.keys(result.document.vertices)).toHaveLength(4);
    expect(result.document.faces).toHaveLength(1);
    expect(getFaceVertexPositions(result.document, result.document.faces[0]!)).toHaveLength(4);
  });

  it("moves a selected face to the end of the stack", () => {
    const square = addSquare(createEmptyMeshDocument(), [18, 59], 0.01);
    const extruded = extrudeFaceAlongEdge(square.document, square.faceId, 0);
    const firstFaceId = extruded.document.faces[0]!.id;

    const updated = bringFaceToFront(extruded.document, firstFaceId);

    expect(updated.faces.at(-1)?.id).toBe(firstFaceId);
    expect(updated.faces[0]?.id).not.toBe(firstFaceId);
  });

  it("moves a shared vertex for every connected face", () => {
    const square = addSquare(createEmptyMeshDocument(), [18, 59], 0.01);
    const extruded = extrudeFaceAlongEdge(square.document, square.faceId, 0);
    const sharedVertexId = square.document.faces[0]!.vertexIds[0]!;

    const moved = moveVertex(extruded.document, sharedVertexId, [18.02, 59.02]);
    const originalFaces = extruded.document.faces.map(face => getFaceVertexPositions(extruded.document, face));
    const movedFaces = moved.faces.map(face => getFaceVertexPositions(moved, face));

    expect(moved.vertices[sharedVertexId]?.position).toEqual([18.02, 59.02]);
    expect(movedFaces[0]?.[0]).toEqual([18.02, 59.02]);
    expect(movedFaces[1]?.[0]).toEqual([18.02, 59.02]);
    expect(originalFaces[0]?.[0]).not.toEqual([18.02, 59.02]);
  });

  it("inserts one shared vertex on a shared edge between two faces", () => {
    let document: MeshDocument = addSquare(createEmptyMeshDocument(), [18, 59], 0.01).document;
    document = extrudeFaceAlongEdge(document, document.faces[0]!.id, 0).document;

    const beforeVertexCount = Object.keys(document.vertices).length;
    const updated = insertVertexOnSharedEdge(document, document.faces[0]!.id, 0);

    expect(Object.keys(updated.vertices)).toHaveLength(beforeVertexCount + 1);
    expect(updated.faces[0]?.vertexIds).toHaveLength(5);
    expect(updated.faces[1]?.vertexIds).toHaveLength(5);
    expect(updated.faces[0]?.vertexIds[1]).toBe(updated.faces[1]?.vertexIds[1]);
  });

  it("extrudes a new face that shares an edge with the source face", () => {
    const square = addSquare(createEmptyMeshDocument(), [18, 59], 0.01);
    const extruded = extrudeFaceAlongEdge(square.document, square.faceId, 0);

    expect(extruded.document.faces).toHaveLength(2);
    const source = extruded.document.faces[0]!;
    const created = extruded.document.faces[1]!;
    expect(created.vertexIds[0]).toBe(source.vertexIds[0]);
    expect(created.vertexIds[1]).toBe(source.vertexIds[1]);
  });

  it("returns the midpoint for a face edge", () => {
    const square = addSquare(createEmptyMeshDocument(), [18, 59], 0.01);
    const midpoint = getMeshEdgeMidpoint(square.document, square.faceId, 0);

    expect(midpoint).toEqual([18, 58.99]);
  });

  it("removes a vertex from every connected face", () => {
    const square = addSquare(createEmptyMeshDocument(), [18, 59], 0.01);
    const vertexId = square.document.faces[0]!.vertexIds[0]!;

    const updated = removeMeshVertex(square.document, vertexId);

    expect(updated.vertices[vertexId]).toBeUndefined();
    expect(updated.faces).toHaveLength(1);
    expect(updated.faces[0]?.vertexIds).toHaveLength(3);
  });

  it("drops faces that would fall below three vertices", () => {
    const square = addSquare(createEmptyMeshDocument(), [18, 59], 0.01);
    let document = removeMeshVertex(square.document, square.document.faces[0]!.vertexIds[0]!);
    const vertexId = document.faces[0]!.vertexIds[0]!;

    const updated = removeMeshVertex(document, vertexId);

    expect(updated.faces).toHaveLength(0);
  });

  it("removes a shared vertex while keeping valid faces", () => {
    let document: MeshDocument = addSquare(createEmptyMeshDocument(), [18, 59], 0.01).document;
    document = insertVertexOnSharedEdge(document, document.faces[0]!.id, 0);
    const removableVertexId = document.faces[0]!.vertexIds[2]!;

    const updated = removeMeshVertex(document, removableVertexId);

    expect(updated.vertices[removableVertexId]).toBeUndefined();
    expect(updated.faces).toHaveLength(1);
    expect(updated.faces[0]?.vertexIds).toHaveLength(4);
  });

  it("splits a square into two triangles along opposite corners", () => {
    const square = addSquare(createEmptyMeshDocument(), [18, 59], 0.01);
    const face = square.document.faces[0]!;
    const vertexA = face.vertexIds[0]!;
    const vertexB = face.vertexIds[2]!;

    const result = subdivideFaceBetweenVertices(square.document, vertexA, vertexB, square.faceId);

    expect(result).not.toBeNull();
    expect(result!.document.faces).toHaveLength(2);
    expect(result!.document.faces[0]?.vertexIds).toHaveLength(3);
    expect(result!.document.faces[1]?.vertexIds).toHaveLength(3);
    expect(Object.keys(result!.document.vertices)).toHaveLength(4);
  });

  it("rejects splitting adjacent vertices on a face", () => {
    const square = addSquare(createEmptyMeshDocument(), [18, 59], 0.01);
    const face = square.document.faces[0]!;
    const vertexA = face.vertexIds[0]!;
    const vertexB = face.vertexIds[1]!;

    expect(findSplittableFaceBetweenVertices(square.document, vertexA, vertexB)).toBeNull();
    expect(subdivideFaceBetweenVertices(square.document, vertexA, vertexB)).toBeNull();
  });

  it("rejects splitting a triangle because every pair of vertices is adjacent", () => {
    const square = addSquare(createEmptyMeshDocument(), [18, 59], 0.01);
    const triangle = removeMeshVertex(
      square.document,
      square.document.faces[0]!.vertexIds[0]!,
    );
    const face = triangle.faces[0]!;

    expect(
      subdivideFaceBetweenVertices(
        triangle,
        face.vertexIds[0]!,
        face.vertexIds[1]!,
      ),
    ).toBeNull();
    expect(
      subdivideFaceBetweenVertices(
        triangle,
        face.vertexIds[1]!,
        face.vertexIds[2]!,
      ),
    ).toBeNull();
  });

  it("creates a new face from four existing vertices", () => {
    const square = addSquare(createEmptyMeshDocument(), [18, 59], 0.01);
    const extruded = extrudeFaceAlongEdge(square.document, square.faceId, 0);
    const source = extruded.document.faces[0]!;
    const grown = extruded.document.faces[1]!;
    const vertexIds = [
      source.vertexIds[2]!,
      source.vertexIds[3]!,
      grown.vertexIds[2]!,
      grown.vertexIds[3]!,
    ];

    const result = createFaceFromVertices(extruded.document, vertexIds);

    expect(result).not.toBeNull();
    expect(result!.document.faces).toHaveLength(3);
    expect(result!.document.faces.at(-1)?.vertexIds).toHaveLength(4);
    expect(orderVertexIdsForFace(extruded.document, vertexIds)).toEqual(
      result!.document.faces.at(-1)?.vertexIds,
    );
  });

  it("rejects creating a duplicate face from the same four vertices", () => {
    const square = addSquare(createEmptyMeshDocument(), [18, 59], 0.01);
    const vertexIds = square.document.faces[0]!.vertexIds;

    expect(createFaceFromVertices(square.document, vertexIds)).toBeNull();
  });

  it("rejects creating a face from fewer than four vertices", () => {
    const square = addSquare(createEmptyMeshDocument(), [18, 59], 0.01);
    const vertexIds = square.document.faces[0]!.vertexIds.slice(0, 3);

    expect(createFaceFromVertices(square.document, vertexIds)).toBeNull();
  });

  it("merges two faces that share an edge into one face", () => {
    const square = addSquare(createEmptyMeshDocument(), [18, 59], 0.01);
    const extruded = extrudeFaceAlongEdge(square.document, square.faceId, 0);
    const faceIdA = extruded.document.faces[0]!.id;
    const faceIdB = extruded.document.faces[1]!.id;

    expect(canMergeFaces(extruded.document, faceIdA, faceIdB)).toBe(true);

    const result = mergeFaces(extruded.document, faceIdA, faceIdB);

    expect(result).not.toBeNull();
    expect(result!.document.faces).toHaveLength(1);
    expect(result!.document.faces[0]?.vertexIds).toHaveLength(6);
    expect(Object.keys(result!.document.vertices)).toHaveLength(6);
  });

  it("rejects merging faces that do not share an edge", () => {
    const firstSquare = addSquare(createEmptyMeshDocument(), [18, 59], 0.01);
    const secondSquare = addSquare(firstSquare.document, [18.03, 59], 0.01);

    expect(
      canMergeFaces(secondSquare.document, secondSquare.document.faces[0]!.id, secondSquare.faceId),
    ).toBe(false);
    expect(
      mergeFaces(secondSquare.document, secondSquare.document.faces[0]!.id, secondSquare.faceId),
    ).toBeNull();
  });

  it("rejects merging a face with itself", () => {
    const square = addSquare(createEmptyMeshDocument(), [18, 59], 0.01);

    expect(canMergeFaces(square.document, square.faceId, square.faceId)).toBe(false);
    expect(mergeFaces(square.document, square.faceId, square.faceId)).toBeNull();
  });

  it("merges faces that share a geometric edge with different vertex ids", () => {
    const firstSquare = addSquare(createEmptyMeshDocument(), [18, 59], 0.01);
    const secondSquare = addSquare(firstSquare.document, [18.02, 59], 0.01);
    const faceIdA = firstSquare.document.faces[0]!.id;
    const faceIdB = secondSquare.faceId;

    expect(canMergeFaces(secondSquare.document, faceIdA, faceIdB)).toBe(true);

    const result = mergeFaces(secondSquare.document, faceIdA, faceIdB);

    expect(result).not.toBeNull();
    expect(result!.document.faces).toHaveLength(1);
    expect(result!.document.faces[0]?.vertexIds.length).toBeGreaterThanOrEqual(4);
  });

  it("merges two faces created by splitting a face", () => {
    const square = addSquare(createEmptyMeshDocument(), [18, 59], 0.01);
    const face = square.document.faces[0]!;
    const split = subdivideFaceBetweenVertices(
      square.document,
      face.vertexIds[0]!,
      face.vertexIds[2]!,
      face.id,
    );

    expect(split).not.toBeNull();

    const result = mergeFaces(split!.document, split!.faceIdA, split!.faceIdB);

    expect(result).not.toBeNull();
    expect(result!.document.faces).toHaveLength(1);
    expect(result!.document.faces[0]?.vertexIds).toHaveLength(4);
  });

  it("explains why unrelated faces cannot merge", () => {
    const firstSquare = addSquare(createEmptyMeshDocument(), [18, 59], 0.01);
    const secondSquare = addSquare(firstSquare.document, [18.05, 59], 0.01);

    expect(
      explainMergeFacesFailure(
        secondSquare.document,
        secondSquare.document.faces[0]!.id,
        secondSquare.faceId,
      ),
    ).toContain("do not share an edge");
  });

  it("places face labels at the centroid of each visible face", () => {
    const square = addSquare(createEmptyMeshDocument(), [18, 59], 0.01);
    square.document.faces[0]!.name = "North block";
    const labels = buildMeshFaceLabelCollection(square.document);

    expect(labels.features).toHaveLength(1);
    expect(labels.features[0]?.properties?.name).toBe("North block");
    expect(labels.features[0]?.geometry.type).toBe("Point");
    expect(labels.features[0]?.geometry.coordinates).toEqual([18, 59]);
  });

  it("marks boundary vertices as the outer ring", () => {
    const square = addSquare(createEmptyMeshDocument(), [18, 59], 0.01);
    expect(
      square.document.faces[0]!.vertexIds.every(vertexId => isOuterMeshVertex(square.document, vertexId)),
    ).toBe(true);

    let document: MeshDocument = square.document;
    document = extrudeFaceAlongEdge(document, document.faces[0]!.id, 0).document;
    const updated = insertVertexOnSharedEdge(document, document.faces[0]!.id, 0);
    const innerVertexId = updated.faces[0]!.vertexIds[1]!;

    expect(isOuterMeshVertex(updated, innerVertexId)).toBe(false);
    expect(
      updated.faces[0]!.vertexIds.some(vertexId => isOuterMeshVertex(updated, vertexId)),
    ).toBe(true);

    const vertices = buildMeshVertexCollection(updated).features;
    expect(vertices.some(feature => feature.properties?.isOuterRing === true)).toBe(true);
    expect(vertices.some(feature => feature.properties?.isOuterRing !== true)).toBe(true);
  });

  it("toggles face lock and blocks vertex moves on locked faces", () => {
    const square = addSquare(createEmptyMeshDocument(), [18, 59], 0.01);
    const faceId = square.document.faces[0]!.id;
    const vertexId = square.document.faces[0]!.vertexIds[0]!;
    const originalPosition = square.document.vertices[vertexId]!.position;

    const locked = toggleFaceLock(square.document, faceId);
    expect(locked.faces[0]?.locked).toBe(true);
    expect(isMeshVertexLocked(locked, vertexId)).toBe(true);
    expect(isMeshFaceEdgeLocked(locked, faceId, 0)).toBe(true);

    const moved = moveVertex(locked, vertexId, [18.02, 59.02]);
    expect(moved.vertices[vertexId]?.position).toEqual(originalPosition);

    const removed = removeMeshVertex(locked, vertexId);
    expect(removed.vertices[vertexId]?.position).toEqual(originalPosition);

    const unlocked = toggleFaceLock(locked, faceId);
    const movedAfterUnlock = moveVertex(unlocked, vertexId, [18.02, 59.02]);
    expect(movedAfterUnlock.vertices[vertexId]?.position).toEqual([18.02, 59.02]);
  });

  it("marks locked vertices in the vertex collection", () => {
    const square = addSquare(createEmptyMeshDocument(), [18, 59], 0.01);
    const faceId = square.document.faces[0]!.id;
    const locked = toggleFaceLock(square.document, faceId);
    const vertices = buildMeshVertexCollection(locked).features;

    expect(vertices.every(feature => feature.properties?.isLocked === true)).toBe(true);
  });

  it("builds composite boundaries without internal shared edges", () => {
    const square = addSquare(createEmptyMeshDocument(), [18, 59], 0.01);
    const extruded = extrudeFaceAlongEdge(square.document, square.faceId, 0).document;
    const faceAId = extruded.faces[0]!.id;
    const faceBId = extruded.faces[1]!.id;

    let document = renameFace(extruded, faceAId, "Face A");
    document = renameFace(document, faceBId, "Face B");

    const singleBoundary = buildCompositeBoundaryCollection(document, ["Face A"]);
    const combinedBoundary = buildCompositeBoundaryCollection(document, ["Face A", "Face B"]);

    expect(singleBoundary.features).toHaveLength(4);
    expect(combinedBoundary.features).toHaveLength(6);
    expect(combinedBoundary.features.length).toBeLessThan(
      singleBoundary.features.length + singleBoundary.features.length,
    );
  });
});
