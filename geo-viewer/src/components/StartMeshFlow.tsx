import { ActionButton, Alert, BodyText, Spinner, TextInput } from "@/components/ui";
import { GeoShapeSearchInput } from "./GeoShapeSearchInput";
import type { GeoSearchSuggestion } from "../lib/types";

export type StartMeshFlowStep = "select-shape" | "loading" | "name";

interface StartMeshFlowProps {
  step: StartMeshFlowStep;
  shapeTypes?: string;
  showAll: boolean;
  selectedShape: GeoSearchSuggestion | null;
  meshName: string;
  error: string | null;
  isSaving: boolean;
  onSelectShape: (suggestion: GeoSearchSuggestion) => void;
  onMeshNameChange: (name: string) => void;
  onComplete: () => void;
  onCancel: () => void;
}

const STEP_LABELS: Record<StartMeshFlowStep, string> = {
  "select-shape": "Choose a geoshape",
  loading: "Creating mesh",
  name: "Name your mesh",
};

export function StartMeshFlow({
  step,
  shapeTypes,
  showAll,
  selectedShape,
  meshName,
  error,
  isSaving,
  onSelectShape,
  onMeshNameChange,
  onComplete,
  onCancel,
}: StartMeshFlowProps) {
  const stepNumber = step === "select-shape" ? 1 : step === "loading" ? 2 : 3;

  return (
    <div className="border-primary-200 bg-primary-50 flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <BodyText type="title-small">Start new mesh</BodyText>
          <BodyText color="grey-40" type="label-small">
            Step {stepNumber} of 3 · {STEP_LABELS[step]}
          </BodyText>
        </div>
        <ActionButton type="default" size="sm" disabled={isSaving} onClick={onCancel}>
          Cancel
        </ActionButton>
      </div>

      {step === "select-shape" ? (
        <div className="flex flex-col gap-3">
          <BodyText color="grey-40" type="body-small">
            Search for a geoshape to use as the starting boundary for your mesh.
          </BodyText>
          <GeoShapeSearchInput
            onAdd={onSelectShape}
            selectedIds={selectedShape ? [selectedShape.id] : []}
            shapeTypes={shapeTypes}
            showAll={showAll}
          />
        </div>
      ) : null}

      {step === "loading" ? (
        <div className="flex flex-col gap-3">
          {selectedShape ? (
            <BodyText type="label-small">{selectedShape.text}</BodyText>
          ) : null}
          <div className="flex items-center gap-2">
            <Spinner size="sm" />
            <BodyText color="grey-40" type="body-small">
              Loading the geoshape and converting it into a mesh...
            </BodyText>
          </div>
        </div>
      ) : null}

      {step === "name" ? (
        <div className="flex flex-col gap-3">
          <BodyText color="grey-40" type="body-small">
            {selectedShape
              ? `The mesh for "${selectedShape.text}" is ready. Choose a file name to save it in your mesh folder.`
              : "Choose a file name to save the mesh in your mesh folder."}
          </BodyText>
          <TextInput
            small
            value={meshName}
            onChange={event => onMeshNameChange(event.target.value)}
            placeholder="my-area.mesh.json"
          />
          <ActionButton
            type="filled"
            disabled={!meshName.trim() || isSaving}
            onClick={onComplete}
          >
            {isSaving ? "Saving..." : "Create mesh"}
          </ActionButton>
        </div>
      ) : null}

      {error ? <Alert type="danger">{error}</Alert> : null}
    </div>
  );
}
