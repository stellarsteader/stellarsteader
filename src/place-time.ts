import tzLookup from '@photostructure/tz-lookup';
import { physicalState, solarTime } from './astronomy';
import type { Place } from './surface-map';

type Location = Pick<Place, 'body' | 'latitude' | 'longitude'>;
const zones = new Map<string, string>();
const formatters = new Map<string, Intl.DateTimeFormat>();

export function placeLocalTime(place: Location, date: Date, subsolarLongitude?: number) {
  if (place.body !== 'earth') {
    const sun = subsolarLongitude ?? physicalState(place.body, date).subsolarLongitude;
    return { label: 'Local solar time', time: solarTime(place.longitude, sun),
      detail: 'Solar noon at 12:00', zone: '', description: 'A 24-hour solar clock across one local solar day.' };
  }
  try {
    const key = `${place.latitude},${place.longitude}`;
    let zone = zones.get(key);
    if (!zone) { zone = tzLookup(place.latitude, place.longitude); zones.set(key, zone); }
    let formatter = formatters.get(zone);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23',
        year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });
      formatters.set(zone, formatter);
    }
    const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
    return { label: 'Local time', time: `${parts.hour}:${parts.minute}:${parts.second}`,
      detail: `${parts.month} ${parts.day}, ${parts.year} · ${parts.timeZoneName}`, zone,
      description: `Time zone estimated from coordinates: ${zone}. Daylight-saving rules follow the scene date.` };
  } catch {
    return { label: 'Local time', time: 'Unavailable', detail: 'Time zone could not be resolved', zone: '', description: '' };
  }
}
