import clsx from "clsx";
import { useMemo } from "react";
import { BodyText } from "@/components/ui";
import type { MeshDefinition, MeshDefinitionComposite } from "../lib/meshDefinition";

interface MeshCompositesPanelProps {
  meshDefinition: MeshDefinition | null;
  highlightedCompositeUuid: string | null;
  onHighlightComposite: (compositeUuid: string | null) => void;
}

function sortCompositesForDisplay(
  composites: MeshDefinitionComposite[],
): MeshDefinitionComposite[] {
  return [...composites].sort((left, right) => left.name.localeCompare(right.name));
}

export function MeshCompositesPanel({
  meshDefinition,
  highlightedCompositeUuid,
  onHighlightComposite,
}: MeshCompositesPanelProps) {
  const composites = useMemo(
    () => sortCompositesForDisplay(meshDefinition?.composites ?? []),
    [meshDefinition],
  );

  if (!meshDefinition || composites.length === 0) {
    return null;
  }

  const handleToggleHighlight = (compositeUuid: string) => {
    onHighlightComposite(highlightedCompositeUuid === compositeUuid ? null : compositeUuid);
  };

  return (
    <div className="flex min-h-0 flex-col gap-3 border-t border-grey-200 pt-3">
      <div className="flex flex-col gap-1">
        <BodyText type="title-small">Composites ({composites.length})</BodyText>
        <BodyText color="grey-40" type="body-small">
          Click a composite to highlight its outer boundary on the map. Click again to clear.
        </BodyText>
      </div>

      <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto">
        {composites.map(composite => {
          const isHighlighted = composite.uuid === highlightedCompositeUuid;

          return (
            <li key={composite.uuid}>
              <button
                type="button"
                className={clsx(
                  "w-full rounded-md border px-2 py-1.5 text-left transition-colors",
                  isHighlighted
                    ? "border-teal-500 bg-teal-50"
                    : "border-grey-200 bg-white hover:border-teal-200 hover:bg-teal-50/40",
                )}
                onClick={() => handleToggleHighlight(composite.uuid)}
              >
                <BodyText type="label-small" className="truncate font-medium leading-tight">
                  {composite.name}
                </BodyText>
                <BodyText color="grey-40" type="label-small" className="leading-tight">
                  id {composite.id} · {composite.faces.length} face
                  {composite.faces.length === 1 ? "" : "s"}
                  {isHighlighted ? " · highlighted" : ""}
                </BodyText>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
