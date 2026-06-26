import { describe, expect, it } from "vitest";
import {
  buildIndividualShapesOverlay,
  parseIndividualShapePackageContent,
  preferIndividualShapePackageFiles,
} from "./individualShapePackage";
import { createLoadedGeoJsonFile } from "./loadedGeoJsonFiles";

describe("parseIndividualShapePackageContent", () => {
  it("parses shape packages with metadata and feature", () => {
    const result = parseIndividualShapePackageContent(
      JSON.stringify({
        metadata: {
          id: 10180001,
          old_id: null,
          type: "face",
          name: "Abrahamsberg",
          hash: "abc",
        },
        feature: {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [18, 59],
                [18.1, 59],
                [18.1, 59.1],
                [18, 59.1],
                [18, 59],
              ],
            ],
          },
          properties: {},
        },
      }),
      "face.10180001.geojson.gz",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.metadata?.name).toBe("Abrahamsberg");
    expect(result.data.features[0]?.properties?.individualShapeName).toBe("Abrahamsberg");
    expect(result.data.features[0]?.properties?.individualShapeId).toBe(10180001);
  });

  it("falls back to regular GeoJSON feature collections", () => {
    const result = parseIndividualShapePackageContent(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [18, 59],
                  [18.1, 59],
                  [18.1, 59.1],
                  [18, 59.1],
                  [18, 59],
                ],
              ],
            },
            properties: {},
          },
        ],
      }),
      "district.test.geojson",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.metadata).toBeNull();
    expect(result.data.features).toHaveLength(1);
  });
});

describe("preferIndividualShapePackageFiles", () => {
  it("prefers gzipped packages over plain geojson with the same basename", () => {
    const files = preferIndividualShapePackageFiles([
      { name: "district.1.geojson", path: "districts/district.1.geojson", kind: "file" },
      { name: "district.1.geojson.gz", path: "districts/district.1.geojson.gz", kind: "file" },
      { name: "district.1.json", path: "districts/district.1.json", kind: "file" },
    ]);

    expect(files).toEqual([{ name: "district.1.geojson.gz", path: "districts/district.1.geojson.gz" }]);
  });
});

describe("buildIndividualShapesOverlay", () => {
  it("adds folder colors to visible features", () => {
    const file = createLoadedGeoJsonFile("face.1.geojson.gz", {
      geoJson: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [18, 59],
                  [18.1, 59],
                  [18.1, 59.1],
                  [18, 59.1],
                  [18, 59],
                ],
              ],
            },
            properties: {},
          },
        ],
      },
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [18, 59],
                [18.1, 59],
                [18.1, 59.1],
                [18, 59.1],
                [18, 59],
              ],
            ],
          },
          properties: {},
        },
      ],
      geometrySummary: { Polygon: 1 },
    });

    const overlay = buildIndividualShapesOverlay([file], "face");
    expect(overlay?.features[0]?.properties?.groupColor).toBeTruthy();
    expect(overlay?.features[0]?.properties?.groupLineColor).toBeTruthy();
  });
});
