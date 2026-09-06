// Reproducible offline preparation. Fetch source files with terrain:fetch first.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const width = 8192, height = 4096, tileSize = 1024;
for (const body of ['moon', 'mars']) {
  const source = await readFile(`.cache/terrain/${body}-dem.img`);
  const sw = body === 'moon' ? 23040 : 11520, sh = sw / 2;
  if (source.length !== sw * sh * 2) throw new Error(`${body}: unexpected source size`);
  const sample = (x, y) => {
    x = (x + sw) % sw; y = Math.max(0, Math.min(sh - 1, y));
    return (body === 'moon' ? source.readInt16LE((y * sw + x) * 2) * .5 : source.readInt16BE((y * sw + x) * 2));
  };
  // Both PDS rasters run 0..360 E. Runtime maps run -180..180 E, north first.
  const elevation = (u, v) => {
    const x = ((u + .5) % 1) * sw - .5, y = Math.max(0, Math.min(sh - 1, v * sh - .5));
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    return Math.round((sample(ix, iy) * (1-fx) + sample(ix+1, iy) * fx) * (1-fy)
      + (sample(ix, iy+1) * (1-fx) + sample(ix+1, iy+1) * fx) * fy);
  };
  const directory = `public/terrain/${body}`;
  await mkdir(directory, { recursive: true });
  const grid = (w, h, u0=0, v0=0, du=1, dv=1) => {
    const bytes = Buffer.alloc((w+1)*(h+1)*2);
    for (let y=0; y<=h; y++) for(let x=0; x<=w; x++) bytes.writeInt16LE(elevation(u0+x/w*du,v0+y/h*dv),(y*(w+1)+x)*2);
    // Row deltas compress smooth topography without losing a single meter.
    for(let y=0;y<=h;y++) for(let x=w;x>0;x--) {
      const i=(y*(w+1)+x)*2, delta=bytes.readInt16LE(i)-bytes.readInt16LE(i-2);
      bytes.writeInt16LE((delta+32768 & 65535)-32768,i);
    }
    return gzipSync(bytes,{level:9});
  };
  await writeFile(`${directory}/base.bin.gz`, grid(1024,512));
  for(let y=0;y<4;y++) for(let x=0;x<8;x++) await writeFile(`${directory}/${x}-${y}.bin.gz`,grid(tileSize,tileSize,x/8,y/4,1/8,1/4));
  await sharp(`.cache/terrain/${body}-color.jpg`).resize({width,withoutEnlargement:true}).webp({quality:94}).toFile(`${directory}/color.webp`);
  await writeFile(`${directory}/manifest.json`,JSON.stringify({schemaVersion:1,body,width,height,tileSize,baseWidth:1024,baseHeight:512,encoding:'gzip int16 little-endian row deltas in meters, first sample absolute, inclusive grid edges',longitude:'-180 to 180 east',latitude:'90 to -90',verticalDatum:body==='moon'?'LOLA 1737.4 km reference sphere':'MOLA GMM3 areoid; relief mapped onto display sphere',source:body==='moon'?'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_64.img':'https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg032/megt90n000fb.img',sourceSha256:createHash('sha256').update(source).digest('hex')},null,2)+'\n');
  console.log(`${body}: base + 32 elevation tiles + 8K color prepared`);
}
