# Observatory terrain

Moon and Mars use measured elevations in the overview, detail, and satellite views to build adaptive spherical terrain meshes. Earth and orbital markers keep their existing rendering paths.

## Data and assets

`npm run terrain:fetch` retrieves the source elevation rasters and 8K reference imagery into `.cache/terrain/`. `npm run terrain:build` prepares the assets in `public/terrain/`. The prepared files are required for deployment and are included by Vite's normal public-directory copy. Source downloads total about 685 MB; the prepared asset directory is about 98 MB, loaded progressively. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and each body's manifest for exact source URLs, hashes, coordinate conventions, and vertical datums.

Both bodies load their base elevation grids and their canonical 8K color maps before the first scene frame. The loading screen remains visible until terrain is ready; there is no temporary image globe. Base-data failures use the existing startup retry UI. Higher resolution 45° × 45° tiles stream around the camera below 0.8 body radii of altitude, with three concurrent requests. Color maps remain unchanged throughout zooming and view switches. Failed detail-tile requests retain the current terrain and retry after 15 seconds; disposal cancels pending requests. Each grid node stores a signed meter elevation. Lossless row deltas reduce download size.

## Rendering and navigation

`src/terrain-data.ts` samples the grids and selects quadtree patches by projected size, proximity, and horizon visibility. Auto, High, and Ultra retain their 160, 224, and 320 patch budgets and their existing screen-space thresholds. Each patch has a 32 × 32 surface grid; refinement stops at the data's 8,192 × 4,096 sampling grid. Distant terrain stays coarse.

`src/terrain-worker.ts` owns fetching, lossless elevation decoding, LOD selection, displaced vertex/normal construction, and transition-source sampling. These jobs run in a dedicated worker per body. Signed meter heights are transferred to the main thread for label placement; geometry buffers are transferred without main-thread decoding or vertex construction. The worker caches up to 640 canonical patch geometries per body. Patch identities include only relevant tile availability, including neighboring boundary blends, so unrelated downloads preserve existing geometry.

`src/terrain.ts` retains unchanged GPU meshes and commits local replacement transactions. Refinement advances at most one quadtree level per transaction (one parent to four children); coarsening replaces covered children atomically. Every intermediate layout covers the globe. The scene shares a four-patch upload allowance across Moon and Mars each frame, including Home transitions. Coarsening is prioritized before refinement to avoid transient patch-budget growth. Uncommitted work is discarded after large camera moves or settings changes; subsequent jobs reference the meshes that actually remain visible.

New vertices start on the previous rendered triangles and morph toward measured elevations and normals over 200 ms on the GPU. Transactions wait for their own source morphs to finish, while unrelated patches can continue refining. Startup roots use the same morph attribute layout so shader compilation includes the actual runtime variant. Culling bounds contain both endpoints. Downward skirts cover mixed-detail edges; missing neighboring elevation tiles blend into the base grid along their boundaries. Source precision, 8K imagery, texture orientation, and final tessellation thresholds are unchanged.

Home pointer picking intersects three body spheres instead of traversing every terrain triangle. Quality presets retain their existing device-pixel-ratio caps; automatic FPS-triggered resolution reductions have been removed.

Zoom buttons scale altitude rather than distance from the world's center. Scroll speed decreases near the surface, near clipping adapts to altitude, and a conservative minimum distance stays above the highest measured terrain. Surface relief in Graphics settings toggles the actual displacement. Place labels project at terrain height.

## Verification

- `npm test`: incremental nonoverlapping globe coverage, bounded replacement groups, local tile invalidation, unchanged-layout reuse, and source datum and coordinate checks against real MOLA/LOLA values, signed interpolation, geometric displacement and winding, shared tile edges/date line, bounded adaptive refinement, and exact refinement start/end positions.
- `npm run build`: TypeScript and production asset build.
- Open `/tests/terrain-rendering.html` on the dev server for GPU checks covering both bodies, real vertex buffers, pixel readback, relief toggling, close-zoom limits, clipping, returning to overview without a sphere fallback, and stable image identity across zoom. The test also checks exact convergence to the existing LOD target, stable GPU geometry identities at rest, bounded uploads, and rapid view/relief changes. A four-color geographic fixture tests texture orientation by GPU pixel readback using the production loader. Append `?renderer=webgl` to exercise the WebGL 2 fallback.


The color loader uses HTML images with one renderer-managed vertical flip on both backends. It never swaps in a pre-flipped ImageBitmap at close range. This removes the former double-flip on WebGPU.

## Current resolution boundary

This is global 3D topography, with about 1.3 km lunar and 2.6 km Martian ground sampling at the equator. The view still uses globe-scale reference color composites; closer zoom cannot recover detail absent from those images. There is no regional LROC NAC / HiRISE stereo terrain, rock/lander geometry, ground-level navigation, or cast terrain shadowing. A further Google Earth–style ground-scale stage requires regional, georeferenced DEM and imagery pyramids with explicit coverage and resolution metadata.
