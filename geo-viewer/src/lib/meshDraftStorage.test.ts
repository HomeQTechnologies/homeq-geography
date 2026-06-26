import { afterEach, describe, expect, it } from "vitest";
import { createEmptyMeshDocument } from "./meshSubdivision";
import {
  clearMeshDraft,
  isExternalMeshDraft,
  loadMeshDraft,
  MESH_DRAFT_STORAGE_KEY,
  saveMeshDraft,
  toPersistedMeshDraft,
} from "./meshDraftStorage";

const meshDocument = {
  vertices: {
    "vertex-a": { id: "vertex-a", position: [18, 59] },
    "vertex-b": { id: "vertex-b", position: [18.01, 59] },
    "vertex-c": { id: "vertex-c", position: [18.01, 59.01] },
    "vertex-d": { id: "vertex-d", position: [18, 59.01] },
  },
  faces: [
    {
      id: "face-1",
      name: "Face 1",
      vertexIds: ["vertex-a", "vertex-b", "vertex-c", "vertex-d"],
      visible: true,
    },
  ],
};

afterEach(() => {
  clearMeshDraft();
});

describe("meshDraftStorage", () => {
  it("saves and loads a mesh draft", () => {
    const draft = toPersistedMeshDraft(
      meshDocument,
      "face-1",
      0,
      "edit-vertices",
      null,
      null,
      [],
      true,
      null,
      "stockholm.mesh.json",
    );
    saveMeshDraft(draft);

    const loaded = loadMeshDraft();
    expect(loaded).toMatchObject({
      ...draft,
      externalFile: false,
    });
    expect(loaded?.savedAt).toBeTypeOf("string");
  });

  it("stores large drafts as external file references", () => {
    const content = "x".repeat(5_000_000);
    const largeDocument = {
      vertices: {
        "vertex-a": { id: "vertex-a", position: [18, 59] },
      },
      faces: [
        {
          id: "face-1",
          name: "Face 1",
          vertexIds: ["vertex-a", "vertex-a", "vertex-a"],
          visible: true,
        },
      ],
    };
    const draft = toPersistedMeshDraft(
      {
        ...largeDocument,
        faces: [
          {
            ...largeDocument.faces[0]!,
            name: content,
          },
        ],
      },
      "face-1",
      null,
      "edit-vertices",
      null,
      null,
      [],
      true,
      null,
      "goteborg.mesh.json",
    );

    expect(() => saveMeshDraft(draft)).not.toThrow();

    const loaded = loadMeshDraft();
    expect(loaded?.externalFile).toBe(true);
    expect(loaded?.fileName).toBe("goteborg.mesh.json");
    expect(loaded?.document.faces).toHaveLength(0);
  });

  it("returns false for a null draft", () => {
    expect(isExternalMeshDraft(null)).toBe(false);
  });

  it("reports external drafts as present", () => {
    localStorage.setItem(
      MESH_DRAFT_STORAGE_KEY,
      JSON.stringify({
        document: { vertices: {}, faces: [] },
        selectedFaceId: null,
        selectedEdgeIndex: null,
        interactionMode: "edit-vertices",
        reference: null,
        clipUndo: null,
        vertexMoveUndo: [],
        outerVerticesLocked: true,
        definition: null,
        fileName: "goteborg.mesh.json",
        savedAt: new Date().toISOString(),
        externalFile: true,
      }),
    );

    expect(isExternalMeshDraft(loadMeshDraft()!)).toBe(true);
  });

  it("defaults fileName to null for older drafts", () => {
    const draftWithoutFileName = {
      ...toPersistedMeshDraft(meshDocument, "face-1", 0, "edit-vertices", null, null, [], true),
    };
    delete (draftWithoutFileName as { fileName?: string | null }).fileName;
    localStorage.setItem(MESH_DRAFT_STORAGE_KEY, JSON.stringify(draftWithoutFileName));

    expect(loadMeshDraft()?.fileName).toBeNull();
  });

  it("saves and loads clip undo snapshots", () => {
    const clipUndo = {
      document: meshDocument,
      selectedFaceId: "face-1",
      selectedEdgeIndex: 1,
    };
    const draft = toPersistedMeshDraft(meshDocument, "face-1", 0, "edit-vertices", null, clipUndo, [], true);
    saveMeshDraft(draft);

    expect(loadMeshDraft()?.clipUndo).toEqual(clipUndo);
  });

  it("returns null for invalid stored data", () => {
    localStorage.setItem(MESH_DRAFT_STORAGE_KEY, JSON.stringify({ document: {} }));
    expect(loadMeshDraft()).toBeNull();
  });

  it("defaults boundary lock to true when loading older drafts", () => {
    const draftWithoutLock = {
      ...toPersistedMeshDraft(meshDocument, "face-1", 0, "edit-vertices", null, null, [], true),
    };
    delete (draftWithoutLock as { outerVerticesLocked?: boolean }).outerVerticesLocked;
    localStorage.setItem(MESH_DRAFT_STORAGE_KEY, JSON.stringify(draftWithoutLock));

    expect(loadMeshDraft()?.outerVerticesLocked).toBe(true);
  });

  it("clears stored mesh drafts", () => {
    saveMeshDraft(toPersistedMeshDraft(createEmptyMeshDocument(), null, null, "edit-vertices", null));
    clearMeshDraft();
    expect(loadMeshDraft()).toBeNull();
  });
});
