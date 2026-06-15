import { ActionButton, BodyText } from "@/components/ui";
import type { FocusedShapeFragment } from "../lib/shapeFragments";
import type { MapDisplaySettings } from "../lib/mapDisplaySettings";
import type { MeshDefinition } from "../lib/meshDefinition";
import type { MeshDocument } from "../lib/meshSubdivision";
import type { SelectedGeoShape } from "../lib/types";
import { MeshCompositesPanel } from "./MeshCompositesPanel";
import { MeshFacesPanel } from "./MeshFacesPanel";
import { SelectedShapesPanel } from "./SelectedShapesPanel";

export type ViewerMode = "search" | "draw" | "mesh" | "geojson" | "settings";

export function modeHasDetailPanel(mode: ViewerMode): boolean {
  return mode !== "settings";
}

interface ModeDetailPanelProps {
  mode: ViewerMode;
  selectedShapes: SelectedGeoShape[];
  displaySettings: MapDisplaySettings;
  focusedFragment?: FocusedShapeFragment | null;
  canFitAll: boolean;
  onFocusShape: (shapeId: string) => void;
  onFocusFragment: (shapeId: string, fragmentIndex: number) => void;
  onFitAll: () => void;
  onToggleVisibility: (shapeId: string) => void;
  onToggleFragmentVisibility: (shapeId: string, fragmentIndex: number) => void;
  onToggleClosedHole: (shapeId: string, fragmentIndex: number, holeIndex: number) => void;
  onRemoveShape: (shapeId: string) => void;
  onClearShapes: () => void;
  meshDocument: MeshDocument;
  meshDefinition: MeshDefinition | null;
  meshDefinitionEditorOpen: boolean;
  onOpenMeshDefinitionEditor: () => void;
  meshSelectedFaceId: string | null;
  meshHighlightedCompositeUuid: string | null;
  onMeshDocumentChange: (document: MeshDocument) => void;
  onSelectMeshFace: (faceId: string | null) => void;
  onSelectMeshEdge: (faceId: string, edgeIndex: number | null) => void;
  onHighlightMeshComposite: (compositeUuid: string | null) => void;
}

export function ModeDetailPanel({
  mode,
  selectedShapes,
  displaySettings,
  focusedFragment,
  canFitAll,
  onFocusShape,
  onFocusFragment,
  onFitAll,
  onToggleVisibility,
  onToggleFragmentVisibility,
  onToggleClosedHole,
  onRemoveShape,
  onClearShapes,
  meshDocument,
  meshDefinition,
  meshDefinitionEditorOpen,
  onOpenMeshDefinitionEditor,
  meshSelectedFaceId,
  meshHighlightedCompositeUuid,
  onMeshDocumentChange,
  onSelectMeshFace,
  onSelectMeshEdge,
  onHighlightMeshComposite,
}: ModeDetailPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {mode === "search" || mode === "draw" || mode === "geojson" ? (
          <SelectedShapesPanel
            shapes={selectedShapes}
            displaySettings={displaySettings}
            focusedFragment={focusedFragment}
            sidebarMode={mode === "draw" ? "draw" : "search"}
            onFocusShape={onFocusShape}
            onFocusFragment={onFocusFragment}
            onFitAll={onFitAll}
            canFitAll={canFitAll}
            onToggleVisibility={onToggleVisibility}
            onToggleFragmentVisibility={onToggleFragmentVisibility}
            onToggleClosedHole={onToggleClosedHole}
            onRemove={onRemoveShape}
            onClear={onClearShapes}
          />
        ) : null}

        {mode === "mesh" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <ActionButton
                type={meshDefinitionEditorOpen ? "filled" : "secondary"}
                className="w-full"
                disabled={!meshDefinition}
                onClick={onOpenMeshDefinitionEditor}
              >
                Definitions
              </ActionButton>
              <BodyText color="grey-40" type="body-small">
                Open the definition editor in the center panel to edit required faces and composites.
              </BodyText>
            </div>
            <MeshFacesPanel
              document={meshDocument}
              meshDefinition={meshDefinition}
              selectedFaceId={meshSelectedFaceId}
              onDocumentChange={onMeshDocumentChange}
              onSelectFace={onSelectMeshFace}
              onSelectEdge={onSelectMeshEdge}
            />
            <MeshCompositesPanel
              meshDefinition={meshDefinition}
              highlightedCompositeUuid={meshHighlightedCompositeUuid}
              onHighlightComposite={onHighlightMeshComposite}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
