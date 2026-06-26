import { useEffect, useMemo, useRef, useState } from "react";
import { Layer, MapLayerMouseEvent, Source, useMap } from "react-map-gl/maplibre";
import {
  buildCompositeBoundaryCollection,
  buildCompositeFaceHighlightCollection,
  buildMeshEdgeMidpointCollection,
  buildMeshFaceCollection,
  buildMeshFaceLabelCollection,
  buildMeshSubdividePreviewCollection,
  buildMeshVertexCollection,
  buildMeshVertexPickPreviewCollection,
  buildMeshFacePickPreviewCollection,
  buildMeshVertexChainPreviewCollection,
  EMPTY_DELETE_CHAIN_PICK,
  pickDeleteChainVertex,
  type DeleteChainPick,
  createFaceFromVertices,
  mergeFaces,
  explainMergeFacesFailure,
  findMeshFaceAtLngLat,
  findNearestMeshEdge,
  findNearestMeshVertex,
  getMeshEdgeMidpoint,
  insertVertexOnSharedEdge,
  isMeshFaceEdgeLocked,
  isMeshVertexLocked,
  isOuterMeshVertex,
  moveVertex,
  removeMeshVertex,
  extrudeFaceAlongEdge,
  subdivideFaceBetweenVertices,
  type MeshDocument,
  type MeshInteractionMode,
} from "../lib/meshSubdivision";
import type { MeshVertexMoveUndoEntry } from "../lib/meshVertexMoveUndo";
import { hasVertexPositionChanged } from "../lib/meshVertexMoveUndo";

interface HighlightedMeshEdge {
  faceId: string;
  edgeIndex: number;
  position: GeoJSON.Position;
}

interface MeshSubdivisionMapLayersProps {
  document: MeshDocument;
  selectedFaceId: string | null;
  selectedEdgeIndex: number | null;
  highlightedCompositeFaceNames: string[];
  interactionMode: MeshInteractionMode;
  outerVerticesLocked: boolean;
  onDocumentChange: (document: MeshDocument) => void;
  onSelectFace: (faceId: string | null) => void;
  onSelectEdge: (faceId: string, edgeIndex: number | null) => void;
  onInsertCursorChange?: (cursor: string | null) => void;
  onVertexMoveCommitted?: (entry: MeshVertexMoveUndoEntry) => void;
  onDeleteMeshVertices?: (vertexIds: string[]) => void;
  onMergeError?: (message: string | null) => void;
}

function resolveMeshInsertCursor(options: {
  shiftHeld: boolean;
  interactionMode: MeshInteractionMode;
  highlightedVertexId: string | null;
  highlightedEdge: HighlightedMeshEdge | null;
  subdivideHoverVertexId: string | null;
  createFaceHoverVertexId: string | null;
  deleteChainHoverVertexId: string | null;
  mergeHoverFaceId: string | null;
  dragging: boolean;
}): string | null {
  if (options.dragging) return "grabbing";
  if (options.interactionMode === "subdivide-face") {
    return options.subdivideHoverVertexId ? "pointer" : "crosshair";
  }
  if (options.interactionMode === "create-face") {
    return options.createFaceHoverVertexId ? "pointer" : "crosshair";
  }
  if (options.interactionMode === "delete-vertex-chain") {
    return options.deleteChainHoverVertexId ? "pointer" : "crosshair";
  }
  if (options.interactionMode === "merge-faces") {
    return options.mergeHoverFaceId ? "pointer" : "crosshair";
  }
  if (!options.shiftHeld) return null;
  if (options.highlightedVertexId || options.highlightedEdge) return "pointer";
  return "crosshair";
}

function isVertexPickInteractionMode(mode: MeshInteractionMode): boolean {
  return mode === "subdivide-face" || mode === "create-face" || mode === "delete-vertex-chain";
}

