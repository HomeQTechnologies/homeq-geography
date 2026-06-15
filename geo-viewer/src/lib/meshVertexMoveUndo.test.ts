import { describe, expect, it } from "vitest";
import {
  MAX_MESH_VERTEX_MOVE_UNDO_STEPS,
  popMeshVertexMoveUndo,
  pushMeshVertexMoveUndo,
  type MeshVertexMoveUndoEntry,
} from "./meshVertexMoveUndo";

const entry = (vertexId: string, lng: number, lat: number): MeshVertexMoveUndoEntry => ({
  vertexId,
  position: [lng, lat],
});

describe("meshVertexMoveUndo", () => {
  it("keeps at most ten undo steps", () => {
    let stack: MeshVertexMoveUndoEntry[] = [];

    for (let index = 0; index < MAX_MESH_VERTEX_MOVE_UNDO_STEPS + 3; index += 1) {
      stack = pushMeshVertexMoveUndo(stack, entry(`vertex-${index}`, index, index));
    }

    expect(stack).toHaveLength(MAX_MESH_VERTEX_MOVE_UNDO_STEPS);
    expect(stack[0]?.vertexId).toBe("vertex-3");
    expect(stack.at(-1)?.vertexId).toBe(`vertex-${MAX_MESH_VERTEX_MOVE_UNDO_STEPS + 2}`);
  });

  it("pops the most recent undo entry", () => {
    const stack = pushMeshVertexMoveUndo([], entry("vertex-a", 18, 59));
    const popped = popMeshVertexMoveUndo(stack);

    expect(popped.entry).toEqual(entry("vertex-a", 18, 59));
    expect(popped.stack).toEqual([]);
  });
});
