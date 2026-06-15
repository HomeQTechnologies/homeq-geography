import MapRounded from "@mui/icons-material/MapRounded";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BodyText, Tab, Tabs } from "@/components/ui";
import { GeoShapeSearchInput } from "./components/GeoShapeSearchInput";
import { ZipPrefixBulkAdd } from "./components/ZipPrefixBulkAdd";
import { GeoShapesMap, type GeoShapesMapHandle } from "./components/GeoShapesMap";
import { MapDisplaySettingsPanel } from "./components/MapDisplaySettingsPanel";
import { GeoJsonLoadPanel } from "./components/GeoJsonLoadPanel";
import { MeshSubdividePanel, getMeshFocusFeatures } from "./components/MeshSubdividePanel";
import type { StartMeshFlowStep } from "./components/StartMeshFlow";
import { ModeDetailPanel, modeHasDetailPanel } from "./components/ModeDetailPanel";
import { MeshDefinitionEditor } from "./components/MeshDefinitionEditor";
import type { LoadedMeshReference } from "./components/loadedMeshReference";
import { ShapeDrawPanel, createDefaultShapeDrawMetadata } from "./components/ShapeDrawPanel";
import { useGeoShapeViewer } from "./hooks/useGeoShapeViewer";
import { useMapDisplaySettings } from "./hooks/useMapDisplaySettings";
import {
  getVisibleDrawFeatureCollection,
  mergeDrawControlFeatures,
  removeDrawPolygon,
  toggleDrawPolygonVisibility,
  type DrawPolygonEntry,
} from "./lib/drawPolygons";
import type { FocusedShapeFragment } from "./lib/shapeFragments";
import type { ShapeDrawMetadata } from "./lib/shapeDrawTypes";
import type { GeoJsonShapeGroup } from "./lib/geoJsonShapeGroups";
import { loadLoadedGeoJsonDraft, saveLoadedGeoJsonDraft } from "./lib/loadedGeoJsonDraftStorage";
import { buildShapeMetadataForLoadedFiles } from "./lib/loadedGeoJsonShapeMetadata";
import {
  buildHighlightedGeoJsonShapesCollection,
  buildLoadedGeoJsonStyledCollection,
  type LoadedGeoJsonFile,
} from "./lib/loadedGeoJsonFiles";
import type { GeoSearchSuggestion } from "./lib/types";
import { parseShapeTypeKey } from "./lib/shapeTypes";
import type { GeoShapeTypeKey } from "./lib/shapeTypes";
import { getVisibleShapes } from "./lib/selectedShapesStorage";
import {
  bringFaceToFront,
  createEmptyMeshDocument,
  moveVertex,
  toggleFaceLock,
  type MeshDocument,
  type MeshInteractionMode,
} from "./lib/meshSubdivision";
import {
  clearMeshDraft,
  loadMeshDraft,
  saveMeshDraft,
  toPersistedMeshDraft,
} from "./lib/meshDraftStorage";
import {
  popMeshVertexMoveUndo,
  pushMeshVertexMoveUndo,
  type MeshVertexMoveUndoEntry,
} from "./lib/meshVertexMoveUndo";
import { fetchShapeGeoJson } from "./lib/geoApi";
import { writeLocalMeshFile } from "./api/localFilesApi";
import {
  buildMeshFileNameFromLabel,
  normalizeMeshWorkspaceFileName,
  serializeMeshFile,
} from "./lib/meshFile";
import {
  buildMeshDefinitionFromDocument,
  cloneMeshDefinition,
  getCompositeFaceNames,
  normalizeMeshDefinition,
  syncMeshDefinitionFacesFromDocument,
  type MeshDefinition,
  validateMeshDefinitionForDocument,
} from "./lib/meshDefinition";
import { buildMeshReferenceOverlay } from "./lib/meshReferenceOverlay";
import { createMeshDocumentFromReference } from "./lib/meshFromReference";
type SidebarMode = "search" | "draw" | "mesh" | "geojson" | "settings";

