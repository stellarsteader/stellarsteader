import * as THREE from 'three/webgpu';
import { Fn, If, float, uniform, texture, normalWorldGeometry, mix } from 'three/tsl';
import { bodies, type BodyId } from './astronomy';
import { SUN_RADIUS_KM } from './orbit-lighting';

/** Fraction of a uniform solar disk visible past a spherical occluder. */
const solarVisibility = Fn(([sun, blocker, radius]: [THREE.Node<'vec3'>, THREE.Node<'vec3'>, THREE.Node<'float'>]) => {
  const visible = float(1).toVar();
  If(radius.greaterThan(0).and(blocker.length().lessThan(sun.length())), () => {
    const a = float(SUN_RADIUS_KM).div(sun.length()).clamp(0, 1).asin();
    const b = radius.div(blocker.length()).clamp(0, 1).asin();
    const s = sun.normalize(), o = blocker.normalize();
    // atan2 is stable for the very small angular separations in eclipses.
    const d = s.cross(o).length().atan(s.dot(o)).toVar();
    If(d.lessThan(a.add(b)), () => {
      If(d.lessThanEqual(a.sub(b).abs()), () => {
        visible.assign(float(1).sub(b.mul(b).div(a.mul(a)).min(1)));
      }).Else(() => {
        const aa = a.mul(a), bb = b.mul(b), dd = d.mul(d);
        const x = dd.add(aa).sub(bb).div(d.mul(a).mul(2)).clamp(-1, 1).acos();
        const y = dd.add(bb).sub(aa).div(d.mul(b).mul(2)).clamp(-1, 1).acos();
        const area = aa.mul(x).add(bb.mul(y)).sub(
          d.negate().add(a).add(b).mul(d.add(a).sub(b)).mul(d.sub(a).add(b)).mul(d.add(a).add(b)).max(0).sqrt().mul(0.5),
        );
        visible.assign(float(1).sub(area.div(aa.mul(Math.PI))).clamp(0, 1));
      });
    });
  });
  return visible;
});

export function orbitMaterial(id: BodyId, day: THREE.Texture, night?: THREE.Texture) {
  const sun = uniform(new THREE.Vector3(1e8, 0, 0));
  const occluder = uniform(new THREE.Vector3(0, 0, 1));
  const occluderRadius = uniform(0);
  const unlit = uniform(0);
  const normal = normalWorldGeometry.normalize();
  // Evaluate light at physical surface coordinates, never at enlarged marker positions.
  const surface = normal.mul(bodies[id].radius);
  const sunlight = sun.sub(surface);
  const facing = normal.dot(sunlight.normalize());
  const visibility = solarVisibility(sunlight, occluder.sub(surface), occluderRadius);
  const daylight = facing.max(0).mul(visibility);
  const base = texture(day).rgb;
  let shaded = base.mul(daylight.mul(1.25).add(0.004));
  if (id === 'earth' && night) {
    const darkness = facing.smoothstep(-0.12, 0.04).oneMinus();
    shaded = shaded.add(texture(night).rgb.mul(darkness).mul(0.35));
  }
  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = mix(shaded, base, unlit);
  return { material, sun, occluder, occluderRadius, unlit };
}
