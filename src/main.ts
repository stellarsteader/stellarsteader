import './style.css';
import './satellites.css';
import './map.css';
import './orbits.css';
import { placeLocalTime } from './place-time';
import { LUNAR_CONTEXT_MAGNIFICATION } from './orbit-layout';
import { orbitalReadout, nextOrbitEvents, type OrbitEvent } from './orbit-info';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/space-grotesk';
import { bodies, SceneClock, physicalState, formatDistance, julianDate, type BodyId } from './astronomy';
import { Observatory, type Quality, type View } from './scene';
import { loadSatelliteCatalog, coverage, dataStatus, satellitePosition, type SatelliteCatalog, type Satellite } from './satellites';
import { orbitTypes, orbitInfo, orbitCounts, matchesOrbit, matchesSatelliteSearch, classifyOrbit, orbitMetrics, type OrbitFilter } from './satellite-orbits';
import { SatelliteModelPreview } from './satellite-model-preview';
import { satelliteModels, disposeSatelliteModels } from './satellite-models';
import { loadPlaces, mapLevels, type PlaceCatalog, type Place, type MapFrame } from './surface-map';

const icons = {
  arrow: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  diagonal: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 18 18 6M6 6h12v12"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none"><path d="m9.5 3-.6 2.1-1.7 1-2.1-.5-2.5 4.3 1.5 1.6v2L2.6 15l2.5 4.3 2.1-.5 1.7 1 .6 2.2h5l.6-2.2 1.7-1 2.1.5 2.5-4.3-1.5-1.5v-2l1.5-1.6-2.5-4.3-2.1.5-1.7-1L14.5 3Z"/><circle cx="12" cy="12.5" r="3"/></svg>',
  orbit: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="11" ry="5" transform="rotate(-35 12 12)"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none"><path d="m6 6 12 12M6 18 18 6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none"><path d="M19 12H5m6-6-6 6 6 6"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="none"><path d="M9 5v14M15 5v14"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none"><path d="m8 5 11 7-11 7V5Z"/></svg>',
  lighting: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none"><path d="M2 19h20M5 15a7 7 0 0 1 14 0M12 2v3M3 6l2 2m16-2-2 2M1 13h3m16 0h3"/></svg>',
  reset: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/></svg>',
};

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="observatory" data-view="overview">
    <div id="scene" class="scene" aria-busy="true"></div>
    <div class="screen-vignette" aria-hidden="true"></div>
    <div class="orbit-labels" hidden>${['earth', 'moon', 'mars'].map(id => `<button class="orbit-label" data-marker="${id}">${id.toUpperCase()}<span>${icons.diagonal}</span></button>`).join('')}<span class="orbit-label" data-marker="center">SUN</span></div>
    <header class="masthead">
      <button class="brand" id="home" aria-label="Stellar Steader overview">
        <span class="brand-symbol">${icons.orbit}</span><span>STELLAR<span class="brand-light">STEADER</span></span>
      </button>
      <nav class="main-nav" aria-label="View">
        <button class="nav-button active" id="nav-observatory" aria-pressed="true">Observatory</button>
        <button class="nav-button" id="nav-satellites" aria-pressed="false">Satellites</button>
        <button class="nav-button" id="nav-orbits" aria-pressed="false">Orbits <span class="nav-arrow">↗</span></button>
      </nav>
      <div class="header-actions"><div class="presentation-controls" role="group" aria-label="Scene appearance">
        <button class="icon-button" data-rotation-toggle aria-label="Pause rotation" title="Pause rotation">${icons.pause}</button>
        <button class="icon-button" data-shadow-toggle aria-label="Remove shadows" title="Remove shadows" aria-pressed="false">${icons.lighting}</button>
      </div><button id="settings" class="icon-button" aria-label="Graphics settings" aria-haspopup="dialog" aria-controls="settings-dialog" aria-expanded="false">${icons.settings}</button></div>
    </header>

    <main>
      <section class="overview-heading" aria-labelledby="overview-title">
        <h1 id="overview-title">Be the one to claim new territories in space.<br>Support or get supported.</h1>
      </section>

      <section class="detail-heading" aria-labelledby="detail-title" hidden>
        <button class="text-button back-button" id="back">${icons.back} All worlds</button>
        <h1 id="detail-title">Earth<span>.</span></h1>
        <div class="detail-facts">
          <div><span>MEAN DIAMETER</span><strong id="fact-diameter">12,742 <small>km</small></strong></div>
          <div><span>SIDEREAL ROTATION</span><strong id="fact-day">23h 56m</strong></div>
          <div><span id="fact-distance-label">FROM THE SUN</span><strong id="fact-distance">—</strong></div>
        </div>
        <div class="detail-actions"><button class="primary-button satellite-entry" id="detail-satellites">${icons.orbit} Satellites & moons ${icons.arrow}</button>
        <button class="secondary-button" id="detail-orbit">Explore orbit ${icons.diagonal}</button></div>
      </section>

      <button id="show-map" class="map-toggle" aria-expanded="false" aria-controls="map-panel" hidden>${icons.map}<span>Show map</span></button>
      <aside id="map-panel" class="map-panel" aria-label="Map locations" hidden>
        <section class="place-detail" id="selected-place" hidden aria-labelledby="selected-place-name"><button id="close-place-detail" class="place-detail-close" aria-label="Close location details" title="Close location details">${icons.close}</button><p class="map-section-title">Selected location</p><h3 id="selected-place-name"></h3><p id="selected-place-type"></p><p id="selected-place-coordinates"></p><p id="selected-place-diameter"></p><div class="place-local-time" id="selected-place-clock"><span id="selected-place-time-label">Local time</span><strong id="selected-place-time"></strong><small id="selected-place-date"></small></div><button id="refocus-place" class="secondary-button">Fly to location ${icons.arrow}</button><a id="place-source" target="_blank" rel="noopener">Source record ↗</a></section>
        <div class="map-list-panel">
        <label class="map-search"><input id="place-search" type="search" aria-label="Search places" placeholder="Search this world…" autocomplete="off" /></label>
        <section id="place-search-results" hidden aria-label="Search results"><p class="map-section-title" id="search-count"></p><div id="place-results" class="place-list"></div></section>
        <section class="map-visible"><div class="map-section-title"><span id="in-view-count">In view</span><span id="map-level">Global</span></div><p class="map-hint" id="map-hint">Loading place names…</p><div id="visible-places" class="place-list" aria-label="Places labeled in the current view"></div></section>
        <button id="retry-places" class="text-button" hidden>Retry place data</button>
        </div>
      </aside>

      <section class="satellite-panel" hidden aria-label="Satellite catalog">
        <button class="text-button" id="satellite-back">${icons.back} Back to world</button>
        <div class="satellite-worlds" aria-label="Satellite system">${(['earth', 'moon', 'mars'] as BodyId[]).map(id => `<button data-system="${id}" aria-pressed="false">${bodies[id].name}</button>`).join('')}</div>
        <div id="earth-catalog-controls" hidden>
          <div class="satellite-total"><strong id="satellite-total">—</strong><span id="satellite-total-label">active satellites</span></div>
          <p id="earth-catalog-stamp" class="catalog-stamp"></p>
          <div class="orbit-filters" id="earth-orbit-filters" aria-label="Earth orbit type"></div>
          <p id="orbit-filter-description" class="orbit-filter-description"></p>
          <label class="satellite-search"><input id="satellite-search" type="search" aria-label="Satellite name or NORAD ID" placeholder="Satellite name or NORAD ID" autocomplete="off"></label>
          <p id="satellite-render-error" class="catalog-stamp" role="status" hidden></p>
        </div>
        <div id="satellite-list" class="satellite-list" aria-label="Satellites"><p>Loading orbital data…</p></div>
        <div id="satellite-pagination" class="satellite-pagination" hidden><button id="satellite-previous" aria-label="Previous satellite page">←</button><span id="satellite-page"></span><button id="satellite-next" aria-label="Next satellite page">→</button></div>
        <button id="satellite-retry" class="text-button" hidden>Retry data loading</button>
      </section>
      <aside class="satellite-inspector" id="satellite-inspector" hidden aria-labelledby="satellite-selected-name">
          <div class="satellite-inspector-heading"><h2 id="satellite-selected-name"></h2><button id="close-satellite-inspector" class="icon-button" aria-label="Close satellite details">${icons.close}</button></div><p id="satellite-orbit-metrics" class="catalog-stamp"></p>
          <section class="satellite-model-section" id="satellite-model-section" hidden aria-label="Satellite 3D model">
            <div id="satellite-model-host" class="satellite-model-host"><div id="satellite-model-canvas" class="satellite-model-canvas"></div></div>
            <p id="satellite-model-status" class="model-status" role="status"></p>
            <div class="model-actions"><button id="expand-satellite-model" class="text-button" hidden>Enlarge model ${icons.diagonal}</button><a id="satellite-model-source" target="_blank" rel="noopener">Model source ↗</a></div>
          </section>
          <p id="satellite-status" class="satellite-status"></p>
          <div class="satellite-metrics"><div><span>ALTITUDE¹</span><strong id="satellite-altitude">—</strong></div><div><span>PATH WINDOW²</span><strong id="satellite-period">—</strong></div></div>
          <p class="satellite-coverage" id="satellite-coverage"></p>
          <button class="primary-button" id="satellite-epoch" hidden>View available epoch ${icons.arrow}</button>
          <a id="satellite-source" target="_blank" rel="noopener">View source data ↗</a>
      </aside>
      <div class="satellite-caption" hidden><p>¹ Above mean radius. ² Approximate orbit-length interval; open sampled path.</p></div>

      <section class="orbit-heading" hidden aria-labelledby="orbit-title">
        <h1 id="orbit-title">Earth’s orbit</h1>
        <div class="orbit-pills" aria-label="Orbit selection">
          <button data-orbit="earth" class="active" aria-pressed="true">Earth</button><button data-orbit="moon" aria-pressed="false">Moon</button><button data-orbit="mars" aria-pressed="false">Mars</button>
        </div>
      </section>

      <div class="coordinate-readout" aria-hidden="true" hidden><span>SUN OVER THE SURFACE</span><span id="coord-bottom"></span></div>
      <div class="view-tools" hidden>
        <button class="icon-button" id="zoom-in" aria-label="Zoom in">+</button><button class="icon-button" id="zoom-out" aria-label="Zoom out">−</button><span></span><button class="icon-button" id="reset-camera" aria-label="Reset camera">${icons.reset}</button>
      </div>
      <button class="dawn-button" id="follow-dawn" hidden>${icons.sun}<span>Follow sunrise</span></button>
      <div class="orbit-caption" hidden><p>Drag to rotate · scroll to zoom</p><p id="orbit-scale-note">Orbital distances to scale. Worlds enlarged for visibility.</p></div>
      <aside id="orbit-info" class="orbit-info" hidden aria-labelledby="orbit-info-title">
        <h2 id="orbit-info-title">Earth → Sun</h2>
        <dl class="orbit-live-metrics">
          <div><dt id="orbit-distance-label">Distance from Sun</dt><dd id="orbit-distance">—</dd></div>
          <div><dt>Orbital speed</dt><dd id="orbit-speed">—</dd></div>
        </dl>
        <dl class="orbit-facts">
          <div><dt>Distance change</dt><dd id="orbit-radial">—</dd></div>
          <div><dt>Orbital period</dt><dd id="orbit-duration">—</dd></div>
          <div><dt>Tilt to ecliptic</dt><dd id="orbit-inclination">—</dd></div>
        </dl>
        <section class="orbit-events" aria-labelledby="orbit-events-title"><h3 id="orbit-events-title">Next orbital extremes</h3><div id="orbit-events"></div></section>
        <details class="orbit-method"><summary>About these numbers</summary><p>Calculated at the UTC scene time below. Distances are center to center; speed is relative to the Sun for Earth and Mars, and to Earth for the Moon. Tilt uses the instantaneous orbital plane relative to the J2000 ecliptic. Period is a nominal sidereal value. Lines show closed two-body orbit guides derived from the current position and velocity, refreshed as scene time advances. Actual future trajectories can deviate as the orbital plane and shape change.</p><a href="https://github.com/cosinekitty/astronomy/blob/master/source/js/README.md" target="_blank" rel="noopener">Astronomy Engine source ↗</a></details>
      </aside>

      <section class="world-picker" aria-label="Choose a world">
        ${(['earth', 'moon', 'mars'] as BodyId[]).map(id => `
          <button class="world-card" data-world="${id}" style="--world-color:${bodies[id].color}" aria-label="Explore ${bodies[id].name}">
            <div class="world-name-row"><h2>${bodies[id].name}<span>.</span></h2><span class="world-subtitle">${bodies[id].subtitle}</span><span class="world-arrow" aria-hidden="true">${icons.diagonal}</span></div>
          </button>`).join('')}
      </section>
      <div class="detail-switcher" hidden aria-label="Switch world">${(['earth', 'moon', 'mars'] as BodyId[]).map(id => `<button data-switch="${id}"><i style="background:${bodies[id].color}"></i>${bodies[id].name}</button>`).join('')}</div>
    </main>
    <div class="satellite-labels" hidden></div>
    <div id="place-labels" class="place-labels" hidden></div>

    <footer class="instrument-bar">
      <div class="time-controls"><button id="live" class="icon-button small" aria-label="Return to current time" title="Return to current time" hidden>${icons.reset}</button><span class="clock-date" id="clock-date">—</span><time id="clock-time">— UTC</time><button id="pause" class="icon-button small" aria-label="Pause time">${icons.pause}</button><select id="time-speed" aria-label="Simulation speed"><option value="1">1×</option><option value="60">60×</option><option value="3600">3600×</option></select></div>
      <div class="instrument-right"><span class="frame-label" id="frame-label">COMPOSED VIEW</span><button id="sources" class="text-button">Data & credits <span>↗</span></button></div>
    </footer>
    <div class="loading-overlay" id="loading" role="status"><div class="loading-symbol">${icons.orbit}</div><p id="loading-text">Opening the observatory</p><div class="loading-track"><span id="loading-progress"></span></div><small>EARTH / MOON / MARS</small></div>
    <div class="error-overlay" id="error" hidden role="alert"><span class="eyebrow">RENDERING UNAVAILABLE</span><h2>We couldn’t open this window.</h2><p id="error-text"></p><button class="primary-button" id="retry">Try again ${icons.arrow}</button></div>
    <div class="toast" id="toast" role="status"></div>
  </div>

  <dialog id="settings-dialog" class="panel-dialog" aria-labelledby="settings-title">
    <div class="dialog-heading"><h2 id="settings-title">Graphics settings</h2><button class="icon-button close-dialog" aria-label="Close graphics settings">${icons.close}</button></div>
    <label class="setting-row" for="quality"><span>Graphics quality<small>Resolution & surface geometry</small></span><select id="quality"><option value="auto">Auto</option><option value="high">High</option><option value="ultra">Ultra</option></select></label>
    <label class="setting-row"><span>Atmospheres<small>Earth scattering & Martian haze</small></span><input type="checkbox" data-layer="atmosphere" checked></label>
    <label class="setting-row"><span>Clouds<small>Earth reference cloud layer</small></span><input type="checkbox" data-layer="clouds" checked></label>
    <label class="setting-row"><span>Surface relief<small>Earth & lunar normal detail</small></span><input type="checkbox" data-layer="relief" checked></label>
    <label class="setting-row"><span>Coordinate grid<small>30° latitude & longitude intervals</small></span><input type="checkbox" data-layer="grid"></label>
    <div class="render-stats"><span id="stats-backend">—</span><span id="stats-fps">— FPS</span><span id="stats-resolution">—</span></div>
  </dialog>

  <dialog id="satellite-model-dialog" class="model-dialog" aria-labelledby="model-dialog-title">
    <div class="dialog-heading"><h2 id="model-dialog-title">3D model</h2><div class="model-appearance-controls">
      <button class="icon-button" data-rotation-toggle aria-label="Pause rotation" title="Pause rotation">${icons.pause}</button>
      <button class="icon-button" data-shadow-toggle aria-label="Remove shadows" title="Remove shadows" aria-pressed="false">${icons.lighting}</button>
      <button class="icon-button close-dialog" aria-label="Close 3D model">${icons.close}</button></div></div>
    <div id="expanded-model-host"></div>
  </dialog>
  <dialog id="sources-dialog" class="panel-dialog sources-dialog">
    <div class="dialog-heading"><div><p class="eyebrow">BEHIND THE VIEW</p><h2>Data & credits.</h2></div><button class="icon-button close-dialog" aria-label="Close data and credits">${icons.close}</button></div>
    <p class="panel-description">Current astronomical geometry, archival surfaces, and continuously rendered light.</p>
    <div class="source-entry"><h3>Scene time</h3><p>Julian Date is a continuous count of days used in astronomy. This value follows the scene clock, expressed in UTC.</p><p>Julian Date: <span id="scene-julian-date"></span> (UTC)</p></div>
    <div class="source-entry"><h3>Surface place names</h3><p>Earth cities come from Natural Earth. Lunar and Martian features use the USGS/IAU Gazetteer of Planetary Nomenclature, with positive-east, planetocentric coordinates from its KML exports. Display priority uses city prominence or feature diameter. Labels identify feature centers; they do not outline parcels or funding areas. Imagery remains the existing globe-level reference maps.</p><a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener">Natural Earth ↗</a> · <a href="https://planetarynames.wr.usgs.gov/GIS_Downloads" target="_blank" rel="noopener">USGS / IAU ↗</a></div>
    <div class="source-entry"><span class="source-tag calculated">SATELLITES & NATURAL MOONS</span><h3>Measured orbit inputs, calculated positions</h3><p>Earth uses a bundled snapshot of CelesTrak’s public active-satellite GP catalog and satellite.js SGP4. The total counts unique NORAD records in this snapshot, not every artificial object in orbit. This is not a debris or rocket-body census. The feed includes passive targets, separately cataloged station components, and some combined payload/rocket-body records; objects without public elements are absent. The rendered count excludes missing or invalid positions and includes markers behind Earth or outside the camera view. Only the selected Earth satellite has a name label and orbit path. Eight bundled NASA appearance models replace selected markers when available, with an interactive close-up in the inspector. Model size is enlarged and orientation is illustrative; the orbit feed contains no spacecraft attitude telemetry. TEME coordinates are converted through Earth-fixed coordinates into the globe frame; polar motion is omitted. Lunar and Martian trajectories use JPL Horizons body-centered ICRF position and velocity samples, interpolated only inside their UTC coverage. MAVEN has a separately labeled historical window. Objects without an included model use enlarged identification markers. Moon and Mars remain selected mission catalogs. Catalog membership does not guarantee current mission health.</p><a href="https://celestrak.org/NORAD/documentation/gp-data-formats.php" target="_blank" rel="noopener">CelesTrak GP ↗</a> · <a href="https://ssd-api.jpl.nasa.gov/doc/horizons.html" target="_blank" rel="noopener">JPL Horizons ↗</a></div>
    <div class="source-entry"><h3>Earth orbit filters</h3><p>Display classes are derived from mean elements using a 6,371 km Earth radius. LEO: apogee below 2,000 km. MEO: perigee at least 2,000 km and apogee below 35,786 km. Geosynchronous: period within 15 minutes of 1,436.068 minutes; GEO is its nearly equatorial (inclination below 5°), nearly circular (eccentricity below 0.01) subset. GSO shows the remaining geosynchronous objects. HEO means highly elliptical here (eccentricity at least 0.25), excluding geosynchronous objects. Other includes boundary-crossing, transfer, and high orbits. These mutually exclusive visualization classes are approximate, not an operational classification. Polar and Sun-synchronous describe orientation and are not separate altitude classes.</p><a href="https://www.esa.int/Enabling_Support/Space_Transportation/Types_of_orbits" target="_blank" rel="noopener">ESA orbit guide ↗</a></div>
    <div class="source-entry"><span class="source-tag calculated">CALCULATED AT SCENE TIME</span><h3>Positions, rotation & sunlight</h3><p>Astronomy Engine calculates planetary positions and IAU body orientations locally. Planetary orbit lines are closed, instantaneous two-body guides derived from position and velocity; markers follow the calculated ephemeris. These are modeled ephemerides, not live spacecraft telemetry.</p><a href="https://github.com/cosinekitty/astronomy" target="_blank" rel="noopener">Astronomy Engine ↗</a></div>
    <div class="source-entry"><span class="source-tag">REFERENCE IMAGERY</span><h3>Earth & Mars surfaces</h3><p>Solar System Scope / INOVE maps, based on NASA data, under CC BY 4.0. Earth assets are distributed through the Three.js Earth example. Maps were resized and converted to WebP. Cloud coverage and night lights are reference composites; cloud drift is illustrative. Slow viewing rotation is independent of scene time. The shadow toggle offers a fully lit inspection view. Mars haze is an artistic atmospheric model.</p><a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noopener">Solar System Scope ↗</a></div>
    <div class="source-entry"><span class="source-tag">NASA / LRO</span><h3>Lunar color & elevation</h3><p>NASA Scientific Visualization Studio CGI Moon Kit. LROC color and LOLA elevation, assembled by Ernie Wright. The 2019 color map is optimized for visual rendering. Elevation is normalized for surface shading.</p><a href="https://svs.gsfc.nasa.gov/4720/" target="_blank" rel="noopener">NASA CGI Moon Kit ↗</a></div>
    <div class="source-entry"><span class="source-tag">RENDERING</span><h3>Made of light and code</h3><p>Three.js WebGPU, custom TSL materials and a single-scattering atmosphere shader. The landing view composes three independent viewing frames. Relative sizes and separations are artistic; each body retains its calculated relationship to the Sun. Surface close-ups are globe-level maps, not streamed ground terrain.</p><a href="https://threejs.org/examples/webgpu_tsl_earth.html" target="_blank" rel="noopener">Three.js Earth reference ↗</a></div>
  </dialog>
