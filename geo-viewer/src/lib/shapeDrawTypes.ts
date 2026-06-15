export const SHAPE_EXPORT_TYPES = [
  { value: "country", label: "Country" },
  { value: "metropolitan_area", label: "Metropolitan area" },
  { value: "county", label: "County (län)" },
  { value: "municipality", label: "Municipality (kommun)" },
  { value: "district", label: "District" },
  { value: "urban_area", label: "Urban area (tätort)" },
  { value: "area", label: "Area (område)" },
] as const;

export type ShapeExportType = (typeof SHAPE_EXPORT_TYPES)[number]["value"];

export interface ShapeDrawMetadata {
  name: string;
  type: ShapeExportType;
  isPublic: boolean;
  notes: string;
}

export function createDefaultShapeDrawMetadata(): ShapeDrawMetadata {
  return {
    name: "",
    type: "area",
    isPublic: false,
    notes: "",
  };
}
