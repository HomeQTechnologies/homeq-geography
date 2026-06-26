import { listLoadedGeoJsonFeatures, getDefaultGeoShapeName } from "./extractGeoJsonShapes";
import {
  getLoadedGeoJsonShapeColor,
  getLoadedGeoJsonFileColor,
  isLegacyDefaultGeoJsonFileColor,
  getShapeGroupMap,
  getShapeKey,
  getUnionShapeKey,
  type GeoJsonShapeGroup,
} from "./geoJsonShapeGroups";
import type { ParsedGeoJsonFile } from "./parseGeoJsonFile";
import { toFeatureCollection } from "./normalizeGeoJson";
import bbox from "@turf/bbox";

export interface LoadedGeoJsonFile {
  id: string;
  fileName: string;
  geoJson: GeoJSON.GeoJSON;
  features: GeoJSON.Feature[];
  geometrySummary: Record<string, number>;
  visible: boolean;
  color: string;
  lineColor: string;
}

export function normalizeLoadedGeoJsonFile(file: LoadedGeoJsonFile, fileIndex: number): LoadedGeoJsonFile {
  const paletteColor = getLoadedGeoJsonFileColor(fileIndex);

  if (!file.color || !file.lineColor) {
    return {
      ...file,
      color: paletteColor.fill,
      lineColor: paletteColor.line,
    };
  }

  if (isLegacyDefaultGeoJsonFileColor(file.color, file.lineColor)) {
    return {
      ...file,
      color: paletteColor.fill,
      lineColor: paletteColor.line,
    };
  }

  return file;
}

export function normalizeLoadedGeoJsonFiles(files: LoadedGeoJsonFile[]): LoadedGeoJsonFile[] {
  return files.map((file, index) => normalizeLoadedGeoJsonFile(file, index));
}

export function createLoadedGeoJsonFile(
  fileName: string,
  parsed: ParsedGeoJsonFile,
  fileIndex = 0,
): LoadedGeoJsonFile {
  const paletteColor = getLoadedGeoJsonFileColor(fileIndex);

  return {
    id: crypto.randomUUID(),
    fileName,
    geoJson: parsed.geoJson,
    features: parsed.features,
    geometrySummary: parsed.geometrySummary,
    visible: true,
    color: paletteColor.fill,
    lineColor: paletteColor.line,
  };
}

export function toggleLoadedGeoJsonVisibility(
  files: LoadedGeoJsonFile[],
  fileId: string,
): LoadedGeoJsonFile[] {
  return files.map(file => (file.id === fileId ? { ...file, visible: !file.visible } : file));
}

export function removeLoadedGeoJsonFile(files: LoadedGeoJsonFile[], fileId: string): LoadedGeoJsonFile[] {
  return files.filter(file => file.id !== fileId);
}

export function getShapeKeysForLoadedFile(file: LoadedGeoJsonFile): string[] {
  return listLoadedGeoJsonFeatures(file.features).map(shape =>
    getShapeKey(file.id, shape.featureIndex, shape.shapeIndex),
  );
}

export function removeLoadedFileShapesFromGroups(
  groups: GeoJsonShapeGroup[],
  file: LoadedGeoJsonFile,
): GeoJsonShapeGroup[] {
  const fileShapeKeys = new Set(getShapeKeysForLoadedFile(file));

  return groups.map(group => {
    const shapeKeys = group.shapeKeys.filter(shapeKey => !fileShapeKeys.has(shapeKey));
    return {
      ...group,
      shapeKeys,
      unionFeature: shapeKeys.length >= 2 ? group.unionFeature : undefined,
    };
  });
}

export function getVisibleLoadedGeoJsonCollection(
  files: LoadedGeoJsonFile[],
): GeoJSON.FeatureCollection | null {
  return buildLoadedGeoJsonStyledCollection(files, []);
}

function getUnionedGroupShapeKeys(groups: GeoJsonShapeGroup[]): Set<string> {
  const shapeKeys = new Set<string>();

  for (const group of groups) {
    if (!group.unionFeature) continue;
    for (const shapeKey of group.shapeKeys) {
      shapeKeys.add(shapeKey);
    }
  }

  return shapeKeys;
}