`;

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const clock = new SceneClock();
let observatory: Observatory | undefined;
let currentView: View = 'overview', currentBody: BodyId = 'earth';
let ready = false;
let satelliteCatalog: SatelliteCatalog | undefined;
let satelliteError = '';
let modelPreview: SatelliteModelPreview | undefined;
let satelliteInspectorOpen = true;
let orbitEventCache: { body: BodyId; start: number; events: OrbitEvent[] } | undefined;
let earthOrbitFilter: OrbitFilter = 'all', satellitePage = 0;
let satelliteListItems: Satellite[] = [], satellitePageItems: Satellite[] = [];
const satellitePageSize = 50;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
let placeCatalog: PlaceCatalog | undefined;
let mapOpen = true, placesError = '', mapListKey = '';
let selectedPlace: Place | undefined;
let mapBody: BodyId | undefined;

function navigate(view: View, body: BodyId = currentBody, history = true) {
  if (!ready) return;
  if (view === 'satellites') satelliteInspectorOpen = true;
  currentView = view; currentBody = body;
  $('.observatory').dataset.satelliteBody = body;
  observatory!.setView(view, body);
  $('.observatory').dataset.view = view;
  $('.overview-heading').hidden = view !== 'overview';
  $('.world-picker').hidden = view !== 'overview';
  $('.detail-heading').hidden = view !== 'detail';
  $('#show-map').hidden = view !== 'detail';
  $('.observatory').dataset.mapOpen = String(mapOpen);
  $('#show-map').setAttribute('aria-expanded', String(mapOpen));
  $('#show-map span').textContent = mapOpen ? 'Hide map' : 'Show map';
  $('#map-panel').hidden = view !== 'detail' || !mapOpen;
  $('#place-labels').hidden = view !== 'detail' || !mapOpen;
  observatory!.setMapEnabled(mapOpen && view === 'detail');
  if (view === 'detail') {
    if (mapBody !== body) { selectedPlace = undefined; observatory!.surfaceMap.selected = ''; $('#selected-place').hidden = true; $<HTMLInputElement>('#place-search').value = ''; }
    mapBody = body; mapListKey = ''; $('#visible-places').innerHTML = ''; $('#place-labels').innerHTML = '';
    updateMapCatalog();
  }
  $('.coordinate-readout').hidden = view !== 'detail';
  $('.satellite-panel').hidden = view !== 'satellites';
  $('#satellite-inspector').hidden = view !== 'satellites';
  if (view !== 'satellites') { modelPreview?.setActive(false); $<HTMLDialogElement>('#satellite-model-dialog').close(); }
  $('.satellite-caption').hidden = view !== 'satellites';
  $('.satellite-labels').hidden = view !== 'satellites';
  $('.orbit-heading').hidden = view !== 'orbit';
  $('#orbit-info').hidden = view !== 'orbit';
  $('.orbit-caption').hidden = view !== 'orbit';
  $('#orbit-scale-note').textContent = body === 'earth' ? `Moon’s orbit enlarged ${LUNAR_CONTEXT_MAGNIFICATION}×. Worlds enlarged for visibility.` : 'Orbital distances to scale. Worlds enlarged for visibility.';
  $('.orbit-labels').hidden = view !== 'orbit';
  $('[data-marker="center"]').innerHTML = body === 'moon' ? 'EARTH' : 'SUN';
  $('.view-tools').hidden = view === 'overview';
  $('.presentation-controls').hidden = view === 'orbit';
  updateAppearanceControls();
  $('.detail-switcher').hidden = view !== 'detail';
  $('#follow-dawn').hidden = view !== 'detail';
  $('#nav-observatory').classList.toggle('active', view === 'overview' || view === 'detail');
  $('#nav-orbits').classList.toggle('active', view === 'orbit');
  $('#nav-observatory').setAttribute('aria-pressed', String(view === 'overview' || view === 'detail'));
  $('#nav-orbits').setAttribute('aria-pressed', String(view === 'orbit'));
  $('#nav-satellites').classList.toggle('active', view === 'satellites');
  $('#nav-satellites').setAttribute('aria-pressed', String(view === 'satellites'));
  $('[data-view]').style.setProperty('--selected-color', bodies[body].color);
  $('#detail-title').innerHTML = `${bodies[body].name}<span>.</span>`;
  $('#fact-diameter').innerHTML = `${bodies[body].diameter} <small>km</small>`;
  $('#fact-day').textContent = bodies[body].day;
  $('#fact-distance-label').textContent = bodies[body].distanceLabel;
  $('#frame-label').hidden = view === 'detail';
  $('#frame-label').textContent = view === 'overview' ? 'COMPOSED VIEW' : view === 'detail' ? '' : 'CALCULATED EPHEMERIS';
  if (view === 'satellites') { $('#frame-label').textContent = body === 'earth' ? 'BODY-CENTERED / ACTIVE CATALOG' : 'BODY-CENTERED / SELECTED CATALOG'; satellitePage = 0; renderSatellitePanel(); }
  $('#orbit-title').textContent = `${bodies[body].name}’s orbit`;
  $('#follow-dawn').classList.remove('active');
  document.querySelectorAll<HTMLButtonElement>('[data-switch], [data-orbit]').forEach(button => {
    const active = (button.dataset.switch ?? button.dataset.orbit) === body;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  if (history) window.history.pushState(null, '', view === 'overview' ? location.pathname : `#${view === 'orbit' || view === 'satellites' ? view + '/' : ''}${body}`);
  updateReadouts();
}

