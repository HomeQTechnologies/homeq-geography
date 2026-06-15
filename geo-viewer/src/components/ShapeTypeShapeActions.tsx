import { useState } from "react";
import { ActionButton } from "@/components/ui";
import { notifyError, notifyInfo, notifySuccess } from "../lib/notifications";
import { listGeoShapesByType } from "../api/geoShapesApi";
import type { GeoShapeTypeKey } from "../lib/shapeTypes";
import { mapV3ShapesToSuggestions, partitionNewShapeSuggestions } from "../lib/v3ShapeAdapter";
import type { GeoSearchSuggestion } from "../lib/types";

interface ShapeTypeShapeActionsProps {
  shapeType: GeoShapeTypeKey;
  shapeLabel: string;
  selectedIds: string[];
  showAll: boolean;
  onMapCount: number;
  onAddMany: (suggestions: GeoSearchSuggestion[]) => number;
  onClearType: (shapeType: GeoShapeTypeKey) => number;
}

export function ShapeTypeShapeActions({
  shapeType,
  shapeLabel,
  selectedIds,
  showAll,
  onMapCount,
  onAddMany,
  onClearType,
}: ShapeTypeShapeActionsProps) {
  const [isFetching, setIsFetching] = useState(false);

  const handleLoad = async () => {
    setIsFetching(true);
    try {
      const response = await listGeoShapesByType({
        shapeType,
        showAll,
        ignoreCache: true,
      });

      const suggestions = mapV3ShapesToSuggestions(response.shapes);
      const { toAdd, skipped } = partitionNewShapeSuggestions(suggestions, selectedIds);
      const added = onAddMany(toAdd);

      if (suggestions.length === 0) {
        notifyInfo({ message: `No ${shapeLabel.toLowerCase()} shapes found.` });
        return;
      }

      const parts = [`Loaded ${added}.`];
      if (skipped > 0) {
        parts.push(`${skipped} already on map.`);
      }

      if (added > 0) {
        notifySuccess(parts.join(" "));
      } else {
        notifyInfo({ message: parts.join(" ") });
      }
    } catch {
      notifyError("Failed to load shapes.");
    } finally {
      setIsFetching(false);
    }
  };

  const handleClear = () => {
    const removed = onClearType(shapeType);

    if (removed === 0) {
      notifyInfo({ message: `No ${shapeLabel.toLowerCase()} shapes on the map.` });
      return;
    }

    notifySuccess(`Removed ${removed} ${shapeLabel.toLowerCase()} shape${removed === 1 ? "" : "s"}.`);
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <ActionButton
        type="default"
        size="sm"
        disabled={isFetching}
        spinning={isFetching}
        onClick={() => void handleLoad()}
      >
        {isFetching ? "..." : "Load"}
      </ActionButton>
      <ActionButton type="secondary" size="sm" disabled={onMapCount === 0 || isFetching} onClick={handleClear}>
        Clear
      </ActionButton>
    </div>
  );
}
