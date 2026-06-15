import MapboxDraw from "@mapbox/mapbox-gl-draw";
import type { Map as MapLibreMap } from "maplibre-gl";
import { createDrawMapStyles } from "./drawMapStyles";
import { configureGeoViewerMapInteractions } from "./mapNavigation";

MapboxDraw.constants.classes.CANVAS = "maplibregl-canvas";
MapboxDraw.constants.classes.CONTROL_BASE = "maplibregl-ctrl";
MapboxDraw.constants.classes.CONTROL_PREFIX = "maplibregl-ctrl-";
MapboxDraw.constants.classes.CONTROL_GROUP = "maplibregl-ctrl-group";

export type MapDrawControl = MapboxDraw;

const DRAWABLE_GEOMETRY_TYPES = new Set<GeoJSON.Geometry["type"]>([
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
]);

interface AttachMapDrawControlOptions {
  onCreate?: () => void;
}

function toDrawFeatureCollection(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: features.filter(
      feature =>
        feature.type === "Feature" &&
        feature.geometry != null &&
        DRAWABLE_GEOMETRY_TYPES.has(feature.geometry.type),
    ),
  };
}

export function createMapDrawControl(fillOpacity = 0.4, editableOnly = false): MapDrawControl {
  return new MapboxDraw({
    displayControlsDefault: false,
    controls: editableOnly
      ? {}
      : {
          polygon: true,
          trash: true,
        },
    defaultMode: "simple_select",
    styles: createDrawMapStyles(fillOpacity),
  });
}

export function startPolygonDrawing(draw: MapDrawControl): void {
  draw.changeMode("draw_polygon");
}

export function attachMapDrawControl(
  map: MapLibreMap,
  draw: MapDrawControl,
  onChange: (features: GeoJSON.FeatureCollection) => void,
  options: AttachMapDrawControlOptions = {},
): () => void {
  const sync = () => {
    onChange(draw.getAll());
  };

  const handleCreate = () => {
    sync();
    options.onCreate?.();
  };

  const handleModeChange = () => {
    configureGeoViewerMapInteractions(map);
  };

  map.addControl(draw, "top-left");
  configureGeoViewerMapInteractions(map);
  map.on("draw.create", handleCreate);
  map.on("draw.update", sync);
  map.on("draw.delete", sync);
  map.on("draw.modechange", handleModeChange);

  return () => {
    map.off("draw.create", handleCreate);
    map.off("draw.update", sync);
    map.off("draw.delete", sync);
    map.off("draw.modechange", handleModeChange);
    if (map.hasControl(draw)) {
      map.removeControl(draw);
    }
  };
}

export function attachShapeEditDrawControl(
  map: MapLibreMap,
  draw: MapDrawControl,
  features: GeoJSON.Feature[],
  onChange: (features: GeoJSON.Feature[]) => void,
): () => void {
  if (!map.hasControl(draw)) {
    map.addControl(draw, "top-left");
  }
  configureGeoViewerMapInteractions(map);
  draw.set(toDrawFeatureCollection(features));

  const sync = () => {
    onChange(draw.getAll().features);
  };

  const handleModeChange = () => {
    configureGeoViewerMapInteractions(map);
  };

  map.on("draw.update", sync);
  map.on("draw.modechange", handleModeChange);

  return () => {
    map.off("draw.update", sync);
    map.off("draw.modechange", handleModeChange);
    if (map.hasControl(draw)) {
      map.removeControl(draw);
    }
  };
}
