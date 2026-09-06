# Third-party notices

## Surface place names

Earth populated places: Natural Earth, 1:10m populated places (simple), distributed through the project's maintained GeoJSON repository. Natural Earth data is in the public domain. Coordinates, names, country context, source IDs, and display/population metadata are converted to a compact application catalog.

Source: https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/

Terms: https://www.naturalearthdata.com/about/terms-of-use/

Moon and Mars named features: Gazetteer of Planetary Nomenclature, USGS Astrogeology Science Center and IAU Working Group for Planetary System Nomenclature. Adopted feature names and KML center coordinates are converted from the official named-feature KMZ downloads. Source feature IDs and individual Gazetteer links are preserved; one identical duplicate source row is collapsed. Application zoom tiers and landmark priorities are added for presentation.

Source: https://planetarynames.wr.usgs.gov/GIS_Downloads

Coordinate conventions: https://planetarynames.wr.usgs.gov/Page/Website

Original download URLs, timestamps, and SHA-256 checksums accompany the generated catalog. No endorsement is implied.

## Solar System Scope / INOVE

Earth and Mars maps are by Solar System Scope / INOVE, distributed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

Source: https://www.solarsystemscope.com/textures/

Earth day, night, and packed elevation/roughness/cloud textures are distributed through the Three.js examples. Mars uses the 8K Mars map. The assets in this project are resized/re-encoded as WebP. This is an adaptation; no endorsement is implied.

## NASA Scientific Visualization Studio

Lunar color: CGI Moon Kit, Ernie Wright, NASA Scientific Visualization Studio. Source imagery/elevation from LRO, LROC and LOLA teams.

Source: https://svs.gsfc.nasa.gov/4720/

The 2019 lunar color TIFF is converted to WebP for the Earth–Moon preview. Observatory elevations use the measured terrain sources described below.

## Three.js

The Earth material development references the official WebGPU Earth example. Three.js is distributed under the MIT License:

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Other installed dependencies retain their license files in their distributed packages. DM Sans and Space Grotesk are distributed through Fontsource under the SIL Open Font License.


## satellite.js

Pure JavaScript SGP4 propagation, version 6.0.2. https://github.com/shashwatak/satellite-js

MIT License

Copyright (C) 2013 Shashwat Kandadai, UCSC Jack Baskin School of Engineering

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## Satellite orbit data

CelesTrak GP/OMM: https://celestrak.org/NORAD/documentation/gp-data-formats.php

NASA/JPL Horizons: https://ssd-api.jpl.nasa.gov/doc/horizons.html

The downloaded catalog retains source URLs, object identifiers, reference frames, individual fetch times, and element epochs or coverage windows. Derived display positions are calculated or interpolated; source ephemerides are not spacecraft telemetry.


## Expanded Earth active-satellite catalog

CelesTrak public active-satellite GP/OMM group: https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json

The application redisplays a downloaded snapshot, deduplicated by NORAD ID, with the original name and orbital elements retained. The file includes its source URL, download timestamp, and SHA-256. Orbit classes and colors are application-derived presentation metadata. The active feed includes passive targets and separately cataloged components; it is not a complete debris census or a current operational-status guarantee.

Reference for orbit terminology: ESA, Types of orbits, https://www.esa.int/Enabling_Support/Space_Transportation/Types_of_orbits


## NASA 3D appearance models

Eight original GLB assets are bundled: ISS, Hubble, LRO, MRO, Mars Odyssey, MAVEN, Phobos, and Deimos. Spacecraft models come from [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources) at revision `11ebb4ee043715aefbba6aeec8a61746fad67fa7`. The moon shape models come from NASA Science's [Phobos](https://science.nasa.gov/resource/phobos-mars-moon-3d-model/) and [Deimos](https://science.nasa.gov/resource/deimos-mars-moon-3d-model/) resources.

The source GLBs are retained unmodified. Runtime centering, display scale, inspection lighting, and camera angles are application choices. These are static appearance references, not current spacecraft configurations or attitude telemetry. No NASA endorsement is implied. Exact source URLs, revision, download times, byte lengths, and SHA-256 checksums are recorded in `public/models/manifest.json`.

