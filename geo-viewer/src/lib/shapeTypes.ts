/** Fixed map colors for types not shown in settings. */
export const FIXED_SHAPE_TYPE_COLORS = {
  country: "#78746F",
  other: "#8C9198",
} as const;

export type FixedShapeTypeKey = keyof typeof FIXED_SHAPE_TYPE_COLORS;

/** Muted defaults — spaced across hue families for map overlays at ~40% opacity. */
export const GEO_SHAPE_TYPES = [
  { key: "metropolitan_area", label: "Storstadsområde", defaultColor: "#AD7D7D" },
  { key: "municipality", label: "Kommun", defaultColor: "#6E84A8" },
  { key: "county", label: "Län", defaultColor: "#9178A3" },
  { key: "urban_area", label: "Tätort", defaultColor: "#6E9478" },
  { key: "district", label: "Område (distrikt)", defaultColor: "#A68F6B" },
  { key: "area", label: "Område", defaultColor: "#628E92" },
  { key: "zip3", label: "Postnummer (3 siffror)", defaultColor: "#9E7899" },
  { key: "zip5", label: "Postnummer (5 siffror)", defaultColor: "#7A82A6" },
] as const;

export type GeoShapeTypeKey = (typeof GEO_SHAPE_TYPES)[number]["key"];

export type ResolvedShapeTypeKey = GeoShapeTypeKey | FixedShapeTypeKey;

const SHAPE_TYPE_LABELS: Record<ResolvedShapeTypeKey, string> = {
  ...GEO_SHAPE_TYPES.reduce(
    (acc, type) => {
      acc[type.key] = type.label;
      return acc;
    },
    {} as Record<GeoShapeTypeKey, string>,
  ),
  country: "Land",
  other: "Övrigt",
};

export function parseShapeTypeKey(shapeId: string): ResolvedShapeTypeKey {
  const raw = shapeId.split(".")[0];
  if (raw in FIXED_SHAPE_TYPE_COLORS) {
    return raw as FixedShapeTypeKey;
  }
  if (GEO_SHAPE_TYPES.some(t => t.key === raw)) {
    return raw as GeoShapeTypeKey;
  }
  return "other";
}

export function countSelectedShapesByType(selectedIds: string[], shapeType: GeoShapeTypeKey): number {
  return selectedIds.filter(id => parseShapeTypeKey(id) === shapeType).length;
}

export function isConfigurableShapeTypeKey(key: string): key is GeoShapeTypeKey {
  return GEO_SHAPE_TYPES.some(type => type.key === key);
}

export function getShapeTypeLabel(shapeId: string): string {
  const key = parseShapeTypeKey(shapeId);
  return SHAPE_TYPE_LABELS[key] ?? "";
}

export function formatPostalCodeDisplay(postalCode: string, shapeType: string): string {
  const digits = postalCode.replace(/\s/g, "");
  if (shapeType === "zip5" && /^\d{5}$/.test(digits)) {
    return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  }
  return digits;
}

export function getSuggestionSubText(suggestion: {
  id: string;
  parent?: { name: string };
  postalCode?: string;
}): string {
  const shapeType = suggestion.id.split(".")[0];
  if (suggestion.parent?.name && (shapeType === "district" || shapeType === "area")) {
    return `, ${suggestion.parent.name}`;
  }
  if ((shapeType === "zip3" || shapeType === "zip5") && suggestion.postalCode) {
    return `, ${formatPostalCodeDisplay(suggestion.postalCode, shapeType)}`;
  }
  return "";
}

export function formatSuggestionLabel(suggestion: {
  id: string;
  text: string;
  parent?: { name: string };
  postalCode?: string;
}): string {
  return suggestion.text + getSuggestionSubText(suggestion);
}

export function getDefaultTypeColors(): Record<GeoShapeTypeKey, string> {
  return GEO_SHAPE_TYPES.reduce(
    (acc, type) => {
      acc[type.key] = type.defaultColor;
      return acc;
    },
    {} as Record<GeoShapeTypeKey, string>,
  );
}

export function getResolvedShapeColor(
  typeColors: Record<GeoShapeTypeKey, string>,
  shapeId: string,
): string {
  const typeKey = parseShapeTypeKey(shapeId);
  if (typeKey in FIXED_SHAPE_TYPE_COLORS) {
    return FIXED_SHAPE_TYPE_COLORS[typeKey as FixedShapeTypeKey];
  }
  return typeColors[typeKey as GeoShapeTypeKey];
}
