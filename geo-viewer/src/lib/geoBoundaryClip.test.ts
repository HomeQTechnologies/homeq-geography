import { describe, expect, it } from "vitest";
import {
  clipFeatureToBoundary,
  geoJsonToBoundaryFeature,
  isReferenceFullyCovered,
} from "./geoBoundaryClip";

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

describe("geoBoundaryClip", () => {
  it("converts GeoJSON features into a polygon feature", () => {
    const boundary = geoJsonToBoundaryFeature(referenceGeoJson);
    expect(boundary?.geometry.type).toBe("MultiPolygon");
  });

  it("clips a polygon that extends outside the boundary", () => {
    const boundary = geoJsonToBoundaryFeature(referenceGeoJson);
    expect(boundary).not.toBeNull();

    const clipped = clipFeatureToBoundary(
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [5, 5],
              [15, 5],
              [15, 15],
              [5, 15],
              [5, 5],
            ],
          ],
        },
      },
      boundary!,
    );

    expect(clipped).not.toBeNull();
    expect(clipFeatureToBoundary(clipped!, boundary!)).not.toBeNull();
  });

  it("treats tiny uncovered gaps as full coverage", () => {
    const referenceAreaSqM = 1_000_000;
    const uncoveredAreaSqM = 1_500;

    expect(isReferenceFullyCovered(uncoveredAreaSqM, referenceAreaSqM)).toBe(true);
  });
});
