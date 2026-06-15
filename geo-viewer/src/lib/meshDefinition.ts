import type { MeshDocument, MeshFace } from "./meshSubdivision";

export interface MeshDefinitionFace {
  name: string;
  id: number;
  type: string;
  uuid: string;
}

export interface MeshDefinitionComposite {
  name: string;
  id: number;
  type: string;
  uuid: string;
  faces: string[];
}

export interface MeshDefinition {
  "id-prefix": number;
  faces: MeshDefinitionFace[];
  composites: MeshDefinitionComposite[];
}

export function createEmptyMeshDefinition(): MeshDefinition {
  return { "id-prefix": 0, faces: [], composites: [] };
}

export function cloneMeshDefinition(definition: MeshDefinition): MeshDefinition {
  return {
    "id-prefix": definition["id-prefix"],
    faces: definition.faces.map(face => ({ ...face })),
    composites: definition.composites.map(composite => ({
      ...composite,
      faces: [...composite.faces],
    })),
  };
}

export function getCompositeFaceNames(
  definition: MeshDefinition | null,
  compositeUuid: string | null,
): string[] {
  if (!definition || !compositeUuid) return [];

  const composite = definition.composites.find(entry => entry.uuid === compositeUuid);
  return composite ? [...composite.faces] : [];
}

export function normalizeMeshDefinitionUuid(uuid: string): string {
  return uuid.replace(/-/g, "");
}

export function generateMeshDefinitionUuid(): string {
  return normalizeMeshDefinitionUuid(crypto.randomUUID());
}

export function suggestNextMeshDefinitionCompositeId(
  composites: MeshDefinitionComposite[],
): number {
  return composites.reduce((max, composite) => Math.max(max, composite.id), 0) + 1;
}

export function createMeshDefinitionComposite(
  composites: MeshDefinitionComposite[] = [],
): MeshDefinitionComposite {
  const nextIndex = composites.length + 1;

  return {
    name: `Composite ${nextIndex}`,
    id: suggestNextMeshDefinitionCompositeId(composites),
    type: "composite",
    uuid: generateMeshDefinitionUuid(),
    faces: [],
  };
}

export function normalizeMeshDefinitionId(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      return Number.parseInt(trimmed, 10);
    }

    const trailingDigits = /(\d+)$/.exec(trimmed);
    if (trailingDigits) {
      return Number.parseInt(trailingDigits[1]!, 10);
    }
  }

  return fallback;
}

export function normalizeMeshDefinitionIdPrefix(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }

  return fallback;
}

export function normalizeMeshDefinition(definition: MeshDefinition): MeshDefinition {
  const raw = definition as MeshDefinition & { "id-prefix"?: unknown };

  return {
    "id-prefix": normalizeMeshDefinitionIdPrefix(raw["id-prefix"]),
    faces: definition.faces.map((face, index) => ({
      ...face,
      id: normalizeMeshDefinitionId(face.id, index + 1),
      uuid: normalizeMeshDefinitionUuid(face.uuid),
      type: "face",
    })),
    composites: definition.composites.map((composite, index) => ({
      ...composite,
      id: normalizeMeshDefinitionId(composite.id, index + 1),
      uuid: normalizeMeshDefinitionUuid(composite.uuid),
      type: "composite",
      faces: [...composite.faces],
    })),
  };
}

export function buildDefinitionFaceFromMeshFace(
  face: MeshFace,
  id: number,
  type = "face",
): MeshDefinitionFace {
  return {
    name: face.name,
    id,
    type,
    uuid: normalizeMeshDefinitionUuid(face.id),
  };
}

export function buildMeshDefinitionFromDocument(
  document: MeshDocument,
  composites: MeshDefinitionComposite[] = [],
  idPrefix = 0,
): MeshDefinition {
  return normalizeMeshDefinition({
    "id-prefix": idPrefix,
    faces: document.faces.map((face, index) => buildDefinitionFaceFromMeshFace(face, index + 1)),
    composites: composites.map((composite, index) => ({
      ...composite,
      id: normalizeMeshDefinitionId(composite.id, index + 1),
      faces: [...composite.faces],
    })),
  });
}

function isLooseMeshDefinitionId(value: unknown): boolean {
  if (typeof value === "number" && Number.isInteger(value)) return true;
  if (typeof value === "string" && value.trim().length > 0) return true;
  return false;
}

function isMeshDefinitionFace(value: unknown): value is MeshDefinitionFace {
  if (typeof value !== "object" || value === null) return false;

  const face = value as MeshDefinitionFace;
  return (
    typeof face.name === "string" &&
    isLooseMeshDefinitionId(face.id) &&
    typeof face.type === "string" &&
    typeof face.uuid === "string"
  );
}

function isMeshDefinitionComposite(value: unknown): value is MeshDefinitionComposite {
  if (typeof value !== "object" || value === null) return false;

  const composite = value as MeshDefinitionComposite;
  return (
    typeof composite.name === "string" &&
    isLooseMeshDefinitionId(composite.id) &&
    typeof composite.type === "string" &&
    typeof composite.uuid === "string" &&
    Array.isArray(composite.faces) &&
    composite.faces.every(faceName => typeof faceName === "string")
  );
}

