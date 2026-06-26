import AddRounded from "@mui/icons-material/AddRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import ExpandLessRounded from "@mui/icons-material/ExpandLessRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import FitScreenRounded from "@mui/icons-material/FitScreenRounded";
import UploadFileRounded from "@mui/icons-material/UploadFileRounded";
import VisibilityOffRounded from "@mui/icons-material/VisibilityOffRounded";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionButton,
  Alert,
  BodyText,
  IconButton,
  Select,
  TextArea,
  TextInput,
} from "@/components/ui";
import {
  buildExtractedGeoJsonFilename,
  canCreateGeoShapeFromFeature,
  getDefaultGeoShapeName,
  listLoadedGeoJsonFeatures,
  type ExtractedGeoJsonShape,
} from "../lib/extractGeoJsonShapes";
import {
  assignShapesToGroup,
  buildGroupGeoJsonFilename,
  clearGroupUnion,
  createEmptyGeoJsonShapeGroup,
  getGroupedShapeKeys,
  getGroupFeatures,
  getLoadedGeoJsonShapeColor,
  getShapeKey,
  getUnionShapeKey,
  pruneGeoJsonShapeGroups,
  removeGeoJsonShapeGroup,
  setGroupUnion,
  updateGeoJsonShapeGroupName,
  type GeoJsonShapeGroup,
} from "../lib/geoJsonShapeGroups";
import { canUnionPolygonFeatures, unionPolygonFeatures } from "../lib/unionPolygonFeatures";
import {
  createLoadedGeoJsonFile,
  removeLoadedFileShapesFromGroups,
  type LoadedGeoJsonFile,
} from "../lib/loadedGeoJsonFiles";
import {
  buildShapeMetadataForFile,
  getShapeDescription,
  pruneShapeMetadata,
  setShapeDescription,
  type LoadedGeoJsonShapeMetadataByKey,
} from "../lib/loadedGeoJsonShapeMetadata";
import { formatGeometrySummary, parseGeoJsonFileContent } from "../lib/parseGeoJsonFile";
import {
  downloadShapePackage,
  downloadJsonFile,
  validateShapeDrawExport,
  validateShapeDrawMetadata,
} from "../lib/shapeExport";
import {
  createDefaultShapeDrawMetadata,
  type ShapeDrawMetadata,
} from "../lib/shapeDrawTypes";
import {
  GeoShapeCreateForm,
} from "./GeoShapeCreateForm";

interface GeoJsonLoadPanelProps {
  files: LoadedGeoJsonFile[];
  groups: GeoJsonShapeGroup[];
  shapeMetadata: LoadedGeoJsonShapeMetadataByKey;
  selectedShapeKeys: string[];
  restoredFileCount?: number;
  restoredGroupCount?: number;
  onFilesChange: (files: LoadedGeoJsonFile[]) => void;
  onGroupsChange: (groups: GeoJsonShapeGroup[]) => void;
  onShapeMetadataChange: (shapeMetadata: LoadedGeoJsonShapeMetadataByKey) => void;
  onSelectedShapeKeysChange: (shapeKeys: string[]) => void;
  onFitFile: (fileId: string) => void;
  onFitShape: (feature: GeoJSON.Feature) => void;
  onFitShapes: (features: GeoJSON.Feature[]) => void;
  onFitAll: () => void;
}

type ExtractedShapeEntry = ExtractedGeoJsonShape & {
  colorIndex: number;
  shapeCount: number;
  shapeCountByFeature: number;
};

type CreateTarget =
  | { kind: "shape"; shapeKey: string; feature: GeoJSON.Feature; label: string }
  | { kind: "group"; groupId: string };

function groupsNeedPruning(groups: GeoJsonShapeGroup[], validShapeKeys: Set<string>): boolean {
  return groups.some(group => group.shapeKeys.some(shapeKey => !validShapeKeys.has(shapeKey)));
}

interface ShapeDescriptionEditorProps {
  description: string;
  onDescriptionChange: (description: string) => void;
}

function ShapeDescriptionEditor({ description, onDescriptionChange }: ShapeDescriptionEditorProps) {
  return (
    <div className="flex flex-col gap-1 px-1 pb-1" onClick={event => event.stopPropagation()}>
      <BodyText type="label-small">Description</BodyText>
      <TextArea
        autoGrow={false}
        rows={2}
        value={description}
        placeholder="Optional description for this shape"
        onChange={event => onDescriptionChange(event.target.value)}
      />
    </div>
  );
}

