import { afterEach, describe, expect, it } from "vitest";
import { createGeoJsonShapeGroup } from "./geoJsonShapeGroups";
import {
  clearLoadedGeoJsonDraft,
  loadLoadedGeoJsonDraft,
  saveLoadedGeoJsonDraft,
  LOADED_GEOJSON_DRAFT_STORAGE_KEY,
} from "./loadedGeoJsonDraftStorage";
import {
  getShapeKeysForLoadedFile,
  removeLoadedFileShapesFromGroups,
  type LoadedGeoJsonFile,
} from "./loadedGeoJsonFiles";

const loadedFile: LoadedGeoJsonFile = {
  id: "file-1",
  fileName: "test.geojson",
  geoJson: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        },
      },
    ],
  },
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
    },
  ],
  geometrySummary: { Polygon: 1 },
  visible: true,
};

afterEach(() => {
  clearLoadedGeoJsonDraft();
});

describe("loadedGeoJsonDraftStorage", () => {
  it("saves and loads files with named groups", () => {
    const draft = {
      files: [loadedFile],
      groups: [createGeoJsonShapeGroup("North", ["file-1:0:0"])],
      shapeMetadata: {
        "file-1:0:0": { description: "North district" },
      },
    };
    saveLoadedGeoJsonDraft(draft);

    expect(loadLoadedGeoJsonDraft()).toEqual(draft);
  });

  it("returns an empty draft for invalid stored data", () => {
    localStorage.setItem(LOADED_GEOJSON_DRAFT_STORAGE_KEY, JSON.stringify({ files: [{}] }));
    expect(loadLoadedGeoJsonDraft()).toEqual({ files: [], groups: [], shapeMetadata: {} });
  });

  it("extracts shape keys for every loaded feature", () => {
    expect(getShapeKeysForLoadedFile(loadedFile)).toEqual(["file-1:0:0"]);
  });

  it("removes a loaded file's shapes from existing groups", () => {
    const groups = [createGeoJsonShapeGroup("Existing", ["file-1:0:0"])];
    expect(removeLoadedFileShapesFromGroups(groups, loadedFile)).toEqual([
      { ...groups[0], shapeKeys: [] },
    ]);
  });

  it("clears stored data when both files and groups are empty", () => {
    saveLoadedGeoJsonDraft({
      files: [loadedFile],
      groups: [createGeoJsonShapeGroup("North", ["file-1:0:0"])],
      shapeMetadata: {},
    });
    saveLoadedGeoJsonDraft({ files: [], groups: [], shapeMetadata: {} });
    expect(loadLoadedGeoJsonDraft()).toEqual({ files: [], groups: [], shapeMetadata: {} });
  });
});
