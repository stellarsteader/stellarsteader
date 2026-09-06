import type { Place } from './surface-map';

export type EventBody = 'moon' | 'mars' | 'phobos' | 'deimos';
export type EventCategory = 'landing' | 'spacecraft-impact' | 'natural-impact' | 'milestone';
export type EventSpot = {
  id: string; body: EventBody; name: string; category: EventCategory;
  date: string; occurredOn?: string; story: string;
  location: { latitude: number; longitude: number; precision: 'site' | 'region' | 'feature'; note: string } | null;
  sources: { label: string; url: string }[];
};
export const eventBodies: Record<EventBody, string> = { moon: 'Moon', mars: 'Mars', phobos: 'Phobos', deimos: 'Deimos' };
export const eventCategories: Record<EventCategory, { name: string; color: string; symbol: string }> = {
  landing: { name: 'Landings', color: '#c8e2c3', symbol: '⚑' },
  'spacecraft-impact': { name: 'Spacecraft impacts', color: '#f2b49b', symbol: '◇' },
  'natural-impact': { name: 'Natural impacts', color: '#e5cc91', symbol: '◉' },
  milestone: { name: 'Exploration firsts', color: '#a5d5ed', symbol: '✦' },
};
const nasaLanders = { label: 'NASA · Mars landing records', url: 'https://www.giss.nasa.gov/tools/mars24/help/landers.html' };
const usgs = (id: number) => ({ label: 'USGS · mapped feature', url: `https://planetarynames.wr.usgs.gov/Feature/${id}` });
const site = (latitude: number, longitude: number, note = 'Published site coordinates, rounded for this map.'): NonNullable<EventSpot['location']> => ({ latitude, longitude, precision: 'site', note });
const feature = (latitude: number, longitude: number, note = 'Marker indicates the feature center, not a precise impact point.'): NonNullable<EventSpot['location']> => ({ latitude, longitude, precision: 'feature', note });
const apollo = [
  [11, '1969-07-20', .674, 23.473, 'Tranquility Base', 'The first crewed landing on the Moon. Neil Armstrong and Buzz Aldrin explored the Sea of Tranquility.'],
  [12, '1969-11-19', -3.013, -23.422, 'Oceanus Procellarum', 'The second crewed lunar landing brought astronauts to Oceanus Procellarum.'],
  [14, '1971-02-05', -3.646, -17.472, 'Fra Mauro', 'Apollo 14 brought astronauts to the Fra Mauro region.'],
  [15, '1971-07-30', 26.132, 3.633, 'Hadley Rille', 'Apollo 15 explored the landscape beside Hadley Rille.'],
  [16, '1972-04-21', -8.973, 15.501, 'Descartes', 'Apollo 16 landed in the Descartes highlands.'],
  [17, '1972-12-11', 20.191, 30.772, 'Taurus–Littrow', 'The final Apollo landing explored the Taurus–Littrow valley.'],
] as const;
export const eventSpots: EventSpot[] = [
  ...apollo.map(([number, date, latitude, longitude, region, story]): EventSpot => ({
    id: `event-apollo-${number}`, body: 'moon', name: `Apollo ${number} · ${region}`, category: 'landing', date, occurredOn: date, story,
    location: site(latitude, longitude), sources: [
      { label: 'NASA · Apollo landing sites', url: 'https://science.nasa.gov/resource/apollo-landing-sites-with-moon-phases/' },
      { label: 'NASA · landing coordinates and dates', url: 'https://tfaws.nasa.gov/wp-content/uploads/TFAWS2024-PT-25.pdf' },
    ],
  })),
  { id: 'event-falcon-9', body: 'moon', name: 'Falcon 9 upper-stage impact', category: 'spacecraft-impact', date: '2026-08-05', occurredOn: '2026-08-05',
    story: 'A SpaceX Falcon 9 upper stage from the January 2025 Blue Ghost 1 launch struck the Moon. LRO later imaged a crater about 60 feet wide. This was a spent rocket stage, not a Starship landing.',
    location: null, sources: [{ label: 'NASA · LRO images the Falcon 9 crater', url: 'https://science.nasa.gov/solar-system/moon/nasas-lro-images-falcon-9-crater-on-moon-learns-new-details/' }] },
  { id: 'event-lcross', body: 'moon', name: 'LCROSS · Cabeus impact', category: 'spacecraft-impact', date: '2009-10-09', occurredOn: '2009-10-09',
    story: 'A deliberate impact near the south pole lofted material from the permanently shadowed floor of Cabeus. LCROSS was designed to search that material for water ice.',
    location: site(-84.68, -48.69, 'Centaur upper-stage impact coordinates in the lunar Mean Earth frame.'), sources: [{ label: 'NASA PDS · LCROSS observations and impact location', url: 'https://pds.nasa.gov/ds-view/pds/viewProfile.jsp?dsid=EAR-L-APO3.5M_AGILE-2-EDR-LCROSS-V1.0' }] },
  { id: 'event-rocket-2022', body: 'moon', name: 'Mystery rocket · double crater', category: 'spacecraft-impact', date: '2022-03-04', occurredOn: '2022-03-04',
    story: 'A rocket body struck near Hertzsprung and left two overlapping craters. NASA’s report did not establish the rocket’s origin; this is a different event from the 2026 Falcon 9 impact.',
    location: site(5.226, -125.514), sources: [{ label: 'NASA · double-crater impact report', url: 'https://www.nasa.gov/missions/lro/nasas-lunar-reconnaissance-orbiter-spots-rocket-impact-site-on-moon/' }] },
  { id: 'event-luna-25', body: 'moon', name: 'Luna 25 · probable impact site', category: 'spacecraft-impact', date: '2023-08-19', occurredOn: '2023-08-19',
    story: 'LRO found a new crater after Luna 25 was lost during its lunar approach. NASA identifies it as the likely impact site, rather than a confirmed identification.',
    location: site(-57.865, 61.360, 'Imaged crater; association with Luna 25 is probable.'), sources: [{ label: 'NASA · probable Luna 25 crater', url: 'https://www.nasa.gov/humans-in-space/nasas-lro-observes-crater-likely-from-luna-25-impact/' }] },
  { id: 'event-tycho', body: 'moon', name: 'Tycho · a young giant crater', category: 'natural-impact', date: 'About 108 million years ago · estimated',
    story: 'The impact that formed Tycho spread bright rays across the Moon. Its often-cited age depends on whether dated Apollo samples really came from this crater.',
    location: feature(-43.2958, -11.2153), sources: [usgs(6163), { label: 'NASA · Tycho and its estimated age', url: 'https://science.nasa.gov/resource/tycho-crater-on-the-moon-labeled/' }] },
  { id: 'event-viking-1', body: 'mars', name: 'Viking 1 · Chryse Planitia', category: 'landing', date: '1976-07-20', occurredOn: '1976-07-20',
    story: 'The first fully successful Mars landing established a long-lived surface station in Chryse Planitia.', location: site(22.27, -47.95), sources: [nasaLanders] },
  { id: 'event-curiosity', body: 'mars', name: 'Curiosity · Bradbury Landing', category: 'landing', date: '2012-08-06', occurredOn: '2012-08-06',
    story: 'Curiosity arrived in Gale crater. This marker records touchdown, not the rover’s later travels.', location: site(-4.59, 137.44), sources: [nasaLanders] },
  { id: 'event-insight', body: 'mars', name: 'InSight · Elysium Planitia', category: 'landing', date: '2018-11-26', occurredOn: '2018-11-26',
    story: 'InSight landed in Elysium Planitia. Its surface mission continued until dust severely reduced power from its solar panels.', location: site(4.50, 135.62), sources: [nasaLanders] },
  { id: 'event-perseverance', body: 'mars', name: 'Perseverance · Octavia E. Butler Landing', category: 'landing', date: '2021-02-18', occurredOn: '2021-02-18',
    story: 'Perseverance and its companion Ingenuity helicopter arrived in Jezero crater. This is the landing site, not a live rover position.', location: site(18.44, 77.45), sources: [nasaLanders] },
  { id: 'event-schiaparelli', body: 'mars', name: 'Schiaparelli · failed descent', category: 'spacecraft-impact', date: '2016-10-19', occurredOn: '2016-10-19',
    story: 'The ExoMars landing demonstrator hit Meridiani Planum after its descent sequence failed. Orbital images revealed new surface markings at the site.', location: site(-2.07, -6.21), sources: [{ label: 'ESA · Schiaparelli impact imagery', url: 'https://www.esa.int/About_Us/ESAC/Mars_Reconnaissance_Orbiter_views_Schiaparelli_landing_site' }] },
  { id: 'event-ingenuity', body: 'mars', name: 'Ingenuity · first powered flight', category: 'milestone', date: '2021-04-19', occurredOn: '2021-04-19',
    story: 'Ingenuity made the first powered, controlled flight on another planet at Wright Brothers Field in Jezero. This marker locates the Jezero region; it does not pinpoint the airfield.',
    location: { ...feature(18.4082, 77.6873), precision: 'region', note: 'Regional marker at Jezero’s center. Exact airfield coordinates are not established by the linked sources.' },
    sources: [{ label: 'NASA · historic first flight', url: 'https://www.nasa.gov/news-release/nasas-ingenuity-mars-helicopter-succeeds-in-historic-first-flight/' }, usgs(14300)] },
  { id: 'event-hellas', body: 'mars', name: 'Hellas · giant basin-forming impact', category: 'natural-impact', date: 'About 4 billion years ago · estimated',
    story: 'An ancient impact excavated the immense Hellas basin. Its preserved geology records a much earlier era of Mars.', location: feature(-42.4301, 70.5025),
    sources: [usgs(2432), { label: 'NASA · ancient Martian impact basins', url: 'https://science.gsfc.nasa.gov/attic/sunearthday.nasa.gov/2012/transit/mars.php' }] },
  { id: 'event-stickney', body: 'phobos', name: 'Stickney · Phobos’s largest crater', category: 'natural-impact', date: 'Formation date unknown',
    story: 'A major impact carved the roughly 9-kilometer Stickney crater into this small moon. The name honors Angeline Stickney Hall.',
    location: feature(1, -49, 'USGS feature center; source uses planetographic latitude and west-positive longitude. Atlas longitude is converted to east-positive.'),
    sources: [usgs(5707), { label: 'ESA · Phobos’s scarred surface', url: 'https://www.esa.int/Science_Exploration/Space_Science/Mars_Express/Mars_Express_tracks_the_phases_of_Phobos' }] },
  { id: 'event-voltaire', body: 'deimos', name: 'Voltaire · impact scar', category: 'natural-impact', date: 'Formation date unknown',
    story: 'This 1.9-kilometer crater is one of Deimos’s named impact scars. Its name honors the French writer Voltaire.',
    location: feature(22, -3.5, 'USGS feature center, planetographic latitude; west-positive source longitude converted to east-positive.'), sources: [usgs(6431)] },
  { id: 'event-swift', body: 'deimos', name: 'Swift · impact scar', category: 'natural-impact', date: 'Formation date unknown',
    story: 'A roughly 1-kilometer crater records another impact on Deimos. It is named for the writer Jonathan Swift.',
    location: feature(12.5, 1.8, 'USGS feature center, planetographic latitude; 358.2° west becomes 1.8° east.'), sources: [usgs(5789)] },
];

export function filterEvents(body: EventBody, category: EventCategory | 'all' = 'all', query = '') {
  const normalized = query.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
  return eventSpots.filter(event => event.body === body && (category === 'all' || event.category === category)
    && `${event.name} ${event.story} ${event.date}`.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().includes(normalized));
}
export function eventPlace(event: EventSpot): Place | undefined {
  if (!event.location || (event.body !== 'moon' && event.body !== 'mars')) return;
  return { id: event.id, eventId: event.id, body: event.body, name: event.name.split(' · ')[0], kind: eventCategories[event.category].name, context: event.date,
    latitude: event.location.latitude, longitude: event.location.longitude, level: event.location.precision === 'site' ? 3 : 1,
    importance: 10, sourceUrl: event.sources[0].url };
}
