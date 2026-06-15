import { describe, expect, it } from "vitest";
import { addSquare, createEmptyMeshDocument } from "./meshSubdivision";
import {
  buildMeshDefinitionFromDocument,
  cloneMeshDefinition,
  createMeshDefinitionComposite,
  formatMeshDefinitionJson,
  normalizeMeshDefinitionUuid,
  parseMeshDefinitionJson,
  syncMeshDefinitionFacesFromDocument,
  validateMeshDefinition,
  validateMeshDefinitionAgainstDocument,
  validateMeshDefinitionForDocument,
} from "./meshDefinition";
import { buildMeshFile, parseMeshFileContent, serializeMeshFile } from "./meshFile";

const meshDocument = addSquare(createEmptyMeshDocument(), [18, 59], 0.01).document;
const meshDefinition = buildMeshDefinitionFromDocument(meshDocument);

describe("meshDefinition", () => {
  it("builds face entries with name, id, type, and uuid", () => {
    expect(meshDefinition.faces).toHaveLength(1);
    expect(meshDefinition["id-prefix"]).toBe(0);
    expect(meshDefinition.faces[0]).toEqual({
      name: "Face 1",
      id: 1,
      type: "face",
      uuid: normalizeMeshDefinitionUuid(meshDocument.faces[0]?.id ?? ""),
    });
    expect(meshDefinition.faces[0]?.uuid.includes("-")).toBe(false);
    expect(Number.isInteger(meshDefinition.faces[0]?.id)).toBe(true);
    expect(meshDefinition.composites).toEqual([]);
  });

  it("validates composite face references", () => {
    const invalid = cloneMeshDefinition(meshDefinition);
    invalid.composites = [
      {
        name: "North",
        id: 2,
        type: "composite",
        uuid: "composite1",
        faces: ["Missing face"],
      },
    ];

    expect(validateMeshDefinition(invalid)).toContain("references unknown face");
  });

  it("formats and parses definition JSON", () => {
    const text = formatMeshDefinitionJson(meshDefinition);
    const parsed = parseMeshDefinitionJson(text);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.definition).toEqual(meshDefinition);
    }
  });

  it("rejects invalid definition JSON", () => {
    expect(parseMeshDefinitionJson("{")).toEqual({ ok: false, error: "Invalid JSON." });
    expect(parseMeshDefinitionJson('{"faces":[]}').ok).toBe(false);
  });

  it("strips dashes from definition uuids on parse", () => {
    const dashedUuid = "550e8400-e29b-41d4-a716-446655440000";
    const result = parseMeshDefinitionJson(
      JSON.stringify({
        "id-prefix": 12,
        faces: [
          {
            name: "Face 1",
            id: "face-1",
            type: "face",
            uuid: dashedUuid,
          },
        ],
        composites: [],
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.definition.faces[0]?.uuid).toBe("550e8400e29b41d4a716446655440000");
      expect(result.definition.faces[0]?.id).toBe(1);
      expect(result.definition["id-prefix"]).toBe(12);
    }
  });

  it("coerces string numeric ids to integers on parse", () => {
    const result = parseMeshDefinitionJson(
      JSON.stringify({
        "id-prefix": "7",
        faces: [
          {
            name: "Face 1",
            id: "42",
            type: "face",
            uuid: "abc",
          },
        ],
        composites: [],
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.definition.faces[0]?.id).toBe(42);
      expect(result.definition["id-prefix"]).toBe(7);
    }
  });

  it("defaults id-prefix when omitted", () => {
    const result = parseMeshDefinitionJson(
      JSON.stringify({
        faces: [
          {
            name: "Face 1",
            id: 1,
            type: "face",
            uuid: "abc",
          },
        ],
        composites: [],
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.definition["id-prefix"]).toBe(0);
    }
  });

  it("creates composites with integer ids and dashless uuids", () => {
    const composite = createMeshDefinitionComposite();
    expect(composite.id).toBe(1);
    expect(composite.type).toBe("composite");
    expect(composite.uuid.includes("-")).toBe(false);
    expect(createMeshDefinitionComposite([composite]).id).toBe(2);
  });

  it("rejects definition faces that are not in the mesh", () => {
    const definition = {
      ...meshDefinition,
      faces: [
        ...meshDefinition.faces,
        {
          name: "Missing face",
          id: 99,
          type: "face",
          uuid: "missingfaceuuid",
        },
      ],
    };

    expect(validateMeshDefinitionAgainstDocument(meshDocument, definition)).toContain(
      "does not exist in the mesh",
    );
  });

  it("rejects composites that reference faces outside the mesh", () => {
    const definition = {
      ...meshDefinition,
      composites: [
        {
          name: "All",
          id: 1,
          type: "composite",
          uuid: "compositeuuid",
          faces: ["Face 1", "Ghost face"],
        },
      ],
    };

    expect(validateMeshDefinitionAgainstDocument(meshDocument, definition)).toContain(
      "not in the mesh",
    );
  });

  it("syncs definition faces from the mesh document", () => {
    const renamedDocument = {
      ...meshDocument,
      faces: meshDocument.faces.map(face => ({ ...face, name: "Renamed face" })),
    };
    const synced = syncMeshDefinitionFacesFromDocument(renamedDocument, meshDefinition);

    expect(synced.faces).toHaveLength(1);
    expect(synced.faces[0]?.name).toBe("Renamed face");
    expect(validateMeshDefinitionForDocument(renamedDocument, synced)).toBeNull();
  });
});

describe("meshFile definition", () => {
  it("serializes and parses definition with the document", () => {
    const definition = {
      ...meshDefinition,
      composites: [
        {
          name: "All",
          id: 1,
          type: "composite",
          uuid: "compositeuuid",
          faces: ["Face 1"],
        },
      ],
    };

    const content = serializeMeshFile(meshDocument, definition);
    const parsed = parseMeshFileContent(content);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.definition).toEqual(definition);
      expect(parsed.document.faces).toHaveLength(1);
    }

    const file = buildMeshFile(meshDocument, definition);
    expect(file.definition).toEqual(definition);
  });

  it("derives definition for legacy files without a definition block", () => {
    const legacy = JSON.stringify({ vertices: meshDocument.vertices, faces: meshDocument.faces });
    const parsed = parseMeshFileContent(legacy);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.definition.faces[0]?.name).toBe("Face 1");
      expect(parsed.definition.faces[0]?.id).toBe(1);
      expect(parsed.definition["id-prefix"]).toBe(0);
      expect(parsed.definition.composites).toEqual([]);
    }
  });
});
