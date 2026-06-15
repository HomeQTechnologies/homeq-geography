import CloseRounded from "@mui/icons-material/CloseRounded";
import VisibilityOffRounded from "@mui/icons-material/VisibilityOffRounded";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import clsx from "clsx";
import { ActionButton, BodyText, IconButton } from "@/components/ui";
import { getDrawPolygonLabel, type DrawPolygonEntry } from "../lib/drawPolygons";

interface DrawPolygonsListProps {
  polygons: DrawPolygonEntry[];
  onToggleVisibility: (polygonId: string) => void;
  onRemove: (polygonId: string) => void;
  onFocus?: (polygonId: string) => void;
}

export function DrawPolygonsList({
  polygons,
  onToggleVisibility,
  onRemove,
  onFocus,
}: DrawPolygonsListProps) {
  if (polygons.length === 0) {
    return (
      <BodyText color="grey-40" type="label-small">
        No polygons drawn yet. Use the polygon tool on the map to start.
      </BodyText>
    );
  }

  const visibleCount = polygons.filter(polygon => polygon.visible).length;

  return (
    <div className="flex flex-col gap-2">
      <BodyText type="label-small">
        Drawn polygons ({polygons.length}
        {visibleCount !== polygons.length ? ` · ${visibleCount} visible` : ""})
      </BodyText>
      <ul className="flex flex-col gap-2">
        {polygons.map((polygon, index) => {
          const label = getDrawPolygonLabel(index);
          const canFocus = polygon.visible && Boolean(onFocus);

          return (
            <li
              key={polygon.id}
              className={clsx(
                "border-grey-200 flex items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2",
                !polygon.visible && "opacity-60",
              )}
            >
              <ActionButton
                type="default"
                size="sm"
                disabled={!canFocus}
                className="min-w-0 flex-1 !justify-start !px-0"
                onClick={() => canFocus && onFocus?.(polygon.id)}
              >
                {label}
              </ActionButton>
              <div className="flex shrink-0 items-center gap-1">
                <IconButton
                  small
                  ariaLabel={polygon.visible ? `Hide ${label}` : `Show ${label}`}
                  onClick={() => onToggleVisibility(polygon.id)}
                >
                  {polygon.visible ? (
                    <VisibilityRounded fontSize="small" />
                  ) : (
                    <VisibilityOffRounded fontSize="small" />
                  )}
                </IconButton>
                <IconButton small ariaLabel={`Remove ${label}`} onClick={() => onRemove(polygon.id)}>
                  <CloseRounded fontSize="small" />
                </IconButton>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
