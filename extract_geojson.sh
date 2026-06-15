echo "Transforming gpkg -> geojson."


if [ -f data/gpkg/kommun-lan-rike_aktuell.gpkg ]; then
  # ogrinfo data/gpkg/kommun-lan-rike_aktuell.gpkg
  ogr2ogr -f GeoJSON -t_srs EPSG:4326 data/geojson/municipalities.geojson data/gpkg/kommun-lan-rike_aktuell.gpkg kommun
  ogr2ogr -f GeoJSON -t_srs EPSG:4326 data/geojson/counties.geojson data/gpkg/kommun-lan-rike_aktuell.gpkg lan
  ogr2ogr -f GeoJSON -t_srs EPSG:4326 data/geojson/state.geojson data/gpkg/kommun-lan-rike_aktuell.gpkg rike
else
  echo "Couldn't create muncipal, county and country jsons."
fi

if [ -f data/gpkg/distrikt.gpkg ]; then
    #ogrinfo data/gpkg/distrikt.gpkg
    ogr2ogr -f GeoJSON -t_srs EPSG:4326 data/geojson/districts.geojson data/gpkg/distrikt.gpkg distrikt
else
  echo "Couldn't create district.json - missing source file."
fi


if [ -f data/gpkg/Tatorter_2023.gpkg ]; then
    #ogrinfo data/gpkg/Tatorter_2023.gpkg
    ogr2ogr -f GeoJSON -t_srs EPSG:4326 data/geojson/urban_areas.geojson data/gpkg/Tatorter_2023.gpkg Tatorter_2023
else
  echo "Couldn't create urban_areas.json - missing source file."
fi