export default function GeoShapeViewerPage() {
  const initialLoadedGeoJsonDraftRef = useRef(loadLoadedGeoJsonDraft());
  const initialMeshDraftRef = useRef(loadMeshDraft());
  const {
    selectedShapes,
    addShape,
    addShapes,
    removeShape,
    toggleShapeVisibility,
    toggleFragmentVisibility,
    toggleClosedHole,
    clearShapes,
    removeShapesByType,
    updateShapeGeometry,
  } = useGeoShapeViewer();
  const {
    settings,
    hasPartialShapeTypeSelection,
    selectedShapeTypeCount,
    totalShapeTypeCount,
    shapeTypesParam,
    setFillOpacity,
    setTypeColor,
    setShowAll,
    setShapeTypeEnabled,
    enableAllShapeTypes,
    resetSettings,
  } = useMapDisplaySettings();
  const visibleShapes = useMemo(() => getVisibleShapes(selectedShapes), [selectedShapes]);
  const selectedIds = selectedShapes.map(s => s.id);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() => {
    if (initialMeshDraftRef.current && initialMeshDraftRef.current.document.faces.length > 0) {
      return "mesh";
    }
    if (
      initialLoadedGeoJsonDraftRef.current.files.length > 0 ||
      initialLoadedGeoJsonDraftRef.current.groups.length > 0
    ) {
      return "geojson";
    }
    return "search";
  });
  const [isDrawingActive, setIsDrawingActive] = useState(false);
  const [focusedFragment, setFocusedFragment] = useState<FocusedShapeFragment | null>(null);
  const [drawPolygons, setDrawPolygons] = useState<DrawPolygonEntry[]>([]);
  const [drawMetadata, setDrawMetadata] = useState<ShapeDrawMetadata>(() => createDefaultShapeDrawMetadata());
  const [loadedGeoJsonFiles, setLoadedGeoJsonFiles] = useState<LoadedGeoJsonFile[]>(
    () => initialLoadedGeoJsonDraftRef.current.files,
  );
  const [geoJsonShapeGroups, setGeoJsonShapeGroups] = useState<GeoJsonShapeGroup[]>(
    () => initialLoadedGeoJsonDraftRef.current.groups,
  );
  const [loadedGeoJsonShapeMetadata, setLoadedGeoJsonShapeMetadata] = useState(() =>
    buildShapeMetadataForLoadedFiles(
      initialLoadedGeoJsonDraftRef.current.files,
      initialLoadedGeoJsonDraftRef.current.shapeMetadata,
    ),
  );
  const [selectedGeoJsonShapeKeys, setSelectedGeoJsonShapeKeys] = useState<string[]>([]);
  const [meshDocument, setMeshDocument] = useState<MeshDocument>(
    () => initialMeshDraftRef.current?.document ?? createEmptyMeshDocument(),
  );
  const [meshDefinition, setMeshDefinition] = useState<MeshDefinition | null>(() => {
    const draft = initialMeshDraftRef.current;
    if (!draft || draft.document.faces.length === 0) return null;
    return draft.definition
      ? cloneMeshDefinition(normalizeMeshDefinition(draft.definition))
      : buildMeshDefinitionFromDocument(draft.document);
  });
  const [meshSelectedFaceId, setMeshSelectedFaceId] = useState<string | null>(
    () => initialMeshDraftRef.current?.selectedFaceId ?? null,
  );
  const [meshSelectedEdgeIndex, setMeshSelectedEdgeIndex] = useState<number | null>(
    () => initialMeshDraftRef.current?.selectedEdgeIndex ?? null,
  );
  const [meshInteractionMode, setMeshInteractionMode] = useState<MeshInteractionMode>(
    () => initialMeshDraftRef.current?.interactionMode ?? "edit-vertices",
  );
  const [startMeshFlowReference, setStartMeshFlowReference] = useState<LoadedMeshReference | null>(null);
  const [meshVertexMoveUndo, setMeshVertexMoveUndo] = useState<MeshVertexMoveUndoEntry[]>(
    () => initialMeshDraftRef.current?.vertexMoveUndo ?? [],
  );
  const [meshOuterVerticesLocked, setMeshOuterVerticesLocked] = useState(
    () => initialMeshDraftRef.current?.outerVerticesLocked !== false,
  );
  const [meshMergeError, setMeshMergeError] = useState<string | null>(null);
  const [meshSaveFileName, setMeshSaveFileName] = useState(() => {
    const fileName = initialMeshDraftRef.current?.fileName;
    return fileName ? normalizeMeshWorkspaceFileName(fileName) : "";
  });
  const [startMeshFlowStep, setStartMeshFlowStep] = useState<StartMeshFlowStep | null>(null);
  const [startMeshFlowName, setStartMeshFlowName] = useState("");
  const [startMeshFlowError, setStartMeshFlowError] = useState<string | null>(null);
  const [isStartMeshFlowSaving, setIsStartMeshFlowSaving] = useState(false);
  const [isSavingMesh, setIsSavingMesh] = useState(false);
  const [saveMeshMessage, setSaveMeshMessage] = useState<string | null>(null);
  const [saveMeshError, setSaveMeshError] = useState<string | null>(null);
  const [meshDefinitionEditorOpen, setMeshDefinitionEditorOpen] = useState(false);
  const [meshHighlightedCompositeUuid, setMeshHighlightedCompositeUuid] = useState<string | null>(null);

  useEffect(() => {
    if (!meshHighlightedCompositeUuid) return;
    if (!meshDefinition?.composites.some(composite => composite.uuid === meshHighlightedCompositeUuid)) {
      setMeshHighlightedCompositeUuid(null);
    }
  }, [meshDefinition, meshHighlightedCompositeUuid]);
  const mapRef = useRef<GeoShapesMapHandle>(null);
  const canFitAll = visibleShapes.some(shape => shape.geoInfo);
  const drawMode = sidebarMode === "draw";
  const visibleDrawFeatures = useMemo(
    () => getVisibleDrawFeatureCollection(drawPolygons),
    [drawPolygons],
  );
  const meshReferenceOverlay = useMemo(() => {
    if (sidebarMode !== "mesh" || startMeshFlowStep === null) return null;
    return buildMeshReferenceOverlay(startMeshFlowReference?.geoInfo);
  }, [sidebarMode, startMeshFlowReference?.geoInfo, startMeshFlowStep]);
  const loadedGeoJsonOverlay = useMemo(
    () => buildLoadedGeoJsonStyledCollection(loadedGeoJsonFiles, geoJsonShapeGroups),
    [geoJsonShapeGroups, loadedGeoJsonFiles],
  );
  const loadedGeoJsonHighlightOverlay = useMemo(
    () =>
      buildHighlightedGeoJsonShapesCollection(
        loadedGeoJsonFiles,
        geoJsonShapeGroups,
        selectedGeoJsonShapeKeys,
      ),
    [geoJsonShapeGroups, loadedGeoJsonFiles, selectedGeoJsonShapeKeys],
  );

  useEffect(() => {
    if (sidebarMode !== "draw") {
      setIsDrawingActive(false);
    }
  }, [sidebarMode]);

  useEffect(() => {
    if (sidebarMode !== "mesh") {
      setMeshDefinitionEditorOpen(false);
    }
  }, [sidebarMode]);

  useEffect(() => {
    saveLoadedGeoJsonDraft({
      files: loadedGeoJsonFiles,
      groups: geoJsonShapeGroups,
      shapeMetadata: loadedGeoJsonShapeMetadata,
    });
  }, [loadedGeoJsonFiles, geoJsonShapeGroups, loadedGeoJsonShapeMetadata]);

  useEffect(() => {
    if (meshDocument.faces.length === 0) {
      clearMeshDraft();
      return;
    }

    saveMeshDraft(
      toPersistedMeshDraft(
        meshDocument,
        meshSelectedFaceId,
        meshSelectedEdgeIndex,
        meshInteractionMode,
        null,
        null,
        meshVertexMoveUndo,
        meshOuterVerticesLocked,
        meshDefinition,
        normalizeMeshWorkspaceFileName(meshSaveFileName) || null,
      ),
    );
  }, [
    meshDocument,
    meshDefinition,
    meshInteractionMode,
    meshOuterVerticesLocked,
    meshSaveFileName,
    meshSelectedEdgeIndex,
    meshSelectedFaceId,
    meshVertexMoveUndo,
  ]);

  useEffect(() => {
    if (startMeshFlowStep === null || !startMeshFlowReference?.suggestion.shapeUri) return;
    if (startMeshFlowReference.geoInfo || startMeshFlowReference.error) return;

    let cancelled = false;

    void fetchShapeGeoJson(startMeshFlowReference.suggestion.shapeUri)
      .then(geoInfo => {
        if (cancelled) return;
        setStartMeshFlowReference(previous =>
          previous
            ? {
                ...previous,
                geoInfo,
                isLoading: false,
                error: undefined,
              }
            : previous,
        );
      })
      .catch(() => {
        if (cancelled) return;
        setStartMeshFlowReference(previous =>
          previous
            ? {
                ...previous,
                isLoading: false,
                error: "Failed to load geoshape",
              }
            : previous,
        );
      });

    return () => {
      cancelled = true;
    };
  }, [startMeshFlowReference, startMeshFlowStep]);

  useEffect(() => {
    if (startMeshFlowStep !== "loading" || !startMeshFlowReference) return;
    if (startMeshFlowReference.isLoading) return;

    if (startMeshFlowReference.error) {
      setStartMeshFlowError(startMeshFlowReference.error);
      setStartMeshFlowStep("select-shape");
      return;
    }

    if (!startMeshFlowReference.geoInfo) return;

    const result = createMeshDocumentFromReference(startMeshFlowReference.geoInfo);
    if (!result) {
      setStartMeshFlowError("Could not build a mesh from this geoshape.");
      setStartMeshFlowStep("select-shape");
      return;
    }

    setMeshDocument(result.document);
    setMeshDefinition(cloneMeshDefinition(result.definition));
    setMeshSelectedFaceId(result.document.faces[0]?.id ?? null);
    setMeshSelectedEdgeIndex(null);
    setMeshInteractionMode("edit-vertices");
    setMeshVertexMoveUndo([]);
    setStartMeshFlowError(null);
    setStartMeshFlowName(buildMeshFileNameFromLabel(startMeshFlowReference.suggestion.text));
    setStartMeshFlowStep("name");
    mapRef.current?.fitFeatures(getMeshFocusFeatures(result.document), { maxZoom: 14 });
  }, [startMeshFlowReference, startMeshFlowStep]);

  useEffect(() => {
    if (!isDrawingActive || !drawMode) return;
    mapRef.current?.startDrawPolygon();
  }, [isDrawingActive, drawMode]);

  const handleStartDrawing = useCallback(() => {
    setSidebarMode("draw");
    setIsDrawingActive(true);
  }, []);

  const clearFocusForShape = (shapeId: string) => {
    setFocusedFragment(prev => (prev?.shapeId === shapeId ? null : prev));
  };

  const handleDrawChange = useCallback((collection: GeoJSON.FeatureCollection) => {
    setDrawPolygons(previous => mergeDrawControlFeatures(previous, collection.features));
  }, []);

  const handleToggleDrawPolygonVisibility = useCallback((polygonId: string) => {
    setDrawPolygons(previous => toggleDrawPolygonVisibility(previous, polygonId));
  }, []);

  const handleRemoveDrawPolygon = useCallback((polygonId: string) => {
    setDrawPolygons(previous => removeDrawPolygon(previous, polygonId));
  }, []);

  const handleFocusDrawPolygon = useCallback(
    (polygonId: string) => {
      const polygon = drawPolygons.find(entry => entry.id === polygonId);
      if (!polygon?.visible) return;
      mapRef.current?.fitDrawFeature(polygon.feature);
    },
    [drawPolygons],
  );

  const handleStartOver = useCallback(() => {
    mapRef.current?.clearDrawing();
    setDrawPolygons([]);
    setDrawMetadata(createDefaultShapeDrawMetadata());
    setIsDrawingActive(false);
  }, []);

  const handleFitLoadedGeoJsonFile = useCallback(
    (fileId: string) => {
      const file = loadedGeoJsonFiles.find(entry => entry.id === fileId);
      if (!file?.visible) return;

      mapRef.current?.fitFeatures(file.features);
    },
    [loadedGeoJsonFiles],
  );

  const handleFitAllLoadedGeoJson = useCallback(() => {
    const features = loadedGeoJsonFiles.filter(file => file.visible).flatMap(file => file.features);
    if (features.length === 0) return;

    mapRef.current?.fitFeatures(features);
  }, [loadedGeoJsonFiles]);

  const handleFitLoadedGeoJsonShape = useCallback((feature: GeoJSON.Feature) => {
    mapRef.current?.fitFeatures([feature]);
  }, []);

  const handleFitLoadedGeoJsonShapes = useCallback((features: GeoJSON.Feature[]) => {
    mapRef.current?.fitFeatures(features);
  }, []);

  const handleToggleLoadedGeoJsonShapeSelection = useCallback((shapeKey: string) => {
    setSelectedGeoJsonShapeKeys(previous =>
      previous.includes(shapeKey)
        ? previous.filter(key => key !== shapeKey)
        : [...previous, shapeKey],
    );
  }, []);

  useEffect(() => {
    if (sidebarMode !== "geojson") {
      setSelectedGeoJsonShapeKeys([]);
    }
  }, [sidebarMode]);

  const handleMeshDocumentChange = useCallback((document: MeshDocument) => {
    setMeshDocument(document);
    setMeshVertexMoveUndo([]);
  }, []);

  const handleVertexMoveCommitted = useCallback((entry: MeshVertexMoveUndoEntry) => {
    setMeshVertexMoveUndo(previous => pushMeshVertexMoveUndo(previous, entry));
  }, []);

  const handleUndoVertexMove = useCallback(() => {
    setMeshVertexMoveUndo(previous => {
      const { stack, entry } = popMeshVertexMoveUndo(previous);
      if (entry) {
        setMeshDocument(current =>
          current.vertices[entry.vertexId]
            ? moveVertex(current, entry.vertexId, entry.position)
            : current,
        );
      }
      return stack;
    });
  }, []);

  const handleToggleSelectedFaceLock = useCallback(() => {
    if (!meshSelectedFaceId) return;
    setMeshDocument(current => toggleFaceLock(current, meshSelectedFaceId));
  }, [meshSelectedFaceId]);

  useEffect(() => {
    if (sidebarMode !== "mesh") return;

    const isTypingTarget = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && key === "z" && !event.shiftKey) {
        event.preventDefault();
        handleUndoVertexMove();
        return;
      }

      if (key === "l" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        if (!meshSelectedFaceId) return;
        event.preventDefault();
        handleToggleSelectedFaceLock();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleToggleSelectedFaceLock, handleUndoVertexMove, meshSelectedFaceId, sidebarMode]);

  const resetMeshEditingState = useCallback(() => {
    setMeshDocument(createEmptyMeshDocument());
    setMeshSelectedFaceId(null);
    setMeshSelectedEdgeIndex(null);
    setMeshInteractionMode("edit-vertices");
    setMeshVertexMoveUndo([]);
  }, []);

  const clearMeshState = useCallback(() => {
    resetMeshEditingState();
    setStartMeshFlowReference(null);
    setMeshSaveFileName("");
    setMeshDefinition(null);
    setStartMeshFlowStep(null);
    setStartMeshFlowName("");
    setStartMeshFlowError(null);
    setSaveMeshMessage(null);
    setSaveMeshError(null);
    setMeshMergeError(null);
    setMeshDefinitionEditorOpen(false);
    clearMeshDraft();
  }, [resetMeshEditingState]);

  const handleStartMesh = useCallback(() => {
    clearMeshState();
    setStartMeshFlowStep("select-shape");
  }, [clearMeshState]);

  const handleStartMeshFlowSelectShape = useCallback((suggestion: GeoSearchSuggestion) => {
    setStartMeshFlowError(null);
    setStartMeshFlowStep("loading");
    setStartMeshFlowReference({
      suggestion,
      isLoading: true,
    });
  }, []);

  const handleStartMeshFlowCancel = clearMeshState;

  const handleClearMesh = clearMeshState;

  const handleStartMeshFlowComplete = useCallback(async () => {
    const fileName = normalizeMeshWorkspaceFileName(startMeshFlowName);
    if (!fileName || meshDocument.faces.length === 0 || !meshDefinition) return;

    setIsStartMeshFlowSaving(true);
    setStartMeshFlowError(null);

    try {
      await writeLocalMeshFile(fileName, serializeMeshFile(meshDocument, meshDefinition));
      setMeshSaveFileName(fileName);
      setSaveMeshMessage(`Saved ${fileName}.`);
      setSaveMeshError(null);
      setStartMeshFlowReference(null);
      setStartMeshFlowStep(null);
      setStartMeshFlowName("");
    } catch {
      setStartMeshFlowError("Failed to save the mesh file.");
    } finally {
      setIsStartMeshFlowSaving(false);
    }
  }, [meshDefinition, meshDocument, startMeshFlowName]);

  const handleSaveMesh = useCallback(async () => {
    const fileName = normalizeMeshWorkspaceFileName(meshSaveFileName);
    if (!fileName || meshDocument.faces.length === 0 || !meshDefinition) return;

    const syncedDefinition = syncMeshDefinitionFacesFromDocument(meshDocument, meshDefinition);
    const validationError = validateMeshDefinitionForDocument(meshDocument, syncedDefinition);
    if (validationError) {
      setSaveMeshError(validationError);
      setSaveMeshMessage(null);
      return;
    }

    setIsSavingMesh(true);
    setSaveMeshError(null);
    setSaveMeshMessage(null);

    try {
      await writeLocalMeshFile(fileName, serializeMeshFile(meshDocument, syncedDefinition));
      setMeshDefinition(cloneMeshDefinition(syncedDefinition));
      setMeshSaveFileName(fileName);
      setSaveMeshMessage(`Saved ${fileName}.`);
    } catch {
      setSaveMeshError("Failed to save the mesh file.");
    } finally {
      setIsSavingMesh(false);
    }
  }, [meshDefinition, meshDocument, meshSaveFileName]);

  const handleApplyMeshDefinition = useCallback(
    async (definition: MeshDefinition) => {
      const fileName = normalizeMeshWorkspaceFileName(meshSaveFileName);
      if (!fileName) {
        throw new Error("Set a mesh file name in Controls before saving definitions.");
      }
      if (meshDocument.faces.length === 0) {
        throw new Error("Mesh has no faces to save.");
      }

      const syncedDefinition = syncMeshDefinitionFacesFromDocument(meshDocument, definition);
      const validationError = validateMeshDefinitionForDocument(meshDocument, syncedDefinition);
      if (validationError) {
        throw new Error(validationError);
      }

      const nextDefinition = cloneMeshDefinition(syncedDefinition);
      setMeshDefinition(nextDefinition);

      await writeLocalMeshFile(fileName, serializeMeshFile(meshDocument, nextDefinition));
      setMeshSaveFileName(fileName);
      setSaveMeshMessage(`Saved ${fileName}.`);
      setSaveMeshError(null);
    },
    [meshDocument, meshSaveFileName],
  );

  const handleFocusMesh = useCallback(() => {
    const features = getMeshFocusFeatures(meshDocument);
    if (features.length === 0) return;
    mapRef.current?.fitFeatures(features, { maxZoom: 14 });
  }, [meshDocument]);

  const handleImportMesh = useCallback(
    (document: MeshDocument, fileName?: string, definition?: MeshDefinition) => {
      setStartMeshFlowStep(null);
      setStartMeshFlowName("");
      setStartMeshFlowError(null);
      setStartMeshFlowReference(null);
      setSaveMeshMessage(null);
      setSaveMeshError(null);
      setMeshSaveFileName(fileName ? normalizeMeshWorkspaceFileName(fileName) : "");
      setMeshDefinition(definition ? cloneMeshDefinition(normalizeMeshDefinition(definition)) : null);
      setMeshDocument(document);
    setMeshSelectedFaceId(document.faces[0]?.id ?? null);
    setMeshSelectedEdgeIndex(null);
    setMeshInteractionMode("edit-vertices");
    setMeshVertexMoveUndo([]);
    mapRef.current?.fitFeatures(getMeshFocusFeatures(document), { maxZoom: 14 });
    },
    [],
  );

  useEffect(() => {
    if (meshInteractionMode !== "merge-faces") {
      setMeshMergeError(null);
    }
  }, [meshInteractionMode]);

  const handleSelectMeshFace = useCallback((faceId: string | null) => {
    setMeshSelectedFaceId(faceId);
    if (!faceId) {
      setMeshSelectedEdgeIndex(null);
      return;
    }

    setMeshSelectedEdgeIndex(null);
    setMeshDocument(prev => bringFaceToFront(prev, faceId));
  }, []);

  const meshSubdivisionProps = useMemo(() => {
    if (sidebarMode !== "mesh") return null;

    return {
      document: meshDocument,
      selectedFaceId: meshSelectedFaceId,
      selectedEdgeIndex: meshSelectedEdgeIndex,
      highlightedCompositeFaceNames: getCompositeFaceNames(meshDefinition, meshHighlightedCompositeUuid),
      interactionMode: meshInteractionMode,
      onDocumentChange: handleMeshDocumentChange,
      onSelectFace: handleSelectMeshFace,
      onSelectEdge: (faceId: string, edgeIndex: number | null) => {
        setMeshSelectedFaceId(faceId);
        setMeshSelectedEdgeIndex(edgeIndex);
        setMeshDocument(prev => bringFaceToFront(prev, faceId));
      },
      onVertexMoveCommitted: handleVertexMoveCommitted,
      onMergeError: setMeshMergeError,
      outerVerticesLocked: meshOuterVerticesLocked,
    };
  }, [
    handleMeshDocumentChange,
    handleSelectMeshFace,
    handleVertexMoveCommitted,
    meshDocument,
    meshDefinition,
    meshHighlightedCompositeUuid,
    meshInteractionMode,
    meshOuterVerticesLocked,
    meshSelectedEdgeIndex,
    meshSelectedFaceId,
    sidebarMode,
  ]);

  const handleClearShapesByType = useCallback(
    (shapeType: GeoShapeTypeKey) => {
      setFocusedFragment(prev => (prev && parseShapeTypeKey(prev.shapeId) === shapeType ? null : prev));
      return removeShapesByType(shapeType);
    },
    [removeShapesByType],
  );

  const detailPanelProps = useMemo(
    () => ({
      mode: sidebarMode,
      selectedShapes,
      displaySettings: settings,
      focusedFragment,
      canFitAll,
      onFocusShape: (shapeId: string) => setFocusedFragment({ shapeId }),
      onFocusFragment: (shapeId: string, fragmentIndex: number) =>
        setFocusedFragment({ shapeId, fragmentIndex }),
      onFitAll: () => mapRef.current?.fitAllShapes(),
      onToggleVisibility: (shapeId: string) => {
        const shape = selectedShapes.find(s => s.id === shapeId);
        if (shape?.visible !== false) {
          clearFocusForShape(shapeId);
        }
        toggleShapeVisibility(shapeId);
      },
      onToggleFragmentVisibility: toggleFragmentVisibility,
      onToggleClosedHole: toggleClosedHole,
      onRemoveShape: (shapeId: string) => {
        clearFocusForShape(shapeId);
        removeShape(shapeId);
      },
      onClearShapes: () => {
        setFocusedFragment(null);
        clearShapes();
      },
      meshDocument,
      meshDefinition,
      meshDefinitionEditorOpen,
      onOpenMeshDefinitionEditor: () => setMeshDefinitionEditorOpen(true),
      meshSelectedFaceId,
      meshHighlightedCompositeUuid,
      onMeshDocumentChange: handleMeshDocumentChange,
      onSelectMeshFace: handleSelectMeshFace,
      onSelectMeshEdge: (faceId: string, edgeIndex: number | null) => {
        setMeshSelectedFaceId(faceId);
        setMeshSelectedEdgeIndex(edgeIndex);
      },
      onHighlightMeshComposite: setMeshHighlightedCompositeUuid,
    }),
    [
      sidebarMode,
      selectedShapes,
      settings,
      focusedFragment,
      canFitAll,
      clearFocusForShape,
      toggleShapeVisibility,
      toggleFragmentVisibility,
      toggleClosedHole,
      removeShape,
      clearShapes,
      meshDocument,
      meshDefinition,
      meshDefinitionEditorOpen,
      meshSelectedFaceId,
      meshHighlightedCompositeUuid,
      handleMeshDocumentChange,
      handleSelectMeshFace,
    ],
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-grey-50">
      <aside className="border-grey-200 flex w-full shrink-0 flex-col gap-6 overflow-y-auto border-b bg-white p-6 lg:w-96 lg:border-b-0 lg:border-r">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <MapRounded className="text-primary-500 shrink-0" />
              <BodyText type="title-medium">Geo shape viewer</BodyText>
            </div>
            {hasPartialShapeTypeSelection && sidebarMode === "search" && (
              <BodyText color="grey-40" type="label-small">
                Search limited to {selectedShapeTypeCount} of {totalShapeTypeCount} shape types
              </BodyText>
            )}
          </div>

          <Tabs mode="wrap">
            <Tab isActive={sidebarMode === "search"} onClick={() => setSidebarMode("search")}>
              Search
            </Tab>
            <Tab isActive={sidebarMode === "draw"} onClick={() => setSidebarMode("draw")}>
              Draw
            </Tab>
            <Tab isActive={sidebarMode === "mesh"} onClick={() => setSidebarMode("mesh")}>
              Mesh
            </Tab>
            <Tab isActive={sidebarMode === "geojson"} onClick={() => setSidebarMode("geojson")}>
              GeoJSON
            </Tab>
            <Tab isActive={sidebarMode === "settings"} onClick={() => setSidebarMode("settings")}>
              Settings
            </Tab>
          </Tabs>

          {sidebarMode === "search" ? (
            <>
              <BodyText color="grey-40" type="body-small">
                Search areas the same way as marketplace, add multiple shapes, and preview their GeoJSON on the map.
                Select a shape to drag its points on the map. Expand a shape to hide individual parts or close holes.
              </BodyText>
              <GeoShapeSearchInput
                onAdd={addShape}
                selectedIds={selectedIds}
                shapeTypes={shapeTypesParam}
                showAll={settings.showAll}
              />
              <ZipPrefixBulkAdd
                selectedIds={selectedIds}
                showAll={settings.showAll}
                onAddMany={addShapes}
              />
            </>
          ) : null}

          {sidebarMode === "draw" ? (
            <>
              <BodyText color="grey-40" type="body-small">
                Draw polygons on the map, then export them as a local shape package.
              </BodyText>
              <ShapeDrawPanel
                drawPolygons={drawPolygons}
                isDrawingActive={isDrawingActive}
                metadata={drawMetadata}
                onMetadataChange={setDrawMetadata}
                onStartDrawing={handleStartDrawing}
                onTogglePolygonVisibility={handleToggleDrawPolygonVisibility}
                onRemovePolygon={handleRemoveDrawPolygon}
                onFocusPolygon={handleFocusDrawPolygon}
                onStartOver={handleStartOver}
              />
            </>
          ) : null}

          {sidebarMode === "mesh" ? (
            <>
              <MeshSubdividePanel
                document={meshDocument}
                selectedFaceId={meshSelectedFaceId}
                interactionMode={meshInteractionMode}
                showAll={settings.showAll}
                shapeTypes={shapeTypesParam}
                onInteractionModeChange={setMeshInteractionMode}
                outerVerticesLocked={meshOuterVerticesLocked}
                onOuterVerticesLockedChange={setMeshOuterVerticesLocked}
                onFocusMesh={handleFocusMesh}
                onImportMesh={handleImportMesh}
                mergeError={meshMergeError}
                meshFileName={meshSaveFileName}
                onMeshFileNameChange={setMeshSaveFileName}
                onSaveMesh={() => void handleSaveMesh()}
                isSavingMesh={isSavingMesh}
                saveMeshMessage={saveMeshMessage}
                saveMeshError={saveMeshError}
                hasMeshDefinition={meshDefinition !== null}
                startMeshFlowStep={startMeshFlowStep}
                startMeshFlowShape={startMeshFlowReference?.suggestion ?? null}
                startMeshFlowName={startMeshFlowName}
                startMeshFlowError={startMeshFlowError}
                isStartMeshFlowSaving={isStartMeshFlowSaving}
                onStartMesh={handleStartMesh}
                onStartMeshFlowSelectShape={handleStartMeshFlowSelectShape}
                onStartMeshFlowNameChange={setStartMeshFlowName}
                onStartMeshFlowComplete={() => void handleStartMeshFlowComplete()}
                onStartMeshFlowCancel={handleStartMeshFlowCancel}
                onClearMesh={handleClearMesh}
              />
            </>
          ) : null}

          {sidebarMode === "geojson" ? (
            <>
              <BodyText color="grey-40" type="body-small">
                Load a local GeoJSON file, click shapes on the map to select them, then move the selection into a
                group. Loaded files stay visible across tabs until you remove them.
              </BodyText>
              <GeoJsonLoadPanel
                files={loadedGeoJsonFiles}
                groups={geoJsonShapeGroups}
                shapeMetadata={loadedGeoJsonShapeMetadata}
                selectedShapeKeys={selectedGeoJsonShapeKeys}
                restoredFileCount={initialLoadedGeoJsonDraftRef.current.files.length}
                restoredGroupCount={initialLoadedGeoJsonDraftRef.current.groups.length}
                onFilesChange={setLoadedGeoJsonFiles}
                onGroupsChange={setGeoJsonShapeGroups}
                onShapeMetadataChange={setLoadedGeoJsonShapeMetadata}
                onSelectedShapeKeysChange={setSelectedGeoJsonShapeKeys}
                onFitFile={handleFitLoadedGeoJsonFile}
                onFitShape={handleFitLoadedGeoJsonShape}
                onFitShapes={handleFitLoadedGeoJsonShapes}
                onFitAll={handleFitAllLoadedGeoJson}
              />
            </>
          ) : null}

          {sidebarMode === "settings" ? (
            <MapDisplaySettingsPanel
              settings={settings}
              selectedIds={selectedIds}
              onFillOpacityChange={setFillOpacity}
              onTypeColorChange={setTypeColor}
              onSetShapeTypeEnabled={setShapeTypeEnabled}
              onEnableAllShapeTypes={enableAllShapeTypes}
              onShowAllChange={setShowAll}
              onAddMany={addShapes}
              onClearType={handleClearShapesByType}
              onReset={resetSettings}
            />
          ) : null}

          {modeHasDetailPanel(sidebarMode) ? (
            <div className="border-grey-200 border-t pt-6 lg:hidden">
              <ModeDetailPanel {...detailPanelProps} />
            </div>
          ) : null}
        </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-grey-50 p-4 lg:p-6">
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-grey-200 bg-white shadow-sm">
          {sidebarMode === "mesh" && meshDefinitionEditorOpen && meshDefinition ? (
            <MeshDefinitionEditor
              definition={meshDefinition}
              meshDocument={meshDocument}
              meshFileName={meshSaveFileName}
              onApply={handleApplyMeshDefinition}
              onClose={() => setMeshDefinitionEditorOpen(false)}
            />
          ) : (
            <GeoShapesMap
              ref={mapRef}
              shapes={visibleShapes}
              displaySettings={settings}
              focusFragment={focusedFragment}
              editFocus={drawMode || sidebarMode === "mesh" ? null : focusedFragment}
              drawMode={drawMode}
              isDrawingActive={isDrawingActive}
              drawFeatures={visibleDrawFeatures}
              onDrawChange={handleDrawChange}
              loadedGeoJsonOverlay={loadedGeoJsonOverlay}
              loadedGeoJsonHighlightOverlay={loadedGeoJsonHighlightOverlay}
              geoJsonShapeSelectionEnabled={sidebarMode === "geojson" && Boolean(loadedGeoJsonOverlay)}
              onLoadedGeoJsonShapeClick={handleToggleLoadedGeoJsonShapeSelection}
              meshSubdivision={meshSubdivisionProps}
              meshReferenceOverlay={meshReferenceOverlay}
              onShapeGeometryChange={updateShapeGeometry}
              onFragmentClick={(shapeId, fragmentIndex) =>
                setFocusedFragment({ shapeId, fragmentIndex })
              }
            />
          )}
        </div>
      </main>

      {modeHasDetailPanel(sidebarMode) ? (
        <aside className="border-grey-200 hidden h-full w-80 shrink-0 flex-col overflow-hidden border-l bg-white lg:flex">
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <ModeDetailPanel {...detailPanelProps} />
          </div>
        </aside>
      ) : null}
    </div>
  );
}
