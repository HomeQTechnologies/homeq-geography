import type { MeshDefinition } from "./meshDefinition";
import { isMeshDefinition, normalizeMeshDefinition } from "./meshDefinition";
import { createEmptyMeshDocument, type MeshDocument, type MeshInteractionMode } from "./meshSubdivision";
import { normalizeMeshUndoEntry, type MeshUndoEntry } from "./meshVertexMoveUndo";
import type { GeoSearchSuggestion } from "./types";

export const MESH_DRAFT_STORAGE_KEY = "homeq.geo-viewer.mesh-draft";
// Stay below the typical ~5 MB localStorage quota.
export const MAX_INLINE_MESH_DRAFT_BYTES = 4_000_000;

export interface MeshClipUndoSnapshot {
  document: MeshDocument;
  selectedFaceId: string | null;
  selectedEdgeIndex: number | null;
}

export interface PersistedMeshDraft {
  document: MeshDocument;
  selectedFaceId: string | null;
  selectedEdgeIndex: number | null;
  interactionMode: MeshInteractionMode;
  reference: GeoSearchSuggestion | null;
  clipUndo: MeshClipUndoSnapshot | null;
  vertexMoveUndo: MeshUndoEntry[];
  outerVerticesLocked: boolean;
  definition: MeshDefinition | null;
  fileName: string | null;
  savedAt: string;
  /** When true, the mesh body is stored in `fileName` and must be reloaded from disk. */
  externalFile?: boolean;
}

