import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  FillLayer,
  Layer,
  LineLayer,
  Map as MapGL,
  MapLayerMouseEvent,
  MapRef,
  NavigationControl,
  Source,
} from "react-map-gl/maplibre";
import bbox from "@turf/bbox";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { configureGeoViewerMapInteractions } from "../lib/mapNavigation";
import {
  attachMapDrawControl,
  attachShapeEditDrawControl,
  createMapDrawControl,
  startPolygonDrawing,
  type MapDrawControl,
} from "../lib/mapDrawControl";
import { hasSameDrawFeatureCollection } from "../lib/drawPolygons";
import { DRAW_POLYGON_FILL_LAYER_ID } from "../lib/drawMapStyles";
import { getShapeStyle, MapDisplaySettings } from "../lib/mapDisplaySettings";
import { toFeatureCollection } from "../lib/normalizeGeoJson";
import { UNGROUPED_GEO_JSON_COLOR } from "../lib/geoJsonShapeGroups";
import {
  applyDrawEditsToShapeGeoInfo,
  toEditableDrawFeatures,
} from "../lib/shapeGeometryEdit";
import {
  getVisibleFragments,
  isFragmentFocused,
  type FocusedShapeFragment,
} from "../lib/shapeFragments";
import type { SelectedGeoShape } from "../lib/types";
import {
  type MeshDocument,
  type MeshInteractionMode,
} from "../lib/meshSubdivision";
import type { MeshVertexMoveUndoEntry } from "../lib/meshVertexMoveUndo";
import { MeshSubdivisionMapLayers } from "./MeshSubdivisionMapLayers";

const MAP_STYLE = `https://api.maptiler.com/maps/streets-v2/style.json?key=${
  import.meta.env.VITE_MAPTILER_API_KEY ?? ""
}`;

const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export type GeoShapesMapHandle = {
  fitAllShapes: () => void;
  clearDrawing: () => void;
  fitDrawFeature: (feature: GeoJSON.Feature) => void;
  fitToPositions: (positions: GeoJSON.Position[], options?: { maxZoom?: number }) => void;
  fitFeatures: (features: GeoJSON.Feature[], options?: { maxZoom?: number }) => void;
  getMapCenter: () => GeoJSON.Position | null;
  startDrawPolygon: () => void;
};

interface GeoShapesMapProps {
  shapes: SelectedGeoShape[];
  displaySettings: MapDisplaySettings;
  focusFragment?: FocusedShapeFragment | null;
  editFocus?: FocusedShapeFragment | null;
  onFragmentClick?: (shapeId: string, fragmentIndex: number) => void;
  onShapeGeometryChange?: (shapeId: string, geoInfo: GeoJSON.GeoJSON, editedFragmentIndices: number[]) => void;
  drawMode?: boolean;
  isDrawingActive?: boolean;
  drawFeatures?: GeoJSON.FeatureCollection;
  onDrawChange?: (features: GeoJSON.FeatureCollection) => void;
  loadedGeoJsonOverlay?: GeoJSON.FeatureCollection | null;
  loadedGeoJsonLabelOverlay?: GeoJSON.FeatureCollection | null;
  loadedGeoJsonHighlightOverlay?: GeoJSON.FeatureCollection | null;
  geoJsonShapeSelectionEnabled?: boolean;
  onLoadedGeoJsonShapeClick?: (shapeKey: string) => void;
  onDrawComplete?: () => void;
  meshSubdivision?: {
    document: MeshDocument;
    selectedFaceId: string | null;
    selectedEdgeIndex: number | null;
    highlightedCompositeFaceNames: string[];
    interactionMode: MeshInteractionMode;
    outerVerticesLocked: boolean;
    onDocumentChange: (document: MeshDocument) => void;
    onSelectFace: (faceId: string | null) => void;
    onSelectEdge: (faceId: string, edgeIndex: number | null) => void;
    onVertexMoveCommitted?: (entry: MeshVertexMoveUndoEntry) => void;
    onDeleteMeshVertices?: (vertexIds: string[]) => void;
    onMergeError?: (message: string | null) => void;
  } | null;
  meshReferenceOverlay?: GeoJSON.FeatureCollection | null;
}

