python services/landmateriet.py --collection kommun-lan-rike --limit 20 --download-assets
cd lantmateriet_stac_data/assets/aktuell/
unzip -u kommun-lan-rike_aktuell.zip
cd ../../../
mv lantmateriet_stac_data/assets/aktuell/kommun-lan-rike_aktuell.gpkg data/gpkg/
rm -Rf lantmateriet_stac_data
