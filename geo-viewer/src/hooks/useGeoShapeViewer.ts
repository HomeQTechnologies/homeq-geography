import { useCallback, useEffect, useState } from "react";
import { fetchShapeGeoJson } from "../lib/geoApi";
import {
  loadSelectedShapes,
  saveSelectedShapes,
  toPersistedShapes,
} from "../lib/selectedShapesStorage";
import type { GeoSearchSuggestion, SelectedGeoShape } from "../lib/types";
import { parseShapeTypeKey } from "../lib/shapeTypes";
import type { GeoShapeTypeKey } from "../lib/shapeTypes";

function createInitialShapes(): SelectedGeoShape[] {
  return loadSelectedShapes().map(shape => ({ ...shape, isLoading: true }));
}

export function useGeoShapeViewer() {
  const [selectedShapes, setSelectedShapes] = useState<SelectedGeoShape[]>(createInitialShapes);

  useEffect(() => {
    saveSelectedShapes(toPersistedShapes(selectedShapes));
  }, [selectedShapes]);

  const loadShapeGeoJson = useCallback(async (shape: SelectedGeoShape) => {
    if (!shape.shapeUri) {
      setSelectedShapes(prev =>
        prev.map(s =>
          s.id === shape.id ? { ...s, isLoading: false, error: "Missing shape URI" } : s,
        ),
      );
      return;
    }

    try {
      const geoInfo = await fetchShapeGeoJson(shape.shapeUri);
      setSelectedShapes(prev =>
        prev.map(s => (s.id === shape.id ? { ...s, geoInfo, isLoading: false, error: undefined } : s)),
      );
    } catch {
      setSelectedShapes(prev =>
        prev.map(s =>
          s.id === shape.id ? { ...s, isLoading: false, error: "Failed to load GeoJSON" } : s,
        ),
      );
    }
  }, []);

  useEffect(() => {
    selectedShapes.forEach(shape => {
      if (shape.isLoading && !shape.error) {
        void loadShapeGeoJson(shape);
      }
    });
    // Only restore GeoJSON for shapes loaded from localStorage on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addShape = useCallback(
    (suggestion: GeoSearchSuggestion) => {
      setSelectedShapes(prev => {
        if (prev.some(s => s.id === suggestion.id)) return prev;
        const next: SelectedGeoShape = {
          id: suggestion.id,
          hash: suggestion.hash,
          text: suggestion.text,
          shapeUri: suggestion.shapeUri,
          visible: true,
          isLoading: true,
        };
        void loadShapeGeoJson(next);
        return [...prev, next];
      });
    },
    [loadShapeGeoJson],
  );

  const addShapes = useCallback(
    (suggestions: GeoSearchSuggestion[]): number => {
      let addedCount = 0;

      setSelectedShapes(prev => {
        const existingIds = new Set(prev.map(shape => shape.id));
        const newShapes: SelectedGeoShape[] = [];

        for (const suggestion of suggestions) {
          if (existingIds.has(suggestion.id)) continue;

          existingIds.add(suggestion.id);
          newShapes.push({
            id: suggestion.id,
            hash: suggestion.hash,
            text: suggestion.text,
            shapeUri: suggestion.shapeUri,
            visible: true,
            isLoading: true,
          });
        }

        addedCount = newShapes.length;
        if (newShapes.length === 0) return prev;

        for (const shape of newShapes) {
          void loadShapeGeoJson(shape);
        }

        return [...prev, ...newShapes];
      });

      return addedCount;
    },
    [loadShapeGeoJson],
  );

  const removeShape = useCallback((shapeId: string) => {
    setSelectedShapes(prev => prev.filter(s => s.id !== shapeId));
  }, []);

  const toggleShapeVisibility = useCallback((shapeId: string) => {
    setSelectedShapes(prev =>
      prev.map(shape =>
        shape.id === shapeId ? { ...shape, visible: shape.visible === false } : shape,
      ),
    );
  }, []);

  const toggleFragmentVisibility = useCallback((shapeId: string, fragmentIndex: number) => {
    setSelectedShapes(prev =>
      prev.map(shape => {
        if (shape.id !== shapeId) return shape;

        const hidden = new Set(shape.hiddenFragmentIndices ?? []);
        if (hidden.has(fragmentIndex)) {
          hidden.delete(fragmentIndex);
        } else {
          hidden.add(fragmentIndex);
        }

        return {
          ...shape,
          hiddenFragmentIndices: [...hidden].sort((a, b) => a - b),
        };
      }),
    );
  }, []);

  const toggleClosedHole = useCallback((shapeId: string, fragmentIndex: number, holeIndex: number) => {
    setSelectedShapes(prev =>
      prev.map(shape => {
        if (shape.id !== shapeId) return shape;

        const closed = shape.closedHoles ?? [];
        const existingIndex = closed.findIndex(
          hole => hole.fragmentIndex === fragmentIndex && hole.holeIndex === holeIndex,
        );

        if (existingIndex >= 0) {
          return {
            ...shape,
            closedHoles: closed.filter((_, index) => index !== existingIndex),
          };
        }

        return {
          ...shape,
          closedHoles: [...closed, { fragmentIndex, holeIndex }].sort((a, b) =>
            a.fragmentIndex === b.fragmentIndex ? a.holeIndex - b.holeIndex : a.fragmentIndex - b.fragmentIndex,
          ),
        };
      }),
    );
  }, []);

  const clearShapes = useCallback(() => {
    setSelectedShapes([]);
  }, []);

  const removeShapesByType = useCallback((shapeType: GeoShapeTypeKey): number => {
    let removedCount = 0;

    setSelectedShapes(prev => {
      const next = prev.filter(shape => {
        if (parseShapeTypeKey(shape.id) === shapeType) {
          removedCount += 1;
          return false;
        }
        return true;
      });
      return next;
    });

    return removedCount;
  }, []);

  const updateShapeGeometry = useCallback(
    (shapeId: string, geoInfo: GeoJSON.GeoJSON, editedFragmentIndices: number[]) => {
      const edited = new Set(editedFragmentIndices);

      setSelectedShapes(prev =>
        prev.map(shape => {
          if (shape.id !== shapeId) return shape;

          return {
            ...shape,
            geoInfo,
            closedHoles: shape.closedHoles?.filter(hole => !edited.has(hole.fragmentIndex)),
          };
        }),
      );
    },
    [],
  );

  return {
    selectedShapes,
    addShape,
    addShapes,
    removeShape,
    removeShapesByType,
    toggleShapeVisibility,
    toggleFragmentVisibility,
    toggleClosedHole,
    clearShapes,
    updateShapeGeometry,
  };
}
