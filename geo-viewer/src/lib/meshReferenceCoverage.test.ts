import { describe, expect, it, vi } from "vitest";
import { addSquare, createEmptyMeshDocument } from "./meshSubdivision";
import { computeMeshReferenceCoverage } from "./meshReferenceCoverage";

vi.stubGlobal("crypto", {
  randomUUID: (() => {
    let counter = 0;
    return () => {
      counter += 1;
      return `id-${counter}`;
    };
  })(),
});

const referenceGeoJson: GeoJSON.Feature<GeoJSON.Polygon> = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ],
  },
};

describe("computeMeshReferenceCoverage", () => {
  it("returns zero coverage when the mesh is empty", () => {
    const coverage = computeMeshReferenceCoverage(createEmptyMeshDocument(), referenceGeoJson);

    expect(coverage?.coveragePercent).toBe(0);
    expect(coverage?.fullyCoversReference).toBe(false);
  });

  it("reports partial coverage for a mesh inside the reference", () => {
    const mesh = addSquare(createEmptyMeshDocument(), [2, 2], 2).document;
    const coverage = computeMeshReferenceCoverage(mesh, referenceGeoJson);

    expect(coverage?.coveragePercent).toBeGreaterThan(0);
    expect(coverage?.coveragePercent).toBeLessThan(100);
    expect(coverage?.fullyCoversReference).toBe(false);
  });

  it("reports full coverage when the mesh covers the reference", () => {
    const mesh = addSquare(createEmptyMeshDocument(), [5, 5], 8).document;
    const coverage = computeMeshReferenceCoverage(mesh, referenceGeoJson);

    expect(coverage?.coveragePercent).toBeGreaterThanOrEqual(99.9);
    expect(coverage?.fullyCoversReference).toBe(true);
  });

  it("counts coverage on the reference even when the mesh extends outside", () => {
    const mesh = addSquare(createEmptyMeshDocument(), [5, 5], 12).document;
    const coverage = computeMeshReferenceCoverage(mesh, referenceGeoJson);

    expect(coverage?.coveragePercent).toBeGreaterThanOrEqual(99.9);
    expect(coverage?.fullyCoversReference).toBe(true);
  });
});
