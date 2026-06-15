import { describe, expect, it } from "vitest";
import { createDrawMapStyles, DRAW_POLYGON_FILL_LAYER_ID } from "./drawMapStyles";

describe("createDrawMapStyles", () => {
  it("uses a visible fill opacity instead of the MapboxDraw default", () => {
    const fillLayer = createDrawMapStyles(0.4).find(layer => layer.id === DRAW_POLYGON_FILL_LAYER_ID);

    expect(fillLayer).toBeDefined();
    expect(fillLayer?.paint).toMatchObject({
      "fill-color": expect.any(Array),
      "fill-outline-color": "#0015cc",
      "fill-opacity": [ "case", ["==", ["get", "active"], "true"], 0.55, 0.4 ],
    });
  });

  it("clamps low opacity values to stay readable", () => {
    const fillLayer = createDrawMapStyles(0.05).find(layer => layer.id === DRAW_POLYGON_FILL_LAYER_ID);

    expect(fillLayer?.paint).toMatchObject({
      "fill-opacity": ["case", ["==", ["get", "active"], "true"], 0.4, 0.25],
    });
  });
});
