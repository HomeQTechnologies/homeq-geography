import { cloneMeshDocument, type MeshDocument } from "./meshSubdivision";

export const MAX_MESH_UNDO_STEPS = 10;
/** @deprecated Use MAX_MESH_UNDO_STEPS */
export const MAX_MESH_VERTEX_MOVE_UNDO_STEPS = MAX_MESH_UNDO_STEPS;

export interface MeshVertexMoveUndoEntry {
  vertexId: string;
  position: GeoJSON.Position;
}

export interface MeshDocumentUndoEntry {
  kind: "document";
  document: MeshDocument;
  selectedFaceId: string | null;
  selectedEdgeIndex: number | null;
}

export type MeshVertexMoveUndoStackEntry = MeshVertexMoveUndoEntry & {
  kind: "vertex-move";
};

export type MeshUndoEntry = MeshVertexMoveUndoStackEntry | MeshDocumentUndoEntry;

function cloneMeshDocumentUndoEntry(entry: MeshDocumentUndoEntry): MeshDocumentUndoEntry {
  return {
    kind: "document",
    document: cloneMeshDocument(entry.document),
    selectedFaceId: entry.selectedFaceId,
    selectedEdgeIndex: entry.selectedEdgeIndex,
  };
}

function cloneMeshUndoEntry(entry: MeshUndoEntry): MeshUndoEntry {
  if (entry.kind === "document") {
    return cloneMeshDocumentUndoEntry(entry);
  }

  return {
    kind: "vertex-move",
    vertexId: entry.vertexId,
    position: [...entry.position] as GeoJSON.Position,
  };
}

export function normalizeMeshUndoEntry(value: unknown): MeshUndoEntry | null {
  if (typeof value !== "object" || value === null) return null;

  const entry = value as MeshUndoEntry & MeshVertexMoveUndoEntry;
  if (entry.kind === "document") {
    if (
      typeof entry.document !== "object" ||
      entry.document === null ||
      (entry.selectedFaceId !== null && typeof entry.selectedFaceId !== "string") ||
      (entry.selectedEdgeIndex !== null && typeof entry.selectedEdgeIndex !== "number")
    ) {
      return null;
    }

    return cloneMeshDocumentUndoEntry({
      kind: "document",
      document: entry.document,
      selectedFaceId: entry.selectedFaceId,
      selectedEdgeIndex: entry.selectedEdgeIndex,
    });
  }

  if (typeof entry.vertexId !== "string" || !Array.isArray(entry.position) || entry.position.length < 2) {
    return null;
  }

  return {
    kind: "vertex-move",
    vertexId: entry.vertexId,
    position: [...entry.position] as GeoJSON.Position,
  };
}

export function pushMeshUndo(stack: MeshUndoEntry[], entry: MeshUndoEntry): MeshUndoEntry[] {
  const next = [...stack, cloneMeshUndoEntry(entry)];

  if (next.length <= MAX_MESH_UNDO_STEPS) {
    return next;
  }

  return next.slice(next.length - MAX_MESH_UNDO_STEPS);
}

export function popMeshUndo(stack: MeshUndoEntry[]): {
  stack: MeshUndoEntry[];
  entry: MeshUndoEntry | null;
} {
  if (stack.length === 0) {
    return { stack, entry: null };
  }

  const entry = stack[stack.length - 1]!;
  return {
    stack: stack.slice(0, -1),
    entry: cloneMeshUndoEntry(entry),
  };
}

export function pushMeshVertexMoveUndo(
  stack: MeshUndoEntry[],
  entry: MeshVertexMoveUndoEntry,
): MeshUndoEntry[] {
  return pushMeshUndo(stack, {
    kind: "vertex-move",
    vertexId: entry.vertexId,
    position: entry.position,
  });
}

export function popMeshVertexMoveUndo(stack: MeshUndoEntry[]): {
  stack: MeshUndoEntry[];
  entry: MeshVertexMoveUndoEntry | null;
} {
  const { stack: nextStack, entry } = popMeshUndo(stack);
  if (!entry || entry.kind !== "vertex-move") {
    return { stack: nextStack, entry: null };
  }

  return {
    stack: nextStack,
    entry: {
      vertexId: entry.vertexId,
      position: entry.position,
    },
  };
}

export function createMeshDocumentUndoEntry(
  document: MeshDocument,
  selectedFaceId: string | null,
  selectedEdgeIndex: number | null,
): MeshDocumentUndoEntry {
  return {
    kind: "document",
    document: cloneMeshDocument(document),
    selectedFaceId,
    selectedEdgeIndex,
  };
}

export function hasVertexPositionChanged(
  previous: GeoJSON.Position,
  next: GeoJSON.Position,
): boolean {
  const epsilon = 1e-10;
  return (
    Math.abs(previous[0] - next[0]) > epsilon || Math.abs(previous[1] - next[1]) > epsilon
  );
}
