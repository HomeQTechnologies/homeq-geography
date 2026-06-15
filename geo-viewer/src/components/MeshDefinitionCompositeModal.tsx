import { ActionButton, BodyText, Modal, TextInput } from "@/components/ui";
import { generateMeshDefinitionUuid, type MeshDefinitionComposite } from "../lib/meshDefinition";
import { MeshDefinitionFaceMultiSelect } from "./MeshDefinitionFaceMultiSelect";

interface MeshDefinitionCompositeModalProps {
  open: boolean;
  title: string;
  draft: MeshDefinitionComposite;
  faceNames: string[];
  onDraftChange: (draft: MeshDefinitionComposite) => void;
  onSave: () => void;
  onClose: () => void;
}

export function MeshDefinitionCompositeModal({
  open,
  title,
  draft,
  faceNames,
  onDraftChange,
  onSave,
  onClose,
}: MeshDefinitionCompositeModalProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <ActionButton type="default" onClick={onClose}>
            Cancel
          </ActionButton>
          <ActionButton type="filled" onClick={onSave}>
            Save composite
          </ActionButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput
            label="Name"
            value={draft.name}
            onChange={event => onDraftChange({ ...draft, name: event.target.value })}
          />
          <TextInput
            label="Id"
            type="number"
            inputMode="numeric"
            value={draft.id}
            onChange={event =>
              onDraftChange({
                ...draft,
                id: Number.parseInt(event.target.value, 10) || 0,
              })
            }
          />
          <TextInput
            label="UUID"
            value={draft.uuid}
            className="font-mono sm:col-span-2"
            onChange={event => onDraftChange({ ...draft, uuid: event.target.value })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <BodyText type="label-small">Included faces</BodyText>
          <MeshDefinitionFaceMultiSelect
            options={faceNames}
            value={draft.faces}
            onChange={faces => onDraftChange({ ...draft, faces })}
          />
        </div>

        <ActionButton
          type="default"
          size="sm"
          className="self-start"
          onClick={() => onDraftChange({ ...draft, uuid: generateMeshDefinitionUuid() })}
        >
          Regenerate UUID
        </ActionButton>
      </div>
    </Modal>
  );
}
