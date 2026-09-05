import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadSatelliteModel, satelliteModels } from './satellite-models';

export class SatelliteModelPreview {
  private renderer: THREE.WebGLRenderer;
  private scene=new THREE.Scene();
  private camera=new THREE.PerspectiveCamera(35,1,.01,100);
  private controls: OrbitControls;
  private model?: THREE.Group;
  private environment: THREE.WebGLRenderTarget;
  private resizeObserver: ResizeObserver;
  private animation=0;
  private generation=0;
  private id='';
  private active=false;
  rotationEnabled=!matchMedia('(prefers-reduced-motion: reduce)').matches;
  private sun=new THREE.DirectionalLight('#fff0dc',2.6);
  private hemisphere=new THREE.HemisphereLight('#e3efff','#566372',1.1);
  private fill=new THREE.AmbientLight('#ffffff',0);
  private lastFrame=0;
  private disposed=false;
  private interacting=false;
  private resumeRotationAt=0;
  onStatus?: (status: string,ready: boolean) => void;
  constructor(private host: HTMLElement) {
    this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure=1.0;
    this.host.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label','Interactive 3D appearance model. Drag to rotate and scroll to zoom.');
    this.renderer.domElement.setAttribute('role','img');
    this.camera.position.set(1.5,.8,2.4);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableDamping=true; this.controls.enablePan=false;
    this.controls.autoRotateSpeed=.3; // One full inspection turn in about 200 seconds.
    this.controls.addEventListener('start',()=> { this.interacting=true; });
    this.controls.addEventListener('end',()=> { this.interacting=false; this.resumeRotationAt=performance.now()+2500; });
    this.controls.minDistance=1.6; this.controls.maxDistance=9;
    this.controls.addEventListener('change',this.draw);
    const environmentScene=new RoomEnvironment();
    const pmrem=new THREE.PMREMGenerator(this.renderer);
    this.environment=pmrem.fromScene(environmentScene,.04);
    this.scene.environment=this.environment.texture; environmentScene.dispose(); pmrem.dispose();
    this.sun.position.set(3,4,5); this.scene.add(this.sun,this.hemisphere,this.fill);
    this.resizeObserver=new ResizeObserver(()=>this.resize()); this.resizeObserver.observe(host);
    document.addEventListener('visibilitychange',this.visibility);
    this.resize();
  }
  private resize() {
    const width=this.host.clientWidth,height=this.host.clientHeight;
    if(!width||!height) return;
    this.renderer.setSize(width,height,false); this.camera.aspect=width/height; this.camera.updateProjectionMatrix(); this.draw();
  }
  setShadowsEnabled(enabled: boolean) {
    this.sun.intensity=enabled?2.6:0; this.hemisphere.intensity=enabled?1.1:0;
    this.fill.intensity=enabled?0:3; this.scene.environment=enabled?this.environment.texture:null;
    this.draw();
  }
  setActive(active: boolean) { this.active=active; this.visibility(); }
  private visibility=()=> {
    cancelAnimationFrame(this.animation); this.lastFrame=0;
    if(this.active&&!document.hidden&&!this.disposed) this.animation=requestAnimationFrame(this.tick);
  };
  private tick=(time: number)=> {
    if(!this.active||document.hidden||this.disposed) return;
    if(time-this.lastFrame>32) {
      const delta=this.lastFrame?Math.min(.1,(time-this.lastFrame)/1000):0;
      this.controls.autoRotate=!!this.model&&this.rotationEnabled&&!this.interacting&&time>=this.resumeRotationAt;
      this.controls.update(delta); this.lastFrame=time;
    }
    this.animation=requestAnimationFrame(this.tick);
  };
  private draw=()=> { if(this.active&&!this.disposed) this.renderer.render(this.scene,this.camera); };
  async select(id: string) {
    if(id===this.id) { this.resize(); return; }
    this.id=id; const generation=++this.generation;
    this.model?.removeFromParent(); this.model=undefined; this.draw();
    this.host.dataset.modelState='loading';
    if(!satelliteModels.has(id)) { this.onStatus?.('No verified 3D model is included for this object yet.',false); this.host.dataset.modelState='unavailable'; return; }
    this.onStatus?.('Loading NASA 3D model…',false);
    try {
      const model=await loadSatelliteModel(id);
      if(generation!==this.generation||this.disposed) return;
      model.rotation.set(.18,.45,-.2); this.model=model; this.scene.add(model);
      const angle: Record<string, [number, number, number]> = { mro: [2.6,1.2,1.3], iss: [1.6,2.1,1.5], lro: [1.5,1.3,2.2], odyssey: [2.1,1.5,1.5], maven: [1.2,2.3,1.5] };
      this.camera.position.set(...(angle[id] ?? [1.5,.8,2.4])); this.controls.target.set(0,0,0); this.controls.update();
      this.host.dataset.modelState='ready'; this.host.dataset.modelId=id;
      this.onStatus?.('',true);
      this.resize();
    } catch {
      if(generation!==this.generation) return;
      this.host.dataset.modelState='error'; this.onStatus?.('The 3D model could not load. Orbit data remains available.',false);
    }
  }
  dispose() {
    this.disposed=true; this.generation++; cancelAnimationFrame(this.animation); this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange',this.visibility); this.controls.dispose(); this.environment.dispose();
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
