import { eventBodies, eventCategories, eventSpots, filterEvents, type EventBody, type EventCategory, type EventSpot } from './event-spots';
import { SatelliteModelPreview } from './satellite-model-preview';
import type { BodyId } from './astronomy';
const escape = (text: string) => text.replace(/[&<>"']/g, value => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[value]!));
export const eventPanelMarkup = `
<section id="event-explorer" class="event-explorer" aria-label="Event spots" hidden>
  <div class="event-controls">
    <label>Explore <select id="event-world" aria-label="Event world">${Object.entries(eventBodies).map(([id,name])=>`<option value="${id}">${name}</option>`).join('')}</select></label>
    <label>Show <select id="event-category" aria-label="Event category"><option value="all">All events</option>${Object.entries(eventCategories).map(([id,type])=>`<option value="${id}">${type.name}</option>`).join('')}</select></label>
    <input type="search" id="event-search" aria-label="Search event spots" placeholder="Search missions, craters…" autocomplete="off">
  </div>
  <section id="event-detail" class="place-detail event-detail" aria-labelledby="event-title" hidden>
    <button id="close-event-detail" class="place-detail-close" aria-label="Close event details">×</button>
    <p id="event-kind" class="map-section-title"></p><h3 id="event-title" tabindex="-1"></h3>
    <p id="event-date" class="event-date"></p><p id="event-story"></p>
    <p id="event-location"></p><p id="event-accuracy" class="event-accuracy"></p>
    <button id="event-refocus" class="secondary-button">Center this site ↗</button>
    <div id="event-sources" class="event-sources"></div>
  </section>
  <section id="event-moon-atlas" class="event-moon-atlas" aria-label="Martian moon coordinate atlas" hidden>
    <p id="event-atlas-title" class="map-section-title"></p>
    <p class="map-hint">Select an impact scar. Formation dates are unknown.</p>
    <div id="event-atlas" class="event-atlas" aria-label="Published crater coordinates"></div>
    <p class="event-atlas-caption">Coordinate locator · north up · east-positive longitude</p>
    <details id="event-shape"><summary>Explore the NASA 3D shape</summary><div id="event-model-preview"></div><p id="event-model-status" role="status"></p><p class="map-hint">Shape reference. Site coordinates are shown in the locator above.</p><div class="event-sources"><a id="event-model-source" target="_blank" rel="noopener noreferrer">NASA · 3D model source ↗</a></div></details>
  </section>
  <p id="event-count" class="map-section-title" aria-live="polite"></p>
  <div id="event-list" class="place-list" aria-label="Historic events"></div>
  <p class="event-catalog-note">A curated history, independent of simulation time. Tiny spacecraft and fresh craters may be smaller than the terrain resolution.</p>
</section>`;

export class EventPanel {
  body: EventBody = 'moon';
  selected?: EventSpot;
  private active = false;
  private preview?: SatelliteModelPreview;
  private root = document.querySelector<HTMLElement>('#event-explorer')!;
  private get<T extends HTMLElement = HTMLElement>(selector: string) { return this.root.querySelector<T>(selector)!; }
  constructor(private callbacks: { select: (event: EventSpot) => void; clear: () => void; world: (body: EventBody) => void; change: () => void }) {
    this.get<HTMLSelectElement>('#event-world').onchange = event => {
      this.body = (event.target as HTMLSelectElement).value as EventBody;
      this.clear(); this.callbacks.world(this.body); this.render(); this.callbacks.change();
    };
    for (const id of ['#event-category','#event-search']) this.get(id).addEventListener(id==='#event-search'?'input':'change',()=> { this.clear(); this.render(); this.callbacks.change(); });
    this.get('#event-list').onclick = event => this.click(event);
    this.get('#event-atlas').onclick = event => this.click(event);
    this.get('#close-event-detail').onclick = () => {
      const id = this.selected?.id; this.clear();
      const row = id && this.root.querySelector<HTMLElement>(`#event-list [data-event="${id}"]`);
      (row || this.get('#event-search')).focus({ preventScroll: true });
    };
    this.get('#event-refocus').onclick = () => { if(this.selected)this.callbacks.select(this.selected); };
    this.get('#event-shape').addEventListener('toggle',()=>this.updatePreview());
  }
  get events() { return filterEvents(this.body, this.get<HTMLSelectElement>('#event-category').value as EventCategory|'all', this.get<HTMLInputElement>('#event-search').value); }
  context(body: BodyId, active: boolean) {
    const parent = this.body==='moon'?'moon':'mars';
    if(body!==parent) { this.body=body==='moon'?'moon':'mars';this.selected=undefined; }
    this.active=active;this.root.hidden=!active;this.render();
  }
  clear() { this.selected=undefined;this.callbacks.clear();this.render(); }
  select(id: string) {
    const event=eventSpots.find(spot=>spot.id===id && spot.body===this.body);if(!event)return;
    this.callbacks.select(event);this.selected=event;this.render();this.get('#event-title').focus({preventScroll:true});
  }
  private click(event: MouseEvent) { const button=(event.target as HTMLElement).closest<HTMLElement>('[data-event]');if(button)this.select(button.dataset.event!); }
  private render() {
    this.get<HTMLSelectElement>('#event-world').value=this.body;
    this.get('#event-detail').hidden=!this.selected;
    if(this.selected) {
      const event=this.selected,type=eventCategories[event.category],position=event.location;
      this.get('#event-kind').textContent=`${type.symbol} ${type.name} · ${eventBodies[event.body]}`;
      this.get('#event-title').textContent=event.name;
      this.get('#event-date').textContent=event.occurredOn ? new Date(event.occurredOn+'T00:00:00Z').toLocaleDateString('en-US',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}) : event.date;
      this.get('#event-story').textContent=event.story;
      this.get('#event-location').textContent=position ? `${Math.abs(position.latitude).toFixed(3)}° ${position.latitude<0?'S':'N'} · ${Math.abs(position.longitude).toFixed(3)}° ${position.longitude<0?'W':'E'}` : 'Exact location not published in the linked report';
      this.get('#event-accuracy').textContent=position?.note ?? 'This event has no map pin. Its location has not been guessed.';
      this.get('#event-refocus').hidden=!position || event.body==='phobos' || event.body==='deimos';
      this.get('#event-sources').innerHTML=event.sources.map(source=>`<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.label)} ↗</a>`).join('');
    }
    const entries=this.events;
    this.get('#event-count').textContent=`${entries.length} event${entries.length===1?'':'s'} · ${eventBodies[this.body]}`;
    this.get('#event-list').innerHTML=entries.length ? entries.map(event=>{
      const type=eventCategories[event.category];
      return `<button class="place-row event-row${this.selected?.id===event.id?' active':''}" data-event="${event.id}" aria-pressed="${this.selected?.id===event.id}" style="--event-color:${type.color}"><span class="event-symbol" aria-hidden="true">${type.symbol}</span><span>${escape(event.name)}<small>${escape(event.date)}${event.location ? event.location.precision==='region'?' · Region':'' : ' · Unmapped'}</small></span></button>`;
    }).join('') : '<p class="map-hint">No events match. Try another category or search.</p>';
    const small=this.body==='phobos'||this.body==='deimos';
    this.get('#event-moon-atlas').hidden=!small;
    if(small) {
      this.get('#event-atlas-title').textContent=`${eventBodies[this.body]} · impact atlas`;
      this.get<HTMLAnchorElement>('#event-model-source').href=`https://science.nasa.gov/resource/${this.body}-mars-moon-3d-model/`;
      // A geographic locator is intentionally separate from the NASA appearance
      // mesh: those assets do not publish a verified cartographic transform.
      const points=filterEvents(this.body).map(event=>event.location!);
      const north=Math.min(90,Math.max(...points.map(p=>p.latitude))+20),south=Math.max(-90,Math.min(...points.map(p=>p.latitude))-20);
      const west=Math.max(-180,Math.min(...points.map(p=>p.longitude))-30),east=Math.min(180,Math.max(...points.map(p=>p.longitude))+30);
      const coord=(value:number,axis:'lat'|'lon')=>`${Math.abs(value).toFixed(1)}° ${axis==='lat'?(value<0?'S':'N'):(value<0?'W':'E')}`;
      this.get('#event-atlas').innerHTML=`<span class="atlas-north">${coord(north,'lat')}</span><span class="atlas-south">${coord(south,'lat')}</span><span class="atlas-west">${coord(west,'lon')}</span><span class="atlas-east">${coord(east,'lon')}</span>`+entries.filter(e=>e.location).map(event=>{
        const p=event.location!;return `<button class="atlas-pin${this.selected?.id===event.id?' active':''}" style="left:${(p.longitude-west)/(east-west)*100}%;top:${(north-p.latitude)/(north-south)*100}%" data-event="${event.id}" aria-pressed="${this.selected?.id===event.id}" aria-label="Select ${escape(event.name)}" title="${escape(event.name)}">◉<span>${escape(event.name.split(' · ')[0])}</span></button>`;
      }).join('');
    }
    this.updatePreview();
  }
  private updatePreview() {
    const active=this.active&&(this.body==='phobos'||this.body==='deimos')&&this.get<HTMLDetailsElement>('#event-shape').open;
    if(active&&!this.preview) {
      try { this.preview=new SatelliteModelPreview(this.get('#event-model-preview'));this.preview.rotationEnabled=false;this.preview.onStatus=status=>{this.get('#event-model-status').textContent=status;}; }
      catch {this.get('#event-model-status').textContent='3D preview unavailable. The coordinate atlas and sources remain available.';}
    }
    this.preview?.setActive(active);
    if(active)void this.preview?.select(this.body);
  }
  dispose() {this.preview?.dispose();}
}
