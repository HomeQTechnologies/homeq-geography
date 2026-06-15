export interface DrawPolygonEntry {
  id: string;
  feature: GeoJSON.Feature;
  visible: boolean;
}

export function getDrawFeatureId(feature: GeoJSON.Feature): string {
  if (feature.id !== undefined && feature.id !== null) {
    return String(feature.id);
  }
  return "";
}

export function mergeDrawControlFeatures(
  previous: DrawPolygonEntry[],
  activeFeatures: GeoJSON.Feature[],
): DrawPolygonEntry[] {
  const activeIds = new Set(
    activeFeatures.map(getDrawFeatureId).filter(id => id.length > 0),
  );
  const hiddenEntries = previous.filter(entry => !entry.visible && !activeIds.has(entry.id));

  const activeEntries = activeFeatures
    .map(feature => {
      const id = getDrawFeatureId(feature);
      if (!id) return null;

      const existing = previous.find(entry => entry.id === id);
      return {
        id,
        feature,
        visible: existing?.visible ?? true,
      };
    })
    .filter((entry): entry is DrawPolygonEntry => entry !== null);

  return [...hiddenEntries, ...activeEntries];
}

export function getAllDrawFeatures(entries: DrawPolygonEntry[]): GeoJSON.Feature[] {
  return entries.map(entry => entry.feature);
}

export function getVisibleDrawFeatureCollection(
  entries: DrawPolygonEntry[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: entries.filter(entry => entry.visible).map(entry => entry.feature),
  };
}

export function getDrawPolygonLabel(index: number): string {
  return `Polygon ${index + 1}`;
}

export function toggleDrawPolygonVisibility(
  entries: DrawPolygonEntry[],
  polygonId: string,
): DrawPolygonEntry[] {
  return entries.map(entry =>
    entry.id === polygonId ? { ...entry, visible: !entry.visible } : entry,
  );
}

export function removeDrawPolygon(entries: DrawPolygonEntry[], polygonId: string): DrawPolygonEntry[] {
  return entries.filter(entry => entry.id !== polygonId);
}

export function hasSameDrawFeatureCollection(
  current: GeoJSON.FeatureCollection,
  next: GeoJSON.FeatureCollection,
): boolean {
  if (current.features.length !== next.features.length) return false;

  const currentById = new Map(
    current.features.map(feature => [getDrawFeatureId(feature), feature]),
  );

  return next.features.every(nextFeature => {
    const currentFeature = currentById.get(getDrawFeatureId(nextFeature));
    if (!currentFeature) return false;

    return JSON.stringify(currentFeature.geometry) === JSON.stringify(nextFeature.geometry);
  });
}
