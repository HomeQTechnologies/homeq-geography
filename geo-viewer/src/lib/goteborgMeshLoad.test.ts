import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseMeshFileContent } from "./meshFile";
import { buildMeshFaceCollection } from "./meshSubdivision";
import { saveMeshDraft, toPersistedMeshDraft, loadMeshDraft } from "./meshDraftStorage";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const goteborgMeshPath = path.join(repoRoot, "data/meshes/goteborg.mesh.json");
const goteborgBoundaryMeshPath = path.join(repoRoot, "data/meshes/goteborg.boundary.mesh.json");

describe("goteborg mesh load", () => {
  it("parses the boundary mesh export", () => {
    const content = readFileSync(goteborgBoundaryMeshPath, "utf8");
    const parsed = parseMeshFileContent(content);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.document.faces).toHaveLength(1);
    expect(parsed.document.faces[0]?.vertexIds.length).toBeGreaterThanOrEqual(3);
  });

  it("parses and builds map features", () => {
    const content = readFileSync(goteborgMeshPath, "utf8");
    const parsed = parseMeshFileContent(content);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const features = buildMeshFaceCollection(parsed.document).features;
    expect(features.length).toBe(parsed.document.faces.length);
  });

  it("does not throw when persisting a large draft", () => {
    const content = readFileSync(goteborgMeshPath, "utf8");
    const parsed = parseMeshFileContent(content);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const draft = toPersistedMeshDraft(
      parsed.document,
      parsed.document.faces[0]?.id ?? null,
      null,
      "edit-vertices",
      null,
      null,
      [],
      true,
      parsed.definition,
      "goteborg.mesh.json",
    );

    expect(() => saveMeshDraft(draft)).not.toThrow();

    const loaded = loadMeshDraft();
    expect(loaded?.externalFile).toBe(true);
    expect(loaded?.fileName).toBe("goteborg.mesh.json");
  });
});
