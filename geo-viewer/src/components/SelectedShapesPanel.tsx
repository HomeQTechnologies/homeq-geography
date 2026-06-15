import CloseRounded from "@mui/icons-material/CloseRounded";
import ExpandLessRounded from "@mui/icons-material/ExpandLessRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import VisibilityOffRounded from "@mui/icons-material/VisibilityOffRounded";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { ActionButton, BodyText, IconButton } from "@/components/ui";
import { getShapeStyle, MapDisplaySettings } from "../lib/mapDisplaySettings";
import {
  getFragmentLabel,
  getHoleLabel,
  getShapeFragments,
  isHoleClosed,
  shapeHasExpandableDetails,
  type FocusedShapeFragment,
} from "../lib/shapeFragments";
import { getShapeTypeLabel, parseShapeTypeKey } from "../lib/shapeTypes";
import { getVisibleShapes } from "../lib/selectedShapesStorage";
import type { SelectedGeoShape } from "../lib/types";

interface SelectedShapesPanelProps {
  shapes: SelectedGeoShape[];
  displaySettings: MapDisplaySettings;
  focusedFragment?: FocusedShapeFragment | null;
  sidebarMode?: "search" | "draw";
  onFocusShape: (shapeId: string) => void;
  onFocusFragment: (shapeId: string, fragmentIndex: number) => void;
  onFitAll: () => void;
  canFitAll: boolean;
  onToggleVisibility: (shapeId: string) => void;
  onToggleFragmentVisibility: (shapeId: string, fragmentIndex: number) => void;
  onToggleClosedHole: (shapeId: string, fragmentIndex: number, holeIndex: number) => void;
  onRemove: (shapeId: string) => void;
  onClear: () => void;
}

