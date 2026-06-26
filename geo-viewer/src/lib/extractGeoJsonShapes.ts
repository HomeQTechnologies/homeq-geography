export interface ExtractedGeoJsonShape {
  featureIndex: number;
  shapeIndex: number;
  geometryType: GeoJSON.Geometry["type"];
  label: string;
  feature: GeoJSON.Feature;
}

function featureFromGeometry(
  geometry: GeoJSON.Geometry,
  properties: GeoJSON.GeoJsonProperties,
): GeoJSON.Feature {
  return {
    type: "Feature",
    properties: { ...properties },
    geometry,
  };
}

function buildShapeLabel(
  featureIndex: number,
  geometryType: GeoJSON.Geometry["type"],
  partLabel?: string,
): string {
  const featureLabel = `Feature ${featureIndex + 1}`;
  if (!partLabel) {
    return `${featureLabel} · ${geometryType}`;
  }

  return `${featureLabel} · ${geometryType} ${partLabel}`;
}

function extractShapesFromGeometry(
  geometry: GeoJSON.Geometry,
  properties: GeoJSON.GeoJsonProperties,
  featureIndex: number,
): ExtractedGeoJsonShape[] {
  switch (geometry.type) {
    case "Point":
    case "LineString":
    case "Polygon":
      return [
        {
          featureIndex,
          shapeIndex: 0,
          geometryType: geometry.type,
          label: buildShapeLabel(featureIndex, geometry.type),
          feature: featureFromGeometry(geometry, properties),
        },
      ];
    case "MultiPoint":
      return geometry.coordinates.map((coordinate, index) => ({
        featureIndex,
        shapeIndex: index,
        geometryType: "Point",
        label: buildShapeLabel(
          featureIndex,
          "Point",
          `${index + 1} of ${geometry.coordinates.length}`,
        ),
        feature: featureFromGeometry({ type: "Point", coordinates: coordinate }, properties),
      }));
    case "MultiLineString":
      return geometry.coordinates.map((coordinates, index) => ({
        featureIndex,
        shapeIndex: index,
        geometryType: "LineString",
        label: buildShapeLabel(
          featureIndex,
          "LineString",
          `${index + 1} of ${geometry.coordinates.length}`,
        ),
        feature: featureFromGeometry({ type: "LineString", coordinates }, properties),
      }));
    case "MultiPolygon":
      return geometry.coordinates.map((coordinates, index) => ({
        featureIndex,
        shapeIndex: index,
        geometryType: "Polygon",
        label: buildShapeLabel(
          featureIndex,
          "Polygon",
          `${index + 1} of ${geometry.coordinates.length}`,
        ),
        feature: featureFromGeometry({ type: "Polygon", coordinates }, properties),
      }));
    case "GeometryCollection": {
      let shapeIndex = 0;
      return geometry.geometries.flatMap(childGeometry => {
        const nestedShapes = extractShapesFromGeometry(childGeometry, properties, featureIndex);
        return nestedShapes.map(shape => {
          const nextShape = {
            ...shape,
            shapeIndex,
          };
          shapeIndex += 1;
          return nextShape;
        });
      });
    }
    default:
      return [];
  }
}

export function extractShapesFromFeature(
  feature: GeoJSON.Feature,
  featureIndex: number,
): ExtractedGeoJsonShape[] {
  if (!feature.geometry) return [];
  return extractShapesFromGeometry(feature.geometry, feature.properties ?? {}, featureIndex);
}

export function extractShapesFromFeatures(features: GeoJSON.Feature[]): ExtractedGeoJsonShape[] {
  return features.flatMap((feature, featureIndex) => extractShapesFromFeature(feature, featureIndex));
}

/** One display entry per Feature — MultiPolygon/GeometryCollection stay intact. */
export function listLoadedGeoJsonFeatures(features: GeoJSON.Feature[]): ExtractedGeoJsonShape[] {
  return features.flatMap((feature, featureIndex) => {
    if (!feature.geometry) return [];

    const label = getDefaultGeoShapeName(feature, buildShapeLabel(featureIndex, feature.geometry.type));

    return [
      {
        featureIndex,
        shapeIndex: 0,
        geometryType: feature.geometry.type,
        label,
        feature: {
          type: "Feature",
          properties: { ...(feature.properties ?? {}) },
          geometry: feature.geometry,
        },
      },
    ];
  });
}

export function sanitizeGeoJsonFileBaseName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.(geojson|json)$/i, "");
  const sanitized = withoutExtension.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  return sanitized.length > 0 ? sanitized : "geojson";
}

export function canCreateGeoShapeFromFeature(feature: GeoJSON.Feature): boolean {
  const geometryType = feature.geometry?.type;
  return geometryType === "Polygon" || geometryType === "MultiPolygon";
}

export function getDefaultGeoShapeName(feature: GeoJSON.Feature, fallbackLabel: string): string {
  const properties = feature.properties;
  if (!properties || typeof properties !== "object") return fallbackLabel;

  const candidates = [
    "name",
    "NAME",
    "title",
    "label",
    "PRIMÄRNAMN",
    "NAMN",
    "individualShapeName",
  ];
  for (const key of candidates) {
    const value = properties[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return fallbackLabel;
}

export function buildExtractedGeoJsonFilename(
  sourceFileName: string,
  shape: ExtractedGeoJsonShape,
  shapeCount: number,
): string {
  const baseName = sanitizeGeoJsonFileBaseName(sourceFileName);
  const featurePart = `-feature-${shape.featureIndex + 1}`;
  const shapePart = shapeCount > 1 ? `-shape-${shape.shapeIndex + 1}` : "";
  return `${baseName}${featurePart}${shapePart}.geojson`;
}
