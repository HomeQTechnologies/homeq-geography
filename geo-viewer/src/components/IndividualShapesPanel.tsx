import FolderOpenRounded from "@mui/icons-material/FolderOpenRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import VisibilityOffRounded from "@mui/icons-material/VisibilityOffRounded";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionButton, Alert, BodyText, Select } from "@/components/ui";
import {
  getIndividualFilesRoot,
  listIndividualFiles,
  readIndividualFile,
} from "@/api/individualFilesApi";
import type { LoadedGeoJsonFile } from "@/lib/loadedGeoJsonFiles";
import {
  createLoadedIndividualShapeFile,
  getIndividualFolderColor,
  mapWithConcurrency,
  parseIndividualShapePackageContent,
  preferIndividualShapePackageFiles,
} from "@/lib/individualShapePackage";
import { formatGeometrySummary } from "@/lib/parseGeoJsonFile";

interface IndividualShapesPanelProps {
  loadedFolder: string | null;
  files: LoadedGeoJsonFile[];
  onLoadedFolderChange: (folder: string | null) => void;
  onFilesChange: (files: LoadedGeoJsonFile[]) => void;
  onFitAll: () => void;
}

const LOAD_CONCURRENCY = 32;

export function IndividualShapesPanel({
  loadedFolder,
  files,
  onLoadedFolderChange,
  onFilesChange,
  onFitAll,
}: IndividualShapesPanelProps) {
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState(loadedFolder ?? "");
  const [rootName, setRootName] = useState("data/individual");
  const [isListingFolders, setIsListingFolders] = useState(true);
  const [isLoadingFolder, setIsLoadingFolder] = useState(false);
  const [loadProgress, setLoadProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [workspaceAvailable, setWorkspaceAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failedFiles, setFailedFiles] = useState<string[]>([]);

  const folderColor = useMemo(
    () => (loadedFolder ? getIndividualFolderColor(loadedFolder) : null),
    [loadedFolder],
  );

  const visibleCount = useMemo(() => files.filter(file => file.visible).length, [files]);
  const geometrySummary = useMemo(() => {
    const summary: Record<string, number> = {};
    for (const file of files) {
      for (const [type, count] of Object.entries(file.geometrySummary)) {
        summary[type] = (summary[type] ?? 0) + count;
      }
    }
    return summary;
  }, [files]);

  const refreshFolders = useCallback(async () => {
    setIsListingFolders(true);
    setError(null);

    try {
      const [rootInfo, listing] = await Promise.all([getIndividualFilesRoot(), listIndividualFiles("")]);
      setWorkspaceAvailable(true);
      setRootName(rootInfo.rootName);
      const nextFolders = listing.entries
        .filter(entry => entry.kind === "directory")
        .map(entry => entry.path || entry.name)
        .sort((a, b) => a.localeCompare(b));
      setFolders(nextFolders);

      setSelectedFolder(previous => {
        if (previous && nextFolders.includes(previous)) return previous;
        return nextFolders[0] ?? "";
      });
    } catch {
      setWorkspaceAvailable(false);
      setFolders([]);
      setError("Could not read the individual shapes directory. Check GEO_VIEWER_INDIVIDUAL_DIR.");
    } finally {
      setIsListingFolders(false);
    }
  }, []);

  useEffect(() => {
    void refreshFolders();
  }, [refreshFolders]);

  useEffect(() => {
    if (loadedFolder) {
      setSelectedFolder(loadedFolder);
    }
  }, [loadedFolder]);

  const handleLoadFolder = async () => {
    const folder = selectedFolder.trim();
    if (!folder) return;

    setIsLoadingFolder(true);
    setError(null);
    setMessage(null);
    setFailedFiles([]);
    setLoadProgress(null);

    try {
      const listing = await listIndividualFiles(folder);
      const shapeFiles = preferIndividualShapePackageFiles(listing.entries);
      if (shapeFiles.length === 0) {
        setError(`No .geojson or .geojson.gz shape packages found in ${folder}.`);
        return;
      }

      setLoadProgress({ loaded: 0, total: shapeFiles.length });
      const failures: string[] = [];
      let completed = 0;

      const loadedFiles = await mapWithConcurrency(shapeFiles, LOAD_CONCURRENCY, async file => {
        try {
          const { content } = await readIndividualFile(file.path);
          const parsed = parseIndividualShapePackageContent(content, file.name);
          if (!parsed.ok) {
            failures.push(parsed.error);
            return null;
          }

          return createLoadedIndividualShapeFile(file.name, parsed.data);
        } catch {
          failures.push(`${file.name}: failed to read file.`);
          return null;
        } finally {
          completed += 1;
          setLoadProgress({ loaded: completed, total: shapeFiles.length });
        }
      });

      const nextFiles = loadedFiles.filter((file): file is LoadedGeoJsonFile => file !== null);
      if (nextFiles.length === 0) {
        setError(`Could not load any shape packages from ${folder}.`);
        setFailedFiles(failures);
        return;
      }

      onLoadedFolderChange(folder);
      onFilesChange(nextFiles);
      setFailedFiles(failures);
      setMessage(
        `Loaded ${nextFiles.length} shape${nextFiles.length === 1 ? "" : "s"} from ${folder}.` +
          (failures.length > 0 ? ` ${failures.length} file${failures.length === 1 ? "" : "s"} failed.` : ""),
      );
      onFitAll();
    } catch {
      setError(`Failed to load shapes from ${folder}.`);
    } finally {
      setIsLoadingFolder(false);
      setLoadProgress(null);
    }
  };

  const handleClear = () => {
    onLoadedFolderChange(null);
    onFilesChange([]);
    setFailedFiles([]);
    setMessage(null);
    setError(null);
  };

  const handleToggleVisibility = () => {
    const nextVisible = visibleCount === 0;
    onFilesChange(files.map(file => ({ ...file, visible: nextVisible })));
  };

  return (
    <div className="flex flex-col gap-4">
      <BodyText color="grey-40" type="body-small">
        Load every shape package from a folder under {rootName}. Shapes stay on the map across tabs until you clear
        them.
      </BodyText>

      <div className="border-grey-200 flex flex-col gap-3 rounded-lg border bg-grey-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <BodyText type="label-small">Choose folder</BodyText>
          <ActionButton
            type="default"
            size="sm"
            disabled={!workspaceAvailable || isListingFolders}
            onClick={() => void refreshFolders()}
          >
            <RefreshRounded sx={{ fontSize: 14 }} />
            Refresh
          </ActionButton>
        </div>

        {isListingFolders ? (
          <BodyText color="grey-40" type="label-small">
            Loading folders...
          </BodyText>
        ) : folders.length === 0 ? (
          <BodyText color="grey-40" type="label-small">
            No folders found in the individual shapes directory.
          </BodyText>
        ) : (
          <Select
            value={selectedFolder}
            updateValue={setSelectedFolder}
            options={folders.map(folder => ({
              label: folder,
              value: folder,
            }))}
            disabled={!workspaceAvailable || isLoadingFolder}
          />
        )}

        <div className="flex flex-wrap gap-2">
          <ActionButton
            type="filled"
            size="sm"
            disabled={!workspaceAvailable || !selectedFolder || isLoadingFolder || folders.length === 0}
            onClick={() => void handleLoadFolder()}
          >
            <span className="flex items-center gap-2">
              <FolderOpenRounded fontSize="small" />
              {isLoadingFolder ? "Loading shapes..." : "Load folder on map"}
            </span>
          </ActionButton>
          <ActionButton type="secondary" size="sm" disabled={files.length === 0} onClick={onFitAll}>
            Fit loaded shapes
          </ActionButton>
          <ActionButton type="default" size="sm" disabled={files.length === 0} onClick={handleClear}>
            Clear loaded
          </ActionButton>
        </div>

        {loadProgress ? (
          <BodyText color="grey-40" type="label-small">
            Loading {loadProgress.loaded} / {loadProgress.total} files...
          </BodyText>
        ) : null}
      </div>

      {loadedFolder && files.length > 0 ? (
        <div className="border-grey-200 flex flex-col gap-2 rounded-lg border bg-white p-3">
          <div className="flex items-center gap-2">
            {folderColor ? (
              <span
                className="h-3 w-3 shrink-0 rounded-full border border-white shadow-sm"
                style={{ backgroundColor: folderColor.fill }}
              />
            ) : null}
            <BodyText type="label-small" className="font-medium">
              {loadedFolder}
            </BodyText>
          </div>
          <BodyText color="grey-40" type="label-small">
            {visibleCount} visible · {files.length} total · {formatGeometrySummary(geometrySummary)}
          </BodyText>
          <ActionButton type="default" size="sm" onClick={handleToggleVisibility}>
            <span className="flex items-center gap-2">
              {visibleCount === 0 ? (
                <VisibilityRounded fontSize="small" />
              ) : (
                <VisibilityOffRounded fontSize="small" />
              )}
              {visibleCount === 0 ? "Show shapes" : "Hide shapes"}
            </span>
          </ActionButton>
        </div>
      ) : null}

      {error ? <Alert type="danger">{error}</Alert> : null}
      {message ? <Alert type="info">{message}</Alert> : null}

      {failedFiles.length > 0 ? (
        <div className="border-grey-200 flex flex-col gap-2 rounded-lg border bg-white p-3">
          <BodyText type="label-small" className="font-medium">
            Failed files ({failedFiles.length})
          </BodyText>
          <ul className={clsx("flex flex-col gap-1", failedFiles.length > 8 && "max-h-40 overflow-y-auto")}>
            {failedFiles.slice(0, 20).map(issue => (
              <li key={issue}>
                <BodyText color="grey-40" type="label-small">
                  {issue}
                </BodyText>
              </li>
            ))}
          </ul>
          {failedFiles.length > 20 ? (
            <BodyText color="grey-40" type="label-small">
              ... and {failedFiles.length - 20} more
            </BodyText>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
