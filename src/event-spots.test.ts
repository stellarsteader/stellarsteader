import test from 'node:test';
import assert from 'node:assert/strict';
import { Object3D, PerspectiveCamera } from 'three';
import { eventSpots, eventPlace, filterEvents, eventBodies } from './event-spots';
import { SurfaceMap } from './surface-map';

test('Every event has a unique identity, a supported world, and a primary source',()=>{
  assert.equal(new Set(eventSpots.map(event=>event.id)).size,eventSpots.length);
  for(const event of eventSpots) {
    assert.match(event.id,/^event-[a-z0-9-]+$/);assert.ok(event.body in eventBodies);
    assert.ok(event.sources.length && event.story && event.date);
    for(const source of event.sources) {
      const url=new URL(source.url);assert.equal(url.protocol,'https:');
      assert.ok(/(^|\.)(nasa\.gov|esa\.int|usgs\.gov)$/.test(url.hostname));
    }
    if(event.location)assert.ok(Math.abs(event.location.latitude)<=90 && Math.abs(event.location.longitude)<=180 && event.location.note);
    if(event.occurredOn)assert.equal(new Date(event.occurredOn).toISOString().slice(0,10),event.occurredOn);
    if(event.category==='natural-impact')assert.equal(event.occurredOn,undefined,'Estimated geological ages are not exact calendar dates');
  }
});
test('Mission sites retain the correct hemisphere and date across east/west conventions',()=>{
  const get=(id:string)=>eventSpots.find(event=>event.id===id)!;
  assert.equal(get('event-apollo-11').occurredOn,'1969-07-20');
  assert.ok(get('event-apollo-11').location!.longitude>0);
  assert.ok(Math.abs(get('event-rocket-2022').location!.longitude-(234.486-360))<1e-10);
  assert.ok(Math.abs(get('event-schiaparelli').location!.longitude-(353.79-360))<1e-10);
  assert.equal(get('event-stickney').location!.longitude,-49);
  assert.equal(get('event-voltaire').location!.longitude,-3.5);
  assert.ok(Math.abs(get('event-swift').location!.longitude-(360-358.2))<1e-10);
});
test('Unknown sites never create a fabricated map pin; moon atlas points never appear on Mars',()=>{
  const unknown=eventSpots.find(event=>event.id==='event-falcon-9')!;
  assert.equal(unknown.location,null);assert.equal(eventPlace(unknown),undefined);
  for(const body of ['phobos','deimos'] as const) {
    assert.ok(filterEvents(body).length);
    for(const event of filterEvents(body))assert.equal(eventPlace(event),undefined);
  }
  assert.equal(eventSpots.find(e=>e.id==='event-ingenuity')!.location!.precision,'region');
});
test('Event filters combine world, category and search without leaking other worlds',()=>{
  assert.equal(filterEvents('moon','landing').length,6);
  assert.deepEqual(filterEvents('moon','all','  UPPER-STAGE  ').map(e=>e.id),['event-falcon-9']);
  assert.equal(filterEvents('mars','natural-impact','Hellas').length,1);
  assert.equal(filterEvents('mars','landing','Apollo').length,0);
  assert.equal(filterEvents('deimos','landing').length,0);
});
test('Event markers remain discoverable at every zoom while still respecting the horizon',()=>{
  const surface=new Object3D();surface.updateMatrixWorld(true);
  const camera=new PerspectiveCamera(35,1.6,.001,1000),map=new SurfaceMap();
  const source=eventPlace(eventSpots.find(e=>e.id==='event-apollo-11')!)!;
  for(const radius of [5,2,1.2]) {
    camera.position.set(0,0,radius);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
    map.setPlaces([{...source,name:'Apollo 11',latitude:0,longitude:-90},{...source,id:'event-hidden',latitude:0,longitude:90}]);
    assert.deepEqual(map.update(surface,camera,1440,900,1737.4).labels.filter(l=>l.visible).map(l=>l.place.id),[source.id]);
  }
});
