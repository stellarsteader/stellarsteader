import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Sphere } from 'three';
import { normalizeModel, satelliteModels } from './satellite-models';

test('NASA model assets match their recorded source checksums and contain embedded geometry', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/models/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.models.length, satelliteModels.size);
  for (const asset of manifest.models) {
    const source = satelliteModels.get(asset.id)!;
    assert.equal(asset.url, source.url);
    const bytes = readFileSync(new URL(`../public${source.path}`, import.meta.url));
    assert.equal(bytes.length, asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
    assert.equal(bytes.readUInt32LE(4), 2);
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    assert.ok(gltf.meshes.length > 0);
    assert.ok(gltf.buffers.every((b: { uri?: string }) => !b.uri));
    assert.ok((gltf.images ?? []).every((i: { uri?: string }) => !i.uri));
  }
});

test('Model normalization centers translated hierarchies and preserves proportions', () => {
  const root = new Group(), nested = new Group();
  root.position.set(10, -30, 2); nested.position.set(-3, 8, 5); nested.rotation.z = .3;
  const mesh = new Mesh(new BoxGeometry(2, 4, 6), new MeshStandardMaterial());
  nested.add(mesh); root.add(nested);
  const result = normalizeModel(root); result.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(result).getBoundingSphere(new Sphere());
  assert.ok(bounds.center.length() < 1e-10);
  assert.ok(Math.abs(bounds.radius - 1) < 1e-10);
  assert.equal(mesh.scale.x, mesh.scale.y);
  mesh.geometry.dispose(); (mesh.material as MeshStandardMaterial).dispose();
});

test('Empty model geometry cannot produce invalid scene transforms', () => {
  assert.throws(() => normalizeModel(new Group()), /invalid bounds/);
});
