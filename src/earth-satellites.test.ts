import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { OMMJsonObject } from 'satellite.js';
import { earthSatellites, satellitePosition, type EarthCatalog } from './satellites';
import { classifyOrbit, orbitCounts, matchesOrbit, matchesSatelliteSearch, orbitTypes, orbitMetrics } from './satellite-orbits';
import { prepareEarth, propagateEarth } from './earth-propagation';
import { bodies } from './astronomy';

const raw = JSON.parse(readFileSync(new URL('../public/data/earth-satellites.json', import.meta.url),'utf8')) as EarthCatalog;
const items = earthSatellites(raw);
const synthetic = (altitude: number, eccentricity=0, inclination=0) => ({ omm: {
  MEAN_MOTION: Math.sqrt(398600.4418 / Math.pow(6371+altitude,3))*86400/(2*Math.PI), ECCENTRICITY: eccentricity, INCLINATION: inclination,
} as OMMJsonObject });

test('Earth catalog is extensive, unique, accepts modern NORAD IDs, and retains original provenance', () => {
  assert.ok(items.length>10000);
  assert.equal(new Set(items.map(s=>s.catalogId)).size, items.length);
  assert.ok(items.some(s=>s.catalogId!>=100000));
  assert.equal(items.find(s=>s.catalogId===25544)?.id,'iss');
  assert.equal(items.find(s=>s.catalogId===48274)?.id,'tiangong');
  assert.equal(items.find(s=>s.catalogId===20580)?.id,'hubble');
  assert.ok(items.every(s=>s.fetchedAt===raw.fetchedAt && s.provider==='celestrak'));
  assert.throws(()=>earthSatellites({...raw, records:[raw.records[0],raw.records[0]]}),/Invalid Earth/);
});

test('Orbit classes distinguish altitude, synchronous inclination, and eccentricity', () => {
  assert.equal(classifyOrbit(synthetic(400,0,51.6)),'leo');
  assert.equal(classifyOrbit(synthetic(1999)),'leo');
  assert.equal(classifyOrbit(synthetic(2001)),'meo');
  assert.equal(classifyOrbit(synthetic(20200,0.005,55)),'meo');
  assert.equal(classifyOrbit(synthetic(35786,0.001,0.1)),'geo');
  assert.equal(classifyOrbit(synthetic(35786,0.001,20)),'gso');
  assert.equal(classifyOrbit(synthetic(35786,0.4,20)),'gso');
  assert.equal(classifyOrbit(synthetic(20000,0.7,63.4)),'heo');
  assert.equal(classifyOrbit(synthetic(40000,0.02,20)),'other');
  assert.equal(classifyOrbit(synthetic(2000,0.05,10)),'other');
});

test('Orbit filter counts partition the full catalog without duplicates or omissions', () => {
  const counts=orbitCounts(items);
  assert.equal(counts.all,items.length);
  assert.equal(orbitTypes.filter(t=>t!=='all').reduce((sum,t)=>sum+counts[t],0),items.length);
  for(const filter of orbitTypes) assert.equal(items.filter(s=>matchesOrbit(s,filter)).length,counts[filter]);
  for(const type of ['leo','meo','geo','gso','heo'] as const) assert.ok(counts[type]>0,type);
});

test('Search accepts familiar mission names and NORAD IDs while retaining source names', () => {
  assert.ok(matchesSatelliteSearch(items.find(s=>s.id==='hubble')!, 'Hubble'));
  assert.ok(matchesSatelliteSearch(items.find(s=>s.id==='tiangong')!, 'tiangong'));
  assert.ok(matchesSatelliteSearch(items.find(s=>s.id==='iss')!, '25544'));
  assert.ok(items.filter(s=>matchesSatelliteSearch(s,'GPS')).length>20);
  assert.equal(items.filter(s=>matchesSatelliteSearch(s,'nonexistent-satellite-xyz')).length,0);
});

test('Worker batch positions agree with individual SGP4 in each orbit class', () => {
  const representatives=orbitTypes.filter(t=>t!=='all').map(type=>items.find(s=>classifyOrbit(s)===type)!);
  const time=Date.parse(raw.fetchedAt), packed=propagateEarth(prepareEarth(representatives),time);
  for(let i=0;i<representatives.length;i++) {
    const expected=satellitePosition(representatives[i],new Date(time));
    assert.ok(expected,representatives[i].id);
    const actual=[packed[i*3],packed[i*3+1],packed[i*3+2]].map(n=>n*bodies.earth.radius);
    assert.ok(Math.hypot(actual[0]-expected.x,actual[1]-expected.y,actual[2]-expected.z)<0.01,representatives[i].id);
  }
});

test('Bulk propagation hides missing coverage and invalid records instead of producing frozen markers', () => {
  const representative=items.find(s=>s.id==='iss')!, entries=prepareEarth([representative]);
  const epoch=Date.parse(representative.epoch!);
  for(const t of [epoch-7*86400000-1,epoch+7*86400000+1]) assert.ok([...propagateEarth(entries,t)].every(Number.isNaN));
  assert.ok([...propagateEarth([{record:null,start:0,stop:Infinity}],epoch)].every(Number.isNaN));
});

test('Full catalog batch produces only finite above-surface positions or absent entries', () => {
  const packed=propagateEarth(prepareEarth(items),Date.parse(raw.fetchedAt));
  let rendered=0;
  for(let i=0;i<items.length;i++) {
    const point=[...packed.subarray(i*3,i*3+3)];
    if(Number.isNaN(point[0])) { assert.ok(point.every(Number.isNaN)); continue; }
    assert.ok(point.every(Number.isFinite),items[i].id);
    assert.ok(Math.hypot(...point)>=1,items[i].id);
    rendered++;
  }
  assert.ok(rendered>10000);
  console.log(`Earth catalog: ${items.length} records, ${rendered} valid snapshot positions. Classes: ${JSON.stringify(orbitCounts(items))}`);
  assert.ok(orbitMetrics(items.find(s=>s.id==='iss')!).apogee<600);
});
