import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import LockOpenRounded from "@mui/icons-material/LockOpenRounded";
import LockRounded from "@mui/icons-material/LockRounded";
import RemoveCircleOutlineRounded from "@mui/icons-material/RemoveCircleOutlineRounded";
import clsx from "clsx";
import { useEffect, useMemo, useRef } from "react";
import { BodyText, IconButton, TextInput } from "@/components/ui";
import type { MeshDefinition } from "../lib/meshDefinition";
import { renameFace, toggleFaceLock, type MeshDocument } from "../lib/meshSubdivision";

interface MeshFacesPanelProps {
  document: MeshDocument;
  meshDefinition: MeshDefinition | null;
  selectedFaceId: string | null;
  onDocumentChange: (document: MeshDocument) => void;
  onSelectFace: (faceId: string | null) => void;
  onSelectEdge: (faceId: string, edgeIndex: number | null) => void;
}

export function MeshFacesPanel({
  document,
  meshDefinition,
  selectedFaceId,
  onDocumentChange,
  onSelectFace,
  onSelectEdge,
}: MeshFacesPanelProps) {
  const facesAlphabetical = useMemo(
    () => [...document.faces].sort((left, right) => left.name.localeCompare(right.name)),
    [document.faces],
  );
  const definitionFaceNames = useMemo(
    () => new Set(meshDefinition?.faces.map(face => face.name) ?? []),
    [meshDefinition],
  );
  const listItemRefs = useRef(new Map<string, HTMLLIElement>());

  useEffect(() => {
    if (!selectedFaceId) return;

    let innerFrameId = 0;
    const outerFrameId = window.requestAnimationFrame(() => {
      innerFrameId = window.requestAnimationFrame(() => {
        listItemRefs.current.get(selectedFaceId)?.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      });
    });

    return () => {
      window.cancelAnimationFrame(outerFrameId);
      if (innerFrameId) {
        window.cancelAnimationFrame(innerFrameId);
      }
    };
  }, [selectedFaceId, facesAlphabetical]);

  const handleSelectFace = (faceId: string) => {
    onSelectFace(faceId);
    onSelectEdge(faceId, null);
  };

  if (document.faces.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <BodyText type="title-small">Subdivisions</BodyText>
        <BodyText color="grey-40" type="body-small">
          Faces you create will appear here. The selected face is drawn on top of the others on the map.
        </BodyText>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <BodyText type="title-small">Subdivisions ({document.faces.length})</BodyText>
        <BodyText color="grey-40" type="body-small">
          Sorted alphabetically. Layer number shows draw order on the map. A green check means the face name
          exists in definitions. Press L to lock or unlock the selected face.
        </BodyText>
      </div>

      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {facesAlphabetical.map(face => {
          const isSelected = face.id === selectedFaceId;
          const isLocked = face.locked === true;
          const isInDefinition = definitionFaceNames.has(face.name);
          const stackPosition = document.faces.findIndex(entry => entry.id === face.id) + 1;

          return (
            <li
              key={face.id}
              ref={element => {
                if (element) {
                  listItemRefs.current.set(face.id, element);
                } else {
                  listItemRefs.current.delete(face.id);
                }
              }}
              className={clsx(
                "rounded-md border px-2 py-1.5",
                isLocked
                  ? isSelected
                    ? "border-violet-300 bg-violet-50"
                    : "border-violet-200 bg-violet-50/70"
                  : isSelected
                    ? "border-amber-400 bg-amber-50"
                    : "border-grey-200 bg-white",
                face.visible === false && "opacity-60",
              )}
            >
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => handleSelectFace(face.id)}
                >
                  <BodyText type="label-small" className="truncate font-medium leading-tight">
                    {face.name}
                  </BodyText>
                  <BodyText color="grey-40" type="label-small" className="leading-tight">
                    {face.vertexIds.length}v · L{stackPosition}
                    {isLocked ? " · locked" : ""}
                  </BodyText>
                </button>
                <span
                  title={isInDefinition ? "Listed in definitions" : "Not in definitions"}
                  aria-label={isInDefinition ? "Listed in definitions" : "Not in definitions"}
                  className="inline-flex shrink-0"
                >
                  {isInDefinition ? (
                    <CheckCircleRounded className="text-emerald-600" sx={{ fontSize: 16 }} />
                  ) : (
                    <RemoveCircleOutlineRounded className="text-grey-300" sx={{ fontSize: 16 }} />
                  )}
                </span>
                <IconButton
                  ariaLabel={isLocked ? "Unlock face" : "Lock face"}
                  onClick={() => onDocumentChange(toggleFaceLock(document, face.id))}
                >
                  {isLocked ? <LockRounded fontSize="small" /> : <LockOpenRounded fontSize="small" />}
                </IconButton>
              </div>

              {isSelected ? (
                <div className="mt-1.5">
                  <TextInput
                    label="Face name"
                    value={face.name}
                    onChange={event =>
                      onDocumentChange(renameFace(document, face.id, event.target.value))
                    }
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
