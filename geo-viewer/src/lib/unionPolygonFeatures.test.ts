import { describe, expect, it } from "vitest";
import { canUnionPolygonFeatures, unionPolygonFeatures } from "./unionPolygonFeatures";

const squareA: GeoJSON.Feature = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
        [0, 0],
      ],
    ],
  },
};

const squareB: GeoJSON.Feature = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [1, 0],
        [3, 0],
        [3, 2],
        [1, 2],
        [1, 0],
      ],
    ],
  },
};

describe("unionPolygonFeatures", () => {
  it("merges overlapping polygons into one feature", () => {
    const unioned = unionPolygonFeatures([squareA, squareB]);
    expect(unioned?.geometry.type).toBe("Polygon");
  });

  it("requires at least two polygon features to union", () => {
    expect(canUnionPolygonFeatures([squareA])).toBe(false);
    expect(canUnionPolygonFeatures([squareA, squareB])).toBe(true);
  });

  it("flattens MultiPolygon members before unioning", () => {
    const multi: GeoJSON.Feature = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiPolygon",
        coordinates: [squareA.geometry.coordinates, squareB.geometry.coordinates],
      },
    };

    expect(unionPolygonFeatures([multi])?.geometry.type).toBe("Polygon");
  });

  it("returns null for invalid polygon rings", () => {
    const invalid: GeoJSON.Feature = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [0, 0],
          ],
        ],
      },
    };

    expect(unionPolygonFeatures([invalid, squareA])).toBeNull();
  });
});
