import { BodyText, SimpleCheckbox, Switch } from "@/components/ui";
import {
  GEO_SEARCH_SHAPE_TYPES,
  GEO_SEARCH_SHAPE_TYPE_KEYS,
  MAX_FILL_OPACITY,
  MIN_FILL_OPACITY,
  MapDisplaySettings,
  areAllShapeTypesEnabled,
} from "../lib/mapDisplaySettings";
import type { GeoSearchShapeTypeKey } from "../lib/mapDisplaySettings";
import { countSelectedShapesByType } from "../lib/shapeTypes";
import type { GeoShapeTypeKey } from "../lib/shapeTypes";
import type { GeoSearchSuggestion } from "../lib/types";
import { ShapeTypeShapeActions } from "./ShapeTypeShapeActions";

interface MapDisplaySettingsPanelProps {
  settings: MapDisplaySettings;
  selectedIds: string[];
  onFillOpacityChange: (value: number) => void;
  onTypeColorChange: (typeKey: GeoShapeTypeKey, color: string) => void;
  onSetShapeTypeEnabled: (typeKey: GeoSearchShapeTypeKey, enabled: boolean) => void;
  onEnableAllShapeTypes: () => void;
  onShowAllChange: (showAll: boolean) => void;
  onAddMany: (suggestions: GeoSearchSuggestion[]) => number;
  onClearType: (shapeType: GeoShapeTypeKey) => number;
  onReset: () => void;
}

export function MapDisplaySettingsPanel({
  settings,
  selectedIds,
  onFillOpacityChange,
  onTypeColorChange,
  onSetShapeTypeEnabled,
  onEnableAllShapeTypes,
  onShowAllChange,
  onAddMany,
  onClearType,
  onReset,
}: MapDisplaySettingsPanelProps) {
  const totalShapeTypeCount = GEO_SEARCH_SHAPE_TYPE_KEYS.length;
  const selectedShapeTypeCount = settings.enabledShapeTypes.length;
  const allShapeTypesEnabled = areAllShapeTypesEnabled(settings.enabledShapeTypes);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <BodyText type="title-small">Settings</BodyText>
        <button type="button" className="text-primary-400 shrink-0 text-xs hover:underline" onClick={onReset}>
          Reset
        </button>
      </div>

      <div className="border-grey-100 divide-grey-100 divide-y rounded-lg border">
        <div className="flex items-center justify-between gap-3 px-2.5 py-2">
          <BodyText type="label-small">Show all</BodyText>
          <Switch checked={settings.showAll} onChange={() => onShowAllChange(!settings.showAll)} type="filled" />
        </div>
        <div className="px-2.5 py-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <BodyText type="label-small">Fill opacity</BodyText>
            <BodyText color="grey-40" type="label-small">
              {Math.round(settings.fillOpacity * 100)}%
            </BodyText>
          </div>
          <input
            type="range"
            min={MIN_FILL_OPACITY}
            max={MAX_FILL_OPACITY}
            step={0.05}
            value={settings.fillOpacity}
            onChange={event => onFillOpacityChange(Number(event.target.value))}
            className="accent-primary-400 w-full cursor-pointer"
          />
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <BodyText type="label-small">Shape types</BodyText>
            {!allShapeTypesEnabled && (
              <BodyText color="grey-40" type="label-small">
                {selectedShapeTypeCount}/{totalShapeTypeCount}
              </BodyText>
            )}
          </div>
          {!allShapeTypesEnabled && (
            <button
              type="button"
              className="text-primary-400 shrink-0 text-xs hover:underline"
              onClick={onEnableAllShapeTypes}
            >
              Select all
            </button>
          )}
        </div>
        <ul className="border-grey-100 divide-grey-100 divide-y rounded-lg border">
          {GEO_SEARCH_SHAPE_TYPES.map(type => {
            const isSearchEnabled = settings.enabledShapeTypes.includes(type.key);
            const onMapCount = countSelectedShapesByType(selectedIds, type.key);

            return (
              <li key={type.key} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5">
                <SimpleCheckbox
                  checked={isSearchEnabled}
                  onClick={checked => onSetShapeTypeEnabled(type.key, checked === true)}
                />
                <span
                  className="h-3 w-3 shrink-0 rounded-full border border-grey-200"
                  style={{ backgroundColor: settings.typeColors[type.key] }}
                />
                <BodyText type="label-small" heading="span" className="min-w-0 flex-1 truncate font-medium">
                  {type.label}
                  {onMapCount > 0 && (
                    <BodyText color="grey-40" type="label-small" heading="span" className="font-normal">
                      {" "}
                      ({onMapCount})
                    </BodyText>
                  )}
                </BodyText>
                <input
                  type="color"
                  value={settings.typeColors[type.key]}
                  onChange={event => onTypeColorChange(type.key, event.target.value)}
                  aria-label={`Color for ${type.label}`}
                  className="border-grey-200 h-6 w-8 shrink-0 cursor-pointer rounded border bg-white p-0"
                />
                <ShapeTypeShapeActions
                    shapeType={type.key}
                    shapeLabel={type.label}
                    selectedIds={selectedIds}
                    showAll={settings.showAll}
                    onMapCount={onMapCount}
                    onAddMany={onAddMany}
                    onClearType={onClearType}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
