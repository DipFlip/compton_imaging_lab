"""Strip character and mirror sphere scene nodes from the Three.js CC0 room.
Usage: python3 scripts/prepare-room.py /path/to/kira.glb
Source and credits: ../assets/README.md. Does not download external assets.
"""
import json
import struct
import sys
from pathlib import Path

raw = Path(sys.argv[1]).read_bytes()
json_size = struct.unpack_from('<I', raw, 12)[0]
asset = json.loads(raw[20:20 + json_size])
assert asset['nodes'][29]['name'] == 'Kira'
assert asset['nodes'][30]['name'] == 'boule'
asset['nodes'] = asset['nodes'][31:]
asset['meshes'] = asset['meshes'][7:]
for node in asset['nodes']:
    if 'mesh' in node:
        node['mesh'] -= 7
asset['scenes'] = [{'name': 'Room without character or sphere', 'nodes': list(range(len(asset['nodes'])))}]
asset['scene'] = 0
asset.pop('skins', None)
asset.pop('animations', None)
encoded = json.dumps(asset, separators=(',', ':')).encode()
encoded += b' ' * ((-len(encoded)) % 4)
chunks = struct.pack('<I4s', len(encoded), b'JSON') + encoded + raw[20 + json_size:]
out = Path(__file__).resolve().parent.parent / 'assets' / 'room.glb'
out.write_bytes(struct.pack('<4sII', b'glTF', 2, len(chunks) + 12) + chunks)
