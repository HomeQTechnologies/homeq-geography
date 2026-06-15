import RefreshRounded from "@mui/icons-material/RefreshRounded";
import UploadFileRounded from "@mui/icons-material/UploadFileRounded";
import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActionButton, Alert, BodyText, TextInput } from "@/components/ui";
import {
  listLocalMeshFiles,
  readLocalMeshFile,
  writeLocalMeshFile,
  type LocalFileEntry,
} from "../api/localFilesApi";
import {
  buildMeshDownloadFilename,
  isMeshWorkspaceFileName,
  parseMeshFileContent,
  serializeMeshFile,
  type MeshDocument,
} from "../lib/meshFile";
import type { MeshDefinition } from "../lib/meshDefinition";

function formatFileSize(bytes: number | null): string | null {
  if (bytes === null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatModifiedAt(isoDate: string | null): string | null {
  if (!isoDate) return null;
  return new Date(isoDate).toLocaleString();
}

interface MeshWorkspacePanelProps {
  document: MeshDocument;
  definition?: MeshDefinition | null;
  onImportMesh: (document: MeshDocument, fileName?: string, definition?: MeshDefinition) => void;
  loadOnly?: boolean;
  onLoaded?: () => void;
  defaultSaveFileName?: string;
}

export function MeshWorkspacePanel({
  document,
  definition = null,
  onImportMesh,
  loadOnly = false,
  onLoaded,
  defaultSaveFileName,
}: MeshWorkspacePanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [meshFiles, setMeshFiles] = useState<LocalFileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [saveFileName, setSaveFileName] = useState(() => buildMeshDownloadFilename());
  const [isLoading, setIsLoading] = useState(true);
  const [isReading, setIsReading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [workspaceAvailable, setWorkspaceAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const listing = await listLocalMeshFiles();
      setWorkspaceAvailable(true);
      setMeshFiles(listing.entries.filter(entry => entry.kind === "file" && isMeshWorkspaceFileName(entry.name)));
      setSelectedPath(previous =>
        previous && listing.entries.some(entry => entry.path === previous) ? previous : null,
      );
    } catch {
      setWorkspaceAvailable(false);
      setMeshFiles([]);
      setSelectedPath(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (defaultSaveFileName) {
      setSaveFileName(defaultSaveFileName);
    }
  }, [defaultSaveFileName]);

  const loadMeshContent = async (content: string, fileName: string) => {
    const parsed = parseMeshFileContent(content);
    if (!parsed.ok) {
      setError(parsed.error);
      return false;
    }

    onImportMesh(parsed.document, fileName, parsed.definition);
    setMessage(`Loaded mesh from ${fileName}.`);
    setError(null);
    onLoaded?.();
    return true;
  };

  const handleLoadPath = async (path: string) => {
    setIsReading(true);
    setError(null);
    setMessage(null);

    try {
      const file = meshFiles.find(entry => entry.path === path);
      const { content } = await readLocalMeshFile(path);
      const loaded = await loadMeshContent(content, file?.name ?? path);
      if (loaded) {
        setSelectedPath(path);
      }
    } catch {
      setError("Failed to load the selected mesh file.");
    } finally {
      setIsReading(false);
    }
  };

  const handleLoadSelected = async () => {
    if (!selectedPath) return;
    await handleLoadPath(selectedPath);
  };

  const handleSaveToWorkspace = async () => {
    const trimmed = saveFileName.trim();
    if (!trimmed || document.faces.length === 0 || !definition) return;

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      await writeLocalMeshFile(trimmed, serializeMeshFile(document, definition));
      setMessage(`Saved mesh to ${trimmed}.`);
      setSelectedPath(trimmed);
      await refresh();
    } catch {
      setError(`Failed to save ${trimmed}.`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFallbackUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsReading(true);
    setError(null);
    setMessage(null);

    try {
      await loadMeshContent(await file.text(), file.name);
    } catch {
      setError("Failed to read the selected file.");
    } finally {
      setIsReading(false);
    }
  };

  return (
    <div className="border-grey-200 flex flex-col gap-3 rounded-lg border bg-grey-50 p-3">
      {!loadOnly ? (
        <div className="flex flex-col gap-1">
          <BodyText type="label-small">Save current mesh</BodyText>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[220px] flex-1">
              <TextInput
                small
                value={saveFileName}
                onChange={event => setSaveFileName(event.target.value)}
                placeholder="mesh-2026-01-01.mesh.json"
              />
            </div>
            <ActionButton
              type="filled"
              size="sm"
              disabled={document.faces.length === 0 || isSaving || !workspaceAvailable}
              onClick={() => void handleSaveToWorkspace()}
            >
              {isSaving ? "Saving..." : "Save to folder"}
            </ActionButton>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <BodyText type="label-small">{loadOnly ? "Choose a mesh file" : "Load from folder"}</BodyText>
          <ActionButton type="default" size="sm" disabled={!workspaceAvailable || isLoading} onClick={() => void refresh()}>
            <RefreshRounded sx={{ fontSize: 14 }} />
            Refresh
          </ActionButton>
        </div>

        {isLoading ? (
          <BodyText color="grey-40" type="label-small">
            Loading mesh files...
          </BodyText>
        ) : meshFiles.length === 0 ? (
          <BodyText color="grey-40" type="label-small">
            No mesh files in this folder yet.
          </BodyText>
        ) : (
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {meshFiles.map(file => {
              const isSelected = selectedPath === file.path;

              return (
                <li key={file.path}>
                  <button
                    type="button"
                    className={clsx(
                      "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                      isSelected ? "border-primary-500 bg-primary-50" : "border-grey-200 bg-white hover:bg-grey-50",
                    )}
                    onClick={() => setSelectedPath(file.path)}
                    onDoubleClick={() => void handleLoadPath(file.path)}
                  >
                    <BodyText type="label-small" className="truncate font-medium">
                      {file.name}
                    </BodyText>
                    <BodyText color="grey-40" type="label-small">
                      {[formatFileSize(file.size), formatModifiedAt(file.modifiedAt)].filter(Boolean).join(" · ")}
                    </BodyText>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          <ActionButton
            type="filled"
            size="sm"
            disabled={!selectedPath || isReading || !workspaceAvailable}
            onClick={() => void handleLoadSelected()}
          >
            {isReading ? "Loading..." : "Load selected"}
          </ActionButton>
          <ActionButton type="default" size="sm" disabled={isReading} onClick={() => fileInputRef.current?.click()}>
            <UploadFileRounded sx={{ fontSize: 14 }} />
            Upload from computer
          </ActionButton>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.mesh.json,application/json"
        className="hidden"
        onChange={event => void handleFallbackUpload(event)}
      />

      {error ? <Alert type="danger">{error}</Alert> : null}
      {message ? <Alert type="info">{message}</Alert> : null}
    </div>
  );
}
