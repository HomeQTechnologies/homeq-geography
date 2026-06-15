import FitScreenRounded from "@mui/icons-material/FitScreenRounded";
import FolderOpenRounded from "@mui/icons-material/FolderOpenRounded";
import SaveRounded from "@mui/icons-material/SaveRounded";
import ClearRounded from "@mui/icons-material/ClearRounded";
import { useState } from "react";
import { ActionButton, Alert, BodyText, SimpleCheckbox, TextInput } from "@/components/ui";
import {
  buildMeshFaceCollection,
  type MeshDocument,
  type MeshInteractionMode,
} from "../lib/meshSubdivision";
import type { GeoSearchSuggestion } from "../lib/types";
import type { MeshDefinition } from "../lib/meshDefinition";
import { MeshWorkspacePanel } from "./MeshWorkspacePanel";
import { StartMeshFlow, type StartMeshFlowStep } from "./StartMeshFlow";

interface MeshSubdividePanelProps {
  document: MeshDocument;
  selectedFaceId: string | null;
  interactionMode: MeshInteractionMode;
  showAll: boolean;
  shapeTypes?: string;
  onInteractionModeChange: (mode: MeshInteractionMode) => void;
  outerVerticesLocked: boolean;
  onOuterVerticesLockedChange: (locked: boolean) => void;
  onFocusMesh: () => void;
  onImportMesh: (document: MeshDocument, fileName?: string, definition?: MeshDefinition) => void;
  hasMeshDefinition: boolean;
  mergeError?: string | null;
  meshFileName: string;
  onMeshFileNameChange: (fileName: string) => void;
  onSaveMesh: () => void;
  isSavingMesh: boolean;
  saveMeshMessage?: string | null;
  saveMeshError?: string | null;
  startMeshFlowStep: StartMeshFlowStep | null;
  startMeshFlowShape: GeoSearchSuggestion | null;
  startMeshFlowName: string;
  startMeshFlowError: string | null;
  isStartMeshFlowSaving: boolean;
  onStartMesh: () => void;
  onStartMeshFlowSelectShape: (suggestion: GeoSearchSuggestion) => void;
  onStartMeshFlowNameChange: (name: string) => void;
  onStartMeshFlowComplete: () => void;
  onStartMeshFlowCancel: () => void;
  onClearMesh: () => void;
}

const INTERACTION_MODES: Array<{ id: MeshInteractionMode; label: string; description: string }> = [
  {
    id: "edit-vertices",
    label: "Move shared vertices",
    description:
      "Drag any vertex to reshape every connected face at once. Hold Shift and click a yellow edge point to split the edge, or Shift and click a red vertex to remove it. Use Undo move for up to 10 vertex drags. Purple points are on the mesh boundary.",
  },
  {
    id: "subdivide-face",
    label: "Split face",
    description:
      "Click two vertices on the same face to draw a split line and divide it into two new faces. The vertices must not already be connected by an edge.",
  },
  {
    id: "create-face",
    label: "Create face",
    description:
      "Click four existing vertices to connect them into a new face. Click a picked vertex again to remove it from the selection.",
  },
  {
    id: "merge-faces",
    label: "Merge faces",
    description:
      "Click two faces that share an edge to combine them into one face. Click the first face again to cancel the selection.",
  },
];

