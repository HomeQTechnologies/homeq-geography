import { describe, expect, it, vi } from "vitest";
import { addSquare, createEmptyMeshDocument, extrudeFaceAlongEdge } from "./meshSubdivision";
import { clipMeshDocumentToReference } from "./meshReferenceClip";

vi.stubGlobal("crypto", {
  randomUUID: (() => {
    let counter = 0;
    return () => {
      counter += 1;
      return `id-${counter}`;
    };
  })(),
});

const referenceGeoJson: GeoJSON.Feature<GeoJSON.Polygon> = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ],
  },
};

describe("clipMeshDocumentToReference", () => {
  it("clips faces that extend outside the reference", () => {
    const square = addSquare(createEmptyMeshDocument(), [8, 8], 3);
    const result = clipMeshDocumentToReference(square.document, referenceGeoJson);

    expect(result.clippedCount).toBe(1);
    expect(result.removedCount).toBe(0);
    expect(result.document.faces).toHaveLength(1);
    expect(Object.keys(result.document.vertices).length).toBeGreaterThanOrEqual(3);
  });

  it("removes faces that do not overlap the reference", () => {
    const square = addSquare(createEmptyMeshDocument(), [20, 20], 1);
    const result = clipMeshDocumentToReference(square.document, referenceGeoJson);

    expect(result.clippedCount).toBe(0);
    expect(result.removedCount).toBe(1);
    expect(result.document.faces).toHaveLength(0);
  });

  it("leaves already-contained faces unchanged", () => {
    const square = addSquare(createEmptyMeshDocument(), [5, 5], 1);
    const result = clipMeshDocumentToReference(square.document, referenceGeoJson);

    expect(result.clippedCount).toBe(0);
    expect(result.removedCount).toBe(0);
    expect(result.document.faces).toHaveLength(1);
    expect(result.document.faces[0]?.vertexIds).toEqual(square.document.faces[0]?.vertexIds);
  });

  it("clips each face in a linked mesh independently", () => {
    const square = addSquare(createEmptyMeshDocument(), [8, 8], 3);
    const mesh = extrudeFaceAlongEdge(square.document, square.faceId, 0).document;
    const result = clipMeshDocumentToReference(mesh, referenceGeoJson);

    expect(result.document.faces.length).toBeGreaterThan(0);
    expect(result.clippedCount).toBeGreaterThan(0);
  });

  it("clips again after undoing the first clip", () => {
    const square = addSquare(createEmptyMeshDocument(), [8, 8], 3);
    const firstClip = clipMeshDocumentToReference(square.document, referenceGeoJson);

    const secondClip = clipMeshDocumentToReference(square.document, referenceGeoJson);

    expect(firstClip.clippedCount).toBeGreaterThan(0);
    expect(secondClip.clippedCount).toBeGreaterThan(0);
  });

  it("clips again after the mesh grows outside the reference", () => {
    const square = addSquare(createEmptyMeshDocument(), [8, 8], 3);
    const firstClip = clipMeshDocumentToReference(square.document, referenceGeoJson);
    const secondSquare = addSquare(firstClip.document, [8, 8], 3);

    const secondClip = clipMeshDocumentToReference(secondSquare.document, referenceGeoJson);

    expect(firstClip.clippedCount).toBeGreaterThan(0);
    expect(secondClip.clippedCount).toBeGreaterThan(0);
    expect(secondClip.document.faces.length).toBeGreaterThan(0);
  });

  it("clips a face with a tiny overhang on a large reference", () => {
    const square = addSquare(createEmptyMeshDocument(), [9.995, 5], 0.01);
    const result = clipMeshDocumentToReference(square.document, referenceGeoJson);

    expect(result.clippedCount).toBe(1);
    expect(result.document.faces).toHaveLength(1);
  });
});
