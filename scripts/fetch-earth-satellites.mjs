// One cached group download, not one request per satellite. Browser uses snapshot.
import { readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const sourceUrl = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json';
const destination = new URL('../public/data/earth-satellites.json', import.meta.url);
const input = process.argv.find(arg => arg.startsWith('--from-file='))?.slice(12);
let previous;
try { previous = JSON.parse(await readFile(destination, 'utf8')); } catch {}
if (!input && !process.argv.includes('--force') && previous && Date.now() - Date.parse(previous.fetchedAt) < 6 * 3600000) {
  console.log(`Reusing ${previous.records.length} active catalog records fetched within six hours.`); process.exit(0);
}
let raw, fetchedAt;
if (input) { raw = await readFile(input, 'utf8'); fetchedAt = (await stat(input)).mtime.toISOString(); }
else {
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`CelesTrak HTTP ${response.status}; existing snapshot untouched`);
  raw = await response.text(); fetchedAt = new Date().toISOString();
}
const rows = JSON.parse(raw), records = new Map();
if (!Array.isArray(rows) || !rows.length) throw new Error('Empty or invalid catalog; existing snapshot untouched');
for (const row of rows) {
  if (!Number.isSafeInteger(Number(row.NORAD_CAT_ID)) || Number(row.NORAD_CAT_ID) < 1 || typeof row.OBJECT_NAME !== 'string'
    || !Number.isFinite(Date.parse(row.EPOCH + 'Z')) || !['MEAN_MOTION','ECCENTRICITY','INCLINATION','RA_OF_ASC_NODE','ARG_OF_PERICENTER','MEAN_ANOMALY','BSTAR'].every(key => Number.isFinite(Number(row[key])))
    || Number(row.MEAN_MOTION) <= 0 || Number(row.ECCENTRICITY) < 0 || Number(row.ECCENTRICITY) >= 1) throw new Error('Invalid OMM row; existing snapshot untouched');
  const id = Number(row.NORAD_CAT_ID);
  const old = records.get(id);
  if (!old || Date.parse(old.EPOCH + 'Z') < Date.parse(row.EPOCH + 'Z')) records.set(id, row);
}
const snapshot = { schemaVersion: 1, fetchedAt, sourceUrl, source: 'CelesTrak active satellites',
  scope: 'Public active-satellite GP catalog; includes passive targets, separately cataloged components, and some combined payload/rocket-body records. Not a census of all debris or artificial objects in orbit, or a mission-health guarantee.',
  sha256: createHash('sha256').update(raw).digest('hex'), records: [...records.values()].sort((a,b) => a.NORAD_CAT_ID-b.NORAD_CAT_ID) };
await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
await writeFile(new URL('earth-satellites.pending.json', destination), JSON.stringify(snapshot));
await rename(new URL('earth-satellites.pending.json', destination), destination);
console.log(`Saved ${snapshot.records.length} unique active-satellite records; downloaded ${fetchedAt}.`);
