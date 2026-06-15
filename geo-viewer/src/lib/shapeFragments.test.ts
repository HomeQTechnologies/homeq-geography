import { describe, expect, it } from "vitest";

import {
  extractFragmentsFromGeoJson,
  getFragmentLabel,
  getVisibleFragments,
} from "./shapeFragments";
import type { SelectedGeoShape } from "./types";

describe("extractFragmentsFromGeoJson", () => {
  it("splits MultiPolygon into one fragment per polygon part", () => {
    const geoJson: GeoJSON.MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
        [
          [
            [2, 2],
            [3, 2],
            [3, 3],
            [2, 3],
            [2, 2],
          ],
        ],
      ],
    };

    const fragments = extractFragmentsFromGeoJson(geoJson, "shape-1");

    expect(fragments).toHaveLength(2);
    expect(fragments[0].index).toBe(0);
    expect(fragments[1].index).toBe(1);
    expect(fragments[0].feature.properties?.shapeId).toBe("shape-1");
    expect(fragments[0].feature.properties?.fragmentIndex).toBe(0);
    expect(fragments[0].feature.geometry.type).toBe("Polygon");
  });

  it("keeps holes inside a single fragment", () => {
    const geoJson: GeoJSON.Polygon = {
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
    };

    const fragments = extractFragmentsFromGeoJson(geoJson, "shape-2");

    expect(fragments).toHaveLength(1);
    expect(fragments[0].hasHoles).toBe(true);
    expect(fragments[0].feature.geometry.coordinates).toHaveLength(2);
  });
});

describe("getVisibleFragments", () => {
  it("removes closed holes from rendered geometry", () => {
    const geoJson: GeoJSON.Polygon = {
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
    };

    const shape: SelectedGeoShape = {
      id: "shape-2",
      hash: "hash",
      text: "Shape 2",
      shapeUri: "uri",
      geoInfo: geoJson,
      closedHoles: [{ fragmentIndex: 0, holeIndex: 0 }],
    };

    const [fragment] = getVisibleFragments(shape);

    expect(fragment.hasHoles).toBe(false);
    expect(fragment.feature.geometry.coordinates).toHaveLength(1);
  });
});

describe("getFragmentLabel", () => {
  it("includes hole count when present", () => {
    expect(
      getFragmentLabel({
        index: 0,
        feature: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [] } },
        ringCount: 2,
        hasHoles: true,
      }),
    ).toBe("Part 1 (1 hole)");
  });

  it("uses the provided open hole count", () => {
    expect(
      getFragmentLabel(
        {
          index: 0,
          feature: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [] } },
          ringCount: 3,
          hasHoles: true,
        },
        1,
      ),
    ).toBe("Part 1 (1 hole)");
  });
});