interface ShapeListRowProps {
  label: string;
  subtitle?: string;
  accentColor?: string;
  isSelected: boolean;
  disabled?: boolean;
  actions?: React.ReactNode;
  expandedContent?: React.ReactNode;
  onToggleSelect: () => void;
}

function ShapeListRow({
  label,
  subtitle,
  accentColor,
  isSelected,
  disabled = false,
  actions,
  expandedContent,
  onToggleSelect,
}: ShapeListRowProps) {
  return (
    <div
      className={clsx(
        "border-grey-200 rounded border bg-white transition-shadow",
        isSelected && "border-primary-500 ring-1 ring-primary-200",
        disabled && "opacity-60",
        expandedContent ? "flex flex-col gap-1 p-1" : "px-1 py-0.5",
      )}
    >
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => {
          if (!disabled) onToggleSelect();
        }}
        onKeyDown={event => {
          if (disabled) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggleSelect();
          }
        }}
        className={clsx(
          "flex min-h-[24px] items-center gap-1",
          !disabled && "cursor-pointer",
        )}
      >
        {accentColor ? (
          <span
            className="h-2 w-2 shrink-0 rounded-full border border-white shadow-sm"
            style={{ backgroundColor: accentColor }}
          />
        ) : null}
        <BodyText type="label-small" className="min-w-0 flex-1 truncate leading-4">
          {label}
          {subtitle ? (
            <span className="text-grey-40 font-normal"> · {subtitle}</span>
          ) : null}
        </BodyText>
        <div className="flex shrink-0 items-center" onClick={event => event.stopPropagation()}>
          {actions}
        </div>
      </div>
      {expandedContent}
    </div>
  );
}

