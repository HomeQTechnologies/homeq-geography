import type { Map as MapLibreMap } from "maplibre-gl";

export function configureGeoViewerMapInteractions(map: MapLibreMap): void {
  map.dragRotate.disable();
  map.touchPitch.disable();
  map.dragPan.enable();

  if (map.getPitch() !== 0) {
    map.setPitch(0);
  }
}
