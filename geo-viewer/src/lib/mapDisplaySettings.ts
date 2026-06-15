import {
  GEO_SHAPE_TYPES,
  GeoShapeTypeKey,
  getDefaultTypeColors,
  getResolvedShapeColor,
  isConfigurableShapeTypeKey,
} from "./shapeTypes";

export const DEFAULT_FILL_OPACITY = 0.4;
export const MIN_FILL_OPACITY = 0.05;
export const MAX_FILL_OPACITY = 0.85;

export const MAP_DISPLAY_SETTINGS_STORAGE_KEY = "homeq.geo-viewer.display-settings";
/** @deprecated Migrated into display-settings; read once for backwards compatibility. */
const LEGACY_SEARCH_SETTINGS_STORAGE_KEY = "homeq.geo-viewer.search-settings";

/** Shape types available in search filters (excludes country/other). */
export const GEO_SEARCH_SHAPE_TYPES = GEO_SHAPE_TYPES;

export type GeoSearchShapeTypeKey = GeoShapeTypeKey;

export const GEO_SEARCH_SHAPE_TYPE_KEYS: GeoSearchShapeTypeKey[] = GEO_SEARCH_SHAPE_TYPES.map(t => t.key);

export interface MapDisplaySettings {
  fillOpacity: number;
  typeColors: Record<GeoShapeTypeKey, string>;
  enabledShapeTypes: GeoSearchShapeTypeKey[];
  showAll: boolean;
}

export function createDefaultMapDisplaySettings(): MapDisplaySettings {
  return {
    fillOpacity: DEFAULT_FILL_OPACITY,
    typeColors: getDefaultTypeColors(),
    enabledShapeTypes: [...GEO_SEARCH_SHAPE_TYPE_KEYS],
    showAll: false,
  };
}

export function areAllShapeTypesEnabled(enabled: GeoSearchShapeTypeKey[]): boolean {
  return GEO_SEARCH_SHAPE_TYPE_KEYS.every(key => enabled.includes(key));
}

/** Returns `shape_types` for the API, or `undefined` when all types are enabled. */
export function getShapeTypesQueryParam(enabled: GeoSearchShapeTypeKey[]): string | undefined {
  if (areAllShapeTypesEnabled(enabled)) return undefined;
  return enabled.join(",");
}

export function darkenHexColor(hex: string, amount = 0.22): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex;

  const r = Math.round(parseInt(normalized.slice(0, 2), 16) * (1 - amount));
  const g = Math.round(parseInt(normalized.slice(2, 4), 16) * (1 - amount));
  const b = Math.round(parseInt(normalized.slice(4, 6), 16) * (1 - amount));

  return `#${[r, g, b].map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

export function getShapeStyle(typeColors: Record<GeoShapeTypeKey, string>, shapeId: string) {
  const fill = getResolvedShapeColor(typeColors, shapeId);
  return { fill, line: darkenHexColor(fill) };
}

function parseEnabledShapeTypes(value: unknown): GeoSearchShapeTypeKey[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const enabled = value.filter(
    (key): key is GeoSearchShapeTypeKey =>
      typeof key === "string" && isConfigurableShapeTypeKey(key),
  );
  return enabled.length > 0 ? enabled : undefined;
}

function sanitizeTypeColors(value: unknown): Record<GeoShapeTypeKey, string> {
  const defaults = getDefaultTypeColors();
  if (!value || typeof value !== "object") return defaults;

  const parsed = value as Record<string, string>;
  const merged = { ...defaults };
  for (const type of GEO_SHAPE_TYPES) {
    if (typeof parsed[type.key] === "string") {
      merged[type.key] = parsed[type.key];
    }
  }
  return merged;
}

function loadLegacySearchSettings(): Pick<MapDisplaySettings, "enabledShapeTypes" | "showAll"> | null {
  try {
    const raw = localStorage.getItem(LEGACY_SEARCH_SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MapDisplaySettings>;
    const enabledShapeTypes = parseEnabledShapeTypes(parsed.enabledShapeTypes);
    if (!enabledShapeTypes) return null;
    return { enabledShapeTypes, showAll: Boolean(parsed.showAll) };
  } catch {
    return null;
  }
}

export function loadMapDisplaySettings(): MapDisplaySettings {
  const defaults = createDefaultMapDisplaySettings();

  try {
    const raw = localStorage.getItem(MAP_DISPLAY_SETTINGS_STORAGE_KEY);
    const legacySearch = loadLegacySearchSettings();

    if (!raw) {
      return legacySearch ? { ...defaults, ...legacySearch } : defaults;
    }

    const parsed = JSON.parse(raw) as Partial<MapDisplaySettings>;
    const enabledShapeTypes =
      parseEnabledShapeTypes(parsed.enabledShapeTypes) ??
      legacySearch?.enabledShapeTypes ??
      defaults.enabledShapeTypes;

    return {
      fillOpacity:
        typeof parsed.fillOpacity === "number"
          ? Math.min(MAX_FILL_OPACITY, Math.max(MIN_FILL_OPACITY, parsed.fillOpacity))
          : defaults.fillOpacity,
      typeColors: sanitizeTypeColors(parsed.typeColors),
      enabledShapeTypes,
      showAll: typeof parsed.showAll === "boolean" ? parsed.showAll : (legacySearch?.showAll ?? defaults.showAll),
    };
  } catch {
    return defaults;
  }
}

export function saveMapDisplaySettings(settings: MapDisplaySettings): void {
  localStorage.setItem(MAP_DISPLAY_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export { GEO_SHAPE_TYPES };
