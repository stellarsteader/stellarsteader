import { readFile, writeFile, mkdir, rename, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const sources=JSON.parse(await readFile(new URL('./satellite-model-sources.json',import.meta.url),'utf8'));
const directory=new URL('../public/models/',import.meta.url);
await mkdir(directory,{recursive:true});
await cp(new URL('../node_modules/three/examples/jsm/libs/draco/gltf/',import.meta.url),new URL('../public/vendor/draco/',import.meta.url),{recursive:true});
let previous=[];
try { previous=JSON.parse(await readFile(new URL('manifest.json',directory),'utf8')).models; } catch {}
const models=[];
for(const source of sources) {
  const file=new URL(`${source.id}.glb`,directory);
  let bytes, downloadedAt;
  try {
    if(process.argv.includes('--force')) throw new Error('refresh');
    bytes=await readFile(file);
    downloadedAt=previous.find(m=>m.id===source.id && m.url===source.url)?.downloadedAt;
    if(!downloadedAt) throw new Error('Missing provenance');
  } catch {
    const response=await fetch(source.url,{signal:AbortSignal.timeout(90000)});
    if(!response.ok) throw new Error(`${source.id}: HTTP ${response.status}`);
    bytes=Buffer.from(await response.arrayBuffer()); downloadedAt=new Date().toISOString();
  }
  if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length) throw new Error(`Invalid GLB: ${source.id}`);
  const json=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  if(!json.meshes?.length||(json.buffers??[]).some(b=>b.uri)||(json.images??[]).some(i=>i.uri)) throw new Error(`Model must contain its geometry and textures: ${source.id}`);
  if((json.extensionsRequired??[]).some(e=>!['KHR_draco_mesh_compression','KHR_materials_unlit','KHR_texture_transform','KHR_materials_pbrSpecularGlossiness','KHR_materials_specular','KHR_materials_ior','KHR_materials_transmission','KHR_materials_clearcoat','KHR_materials_sheen','KHR_materials_emissive_strength'].includes(e))) throw new Error(`Review required extensions: ${source.id}: ${json.extensionsRequired}`);
  await writeFile(new URL(`${source.id}.pending.glb`,directory),bytes);
  await rename(new URL(`${source.id}.pending.glb`,directory),file);
  models.push({...source,path:`/models/${source.id}.glb`,downloadedAt,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  console.log(`${source.id}: ${(bytes.length/1e6).toFixed(2)} MB, ${json.meshes.length} meshes`);
}
await writeFile(new URL('manifest.json',directory),JSON.stringify({schemaVersion:1,models},null,2)+'\n');
