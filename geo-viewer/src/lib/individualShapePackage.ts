import { createLoadedGeoJsonFile, type LoadedGeoJsonFile } from "./loadedGeoJsonFiles";
import { getDefaultGeoShapeName } from "./extractGeoJsonShapes";
import { parseGeoJsonFileContent, type ParsedGeoJsonFile } from "./parseGeoJsonFile";
import { toFeatureCollection } from "./normalizeGeoJson";

export interface IndividualShapeMetadata {
  id?: number | null;
  old_id?: number | null;
  type?: string;
  name?: string;
  hash?: string;
}

export interface IndividualShapePackage {
  metadata: IndividualShapeMetadata;
  feature: GeoJSON.Feature;
}

export type ParseIndividualShapePackageResult =
  | { ok: true; data: ParsedGeoJsonFile; metadata: IndividualShapeMetadata | null }
  | { ok: false; error: string };

function summarizeGeometryTypes(features: GeoJSON.Feature[]): Record<string, number> {
  return features.reduce<Record<string, number>>((summary, feature) => {
    const type = feature.geometry?.type ?? "Unknown";
    summary[type] = (summary[type] ?? 0) + 1;
    return summary;
  }, {});
}

function isShapePackage(value: unknown): value is IndividualShapePackage {
  if (!value || typeof value !== "object") return false;

  const payload = value as IndividualShapePackage;
  return (
    typeof payload.metadata === "object" &&
    payload.metadata !== null &&
    typeof payload.feature === "object" &&
    payload.feature !== null &&
    payload.feature.type === "Feature"
  );
}

export function parseIndividualShapePackageContent(
  content: string,
  fileName: string,
): ParseIndividualShapePackageResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, error: `${fileName}: file is not valid JSON.` };
  }

  if (isShapePackage(parsed)) {
    const geometry = parsed.feature.geometry;
    if (!geometry || !("coordinates" in geometry)) {
      return { ok: false, error: `${fileName}: shape package is missing geometry.` };
    }

    const feature: GeoJSON.Feature = {
      ...parsed.feature,
      properties: {
        ...parsed.feature.properties,
        individualShapeId: parsed.metadata.id ?? null,
        individualShapeOldId: parsed.metadata.old_id ?? null,
        individualShapeType: parsed.metadata.type ?? null,
        individualShapeName: parsed.metadata.name ?? fileName,
        individualShapeHash: parsed.metadata.hash ?? "",
      },
    };

    return {
      ok: true,
      metadata: parsed.metadata,
      data: {
        geoJson: toFeatureCollection([feature]),
        features: [feature],
        geometrySummary: summarizeGeometryTypes([feature]),
      },
    };
  }

  const parsedGeoJson = parseGeoJsonFileContent(content);
  if (!parsedGeoJson.ok) {
    return { ok: false, error: `${fileName}: ${parsedGeoJson.error}` };
  }

  return {
    ok: true,
    metadata: null,
    data: parsedGeoJson.data,
  };
}

export function isIndividualShapePackageFileName(fileName: string): boolean {
  return fileName.endsWith(".geojson.gz") || fileName.endsWith(".geojson");
}

export function preferIndividualShapePackageFiles(
  entries: Array<{ name: string; path: string; kind: "file" | "directory" }>,
): Array<{ name: string; path: string }> {
  const files = entries.filter(entry => entry.kind === "file" && isIndividualShapePackageFileName(entry.name));
  const preferred = new Map<string, { name: string; path: string }>();

  for (const file of files) {
    const baseName = file.name.endsWith(".geojson.gz")
      ? file.name.slice(0, -".geojson.gz".length)
      : file.name.slice(0, -".geojson".length);
    const existing = preferred.get(baseName);

    if (!existing || existing.name.endsWith(".geojson")) {
      preferred.set(baseName, { name: file.name, path: file.path });
    }
  }

  return [...preferred.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function createLoadedIndividualShapeFile(
  fileName: string,
  parsed: ParsedGeoJsonFile,
): LoadedGeoJsonFile {
  return createLoadedGeoJsonFile(fileName, parsed);
}

const FOLDER_COLORS = [
  { fill: "#6366f1", line: "#4338ca" },
  { fill: "#0ea5e9", line: "#0369a1" },
  { fill: "#14b8a6", line: "#0f766e" },
  { fill: "#f59e0b", line: "#b45309" },
  { fill: "#ec4899", line: "#be185d" },
  { fill: "#8b5cf6", line: "#6d28d9" },
];

export function getIndividualFolderColor(folderName: string): { fill: string; line: string } {
  let hash = 0;
  for (let index = 0; index < folderName.length; index += 1) {
    hash = (hash + folderName.charCodeAt(index) * (index + 1)) % FOLDER_COLORS.length;
  }
  return FOLDER_COLORS[hash] ?? FOLDER_COLORS[0];
}

export function buildIndividualShapesOverlay(
  files: LoadedGeoJsonFile[],
  folderName: string,
): GeoJSON.FeatureCollection | null {
  const color = getIndividualFolderColor(folderName);
  const features = files
    .filter(file => file.visible)
    .flatMap(file =>
      file.features.map(feature => ({
        ...feature,
        properties: {
          ...feature.properties,
          featureName: getDefaultGeoShapeName(feature, file.fileName),
          groupColor: color.fill,
          groupLineColor: color.line,
        },
      })),
    );

  if (features.length === 0) return null;

  return {
    type: "FeatureCollection",
    features,
  };
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
