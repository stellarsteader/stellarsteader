"""Convert source feature centers into a compact, attributed display catalog (Python 3 stdlib)."""
import sys, json, zipfile, math, hashlib
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime, timezone

cache, destination = map(Path, sys.argv[1:3])
places, sources = [], []
types = {'AA': 'Crater', 'MO': 'Mountain', 'MA': 'Mare', 'PL': 'Plain', 'PM': 'Plateau',
         'VA': 'Valley', 'RE': 'Region', 'DO': 'Ridge', 'FO': 'Trough', 'SI': 'Bay', 'OC': 'Oceanus', 'RI': 'Rille', 'LC': 'Lake'}
for body in ['earth', 'moon', 'mars']:
    path = cache / (body + ('.json' if body == 'earth' else '.kmz'))
    raw = path.read_bytes()
    sources.append({'body': body, 'credit': 'Natural Earth' if body == 'earth' else 'USGS / IAU Gazetteer of Planetary Nomenclature',
                    'url': 'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/' if body == 'earth' else 'https://planetarynames.wr.usgs.gov/GIS_Downloads',
                    'downloadedAt': datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(),
                    'sha256': hashlib.sha256(raw).hexdigest()})
    if body == 'earth':
        for f in json.loads(raw)['features']:
            p = f['properties']; lon, lat = f['geometry']['coordinates'][:2]
            zoom = p.get('min_zoom') or 0
            places.append({'id': 'earth-ne-' + str(p['ne_id']), 'body': body, 'name': p['name'], 'kind': 'City',
                           'context': p.get('adm0name') or '', 'latitude': lat, 'longitude': lon,
                           'level': 0 if zoom <= 3 else 1 if zoom <= 5 else 2 if zoom <= 7 else 3,
                           'importance': math.log10(max(1, p.get('pop_max') or 1)),
                           'sourceUrl': sources[-1]['url']})
    else:
        with zipfile.ZipFile(path) as archive:
            root = ET.fromstring(archive.read(next(n for n in archive.namelist() if n.endswith('.kml'))))
        for f in root.findall('.//{*}Placemark'):
            fields = {node.attrib['name']: node.text for node in f.findall('.//{*}SimpleData')}
            if fields.get('approval') != 'Adopted by IAU':
                continue
            lon, lat = map(float, f.find('.//{*}Point/{*}coordinates').text.split(',')[:2])
            diameter = float(fields.get('diameter') or 0)
            source_url = fields['link'].replace('http:', 'https:')
            places.append({'id': body + '-usgs-' + source_url.rstrip('/').split('/')[-1], 'body': body,
                           'name': f.find('{*}name').text, 'kind': types.get(fields['code'], fields['type'].split(',')[0]),
                           'context': fields.get('quad_name') or '', 'latitude': lat, 'longitude': lon,
                           'diameterKm': diameter, 'level': 0 if diameter >= 350 else 1 if diameter >= 80 else 2 if diameter >= 12 else 3,
                           'importance': math.log10(max(1, diameter)) + (0.6 if fields['code'] != 'AA' else 0), 'sourceUrl': source_url})

unique = {}
for p in places:
    if not -90 <= p['latitude'] <= 90 or not -180 <= p['longitude'] <= 180:
        raise ValueError('Invalid feature: ' + p['id'])
    if p['id'] in unique and unique[p['id']] != p:
        raise ValueError('Conflicting duplicate feature: ' + p['id'])
    unique[p['id']] = p  # The source occasionally repeats an identical feature row.
places = list(unique.values())
destination.parent.mkdir(parents=True, exist_ok=True)
temporary = destination.with_suffix('.pending.json')
temporary.write_text(json.dumps({'schemaVersion': 1, 'sources': sources, 'places': places}, ensure_ascii=False, separators=(',', ':')))
temporary.replace(destination)
for body in ['earth', 'moon', 'mars']:
    print(body, sum(p['body'] == body for p in places), 'named locations')
