import { sanitizeGeoJsonFileBaseName } from "./extractGeoJsonShapes";

export interface GeoJsonGroupColor {
  fill: string;
  line: string;
}

export const GEO_JSON_GROUP_COLORS: GeoJsonGroupColor[] = [
  { fill: "#3B82F6", line: "#1D4ED8" },
  { fill: "#10B981", line: "#047857" },
  { fill: "#F59E0B", line: "#D97706" },
  { fill: "#EF4444", line: "#B91C1C" },
  { fill: "#8B5CF6", line: "#6D28D9" },
  { fill: "#EC4899", line: "#BE185D" },
  { fill: "#14B8A6", line: "#0F766E" },
  { fill: "#F97316", line: "#C2410C" },
];

export const UNGROUPED_GEO_JSON_COLOR: GeoJsonGroupColor = {
  fill: "#C4B5FD",
  line: "#7C3AED",
};

export interface GeoJsonShapeGroup {
  id: string;
  name: string;
  shapeKeys: string[];
  color: string;
  lineColor: string;
  unionFeature?: GeoJSON.Feature;
}

export function getShapeKey(fileId: string, featureIndex: number, shapeIndex: number): string {
  return `${fileId}:${featureIndex}:${shapeIndex}`;
}

export function getUnionShapeKey(groupId: string): string {
  return `union:${groupId}`;
}

export function isUnionShapeKey(shapeKey: string): boolean {
  return shapeKey.startsWith("union:");
}

export function getNextGroupColor(groups: GeoJsonShapeGroup[]): GeoJsonGroupColor {
  const usedColors = new Set(groups.map(group => group.color));
  const unusedColor = GEO_JSON_GROUP_COLORS.find(color => !usedColors.has(color.fill));
  if (unusedColor) return unusedColor;

  return GEO_JSON_GROUP_COLORS[groups.length % GEO_JSON_GROUP_COLORS.length];
}

export function normalizeGeoJsonShapeGroup(
  group: GeoJsonShapeGroup,
  index: number,
): GeoJsonShapeGroup {
  if (group.color && group.lineColor) return group;

  const paletteColor = GEO_JSON_GROUP_COLORS[index % GEO_JSON_GROUP_COLORS.length];
  return {
    ...group,
    color: paletteColor.fill,
    lineColor: paletteColor.line,
  };
}

export function createGeoJsonShapeGroup(
  name: string,
  shapeKeys: string[] = [],
  color?: GeoJsonGroupColor,
): GeoJsonShapeGroup {
  const paletteColor = color ?? GEO_JSON_GROUP_COLORS[0];

  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    shapeKeys: [...new Set(shapeKeys)],
    color: paletteColor.fill,
    lineColor: paletteColor.line,
  };
}

export function createEmptyGeoJsonShapeGroup(
  groups: GeoJsonShapeGroup[],
  name?: string,
): GeoJsonShapeGroup {
  const paletteColor = getNextGroupColor(groups);
  const groupNumber = groups.length + 1;

  return createGeoJsonShapeGroup(name ?? `Group ${groupNumber}`, [], paletteColor);
}

export function updateGeoJsonShapeGroupName(
  groups: GeoJsonShapeGroup[],
  groupId: string,
  name: string,
): GeoJsonShapeGroup[] {
  return groups.map(group => (group.id === groupId ? { ...group, name: name.trim() } : group));
}

export function removeGeoJsonShapeGroup(groups: GeoJsonShapeGroup[], groupId: string): GeoJsonShapeGroup[] {
  return groups.filter(group => group.id !== groupId);
}

export function assignShapeToGroup(
  groups: GeoJsonShapeGroup[],
  shapeKey: string,
  targetGroupId: string | null,
): GeoJsonShapeGroup[] {
  const withoutShape = groups.map(group => {
    if (!group.shapeKeys.includes(shapeKey)) return group;

    return {
      ...group,
      shapeKeys: group.shapeKeys.filter(key => key !== shapeKey),
      unionFeature: undefined,
    };
  });

  if (!targetGroupId) return withoutShape;

  return withoutShape.map(group =>
    group.id === targetGroupId
      ? { ...group, shapeKeys: [...group.shapeKeys, shapeKey], unionFeature: undefined }
      : group,
  );
}

export function assignShapesToGroup(
  groups: GeoJsonShapeGroup[],
  shapeKeys: string[],
  targetGroupId: string | null,
): GeoJsonShapeGroup[] {
  return shapeKeys.reduce(
    (nextGroups, shapeKey) => assignShapeToGroup(nextGroups, shapeKey, targetGroupId),
    groups,
  );
}

export function getGroupedShapeKeys(groups: GeoJsonShapeGroup[]): Set<string> {
  return new Set(groups.flatMap(group => group.shapeKeys));
}

export function getShapeGroupMap(groups: GeoJsonShapeGroup[]): Map<string, GeoJsonShapeGroup> {
  const map = new Map<string, GeoJsonShapeGroup>();

  for (const group of groups) {
    for (const shapeKey of group.shapeKeys) {
      map.set(shapeKey, group);
    }
  }

  return map;
}

export function pruneGeoJsonShapeGroups(
  groups: GeoJsonShapeGroup[],
  validShapeKeys: Set<string>,
): GeoJsonShapeGroup[] {
  return groups.map(group => {
    const shapeKeys = group.shapeKeys.filter(shapeKey => validShapeKeys.has(shapeKey));
    return {
      ...group,
      shapeKeys,
      unionFeature: shapeKeys.length >= 2 ? group.unionFeature : undefined,
    };
  });
}

export function setGroupUnion(
  groups: GeoJsonShapeGroup[],
  groupId: string,
  unionFeature: GeoJSON.Feature | null,
): GeoJsonShapeGroup[] {
  return groups.map(group =>
    group.id === groupId
      ? { ...group, unionFeature: unionFeature ?? undefined }
      : group,
  );
}

export function clearGroupUnion(groups: GeoJsonShapeGroup[], groupId: string): GeoJsonShapeGroup[] {
  return setGroupUnion(groups, groupId, null);
}

export function getGroupFeatures(
  group: GeoJsonShapeGroup,
  featureByShapeKey: Map<string, GeoJSON.Feature>,
): GeoJSON.Feature[] {
  if (group.unionFeature?.geometry) return [group.unionFeature];

  return group.shapeKeys
    .map(shapeKey => featureByShapeKey.get(shapeKey))
    .filter((feature): feature is GeoJSON.Feature => feature !== undefined);
}

export function buildGroupGeoJsonFilename(groupName: string): string {
  return `${sanitizeGeoJsonFileBaseName(groupName)}-group.geojson`;
}