## Google Draco

The locally served Draco decoder is copied from the installed Three.js distribution and used to decode the NASA model geometry. Copyright 2016 The Draco Authors. Distributed under the Apache License, Version 2.0; the full upstream license and bundled third-party notices are retained in `public/vendor/draco/LICENSE`. Source: https://github.com/google/draco

## Location time zones

Earth coordinate-to-time-zone lookup uses @photostructure/tz-lookup (CC0-1.0): https://github.com/photostructure/tz-lookup. Its compressed boundary data provides approximate IANA zone lookup; boundaries can be imprecise. Civil time and daylight-saving rules are formatted by the browser’s Intl time-zone database. Moon and Mars local solar time comes from the existing Astronomy Engine subsolar geometry.

## HYG star catalog

The orbits background uses HYG v4.1 by David Nash / Astronomy Nexus, compiled from Hipparcos, Yale Bright Star, and Gliese catalogs.

Source: https://github.com/astronexus/HYG-Database/blob/main/hyg/CURRENT/hygdata_v41.csv

License: [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/).

`src/data/stars.json` is an adapted subset, distributed under the same CC BY-SA 4.0 license: 8,920 non-Solar entries with apparent V magnitude ≤ 6.5, retaining HYG ID, J2000 right ascension in hours, declination in degrees, V magnitude, and B−V color index (null when absent). Rebuild with `python3 scripts/build-stars.py /path/to/hygdata_v41.csv`.

Rendering rotates the fixed J2000 coordinates into the orbit scene's J2000 ecliptic frame. Brightness is compressed for display and B−V maps to an approximate color palette. The sky has no proper-motion, parallax, or observer-dependent aberration correction. No endorsement is implied.

## Moon and Mars 3D terrain

- Lunar elevations: NASA LRO / LOLA science team, `LDEM_64`, version 3.1 (2019), [PDS archive and label](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_64.lbl). Source: 23,040 × 11,520 signed little-endian half-meter samples relative to a 1,737.4 km sphere.
- Martian elevations: NASA MGS / MOLA science team, `MEGT90N000FB`, version 2.0 (2003), [PDS archive and label](https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg032/megt90n000fb.lbl). Source: 11,520 × 5,760 signed big-endian meter samples relative to the GMM3 areoid. Cells without observations contain interpolation.
- Observatory color at every zoom level: Solar System Scope / INOVE, [8K Moon and Mars maps](https://www.solarsystemscope.com/textures/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Converted to WebP, quality 94. These reference maps include baked lighting and are not calibrated, shadow-free albedo measurements.
- Derived assets in `public/terrain/`: a 1,024 × 512 base elevation grid and 32 tiles covering an 8,192 × 4,096 grid per body, with inclusive shared edge samples. Source longitudes were shifted from 0–360° E to −180–180° E; elevations were bilinearly resampled, rounded to meters, delta-encoded by row, and losslessly gzip-compressed. Source raster SHA-256 values and datum descriptions are in each `manifest.json`.
- Lunar ground sampling is approximately 1.33 km at the equator; Mars sampling is approximately 2.60 km. Sampling is finer east–west toward the poles; source measurement coverage and interpolation limit actual resolving power. Lunar raw source sampling is about 474 m; Martian source sampling about 1.85 km. The renderer does not invent finer terrain.
- Rendered relief uses measured vertical scale. Lunar radii use the LOLA reference sphere; Martian areoid-relative topography is added to the existing display sphere, not a reconstructed areoid/ellipsoid. Mesh normals follow elevations; terrain does not cast shadows onto other terrain. Edge skirts and temporary coarse-to-fine blends are rendering aids, not geophysical features.

Rebuild with `npm run terrain:fetch` followed by `npm run terrain:build`. Downloads are cached in `.cache/terrain/`; the application serves prepared assets locally and does not contact NASA/PDS at runtime.