export function isMeshDefinition(value: unknown): value is MeshDefinition {
  if (typeof value !== "object" || value === null) return false;

  const definition = value as MeshDefinition & { "id-prefix"?: unknown };
  if (
    definition["id-prefix"] !== undefined &&
    !isLooseMeshDefinitionId(definition["id-prefix"])
  ) {
    return false;
  }

  return (
    Array.isArray(definition.faces) &&
    definition.faces.every(isMeshDefinitionFace) &&
    Array.isArray(definition.composites) &&
    definition.composites.every(isMeshDefinitionComposite)
  );
}

export function validateMeshDefinition(definition: MeshDefinition): string | null {
  if (!Number.isInteger(definition["id-prefix"])) {
    return "Definition id-prefix must be an integer.";
  }

  const faceNames = new Set<string>();
  const faceIds = new Set<number>();
  const faceUuids = new Set<string>();

  for (const face of definition.faces) {
    if (!Number.isInteger(face.id)) {
      return `Definition face id must be an integer: ${face.name}`;
    }
    if (faceNames.has(face.name)) {
      return `Duplicate definition face name: ${face.name}`;
    }
    if (faceIds.has(face.id)) {
      return `Duplicate definition face id: ${face.id}`;
    }
    if (faceUuids.has(face.uuid)) {
      return `Duplicate definition face uuid: ${face.uuid}`;
    }

    faceNames.add(face.name);
    faceIds.add(face.id);
    faceUuids.add(face.uuid);
  }

  const compositeNames = new Set<string>();
  const compositeIds = new Set<number>();
  const compositeUuids = new Set<string>();

  for (const composite of definition.composites) {
    if (!Number.isInteger(composite.id)) {
      return `Definition composite id must be an integer: ${composite.name}`;
    }
    if (compositeNames.has(composite.name)) {
      return `Duplicate composite name: ${composite.name}`;
    }
    if (compositeIds.has(composite.id)) {
      return `Duplicate composite id: ${composite.id}`;
    }
    if (compositeUuids.has(composite.uuid)) {
      return `Duplicate composite uuid: ${composite.uuid}`;
    }

    compositeNames.add(composite.name);
    compositeIds.add(composite.id);
    compositeUuids.add(composite.uuid);

    for (const faceName of composite.faces) {
      if (!faceNames.has(faceName)) {
        return `Composite "${composite.name}" references unknown face: ${faceName}`;
      }
    }
  }

  return null;
}

export function validateMeshDefinitionAgainstDocument(
  document: MeshDocument,
  definition: MeshDefinition,
): string | null {
  const meshFaceNames = new Set(document.faces.map(face => face.name));
  const meshFaceUuidByName = new Map(
    document.faces.map(face => [face.name, normalizeMeshDefinitionUuid(face.id)]),
  );

  for (const face of definition.faces) {
    if (!meshFaceNames.has(face.name)) {
      return `Definition face "${face.name}" does not exist in the mesh.`;
    }

    const meshFaceUuid = meshFaceUuidByName.get(face.name);
    if (meshFaceUuid && face.uuid !== meshFaceUuid) {
      return `Definition face "${face.name}" uuid does not match the mesh face.`;
    }
  }

  for (const composite of definition.composites) {
    for (const faceName of composite.faces) {
      if (!meshFaceNames.has(faceName)) {
        return `Composite "${composite.name}" references a face that is not in the mesh: ${faceName}`;
      }
    }
  }

  return null;
}

export function validateMeshDefinitionForDocument(
  document: MeshDocument,
  definition: MeshDefinition,
): string | null {
  const structuralError = validateMeshDefinition(definition);
  if (structuralError) return structuralError;

  return validateMeshDefinitionAgainstDocument(document, definition);
}

export function syncMeshDefinitionFacesFromDocument(
  document: MeshDocument,
  definition: MeshDefinition,
): MeshDefinition {
  return normalizeMeshDefinition({
    "id-prefix": definition["id-prefix"],
    faces: document.faces.map((face, index) => buildDefinitionFaceFromMeshFace(face, index + 1)),
    composites: definition.composites.map(composite => ({
      ...composite,
      type: "composite",
      faces: composite.faces.filter(faceName =>
        document.faces.some(meshFace => meshFace.name === faceName),
      ),
    })),
  });
}

export function formatMeshDefinitionJson(definition: MeshDefinition): string {
  return JSON.stringify(
    {
      "id-prefix": definition["id-prefix"],
      faces: definition.faces,
      composites: definition.composites,
    },
    null,
    2,
  );
}

export function parseMeshDefinitionJson(
  text: string,
):
  | { ok: true; definition: MeshDefinition }
  | { ok: false; error: string } {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "Invalid JSON." };
  }

  if (!isMeshDefinition(parsed)) {
    return {
      ok: false,
      error: "JSON must be a definition object with id-prefix, faces, and composites.",
    };
  }

  const normalized = normalizeMeshDefinition(parsed);
  const validationError = validateMeshDefinition(normalized);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  return { ok: true, definition: cloneMeshDefinition(normalized) };
}