function readHash() {
  const value = location.hash.slice(1).split('/');
  const id = value.at(-1) as BodyId;
  if (id in bodies) navigate(value[0] === 'orbit' ? 'orbit' : value[0] === 'satellites' ? 'satellites' : 'detail', id, false);
  else navigate('overview', 'earth', false);
}

function updateReadouts() {
  const date = clock.now();
  if (currentView === 'satellites') updateSatelliteReadout(date);
  if (currentView === 'orbit') updateOrbitReadout(date);
  $('#clock-date').textContent = date.toISOString().slice(0, 10).replaceAll('-', '.');
  $('#clock-time').textContent = `${date.toISOString().slice(11, 19)} UTC`;
  $('#clock-time').setAttribute('datetime', date.toISOString());
  $('#live').hidden = clock.live;
  $('#pause').innerHTML = clock.rate === 0 ? icons.play : icons.pause;
  $('#pause').setAttribute('aria-label', clock.rate === 0 ? 'Resume time' : 'Pause time');
  $('#scene-julian-date').textContent = julianDate(date).toFixed(5);
  if (currentView === 'detail') {
    const state = physicalState(currentBody, date);
    updatePlaceTime(date, state.subsolarLongitude);
    $('#fact-distance').textContent = formatDistance(currentBody, state.distance);
    $('#coord-bottom').textContent = `${Math.abs(state.subsolarLatitude).toFixed(2)}° ${state.subsolarLatitude < 0 ? 'S' : 'N'} / ${Math.abs(state.subsolarLongitude).toFixed(2)}° ${state.subsolarLongitude < 0 ? 'W' : 'E'}`;
  }
}

