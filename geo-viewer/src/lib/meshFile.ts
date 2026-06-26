import { cloneMeshDocument, type MeshDocument } from "./meshSubdivision";
import {
  buildMeshDefinitionFromDocument,
  cloneMeshDefinition,
  isMeshDefinition,
  normalizeMeshDefinition,
  syncMeshDefinitionFacesFromDocument,
  type MeshDefinition,
  validateMeshDefinitionForDocument,
} from "./meshDefinition";
import { downloadJsonFile } from "./shapeExport";

export const MESH_FILE_TYPE = "homeq-mesh" as const;
export const MESH_FILE_VERSION = 1;

export interface MeshFile {
  type: typeof MESH_FILE_TYPE;
  version: typeof MESH_FILE_VERSION;
  exportedAt: string;
  definition: MeshDefinition;
  document: MeshDocument;
}

export type ParseMeshFileResult =
  | { ok: true; document: MeshDocument; definition: MeshDefinition }
  | { ok: false; error: string };

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

function isMeshFile(value: unknown): value is MeshFile {
  if (typeof value !== "object" || value === null) return false;

  const file = value as MeshFile;
  return (
    file.type === MESH_FILE_TYPE &&
    file.version === MESH_FILE_VERSION &&
    typeof file.exportedAt === "string" &&
    isMeshDefinition(file.definition) &&
    isMeshDocument(file.document)
  );
}

function cleanVertexRing(vertexIds: string[]): string[] {
  const cleaned: string[] = [];

  for (const vertexId of vertexIds) {
    if (cleaned.length > 0 && cleaned[cleaned.length - 1] === vertexId) {
      continue;
    }
    if (cleaned.length >= 2 && cleaned[cleaned.length - 2] === vertexId) {
      cleaned.pop();
      continue;
    }
    cleaned.push(vertexId);
  }

  if (cleaned.length >= 2 && cleaned[0] === cleaned[cleaned.length - 1]) {
    return cleaned.slice(0, -1);
  }

  return cleaned;
}

export function normalizeImportedMeshDocument(document: MeshDocument): MeshDocument | null {
  if (document.faces.length === 0) return null;

  const normalizedFaces = document.faces.map(face => ({
    ...face,
    vertexIds: cleanVertexRing(face.vertexIds),
  }));

  for (const face of normalizedFaces) {
    if (face.vertexIds.length < 3) return null;
    if (new Set(face.vertexIds).size !== face.vertexIds.length) return null;
    if (!face.vertexIds.every(vertexId => document.vertices[vertexId])) return null;
  }

  const usedVertexIds = new Set(normalizedFaces.flatMap(face => face.vertexIds));
  const vertices = Object.fromEntries(
    Object.entries(document.vertices).filter(([vertexId]) => usedVertexIds.has(vertexId)),
  );

  return cloneMeshDocument({
    vertices,
    faces: normalizedFaces.map(face => ({
      ...face,
      vertexIds: [...face.vertexIds],
    })),
  });
}

function extractMeshPayload(value: unknown): { document: MeshDocument; definition: MeshDefinition | null } | null {
  if (isMeshFile(value)) {
    return {
      document: value.document,
      definition: value.definition,
    };
  }

  if (isMeshDocument(value)) {
    return { document: value, definition: null };
  }

  if (typeof value === "object" && value !== null) {
    const payload = value as { document?: unknown; definition?: unknown };
    if (isMeshDocument(payload.document)) {
      return {
        document: payload.document,
        definition: isMeshDefinition(payload.definition) ? payload.definition : null,
      };
    }
  }

  return null;
}

export function buildMeshFile(document: MeshDocument, definition: MeshDefinition): MeshFile {
  return {
    type: MESH_FILE_TYPE,
    version: MESH_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    definition: cloneMeshDefinition(normalizeMeshDefinition(definition)),
    document: cloneMeshDocument(document),
  };
}

export function buildMeshDownloadFilename(date = new Date()): string {
  const stamp = date.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `mesh-${stamp}.mesh.json`;
}

export function buildMeshFileNameFromLabel(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return `${slug || "mesh"}.mesh.json`;
}

export function normalizeMeshWorkspaceFileName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) return "";

  return isMeshWorkspaceFileName(trimmed) ? trimmed : `${trimmed.replace(/\.json$/i, "")}.mesh.json`;
}

export function parseMeshFileContent(content: string): ParseMeshFileResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, error: "File is not valid JSON." };
  }

  const payload = extractMeshPayload(parsed);
  if (!payload) {
    return { ok: false, error: "File does not contain a valid linked mesh document." };
  }

  const normalized = normalizeImportedMeshDocument(payload.document);
  if (!normalized) {
    return { ok: false, error: "Mesh file is missing faces or has invalid face vertex references." };
  }

  const definition = syncMeshDefinitionFacesFromDocument(
    normalized,
    normalizeMeshDefinition(payload.definition ?? buildMeshDefinitionFromDocument(normalized)),
  );
  const validationError = validateMeshDefinitionForDocument(normalized, definition);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  return { ok: true, document: normalized, definition: cloneMeshDefinition(definition) };
}

export function serializeMeshFile(document: MeshDocument, definition: MeshDefinition): string {
  return JSON.stringify(buildMeshFile(document, definition), null, 2);
}

export function downloadMeshFile(
  document: MeshDocument,
  definition: MeshDefinition,
  filename = buildMeshDownloadFilename(),
): void {
  if (document.faces.length === 0) return;

  downloadJsonFile(filename, buildMeshFile(document, definition));
}

export function isMeshWorkspaceFileName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".mesh.json");
}
