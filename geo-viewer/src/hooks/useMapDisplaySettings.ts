import { useCallback, useState } from "react";
import {
  MapDisplaySettings,
  GeoSearchShapeTypeKey,
  GEO_SEARCH_SHAPE_TYPE_KEYS,
  areAllShapeTypesEnabled,
  createDefaultMapDisplaySettings,
  getShapeTypesQueryParam,
  loadMapDisplaySettings,
  saveMapDisplaySettings,
} from "../lib/mapDisplaySettings";
import type { GeoShapeTypeKey } from "../lib/shapeTypes";

export function useMapDisplaySettings() {
  const [settings, setSettings] = useState<MapDisplaySettings>(loadMapDisplaySettings);

  const setFillOpacity = useCallback((fillOpacity: number) => {
    setSettings(prev => {
      const next = { ...prev, fillOpacity };
      saveMapDisplaySettings(next);
      return next;
    });
  }, []);

  const setTypeColor = useCallback((typeKey: GeoShapeTypeKey, color: string) => {
    setSettings(prev => {
      const next = {
        ...prev,
        typeColors: { ...prev.typeColors, [typeKey]: color },
      };
      saveMapDisplaySettings(next);
      return next;
    });
  }, []);

  const setShowAll = useCallback((showAll: boolean) => {
    setSettings(prev => {
      const next = { ...prev, showAll };
      saveMapDisplaySettings(next);
      return next;
    });
  }, []);

  const setShapeTypeEnabled = useCallback((typeKey: GeoSearchShapeTypeKey, enabled: boolean) => {
    setSettings(prev => {
      const isEnabled = prev.enabledShapeTypes.includes(typeKey);
      if (enabled === isEnabled) return prev;

      if (!enabled && prev.enabledShapeTypes.length <= 1) {
        return prev;
      }

      const nextEnabled = enabled
        ? [...prev.enabledShapeTypes, typeKey]
        : prev.enabledShapeTypes.filter(key => key !== typeKey);
      const next = { ...prev, enabledShapeTypes: nextEnabled };
      saveMapDisplaySettings(next);
      return next;
    });
  }, []);

  const enableAllShapeTypes = useCallback(() => {
    setSettings(prev => {
      const next = { ...prev, enabledShapeTypes: [...GEO_SEARCH_SHAPE_TYPE_KEYS] };
      saveMapDisplaySettings(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    const next = createDefaultMapDisplaySettings();
    setSettings(next);
    saveMapDisplaySettings(next);
  }, []);

  const allShapeTypesEnabled = areAllShapeTypesEnabled(settings.enabledShapeTypes);
  const hasPartialShapeTypeSelection = !allShapeTypesEnabled;
  const shapeTypesParam = getShapeTypesQueryParam(settings.enabledShapeTypes);
  const selectedShapeTypeCount = settings.enabledShapeTypes.length;
  const totalShapeTypeCount = GEO_SEARCH_SHAPE_TYPE_KEYS.length;

  return {
    settings,
    allShapeTypesEnabled,
    hasPartialShapeTypeSelection,
    selectedShapeTypeCount,
    totalShapeTypeCount,
    shapeTypesParam,
    setFillOpacity,
    setTypeColor,
    setShowAll,
    setShapeTypeEnabled,
    enableAllShapeTypes,
    resetSettings,
  };
}