function updatePlaceTime(date: Date, subsolarLongitude?: number) {
  if (!selectedPlace || selectedPlace.body !== currentBody || currentView !== 'detail') return;
  const local = placeLocalTime(selectedPlace, date, subsolarLongitude);
  $('#selected-place-time-label').textContent = local.label;
  $('#selected-place-time').textContent = local.time;
  $('#selected-place-date').textContent = local.detail;
  $('#selected-place-clock').title = local.description;
}

function updateOrbitReadout(date: Date) {
  const state = orbitalReadout(currentBody, date);
  $('#orbit-info-title').textContent = `${bodies[currentBody].name} → ${state.primary}`;
  $('#orbit-distance-label').textContent = `Distance from ${state.primary}`;
  $('#orbit-distance').textContent = formatDistance(currentBody, state.distanceKm);
  $('#orbit-speed').textContent = `${state.speedKmS.toFixed(3)} km/s`;
  $('#orbit-radial').textContent = `${Math.abs(state.radialKmS).toFixed(3)} km/s ${state.radialKmS < 0 ? 'closer' : 'farther'}`;
  $('#orbit-duration').textContent = `${state.periodDays.toFixed(3)} Earth days`;
  $('#orbit-inclination').textContent = `${state.inclinationDeg.toFixed(3)}°`;
  const time = date.getTime();
  // Reuse event searches through playback until the first event has passed.
  if (!orbitEventCache || orbitEventCache.body !== currentBody || time < orbitEventCache.start || time > orbitEventCache.events[0].time + 60000) {
    orbitEventCache = { body: currentBody, start: time, events: nextOrbitEvents(currentBody, date) };
    $('#orbit-events').innerHTML = orbitEventCache.events.map((event, index) => `<button class="orbit-event" data-orbit-event="${index}" aria-label="Jump to ${event.name}"><span class="orbit-event-title">${event.kind === 'closest' ? 'Closest to' : 'Farthest from'} ${state.primary}<small>${event.name}</small></span><time datetime="${new Date(event.time).toISOString()}">${new Date(event.time).toISOString().slice(0,16).replace('T',' ')} UTC</time><span class="orbit-event-bottom"><span>${formatDistance(currentBody,event.distanceKm)}</span><span>View ${icons.arrow}</span></span></button>`).join('');
  }
}
$('#orbit-events').onclick = event => {
  const button = (event.target as HTMLElement).closest<HTMLElement>('[data-orbit-event]');
  const selected = button && orbitEventCache?.events[Number(button.dataset.orbitEvent)];
  if (!selected) return;
  clock.setDate(new Date(selected.time)); clock.setRate(0);
  $<HTMLSelectElement>('#time-speed').value = '1';
  observatory?.setView('orbit', currentBody, false);
  updateReadouts();
};

