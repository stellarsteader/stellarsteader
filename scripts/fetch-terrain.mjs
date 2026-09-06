import { mkdir, stat, rename, writeFile } from 'node:fs/promises';
const directory='.cache/terrain';
await mkdir(directory,{recursive:true});
const sources=[
  ['moon-dem.img','https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_64.img',530841600],
  ['mars-dem.img','https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg032/megt90n000fb.img',132710400],
  ['moon-color.jpg','https://www.solarsystemscope.com/textures/download/8k_moon.jpg'],
  ['mars-color.jpg','https://www.solarsystemscope.com/textures/download/8k_mars.jpg'],
];
for(const [file,url,size] of sources) {
  const destination=`${directory}/${file}`;
  try {const s=await stat(destination);if(size?s.size===size:s.size>1000000) {console.log(`Using ${file}`);continue;}} catch {}
  const response=await fetch(url,{signal:AbortSignal.timeout(300000)});
  if(!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(size && bytes.length!==size) throw new Error(`${file}: incomplete raster`);
  await writeFile(`${destination}.part`,bytes);await rename(`${destination}.part`,destination);console.log(`Downloaded ${file}`);
}