export function buildLoadedGeoJsonStyledCollection(
  files: LoadedGeoJsonFile[],
  groups: GeoJsonShapeGroup[],
): GeoJSON.FeatureCollection | null {
  const groupByShapeKey = getShapeGroupMap(groups);
  const hiddenMemberShapeKeys = getUnionedGroupShapeKeys(groups);
  const features = files
    .filter(file => file.visible)
    .flatMap(file => {
      const fileIndex = files.findIndex(entry => entry.id === file.id);
      const shapes = listLoadedGeoJsonFeatures(file.features);
      return shapes.flatMap((shape, shapeIndex) => {
        const shapeKey = getShapeKey(file.id, shape.featureIndex, shape.shapeIndex);
        if (hiddenMemberShapeKeys.has(shapeKey)) return [];

        const group = groupByShapeKey.get(shapeKey);
        const fileStyle = getLoadedGeoJsonShapeColor(fileIndex, shapeIndex, shapes.length);
        const style = group
          ? { fill: group.color, line: group.lineColor, groupId: group.id }
          : {
              fill: fileStyle.fill,
              line: fileStyle.line,
              groupId: null,
            };

        return [
          {
            ...shape.feature,
            properties: {
              ...shape.feature.properties,
              geoJsonShapeKey: shapeKey,
              featureName: shape.label,
              groupId: style.groupId,
              groupColor: style.fill,
              groupLineColor: style.line,
            },
          },
        ];
      });
    });

  for (const group of groups) {
    if (!group.unionFeature?.geometry) continue;

    const visibleMember = group.shapeKeys.some(shapeKey => {
      const fileId = shapeKey.split(":")[0];
      return files.some(file => file.id === fileId && file.visible);
    });
    if (!visibleMember) continue;

    features.push({
      ...group.unionFeature,
      properties: {
        ...group.unionFeature.properties,
        geoJsonShapeKey: getUnionShapeKey(group.id),
        featureName: group.name,
        groupId: group.id,
        groupColor: group.color,
        groupLineColor: group.lineColor,
        isGroupUnion: true,
      },
    });
  }

  if (features.length === 0) return null;

  return toFeatureCollection(features);
}

export function buildGeoJsonFeatureLabelCollection(
  collection: GeoJSON.FeatureCollection | null,
): GeoJSON.FeatureCollection | null {
  if (!collection || collection.features.length === 0) return null;

  const features = collection.features.flatMap(feature => {
    const name =
      typeof feature.properties?.featureName === "string" && feature.properties.featureName.trim()
        ? feature.properties.featureName.trim()
        : getDefaultGeoShapeName(feature, "");
    if (!name || !feature.geometry) return [];

    try {
      const bounds = bbox(feature);
      return [
        {
          type: "Feature",
          properties: {
            name,
            geoJsonShapeKey: feature.properties?.geoJsonShapeKey ?? null,
          },
          geometry: {
            type: "Point",
            coordinates: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2],
          },
        } satisfies GeoJSON.Feature<GeoJSON.Point>,
      ];
    } catch {
      return [];
    }
  });

  if (features.length === 0) return null;

  return toFeatureCollection(features);
}

export function buildHighlightedGeoJsonShapesCollection(
  files: LoadedGeoJsonFile[],
  groups: GeoJsonShapeGroup[],
  shapeKeys: string[],
): GeoJSON.FeatureCollection | null {
  if (shapeKeys.length === 0) return null;

  const shapeKeySet = new Set(shapeKeys);
  const hiddenMemberShapeKeys = getUnionedGroupShapeKeys(groups);
  const features = files
    .filter(file => file.visible)
    .flatMap(file => {
      const shapes = listLoadedGeoJsonFeatures(file.features);
      return shapes
        .filter(shape => {
          const shapeKey = getShapeKey(file.id, shape.featureIndex, shape.shapeIndex);
          return shapeKeySet.has(shapeKey) && !hiddenMemberShapeKeys.has(shapeKey);
        })
        .map(shape => ({
          ...shape.feature,
          properties: {
            ...shape.feature.properties,
            highlightedGeoJsonShapeKey: getShapeKey(file.id, shape.featureIndex, shape.shapeIndex),
          },
        }));
    });

  for (const group of groups) {
    const unionShapeKey = getUnionShapeKey(group.id);
    if (!group.unionFeature?.geometry || !shapeKeySet.has(unionShapeKey)) continue;

    features.push({
      ...group.unionFeature,
      properties: {
        ...group.unionFeature.properties,
        highlightedGeoJsonShapeKey: unionShapeKey,
      },
    });
  }

  if (features.length === 0) return null;

  return toFeatureCollection(features);
}
