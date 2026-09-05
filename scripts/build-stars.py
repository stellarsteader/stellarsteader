"""Build the bundled HYG v4.1 naked-eye subset from an upstream CSV.
Usage: python3 scripts/build-stars.py /path/to/hygdata_v41.csv
Source: https://github.com/astronexus/HYG-Database/blob/main/hyg/CURRENT/hygdata_v41.csv
"""
import csv
import json
import pathlib
import sys

rows = []
with open(sys.argv[1], newline='') as source:
    for star in csv.DictReader(source):
        if star['id'] == '0' or not star['mag'] or float(star['mag']) > 6.5:
            continue
        rows.append([int(star['id']), float(star['ra']), float(star['dec']),
                     float(star['mag']), float(star['ci']) if star['ci'] else None])
output = pathlib.Path(__file__).resolve().parents[1] / 'src/data/stars.json'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(rows, separators=(',', ':')) + '\n')
print(f'Wrote {len(rows)} stars to {output}')
