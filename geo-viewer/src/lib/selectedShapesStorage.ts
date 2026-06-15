import type { SelectedGeoShape } from "./types";

export const SELECTED_SHAPES_STORAGE_KEY = "homeq.geo-viewer.selected-shapes";

export type PersistedGeoShape = Pick<
  SelectedGeoShape,
  "id" | "hash" | "text" | "shapeUri" | "visible" | "hiddenFragmentIndices" | "closedHoles"
>;

function isClosedHoleRef(value: unknown): value is { fragmentIndex: number; holeIndex: number } {
  if (typeof value !== "object" || value === null) return false;
  const hole = value as { fragmentIndex?: unknown; holeIndex?: unknown };
  return typeof hole.fragmentIndex === "number" && typeof hole.holeIndex === "number";
}

function isPersistedGeoShape(value: unknown): value is PersistedGeoShape {
  if (typeof value !== "object" || value === null) return false;
  const shape = value as PersistedGeoShape;
  return (
    typeof shape.id === "string" &&
    typeof shape.hash === "string" &&
    typeof shape.text === "string" &&
    typeof shape.shapeUri === "string" &&
    (shape.visible === undefined || typeof shape.visible === "boolean") &&
    (shape.hiddenFragmentIndices === undefined ||
      (Array.isArray(shape.hiddenFragmentIndices) &&
        shape.hiddenFragmentIndices.every(index => typeof index === "number"))) &&
    (shape.closedHoles === undefined ||
      (Array.isArray(shape.closedHoles) && shape.closedHoles.every(isClosedHoleRef)))
  );
}

export function toPersistedShapes(shapes: SelectedGeoShape[]): PersistedGeoShape[] {
  return shapes.map(({ id, hash, text, shapeUri, visible, hiddenFragmentIndices, closedHoles }) => ({
    id,
    hash,
    text,
    shapeUri,
    visible: visible !== false,
    ...(hiddenFragmentIndices && hiddenFragmentIndices.length > 0 ? { hiddenFragmentIndices } : {}),
    ...(closedHoles && closedHoles.length > 0 ? { closedHoles } : {}),
  }));
}

export function loadSelectedShapes(): PersistedGeoShape[] {
  try {
    const raw = localStorage.getItem(SELECTED_SHAPES_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isPersistedGeoShape).map(shape => ({
      ...shape,
      visible: shape.visible !== false,
    }));
  } catch {
    return [];
  }
}

export function saveSelectedShapes(shapes: PersistedGeoShape[]): void {
  localStorage.setItem(SELECTED_SHAPES_STORAGE_KEY, JSON.stringify(shapes));
}

export function getVisibleShapes(shapes: SelectedGeoShape[]): SelectedGeoShape[] {
  return shapes.filter(shape => shape.visible !== false);
}
