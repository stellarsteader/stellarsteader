import * as THREE from 'three/webgpu';
import { attribute, texture as sampleTexture } from 'three/tsl';
import { stars, starColor, starDirection } from './star-catalog';

/** Camera-centered celestial sphere: rotation changes the sky; translation cannot. */
export function createStarBackground() {
  const sky = new THREE.Group();
  sky.name = 'HYG J2000 star background';
  const width = 32, pixels = new Uint8Array(width * width * 4);
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
    const r = Math.hypot((x + 0.5) / width * 2 - 1, (y + 0.5) / width * 2 - 1);
    const offset = (y * width + x) * 4;
    pixels.set([255, 255, 255, Math.round(255 * Math.exp(-5 * r * r) * Math.max(0, 1 - r ** 4))], offset);
  }
  const texture = new THREE.DataTexture(pixels, width, width);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  // Shared-size batches keep draw calls small while preserving magnitude contrast.
  for (let bin = 0; bin < 8; bin++) {
    const positions: number[] = [], colors: number[] = [];
    for (const [, ra, dec, magnitude, bv] of stars) {
      if (Math.max(0, Math.min(7, Math.floor(magnitude + 1))) !== bin) continue;
      positions.push(...starDirection(ra, dec).map(v => v * 400));
      // Compress physical flux to keep naked-eye stars visible on a display.
      const brightness = Math.min(1, 0.35 + 0.65 * 10 ** (-0.16 * (magnitude + 1.44)));
      colors.push(...starColor(bv).map(channel => channel * brightness));
    }
    const material = new THREE.PointsNodeMaterial({
      map: texture, size: 7 - bin * 0.55, sizeAttenuation: false,
      transparent: true, depthWrite: false, toneMapped: false, alphaToCoverage: false,
      positionNode: attribute('starPosition', 'vec3'),
      colorNode: attribute('starColor', 'vec3'),
      opacityNode: sampleTexture(texture).a,
    });
    // Instanced quads support round, variable-sized stars on WebGPU and WebGL.
    const points = new THREE.Sprite(material);
    points.geometry = points.geometry.clone();
    points.geometry.setAttribute('starPosition', new THREE.InstancedBufferAttribute(new Float32Array(positions), 3));
    points.geometry.setAttribute('starColor', new THREE.InstancedBufferAttribute(new Float32Array(colors), 3));
    points.count = positions.length / 3;
    points.renderOrder = -10;
    points.frustumCulled = false;
    sky.add(points);
  }
  return sky;
}
