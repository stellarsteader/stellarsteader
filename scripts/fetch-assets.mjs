import { mkdir, writeFile, access } from 'node:fs/promises';
import sharp from 'sharp';

const directory = new URL('../public/textures/', import.meta.url);
await mkdir(directory, { recursive: true });
const assets = [
  ['earth-day', 'https://threejs.org/examples/textures/planets/earth_day_4096.jpg', 'color'],
  ['earth-night', 'https://threejs.org/examples/textures/planets/earth_night_4096.jpg', 'color'],
  ['earth-packed', 'https://threejs.org/examples/textures/planets/earth_bump_roughness_clouds_4096.jpg', 'data'],
  ['moon-day', 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_4k.tif', 'color'],
];
await Promise.all(assets.map(async ([name, url, kind]) => {
  const destination = new URL(`${name}.webp`, directory);
  try { await access(destination); console.log(`Using ${name}`); return; } catch {}
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const output = await sharp(bytes).resize({ width: 4096, withoutEnlargement: true }).webp({ quality: kind === 'data' ? 95 : 92 }).toBuffer();
  await writeFile(destination, output);
  console.log(`${name}: ${(output.length / 1024).toFixed(0)} KiB`);
}));
