export const MAX_MESH_VERTEX_MOVE_UNDO_STEPS = 10;

export interface MeshVertexMoveUndoEntry {
  vertexId: string;
  position: GeoJSON.Position;
}

export function pushMeshVertexMoveUndo(
  stack: MeshVertexMoveUndoEntry[],
  entry: MeshVertexMoveUndoEntry,
): MeshVertexMoveUndoEntry[] {
  const next: MeshVertexMoveUndoEntry[] = [
    ...stack,
    {
      vertexId: entry.vertexId,
      position: [...entry.position] as GeoJSON.Position,
    },
  ];

  if (next.length <= MAX_MESH_VERTEX_MOVE_UNDO_STEPS) {
    return next;
  }

  return next.slice(next.length - MAX_MESH_VERTEX_MOVE_UNDO_STEPS);
}

export function popMeshVertexMoveUndo(stack: MeshVertexMoveUndoEntry[]): {
  stack: MeshVertexMoveUndoEntry[];
  entry: MeshVertexMoveUndoEntry | null;
} {
  if (stack.length === 0) {
    return { stack, entry: null };
  }

  const entry = stack[stack.length - 1]!;
  return {
    stack: stack.slice(0, -1),
    entry: {
      vertexId: entry.vertexId,
      position: [...entry.position] as GeoJSON.Position,
    },
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
