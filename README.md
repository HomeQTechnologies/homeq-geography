
# Geography

This repository gives guidance and scripts for downloading the data we use in our geography system.


## Meshes

In order to provider more granular areas we keep meshes for each municipality. Those meshes divide the municipality
into the smallest subdivisions those municipalities make. We then use that mesh to define each face as a geoshape as well as
composites of those faces as their own geoshape.

For each municipality we use the kommunkod as a prefix to create ids for the area to avoid collisions.
For example "Stockholms Län" has 01 and "Stockholms Municipality" has 0180 - we prefix that with a 1 to make sure we
don't run into issues. Then we reserve 3 digits for each level.

This would lead to 1-01-80-XXXX as a possible identifier for an area in Stockholm Municipality.
So for example "Örby" might get 10180001.



## Shapes

The dataq pipeline for fetching the official shapes looks as follows:

`Fetching data (gpkg) -> Transforming into GEOJSON -> Providing Existing Metadata -> Building Individual Files`  

### Fetching Data

In order to fetch the latest information about country, counties and municipalities you can go to
Landmäteriet and sse their geo-data portal. https://geotorget.lantmateriet.se

You will need login credentials to access the free data via the API - then use [fetch-kommun-riket-lan.sh](fetch-kommun-riket-lan.sh) 
to get the gpkg (geodata) via the API. Note that districts.gpkg is a specific extra file that has to be ordered and 
downloaded without the API.

For urban areas go to SCB's website and download teh latest file containing the urban areas. You can put that into the data/gpkg folder 
so it is included in the ext step.
https://www.scb.se/vara-tjanster/oppna-data/oppna-geodata/statistiska-tatorter/


### Transforming data

The original files we get from Landmäteriet and SCB are provided as gpkg files and need to be transformed into 
usable geojson which then can be integrated into our existing system. You can look at and run [extract_geojson.sh](extract_geojson.sh). 

### Flatten & Enriching

In order to make sure we don't create new hashes every time you have to provide a file that contains the existing
metadata about shapes from the live environment. Simply run a query that exports the data in json format.
```sql
select id, old_id, type, name, hash from shapes
```

Then that file goes into `data/existing/metadata.json`.

## Tiles

This repository also contains code that allows you to create tile maps for different zoom levels
over Sweden. See the respective folder for more details.