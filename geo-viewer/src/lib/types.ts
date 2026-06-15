export interface GeoSearchSuggestion {
  hash: string;
  id: string;
  text: string;
  /** S3 URL to gzipped GeoJSON from v4 suggest (`shape_uri`). */
  shapeUri: string;
  parent?: { name: string };
  /** Present for zip3/zip5 suggestions from v4 suggest (`postal_code`). */
  postalCode?: string;
}

export interface SelectedGeoShape {
  id: string;
  hash: string;
  text: string;
  shapeUri: string;
  /** When false, the shape stays in the list but is hidden on the map. */
  visible?: boolean;
  /** 0-based polygon part indices hidden on the map. */
  hiddenFragmentIndices?: number[];
  /** Interior rings removed from rendering (holes filled in). */
  closedHoles?: Array<{ fragmentIndex: number; holeIndex: number }>;
  /** Raw GeoJSON from S3 (Feature, FeatureCollection, or Geometry). */
  geoInfo?: GeoJSON.GeoJSON;
  isLoading?: boolean;
  error?: string;
}