$('#home').onclick = () => navigate('overview');
$('#back').onclick = () => navigate('overview');
$('#nav-observatory').onclick = () => navigate('overview');
$('#nav-orbits').onclick = () => navigate('orbit');
$('#detail-orbit').onclick = () => navigate('orbit');
$('#nav-satellites').onclick = () => navigate('satellites');
$('#detail-satellites').onclick = () => navigate('satellites');
$('#show-map').onclick = () => toggleMap(!mapOpen);
$('#satellite-back').onclick = () => navigate('detail');
document.querySelectorAll<HTMLButtonElement>('[data-system]').forEach(button => button.onclick = () => navigate('satellites', button.dataset.system as BodyId));
document.querySelectorAll<HTMLButtonElement>('[data-world], [data-switch]').forEach(button => button.onclick = () => navigate('detail', (button.dataset.world ?? button.dataset.switch) as BodyId));
document.querySelectorAll<HTMLButtonElement>('[data-orbit]').forEach(button => button.onclick = () => navigate('orbit', button.dataset.orbit as BodyId));
document.querySelectorAll<HTMLButtonElement>('[data-marker]').forEach(button => button.onclick = () => { const id = button.dataset.marker; if (id !== 'center') navigate('orbit', id as BodyId); else if (currentBody === 'moon') navigate('detail', 'earth'); });
function updateAppearanceControls() {
  document.querySelectorAll<HTMLButtonElement>('[data-rotation-toggle]').forEach(button => {
    const label = observatory?.rotationEnabled ? 'Pause rotation' : 'Resume rotation';
    button.innerHTML = observatory?.rotationEnabled ? icons.pause : icons.play;
    button.setAttribute('aria-label', label); button.title = label;
  });
  document.querySelectorAll<HTMLButtonElement>('[data-shadow-toggle]').forEach(button => {
    const label = observatory?.shadowsEnabled ? 'Remove shadows' : 'Restore shadows';
    button.setAttribute('aria-label', label); button.title = label;
    button.setAttribute('aria-pressed', String(!observatory?.shadowsEnabled));
  });
}
document.querySelectorAll<HTMLButtonElement>('[data-rotation-toggle]').forEach(button => button.onclick = () => {
  if (!observatory) return;
  observatory.setRotationEnabled(!observatory.rotationEnabled);
  if (observatory.rotationEnabled) $('#follow-dawn').classList.remove('active');
  if (modelPreview) modelPreview.rotationEnabled = observatory.rotationEnabled;
  updateAppearanceControls();
});
document.querySelectorAll<HTMLButtonElement>('[data-shadow-toggle]').forEach(button => button.onclick = () => {
  if (!observatory) return;
  observatory.setShadowsEnabled(!observatory.shadowsEnabled);
  modelPreview?.setShadowsEnabled(observatory.shadowsEnabled);
  updateAppearanceControls();
});
$('#zoom-in').onclick = () => observatory?.zoom(1);
$('#zoom-out').onclick = () => observatory?.zoom(-1);
$('#reset-camera').onclick = () => { observatory?.setView(currentView, currentBody); $('#follow-dawn').classList.remove('active'); };
$('#follow-dawn').onclick = () => { observatory?.followSunrise(); $('#follow-dawn').classList.add('active'); };
$('#live').onclick = () => { clock.reset(); $<HTMLSelectElement>('#time-speed').value = '1'; updateReadouts(); };
$('#pause').onclick = () => { clock.setRate(clock.rate === 0 ? Number($<HTMLSelectElement>('#time-speed').value) : 0); updateReadouts(); };
$('#time-speed').onchange = () => { clock.setRate(Number($<HTMLSelectElement>('#time-speed').value)); updateReadouts(); };
$('#quality').onchange = () => { const value = $<HTMLSelectElement>('#quality').value as Quality; observatory?.setQuality(value); try { localStorage.setItem('stellar-quality', value); } catch {} };
document.querySelectorAll<HTMLInputElement>('[data-layer]').forEach(input => input.onchange = () => observatory?.setLayer(input.dataset.layer as 'atmosphere' | 'clouds' | 'grid' | 'relief', input.checked));

