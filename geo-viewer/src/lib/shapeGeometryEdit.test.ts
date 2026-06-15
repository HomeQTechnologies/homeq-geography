import { describe, expect, it } from "vitest";
import { applyDrawEditsToShapeGeoInfo, getEditFeatureId, toEditableDrawFeatures } from "./shapeGeometryEdit";
import { extractFragmentsFromGeoJson } from "./shapeFragments";
import type { SelectedGeoShape } from "./types";

describe("shapeGeometryEdit", () => {
  it("builds stable draw feature ids", () => {
    expect(getEditFeatureId("area.42", 0)).toBe("edit-area-42-0");
  });

  it("applies moved polygon coordinates back into shape geojson", () => {
    const geoInfo: GeoJSON.Feature = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [18.0, 59.3],
            [18.1, 59.3],
            [18.1, 59.4],
            [18.0, 59.4],
            [18.0, 59.3],
          ],
        ],
      },
    };
    const shape: SelectedGeoShape = {
      id: "area.1",
      hash: "abc",
      text: "Test area",
      shapeUri: "https://example.com/shape.json.gzip",
      geoInfo,
    };

    const [editableFeature] = toEditableDrawFeatures(extractFragmentsFromGeoJson(geoInfo, shape.id));
    const movedFeature: GeoJSON.Feature = {
      ...editableFeature,
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [18.05, 59.35],
            [18.15, 59.35],
            [18.15, 59.45],
            [18.05, 59.45],
            [18.05, 59.35],
          ],
        ],
      },
    };

    const { geoInfo: nextGeoInfo } = applyDrawEditsToShapeGeoInfo(shape, [movedFeature]);
    const [nextFragment] = extractFragmentsFromGeoJson(nextGeoInfo, shape.id);

    expect(nextFragment.feature.geometry.coordinates[0][0]).toEqual([18.05, 59.35]);
  });
});
