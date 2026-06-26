import { describe, expect, it } from "vitest";
import {
  assignShapeToGroup,
  assignShapesToGroup,
  createEmptyGeoJsonShapeGroup,
  createGeoJsonShapeGroup,
  getLoadedGeoJsonShapeColor,
  getLoadedGeoJsonFileColor,
  getGroupFeatures,
  getNextGroupColor,
  getShapeKey,
  getUnionShapeKey,
  pruneGeoJsonShapeGroups,
  setGroupUnion,
} from "./geoJsonShapeGroups";

describe("geoJsonShapeGroups", () => {
  it("resolves grouped features by shape key", () => {
    const key = getShapeKey("file-1", 0, 0);
    const feature: GeoJSON.Feature = {
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [] },
    };
    const group = createGeoJsonShapeGroup("North area", [key]);

    expect(group.color).toBeTruthy();
    expect(group.lineColor).toBeTruthy();
    expect(getGroupFeatures(group, new Map([[key, feature]]))).toEqual([feature]);
  });

  it("assigns unique colors to new groups", () => {
    const first = createEmptyGeoJsonShapeGroup([]);
    const second = createEmptyGeoJsonShapeGroup([first]);

    expect(first.color).not.toBe(second.color);
    expect(getNextGroupColor([first]).fill).toBe(second.color);
  });

  it("assigns distinct colors per loaded file index", () => {
    expect(getLoadedGeoJsonFileColor(0).fill).not.toBe(getLoadedGeoJsonFileColor(1).fill);
  });

  it("assigns distinct colors per shape in a file", () => {
    const first = getLoadedGeoJsonShapeColor(0, 0, 4);
    const second = getLoadedGeoJsonShapeColor(0, 1, 4);
    const third = getLoadedGeoJsonShapeColor(0, 2, 4);

    expect(first.fill).not.toBe(second.fill);
    expect(second.fill).not.toBe(third.fill);
    expect(first.line).not.toBe(second.line);
  });

  it("uses the file palette color for a single-shape file", () => {
    expect(getLoadedGeoJsonShapeColor(0, 0, 1)).toEqual(getLoadedGeoJsonFileColor(0));
  });

  it("moves multiple shapes into one group", () => {
    const firstKey = getShapeKey("file-1", 0, 0);
    const secondKey = getShapeKey("file-1", 1, 0);
    const group = createEmptyGeoJsonShapeGroup([]);
    const next = assignShapesToGroup([group], [firstKey, secondKey], group.id);

    expect(next[0].shapeKeys).toEqual([firstKey, secondKey]);
  });

  it("moves a shape between groups", () => {
    const shapeKey = getShapeKey("file-1", 0, 0);
    const groups = [
      createGeoJsonShapeGroup("A", [shapeKey]),
      createEmptyGeoJsonShapeGroup([createGeoJsonShapeGroup("A", [shapeKey])]),
    ];
    const targetGroupId = groups[1].id;

    const next = assignShapeToGroup(groups, shapeKey, targetGroupId);

    expect(next[0].shapeKeys).toEqual([]);
    expect(next[1].shapeKeys).toEqual([shapeKey]);
  });

  it("uses the union feature when present", () => {
    const key = getShapeKey("file-1", 0, 0);
    const unionFeature: GeoJSON.Feature = {
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [] },
    };
    const group = setGroupUnion([createGeoJsonShapeGroup("Merged", [key])], createGeoJsonShapeGroup("Merged", [key]).id, unionFeature)[0];

    expect(getGroupFeatures(group, new Map([[key, unionFeature]]))).toEqual([unionFeature]);
    expect(getUnionShapeKey(group.id)).toBe(`union:${group.id}`);
  });

  it("removes invalid shape keys but keeps empty groups", () => {
    const group = createGeoJsonShapeGroup("Empty", ["missing:key"]);
    expect(pruneGeoJsonShapeGroups([group], new Set())).toEqual([
      { ...group, shapeKeys: [] },
    ]);
  });
});
