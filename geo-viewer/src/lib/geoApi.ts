import axios from "axios";

/** Bare client for absolute S3 GeoJSON URLs (same as marketplace searchSlice). */
const shapeGeoJsonClient = axios.create();

export async function fetchShapeGeoJson(shapeUri: string): Promise<GeoJSON.GeoJSON> {
  const { data: geoInfo } = await shapeGeoJsonClient.get<GeoJSON.GeoJSON>(shapeUri);
  return geoInfo;
}