export function MeshSubdividePanel({
  document,
  selectedFaceId,
  interactionMode,
  onInteractionModeChange,
  outerVerticesLocked,
  onOuterVerticesLockedChange,
  onFocusMesh,
  showAll,
  shapeTypes,
  onImportMesh,
  mergeError,
  meshFileName,
  onMeshFileNameChange,
  onSaveMesh,
  isSavingMesh,
  saveMeshMessage,
  saveMeshError,
  hasMeshDefinition,
  startMeshFlowStep,
  startMeshFlowShape,
  startMeshFlowName,
  startMeshFlowError,
  isStartMeshFlowSaving,
  onStartMesh,
  onStartMeshFlowSelectShape,
  onStartMeshFlowNameChange,
  onStartMeshFlowComplete,
  onStartMeshFlowCancel,
  onClearMesh,
}: MeshSubdividePanelProps) {
  const [showLoadMeshPanel, setShowLoadMeshPanel] = useState(false);
  const selectedFace = document.faces.find(face => face.id === selectedFaceId) ?? null;
  const flowActive = startMeshFlowStep !== null;
  const hasActiveMesh = document.faces.length > 0;
  const canFitMesh = hasActiveMesh && !flowActive;
  const canStartMesh = !hasActiveMesh && !flowActive;
  const canLoadMesh = !flowActive && !hasActiveMesh;
  const canSaveMesh =
    hasActiveMesh && !flowActive && meshFileName.trim().length > 0 && !isSavingMesh && hasMeshDefinition;
  const canEditMesh = hasActiveMesh && !flowActive;
  const canClearMesh =
    flowActive || hasActiveMesh || meshFileName.trim().length > 0 || showLoadMeshPanel;
  const activeInteractionMode = INTERACTION_MODES.find(mode => mode.id === interactionMode);

  const handleClearMesh = () => {
    setShowLoadMeshPanel(false);
    onClearMesh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <BodyText type="title-small">Controls</BodyText>

        {canEditMesh ? (
          <div className="border-grey-200 flex flex-col gap-2 rounded-lg border bg-grey-50 px-3 py-2">
            <BodyText color="grey-40" type="label-small">
              Current mesh
            </BodyText>
            <TextInput
              small
              value={meshFileName}
              onChange={event => onMeshFileNameChange(event.target.value)}
              placeholder="Unsaved mesh"
            />
          </div>
        ) : !flowActive ? (
          <BodyText color="grey-40" type="body-small">
            No mesh loaded.
          </BodyText>
        ) : null}

        <div className="flex flex-col gap-2">
          <ActionButton className="w-full" disabled={!canFitMesh} onClick={onFocusMesh}>
            <FitScreenRounded className="mr-1" fontSize="small" />
            Fit mesh
          </ActionButton>
          <ActionButton className="w-full" type="default" disabled={!canStartMesh} onClick={onStartMesh}>
            Start mesh
          </ActionButton>
          <ActionButton
            className="w-full"
            type={showLoadMeshPanel ? "filled" : "default"}
            disabled={!canLoadMesh}
            onClick={() => setShowLoadMeshPanel(open => !open)}
          >
            <FolderOpenRounded className="mr-1" fontSize="small" />
            Load existing mesh
          </ActionButton>
          <ActionButton
            className="w-full"
            type="filled"
            disabled={!canSaveMesh}
            spinning={isSavingMesh}
            onClick={onSaveMesh}
          >
            <SaveRounded className="mr-1" fontSize="small" />
            {isSavingMesh ? "Saving..." : "Save mesh"}
          </ActionButton>
          <ActionButton className="w-full" type="default" disabled={!canClearMesh} onClick={handleClearMesh}>
            <ClearRounded className="mr-1" fontSize="small" />
            Clear
          </ActionButton>
        </div>

        {saveMeshError ? <Alert type="danger">{saveMeshError}</Alert> : null}
        {saveMeshMessage ? <Alert type="info">{saveMeshMessage}</Alert> : null}
      </div>

      {flowActive && startMeshFlowStep ? (
        <StartMeshFlow
          step={startMeshFlowStep}
          shapeTypes={shapeTypes}
          showAll={showAll}
          selectedShape={startMeshFlowShape}
          meshName={startMeshFlowName}
          error={startMeshFlowError}
          isSaving={isStartMeshFlowSaving}
          onSelectShape={onStartMeshFlowSelectShape}
          onMeshNameChange={onStartMeshFlowNameChange}
          onComplete={onStartMeshFlowComplete}
          onCancel={onStartMeshFlowCancel}
        />
      ) : null}

      {showLoadMeshPanel && !flowActive ? (
        <MeshWorkspacePanel
          document={document}
          onImportMesh={onImportMesh}
          loadOnly
          defaultSaveFileName={meshFileName}
          onLoaded={() => setShowLoadMeshPanel(false)}
        />
      ) : null}

      {!flowActive && canEditMesh ? (
        <div className="flex flex-col gap-3">
          <BodyText type="label-small">Map interaction</BodyText>
          <div className="rounded-lg border border-grey-200 p-3">
            <SimpleCheckbox
              checked={outerVerticesLocked}
              onClick={checked => onOuterVerticesLockedChange(checked === true)}
            >
              <BodyText type="label-small">Lock boundary vertices</BodyText>
            </SimpleCheckbox>
          </div>
          <div className="flex flex-col gap-1">
            {INTERACTION_MODES.map(mode => (
              <ActionButton
                key={mode.id}
                className="w-full"
                type={interactionMode === mode.id ? "filled" : "default"}
                onClick={() => onInteractionModeChange(mode.id)}
              >
                {mode.label}
              </ActionButton>
            ))}
          </div>
          {activeInteractionMode ? (
            <BodyText color="grey-40" type="body-small">
              {activeInteractionMode.description}
              {interactionMode === "subdivide-face" && selectedFace
                ? ` Working on ${selectedFace.name}.`
                : ""}
            </BodyText>
          ) : null}
          {interactionMode === "merge-faces" && mergeError ? (
            <Alert type="danger">{mergeError}</Alert>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function getMeshFocusFeatures(document: MeshDocument): GeoJSON.Feature[] {
  return buildMeshFaceCollection(document).features;
}
