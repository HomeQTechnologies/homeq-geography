import { describe, expect, it } from "vitest";
import {
  buildExtractedGeoJsonFilename,
  canCreateGeoShapeFromFeature,
  listLoadedGeoJsonFeatures,
  extractShapesFromFeature,
  extractShapesFromFeatures,
  getDefaultGeoShapeName,
} from "./extractGeoJsonShapes";

describe("extractShapesFromFeature", () => {
  it("keeps a polygon in its native shape including holes", () => {
    const feature: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: "Feature",
      properties: { name: "Area" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [4, 0],
            [4, 4],
            [0, 4],
            [0, 0],
          ],
          [
            [1, 1],
            [2, 1],
            [2, 2],
            [1, 2],
            [1, 1],
          ],
        ],
      },
    };

    const shapes = extractShapesFromFeature(feature, 0);

    expect(shapes).toHaveLength(1);
    expect(shapes[0]?.geometryType).toBe("Polygon");
    expect(shapes[0]?.feature.geometry.coordinates).toHaveLength(2);
  });

  it("splits a MultiPolygon into separate polygon features", () => {
    const feature: GeoJSON.Feature<GeoJSON.MultiPolygon> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
          [
            [
              [2, 2],
              [3, 2],
              [3, 3],
              [2, 2],
            ],
          ],
        ],
      },
    };

    const shapes = extractShapesFromFeature(feature, 1);

    expect(shapes).toHaveLength(2);
    expect(shapes[0]?.geometryType).toBe("Polygon");
    expect(shapes[1]?.geometryType).toBe("Polygon");
    expect(shapes[0]?.label).toContain("1 of 2");
    expect(shapes[1]?.label).toContain("2 of 2");
  });

  it("extracts each geometry in a GeometryCollection", () => {
    const shapes = extractShapesFromFeatures([
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "GeometryCollection",
          geometries: [
            { type: "Point", coordinates: [1, 2] },
            {
              type: "LineString",
              coordinates: [
                [0, 0],
                [1, 1],
              ],
            },
          ],
        },
      },
    ]);

    expect(shapes).toHaveLength(2);
    expect(shapes[0]?.geometryType).toBe("Point");
    expect(shapes[1]?.geometryType).toBe("LineString");
  });
});

describe("listLoadedGeoJsonFeatures", () => {
  it("keeps a MultiPolygon as one feature", () => {
    const feature: GeoJSON.Feature<GeoJSON.MultiPolygon> = {
      type: "Feature",
      properties: { name: "Archipelago" },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
          [
            [
              [2, 2],
              [3, 2],
              [3, 3],
              [2, 2],
            ],
          ],
        ],
      },
    };

    const shapes = listLoadedGeoJsonFeatures([feature]);

    expect(shapes).toHaveLength(1);
    expect(shapes[0]?.geometryType).toBe("MultiPolygon");
    expect(shapes[0]?.label).toBe("Archipelago");
    expect(shapes[0]?.feature.geometry).toEqual(feature.geometry);
  });
});

describe("canCreateGeoShapeFromFeature", () => {
  it("allows polygon geometries", () => {
    expect(
      canCreateGeoShapeFromFeature({
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [] },
      }),
    ).toBe(true);
  });

  it("rejects non-area geometries", () => {
    expect(
      canCreateGeoShapeFromFeature({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: [] },
      }),
    ).toBe(false);
  });
});

describe("getDefaultGeoShapeName", () => {
  it("uses a name property when present", () => {
    expect(
      getDefaultGeoShapeName(
        {
          type: "Feature",
          properties: { name: "Södermalm" },
          geometry: { type: "Polygon", coordinates: [] },
        },
        "Feature 1",
      ),
    ).toBe("Södermalm");
  });

  it("uses PRIMÄRNAMN when present", () => {
    expect(
      getDefaultGeoShapeName(
        {
          type: "Feature",
          properties: { "PRIMÄRNAMN": "Kärralund" },
          geometry: { type: "Polygon", coordinates: [] },
        },
        "Feature 1",
      ),
    ).toBe("Kärralund");
  });
});

describe("buildExtractedGeoJsonFilename", () => {
  it("adds shape suffix when a feature has multiple extracted shapes", () => {
    const filename = buildExtractedGeoJsonFilename(
      "municipality.geojson",
      {
        featureIndex: 0,
        shapeIndex: 1,
        geometryType: "Polygon",
        label: "Feature 1 · Polygon 2 of 2",
        feature: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [] } },
      },
      2,
    );

    expect(filename).toBe("municipality-feature-1-shape-2.geojson");
  });
});
