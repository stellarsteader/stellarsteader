import * as THREE from 'three/webgpu';
import { uniform, texture, uv, vec3, vec4, color, mix, normalWorldGeometry, positionWorld, cameraPosition, modelPosition, output, bumpMap, max, wgslFn, float } from 'three/tsl';
import type { BodyId } from './astronomy';

// A normalized single-scattering integrator. Distances are in body radii.
// This is an artistic optical model, not a retrieval of atmospheric measurements.
const scatter = wgslFn(`
fn planetaryAtmosphere(ro: vec3f, rd: vec3f, sun: vec3f, beta: vec3f, outer: f32, height: f32, strength: f32) -> vec4f {
  let b = dot(ro, rd);
  let c = dot(ro, ro) - outer * outer;
  let discriminant = b * b - c;
  if (discriminant < 0.0) { return vec4f(0.0); }
  let root = sqrt(discriminant);
  let start = max(0.0, -b - root);
  var finish = -b + root;
  let groundD = b * b - dot(ro, ro) + 1.0;
  if (groundD >= 0.0) {
    let ground = -b - sqrt(groundD);
    if (ground > 0.0) { finish = min(finish, ground); }
  }
  let stepSize = max(0.0, finish - start) / 14.0;
  var optical = 0.0;
  var total = vec3f(0.0);
  let mu = dot(rd, sun);
  let rayleigh = 0.0596831 * (1.0 + mu * mu);
  let g = 0.76;
  let mie = 0.0795775 * (1.0 - g*g) / pow(max(0.02, 1.0 + g*g - 2.0*g*mu), 1.5);
  for (var i = 0; i < 14; i++) {
    let p = ro + rd * (start + (f32(i) + 0.5) * stepSize);
    let altitude = max(0.0, length(p) - 1.0);
    let density = exp(-altitude / height);
    optical += density * stepSize;
    let sb = dot(p, sun);
    let sd = sb*sb - dot(p,p) + 1.0;
    if (sd > 0.0 && -sb - sqrt(sd) > 0.0) { continue; }
    let distanceToSunExit = -sb + sqrt(max(0.0, sb*sb - dot(p,p) + outer*outer));
    let sunStep = distanceToSunExit / 5.0;
    var sunOptical = 0.0;
    for (var j = 0; j < 5; j++) {
      let sp = p + sun * ((f32(j) + 0.5) * sunStep);
      sunOptical += exp(-max(0.0, length(sp)-1.0)/height) * sunStep;
    }
    let transmittance = exp(-(beta + vec3f(0.12)) * (optical + sunOptical) / height);
    total += transmittance * density * stepSize / height * (beta * rayleigh + vec3f(0.025) * mie);
  }
  let light = total * strength;
  let alpha = clamp(max(light.r, max(light.g, light.b)), 0.0, 0.94);
  return vec4f(light / max(alpha, 0.001), alpha);
}`);

export interface PlanetTextures {
  day: THREE.Texture;
  night?: THREE.Texture;
  packed?: THREE.Texture;
}

export function planetMaterials(id: BodyId, maps: PlanetTextures, webgpu: boolean) {
  const sunDirection = uniform(new THREE.Vector3(-0.6, 0.45, 0.8).normalize());
  const relief = uniform(1);
  const unlit = uniform(0);
  const cloudAmount = uniform(1);
  const cloudOffset = uniform(0);
  const radius = uniform(1);
  const material = new THREE.MeshStandardNodeMaterial({ roughness: id === 'earth' ? 0.6 : 0.96 });
  const base = texture(maps.day);
  const facing = normalWorldGeometry.dot(sunDirection).toVar();
  const view = positionWorld.sub(cameraPosition).normalize();
  const rim = view.dot(normalWorldGeometry).abs().oneMinus();
  material.colorNode = id === 'mars' ? mix(vec3(base.rgb.dot(vec3(0.2126, 0.7152, 0.0722))), base.rgb, 0.8).mul(0.9) : base.rgb;

  let litSurface: THREE.Node<'vec4'> = vec4(output);
  if (id === 'earth' && maps.packed && maps.night) {
    const packed = texture(maps.packed);
    const coverage = packed.b.smoothstep(0.18, 0.85).mul(cloudAmount);
    material.roughnessNode = packed.g.remap(0, 1, 0.26, 0.95);
    material.normalNode = bumpMap(packed.r, relief.mul(0.003));
    const night = texture(maps.night).rgb.mul(1.35).mul(coverage.oneMinus());
    const daylight = facing.smoothstep(-0.12, 0.18);
    const twilight = color('#9b4520').mul(facing.add(0.035).abs().mul(-18).exp()).mul(0.05);
    const limbHaze = color('#397dc0').mul(rim.pow(3)).mul(facing.smoothstep(-0.3, 0.6)).mul(0.32);
    litSurface = vec4(output.rgb.add(night.mul(daylight.oneMinus())).add(twilight).add(limbHaze), output.a);
  }
  // Moon and Mars normals and elevations come from worker-built terrain geometry.

  // Full-light inspection uses the surface map without changing the scene clock or Sun geometry.
  material.outputNode = vec4(mix(litSurface.rgb, material.colorNode, unlit), litSurface.a);

  const atmosphere = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false });
  if (id !== 'moon') {
    if (webgpu) {
      atmosphere.outputNode = scatter({
        ro: cameraPosition.sub(modelPosition).div(radius),
        rd: view,
        sun: sunDirection,
        beta: id === 'earth' ? vec3(0.05, 0.12, 0.28) : vec3(0.2, 0.12, 0.065),
        outer: id === 'earth' ? 1.045 : 1.035,
        height: id === 'earth' ? 0.0065 : 0.008,
        strength: id === 'earth' ? 4.5 : 1.4,
      });
    } else {
      const atmosphereColor = mix(color(id === 'earth' ? '#ba5225' : '#7296b0'), color(id === 'earth' ? '#6ca9e5' : '#c88452'), facing.smoothstep(-0.3, 0.5));
      const alpha = rim.remap(0.65, 1, 1, 0).clamp().pow(3).mul(facing.smoothstep(-0.25, 0.6)).mul(0.7);
      atmosphere.outputNode = vec4(atmosphereColor, alpha);
    }
  }

  let clouds: THREE.MeshStandardNodeMaterial | undefined;
  if (id === 'earth' && maps.packed) {
    clouds = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, roughness: 1 });
    const coverage = texture(maps.packed, uv().add(vec3(cloudOffset, 0, 0).xy)).b;
    clouds.opacityNode = coverage.smoothstep(0.18, 0.9).mul(0.96).mul(cloudAmount);
    clouds.colorNode = mix(color('#76858d'), color('#fffdf5'), coverage.smoothstep(0.1, 0.6));
    clouds.normalNode = bumpMap(coverage, float(0.004));
    clouds.outputNode = vec4(mix(output.rgb, clouds.colorNode, unlit), output.a);
  }
  return { material, atmosphere, clouds, sunDirection, relief, cloudAmount, cloudOffset, radius, unlit };
}
