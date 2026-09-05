import * as THREE from 'three';
import { satelliteModels, loadSatelliteModel } from './satellite-models';
import { satellitePosition, type Satellite } from './satellites';
import { bodies } from './astronomy';

// One detailed, enlarged selected-object model. The full Earth catalog remains
// instanced markers; geometry is never duplicated thousands of times.
export class OrbitSatelliteModel {
  readonly root=new THREE.Group();
  private id='';
  private generation=0;
  ready=false;
  constructor() { this.root.visible=false; }
  select(id: string) {
    if(id===this.id) return;
    this.id=id; const generation=++this.generation;
    this.root.clear(); this.root.visible=false; this.ready=false;
    if(!satelliteModels.has(id)) return;
    void loadSatelliteModel(id).then(model=> {
      if(generation!==this.generation) return;
      model.rotation.set(.18,.45,-.2);
      this.root.add(model); this.ready=true;
    }).catch(()=> { /* The existing marker remains the loading/error fallback. */ });
  }
  update(satellite: Satellite | undefined,date: Date,camera?: THREE.Camera,height=900) {
    this.select(satellite?.id??'');
    const position=this.ready&&satellite ? satellitePosition(satellite,date) : null;
    this.root.visible=!!position;
    if(!position||!satellite) return;
    this.root.position.copy(position).divideScalar(bodies[satellite.parent].radius);
    const localCamera=camera&&this.root.parent?.worldToLocal(camera.position.clone());
    // Roughly 24 pixels across, enlarged for identification rather than true size.
    const scale=localCamera?localCamera.distanceTo(this.root.position)*7.5/height:.04;
    this.root.scale.setScalar(scale);
  }
  hit(raycaster: THREE.Raycaster) {
    if(!this.root.visible) return;
    const hit=raycaster.intersectObject(this.root,true)[0];
    return hit?{id:this.id,distance:hit.distance}:undefined;
  }
  dispose() { this.generation++; this.root.clear(); this.root.removeFromParent(); }
}