const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export function MeshSubdivisionMapLayers({
  document,
  selectedFaceId,
  selectedEdgeIndex,
  highlightedCompositeFaceNames,
  interactionMode,
  outerVerticesLocked,
  onDocumentChange,
  onSelectFace,
  onSelectEdge,
  onInsertCursorChange,
  onVertexMoveCommitted,
  onDeleteMeshVertices,
  onMergeError,
}: MeshSubdivisionMapLayersProps) {
  const { current: mapRef } = useMap();
  const dragStateRef = useRef<{ vertexId: string; startPosition: GeoJSON.Position } | null>(null);
  const onDocumentChangeRef = useRef(onDocumentChange);
  const onSelectFaceRef = useRef(onSelectFace);
  const onSelectEdgeRef = useRef(onSelectEdge);
  const onInsertCursorChangeRef = useRef(onInsertCursorChange);
  const onVertexMoveCommittedRef = useRef(onVertexMoveCommitted);
  const onDeleteMeshVerticesRef = useRef(onDeleteMeshVertices);
  const onMergeErrorRef = useRef(onMergeError);
  const documentRef = useRef(document);
  const interactionModeRef = useRef(interactionMode);
  const outerVerticesLockedRef = useRef(outerVerticesLocked);
  const selectedFaceIdRef = useRef(selectedFaceId);
  const lastInsertCursorRef = useRef<string | null | undefined>(undefined);
  const shiftHeldRef = useRef(false);
  const highlightedEdgeRef = useRef<HighlightedMeshEdge | null>(null);
  const highlightedVertexIdRef = useRef<string | null>(null);
  const subdividePickVertexIdsRef = useRef<string[]>([]);
  const subdivideHoverVertexIdRef = useRef<string | null>(null);
  const createFacePickVertexIdsRef = useRef<string[]>([]);
  const createFaceHoverVertexIdRef = useRef<string | null>(null);
  const mergePickFaceIdsRef = useRef<string[]>([]);
  const mergeHoverFaceIdRef = useRef<string | null>(null);
  const deleteChainPickRef = useRef<DeleteChainPick>(EMPTY_DELETE_CHAIN_PICK);
  const deleteChainHoverVertexIdRef = useRef<string | null>(null);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [highlightedEdge, setHighlightedEdge] = useState<HighlightedMeshEdge | null>(null);
  const [highlightedVertexId, setHighlightedVertexId] = useState<string | null>(null);
  const [subdividePickVertexIds, setSubdividePickVertexIds] = useState<string[]>([]);
  const [subdivideHoverVertexId, setSubdivideHoverVertexId] = useState<string | null>(null);
  const [createFacePickVertexIds, setCreateFacePickVertexIds] = useState<string[]>([]);
  const [createFaceHoverVertexId, setCreateFaceHoverVertexId] = useState<string | null>(null);
  const [mergePickFaceIds, setMergePickFaceIds] = useState<string[]>([]);
  const [mergeHoverFaceId, setMergeHoverFaceId] = useState<string | null>(null);
  const [deleteChainPick, setDeleteChainPick] = useState<DeleteChainPick>(EMPTY_DELETE_CHAIN_PICK);
  const [deleteChainHoverVertexId, setDeleteChainHoverVertexId] = useState<string | null>(null);

  onDocumentChangeRef.current = onDocumentChange;
  onSelectFaceRef.current = onSelectFace;
  onSelectEdgeRef.current = onSelectEdge;
  onInsertCursorChangeRef.current = onInsertCursorChange;
  onVertexMoveCommittedRef.current = onVertexMoveCommitted;
  onDeleteMeshVerticesRef.current = onDeleteMeshVertices;
  onMergeErrorRef.current = onMergeError;
  documentRef.current = document;
  interactionModeRef.current = interactionMode;
  outerVerticesLockedRef.current = outerVerticesLocked;
  selectedFaceIdRef.current = selectedFaceId;
  shiftHeldRef.current = shiftHeld;
  highlightedEdgeRef.current = highlightedEdge;
  highlightedVertexIdRef.current = highlightedVertexId;
  subdividePickVertexIdsRef.current = subdividePickVertexIds;
  subdivideHoverVertexIdRef.current = subdivideHoverVertexId;
  createFacePickVertexIdsRef.current = createFacePickVertexIds;
  createFaceHoverVertexIdRef.current = createFaceHoverVertexId;
  mergePickFaceIdsRef.current = mergePickFaceIds;
  mergeHoverFaceIdRef.current = mergeHoverFaceId;
  deleteChainPickRef.current = deleteChainPick;
  deleteChainHoverVertexIdRef.current = deleteChainHoverVertexId;

  const clearDeleteChainPick = () => {
    deleteChainPickRef.current = EMPTY_DELETE_CHAIN_PICK;
    setDeleteChainPick(EMPTY_DELETE_CHAIN_PICK);
    setDeleteChainHoverVertexId(null);
    deleteChainHoverVertexIdRef.current = null;
    syncInsertCursor();
  };

  const syncInsertCursor = () => {
    const nextCursor = resolveMeshInsertCursor({
      shiftHeld: shiftHeldRef.current,
      interactionMode: interactionModeRef.current,
      highlightedVertexId: highlightedVertexIdRef.current,
      highlightedEdge: highlightedEdgeRef.current,
      subdivideHoverVertexId: subdivideHoverVertexIdRef.current,
      createFaceHoverVertexId: createFaceHoverVertexIdRef.current,
      deleteChainHoverVertexId: deleteChainHoverVertexIdRef.current,
      mergeHoverFaceId: mergeHoverFaceIdRef.current,
      dragging: dragStateRef.current !== null,
    });

    if (lastInsertCursorRef.current === nextCursor) {
      return;
    }

    lastInsertCursorRef.current = nextCursor;
    onInsertCursorChangeRef.current?.(nextCursor);
  };

  const faceCollection = useMemo(() => buildMeshFaceCollection(document), [document]);
  const faceLabelCollection = useMemo(() => buildMeshFaceLabelCollection(document), [document]);
  const vertexCollection = useMemo(() => buildMeshVertexCollection(document), [document]);
  const edgeMidpointCollection = useMemo(
    () => buildMeshEdgeMidpointCollection(document, selectedFaceId),
    [document, selectedFaceId],
  );
  const selectedEdgeCollection = useMemo(
    () => buildSelectedEdgeCollection(document, selectedFaceId, selectedEdgeIndex),
    [document, selectedFaceId, selectedEdgeIndex],
  );
  const highlightedEdgeMidpointCollection = useMemo((): GeoJSON.FeatureCollection => {
    if (!highlightedEdge) return EMPTY_FEATURE_COLLECTION;

    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Point",
            coordinates: highlightedEdge.position,
          },
        },
      ],
    };
  }, [highlightedEdge]);

  const highlightedVertexCollection = useMemo((): GeoJSON.FeatureCollection => {
    if (!highlightedVertexId) return EMPTY_FEATURE_COLLECTION;

    const vertex = document.vertices[highlightedVertexId];
    if (!vertex) return EMPTY_FEATURE_COLLECTION;

    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { vertexId: vertex.id },
          geometry: {
            type: "Point",
            coordinates: vertex.position,
          },
        },
      ],
    };
  }, [document.vertices, highlightedVertexId]);

  const subdividePreviewVertexIds = useMemo(() => {
    if (subdividePickVertexIds.length === 1 && subdivideHoverVertexId) {
      return [subdividePickVertexIds[0]!, subdivideHoverVertexId];
    }

    return subdividePickVertexIds;
  }, [subdividePickVertexIds, subdivideHoverVertexId]);

  const subdividePreviewCollection = useMemo(
    () => buildMeshSubdividePreviewCollection(document, subdividePreviewVertexIds),
    [document, subdividePreviewVertexIds],
  );

  const createFacePreviewCollection = useMemo(
    () =>
      buildMeshVertexPickPreviewCollection(document, createFacePickVertexIds, {
        hoverVertexId: createFaceHoverVertexId,
        closeRing: createFacePickVertexIds.length === 4,
      }),
    [document, createFacePickVertexIds, createFaceHoverVertexId],
  );

  const mergePreviewFaceIds = useMemo(() => {
    const faceIds = [...mergePickFaceIds];
    if (mergeHoverFaceId && !faceIds.includes(mergeHoverFaceId)) {
      faceIds.push(mergeHoverFaceId);
    }
    return faceIds;
  }, [mergePickFaceIds, mergeHoverFaceId]);

  const mergePreviewCollection = useMemo(
    () => buildMeshFacePickPreviewCollection(document, mergePreviewFaceIds),
    [document, mergePreviewFaceIds],
  );
  const compositeHighlightCollection = useMemo(
    () => buildCompositeFaceHighlightCollection(document, highlightedCompositeFaceNames),
    [document, highlightedCompositeFaceNames],
  );
  const compositeBoundaryCollection = useMemo(
    () => buildCompositeBoundaryCollection(document, highlightedCompositeFaceNames),
    [document, highlightedCompositeFaceNames],
  );
  const deleteChainPreviewCollection = useMemo(
    () =>
      buildMeshVertexChainPreviewCollection(
        document,
        deleteChainPick,
        deleteChainHoverVertexId,
      ),
    [document, deleteChainPick, deleteChainHoverVertexId],
  );

  useEffect(() => {
    setSubdividePickVertexIds([]);
    subdividePickVertexIdsRef.current = [];
    setSubdivideHoverVertexId(null);
    subdivideHoverVertexIdRef.current = null;
    setCreateFacePickVertexIds([]);
    createFacePickVertexIdsRef.current = [];
    setCreateFaceHoverVertexId(null);
    createFaceHoverVertexIdRef.current = null;
    setMergePickFaceIds([]);
    mergePickFaceIdsRef.current = [];
    setMergeHoverFaceId(null);
    mergeHoverFaceIdRef.current = null;
    clearDeleteChainPick();
    syncInsertCursor();
  }, [interactionMode]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Shift") return;
      setShiftHeld(true);
      shiftHeldRef.current = true;
      syncInsertCursor();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Shift") return;
      setShiftHeld(false);
      shiftHeldRef.current = false;
      setHighlightedEdge(null);
      highlightedEdgeRef.current = null;
      setHighlightedVertexId(null);
      highlightedVertexIdRef.current = null;
      syncInsertCursor();
    };

    const handleBlur = () => {
      setShiftHeld(false);
      shiftHeldRef.current = false;
      setHighlightedEdge(null);
      highlightedEdgeRef.current = null;
      setHighlightedVertexId(null);
      highlightedVertexIdRef.current = null;
      syncInsertCursor();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      setShiftHeld(false);
      shiftHeldRef.current = false;
      setHighlightedEdge(null);
      highlightedEdgeRef.current = null;
      setHighlightedVertexId(null);
      highlightedVertexIdRef.current = null;
      onInsertCursorChangeRef.current?.(null);
    };
  }, []);

  useEffect(() => {
    syncInsertCursor();
  }, [
    shiftHeld,
    highlightedEdge,
    highlightedVertexId,
    selectedFaceId,
    subdivideHoverVertexId,
    createFaceHoverVertexId,
    deleteChainHoverVertexId,
    mergeHoverFaceId,
    interactionMode,
  ]);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (interactionModeRef.current !== "delete-vertex-chain") return;
      if (isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();

      if (key === "d" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        const pick = deleteChainPickRef.current;
        if (!pick.isComplete || pick.chainVertexIds.length < 2) return;
        event.preventDefault();
        onDeleteMeshVerticesRef.current?.(pick.chainVertexIds);
        clearDeleteChainPick();
        return;
      }

      if (key === "escape") {
        if (!deleteChainPickRef.current.startId) return;
        event.preventDefault();
        clearDeleteChainPick();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;

    const clearShiftHighlights = () => {
      setHighlightedEdge(previous => (previous === null ? previous : null));
      highlightedEdgeRef.current = null;
      setHighlightedVertexId(previous => (previous === null ? previous : null));
      highlightedVertexIdRef.current = null;
      syncInsertCursor();
    };

    const updateShiftHighlights = (event: MapLayerMouseEvent) => {
      if (!shiftHeldRef.current) {
        clearShiftHighlights();
        return;
      }

      const vertexId = findNearestMeshVertex(map, documentRef.current, event.lngLat);
      if (vertexId) {
        if (
          isMeshVertexLocked(documentRef.current, vertexId) ||
          (outerVerticesLockedRef.current &&
            isOuterMeshVertex(documentRef.current, vertexId))
        ) {
          return;
        }

        highlightedVertexIdRef.current = vertexId;
        setHighlightedVertexId(previous => (previous === vertexId ? previous : vertexId));
        setHighlightedEdge(previous => (previous === null ? previous : null));
        highlightedEdgeRef.current = null;
        syncInsertCursor();
        return;
      }

      setHighlightedVertexId(previous => (previous === null ? previous : null));
      highlightedVertexIdRef.current = null;

      const faceId = selectedFaceIdRef.current;
      if (!faceId) {
        setHighlightedEdge(previous => (previous === null ? previous : null));
        highlightedEdgeRef.current = null;
        syncInsertCursor();
        return;
      }

      const face = documentRef.current.faces.find(entry => entry.id === faceId);
      if (face?.locked) {
        setHighlightedEdge(previous => (previous === null ? previous : null));
        highlightedEdgeRef.current = null;
        syncInsertCursor();
        return;
      }

      const edgeIndex = findNearestMeshEdge(map, documentRef.current, faceId, event.lngLat);
      if (edgeIndex === null) {
        setHighlightedEdge(previous => (previous === null ? previous : null));
        highlightedEdgeRef.current = null;
        syncInsertCursor();
        return;
      }

      const position = getMeshEdgeMidpoint(documentRef.current, faceId, edgeIndex);
      if (!position) {
        setHighlightedEdge(previous => (previous === null ? previous : null));
        highlightedEdgeRef.current = null;
        syncInsertCursor();
        return;
      }

      const nextHighlight = { faceId, edgeIndex, position };
      highlightedEdgeRef.current = nextHighlight;
      setHighlightedEdge(previous => {
        if (
          previous &&
          previous.faceId === faceId &&
          previous.edgeIndex === edgeIndex &&
          previous.position[0] === position[0] &&
          previous.position[1] === position[1]
        ) {
          return previous;
        }

        return nextHighlight;
      });
      syncInsertCursor();
    };

    const updateVertexPickHover = (event: MapLayerMouseEvent) => {
      const mode = interactionModeRef.current;
      if (!isVertexPickInteractionMode(mode) || shiftHeldRef.current) {
        setSubdivideHoverVertexId(previous => (previous === null ? previous : null));
        subdivideHoverVertexIdRef.current = null;
        setCreateFaceHoverVertexId(previous => (previous === null ? previous : null));
        createFaceHoverVertexIdRef.current = null;
        setDeleteChainHoverVertexId(previous => (previous === null ? previous : null));
        deleteChainHoverVertexIdRef.current = null;
        syncInsertCursor();
        return;
      }

      const vertexId = findNearestMeshVertex(map, documentRef.current, event.lngLat);
      if (mode === "subdivide-face") {
        subdivideHoverVertexIdRef.current = vertexId;
        setSubdivideHoverVertexId(previous => (previous === vertexId ? previous : vertexId));
        setCreateFaceHoverVertexId(previous => (previous === null ? previous : null));
        createFaceHoverVertexIdRef.current = null;
        setDeleteChainHoverVertexId(previous => (previous === null ? previous : null));
        deleteChainHoverVertexIdRef.current = null;
      } else if (mode === "create-face") {
        createFaceHoverVertexIdRef.current = vertexId;
        setCreateFaceHoverVertexId(previous => (previous === vertexId ? previous : vertexId));
        setSubdivideHoverVertexId(previous => (previous === null ? previous : null));
        subdivideHoverVertexIdRef.current = null;
        setDeleteChainHoverVertexId(previous => (previous === null ? previous : null));
        deleteChainHoverVertexIdRef.current = null;
      } else {
        deleteChainHoverVertexIdRef.current = vertexId;
        setDeleteChainHoverVertexId(previous => (previous === vertexId ? previous : vertexId));
        setSubdivideHoverVertexId(previous => (previous === null ? previous : null));
        subdivideHoverVertexIdRef.current = null;
        setCreateFaceHoverVertexId(previous => (previous === null ? previous : null));
        createFaceHoverVertexIdRef.current = null;
      }
      syncInsertCursor();
    };

    const handleMouseDown = (event: MapLayerMouseEvent) => {
      if (isVertexPickInteractionMode(interactionModeRef.current)) {
        const vertexId = findNearestMeshVertex(map, documentRef.current, event.lngLat);
        if (vertexId) {
          event.preventDefault();
        }
        return;
      }

      if (
        shiftHeldRef.current &&
        (highlightedVertexIdRef.current || highlightedEdgeRef.current)
      ) {
        event.preventDefault();
        return;
      }

      if (interactionModeRef.current !== "edit-vertices") return;

      const vertexId = findNearestMeshVertex(map, documentRef.current, event.lngLat);
      if (!vertexId) return;

      if (
        isMeshVertexLocked(documentRef.current, vertexId) ||
        (outerVerticesLockedRef.current &&
          isOuterMeshVertex(documentRef.current, vertexId))
      ) {
        return;
      }

      const vertex = documentRef.current.vertices[vertexId];
      if (!vertex) return;

      event.preventDefault();
      dragStateRef.current = {
        vertexId,
        startPosition: [...vertex.position] as GeoJSON.Position,
      };
      syncInsertCursor();
      map.dragPan.disable();
    };

    const updateMergeHover = (event: MapLayerMouseEvent) => {
      if (interactionModeRef.current !== "merge-faces" || shiftHeldRef.current) {
        setMergeHoverFaceId(previous => (previous === null ? previous : null));
        mergeHoverFaceIdRef.current = null;
        syncInsertCursor();
        return;
      }

      const faceId = findMeshFaceAtLngLat(documentRef.current, event.lngLat);
      mergeHoverFaceIdRef.current = faceId;
      setMergeHoverFaceId(previous => (previous === faceId ? previous : faceId));
      syncInsertCursor();
    };

    const handleMouseMove = (event: MapLayerMouseEvent) => {
      const dragState = dragStateRef.current;
      if (dragState) {
        onDocumentChangeRef.current(
          moveVertex(documentRef.current, dragState.vertexId, [event.lngLat.lng, event.lngLat.lat]),
        );
        return;
      }

      if (isVertexPickInteractionMode(interactionModeRef.current)) {
        updateVertexPickHover(event);
        return;
      }

      if (interactionModeRef.current === "merge-faces") {
        updateMergeHover(event);
        return;
      }

      updateShiftHighlights(event);
    };

    const handleMouseUp = () => {
      const dragState = dragStateRef.current;
      if (!dragState) return;

      const currentVertex = documentRef.current.vertices[dragState.vertexId];
      if (
        currentVertex &&
        hasVertexPositionChanged(dragState.startPosition, currentVertex.position)
      ) {
        onVertexMoveCommittedRef.current?.({
          vertexId: dragState.vertexId,
          position: dragState.startPosition,
        });
      }

      dragStateRef.current = null;
      syncInsertCursor();
      map.dragPan.enable();
    };

    const handleClick = (event: MapLayerMouseEvent) => {
      if (dragStateRef.current) return;

      const currentDocument = documentRef.current;
      const mode = interactionModeRef.current;
      const faceId = selectedFaceIdRef.current;
      const activeHighlightedEdge = highlightedEdgeRef.current;
      const activeHighlightedVertexId = highlightedVertexIdRef.current;

      if (shiftHeldRef.current && activeHighlightedVertexId) {
        if (isMeshVertexLocked(currentDocument, activeHighlightedVertexId)) {
          return;
        }

        if (
          outerVerticesLockedRef.current &&
          isOuterMeshVertex(currentDocument, activeHighlightedVertexId)
        ) {
          return;
        }

        const updated = removeMeshVertex(currentDocument, activeHighlightedVertexId);
        onDocumentChangeRef.current(updated);
        setHighlightedVertexId(null);
        highlightedVertexIdRef.current = null;
        syncInsertCursor();

        if (
          selectedFaceIdRef.current &&
          !updated.faces.some(face => face.id === selectedFaceIdRef.current)
        ) {
          onSelectFaceRef.current(updated.faces[0]?.id ?? null);
        }
        return;
      }

      if (shiftHeldRef.current && activeHighlightedEdge) {
        if (
          isMeshFaceEdgeLocked(
            currentDocument,
            activeHighlightedEdge.faceId,
            activeHighlightedEdge.edgeIndex,
          )
        ) {
          return;
        }

        onDocumentChangeRef.current(
          insertVertexOnSharedEdge(
            currentDocument,
            activeHighlightedEdge.faceId,
            activeHighlightedEdge.edgeIndex,
            activeHighlightedEdge.position,
          ),
        );
        return;
      }

      if (mode === "edit-vertices") {
        const vertexId = findNearestMeshVertex(map, currentDocument, event.lngLat);
        if (vertexId) return;

        onSelectFaceRef.current(findMeshFaceAtLngLat(currentDocument, event.lngLat));
        return;
      }

      if (mode === "subdivide-face") {
        const vertexId = findNearestMeshVertex(map, currentDocument, event.lngLat);
        if (!vertexId) {
          onSelectFaceRef.current(findMeshFaceAtLngLat(currentDocument, event.lngLat));
          return;
        }

        const currentPick = subdividePickVertexIdsRef.current;
        if (currentPick.length === 0) {
          subdividePickVertexIdsRef.current = [vertexId];
          setSubdividePickVertexIds([vertexId]);
          return;
        }

        const firstVertexId = currentPick[0]!;
        if (firstVertexId === vertexId) {
          subdividePickVertexIdsRef.current = [];
          setSubdividePickVertexIds([]);
          return;
        }

        const result = subdivideFaceBetweenVertices(
          currentDocument,
          firstVertexId,
          vertexId,
          faceId,
        );
        subdividePickVertexIdsRef.current = [];
        setSubdividePickVertexIds([]);

        if (!result) {
          subdividePickVertexIdsRef.current = [vertexId];
          setSubdividePickVertexIds([vertexId]);
          return;
        }

        onDocumentChangeRef.current(result.document);
        onSelectFaceRef.current(result.faceIdA);
        onSelectEdgeRef.current(result.faceIdA, null);
        return;
      }

      if (mode === "create-face") {
        const vertexId = findNearestMeshVertex(map, currentDocument, event.lngLat);
        if (!vertexId) {
          onSelectFaceRef.current(findMeshFaceAtLngLat(currentDocument, event.lngLat));
          return;
        }

        const currentPick = createFacePickVertexIdsRef.current;
        if (currentPick.includes(vertexId)) {
          const nextPick = currentPick.filter(id => id !== vertexId);
          createFacePickVertexIdsRef.current = nextPick;
          setCreateFacePickVertexIds(nextPick);
          return;
        }

        if (currentPick.length >= 4) {
          createFacePickVertexIdsRef.current = [vertexId];
          setCreateFacePickVertexIds([vertexId]);
          return;
        }

        const nextPick = [...currentPick, vertexId];
        if (nextPick.length < 4) {
          createFacePickVertexIdsRef.current = nextPick;
          setCreateFacePickVertexIds(nextPick);
          return;
        }

        const result = createFaceFromVertices(currentDocument, nextPick);
        createFacePickVertexIdsRef.current = [];
        setCreateFacePickVertexIds([]);

        if (!result) {
          createFacePickVertexIdsRef.current = [vertexId];
          setCreateFacePickVertexIds([vertexId]);
          return;
        }

        onDocumentChangeRef.current(result.document);
        onSelectFaceRef.current(result.faceId);
        onSelectEdgeRef.current(result.faceId, null);
        return;
      }

      if (mode === "delete-vertex-chain") {
        const vertexId = findNearestMeshVertex(map, currentDocument, event.lngLat);
        if (!vertexId) {
          onSelectFaceRef.current(findMeshFaceAtLngLat(currentDocument, event.lngLat));
          return;
        }

        const nextPick = pickDeleteChainVertex(
          currentDocument,
          deleteChainPickRef.current,
          vertexId,
          outerVerticesLockedRef.current,
        );
        if (!nextPick) return;

        deleteChainPickRef.current = nextPick;
        setDeleteChainPick(nextPick);
        return;
      }

      if (mode === "merge-faces") {
        const currentPick = mergePickFaceIdsRef.current;
        const clickedFaceId = findMeshFaceAtLngLat(currentDocument, event.lngLat, {
          otherThanFaceId: currentPick.length === 1 ? currentPick[0] : null,
        });
        if (!clickedFaceId) return;

        onMergeErrorRef.current?.(null);

        if (currentPick.length === 0) {
          mergePickFaceIdsRef.current = [clickedFaceId];
          setMergePickFaceIds([clickedFaceId]);
          onSelectFaceRef.current(clickedFaceId);
          return;
        }

        const firstFaceId = currentPick[0]!;
        if (firstFaceId === clickedFaceId) {
          mergePickFaceIdsRef.current = [];
          setMergePickFaceIds([]);
          return;
        }

        const result = mergeFaces(currentDocument, firstFaceId, clickedFaceId);
        mergePickFaceIdsRef.current = [];
        setMergePickFaceIds([]);

        if (!result) {
          onMergeErrorRef.current?.(
            explainMergeFacesFailure(currentDocument, firstFaceId, clickedFaceId),
          );
          mergePickFaceIdsRef.current = [clickedFaceId];
          setMergePickFaceIds([clickedFaceId]);
          onSelectFaceRef.current(clickedFaceId);
          return;
        }

        onDocumentChangeRef.current(result.document);
        onSelectFaceRef.current(result.mergedFaceId);
        onSelectEdgeRef.current(result.mergedFaceId, null);
        return;
      }

      if (!faceId) {
        onSelectFaceRef.current(findMeshFaceAtLngLat(currentDocument, event.lngLat));
        return;
      }

      const edgeIndex = findNearestMeshEdge(map, currentDocument, faceId, event.lngLat);
      if (edgeIndex === null) {
        onSelectFaceRef.current(findMeshFaceAtLngLat(currentDocument, event.lngLat));
        return;
      }

      if (mode === "extrude-edge") {
        onSelectEdgeRef.current(faceId, edgeIndex);
        const result = extrudeFaceAlongEdge(currentDocument, faceId, edgeIndex);
        onDocumentChangeRef.current(result.document);
        onSelectFaceRef.current(result.newFaceId);
        onSelectEdgeRef.current(result.newFaceId, 0);
      }
    };

    const handleMouseOut = () => {
      setHighlightedEdge(previous => (previous === null ? previous : null));
      highlightedEdgeRef.current = null;
      setHighlightedVertexId(previous => (previous === null ? previous : null));
      highlightedVertexIdRef.current = null;
      setSubdivideHoverVertexId(previous => (previous === null ? previous : null));
      subdivideHoverVertexIdRef.current = null;
      setCreateFaceHoverVertexId(previous => (previous === null ? previous : null));
      createFaceHoverVertexIdRef.current = null;
      setMergeHoverFaceId(previous => (previous === null ? previous : null));
      mergeHoverFaceIdRef.current = null;
      setDeleteChainHoverVertexId(previous => (previous === null ? previous : null));
      deleteChainHoverVertexIdRef.current = null;
      if (!dragStateRef.current) {
        syncInsertCursor();
      }
    };

    map.on("mousedown", handleMouseDown);
    map.on("mousemove", handleMouseMove);
    map.on("mouseup", handleMouseUp);
    map.on("click", handleClick);
    map.on("mouseout", handleMouseOut);

    return () => {
      map.off("mousedown", handleMouseDown);
      map.off("mousemove", handleMouseMove);
      map.off("mouseup", handleMouseUp);
      map.off("click", handleClick);
      map.off("mouseout", handleMouseOut);
      dragStateRef.current = null;
      map.dragPan.enable();
    };
  }, [mapRef, outerVerticesLocked]);

  useEffect(
    () => () => {
      lastInsertCursorRef.current = undefined;
      onInsertCursorChangeRef.current?.(null);
    },
    [],
  );

  if (document.faces.length === 0) {
    return null;
  }

  return (
    <>
      <Source id="geo-mesh-faces" type="geojson" data={faceCollection}>
        <Layer
          id="geo-mesh-faces-fill"
          type="fill"
          paint={{
            "fill-color": [
              "case",
              ["get", "locked"],
              "#EDE9FE",
              ["==", ["get", "faceId"], selectedFaceId ?? ""],
              "#FEF08A",
              "#93C5FD",
            ],
            "fill-opacity": [
              "case",
              ["get", "locked"],
              0.55,
              ["==", ["get", "faceId"], selectedFaceId ?? ""],
              0.5,
              0.35,
            ],
          }}
        />
        <Layer
          id="geo-mesh-faces-line"
          type="line"
          paint={{
            "line-color": [
              "case",
              ["get", "locked"],
              "#C4B5FD",
              ["==", ["get", "faceId"], selectedFaceId ?? ""],
              "#CA8A04",
              "#2563EB",
            ],
            "line-width": ["case", ["==", ["get", "faceId"], selectedFaceId ?? ""], 3, 2],
          }}
        />
      </Source>
      {faceLabelCollection.features.length > 0 ? (
        <Source id="geo-mesh-face-labels" type="geojson" data={faceLabelCollection}>
          <Layer
            id="geo-mesh-face-labels"
            type="symbol"
            layout={{
              "text-field": ["get", "name"],
              "text-size": 12,
              "text-anchor": "center",
              "text-justify": "center",
              "text-allow-overlap": true,
              "text-ignore-placement": true,
            }}
            paint={{
              "text-color": [
                "case",
                ["==", ["get", "faceId"], selectedFaceId ?? ""],
                "#92400E",
                "#1E3A8A",
              ],
              "text-halo-color": "#FFFFFF",
              "text-halo-width": 2,
            }}
          />
        </Source>
      ) : null}
      <Source id="geo-mesh-edge-midpoints" type="geojson" data={edgeMidpointCollection}>
        <Layer
          id="geo-mesh-edge-midpoints"
          type="circle"
          paint={{
            "circle-radius": 5,
            "circle-color": "#F59E0B",
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-width": 2,
            "circle-opacity": shiftHeld ? 0.95 : 0.65,
          }}
        />
      </Source>
      {highlightedEdgeMidpointCollection.features.length > 0 ? (
        <Source
          id="geo-mesh-edge-midpoint-highlight"
          type="geojson"
          data={highlightedEdgeMidpointCollection}
        >
          <Layer
            id="geo-mesh-edge-midpoint-highlight-outer"
            type="circle"
            paint={{
              "circle-radius": 10,
              "circle-color": "#FF8A3D",
              "circle-opacity": 0.35,
            }}
          />
          <Layer
            id="geo-mesh-edge-midpoint-highlight-inner"
            type="circle"
            paint={{
              "circle-radius": 6,
              "circle-color": "#FF6B00",
              "circle-stroke-color": "#FFFFFF",
              "circle-stroke-width": 2,
            }}
          />
        </Source>
      ) : null}
      {highlightedVertexCollection.features.length > 0 ? (
        <Source id="geo-mesh-vertex-highlight" type="geojson" data={highlightedVertexCollection}>
          <Layer
            id="geo-mesh-vertex-highlight-outer"
            type="circle"
            paint={{
              "circle-radius": 12,
              "circle-color": "#EF4444",
              "circle-opacity": 0.35,
            }}
          />
          <Layer
            id="geo-mesh-vertex-highlight-inner"
            type="circle"
            paint={{
              "circle-radius": 8,
              "circle-color": "#DC2626",
              "circle-stroke-color": "#FFFFFF",
              "circle-stroke-width": 2,
            }}
          />
        </Source>
      ) : null}
      {deleteChainPreviewCollection.features.length > 0 ? (
        <Source id="geo-mesh-delete-chain-preview" type="geojson" data={deleteChainPreviewCollection}>
          <Layer
            id="geo-mesh-delete-chain-preview-line"
            type="line"
            filter={["==", ["geometry-type"], "LineString"]}
            paint={{
              "line-color": "#DC2626",
              "line-width": 3,
              "line-dasharray": [2, 2],
            }}
          />
          <Layer
            id="geo-mesh-delete-chain-preview-points"
            type="circle"
            filter={["==", ["geometry-type"], "Point"]}
            paint={{
              "circle-radius": 9,
              "circle-color": "#DC2626",
              "circle-stroke-color": "#FFFFFF",
              "circle-stroke-width": 2,
            }}
          />
        </Source>
      ) : null}
      {subdividePreviewCollection.features.length > 0 ? (
        <Source id="geo-mesh-subdivide-preview" type="geojson" data={subdividePreviewCollection}>
          <Layer
            id="geo-mesh-subdivide-preview-line"
            type="line"
            filter={["==", ["geometry-type"], "LineString"]}
            paint={{
              "line-color": "#7C3AED",
              "line-width": 3,
              "line-dasharray": [2, 2],
            }}
          />
          <Layer
            id="geo-mesh-subdivide-preview-points"
            type="circle"
            filter={["==", ["geometry-type"], "Point"]}
            paint={{
              "circle-radius": 9,
              "circle-color": "#7C3AED",
              "circle-stroke-color": "#FFFFFF",
              "circle-stroke-width": 2,
            }}
          />
        </Source>
      ) : null}
      {createFacePreviewCollection.features.length > 0 ? (
        <Source id="geo-mesh-create-face-preview" type="geojson" data={createFacePreviewCollection}>
          <Layer
            id="geo-mesh-create-face-preview-line"
            type="line"
            filter={["==", ["geometry-type"], "LineString"]}
            paint={{
              "line-color": "#059669",
              "line-width": 3,
              "line-dasharray": [2, 2],
            }}
          />
          <Layer
            id="geo-mesh-create-face-preview-points"
            type="circle"
            filter={["==", ["geometry-type"], "Point"]}
            paint={{
              "circle-radius": 9,
              "circle-color": "#059669",
              "circle-stroke-color": "#FFFFFF",
              "circle-stroke-width": 2,
            }}
          />
        </Source>
      ) : null}
      {mergePreviewCollection.features.length > 0 ? (
        <Source id="geo-mesh-merge-preview" type="geojson" data={mergePreviewCollection}>
          <Layer
            id="geo-mesh-merge-preview-fill"
            type="fill"
            paint={{
              "fill-color": "#F97316",
              "fill-opacity": 0.35,
            }}
          />
          <Layer
            id="geo-mesh-merge-preview-line"
            type="line"
            paint={{
              "line-color": "#EA580C",
              "line-width": 3,
              "line-dasharray": [2, 2],
            }}
          />
        </Source>
      ) : null}
      {compositeHighlightCollection.features.length > 0 ? (
        <Source id="geo-mesh-composite-highlight" type="geojson" data={compositeHighlightCollection}>
          <Layer
            id="geo-mesh-composite-highlight-fill"
            type="fill"
            paint={{
              "fill-color": "#14B8A6",
              "fill-opacity": 0.28,
            }}
          />
        </Source>
      ) : null}
      {compositeBoundaryCollection.features.length > 0 ? (
        <Source id="geo-mesh-composite-boundary" type="geojson" data={compositeBoundaryCollection}>
          <Layer
            id="geo-mesh-composite-boundary-glow"
            type="line"
            paint={{
              "line-color": "#0F766E",
              "line-width": 8,
              "line-opacity": 0.35,
            }}
          />
          <Layer
            id="geo-mesh-composite-boundary-line"
            type="line"
            paint={{
              "line-color": "#0D9488",
              "line-width": 4,
            }}
          />
        </Source>
      ) : null}
      <Source id="geo-mesh-vertices" type="geojson" data={vertexCollection}>
        <Layer
          id="geo-mesh-vertices"
          type="circle"
          paint={{
            "circle-radius":
              interactionMode === "edit-vertices" ||
              interactionMode === "subdivide-face" ||
              interactionMode === "create-face" ||
              interactionMode === "delete-vertex-chain" ||
              interactionMode === "merge-faces"
                ? 7
                : 4,
            "circle-color": [
              "case",
              ["==", ["get", "isLocked"], true],
              "#DDD6FE",
              ["==", ["get", "isOuterRing"], true],
              "#7C3AED",
              "#1D4ED8",
            ],
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-width": 2,
          }}
        />
      </Source>
      {selectedEdgeCollection.features.length > 0 ? (
        <Source id="geo-mesh-selected-edge" type="geojson" data={selectedEdgeCollection}>
          <Layer
            id="geo-mesh-selected-edge-line"
            type="line"
            paint={{
              "line-color": "#EA580C",
              "line-width": 5,
            }}
          />
        </Source>
      ) : null}
    </>
  );
}

function buildSelectedEdgeCollection(
  document: MeshDocument,
  faceId: string | null,
  edgeIndex: number | null,
): GeoJSON.FeatureCollection {
  if (faceId === null || edgeIndex === null) {
    return { type: "FeatureCollection", features: [] };
  }

  const face = document.faces.find(entry => entry.id === faceId);
  if (!face) {
    return { type: "FeatureCollection", features: [] };
  }

  const startId = face.vertexIds[edgeIndex];
  const endId = face.vertexIds[(edgeIndex + 1) % face.vertexIds.length];
  const start = startId ? document.vertices[startId] : undefined;
  const end = endId ? document.vertices[endId] : undefined;
  if (!start || !end) {
    return { type: "FeatureCollection", features: [] };
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [start.position, end.position],
        },
      },
    ],
  };
}
