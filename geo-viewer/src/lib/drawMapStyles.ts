/** Layer id used by MapboxDraw for polygon fills — useful for live opacity updates. */
export const DRAW_POLYGON_FILL_LAYER_ID = "gl-draw-polygon-fill";

const DRAW_FILL_COLOR = "#394dff";
const DRAW_FILL_COLOR_ACTIVE = "#0015cc";
const DRAW_LINE_COLOR = "#0015cc";
const DRAW_LINE_COLOR_ACTIVE = "#0015cc";
const DRAW_VERTEX_COLOR = "#394dff";
const DRAW_VERTEX_COLOR_ACTIVE = "#0015cc";

type DrawStyleLayer = Record<string, unknown>;

export function createDrawMapStyles(fillOpacity: number): DrawStyleLayer[] {
  const inactiveFillOpacity = Math.min(0.85, Math.max(0.25, fillOpacity));
  const activeFillOpacity = Math.min(0.9, inactiveFillOpacity + 0.15);

  return [
    {
      id: DRAW_POLYGON_FILL_LAYER_ID,
      type: "fill",
      filter: ["all", ["==", "$type", "Polygon"]],
      paint: {
        "fill-color": [
          "case",
          ["==", ["get", "active"], "true"],
          DRAW_FILL_COLOR_ACTIVE,
          DRAW_FILL_COLOR,
        ],
        "fill-outline-color": DRAW_LINE_COLOR,
        "fill-opacity": [
          "case",
          ["==", ["get", "active"], "true"],
          activeFillOpacity,
          inactiveFillOpacity,
        ],
      },
    },
    {
      id: "gl-draw-lines-active",
      type: "line",
      filter: [
        "all",
        ["any", ["==", "$type", "LineString"], ["==", "$type", "Polygon"]],
        ["==", ["get", "active"], "true"],
      ],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": DRAW_LINE_COLOR_ACTIVE,
        "line-dasharray": [0.2, 2],
        "line-width": 3,
      },
    },
    {
      id: "gl-draw-lines-inactive",
      type: "line",
      filter: [
        "all",
        ["any", ["==", "$type", "LineString"], ["==", "$type", "Polygon"]],
        ["!=", ["get", "active"], "true"],
      ],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": DRAW_LINE_COLOR,
        "line-dasharray": [2, 0],
        "line-width": 2.5,
      },
    },
    {
      id: "gl-draw-point-outer",
      type: "circle",
      filter: ["all", ["==", "$type", "Point"], ["==", "meta", "feature"]],
      paint: {
        "circle-radius": ["case", ["==", ["get", "active"], "true"], 7, 5],
        "circle-color": "#ffffff",
      },
    },
    {
      id: "gl-draw-point-inner",
      type: "circle",
      filter: ["all", ["==", "$type", "Point"], ["==", "meta", "feature"]],
      paint: {
        "circle-radius": ["case", ["==", ["get", "active"], "true"], 5, 3],
        "circle-color": [
          "case",
          ["==", ["get", "active"], "true"],
          DRAW_VERTEX_COLOR_ACTIVE,
          DRAW_VERTEX_COLOR,
        ],
      },
    },
    {
      id: "gl-draw-vertex-outer",
      type: "circle",
      filter: [
        "all",
        ["==", "$type", "Point"],
        ["==", "meta", "vertex"],
        ["!=", "mode", "simple_select"],
      ],
      paint: {
        "circle-radius": ["case", ["==", ["get", "active"], "true"], 8, 6],
        "circle-color": "#ffffff",
      },
    },
    {
      id: "gl-draw-vertex-inner",
      type: "circle",
      filter: [
        "all",
        ["==", "$type", "Point"],
        ["==", "meta", "vertex"],
        ["!=", "mode", "simple_select"],
      ],
      paint: {
        "circle-radius": ["case", ["==", ["get", "active"], "true"], 6, 4],
        "circle-color": DRAW_VERTEX_COLOR_ACTIVE,
      },
    },
    {
      id: "gl-draw-midpoint",
      type: "circle",
      filter: ["all", ["==", "meta", "midpoint"]],
      paint: {
        "circle-radius": 4,
        "circle-color": DRAW_VERTEX_COLOR,
      },
    },
  ];
}
