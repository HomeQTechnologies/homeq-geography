import { describe, expect, it } from "vitest";
import {
  buildShapeMetadataForFile,
  getDefaultShapeDescription,
  getShapeDescription,
  pruneShapeMetadata,
  setShapeDescription,
} from "./loadedGeoJsonShapeMetadata";
import type { LoadedGeoJsonFile } from "./loadedGeoJsonFiles";

const loadedFile: LoadedGeoJsonFile = {
  id: "file-1",
  fileName: "test.geojson",
  geoJson: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { description: "Imported area" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        },
      },
    ],
  },
  features: [
    {
      type: "Feature",
      properties: { description: "Imported area" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
    },
  ],
  geometrySummary: { Polygon: 1 },
  visible: true,
};

describe("loadedGeoJsonShapeMetadata", () => {
  it("reads description from GeoJSON properties", () => {
    expect(getDefaultShapeDescription(loadedFile.features[0])).toBe("Imported area");
  });

  it("initializes metadata for loaded shapes", () => {
    expect(buildShapeMetadataForFile(loadedFile)).toEqual({
      "file-1:0:0": { description: "Imported area" },
    });
  });

  it("updates and prunes shape metadata", () => {
    const metadata = setShapeDescription({}, "file-1:0:0", "Updated");
    expect(getShapeDescription(metadata, "file-1:0:0")).toBe("Updated");
    expect(pruneShapeMetadata(metadata, new Set())).toEqual({});
  });
});
