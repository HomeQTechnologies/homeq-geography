import AddRounded from "@mui/icons-material/AddRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import { useMemo, useState } from "react";
import { ActionButton, BodyText, IconButton } from "@/components/ui";
import {
  createMeshDefinitionComposite,
  type MeshDefinitionComposite,
} from "../lib/meshDefinition";
import { MeshDefinitionCompositeModal } from "./MeshDefinitionCompositeModal";

interface MeshDefinitionCompositesEditorProps {
  faceNames: string[];
  composites: MeshDefinitionComposite[];
  onChange: (composites: MeshDefinitionComposite[]) => void;
}

type CompositeEditorState =
  | {
      mode: "create";
      draft: MeshDefinitionComposite;
    }
  | {
      mode: "edit";
      index: number;
      draft: MeshDefinitionComposite;
    };

function cloneCompositeDraft(composite: MeshDefinitionComposite): MeshDefinitionComposite {
  return {
    ...composite,
    faces: [...composite.faces],
  };
}

function sortCompositesForDisplay(
  composites: MeshDefinitionComposite[],
): Array<{ composite: MeshDefinitionComposite; index: number }> {
  return composites
    .map((composite, index) => ({ composite, index }))
    .sort((left, right) => left.composite.name.localeCompare(right.composite.name));
}

export function MeshDefinitionCompositesEditor({
  faceNames,
  composites,
  onChange,
}: MeshDefinitionCompositesEditorProps) {
  const [editorState, setEditorState] = useState<CompositeEditorState | null>(null);

  const compositesForDisplay = useMemo(
    () => sortCompositesForDisplay(composites),
    [composites],
  );

  const openCreateModal = () => {
    setEditorState({
      mode: "create",
      draft: createMeshDefinitionComposite(composites),
    });
  };

  const openEditModal = (index: number) => {
    const composite = composites[index];
    if (!composite) return;

    setEditorState({
      mode: "edit",
      index,
      draft: cloneCompositeDraft(composite),
    });
  };

  const closeModal = () => {
    setEditorState(null);
  };

  const handleSaveComposite = () => {
    if (!editorState) return;

    const draft = {
      ...editorState.draft,
      faces: [...editorState.draft.faces].sort((left, right) => left.localeCompare(right)),
    };

    if (editorState.mode === "create") {
      onChange([...composites, draft]);
    } else {
      onChange(composites.map((composite, index) => (index === editorState.index ? draft : composite)));
    }

    closeModal();
  };

  const handleRemoveComposite = (index: number) => {
    onChange(composites.filter((_, compositeIndex) => compositeIndex !== index));
    if (editorState?.mode === "edit" && editorState.index === index) {
      closeModal();
    }
  };

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <BodyText type="label-small">Composites</BodyText>
          <BodyText color="grey-40" type="body-small">
            Group definition faces into named composites. Add or edit a composite in a dialog.
          </BodyText>
        </div>

        {composites.length === 0 ? (
          <BodyText color="grey-40" type="body-small">
            No composites yet. Add one to group faces together.
          </BodyText>
        ) : (
          <ul className="flex flex-col gap-1">
            {compositesForDisplay.map(({ composite, index }) => (
              <li
                key={composite.uuid}
                className="flex items-center gap-1 rounded-md border border-grey-200 bg-white px-2 py-1.5"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => openEditModal(index)}
                >
                  <BodyText type="label-small" className="truncate font-medium leading-tight">
                    {composite.name}
                  </BodyText>
                  <BodyText color="grey-40" type="label-small" className="leading-tight">
                    id {composite.id} · {composite.faces.length} face
                    {composite.faces.length === 1 ? "" : "s"}
                  </BodyText>
                </button>
                <IconButton ariaLabel="Edit composite" onClick={() => openEditModal(index)}>
                  <EditRounded fontSize="small" />
                </IconButton>
                <IconButton ariaLabel="Remove composite" onClick={() => handleRemoveComposite(index)}>
                  <CloseRounded fontSize="small" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}

        <ActionButton type="secondary" className="w-full" onClick={openCreateModal}>
          <AddRounded fontSize="small" />
          Add composite
        </ActionButton>
      </div>

      <MeshDefinitionCompositeModal
        open={editorState !== null}
        title={editorState?.mode === "create" ? "Add composite" : "Edit composite"}
        draft={editorState?.draft ?? createMeshDefinitionComposite(composites)}
        faceNames={faceNames}
        onDraftChange={draft => {
          if (!editorState) return;
          setEditorState({ ...editorState, draft });
        }}
        onSave={handleSaveComposite}
        onClose={closeModal}
      />
    </>
  );
}
