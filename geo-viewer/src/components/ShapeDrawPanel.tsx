import {
  ActionButton,
  Alert,
  BodyText,
  SimpleCheckbox,
  TextArea,
  TextInput,
} from "@/components/ui";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  downloadShapePackage,
  validateShapeDrawExport,
  validateShapeDrawMetadata,
} from "../lib/shapeExport";
import { createDefaultShapeDrawMetadata, type ShapeDrawMetadata } from "../lib/shapeDrawTypes";
import { getAllDrawFeatures, type DrawPolygonEntry } from "../lib/drawPolygons";
import { DrawPolygonsList } from "./DrawPolygonsList";
import { DrawStepSection } from "./DrawStepSection";

interface ShapeDrawPanelProps {
  drawPolygons: DrawPolygonEntry[];
  isDrawingActive: boolean;
  metadata: ShapeDrawMetadata;
  onMetadataChange: (metadata: ShapeDrawMetadata) => void;
  onStartDrawing: () => void;
  onTogglePolygonVisibility: (polygonId: string) => void;
  onRemovePolygon: (polygonId: string) => void;
  onFocusPolygon: (polygonId: string) => void;
  onStartOver: () => void;
}

const TOTAL_STEPS = 3;

function updateMetadata(
  metadata: ShapeDrawMetadata,
  patch: Partial<ShapeDrawMetadata>,
): ShapeDrawMetadata {
  return { ...metadata, ...patch };
}

function getDrawingStepDescription(isDrawingActive: boolean, drawingComplete: boolean): string {
  if (drawingComplete) {
    return "Drawing complete. Add another polygon if needed, or continue to export the shape package.";
  }

  if (isDrawingActive) {
    return "Click on the map to place vertices and double-click to finish the polygon.";
  }

  return "Click Add polygon to draw on the map.";
}

