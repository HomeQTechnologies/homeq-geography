import { useEffect, useMemo, useState } from "react";
import { ActionButton, Alert, BodyText, TextInput } from "@/components/ui";
import {
  cloneMeshDefinition,
  normalizeMeshDefinition,
  normalizeMeshDefinitionUuid,
  syncMeshDefinitionFacesFromDocument,
  validateMeshDefinitionForDocument,
  type MeshDefinition,
} from "../lib/meshDefinition";
import { MeshDefinitionCompositesEditor } from "./MeshDefinitionCompositesEditor";
import type { MeshDocument } from "../lib/meshSubdivision";

interface MeshDefinitionEditorProps {
  definition: MeshDefinition;
  meshDocument: MeshDocument;
  meshFileName: string;
  onApply: (definition: MeshDefinition) => Promise<void>;
  onClose: () => void;
}

export function MeshDefinitionEditor({
  definition,
  meshDocument,
  meshFileName,
  onApply,
  onClose,
}: MeshDefinitionEditorProps) {
  const definitionSnapshot = useMemo(() => JSON.stringify(definition), [definition]);
  const [idPrefix, setIdPrefix] = useState(definition["id-prefix"]);
  const [composites, setComposites] = useState(definition.composites);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const faceNames = useMemo(
    () =>
      [...meshDocument.faces]
        .map(face => face.name)
        .sort((left, right) => left.localeCompare(right)),
    [meshDocument.faces],
  );

  useEffect(() => {
    setIdPrefix(definition["id-prefix"]);
    setComposites(definition.composites.map(composite => ({ ...composite, faces: [...composite.faces] })));
    setError(null);
    setSuccessMessage(null);
  }, [definitionSnapshot, definition]);

  const handleApply = async () => {
    const draft = syncMeshDefinitionFacesFromDocument(
      meshDocument,
      normalizeMeshDefinition({
        "id-prefix": idPrefix,
        faces: definition.faces,
        composites,
      }),
    );
    const validationError = validateMeshDefinitionForDocument(meshDocument, draft);
    if (validationError) {
      setError(validationError);
      setSuccessMessage(null);
      return;
    }

    setIsApplying(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await onApply(cloneMeshDefinition(draft));
      setSuccessMessage(
        meshFileName.trim()
          ? `Definitions saved to ${meshFileName.trim()}.`
          : "Definitions saved.",
      );
    } catch (applyError) {
      setError(
        applyError instanceof Error ? applyError.message : "Failed to save definitions and mesh file.",
      );
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <BodyText type="title-small">Definitions</BodyText>
          <BodyText color="grey-40" type="body-small">
            Edit id-prefix and composites here. Faces are read-only and come from the mesh. Apply saves the mesh
            file.
          </BodyText>
        </div>
        <ActionButton type="secondary" onClick={onClose}>
          Back to map
        </ActionButton>
      </div>

      {!meshFileName.trim() ? (
        <Alert type="warning">Set a mesh file name in Controls before applying.</Alert>
      ) : null}

      {error ? <Alert type="danger">{error}</Alert> : null}
      {successMessage ? <Alert type="info">{successMessage}</Alert> : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-6 pb-2">
          <div className="max-w-xs">
            <TextInput
              label="id-prefix"
              type="number"
              inputMode="numeric"
              value={idPrefix}
              onChange={event => {
                setIdPrefix(Number.parseInt(event.target.value, 10) || 0);
                if (error) setError(null);
                if (successMessage) setSuccessMessage(null);
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <BodyText type="label-small">Faces (read-only)</BodyText>
            <BodyText color="grey-40" type="body-small">
              Face entries always come from the current mesh. Apply removes any definition faces that are not in the
              mesh.
            </BodyText>
            {meshDocument.faces.length === 0 ? (
              <BodyText color="grey-40" type="body-small">
                No mesh faces yet.
              </BodyText>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {[...meshDocument.faces]
                  .sort((left, right) => left.name.localeCompare(right.name))
                  .map(face => (
                    <li
                      key={face.id}
                      className="rounded-md border border-grey-200 bg-white px-3 py-2"
                    >
                      <BodyText type="label-small" className="font-medium">
                        {face.name}
                      </BodyText>
                      <BodyText color="grey-40" type="label-small">
                        uuid {normalizeMeshDefinitionUuid(face.id)}
                      </BodyText>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          <MeshDefinitionCompositesEditor
            faceNames={faceNames}
            composites={composites}
            onChange={nextComposites => {
              setComposites(nextComposites);
              if (error) setError(null);
              if (successMessage) setSuccessMessage(null);
            }}
          />
        </div>
      </div>

      <div className="flex justify-end border-t border-grey-200 pt-4">
        <ActionButton
          type="filled"
          spinning={isApplying}
          disabled={!meshFileName.trim()}
          onClick={() => void handleApply()}
        >
          Apply
        </ActionButton>
      </div>
    </div>
  );
}
