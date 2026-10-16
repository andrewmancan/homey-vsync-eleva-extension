#!/usr/bin/env python3
"""Describe the compiled package so downstream consumers can pin and verify it."""
import hashlib
import json
import os
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
sha = os.environ['GITHUB_SHA']
if not re.fullmatch(r'[0-9a-f]{40}', sha):
    raise SystemExit('GITHUB_SHA must be a full commit SHA')
app = json.loads((root / 'app.json').read_text())
asset = root / 'dist/eleva.tar.gz'
manifest = {
    'schema': 1,
    'repository': 'andrewmancan/homey-vsync-eleva-extension',
    'commit': sha,
    'tag': 'build-' + sha,
    'asset': asset.name,
    'sha256': hashlib.sha256(asset.read_bytes()).hexdigest(),
    'app_id': app['id'],
    'version': app['version'],
}
(root / 'dist/release-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