export function SelectedShapesPanel({
  shapes,
  displaySettings,
  focusedFragment,
  sidebarMode = "search",
  onFocusShape,
  onFocusFragment,
  onFitAll,
  canFitAll,
  onToggleVisibility,
  onToggleFragmentVisibility,
  onToggleClosedHole,
  onRemove,
  onClear,
}: SelectedShapesPanelProps) {
  const [expandedShapeIds, setExpandedShapeIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!focusedFragment) return;
    setExpandedShapeIds(prev => {
      if (prev.has(focusedFragment.shapeId)) return prev;
      const next = new Set(prev);
      next.add(focusedFragment.shapeId);
      return next;
    });
  }, [focusedFragment]);

  if (shapes.length === 0) {
    return (
      <BodyText color="grey-40" type="body-small">
        {sidebarMode === "search"
          ? "No shapes selected. Search above and pick a suggestion to add it to the map."
          : "No searched shapes on the map yet. Switch to Search to add shapes from geo search."}
      </BodyText>
    );
  }

  const visibleCount = getVisibleShapes(shapes).length;

  const toggleExpanded = (shapeId: string) => {
    setExpandedShapeIds(prev => {
      const next = new Set(prev);
      if (next.has(shapeId)) {
        next.delete(shapeId);
      } else {
        next.add(shapeId);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <BodyText type="title-small">
          Selected ({shapes.length}
          {visibleCount !== shapes.length ? ` · ${visibleCount} visible` : ""})
        </BodyText>
        <div className="flex shrink-0 items-center gap-1">
          <ActionButton type="default" size="sm" disabled={!canFitAll} onClick={onFitAll}>
            Fit all
          </ActionButton>
          <ActionButton type="default" size="sm" onClick={onClear}>
            Clear all
          </ActionButton>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {shapes.map(shape => {
          const shapeTypeLabel = getShapeTypeLabel(shape.id);
          const color = getShapeStyle(displaySettings.typeColors, shape.id).fill;
          const isFocused = focusedFragment?.shapeId === shape.id;
          const isVisible = shape.visible !== false;
          const canFocus = isVisible && Boolean(shape.geoInfo) && !shape.isLoading;
          const fragments = getShapeFragments(shape);
          const hasExpandableDetails = shapeHasExpandableDetails(shape);
          const isExpanded = expandedShapeIds.has(shape.id);
          const hiddenFragments = new Set(shape.hiddenFragmentIndices ?? []);

          return (
            <li
              key={shape.id}
              className={clsx(
                "border-grey-200 flex flex-col gap-2 rounded-lg border bg-white p-3",
                isFocused && "ring-primary-500 ring-2 ring-inset",
                !isVisible && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  disabled={!canFocus}
                  className={`min-w-0 flex-1 text-left ${
                    canFocus ? "hover:bg-grey-50 -m-1 cursor-pointer rounded-md p-1" : "cursor-default opacity-90"
                  }`}
                  onClick={() => canFocus && onFocusShape(shape.id)}
                  aria-label={canFocus ? `Zoom map to ${shape.text}` : undefined}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: color, opacity: isVisible ? 1 : 0.35 }}
                      title={parseShapeTypeKey(shape.id)}
                    />
                    <BodyText type="body-small" className="min-w-0 flex-1 truncate font-medium">
                      {shape.text}
                    </BodyText>
                    {fragments.length > 1 && (
                      <BodyText color="grey-40" type="label-small" className="shrink-0">
                        {fragments.length} parts
                      </BodyText>
                    )}
                    {shapeTypeLabel && (
                      <BodyText color="grey-40" type="body-small" className="shrink-0">
                        {shapeTypeLabel}
                      </BodyText>
                    )}
                  </div>
                  <BodyText color="grey-40" type="label-small" className="mt-1 truncate">
                    {shape.id}
                  </BodyText>
                  {shape.isLoading && (
                    <BodyText color="grey-40" type="label-small" className="mt-1">
                      Loading GeoJSON...
                    </BodyText>
                  )}
                  {shape.error && (
                    <BodyText type="label-small" className="mt-1 text-red-600">
                      {shape.error}
                    </BodyText>
                  )}
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  {hasExpandableDetails && (
                    <IconButton
                      small
                      ariaLabel={isExpanded ? `Hide details for ${shape.text}` : `Show details for ${shape.text}`}
                      onClick={() => toggleExpanded(shape.id)}
                    >
                      {isExpanded ? <ExpandLessRounded fontSize="small" /> : <ExpandMoreRounded fontSize="small" />}
                    </IconButton>
                  )}
                  <IconButton
                    small
                    ariaLabel={isVisible ? `Hide ${shape.text}` : `Show ${shape.text}`}
                    onClick={() => onToggleVisibility(shape.id)}
                  >
                    {isVisible ? <VisibilityRounded fontSize="small" /> : <VisibilityOffRounded fontSize="small" />}
                  </IconButton>
                  <IconButton small ariaLabel={`Remove ${shape.text}`} onClick={() => onRemove(shape.id)}>
                    <CloseRounded fontSize="small" />
                  </IconButton>
                </div>
              </div>

              {hasExpandableDetails && isExpanded && (
                <ul className="border-grey-100 ml-5 flex flex-col gap-1 border-l pl-3">
                  {fragments.map(fragment => {
                    const fragmentVisible = !hiddenFragments.has(fragment.index);
                    const fragmentFocused =
                      focusedFragment?.shapeId === shape.id &&
                      focusedFragment.fragmentIndex === fragment.index;
                    const canFocusFragment = canFocus && fragmentVisible;
                    const holeCount = fragment.hasHoles ? fragment.ringCount - 1 : 0;
                    const openHoleCount = Array.from({ length: holeCount }, (_, holeIndex) => holeIndex).filter(
                      holeIndex => !isHoleClosed(shape, fragment.index, holeIndex),
                    ).length;

                    return (
                      <li key={fragment.index} className="flex flex-col gap-1">
                        <div
                          className={clsx(
                            "flex items-center justify-between gap-2 rounded-md px-2 py-1",
                            fragmentFocused && "bg-primary-50",
                            !fragmentVisible && "opacity-50",
                          )}
                        >
                          <ActionButton
                            type="default"
                            size="sm"
                            disabled={!canFocusFragment}
                            className="min-w-0 flex-1 !justify-start !px-0"
                            onClick={() => onFocusFragment(shape.id, fragment.index)}
                          >
                            {getFragmentLabel(fragment, openHoleCount)}
                          </ActionButton>
                          <IconButton
                            small
                            ariaLabel={
                              fragmentVisible
                                ? `Hide ${getFragmentLabel(fragment)}`
                                : `Show ${getFragmentLabel(fragment)}`
                            }
                            onClick={() => onToggleFragmentVisibility(shape.id, fragment.index)}
                          >
                            {fragmentVisible ? (
                              <VisibilityRounded sx={{ fontSize: 16 }} />
                            ) : (
                              <VisibilityOffRounded sx={{ fontSize: 16 }} />
                            )}
                          </IconButton>
                        </div>

                        {holeCount > 0 && (
                          <ul className="border-grey-100 ml-3 flex flex-col gap-1 border-l pl-3">
                            {Array.from({ length: holeCount }, (_, holeIndex) => holeIndex).map(holeIndex => {
                              const holeClosed = isHoleClosed(shape, fragment.index, holeIndex);

                              return (
                                <li
                                  key={holeIndex}
                                  className={clsx(
                                    "flex items-center justify-between gap-2 rounded-md px-2 py-1",
                                    holeClosed && "opacity-60",
                                  )}
                                >
                                  <BodyText
                                    type="label-small"
                                    className={clsx("text-sm", holeClosed && "line-through")}
                                  >
                                    {getHoleLabel(holeIndex)}
                                  </BodyText>
                                  <ActionButton
                                    type="default"
                                    size="sm"
                                    className="!h-auto !px-0 text-xs"
                                    ariaLabel={
                                      holeClosed
                                        ? `Reopen ${getHoleLabel(holeIndex)} in ${getFragmentLabel(fragment)}`
                                        : `Close ${getHoleLabel(holeIndex)} in ${getFragmentLabel(fragment)}`
                                    }
                                    onClick={() => onToggleClosedHole(shape.id, fragment.index, holeIndex)}
                                  >
                                    {holeClosed ? "Reopen" : "Close hole"}
                                  </ActionButton>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
