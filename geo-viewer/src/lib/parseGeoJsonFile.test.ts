import { describe, expect, it } from "vitest";
import { formatGeometrySummary, parseGeoJsonFileContent } from "./parseGeoJsonFile";

describe("parseGeoJsonFileContent", () => {
  it("parses a FeatureCollection", () => {
    const result = parseGeoJsonFileContent(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { name: "A" },
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
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.features).toHaveLength(1);
    expect(result.data.geometrySummary.Polygon).toBe(1);
  });

  it("parses a bare geometry object", () => {
    const result = parseGeoJsonFileContent(
      JSON.stringify({
        type: "Point",
        coordinates: [18, 59],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.features[0]?.geometry.type).toBe("Point");
  });

  it("rejects invalid JSON", () => {
    const result = parseGeoJsonFileContent("{ not-json");
    expect(result.ok).toBe(false);
  });

  it("rejects files without geometry", () => {
    const result = parseGeoJsonFileContent(JSON.stringify({ type: "FeatureCollection", features: [] }));
    expect(result.ok).toBe(false);
  });
});

describe("formatGeometrySummary", () => {
  it("formats geometry counts", () => {
    expect(formatGeometrySummary({ Polygon: 2, Point: 1 })).toBe("2 Polygons · 1 Point");
  });
});
