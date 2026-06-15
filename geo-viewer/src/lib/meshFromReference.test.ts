import { describe, expect, it, vi } from "vitest";
import { createMeshDocumentFromReference } from "./meshFromReference";

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

describe("createMeshDocumentFromReference", () => {
  it("creates one face from a polygon reference", () => {
    const result = createMeshDocumentFromReference(referenceGeoJson);

    expect(result).not.toBeNull();
    expect(result?.document.faces).toHaveLength(1);
    expect(result?.document.faces[0]?.name).toBe("Reference");
    expect(result?.definition.faces).toHaveLength(1);
    expect(result?.definition.faces[0]?.name).toBe("Reference");
    expect(result?.definition.composites).toEqual([]);
    expect(result?.document.faces[0]?.vertexIds).toHaveLength(4);
    expect(Object.keys(result?.document.vertices ?? {})).toHaveLength(4);
  });

  it("creates one face per multipolygon part", () => {
    const multiReference: GeoJSON.Feature<GeoJSON.MultiPolygon> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [0, 0],
              [2, 0],
              [2, 2],
              [0, 2],
              [0, 0],
            ],
          ],
          [
            [
              [5, 5],
              [7, 5],
              [7, 7],
              [5, 7],
              [5, 5],
            ],
          ],
        ],
      },
    };

    const result = createMeshDocumentFromReference(multiReference);

    expect(result?.document.faces).toHaveLength(2);
    expect(result?.document.faces[0]?.name).toBe("Reference 1");
    expect(result?.document.faces[1]?.name).toBe("Reference 2");
  });

  it("shares vertices between adjacent multipolygon parts", () => {
    const sharedEdgeReference: GeoJSON.Feature<GeoJSON.MultiPolygon> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [0, 0],
              [2, 0],
              [2, 2],
              [0, 2],
              [0, 0],
            ],
          ],
          [
            [
              [2, 0],
              [4, 0],
              [4, 2],
              [2, 2],
              [2, 0],
            ],
          ],
        ],
      },
    };

    const result = createMeshDocumentFromReference(sharedEdgeReference);
    const firstFace = result?.document.faces[0];
    const secondFace = result?.document.faces[1];
    const sharedVertexIds = firstFace?.vertexIds.filter(vertexId =>
      secondFace?.vertexIds.includes(vertexId),
    );

    expect(sharedVertexIds?.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(result?.document.vertices ?? {})).toHaveLength(6);
  });

  it("returns null when the reference has no polygon geometry", () => {
    const pointReference: GeoJSON.Feature<GeoJSON.Point> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Point",
        coordinates: [0, 0],
      },
    };

    expect(createMeshDocumentFromReference(pointReference)).toBeNull();
  });
});
