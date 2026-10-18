#!/usr/bin/env python3
"""Publish a completed tested package without mutating any existing release."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time


def gh(*args):
    return subprocess.run(['gh', *args], check=True, capture_output=True, text=True, timeout=120).stdout


def verify_release(*args):
    """Allow bounded attestation propagation time; never bypass verification."""
    for attempt in range(7):
        try:
            return gh('release', *args)
        except subprocess.CalledProcessError:
            if attempt == 6:
                raise
            print('Release verification not ready; retrying in 10 seconds.', flush=True)
            time.sleep(10)


def main():
    repo, sha = os.environ['GITHUB_REPOSITORY'], os.environ['GITHUB_SHA']
    if os.environ.get('GITHUB_REF') != 'refs/heads/main' or os.environ.get('GITHUB_EVENT_NAME') not in {'push', 'workflow_dispatch', 'schedule'}:
        raise ValueError('Production publication requires accepted main source')
    if os.environ.get('RELEASE_IMMUTABILITY_ENABLED') != 'true':
        raise ValueError('Owner must enable repository release immutability and acknowledge RELEASE_IMMUTABILITY_ENABLED=true')
    folder = Path('dist')
    manifest = json.loads((folder / 'release-manifest.json').read_text())
    tag, asset = manifest['tag'], manifest['asset']
    if (manifest['repository'] != repo or manifest['commit'] != sha or
            not re.fullmatch(r'build-' + sha + r'(?:-[0-9a-f]{12})?', tag) or
            not re.fullmatch(r'[a-z0-9-]+\.tar\.gz', asset) or
            hashlib.sha256((folder / asset).read_bytes()).hexdigest() != manifest['sha256']):
        raise ValueError('Package/source identity mismatch')
    pages = json.loads(gh('api', '--paginate', '--slurp', f'repos/{repo}/releases?per_page=100'))
    existing = next((r for page in pages for r in page if r['tag_name'] == tag), None)
    if existing:
        if existing.get('draft') or existing.get('prerelease') or not existing.get('immutable'):
            raise ValueError('Existing release is not immutable; never replace its assets')
        with tempfile.TemporaryDirectory() as tmp:
            gh('release', 'download', tag, '--repo', repo, '--dir', tmp, '--pattern', asset)
            if hashlib.sha256((Path(tmp) / asset).read_bytes()).hexdigest() != manifest['sha256']:
                raise ValueError('Existing release differs from candidate')
    else:
        notes = folder / 'release-notes.txt'
        notes.write_text(f'Tested source {sha}.\nPackage identity and dependency pins are in release-manifest.json.\nPhysical acceptance is separate.\n')
        gh('release', 'create', tag, str(folder / asset), str(folder / 'release-manifest.json'),
           '--repo', repo, '--target', sha, '--draft', '--title', tag, '--notes-file', str(notes))
        gh('release', 'edit', tag, '--repo', repo, '--draft=false', '--latest')
    released = json.loads(gh('api', f'repos/{repo}/releases/tags/{tag}'))
    if released.get('immutable') is not True:
        raise ValueError('GitHub did not enforce immutability; downstream promotion is blocked')
    verify_release('verify', tag, '--repo', repo)
    verify_release('verify-asset', tag, str(folder / asset), '--repo', repo)
    print('Immutable release verified:', tag)


if __name__ == '__main__':
    main()
