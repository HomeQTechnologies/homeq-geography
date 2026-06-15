import { describe, expect, it } from "vitest";
import {
  getVisibleDrawFeatureCollection,
  mergeDrawControlFeatures,
  removeDrawPolygon,
  toggleDrawPolygonVisibility,
  type DrawPolygonEntry,
} from "./drawPolygons";

const polygonA: GeoJSON.Feature = {
  type: "Feature",
  id: "a",
  properties: {},
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
};

const polygonB: GeoJSON.Feature = {
  type: "Feature",
  id: "b",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [2, 2],
        [3, 2],
        [3, 3],
        [2, 2],
      ],
    ],
  },
};

describe("mergeDrawControlFeatures", () => {
  it("keeps hidden polygons that are not in the active draw control", () => {
    const previous: DrawPolygonEntry[] = [
      { id: "a", feature: polygonA, visible: false },
      { id: "b", feature: polygonB, visible: true },
    ];

    const merged = mergeDrawControlFeatures(previous, [polygonB]);

    expect(merged).toHaveLength(2);
    expect(merged.find(entry => entry.id === "a")?.visible).toBe(false);
    expect(merged.find(entry => entry.id === "b")?.visible).toBe(true);
  });

  it("drops visible polygons removed from the draw control", () => {
    const previous: DrawPolygonEntry[] = [
      { id: "a", feature: polygonA, visible: true },
      { id: "b", feature: polygonB, visible: true },
    ];

    const merged = mergeDrawControlFeatures(previous, [polygonB]);

    expect(merged.map(entry => entry.id)).toEqual(["b"]);
  });
});

describe("draw polygon visibility helpers", () => {
  it("toggles visibility for one polygon", () => {
    const entries: DrawPolygonEntry[] = [
      { id: "a", feature: polygonA, visible: true },
      { id: "b", feature: polygonB, visible: true },
    ];

    const toggled = toggleDrawPolygonVisibility(entries, "a");

    expect(toggled.find(entry => entry.id === "a")?.visible).toBe(false);
    expect(toggled.find(entry => entry.id === "b")?.visible).toBe(true);
  });

  it("returns only visible polygons for map display", () => {
    const entries: DrawPolygonEntry[] = [
      { id: "a", feature: polygonA, visible: false },
      { id: "b", feature: polygonB, visible: true },
    ];

    const collection = getVisibleDrawFeatureCollection(entries);

    expect(collection.features).toEqual([polygonB]);
  });

  it("removes a polygon from the list", () => {
    const entries: DrawPolygonEntry[] = [
      { id: "a", feature: polygonA, visible: true },
      { id: "b", feature: polygonB, visible: true },
    ];

    expect(removeDrawPolygon(entries, "a").map(entry => entry.id)).toEqual(["b"]);
  });
});