function openDialog(id: string) { $<HTMLDialogElement>(id).showModal(); }
const settingsDialog = $<HTMLDialogElement>('#settings-dialog');
let settingsMotion: Animation | undefined;
let settingsOrigin = '';
function openSettings() {
  const icon = $('#settings').getBoundingClientRect();
  const top = icon.bottom + 12;
  settingsDialog.style.top = `${top}px`;
  settingsDialog.style.right = `${Math.max(16, innerWidth - icon.right)}px`;
  settingsDialog.style.maxHeight = `${Math.max(160, innerHeight - top - 16)}px`;
  settingsMotion?.cancel();
  settingsDialog.showModal();
  $('#settings').setAttribute('aria-expanded', 'true');
  const panel = settingsDialog.getBoundingClientRect();
  settingsOrigin = `translate(${icon.left + icon.width / 2 - panel.right}px, ${icon.top + icon.height / 2 - panel.top}px) scale(0.08)`;
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    settingsMotion = settingsDialog.animate([{ opacity: 0, transform: settingsOrigin }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
}
function closeSettings() {
  settingsMotion?.cancel();
  if (!settingsDialog.open) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { settingsDialog.close(); return; }
  settingsMotion = settingsDialog.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: settingsOrigin }], { duration: 170, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
  void settingsMotion.finished.then(() => { settingsDialog.close(); settingsMotion?.cancel(); }).catch(() => {});
}
$('#settings').onclick = openSettings;
settingsDialog.addEventListener('cancel', event => { event.preventDefault(); closeSettings(); });
settingsDialog.addEventListener('close', () => { $('#settings').setAttribute('aria-expanded', 'false'); $('#settings').focus(); });
$('#sources').onclick = () => openDialog('#sources-dialog');
document.querySelectorAll<HTMLDialogElement>('dialog').forEach(dialog => {
  const close = () => dialog === settingsDialog ? closeSettings() : dialog.close();
  dialog.querySelector<HTMLButtonElement>('.close-dialog')!.onclick = close;
  dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); } });
});
window.addEventListener('popstate', readHash);
const onKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && mapOpen && currentView === 'detail' && !document.querySelector('dialog[open]')) {
    event.preventDefault(); toggleMap(false); $('#show-map').focus(); return;
  }
  if (document.querySelector('dialog[open]') || /INPUT|SELECT|TEXTAREA/.test((event.target as HTMLElement).tagName)) return;
  if (event.key === 'Escape') navigate('overview');
  if (event.key === '1') navigate('detail', 'earth');
  if (event.key === '2') navigate('detail', 'moon');
  if (event.key === '3') navigate('detail', 'mars');
};
window.addEventListener('keydown', onKeyDown);

async function start() {
  $('#error').hidden = true; $('#loading').classList.remove('finished');
  try {
    observatory?.dispose();
    observatory = new Observatory($('#scene'), clock);
    if (placeCatalog) observatory.setPlaceCatalog(placeCatalog.places);
    observatory.onMapFrame = renderMapFrame;
    if (satelliteCatalog) observatory.setSatelliteCatalog(satelliteCatalog.satellites);
    observatory.onSatelliteSelect = selectSatellite;
    observatory.onSatelliteLabels = labels => labels.forEach(label => {
      const element = document.querySelector<HTMLElement>(`[data-satellite-label="${label.id}"]`);
      if (!element) return;
      element.style.left = `${label.x}px`; element.style.top = `${label.y}px`; element.hidden = !label.visible;
    });
    observatory.onSelect = body => navigate(currentView === 'orbit' ? 'orbit' : 'detail', body);
    observatory.onLabels = labels => labels.forEach(label => {
      const element = $(`[data-marker="${label.id}"]`);
      element.style.left = `${label.x}px`; element.style.top = `${label.y}px`; element.hidden = !label.visible;
    });
    observatory.onStats = stats => {
      $('#stats-backend').textContent = stats.backend;
      $('#stats-fps').textContent = `${stats.fps} FPS`;
      $('#stats-resolution').textContent = stats.resolution;
    };
    await observatory.init((value, label) => { $('#loading-text').textContent = label; $('#loading-progress').style.width = `${Math.round(value * 100)}%`; });
    let saved = 'auto'; try { saved = localStorage.getItem('stellar-quality') ?? 'auto'; } catch {}
    if (saved === 'high' || saved === 'ultra') { observatory.setQuality(saved); $<HTMLSelectElement>('#quality').value = saved; }
    ready = true;
    document.querySelectorAll<HTMLInputElement>('[data-layer]').forEach(input => observatory!.setLayer(input.dataset.layer as 'atmosphere' | 'clouds' | 'grid' | 'relief', input.checked));
    readHash(); $('#scene').setAttribute('aria-busy', 'false');
    $('#loading').classList.add('finished');
  } catch (error) {
    console.error('Observatory initialization failed', error);
    $('#loading').classList.add('finished'); $('#error').hidden = false;
    $('#error-text').textContent = 'The graphics renderer or a surface map could not load. Try again with hardware acceleration enabled in a browser that supports WebGPU or WebGL 2.';
  }
}
function toggleMap(open: boolean) {
  mapOpen = open;
  $('.observatory').dataset.mapOpen = String(open);
  $('#show-map').setAttribute('aria-expanded', String(open));
  $('#show-map span').textContent = open ? 'Hide map' : 'Show map';
  $('#map-panel').hidden = !open || currentView !== 'detail';
  $('#place-labels').hidden = !open || currentView !== 'detail';
  observatory?.setMapEnabled(open && currentView === 'detail');
  mapListKey = ''; updateMapCatalog();
}
function placeRows(places: Place[]) {
  return places.map(p => `<button class="place-row${selectedPlace?.id === p.id ? ' active' : ''}" data-place="${p.id}" aria-label="Focus ${escapeHtml(p.name)}"><span>${escapeHtml(p.name)}<small>${escapeHtml(p.kind)}${p.context && p.body === 'earth' ? ' · ' + escapeHtml(p.context) : ''}</small></span>${icons.diagonal}</button>`).join('');
}
function updateMapCatalog() {
  $('#retry-places').hidden = !placesError;
  if (!placeCatalog) { $('#map-hint').textContent = placesError || 'Loading place names…'; $('#map-hint').hidden = false; }
  updatePlaceSearch();
}
function updatePlaceSearch() {
  const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const query = normalize($<HTMLInputElement>('#place-search').value.trim());
  $('#place-search-results').hidden = !query;
  if (!query) return;
  const results = (placeCatalog?.places ?? []).filter(p => p.body === currentBody && normalize(p.name).includes(query))
    .sort((a, b) => Number(normalize(b.name) === query) - Number(normalize(a.name) === query)
      || Number(normalize(b.name).startsWith(query)) - Number(normalize(a.name).startsWith(query)) || b.importance - a.importance);
  $('#search-count').textContent = results.length ? `${results.length} results across ${bodies[currentBody].name}${results.length > 20 ? ' · first 20 shown' : ''}` : 'No matching place names';
  $('#place-results').innerHTML = placeRows(results.slice(0, 20));
}
function selectPlace(id: string) {
  const place = placeCatalog?.places.find(p => p.id === id && p.body === currentBody);
  if (!place) return;
  selectedPlace = place; mapListKey = '';
  $<HTMLInputElement>('#place-search').value = ''; updatePlaceSearch();
  $('#selected-place').hidden = false;
  $('#map-panel').scrollTop = 0;
  $('#selected-place').dataset.placeId = place.id;
  $('#selected-place-name').textContent = place.name;
  $('#selected-place-type').textContent = place.kind + (place.context ? ` · ${place.context}` : '');
  $('#selected-place-coordinates').textContent = `${Math.abs(place.latitude).toFixed(3)}° ${place.latitude < 0 ? 'S' : 'N'} · ${Math.abs(place.longitude).toFixed(3)}° ${place.longitude < 0 ? 'W' : 'E'}`;
  $('#selected-place-diameter').textContent = place.diameterKm ? `${place.diameterKm.toLocaleString('en-US', { maximumFractionDigits: 1 })} km diameter / extent` : '';
  const source = new URL(place.sourceUrl);
  $<HTMLAnchorElement>('#place-source').href = source.protocol === 'https:' && ['www.naturalearthdata.com', 'planetarynames.wr.usgs.gov'].includes(source.hostname) ? source.href : '#';
  updatePlaceTime(clock.now());
  observatory?.focusPlace(place);
}
function renderMapFrame(frame: MapFrame) {
  if (!mapOpen || currentView !== 'detail') return;
  const labels = frame.labels.filter(label => label.visible);
  $('#map-level').textContent = mapLevels[frame.level];
  $('#map-level').dataset.level = String(frame.level);
  $('#in-view-count').textContent = `In view · ${labels.length}`;
  $('#map-hint').textContent = !placeCatalog ? placesError || 'Loading place names…' : labels.length ? '' : 'No named places in this view. Zoom out, rotate, or search this world.';
  $('#map-hint').hidden = !$('#map-hint').textContent;
  const key = labels.map(l => l.place.id).join(',') + (selectedPlace?.id ?? '');
  if (key !== mapListKey) {
    mapListKey = key;
    $('#visible-places').innerHTML = placeRows(labels.map(label => label.place));
    $('#place-labels').innerHTML = labels.map(label => `<button class="place-label${selectedPlace?.id === label.place.id ? ' active' : ''}" data-place-label="${label.place.id}" aria-label="Focus ${escapeHtml(label.place.name)}"><span>${escapeHtml(label.place.name)}</span></button>`).join('');
  }
  for (const label of labels) {
    const element = document.querySelector<HTMLElement>(`[data-place-label="${label.place.id}"]`);
    if (element) { element.style.left = `${label.x}px`; element.style.top = `${label.y}px`; }
  }
}
$('#close-place-detail').onclick = () => {
  selectedPlace = undefined; mapListKey = '';
  $('#selected-place').hidden = true;
  delete $('#selected-place').dataset.placeId;
  if (observatory) {
    observatory.surfaceMap.selected = '';
    observatory.surfaceMap.invalidate();
  }
  updatePlaceSearch();
  $('#map-panel').scrollTop = 0;
  $('#place-search').focus({ preventScroll: true });
};
$('#place-search').oninput = updatePlaceSearch;
$('#refocus-place').onclick = () => { if (selectedPlace) observatory?.focusPlace(selectedPlace); };
$('#map-panel').onclick = event => {
  const button = (event.target as HTMLElement).closest<HTMLElement>('[data-place]');
  if (button) selectPlace(button.dataset.place!);
};
$('#place-labels').onclick = event => {
  const button = (event.target as HTMLElement).closest<HTMLElement>('[data-place-label]');
  if (button) selectPlace(button.dataset.placeLabel!);
};
async function fetchPlaceData() {
  placesError = ''; $('#retry-places').hidden = true;
  try {
    placeCatalog = await loadPlaces(); observatory?.setPlaceCatalog(placeCatalog.places);
  } catch (error) { console.warn('Place data unavailable', error); placesError = 'Place names could not load. Try again.'; }
  mapListKey = ''; if (currentView === 'detail') updateMapCatalog();
}
$('#retry-places').onclick = () => { void fetchPlaceData(); };
void fetchPlaceData();

