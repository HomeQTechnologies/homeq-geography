import type { GeoSearchSuggestion } from "./types";

export interface GeoShapeV3 {
  id: number;
  main_id: number;
  type: string;
  text: string;
  hash: string;
  shape: string;
  parent?: { type: string; id: number; name: string };
}

export function mapV3ShapeToSuggestion(shape: GeoShapeV3): GeoSearchSuggestion {
  return {
    id: `${shape.type}.${shape.id}`,
    text: shape.text,
    hash: shape.hash,
    shapeUri: shape.shape,
    parent: shape.parent?.name ? { name: shape.parent.name } : undefined,
  };
}

export function mapV3ShapesToSuggestions(shapes: GeoShapeV3[]): GeoSearchSuggestion[] {
  return shapes.map(mapV3ShapeToSuggestion);
}

export function partitionNewShapeSuggestions(
  suggestions: GeoSearchSuggestion[],
  selectedIds: string[],
): { toAdd: GeoSearchSuggestion[]; skipped: number } {
  const existingIds = new Set(selectedIds);
  const toAdd: GeoSearchSuggestion[] = [];
  let skipped = 0;

  for (const suggestion of suggestions) {
    if (existingIds.has(suggestion.id)) {
      skipped += 1;
      continue;
    }

    existingIds.add(suggestion.id);
    toAdd.push(suggestion);
  }

  return { toAdd, skipped };
}
