import { mkdir, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const cache = new URL('.cache/places/', root);
await mkdir(cache, { recursive: true });
const sources = [
  ['mars', 'kmz', 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.kmz'],
  ['moon', 'kmz', 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.kmz'],
  ['earth', 'json', 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson'],
];
const fromCache = process.argv.find(arg => arg.startsWith('--from-cache='))?.split('=')[1];
for (const [body, extension, url] of sources) {
  const destination = new URL(`${body}.${extension}`, cache);
  if (fromCache) {
    const { readFile } = await import('node:fs/promises');
    await writeFile(destination, await readFile(`${fromCache}/stellar-places-${body}.${extension}`));
    continue;
  }
  try { if (Date.now() - (await stat(destination)).mtimeMs < 86400000 && !process.argv.includes('--force')) continue; } catch {}
  const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`${body}: HTTP ${response.status}`);
  await writeFile(destination, new Uint8Array(await response.arrayBuffer()));
}
execFileSync('python3', [fileURLToPath(new URL('build-places.py', import.meta.url)), fileURLToPath(cache), fileURLToPath(new URL('public/data/places.json', root))], { stdio: 'inherit' });
