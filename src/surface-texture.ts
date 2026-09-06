import * as THREE from 'three/webgpu';

// Keep an HTMLImageElement throughout the texture lifetime. TextureLoader and
// the renderer then own the single Y flip on both WebGPU and WebGL; pre-flipped
// ImageBitmaps have different upload semantics between the two backends.
export async function loadSurfaceTexture(url: string, srgb = true, anisotropy = 8) {
  const map = await new THREE.TextureLoader().loadAsync(url);
  map.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  map.anisotropy = Math.min(8, anisotropy);
  map.wrapS = THREE.RepeatWrapping;
  return map;
}
