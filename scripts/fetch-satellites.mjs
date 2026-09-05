// Run on the server/build machine, never in a visitor's browser (JPL CORS policy).
// JPL calls deliberately run serially. Reuse downloaded snapshots for six hours.
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';

const destination = new URL('../public/data/satellites.json', import.meta.url);
const now = new Date();
const day = 86400000;
const only = process.argv.find(value => value.startsWith('--only='))?.slice(7).split(',');
let previous;
try { previous = JSON.parse(await readFile(destination, 'utf8')); } catch {}
if (!only && !process.argv.includes('--force') && previous && now - new Date(previous.fetchedAt) < 6 * 3600000) {
  console.log('Reusing satellite snapshot fetched within six hours.');
  process.exit(0);
}
const satellites = [], errors = [];
const start = new Date(Math.floor(now.getTime() / day) * day - day);
const stop = new Date(start.getTime() + 4 * day);
const dateString = date => date.toISOString().slice(0, 16).replace('T', ' ');
async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
async function collect(meta, fetcher) {
  if (only && !only.includes(meta.id)) {
    const cached = previous?.satellites.find(item => item.id === meta.id);
    if (cached) satellites.push(cached);
    return;
  }
  try {
    satellites.push({ ...meta, ...await fetcher(), fetchedAt: now.toISOString() });
    console.log(`Fetched ${meta.name}`);
  } catch (error) {
    errors.push({ id: meta.id, name: meta.name, message: String(error.message) });
    const cached = previous?.satellites.find(item => item.id === meta.id);
    if (cached) satellites.push(cached); // Preserve its original freshness, never relabel it.
    console.warn(`${meta.name}: ${error.message}${cached ? ' (kept previous snapshot)' : ''}`);
  }
}
for (const [id, name, catalogId, color] of [
  ['iss', 'ISS', 25544, '#b6d7e7'], ['tiangong', 'Tiangong', 48274, '#d3bd8e'], ['hubble', 'Hubble', 20580, '#bcb1e0'],
]) {
  const sourceUrl = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${catalogId}&FORMAT=json`;
  await collect({ id, name, parent: 'earth', kind: 'spacecraft', color, sourceUrl, catalogId }, async () => {
    const result = await json(sourceUrl);
    const omm = result.find(row => Number(row.NORAD_CAT_ID) === catalogId);
    if (!omm || !Number.isFinite(Number(omm.MEAN_MOTION)) || Number(omm.MEAN_MOTION) <= 0 || !Number.isFinite(Date.parse(omm.EPOCH + 'Z'))) throw new Error('Invalid OMM response');
    return { provider: 'celestrak', frame: 'TEME', epoch: omm.EPOCH + 'Z', periodHours: 24 / Number(omm.MEAN_MOTION), omm };
  });
}
for (const [id, name, parent, target, kind, periodHours, color] of [
  ['phobos', 'Phobos', 'mars', 401, 'natural', 7.65, '#d5c6a4'],
  ['deimos', 'Deimos', 'mars', 402, 'natural', 30.30, '#bdb7a5'],
  ['lro', 'Lunar Reconnaissance Orbiter', 'moon', -85, 'spacecraft', 1.9, '#c2d7ea'],
  ['danuri', 'Danuri', 'moon', -155, 'spacecraft', 2, '#dfbd85'],
  ['mro', 'Mars Reconnaissance Orbiter', 'mars', -74, 'spacecraft', 1.9, '#9fc6d6'],
  ['odyssey', 'Mars Odyssey', 'mars', -53, 'spacecraft', 2, '#bcbaeb'],
  ['mars-express', 'Mars Express', 'mars', -41, 'spacecraft', 7.5, '#b2d5b1'],
  ['tgo', 'Trace Gas Orbiter', 'mars', -143, 'spacecraft', 2, '#e0af92'],
  ['maven', 'MAVEN', 'mars', -202, 'spacecraft', 3.6, '#d5a8c1'],
]) {
  await collect({ id, name, parent, kind, color, target, periodHours }, async () => {
    let historical = false;
    const from = start, to = stop;
    const center = parent === 'moon' ? 301 : 499;
    const parameters = { COMMAND: target, CENTER: `500@${center}`, EPHEM_TYPE: 'VECTORS',
      START_TIME: dateString(from), STOP_TIME: dateString(to), STEP_SIZE: '2 m',
      REF_PLANE: 'FRAME', REF_SYSTEM: 'ICRF', OUT_UNITS: 'KM-S', VEC_TABLE: '2',
      VEC_CORR: 'NONE', CSV_FORMAT: 'YES', TIME_TYPE: 'UT' };
    const query = new URLSearchParams({ format: 'json', ...Object.fromEntries(Object.entries(parameters).map(([key, value]) => [key, `'${value}'`])) });
    let sourceUrl = `https://ssd.jpl.nasa.gov/api/horizons.api?${query}`;
    let result = await json(sourceUrl);
    // Prefer current coverage on every refresh. This verified archival fallback is
    // specific to MAVEN; it is never presented as a current spacecraft position.
    if (id === 'maven' && /No ephemeris/.test(result.error ?? '')) {
      historical = true;
      query.set('START_TIME', "'2026-02-28 00:00'"); query.set('STOP_TIME', "'2026-03-01 00:00'");
      sourceUrl = `https://ssd.jpl.nasa.gov/api/horizons.api?${query}`;
      result = await json(sourceUrl);
    }
    if (result.signature?.version !== '1.2') throw new Error('Unrecognized Horizons API version; review parser');
    if (result.error) throw new Error(result.error);
    const content = result.result;
    if (!content?.includes(`(${target})`) || !content.includes('$$SOE') || !content.includes('$$EOE')) throw new Error('Missing Horizons state vectors');
    const samples = content.split('$$SOE')[1].split('$$EOE')[0].trim().split('\n').map(line => {
      const fields = line.split(',').map(value => value.trim());
      return [Math.round((Number(fields[0]) - 2440587.5) * day), ...fields.slice(2, 8).map(Number)];
    });
    if (samples.length < 2 || samples.some((row, i) => row.length !== 7 || row.some(n => !Number.isFinite(n)) || (i > 0 && row[0] <= samples[i - 1][0]))) throw new Error('Invalid Horizons sample sequence');
    const minimumRadius = parent === 'moon' ? 1737 : 3389;
    if (samples.some(row => Math.hypot(...row.slice(1, 4)) < minimumRadius)) throw new Error('Trajectory intersects central body; inspect target/frame');
    return { provider: 'horizons', frame: 'ICRF', timeScale: 'UT', units: 'km, km/s', historical,
      sourceUrl, coverageStart: new Date(samples[0][0]).toISOString(), coverageEnd: new Date(samples.at(-1)[0]).toISOString(),
      targetName: content.match(/Target body name:\s*(.+)/)?.[1]?.trim(), samples };
  });
}
if (!satellites.length) throw new Error('No satellite data available; existing snapshot untouched');
await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
const snapshot = { schemaVersion: 1, fetchedAt: now.toISOString(), scope: 'Selected missions; not a complete satellite catalog or operational-status registry.', satellites, errors };
await writeFile(new URL('satellites.pending.json', destination), JSON.stringify(snapshot));
await rename(new URL('satellites.pending.json', destination), destination);
console.log(`Saved ${satellites.length} objects; ${errors.length} source failures.`);
if (errors.length) process.exitCode = 1;