function toSafeMapId(value: string): string {
  return value.replace(/\./g, "-");
}

export const GeoShapesMap = forwardRef<GeoShapesMapHandle, GeoShapesMapProps>(function GeoShapesMap(
  {
    shapes,
    displaySettings,
    focusFragment,
    editFocus = null,
    onFragmentClick,
    onShapeGeometryChange,
    drawMode = false,
    isDrawingActive = false,
    drawFeatures = EMPTY_FEATURE_COLLECTION,
    onDrawChange,
    loadedGeoJsonOverlay = null,
    loadedGeoJsonLabelOverlay = null,
    loadedGeoJsonHighlightOverlay = null,
    geoJsonShapeSelectionEnabled = false,
    onLoadedGeoJsonShapeClick,
    onDrawComplete,
    meshSubdivision = null,
    meshReferenceOverlay = null,
  },
  ref,
) {
  const mapRef = useRef<MapRef>(null);
  const drawRef = useRef<MapDrawControl | null>(null);
  const editDrawRef = useRef<MapDrawControl | null>(null);
  const editingShapeRef = useRef<SelectedGeoShape | undefined>(undefined);
  const onShapeGeometryChangeRef = useRef(onShapeGeometryChange);
  const onDrawChangeRef = useRef(onDrawChange);
  const onDrawCompleteRef = useRef(onDrawComplete);
  const [isMapReady, setIsMapReady] = useState(false);
  const [meshInsertCursor, setMeshInsertCursor] = useState<string | null>(null);

  editingShapeRef.current = editFocus ? shapes.find(entry => entry.id === editFocus.shapeId) : undefined;
  onShapeGeometryChangeRef.current = onShapeGeometryChange;
  onDrawChangeRef.current = onDrawChange;
  onDrawCompleteRef.current = onDrawComplete;

  useEffect(() => {
    if (!meshSubdivision) {
      setMeshInsertCursor(null);
    }
  }, [meshSubdivision]);

  const loadedShapeCount = shapes.filter(s => s.geoInfo).length;
  const { fillOpacity, typeColors } = displaySettings;
  const meshMode = meshSubdivision != null;
  const shapeEditMode = !drawMode && !meshMode && editFocus != null;
  const editSetupKey =
    editFocus && editingShapeRef.current?.geoInfo
      ? `${editFocus.shapeId}:${editFocus.fragmentIndex ?? "all"}`
      : null;

  const layers = useMemo(
    () =>
      shapes.flatMap(shape => {
        if (!shape.geoInfo) return [];
        if (shapeEditMode && editFocus?.shapeId === shape.id) return [];

        const style = getShapeStyle(typeColors, shape.id);
        const safeShapeId = toSafeMapId(shape.id);

        return getVisibleFragments(shape).map(fragment => {
          const sourceId = `geo-shape-${safeShapeId}-frag-${fragment.index}`;
          const isFocused = isFragmentFocused(focusFragment, shape.id, fragment.index);
          const data = toFeatureCollection([fragment.feature]);
          const fillLayer: FillLayer = {
            id: `${sourceId}-fill`,
            type: "fill",
            source: sourceId,
            paint: {
              "fill-color": style.fill,
              "fill-opacity": isFocused ? Math.min(0.85, fillOpacity + 0.25) : fillOpacity,
            },
          };
          const lineLayer: LineLayer = {
            id: `${sourceId}-line`,
            type: "line",
            source: sourceId,
            paint: {
              "line-color": style.line,
              "line-width": isFocused ? 3 : 2,
            },
          };

          return { sourceId, data, fillLayer, lineLayer };
        });
      }),
    [shapes, fillOpacity, typeColors, focusFragment, shapeEditMode, editFocus?.shapeId],
  );

  const loadedGeoJsonInteractiveLayerIds = useMemo(() => {
    if (!geoJsonShapeSelectionEnabled || !loadedGeoJsonOverlay?.features.length) return [];

    return [
      "geo-json-load-polygon-fill",
      "geo-json-load-polygon-line",
      "geo-json-load-line",
      "geo-json-load-point",
    ];
  }, [geoJsonShapeSelectionEnabled, loadedGeoJsonOverlay]);

  const interactiveLayerIds = useMemo(() => {
    if (drawMode || shapeEditMode || meshMode) {
      return geoJsonShapeSelectionEnabled ? loadedGeoJsonInteractiveLayerIds : [];
    }

    return [...layers.map(layer => layer.fillLayer.id), ...loadedGeoJsonInteractiveLayerIds];
  }, [drawMode, geoJsonShapeSelectionEnabled, layers, loadedGeoJsonInteractiveLayerIds, meshMode, shapeEditMode]);

  const fitBoundsToFeatures = useCallback(
    (features: GeoJSON.Feature[], options?: { maxZoom?: number }) => {
      const map = mapRef.current?.getMap();
      if (!map || features.length === 0) return;

      const [minLng, minLat, maxLng, maxLat] = bbox(toFeatureCollection(features));
      map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        { padding: 48, duration: 600, maxZoom: options?.maxZoom ?? 14 },
      );
    },
    [],
  );

  const fitAllShapes = useCallback(() => {
    if (loadedShapeCount === 0) return;
    const allFeatures = shapes.flatMap(shape =>
      shape.geoInfo ? getVisibleFragments(shape).map(fragment => fragment.feature) : [],
    );
    fitBoundsToFeatures(allFeatures, { maxZoom: 12 });
  }, [shapes, loadedShapeCount, fitBoundsToFeatures]);

  const fitShape = useCallback(
    (shapeId: string) => {
      const shape = shapes.find(s => s.id === shapeId);
      if (!shape?.geoInfo) return;

      const features = getVisibleFragments(shape).map(fragment => fragment.feature);
      fitBoundsToFeatures(features);
    },
    [shapes, fitBoundsToFeatures],
  );

  const fitFragment = useCallback(
    (shapeId: string, fragmentIndex: number) => {
      const shape = shapes.find(s => s.id === shapeId);
      if (!shape?.geoInfo) return;

      const fragment = getVisibleFragments(shape).find(part => part.index === fragmentIndex);
      if (!fragment) return;

      fitBoundsToFeatures([fragment.feature]);
    },
    [shapes, fitBoundsToFeatures],
  );

  const clearDrawing = useCallback(() => {
    drawRef.current?.deleteAll();
    onDrawChange?.(EMPTY_FEATURE_COLLECTION);
  }, [onDrawChange]);

  useEffect(() => {
    if (!isMapReady || loadedShapeCount === 0) return;
    const timer = setTimeout(fitAllShapes, 200);
    return () => clearTimeout(timer);
  }, [isMapReady, loadedShapeCount, fitAllShapes]);

  useEffect(() => {
    if (!isMapReady || !focusFragment || drawMode) return;
    if (focusFragment.fragmentIndex === undefined) {
      fitShape(focusFragment.shapeId);
      return;
    }
    fitFragment(focusFragment.shapeId, focusFragment.fragmentIndex);
  }, [focusFragment, isMapReady, fitShape, fitFragment, drawMode]);

  useEffect(() => {
    if (!drawMode || !isDrawingActive || !drawRef.current || !isMapReady) return;

    const draw = drawRef.current;
    if (draw.getMode() === "draw_polygon") return;

    startPolygonDrawing(draw);
  }, [drawMode, isDrawingActive, isMapReady]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !isMapReady || !onDrawChange || !drawMode) return;

    if (!drawRef.current) {
      drawRef.current = createMapDrawControl(fillOpacity, false);
    }

    const handleDrawChange = (collection: GeoJSON.FeatureCollection) => {
      onDrawChangeRef.current?.(collection);
    };

    const detach = attachMapDrawControl(map, drawRef.current, handleDrawChange, {
      onCreate: () => onDrawCompleteRef.current?.(),
    });
    if (drawFeatures.features.length > 0) {
      drawRef.current.set(drawFeatures);
    }

    return detach;
  }, [drawMode, isMapReady, fillOpacity]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !isMapReady || drawMode || !editFocus || !editSetupKey) return;

    const shape = editingShapeRef.current;
    if (!shape?.geoInfo) return;

    let fragments = getVisibleFragments(shape);
    if (editFocus.fragmentIndex !== undefined) {
      fragments = fragments.filter(fragment => fragment.index === editFocus.fragmentIndex);
    }
    if (fragments.length === 0) return;

    if (!editDrawRef.current) {
      editDrawRef.current = createMapDrawControl(fillOpacity, true);
    }

    const editableFeatures = toEditableDrawFeatures(fragments);

    const detach = attachShapeEditDrawControl(map, editDrawRef.current, editableFeatures, editedFeatures => {
      const currentShape = editingShapeRef.current;
      if (!currentShape?.geoInfo) return;

      const { geoInfo, editedFragmentIndices } = applyDrawEditsToShapeGeoInfo(currentShape, editedFeatures);
      onShapeGeometryChangeRef.current?.(currentShape.id, geoInfo, editedFragmentIndices);
    });

    return detach;
  }, [drawMode, editFocus, editSetupKey, isMapReady, fillOpacity]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !isMapReady || !drawMode) return;

    const inactiveFillOpacity = Math.min(0.85, Math.max(0.25, fillOpacity));
    const activeFillOpacity = Math.min(0.9, inactiveFillOpacity + 0.15);

    if (!map.getLayer(DRAW_POLYGON_FILL_LAYER_ID)) return;

    map.setPaintProperty(DRAW_POLYGON_FILL_LAYER_ID, "fill-opacity", [
      "case",
      ["==", ["get", "active"], "true"],
      activeFillOpacity,
      inactiveFillOpacity,
    ]);
  }, [drawMode, fillOpacity, isMapReady]);

  useEffect(() => {
    const draw = drawRef.current;
    if (!drawMode || !draw || !isMapReady || isDrawingActive) return;

    const mode = draw.getMode();
    if (mode === "direct_select" || mode === "draw_polygon") return;

    const current = draw.getAll();
    if (!hasSameDrawFeatureCollection(current, drawFeatures)) {
      draw.set(drawFeatures);
    }
  }, [drawFeatures, drawMode, isMapReady, isDrawingActive]);

  const handleMapClick = useCallback(
    (event: MapLayerMouseEvent) => {
      if (drawMode && isDrawingActive) return;
      if (meshMode) return;

      if (geoJsonShapeSelectionEnabled && event.features?.length) {
        const loadedFeature = event.features.find(
          candidate => typeof candidate.properties?.geoJsonShapeKey === "string",
        );
        const shapeKey = loadedFeature?.properties?.geoJsonShapeKey;
        if (typeof shapeKey === "string") {
          onLoadedGeoJsonShapeClick?.(shapeKey);
          return;
        }
      }

      const feature = event.features?.[0];
      if (!feature?.properties) return;

      const shapeId = feature.properties.shapeId;
      const fragmentIndex = feature.properties.fragmentIndex;
      if (typeof shapeId !== "string" || typeof fragmentIndex !== "number") return;

      onFragmentClick?.(shapeId, fragmentIndex);
    },
    [
      drawMode,
      geoJsonShapeSelectionEnabled,
      isDrawingActive,
      meshMode,
      onFragmentClick,
      onLoadedGeoJsonShapeClick,
    ],
  );

  const fitDrawFeature = useCallback(
    (feature: GeoJSON.Feature) => {
      fitBoundsToFeatures([feature]);
    },
    [fitBoundsToFeatures],
  );

  const fitToPositions = useCallback(
    (positions: GeoJSON.Position[], options?: { maxZoom?: number }) => {
      if (positions.length === 0) return;

      const pointFeatures = positions.map((coordinate, index) => ({
        type: "Feature" as const,
        properties: { index },
        geometry: {
          type: "Point" as const,
          coordinates: coordinate,
        },
      }));

      fitBoundsToFeatures(pointFeatures, { maxZoom: options?.maxZoom ?? 16 });
    },
    [fitBoundsToFeatures],
  );

  const fitFeatures = useCallback(
    (features: GeoJSON.Feature[], options?: { maxZoom?: number }) => {
      if (features.length === 0) return;
      fitBoundsToFeatures(features, { maxZoom: options?.maxZoom ?? 14 });
    },
    [fitBoundsToFeatures],
  );

  const getMapCenter = useCallback((): GeoJSON.Position | null => {
    const map = mapRef.current?.getMap();
    if (!map) return null;
    const center = map.getCenter();
    return [center.lng, center.lat];
  }, []);

  const startDrawPolygon = useCallback(() => {
    if (!drawRef.current) return;
    startPolygonDrawing(drawRef.current);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      fitAllShapes,
      clearDrawing,
      fitDrawFeature,
      fitToPositions,
      fitFeatures,
      getMapCenter,
      startDrawPolygon,
    }),
    [
      fitAllShapes,
      clearDrawing,
      fitDrawFeature,
      fitToPositions,
      fitFeatures,
      getMapCenter,
      startDrawPolygon,
    ],
  );

  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) {
      configureGeoViewerMapInteractions(map);
    }
    setIsMapReady(true);
  }, []);

  return (
    <div className="relative h-full min-h-[320px] w-full overflow-hidden rounded-lg border border-grey-200">
      <MapGL
        ref={mapRef}
        initialViewState={{
          longitude: 17.9,
          latitude: 62.5,
          zoom: 4,
          pitch: 0,
          bearing: 0,
        }}
        minZoom={3}
        maxZoom={20}
        maxPitch={0}
        minPitch={0}
        dragRotate={false}
        touchPitch={false}
        style={{ width: "100%", height: "100%" }}
        mapStyle={MAP_STYLE}
        onLoad={handleMapLoad}
        onClick={handleMapClick}
        interactiveLayerIds={interactiveLayerIds}
        cursor={meshInsertCursor ?? (isDrawingActive ? "crosshair" : "pointer")}
        trackResize
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        {layers.map(({ sourceId, data, fillLayer, lineLayer }) => (
          <Source key={sourceId} id={sourceId} type="geojson" data={data}>
            <Layer {...fillLayer} />
            <Layer {...lineLayer} />
          </Source>
        ))}
        {loadedGeoJsonOverlay && loadedGeoJsonOverlay.features.length > 0 ? (
          <Source id="geo-json-load" type="geojson" data={loadedGeoJsonOverlay}>
            <Layer
              id="geo-json-load-polygon-fill"
              type="fill"
              filter={["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false]}
              paint={{
                "fill-color": ["coalesce", ["get", "groupColor"], UNGROUPED_GEO_JSON_COLOR.fill],
                "fill-opacity": 0.34,
              }}
            />
            <Layer
              id="geo-json-load-polygon-line"
              type="line"
              filter={["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false]}
              paint={{
                "line-color": ["coalesce", ["get", "groupLineColor"], UNGROUPED_GEO_JSON_COLOR.line],
                "line-width": 2,
              }}
            />
            <Layer
              id="geo-json-load-line"
              type="line"
              filter={["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false]}
              paint={{
                "line-color": ["coalesce", ["get", "groupLineColor"], UNGROUPED_GEO_JSON_COLOR.line],
                "line-width": 3,
              }}
            />
            <Layer
              id="geo-json-load-point"
              type="circle"
              filter={["match", ["geometry-type"], ["Point", "MultiPoint"], true, false]}
              paint={{
                "circle-radius": 6,
                "circle-color": ["coalesce", ["get", "groupColor"], UNGROUPED_GEO_JSON_COLOR.fill],
                "circle-stroke-color": ["coalesce", ["get", "groupLineColor"], UNGROUPED_GEO_JSON_COLOR.line],
                "circle-stroke-width": 2,
              }}
            />
          </Source>
        ) : null}
        {loadedGeoJsonLabelOverlay && loadedGeoJsonLabelOverlay.features.length > 0 ? (
          <Source id="geo-json-load-labels" type="geojson" data={loadedGeoJsonLabelOverlay}>
            <Layer
              id="geo-json-load-labels"
              type="symbol"
              layout={{
                "text-field": ["get", "name"],
                "text-size": 12,
                "text-anchor": "center",
                "text-justify": "center",
                "text-allow-overlap": false,
                "text-ignore-placement": false,
              }}
              paint={{
                "text-color": "#065F46",
                "text-halo-color": "#FFFFFF",
                "text-halo-width": 2,
              }}
            />
          </Source>
        ) : null}
        {loadedGeoJsonHighlightOverlay && loadedGeoJsonHighlightOverlay.features.length > 0 ? (
          <Source id="geo-json-load-highlight" type="geojson" data={loadedGeoJsonHighlightOverlay}>
            <Layer
              id="geo-json-load-highlight-polygon-fill"
              type="fill"
              filter={["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false]}
              paint={{
                "fill-color": "#F59E0B",
                "fill-opacity": 0.45,
              }}
            />
            <Layer
              id="geo-json-load-highlight-polygon-line"
              type="line"
              filter={["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false]}
              paint={{
                "line-color": "#D97706",
                "line-width": 4,
              }}
            />
            <Layer
              id="geo-json-load-highlight-line"
              type="line"
              filter={["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false]}
              paint={{
                "line-color": "#D97706",
                "line-width": 5,
              }}
            />
            <Layer
              id="geo-json-load-highlight-point"
              type="circle"
              filter={["match", ["geometry-type"], ["Point", "MultiPoint"], true, false]}
              paint={{
                "circle-radius": 9,
                "circle-color": "#F59E0B",
                "circle-stroke-color": "#FFFFFF",
                "circle-stroke-width": 3,
              }}
            />
          </Source>
        ) : null}
        {meshReferenceOverlay && meshReferenceOverlay.features.length > 0 ? (
          <Source id="geo-mesh-reference-fill" type="geojson" data={meshReferenceOverlay}>
            <Layer
              id="geo-mesh-reference-fill"
              type="fill"
              filter={["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false]}
              paint={{
                "fill-color": "#6E84A8",
                "fill-opacity": 0.1,
              }}
            />
          </Source>
        ) : null}
        {meshSubdivision ? (
          <MeshSubdivisionMapLayers
            document={meshSubdivision.document}
            selectedFaceId={meshSubdivision.selectedFaceId}
            selectedEdgeIndex={meshSubdivision.selectedEdgeIndex}
            highlightedCompositeFaceNames={meshSubdivision.highlightedCompositeFaceNames}
            interactionMode={meshSubdivision.interactionMode}
            outerVerticesLocked={meshSubdivision.outerVerticesLocked}
            onDocumentChange={meshSubdivision.onDocumentChange}
            onSelectFace={meshSubdivision.onSelectFace}
            onSelectEdge={(faceId, edgeIndex) => meshSubdivision.onSelectEdge(faceId, edgeIndex)}
            onVertexMoveCommitted={meshSubdivision.onVertexMoveCommitted}
            onDeleteMeshVertices={meshSubdivision.onDeleteMeshVertices}
            onMergeError={meshSubdivision.onMergeError}
            onInsertCursorChange={setMeshInsertCursor}
          />
        ) : null}
        {meshReferenceOverlay && meshReferenceOverlay.features.length > 0 ? (
          <Source id="geo-mesh-reference-outline" type="geojson" data={meshReferenceOverlay}>
            <Layer
              id="geo-mesh-reference-line"
              type="line"
              filter={["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false]}
              paint={{
                "line-color": "#1E3A5F",
                "line-width": 3,
                "line-dasharray": [2, 2],
              }}
            />
            <Layer
              id="geo-mesh-reference-linestring"
              type="line"
              filter={["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false]}
              paint={{
                "line-color": "#1E3A5F",
                "line-width": 3,
                "line-dasharray": [2, 2],
              }}
            />
            <Layer
              id="geo-mesh-reference-point"
              type="circle"
              filter={["match", ["geometry-type"], ["Point", "MultiPoint"], true, false]}
              paint={{
                "circle-radius": 5,
                "circle-color": "#1E3A5F",
                "circle-stroke-color": "#FFFFFF",
                "circle-stroke-width": 2,
              }}
            />
          </Source>
        ) : null}
      </MapGL>
    </div>
  );
});