export function ShapeDrawPanel({
  drawPolygons,
  isDrawingActive,
  metadata,
  onMetadataChange,
  onStartDrawing,
  onTogglePolygonVisibility,
  onRemovePolygon,
  onFocusPolygon,
  onStartOver,
}: ShapeDrawPanelProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const drawFeatures = useMemo(() => getAllDrawFeatures(drawPolygons), [drawPolygons]);

  const metadataValidation = useMemo(() => validateShapeDrawMetadata(metadata), [metadata]);
  const exportValidation = useMemo(
    () => validateShapeDrawExport(metadata, drawFeatures),
    [metadata, drawFeatures],
  );

  const polygonCount = drawPolygons.length;
  const metadataComplete = metadataValidation.valid;
  const drawingComplete = polygonCount > 0;

  const canAdvanceFromStep1 = metadataComplete;
  const canAdvanceFromStep2 = drawingComplete;

  useEffect(() => {
    if (isDrawingActive && metadataComplete && currentStep === 1) {
      setCurrentStep(2);
    }
  }, [isDrawingActive, metadataComplete, currentStep]);

  const handleExport = () => {
    setActionError(null);
    try {
      downloadShapePackage(metadata, drawFeatures);
      handleStartOver();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Export failed.");
    }
  };

  const handleStartOver = () => {
    onStartOver();
    setCurrentStep(1);
    setActionError(null);
  };

  const goToNextStep = () => {
    setCurrentStep(step => Math.min(TOTAL_STEPS, step + 1));
  };

  const goToPreviousStep = () => {
    setCurrentStep(step => Math.max(1, step - 1));
  };

  return (
    <div className="border-grey-200 flex flex-col gap-3 rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <BodyText type="title-small">Draw new area shape</BodyText>
          <BodyText color="grey-40" type="label-small" className="mt-1">
            Step {currentStep} of {TOTAL_STEPS}
          </BodyText>
        </div>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: TOTAL_STEPS }, (_, index) => {
            const stepNumber = index + 1;
            const isActive = stepNumber === currentStep;
            const isComplete =
              (stepNumber === 1 && metadataComplete) ||
              (stepNumber === 2 && drawingComplete) ||
              (stepNumber === 3 && exportValidation.valid);

            return (
              <span
                key={stepNumber}
                className={clsx(
                  "h-2 rounded-full transition-all duration-300",
                  isActive ? "bg-primary-400 w-5" : "w-2",
                  !isActive && isComplete && "bg-primary-200",
                  !isActive && !isComplete && "bg-grey-200",
                )}
              />
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(-${(currentStep - 1) * 100}%)` }}
        >
          <div className="w-full shrink-0 pr-1">
            <DrawStepSection
              step={1}
              title="Metadata"
              description="Enter the area shape details used in the shapes table."
              complete={metadataComplete}
            >
              {!metadataComplete && (
                <Alert type="warning">
                  <ul className="list-disc pl-5">
                    {metadataValidation.errors.map(error => (
                      <li key={error}>
                        <BodyText type="label-small">{error}</BodyText>
                      </li>
                    ))}
                  </ul>
                </Alert>
              )}

              <div className="grid grid-cols-1 gap-3">
                <div className="flex flex-col gap-1">
                  <BodyText type="label-small">Name</BodyText>
                  <TextInput
                    small
                    value={metadata.name}
                    placeholder="e.g. Södermalm test area"
                    onChange={event => onMetadataChange(updateMetadata(metadata, { name: event.target.value }))}
                  />
                </div>

                <SimpleCheckbox
                  checked={metadata.isPublic}
                  onClick={checked => onMetadataChange(updateMetadata(metadata, { isPublic: checked === true }))}
                >
                  <BodyText type="label-small">Public in geo search</BodyText>
                </SimpleCheckbox>

                <div className="flex flex-col gap-1">
                  <BodyText type="label-small">Notes</BodyText>
                  <TextArea
                    autoGrow={false}
                    rows={3}
                    value={metadata.notes}
                    placeholder="Optional notes for the shapes table"
                    onChange={event => onMetadataChange(updateMetadata(metadata, { notes: event.target.value }))}
                  />
                </div>
              </div>
            </DrawStepSection>
          </div>

          <div className="w-full shrink-0 px-1">
            <DrawStepSection
              step={2}
              title="Drawing"
              description={getDrawingStepDescription(isDrawingActive, drawingComplete)}
              complete={drawingComplete}
            >
              <ActionButton type="filled" size="sm" onClick={onStartDrawing}>
                Add polygon
              </ActionButton>

              <DrawPolygonsList
                polygons={drawPolygons}
                onToggleVisibility={onTogglePolygonVisibility}
                onRemove={onRemovePolygon}
                onFocus={onFocusPolygon}
              />
            </DrawStepSection>
          </div>

          <div className="w-full shrink-0 pl-1">
            <DrawStepSection
              step={3}
              title="Export shape"
              description="Download a local shape package with metadata and geometry."
              complete={exportValidation.valid}
            >
              {!exportValidation.valid && (
                <Alert type="warning">
                  <ul className="list-disc pl-5">
                    {exportValidation.errors.map(error => (
                      <li key={error}>
                        <BodyText type="label-small">{error}</BodyText>
                      </li>
                    ))}
                  </ul>
                </Alert>
              )}

              {actionError && <Alert type="danger">{actionError}</Alert>}

              <div className="flex flex-wrap gap-2">
                <ActionButton
                  type="filled"
                  size="sm"
                  disabled={!exportValidation.valid}
                  onClick={handleExport}
                >
                  Download shape package
                </ActionButton>
                <ActionButton type="secondary" size="sm" onClick={handleStartOver}>
                  Start over
                </ActionButton>
              </div>

              <BodyText color="grey-40" type="label-small">
                The package can be imported again later when local file storage is added.
              </BodyText>
            </DrawStepSection>
          </div>
        </div>
      </div>

      <div className="border-grey-100 flex items-center justify-between gap-2 border-t pt-3">
        {currentStep > 1 ? (
          <button
            type="button"
            className="text-grey-500 hover:text-grey-500 inline-flex items-center gap-1 text-xs hover:underline"
            onClick={goToPreviousStep}
          >
            <ArrowBackRounded sx={{ fontSize: 14 }} />
            Back
          </button>
        ) : (
          <span />
        )}

        {currentStep < TOTAL_STEPS ? (
          <ActionButton
            type="filled"
            size="sm"
            disabled={(currentStep === 1 && !canAdvanceFromStep1) || (currentStep === 2 && !canAdvanceFromStep2)}
            onClick={goToNextStep}
          >
            Next
          </ActionButton>
        ) : null}
      </div>
    </div>
  );
}

export { createDefaultShapeDrawMetadata };
