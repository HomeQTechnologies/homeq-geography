import { describe, expect, it } from "vitest";

import { mapV3ShapeToSuggestion, partitionNewShapeSuggestions } from "./v3ShapeAdapter";

describe("mapV3ShapeToSuggestion", () => {
  it("maps v3 shape list entries to search suggestions", () => {
    expect(
      mapV3ShapeToSuggestion({
        id: 42,
        main_id: 100,
        type: "area",
        text: "Södermalm test",
        hash: "abc123",
        shape: "https://example.com/geo-json/abc123.json.gzip",
        parent: { id: 180, type: "municipality", name: "Stockholm" },
      }),
    ).toEqual({
      id: "area.42",
      text: "Södermalm test",
      hash: "abc123",
      shapeUri: "https://example.com/geo-json/abc123.json.gzip",
      parent: { name: "Stockholm" },
    });
  });
});

describe("partitionNewShapeSuggestions", () => {
  it("skips shapes that are already selected", () => {
    const suggestions = [
      {
        id: "area.1",
        text: "One",
        hash: "a",
        shapeUri: "https://example.com/1.json.gzip",
      },
      {
        id: "area.2",
        text: "Two",
        hash: "b",
        shapeUri: "https://example.com/2.json.gzip",
      },
    ];

    const { toAdd, skipped } = partitionNewShapeSuggestions(suggestions, ["area.1"]);

    expect(toAdd).toEqual([suggestions[1]]);
    expect(skipped).toBe(1);
  });
});
