import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildShapeExportPayload,
  featuresToMultiPolygon,
  generateShapeHash,
  validateShapeDrawExport,
  validateShapeDrawMetadata,
} from "./shapeExport";
import type { ShapeDrawMetadata } from "./shapeDrawTypes";

const polygonFeature: GeoJSON.Feature<GeoJSON.Polygon> = {
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

const metadata: ShapeDrawMetadata = {
  name: "Test area",
  type: "area",
  isPublic: true,
  notes: "Drawn in geo viewer",
};

describe("featuresToMultiPolygon", () => {
  it("merges polygon features into a MultiPolygon", () => {
    expect(featuresToMultiPolygon([polygonFeature])).toEqual({
      type: "MultiPolygon",
      coordinates: [polygonFeature.geometry.coordinates],
    });
  });
});

describe("validateShapeDrawMetadata", () => {
  it("validates metadata without requiring drawn geometry", () => {
    expect(validateShapeDrawMetadata(metadata).valid).toBe(true);
    expect(validateShapeDrawMetadata({ ...metadata, name: "" }).errors).toContain("Name is required.");
  });
});

describe("generateShapeHash", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "test-uuid",
    });
  });

  it("returns a 32-character md5 hash", () => {
    const geometry = featuresToMultiPolygon([polygonFeature]);
    expect(geometry).not.toBeNull();

    const hash = generateShapeHash(metadata, geometry!);

    expect(hash).toMatch(/^[a-f0-9]{32}$/);
    expect(generateShapeHash(metadata, geometry!)).toBe(hash);
  });
});

describe("buildShapeExportPayload", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "test-uuid",
    });
  });

  it("includes all form input values, generated hash, and normalized metadata", () => {
    const payload = buildShapeExportPayload(metadata, [polygonFeature]);

    expect(payload.input).toEqual(metadata);
    expect(payload.metadata).toMatchObject({
      type: "area",
      name: "Test area",
      postal_code: null,
      is_public: true,
      notes: "Drawn in geo viewer",
    });
    expect(payload.metadata.hash).toMatch(/^[a-f0-9]{32}$/);
    expect(payload.metadata.square_km).toBeGreaterThan(0);
    expect(payload.geoJson).toEqual({
      type: "Feature",
      properties: {},
      geometry: featuresToMultiPolygon([polygonFeature]),
    });
  });

  it("requires at least one polygon", () => {
    const validation = validateShapeDrawExport(metadata, []);

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain("Draw at least one polygon on the map.");
  });

  it("uses the selected metadata type in the export payload", () => {
    const payload = buildShapeExportPayload(
      {
        ...metadata,
        type: "municipality",
      },
      [polygonFeature],
    );

    expect(payload.input.type).toBe("municipality");
    expect(payload.metadata.type).toBe("municipality");
  });
});
