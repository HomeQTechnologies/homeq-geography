import { describe, expect, it, vi } from "vitest";
import { addSquare, createEmptyMeshDocument } from "./meshSubdivision";
import { buildMeshDefinitionFromDocument } from "./meshDefinition";
import {
  buildMeshFile,
  buildMeshFileNameFromLabel,
  downloadMeshFile,
  isMeshWorkspaceFileName,
  normalizeImportedMeshDocument,
  normalizeMeshWorkspaceFileName,
  parseMeshFileContent,
  serializeMeshFile,
} from "./meshFile";

const meshDocument = addSquare(createEmptyMeshDocument(), [18, 59], 0.01).document;
const meshDefinition = buildMeshDefinitionFromDocument(meshDocument);

describe("meshFile", () => {
  it("builds a versioned mesh file payload", () => {
    const file = buildMeshFile(meshDocument, meshDefinition);

    expect(file.type).toBe("homeq-mesh");
    expect(file.version).toBe(1);
    expect(file.document.faces).toHaveLength(1);
    expect(file.definition.faces).toHaveLength(1);
    expect(serializeMeshFile(meshDocument, meshDefinition)).toContain('"type": "homeq-mesh"');
    expect(isMeshWorkspaceFileName("test.mesh.json")).toBe(true);
    expect(buildMeshFileNameFromLabel("Stockholm City")).toBe("stockholm-city.mesh.json");
    expect(normalizeMeshWorkspaceFileName("my-mesh")).toBe("my-mesh.mesh.json");
  });

  it("parses a mesh file export", () => {
    const content = JSON.stringify(buildMeshFile(meshDocument, meshDefinition));
    const parsed = parseMeshFileContent(content);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.document.faces).toHaveLength(1);
      expect(parsed.definition.faces).toHaveLength(1);
      expect(Object.keys(parsed.document.vertices)).toHaveLength(4);
    }
  });

  it("parses a raw mesh document", () => {
    const parsed = parseMeshFileContent(JSON.stringify(meshDocument));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.definition.faces).toHaveLength(1);
    }
  });

  it("rejects invalid mesh files", () => {
    expect(parseMeshFileContent("{")).toEqual({ ok: false, error: "File is not valid JSON." });
    expect(parseMeshFileContent(JSON.stringify({ vertices: {}, faces: [] }))).toEqual({
      ok: false,
      error: "Mesh file is missing faces or has invalid face vertex references.",
    });
    expect(parseMeshFileContent(JSON.stringify({ foo: "bar" }))).toEqual({
      ok: false,
      error: "File does not contain a valid linked mesh document.",
    });
  });

  it("prunes unused vertices on import", () => {
    const normalized = normalizeImportedMeshDocument({
      vertices: {
        ...meshDocument.vertices,
        orphan: { id: "orphan", position: [0, 0] },
      },
      faces: meshDocument.faces,
    });

    expect(normalized?.vertices.orphan).toBeUndefined();
  });

  it("skips download for an empty mesh", () => {
    const anchor = document.createElement("a");
    const click = vi.spyOn(anchor, "click");
    vi.spyOn(document, "createElement").mockReturnValue(anchor);

    downloadMeshFile(createEmptyMeshDocument(), meshDefinition);

    expect(click).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