function selectSatellite(id: string) {
  satelliteInspectorOpen = true;
  observatory?.selectSatellite(id);
  renderSatelliteSelection();
  updateSatelliteReadout(clock.now());
}
function updateSatelliteModel(selected: Satellite | undefined) {
  const section=$('#satellite-model-section'), asset=selected&&satelliteModels.get(selected.id);
  section.hidden=!selected;
  $('#satellite-model-status').hidden=false;
  $('#satellite-model-canvas').hidden=!asset;
  $('#satellite-model-source').hidden=!asset;
  $('#expand-satellite-model').hidden=true;
  if(!asset||!selected) {
    modelPreview?.setActive(false);
    void modelPreview?.select(selected?.id ?? '');
    $('#satellite-model-status').textContent=selected?'No verified 3D model is included for this object yet.':'';
    return;
  }
  $<HTMLAnchorElement>('#satellite-model-source').href=asset.sourceUrl;
  if(!modelPreview) {
    try { modelPreview=new SatelliteModelPreview($('#satellite-model-canvas')); }
    catch { $('#satellite-model-status').textContent='The model preview renderer is unavailable.'; return; }
    modelPreview.onStatus=(status, ready)=> { $('#satellite-model-status').textContent=status; $('#satellite-model-status').hidden=!status; $('#expand-satellite-model').hidden=!ready; };
  }
  modelPreview.rotationEnabled = observatory?.rotationEnabled ?? true;
  modelPreview.setShadowsEnabled(observatory?.shadowsEnabled ?? true);
  modelPreview.setActive(currentView==='satellites' && satelliteInspectorOpen);
  void modelPreview.select(selected.id);
  if($('#satellite-model-canvas').dataset.modelState==='ready'&&$('#satellite-model-canvas').dataset.modelId===selected.id) { $('#expand-satellite-model').hidden=false; $('#satellite-model-status').hidden=true; }
}
$('#close-satellite-inspector').onclick = () => {
  satelliteInspectorOpen = false;
  $('#satellite-inspector').hidden = true;
  modelPreview?.setActive(false);
  $<HTMLDialogElement>('#satellite-model-dialog').close();
  const selectedRow = document.querySelector<HTMLElement>('.satellite-row.active');
  (selectedRow ?? $('#nav-satellites')).focus({ preventScroll: true });
};
$('#expand-satellite-model').onclick=()=> {
  $('#model-dialog-title').textContent=$('#satellite-selected-name').textContent;
  $('#expanded-model-host').appendChild($('#satellite-model-canvas'));
  $<HTMLDialogElement>('#satellite-model-dialog').showModal();
};
$('#satellite-model-dialog').addEventListener('close',()=> { $('#satellite-model-host').appendChild($('#satellite-model-canvas')); });