export function GeoJsonLoadPanel({
  files,
  groups,
  shapeMetadata,
  selectedShapeKeys,
  restoredFileCount = 0,
  restoredGroupCount = 0,
  onFilesChange,
  onGroupsChange,
  onShapeMetadataChange,
  onSelectedShapeKeysChange,
  onFitFile,
  onFitShape,
  onFitShapes,
  onFitAll,
}: GeoJsonLoadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [moveTargetGroupId, setMoveTargetGroupId] = useState<string>("");
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(() => new Set());
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null);
  const [createMetadata, setCreateMetadata] = useState<ShapeDrawMetadata>(() =>
    createDefaultShapeDrawMetadata(),
  );

  const extractedShapesByFileId = useMemo(() => {
    return new Map(
      files.map(file => {
        const shapes = listLoadedGeoJsonFeatures(file.features);
        const countByFeature = shapes.reduce<Map<number, number>>((counts, shape) => {
          counts.set(shape.featureIndex, (counts.get(shape.featureIndex) ?? 0) + 1);
          return counts;
        }, new Map());

        return [
          file.id,
          shapes.map((shape, colorIndex) => ({
            ...shape,
            colorIndex,
            shapeCount: shapes.length,
            shapeCountByFeature: countByFeature.get(shape.featureIndex) ?? 1,
          })),
        ];
      }),
    );
  }, [files]);

  const shapeEntriesByKey = useMemo(() => {
    const map = new Map<
      string,
      { file: LoadedGeoJsonFile; shape: ExtractedShapeEntry; feature: GeoJSON.Feature }
    >();

    for (const file of files) {
      for (const shape of extractedShapesByFileId.get(file.id) ?? []) {
        const shapeKey = getShapeKey(file.id, shape.featureIndex, shape.shapeIndex);
        map.set(shapeKey, { file, shape, feature: shape.feature });
      }
    }

    return map;
  }, [extractedShapesByFileId, files]);

  const featureByShapeKey = useMemo(() => {
    const map = new Map<string, GeoJSON.Feature>();
    shapeEntriesByKey.forEach((entry, shapeKey) => {
      map.set(shapeKey, entry.feature);
    });
    return map;
  }, [shapeEntriesByKey]);

  const getShapeAccentColor = useCallback(
    (file: LoadedGeoJsonFile, shape: ExtractedShapeEntry) => {
      const fileIndex = files.findIndex(entry => entry.id === file.id);
      return getLoadedGeoJsonShapeColor(
        fileIndex >= 0 ? fileIndex : 0,
        shape.colorIndex,
        shape.shapeCount,
      ).fill;
    },
    [files],
  );

  const validShapeKeys = useMemo(() => {
    const keys = new Set(featureByShapeKey.keys());
    for (const group of groups) {
      if (group.unionFeature) {
        keys.add(getUnionShapeKey(group.id));
      }
    }
    return keys;
  }, [featureByShapeKey, groups]);
  const groupedShapeKeys = useMemo(() => getGroupedShapeKeys(groups), [groups]);
  const selectedShapeKeySet = useMemo(() => new Set(selectedShapeKeys), [selectedShapeKeys]);

  const ungroupedShapeEntries = useMemo(() => {
    const entries: Array<{
      shapeKey: string;
      file: LoadedGeoJsonFile;
      shape: ExtractedShapeEntry;
    }> = [];

    for (const file of files) {
      for (const shape of extractedShapesByFileId.get(file.id) ?? []) {
        const shapeKey = getShapeKey(file.id, shape.featureIndex, shape.shapeIndex);
        if (!groupedShapeKeys.has(shapeKey)) {
          entries.push({ shapeKey, file, shape });
        }
      }
    }

    return entries;
  }, [extractedShapesByFileId, files, groupedShapeKeys]);

  useEffect(() => {
    if (groupsNeedPruning(groups, validShapeKeys)) {
      onGroupsChange(pruneGeoJsonShapeGroups(groups, validShapeKeys));
    }
  }, [groups, onGroupsChange, validShapeKeys]);

  useEffect(() => {
    if (groups.length === 0) {
      setMoveTargetGroupId("");
      return;
    }

    if (!groups.some(group => group.id === moveTargetGroupId)) {
      setMoveTargetGroupId(groups[0].id);
    }
  }, [groups, moveTargetGroupId]);

  useEffect(() => {
    const validGroupIds = new Set(groups.map(group => group.id));
    setExpandedGroupIds(previous => {
      const next = new Set([...previous].filter(groupId => validGroupIds.has(groupId)));
      return next.size === previous.size ? previous : next;
    });
  }, [groups]);

  useEffect(() => {
    const prunedSelection = selectedShapeKeys.filter(shapeKey => validShapeKeys.has(shapeKey));
    if (prunedSelection.length !== selectedShapeKeys.length) {
      onSelectedShapeKeysChange(prunedSelection);
    }
  }, [onSelectedShapeKeysChange, selectedShapeKeys, validShapeKeys]);

  useEffect(() => {
    const prunedMetadata = pruneShapeMetadata(shapeMetadata, validShapeKeys);
    if (Object.keys(prunedMetadata).length !== Object.keys(shapeMetadata).length) {
      onShapeMetadataChange(prunedMetadata);
    }
  }, [onShapeMetadataChange, shapeMetadata, validShapeKeys]);

  useEffect(() => {
    if (!createTarget) return;

    if (createTarget.kind === "shape" && !validShapeKeys.has(createTarget.shapeKey)) {
      setCreateTarget(null);
      setCreateMetadata(createDefaultShapeDrawMetadata());
      return;
    }

    if (createTarget.kind === "group" && !groups.some(group => group.id === createTarget.groupId)) {
      setCreateTarget(null);
      setCreateMetadata(createDefaultShapeDrawMetadata());
    }
  }, [createTarget, groups, validShapeKeys]);

  const handleChooseFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    setIsReading(true);

    try {
      const content = await file.text();
      const parsed = parseGeoJsonFileContent(content);
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }

      const loadedFile = createLoadedGeoJsonFile(file.name, parsed.data, files.length);
      onGroupsChange(removeLoadedFileShapesFromGroups(groups, loadedFile));
      onShapeMetadataChange(buildShapeMetadataForFile(loadedFile, shapeMetadata));
      onFilesChange([...files, loadedFile]);
      onFitFile(loadedFile.id);
    } catch {
      setError("Failed to read the selected file.");
    } finally {
      setIsReading(false);
    }
  };

  const handleToggleVisibility = (fileId: string) => {
    onFilesChange(
      files.map(file => (file.id === fileId ? { ...file, visible: !file.visible } : file)),
    );
  };

  const handleRemove = (fileId: string) => {
    onFilesChange(files.filter(file => file.id !== fileId));
  };

  const handleClearAll = () => {
    onFilesChange([]);
    onGroupsChange([]);
    onShapeMetadataChange({});
    onSelectedShapeKeysChange([]);
    setError(null);
    setActionError(null);
    setMoveTargetGroupId("");
    setCreateTarget(null);
    setCreateMetadata(createDefaultShapeDrawMetadata());
  };

  const handleAddGroup = () => {
    const nextGroup = createEmptyGeoJsonShapeGroup(groups);
    onGroupsChange([...groups, nextGroup]);
    setMoveTargetGroupId(nextGroup.id);
    setExpandedGroupIds(previous => new Set(previous).add(nextGroup.id));
    setActionError(null);
  };

  const handleToggleGroupExpanded = (groupId: string) => {
    setExpandedGroupIds(previous => {
      const next = new Set(previous);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const handleToggleShapeSelection = (shapeKey: string) => {
    onSelectedShapeKeysChange(
      selectedShapeKeySet.has(shapeKey)
        ? selectedShapeKeys.filter(key => key !== shapeKey)
        : [...selectedShapeKeys, shapeKey],
    );
  };

  const handleMoveSelectedToGroup = () => {
    if (selectedShapeKeys.length === 0 || !moveTargetGroupId) return;

    onGroupsChange(assignShapesToGroup(groups, selectedShapeKeys, moveTargetGroupId));
    onSelectedShapeKeysChange([]);
    setActionError(null);
  };

  const handleMoveSelectedToUngrouped = () => {
    if (selectedShapeKeys.length === 0) return;

    onGroupsChange(assignShapesToGroup(groups, selectedShapeKeys, null));
    onSelectedShapeKeysChange([]);
    setActionError(null);
  };

  const handleDownloadShape = (file: LoadedGeoJsonFile, shape: ExtractedShapeEntry) => {
    downloadJsonFile(
      buildExtractedGeoJsonFilename(file.fileName, shape, shape.shapeCountByFeature),
      shape.feature,
    );
  };

  const handleDownloadGroup = (group: GeoJsonShapeGroup) => {
    const features = getGroupFeatures(group, featureByShapeKey);
    if (group.unionFeature) {
      downloadJsonFile(`${buildGroupGeoJsonFilename(group.name).replace(/\.geojson$/, "")}-union.geojson`, features[0]);
      return;
    }

    downloadJsonFile(buildGroupGeoJsonFilename(group.name), {
      type: "FeatureCollection",
      features,
    });
  };

  const handleUnionGroupShapes = (group: GeoJsonShapeGroup) => {
    try {
      const memberFeatures = group.shapeKeys
        .map(shapeKey => featureByShapeKey.get(shapeKey))
        .filter((feature): feature is GeoJSON.Feature => feature !== undefined);
      const unionFeature = unionPolygonFeatures(memberFeatures);

      if (!unionFeature?.geometry) {
        setActionError(
          "Could not union group shapes. The group needs at least two valid polygon shapes.",
        );
        return;
      }

      onGroupsChange(setGroupUnion(groups, group.id, unionFeature));
      onSelectedShapeKeysChange([getUnionShapeKey(group.id)]);
      onFitShape(unionFeature);
      setActionError(null);
    } catch {
      setActionError("Could not union group shapes. The polygon geometry may be invalid.");
    }
  };

  const handleRestoreGroupShapes = (group: GeoJsonShapeGroup) => {
    onGroupsChange(clearGroupUnion(groups, group.id));
    onSelectedShapeKeysChange(selectedShapeKeys.filter(shapeKey => shapeKey !== getUnionShapeKey(group.id)));
    setActionError(null);
  };

  const handleCancelCreate = () => {
    setCreateTarget(null);
    setActionError(null);
    setCreateMetadata(createDefaultShapeDrawMetadata());
  };

  const handleUpdateShapeDescription = (shapeKey: string, description: string) => {
    onShapeMetadataChange(setShapeDescription(shapeMetadata, shapeKey, description));
    if (createTarget?.kind === "shape" && createTarget.shapeKey === shapeKey) {
      setCreateMetadata(previous => ({ ...previous, notes: description }));
    }
  };

  const handleCreateMetadataChange = (metadata: ShapeDrawMetadata) => {
    setCreateMetadata(metadata);
    if (createTarget?.kind === "shape") {
      onShapeMetadataChange(
        setShapeDescription(shapeMetadata, createTarget.shapeKey, metadata.notes),
      );
    }
  };

  const handleSelectShapeForCreate = (file: LoadedGeoJsonFile, shape: ExtractedShapeEntry) => {
    const shapeKey = getShapeKey(file.id, shape.featureIndex, shape.shapeIndex);
    setCreateTarget({
      kind: "shape",
      shapeKey,
      feature: shape.feature,
      label: shape.label,
    });
    setActionError(null);
    setCreateMetadata({
      ...createDefaultShapeDrawMetadata(),
      name: getDefaultGeoShapeName(shape.feature, shape.label),
      notes: getShapeDescription(shapeMetadata, shapeKey),
    });
    onFitShape(shape.feature);
  };

  const handleSelectGroupForCreate = (group: GeoJsonShapeGroup) => {
    const features = getGroupFeatures(group, featureByShapeKey);
    setExpandedGroupIds(previous => new Set(previous).add(group.id));
    setCreateTarget({
      kind: "group",
      groupId: group.id,
    });
    setActionError(null);
    setCreateMetadata({
      ...createDefaultShapeDrawMetadata(),
      name: group.name,
    });
    onFitShapes(features);
  };

  const handleExportGeoShape = () => {
    if (!createTarget) return;

    setActionError(null);

    const features =
      createTarget.kind === "shape"
        ? [createTarget.feature]
        : getGroupFeatures(
            groups.find(group => group.id === createTarget.groupId)!,
            featureByShapeKey,
          );

    const metadataValidation = validateShapeDrawMetadata(createMetadata);
    const exportValidation = validateShapeDrawExport(createMetadata, features);
    if (!metadataValidation.valid || !exportValidation.valid) {
      setActionError([...metadataValidation.errors, ...exportValidation.errors].join(" "));
      return;
    }

    try {
      downloadShapePackage(createMetadata, features);
      handleCancelCreate();
    } catch (exportError) {
      setActionError(exportError instanceof Error ? exportError.message : "Export failed.");
    }
  };

  const canCreateFromGroup = (group: GeoJsonShapeGroup): boolean => {
    const features = getGroupFeatures(group, featureByShapeKey);
    return features.length > 0 && features.every(feature => canCreateGeoShapeFromFeature(feature));
  };

  const canUnionGroup = (group: GeoJsonShapeGroup): boolean => {
    if (group.unionFeature) return false;

    const memberFeatures = group.shapeKeys
      .map(shapeKey => featureByShapeKey.get(shapeKey))
      .filter((feature): feature is GeoJSON.Feature => feature !== undefined);

    return canUnionPolygonFeatures(memberFeatures);
  };

  const renderUnionShapeActions = (group: GeoJsonShapeGroup) => {
    const unionFeature = group.unionFeature;
    if (!unionFeature) return null;

    const unionShapeKey = getUnionShapeKey(group.id);
    const isSelectedForCreate =
      createTarget?.kind === "shape" && createTarget.shapeKey === unionShapeKey;

    return (
      <div className="flex shrink-0 items-center gap-0.5">
        <IconButton small ariaLabel="Fit unioned shape on map" onClick={() => onFitShape(unionFeature)}>
          <FitScreenRounded sx={{ fontSize: 16 }} />
        </IconButton>
        <IconButton small ariaLabel="Download unioned shape" onClick={() => handleDownloadGroup(group)}>
          <DownloadRounded sx={{ fontSize: 16 }} />
        </IconButton>
        {canCreateGeoShapeFromFeature(unionFeature) ? (
          <IconButton
            small
            ariaLabel={isSelectedForCreate ? "Cancel export geo shape" : "Export geo shape"}
            onClick={() => {
              if (isSelectedForCreate) {
                handleCancelCreate();
                return;
              }

              setCreateTarget({
                kind: "shape",
                shapeKey: unionShapeKey,
                feature: unionFeature,
                label: `${group.name} (union)`,
              });
              setActionError(null);
              setCreateMetadata({
                ...createDefaultShapeDrawMetadata(),
                name: group.name,
                notes: getShapeDescription(shapeMetadata, unionShapeKey),
              });
              onFitShape(unionFeature);
            }}
          >
            <AddRounded sx={{ fontSize: 16 }} />
          </IconButton>
        ) : null}
      </div>
    );
  };

  const renderShapeExpandedContent = (
    shapeKey: string,
    createForm: React.ReactNode | null = null,
  ) => {
    const isSelected = selectedShapeKeySet.has(shapeKey);
    if (!isSelected && !createForm) return null;

    return (
      <>
        {isSelected ? (
          <ShapeDescriptionEditor
            description={getShapeDescription(shapeMetadata, shapeKey)}
            onDescriptionChange={description => handleUpdateShapeDescription(shapeKey, description)}
          />
        ) : null}
        {createForm}
      </>
    );
  };

  const renderCompactShapeActions = (
    file: LoadedGeoJsonFile,
    shape: ExtractedShapeEntry,
    shapeKey: string,
  ) => {
    const isSelectedForCreate = createTarget?.kind === "shape" && createTarget.shapeKey === shapeKey;
    const canCreate = canCreateGeoShapeFromFeature(shape.feature);

    return (
      <div className="flex shrink-0 items-center gap-0.5">
        <IconButton
          small
          ariaLabel="Fit shape on map"
          disabled={!file.visible}
          onClick={() => onFitShape(shape.feature)}
        >
          <FitScreenRounded sx={{ fontSize: 16 }} />
        </IconButton>
        <IconButton
          small
          ariaLabel="Download shape"
          onClick={() => handleDownloadShape(file, shape)}
        >
          <DownloadRounded sx={{ fontSize: 16 }} />
        </IconButton>
        {canCreate ? (
          <IconButton
            small
            ariaLabel={isSelectedForCreate ? "Cancel export geo shape" : "Export geo shape"}
            disabled={!file.visible}
            onClick={() =>
              isSelectedForCreate ? handleCancelCreate() : handleSelectShapeForCreate(file, shape)
            }
          >
            <AddRounded sx={{ fontSize: 16 }} />
          </IconButton>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".geojson,.json,application/geo+json,application/json"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex flex-wrap gap-2">
        <ActionButton type="filled" size="sm" disabled={isReading} onClick={handleChooseFile}>
          <span className="flex items-center gap-2">
            <UploadFileRounded fontSize="small" />
            {isReading ? "Reading file..." : "Choose GeoJSON file"}
          </span>
        </ActionButton>
        <ActionButton type="secondary" size="sm" disabled={files.length === 0} onClick={onFitAll}>
          Fit all loaded
        </ActionButton>
        <ActionButton type="default" size="sm" disabled={files.length === 0} onClick={handleClearAll}>
          Clear all
        </ActionButton>
      </div>

      <BodyText color="grey-40" type="label-small">
        Loaded files keep their features intact (MultiPolygons are not split). Each file gets its own
        color family on the map, with a slightly different shade per feature. Click features on the map to
        select them, then move the selection into a group if needed.
      </BodyText>

      {restoredFileCount > 0 || restoredGroupCount > 0 ? (
        <Alert type="info">
          <BodyText type="label-small">
            Restored locally saved GeoJSON
            {restoredFileCount > 0
              ? ` (${restoredFileCount} file${restoredFileCount === 1 ? "" : "s"})`
              : ""}
            {restoredGroupCount > 0
              ? `${restoredFileCount > 0 ? " and " : " ("}${restoredGroupCount} group${restoredGroupCount === 1 ? "" : "s"}${restoredFileCount > 0 ? "" : ")"}`
              : ""}
            .
          </BodyText>
        </Alert>
      ) : null}

      {error ? <Alert type="danger">{error}</Alert> : null}
      {actionError ? <Alert type="danger">{actionError}</Alert> : null}

      {files.length > 0 ? (
        <div className="border-grey-200 flex flex-col gap-2 rounded-lg border bg-grey-50 p-3">
          <BodyText type="label-small" className="font-medium">
            Map selection ({selectedShapeKeys.length})
          </BodyText>
          <BodyText color="grey-40" type="label-small">
            Click loaded shapes on the map to add or remove them from the selection. Rows below also toggle selection.
          </BodyText>
          <div className="flex flex-wrap gap-2">
            <ActionButton
              type="default"
              size="sm"
              disabled={selectedShapeKeys.length === 0}
              onClick={() => onSelectedShapeKeysChange([])}
            >
              Clear selection
            </ActionButton>
            <ActionButton
              type="default"
              size="sm"
              disabled={selectedShapeKeys.length === 0}
              onClick={handleMoveSelectedToUngrouped}
            >
              Move to ungrouped
            </ActionButton>
          </div>
          <div className="flex flex-col gap-1">
            <BodyText type="label-small">Move selected to group</BodyText>
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-[180px] flex-1">
                <Select
                  value={moveTargetGroupId}
                  updateValue={setMoveTargetGroupId}
                  options={groups.map(group => ({
                    label: group.name,
                    value: group.id,
                  }))}
                  disabled={groups.length === 0}
                />
              </div>
              <ActionButton
                type="filled"
                size="sm"
                disabled={selectedShapeKeys.length === 0 || groups.length === 0 || !moveTargetGroupId}
                onClick={handleMoveSelectedToGroup}
              >
                Move selected
              </ActionButton>
            </div>
            {groups.length === 0 ? (
              <BodyText color="grey-40" type="label-small">
                Add a group before moving selected shapes.
              </BodyText>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <BodyText type="label-small">Groups ({groups.length})</BodyText>
          <ActionButton type="default" size="sm" onClick={handleAddGroup}>
            Add group
          </ActionButton>
        </div>

        {groups.length === 0 ? (
          <BodyText color="grey-40" type="label-small">
            Add a group, select shapes on the map, then move them here.
          </BodyText>
        ) : (
          <ul className="flex flex-col gap-2">
            {groups.map(group => {
              const features = getGroupFeatures(group, featureByShapeKey);
              const isExpanded = expandedGroupIds.has(group.id);
              const isSelectedForCreate =
                createTarget?.kind === "group" && createTarget.groupId === group.id;
              const canCreate = canCreateFromGroup(group);

              return (
                <li
                  key={group.id}
                  className={clsx(
                    "border-grey-200 flex flex-col gap-2 rounded-lg border bg-white p-2",
                    isSelectedForCreate && "border-primary-500 ring-2 ring-primary-200",
                  )}
                >
                  <div className="flex items-center gap-1">
                    <IconButton
                      small
                      ariaLabel={isExpanded ? `Collapse ${group.name}` : `Expand ${group.name}`}
                      onClick={() => handleToggleGroupExpanded(group.id)}
                    >
                      {isExpanded ? (
                        <ExpandLessRounded fontSize="small" />
                      ) : (
                        <ExpandMoreRounded fontSize="small" />
                      )}
                    </IconButton>
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border border-white shadow-sm"
                      style={{ backgroundColor: group.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <TextInput
                        small
                        value={group.name}
                        onChange={event =>
                          onGroupsChange(updateGeoJsonShapeGroupName(groups, group.id, event.target.value))
                        }
                      />
                    </div>
                    {!isExpanded ? (
                      <BodyText color="grey-40" type="label-small" className="shrink-0">
                        {group.shapeKeys.length}
                      </BodyText>
                    ) : null}
                    <IconButton
                      small
                      ariaLabel={`Delete ${group.name}`}
                      onClick={() => onGroupsChange(removeGeoJsonShapeGroup(groups, group.id))}
                    >
                      <CloseRounded fontSize="small" />
                    </IconButton>
                  </div>

                  {isExpanded ? (
                    <>
                      <BodyText color="grey-40" type="label-small">
                        {group.unionFeature
                          ? `Unioned from ${group.shapeKeys.length} shapes`
                          : `${group.shapeKeys.length} shape${group.shapeKeys.length === 1 ? "" : "s"}`}
                      </BodyText>

                      {group.unionFeature ? (
                        <ShapeListRow
                          label={`${group.name} (union)`}
                          subtitle={`${group.shapeKeys.length} merged shapes`}
                          accentColor={group.color}
                          isSelected={selectedShapeKeySet.has(getUnionShapeKey(group.id))}
                          actions={renderUnionShapeActions(group)}
                          expandedContent={renderShapeExpandedContent(
                            getUnionShapeKey(group.id),
                            createTarget?.kind === "shape" &&
                              createTarget.shapeKey === getUnionShapeKey(group.id) &&
                              canCreateGeoShapeFromFeature(group.unionFeature) ? (
                              <GeoShapeCreateForm
                                metadata={createMetadata}
                                isCreating={false}
                                onMetadataChange={handleCreateMetadataChange}
                                onCreate={() => void handleExportGeoShape()}
                                onCancel={handleCancelCreate}
                                createLabel="Export shape package"
                                title="Export geo shape"
                              />
                            ) : null,
                          )}
                          onToggleSelect={() => handleToggleShapeSelection(getUnionShapeKey(group.id))}
                        />
                      ) : group.shapeKeys.length > 0 ? (
                        <ul className="flex flex-col gap-1">
                          {group.shapeKeys.map(shapeKey => {
                            const entry = shapeEntriesByKey.get(shapeKey);
                            if (!entry) return null;

                            return (
                              <li key={shapeKey}>
                                <ShapeListRow
                                  label={entry.shape.label}
                                  subtitle={entry.file.fileName}
                                  accentColor={group.color}
                                  isSelected={selectedShapeKeySet.has(shapeKey)}
                                  disabled={!entry.file.visible}
                                  actions={renderCompactShapeActions(
                                    entry.file,
                                    entry.shape,
                                    shapeKey,
                                  )}
                                  expandedContent={renderShapeExpandedContent(shapeKey)}
                                  onToggleSelect={() => handleToggleShapeSelection(shapeKey)}
                                />
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        {group.unionFeature ? (
                          <ActionButton type="default" size="sm" onClick={() => handleRestoreGroupShapes(group)}>
                            Restore individual shapes
                          </ActionButton>
                        ) : (
                          <ActionButton
                            type="secondary"
                            size="sm"
                            disabled={!canUnionGroup(group)}
                            onClick={() => handleUnionGroupShapes(group)}
                          >
                            Union shapes
                          </ActionButton>
                        )}
                        <ActionButton
                          type="default"
                          size="sm"
                          disabled={features.length === 0}
                          onClick={() => onFitShapes(features)}
                        >
                          Fit group on map
                        </ActionButton>
                        <ActionButton type="secondary" size="sm" onClick={() => handleDownloadGroup(group)}>
                          <span className="flex items-center gap-2">
                            <DownloadRounded fontSize="small" />
                            Download
                          </span>
                        </ActionButton>
                        {canCreate ? (
                          <ActionButton
                            type={isSelectedForCreate ? "filled" : "default"}
                            size="sm"
                            onClick={() =>
                              isSelectedForCreate
                                ? handleCancelCreate()
                                : handleSelectGroupForCreate(group)
                            }
                          >
                            {isSelectedForCreate ? "Cancel export" : "Export geo shape"}
                          </ActionButton>
                        ) : (
                          <BodyText color="grey-40" type="label-small" className="self-center">
                            Polygon shapes only
                          </BodyText>
                        )}
                      </div>

                      {isSelectedForCreate && canCreate ? (
                        <GeoShapeCreateForm
                          metadata={createMetadata}
                          isCreating={false}
                          onMetadataChange={handleCreateMetadataChange}
                          onCreate={() => void handleExportGeoShape()}
                          onCancel={handleCancelCreate}
                          createLabel="Export shape package"
                          title="Export geo shape"
                        />
                      ) : null}
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {files.length > 0 ? (
        <div className="flex flex-col gap-2">
          <BodyText type="label-small">Ungrouped features ({ungroupedShapeEntries.length})</BodyText>
          {ungroupedShapeEntries.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {ungroupedShapeEntries.map(({ shapeKey, file, shape }) => {
                const isSelectedForCreate =
                  createTarget?.kind === "shape" && createTarget.shapeKey === shapeKey;

                return (
                  <li key={shapeKey}>
                    <ShapeListRow
                      label={shape.label}
                      subtitle={`${file.fileName} · ${shape.geometryType}`}
                      accentColor={getShapeAccentColor(file, shape)}
                      isSelected={selectedShapeKeySet.has(shapeKey)}
                      disabled={!file.visible}
                      actions={renderCompactShapeActions(file, shape, shapeKey)}
                      expandedContent={renderShapeExpandedContent(
                        shapeKey,
                        isSelectedForCreate && canCreateGeoShapeFromFeature(shape.feature) ? (
                          <GeoShapeCreateForm
                            metadata={createMetadata}
                            isCreating={false}
                            onMetadataChange={handleCreateMetadataChange}
                            onCreate={() => void handleExportGeoShape()}
                            onCancel={handleCancelCreate}
                            createLabel="Export shape package"
                            title="Export geo shape"
                          />
                        ) : null,
                      )}
                      onToggleSelect={() => handleToggleShapeSelection(shapeKey)}
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            <BodyText color="grey-40" type="label-small">
              All loaded shapes are currently assigned to groups.
            </BodyText>
          )}
        </div>
      ) : null}

      {files.length === 0 ? (
        <BodyText color="grey-40" type="label-small">
          No files loaded yet.
        </BodyText>
      ) : (
        <div className="flex flex-col gap-2">
          <BodyText type="label-small">Loaded files ({files.length})</BodyText>
          <ul className="flex flex-col gap-2">
            {files.map(file => (
              <li
                key={file.id}
                className={clsx(
                  "border-grey-200 flex flex-col gap-2 rounded-lg border bg-white p-3",
                  !file.visible && "opacity-60",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <span
                      className="mt-1 h-3 w-3 shrink-0 rounded-full border border-white shadow-sm"
                      style={{ backgroundColor: file.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <BodyText type="label-small" className="truncate font-medium">
                        {file.fileName}
                      </BodyText>
                      <BodyText color="grey-40" type="label-small" className="mt-1">
                        {file.features.length} feature{file.features.length === 1 ? "" : "s"} ·{" "}
                        {formatGeometrySummary(file.geometrySummary)}
                      </BodyText>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton
                      small
                      ariaLabel={file.visible ? `Hide ${file.fileName}` : `Show ${file.fileName}`}
                      onClick={() => handleToggleVisibility(file.id)}
                    >
                      {file.visible ? (
                        <VisibilityRounded fontSize="small" />
                      ) : (
                        <VisibilityOffRounded fontSize="small" />
                      )}
                    </IconButton>
                    <IconButton small ariaLabel={`Remove ${file.fileName}`} onClick={() => handleRemove(file.id)}>
                      <CloseRounded fontSize="small" />
                    </IconButton>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionButton type="default" size="sm" disabled={!file.visible} onClick={() => onFitFile(file.id)}>
                    Fit file on map
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
