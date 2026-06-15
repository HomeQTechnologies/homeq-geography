import {
  ActionButton,
  Alert,
  BodyText,
  Select,
  SimpleCheckbox,
  TextArea,
  TextInput,
} from "@/components/ui";
import { validateShapeDrawMetadata } from "../lib/shapeExport";
import {
  createDefaultShapeDrawMetadata,
  SHAPE_EXPORT_TYPES,
  type ShapeDrawMetadata,
} from "../lib/shapeDrawTypes";

export function getGeoShapeMutationErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: { description?: string; error?: string } }).data;
    if (data?.description) return data.description;
    if (data?.error) return data.error;
  }

  return "Failed to create geo shape.";
}

interface GeoShapeCreateFormProps {
  metadata: ShapeDrawMetadata;
  isCreating: boolean;
  onMetadataChange: (metadata: ShapeDrawMetadata) => void;
  onCreate: () => void;
  onCancel: () => void;
  createLabel?: string;
  title?: string;
  hideNameField?: boolean;
  description?: string;
}

export function GeoShapeCreateForm({
  metadata,
  isCreating,
  onMetadataChange,
  onCreate,
  onCancel,
  createLabel = "Create geo shape",
  title = "Create geo shape",
  hideNameField = false,
  description,
}: GeoShapeCreateFormProps) {
  const metadataValidation = validateShapeDrawMetadata(
    hideNameField ? { ...metadata, name: metadata.name.trim() || "placeholder" } : metadata,
  );

  return (
    <div className="border-grey-200 flex flex-col gap-3 rounded-lg border bg-grey-50 p-3">
      <BodyText type="label-small" className="font-medium">
        {title}
      </BodyText>

      {description ? (
        <BodyText color="grey-40" type="body-small">
          {description}
        </BodyText>
      ) : null}

      {!hideNameField && !metadataValidation.valid ? (
        <Alert type="warning">
          <ul className="list-disc pl-5">
            {metadataValidation.errors.map(validationError => (
              <li key={validationError}>
                <BodyText type="label-small">{validationError}</BodyText>
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-3">
        {!hideNameField ? (
          <div className="flex flex-col gap-1">
            <BodyText type="label-small">Name</BodyText>
            <TextInput
              small
              value={metadata.name}
              placeholder="e.g. Södermalm"
              onChange={event =>
                onMetadataChange({
                  ...metadata,
                  name: event.target.value,
                })
              }
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <BodyText type="label-small">Type</BodyText>
          <Select
            value={metadata.type}
            updateValue={value =>
              onMetadataChange({
                ...metadata,
                type: value as ShapeDrawMetadata["type"],
              })
            }
            options={SHAPE_EXPORT_TYPES.map(option => ({
              label: option.label,
              value: option.value,
            }))}
          />
        </div>

        <SimpleCheckbox
          checked={metadata.isPublic}
          onClick={checked =>
            onMetadataChange({
              ...metadata,
              isPublic: checked === true,
            })
          }
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
            onChange={event =>
              onMetadataChange({
                ...metadata,
                notes: event.target.value,
              })
            }
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <ActionButton
          type="filled"
          size="sm"
          disabled={(!hideNameField && !metadataValidation.valid) || isCreating}
          spinning={isCreating}
          onClick={onCreate}
        >
          {isCreating ? "Creating..." : createLabel}
        </ActionButton>
        <ActionButton type="default" size="sm" disabled={isCreating} onClick={onCancel}>
          Cancel
        </ActionButton>
      </div>
    </div>
  );
}

export { createDefaultShapeDrawMetadata };
