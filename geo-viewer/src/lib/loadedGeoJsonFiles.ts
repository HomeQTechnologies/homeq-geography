import { extractShapesFromFeatures } from "./extractGeoJsonShapes";
import {
  getShapeGroupMap,
  getShapeKey,
  getUnionShapeKey,
  UNGROUPED_GEO_JSON_COLOR,
  type GeoJsonShapeGroup,
} from "./geoJsonShapeGroups";
import type { ParsedGeoJsonFile } from "./parseGeoJsonFile";
import { toFeatureCollection } from "./normalizeGeoJson";

export interface LoadedGeoJsonFile {
  id: string;
  fileName: string;
  geoJson: GeoJSON.GeoJSON;
  features: GeoJSON.Feature[];
  geometrySummary: Record<string, number>;
  visible: boolean;
}

export function createLoadedGeoJsonFile(fileName: string, parsed: ParsedGeoJsonFile): LoadedGeoJsonFile {
  return {
    id: crypto.randomUUID(),
    fileName,
    geoJson: parsed.geoJson,
    features: parsed.features,
    geometrySummary: parsed.geometrySummary,
    visible: true,
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
  return extractShapesFromFeatures(file.features).map(shape =>
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
      const shapes = extractShapesFromFeatures(file.features);
      return shapes.flatMap(shape => {
        const shapeKey = getShapeKey(file.id, shape.featureIndex, shape.shapeIndex);
        if (hiddenMemberShapeKeys.has(shapeKey)) return [];

        const group = groupByShapeKey.get(shapeKey);
        const style = group
          ? { fill: group.color, line: group.lineColor, groupId: group.id }
          : {
              fill: UNGROUPED_GEO_JSON_COLOR.fill,
              line: UNGROUPED_GEO_JSON_COLOR.line,
              groupId: null,
            };

        return [
          {
            ...shape.feature,
            properties: {
              ...shape.feature.properties,
              geoJsonShapeKey: shapeKey,
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
      const shapes = extractShapesFromFeatures(file.features);
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