function renderSatelliteSelection() {
  const selected = satelliteCatalog?.satellites.find(s => s.id === observatory?.satellites.selected && s.parent === currentBody);
  document.querySelectorAll<HTMLElement>('[data-satellite]').forEach(element => {
    const active = element.dataset.satellite === selected?.id;
    element.classList.toggle('active', active); element.setAttribute('aria-pressed', String(active));
  });
  const labels = currentBody === 'earth' ? selected ? [selected] : [] : satelliteCatalog?.satellites.filter(s => s.parent === currentBody) ?? [];
  $('.satellite-labels').innerHTML = labels.map(s => `<button data-satellite-label="${s.id}" class="satellite-label${selected?.id === s.id ? ' active' : ''}" hidden>${escapeHtml(s.name)}</button>`).join('');
  $('#satellite-inspector').hidden = !selected || currentView !== 'satellites' || !satelliteInspectorOpen;
  updateSatelliteModel(selected);
  $('#satellite-selected-name').textContent = selected?.name ?? '';
  $('#satellite-orbit-metrics').textContent = selected?.parent === 'earth' ? (() => {
    const m = orbitMetrics(selected);
    return `${orbitInfo[classifyOrbit(selected)].name} · NORAD ${selected.catalogId} · ${m.inclination.toFixed(1)}° inclination · ${Math.round(m.perigee).toLocaleString('en-US')}–${Math.round(m.apogee).toLocaleString('en-US')} km mean orbit`;
  })() : '';
}
function renderSatelliteList() {
  const items = satelliteCatalog?.satellites.filter(s => s.parent === currentBody) ?? [];
  const query = currentBody === 'earth' ? $<HTMLInputElement>('#satellite-search').value.trim().toLowerCase() : '';
  satelliteListItems = items.filter(s => currentBody !== 'earth' || (matchesOrbit(s, earthOrbitFilter) && matchesSatelliteSearch(s, query)));
  satellitePage = Math.max(0, Math.min(satellitePage, Math.ceil(satelliteListItems.length / satellitePageSize) - 1));
  satellitePageItems = satelliteListItems.slice(satellitePage * satellitePageSize, (satellitePage + 1) * satellitePageSize);
  $('#satellite-list').innerHTML = satellitePageItems.length ? satellitePageItems.map(s => `<button class="satellite-row" data-satellite="${s.id}" aria-pressed="false"><i style="--satellite-color:${escapeHtml(s.color)}" class="${s.kind}"></i><span>${escapeHtml(s.name)}<small>${s.parent === 'earth' ? `${orbitInfo[classifyOrbit(s)].name} · NORAD ${s.catalogId}` : s.kind === 'natural' ? 'Natural moon' : s.historical ? 'Historical spacecraft trajectory' : 'Spacecraft'}<span data-satellite-state="${s.id}"></span></small></span></button>`).join('') : `<p>${satelliteError ? escapeHtml(satelliteError) : satelliteCatalog ? 'No satellites match. Try another orbit or search.' : 'Loading orbital data…'}</p>`;
  $('#satellite-pagination').hidden = satelliteListItems.length <= satellitePageSize;
  $('#satellite-page').textContent = `${satellitePage * satellitePageSize + 1}–${Math.min((satellitePage+1)*satellitePageSize,satelliteListItems.length)} of ${satelliteListItems.length.toLocaleString('en-US')}`;
  $<HTMLButtonElement>('#satellite-previous').disabled = satellitePage === 0;
  $<HTMLButtonElement>('#satellite-next').disabled = (satellitePage+1)*satellitePageSize >= satelliteListItems.length;
  $('.satellite-panel').scrollTop = 0;
  renderSatelliteSelection();
}
function renderSatellitePanel() {
  document.querySelectorAll<HTMLElement>('[data-system]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.system === currentBody)));
  const items = satelliteCatalog?.satellites.filter(s => s.parent === currentBody) ?? [];
  $('#earth-catalog-controls').hidden = currentBody !== 'earth';
  $('#satellite-total').textContent = satelliteCatalog ? String(items.length) : '—';
  $('#satellite-total-label').textContent = satelliteCatalog?.earthFetchedAt ? 'active satellites' : 'satellites in sample';
  $('#earth-catalog-stamp').textContent = satelliteCatalog?.earthFetchedAt ? `CelesTrak · downloaded ${new Date(satelliteCatalog.earthFetchedAt).toISOString().slice(0,16).replace('T',' ')} UTC` : satelliteCatalog?.earthError ?? 'Loading active catalog…';
  const counts = orbitCounts(items);
  $('#earth-orbit-filters').innerHTML = orbitTypes.map(type => `<button data-earth-orbit="${type}" aria-pressed="${type === earthOrbitFilter}" style="--orbit-color:${orbitInfo[type].color}"><span>${orbitInfo[type].name}</span><small>${counts[type].toLocaleString('en-US')}</small></button>`).join('');
  $('#orbit-filter-description').textContent = orbitInfo[earthOrbitFilter].description;
  if (currentBody === 'earth') observatory?.satellites.setEarthFilter(earthOrbitFilter);
  $('#satellite-retry').hidden = !satelliteError && !satelliteCatalog?.earthError;
  renderSatelliteList();
  updateSatelliteReadout(clock.now());
}
$('#earth-orbit-filters').onclick = event => {
  const button = (event.target as HTMLElement).closest<HTMLElement>('[data-earth-orbit]');
  if (!button) return;
  earthOrbitFilter = button.dataset.earthOrbit as OrbitFilter;
  satellitePage = 0; $<HTMLInputElement>('#satellite-search').value = '';
  observatory?.satellites.setEarthFilter(earthOrbitFilter);
  observatory?.setView('satellites', 'earth', false, true);
  renderSatellitePanel();
};
$('#satellite-search').oninput = () => { satellitePage=0; renderSatelliteList(); };
$('#satellite-previous').onclick = () => { satellitePage--; renderSatelliteList(); };
$('#satellite-next').onclick = () => { satellitePage++; renderSatelliteList(); };
$('#satellite-list').onclick = event => {
  const button = (event.target as HTMLElement).closest<HTMLElement>('[data-satellite]');
  if (button) selectSatellite(button.dataset.satellite!);
};
$('.satellite-labels').onclick = event => {
  const button = (event.target as HTMLElement).closest<HTMLElement>('[data-satellite-label]');
  if (button) selectSatellite(button.dataset.satelliteLabel!);
};

function updateSatelliteReadout(date: Date) {
  const items = satelliteCatalog?.satellites ?? [];
  satellitePageItems.forEach(s => {
    const element = document.querySelector<HTMLElement>(`[data-satellite-state="${s.id}"]`);
    if (element) element.textContent = satellitePosition(s, date) ? '' : ' · No position at scene time';
  });
  if (currentBody === 'earth') {
    const cloud = observatory?.satellites.earth;
    $('#satellite-render-error').textContent = cloud?.error ?? '';
    $('#satellite-render-error').hidden = !cloud?.error;
  }
  const selected = items.find(s => s.id === observatory?.satellites.selected);
  if (!selected) return;
  const position = satellitePosition(selected, date);
  $('#satellite-status').textContent = dataStatus(selected, date);
  if (!position && !$('#satellite-status').textContent?.includes('coverage')) $('#satellite-status').textContent += ' · position unavailable';
  $('#satellite-status').classList.toggle('unavailable', !position);
  $('#satellite-altitude').textContent = position ? `${Math.round(position.length() - bodies[selected.parent].radius).toLocaleString('en-US')} km` : '—';
  $('#satellite-period').textContent = `${selected.periodHours.toFixed(2)} h`;
  const [start, stop] = coverage(selected);
  const stamp = (time: number) => new Date(time).toISOString().slice(0, 16).replace('T', ' ');
  $('#satellite-coverage').textContent = selected.provider === 'celestrak'
    ? `Elements: ${stamp(Date.parse(selected.epoch!))} UTC. Display limited to ±7 days of epoch.`
    : `Coverage: ${stamp(start)} → ${stamp(stop)} UTC.`;
  $('#satellite-coverage').textContent += ` Fetched: ${stamp(Date.parse(selected.fetchedAt))} UTC.`;
  const link = $<HTMLAnchorElement>('#satellite-source');
  // Only known public data hosts may be linked from a downloaded catalog.
  const source = new URL(selected.sourceUrl);
  link.href = ['ssd.jpl.nasa.gov', 'celestrak.org'].includes(source.hostname) && source.protocol === 'https:' ? source.href : '#';
  $('#satellite-epoch').hidden = !!position;
  $('#satellite-epoch').onclick = () => {
    clock.setDate(new Date(selected.epoch ?? (start + stop) / 2)); clock.setRate(1);
    $<HTMLSelectElement>('#time-speed').value = '1'; observatory?.selectSatellite(selected.id); updateReadouts();
  };
}

async function fetchSatelliteData() {
  satelliteError = ''; $('#satellite-retry').hidden = true;
  try {
    satelliteCatalog = await loadSatelliteCatalog();
    observatory?.setSatelliteCatalog(satelliteCatalog.satellites);
  } catch (error) { console.warn('Satellite data unavailable', error); satelliteError = 'Orbital data could not load. The planetary renderer is still available.'; }
  if (currentView === 'satellites') renderSatellitePanel();
}
$('#satellite-retry').onclick = () => { void fetchSatelliteData(); };
void fetchSatelliteData();
$('#retry').onclick = () => { void start(); };
const ticker = setInterval(updateReadouts, 250);
updateReadouts(); void start();
if (import.meta.hot) import.meta.hot.dispose(() => { clearInterval(ticker); window.removeEventListener('popstate', readHash); window.removeEventListener('keydown', onKeyDown); modelPreview?.dispose(); observatory?.dispose(); disposeSatelliteModels(); });
