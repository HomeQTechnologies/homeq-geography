import { describe, expect, it } from "vitest";
import {
  MAX_MESH_UNDO_STEPS,
  createMeshDocumentUndoEntry,
  popMeshUndo,
  popMeshVertexMoveUndo,
  pushMeshUndo,
  pushMeshVertexMoveUndo,
  type MeshVertexMoveUndoEntry,
} from "./meshVertexMoveUndo";
import { addSquare, createEmptyMeshDocument } from "./meshSubdivision";

const entry = (vertexId: string, lng: number, lat: number): MeshVertexMoveUndoEntry => ({
  vertexId,
  position: [lng, lat],
});

describe("meshVertexMoveUndo", () => {
  it("keeps at most ten undo steps", () => {
    let stack = pushMeshVertexMoveUndo([], entry("vertex-0", 0, 0));

    for (let index = 1; index < MAX_MESH_UNDO_STEPS + 3; index += 1) {
      stack = pushMeshVertexMoveUndo(stack, entry(`vertex-${index}`, index, index));
    }

    expect(stack).toHaveLength(MAX_MESH_UNDO_STEPS);
    expect(stack[0]?.kind).toBe("vertex-move");
    expect(stack[0] && stack[0].kind === "vertex-move" ? stack[0].vertexId : null).toBe("vertex-3");
    expect(stack.at(-1) && stack.at(-1)!.kind === "vertex-move" ? stack.at(-1)!.vertexId : null).toBe(
      `vertex-${MAX_MESH_UNDO_STEPS + 2}`,
    );
  });

  it("pops the most recent undo entry", () => {
    const stack = pushMeshVertexMoveUndo([], entry("vertex-a", 18, 59));
    const popped = popMeshVertexMoveUndo(stack);

    expect(popped.entry).toEqual(entry("vertex-a", 18, 59));
    expect(popped.stack).toEqual([]);
  });

  it("restores document snapshots", () => {
    const square = addSquare(createEmptyMeshDocument(), [18, 59], 0.01);
    const undoEntry = createMeshDocumentUndoEntry(square.document, square.faceId, null);
    const stack = pushMeshUndo([], undoEntry);
    const popped = popMeshUndo(stack);

    expect(popped.entry?.kind).toBe("document");
    if (!popped.entry || popped.entry.kind !== "document") {
      throw new Error("Expected document undo entry");
    }

    expect(popped.entry.selectedFaceId).toBe(square.faceId);
    expect(Object.keys(popped.entry.document.vertices)).toHaveLength(4);
  });
});