function isPosition(value: unknown): value is GeoJSON.Position {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

function isMeshVertex(value: unknown): value is MeshDocument["vertices"][string] {
  if (typeof value !== "object" || value === null) return false;

  const vertex = value as MeshDocument["vertices"][string];
  return typeof vertex.id === "string" && isPosition(vertex.position);
}

function isMeshFace(value: unknown): value is MeshDocument["faces"][number] {
  if (typeof value !== "object" || value === null) return false;

  const face = value as MeshDocument["faces"][number];
  return (
    typeof face.id === "string" &&
    typeof face.name === "string" &&
    Array.isArray(face.vertexIds) &&
    face.vertexIds.every(vertexId => typeof vertexId === "string") &&
    typeof face.visible === "boolean" &&
    (face.locked === undefined || typeof face.locked === "boolean")
  );
}

function isMeshDocument(value: unknown): value is MeshDocument {
  if (typeof value !== "object" || value === null) return false;

  const document = value as MeshDocument;
  if (!Array.isArray(document.faces) || !document.faces.every(isMeshFace)) return false;
  if (typeof document.vertices !== "object" || document.vertices === null) return false;

  return Object.values(document.vertices).every(isMeshVertex);
}

function normalizeMeshInteractionMode(value: unknown): MeshInteractionMode {
  if (value === "subdivide-face") return "subdivide-face";
  if (value === "create-face") return "create-face";
  if (value === "merge-faces") return "merge-faces";
  if (value === "delete-vertex-chain") return "delete-vertex-chain";
  return "edit-vertices";
}

function isGeoSearchSuggestion(value: unknown): value is GeoSearchSuggestion {
  if (typeof value !== "object" || value === null) return false;

  const suggestion = value as GeoSearchSuggestion;
  return (
    typeof suggestion.hash === "string" &&
    typeof suggestion.id === "string" &&
    typeof suggestion.text === "string" &&
    typeof suggestion.shapeUri === "string"
  );
}


function isMeshClipUndoSnapshot(value: unknown): value is MeshClipUndoSnapshot {
  if (typeof value !== "object" || value === null) return false;

  const snapshot = value as MeshClipUndoSnapshot;
  return (
    isMeshDocument(snapshot.document) &&
    (snapshot.selectedFaceId === null || typeof snapshot.selectedFaceId === "string") &&
    (snapshot.selectedEdgeIndex === null || typeof snapshot.selectedEdgeIndex === "number")
  );
}

function isPersistedMeshDraft(value: unknown): value is PersistedMeshDraft {
  if (typeof value !== "object" || value === null) return false;

  const draft = value as PersistedMeshDraft;
  const reference = (draft as { reference?: unknown }).reference;
  const externalFile = (draft as { externalFile?: unknown }).externalFile;
  if (externalFile !== undefined && typeof externalFile !== "boolean") return false;
  if (externalFile === true && typeof draft.fileName !== "string") return false;

  return (
    isMeshDocument(draft.document) &&
    (draft.selectedFaceId === null || typeof draft.selectedFaceId === "string") &&
    (draft.selectedEdgeIndex === null || typeof draft.selectedEdgeIndex === "number") &&
    (draft.interactionMode === "edit-vertices" ||
      draft.interactionMode === "insert-vertex" ||
      draft.interactionMode === "extrude-edge" ||
      draft.interactionMode === "subdivide-face" ||
      draft.interactionMode === "create-face" ||
      draft.interactionMode === "merge-faces" ||
      draft.interactionMode === "delete-vertex-chain") &&
    (reference === null || reference === undefined || isGeoSearchSuggestion(reference)) &&
    ((draft as { definition?: unknown }).definition === null ||
      (draft as { definition?: unknown }).definition === undefined ||
      isMeshDefinition((draft as { definition?: unknown }).definition)) &&
    ((draft as { fileName?: unknown }).fileName === null ||
      (draft as { fileName?: unknown }).fileName === undefined ||
      typeof (draft as { fileName?: unknown }).fileName === "string") &&
    typeof draft.savedAt === "string"
  );
}

export function toPersistedMeshDraft(
  document: MeshDocument,
  selectedFaceId: string | null,
  selectedEdgeIndex: number | null,
  interactionMode: MeshInteractionMode,
  reference: GeoSearchSuggestion | null,
  clipUndo: MeshClipUndoSnapshot | null = null,
  vertexMoveUndo: MeshUndoEntry[] = [],
  outerVerticesLocked = true,
  definition: MeshDefinition | null = null,
  fileName: string | null = null,
): PersistedMeshDraft {
  return {
    document,
    selectedFaceId,
    selectedEdgeIndex,
    interactionMode,
    reference,
    clipUndo,
    vertexMoveUndo,
    outerVerticesLocked,
    definition,
    fileName,
    savedAt: new Date().toISOString(),
    externalFile: false,
  };
}

export function isExternalMeshDraft(draft: PersistedMeshDraft | null): boolean {
  return draft?.externalFile === true && typeof draft.fileName === "string" && draft.fileName.length > 0;
}

function buildExternalMeshDraft(draft: PersistedMeshDraft): PersistedMeshDraft {
  return {
    document: createEmptyMeshDocument(),
    selectedFaceId: draft.selectedFaceId,
    selectedEdgeIndex: draft.selectedEdgeIndex,
    interactionMode: draft.interactionMode,
    reference: null,
    clipUndo: null,
    vertexMoveUndo: [],
    outerVerticesLocked: draft.outerVerticesLocked,
    definition: draft.definition,
    fileName: draft.fileName,
    savedAt: draft.savedAt,
    externalFile: true,
  };
}

function tryPersistDraft(draft: PersistedMeshDraft): boolean {
  try {
    localStorage.setItem(MESH_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function loadMeshDraft(): PersistedMeshDraft | null {
  try {
    const raw = localStorage.getItem(MESH_DRAFT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!isPersistedMeshDraft(parsed)) return null;

    const vertexMoveUndoRaw = (parsed as { vertexMoveUndo?: unknown }).vertexMoveUndo;

    return {
      ...parsed,
      externalFile: (parsed as { externalFile?: unknown }).externalFile === true,
      interactionMode: normalizeMeshInteractionMode(parsed.interactionMode),
      reference: parsed.reference ?? null,
      clipUndo: isMeshClipUndoSnapshot((parsed as { clipUndo?: unknown }).clipUndo)
        ? (parsed as { clipUndo: MeshClipUndoSnapshot }).clipUndo
        : null,
      vertexMoveUndo: Array.isArray(vertexMoveUndoRaw)
        ? vertexMoveUndoRaw
            .map(normalizeMeshUndoEntry)
            .filter((entry): entry is MeshUndoEntry => entry !== null)
        : [],
      outerVerticesLocked: (parsed as { outerVerticesLocked?: unknown }).outerVerticesLocked !== false,
      definition: isMeshDefinition((parsed as { definition?: unknown }).definition)
        ? normalizeMeshDefinition((parsed as { definition: MeshDefinition }).definition)
        : null,
      fileName:
        typeof (parsed as { fileName?: unknown }).fileName === "string"
          ? (parsed as { fileName: string }).fileName
          : null,
    };
  } catch {
    return null;
  }
}

export function saveMeshDraft(draft: PersistedMeshDraft): void {
  const nextDraft: PersistedMeshDraft = {
    ...draft,
    savedAt: new Date().toISOString(),
    externalFile: false,
  };
  const serialized = JSON.stringify(nextDraft);

  if (serialized.length <= MAX_INLINE_MESH_DRAFT_BYTES && tryPersistDraft(nextDraft)) {
    return;
  }

  if (!nextDraft.fileName) return;

  tryPersistDraft(buildExternalMeshDraft(nextDraft));
}

export function clearMeshDraft(): void {
  localStorage.removeItem(MESH_DRAFT_STORAGE_KEY);
}

export function hasMeshDraft(): boolean {
  const draft = loadMeshDraft();
  if (!draft) return false;
  if (isExternalMeshDraft(draft)) return true;
  return draft.document.faces.length > 0;
}
