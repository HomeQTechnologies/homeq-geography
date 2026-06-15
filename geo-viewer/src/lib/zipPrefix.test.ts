import { describe, expect, it } from "vitest";

import {
  filterZip5ByPrefix,
  normalizeZip3Prefix,
  partitionNewZip5Suggestions,
} from "./zipPrefix";
import type { GeoSearchSuggestion } from "./types";

function zip5(id: string, postalCode: string): GeoSearchSuggestion {
  return {
    id: `zip5.${id}`,
    hash: id,
    text: postalCode,
    shapeUri: `https://example.com/${id}.json.gzip`,
    postalCode,
  };
}

describe("normalizeZip3Prefix", () => {
  it("accepts three digits", () => {
    expect(normalizeZip3Prefix("113")).toBe("113");
    expect(normalizeZip3Prefix(" 111 ")).toBe("111");
  });

  it("rejects invalid input", () => {
    expect(normalizeZip3Prefix("11")).toBeNull();
    expect(normalizeZip3Prefix("1134")).toBeNull();
    expect(normalizeZip3Prefix("abc")).toBeNull();
  });
});

describe("filterZip5ByPrefix", () => {
  it("keeps only matching 5-digit zip5 suggestions", () => {
    const suggestions = [
      zip5("1", "11345"),
      zip5("2", "11343"),
      zip5("3", "11422"),
      { ...zip5("4", "113"), id: "zip3.113", postalCode: "113" },
    ];

    expect(filterZip5ByPrefix(suggestions, "113")).toEqual([zip5("2", "11343"), zip5("1", "11345")]);
  });
});

describe("partitionNewZip5Suggestions", () => {
  it("skips shapes already on the map", () => {
    const suggestions = [zip5("1", "11345"), zip5("2", "11343")];
    const { toAdd, skipped } = partitionNewZip5Suggestions(suggestions, ["zip5.1"]);

    expect(toAdd).toEqual([zip5("2", "11343")]);
    expect(skipped).toBe(1);
  });
});
