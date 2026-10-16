#!/usr/bin/env python3
"""Verify and extract a compiled app bundle without credentials or installation."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
APP_ID = "com.andrewmccann.vesync.eleva"

def extract_verified(bundle, target, expected_commit):
    if not re.fullmatch(r"[0-9a-f]{40}", expected_commit):
        raise ValueError("Expected full commit SHA")
    with tarfile.open(bundle, "r:gz") as archive:
        members = archive.getmembers()
        names = set()
        if sum(m.size for m in members) > 256 * 1024 * 1024:
            raise ValueError("Bundle exceeds 256 MiB")
        for m in members:
            path = PurePosixPath(m.name)
            if (not m.isfile() or path.is_absolute() or ".." in path.parts or
                    "\\" in m.name or m.name in names or
                    not (m.name == "release.json" or m.name.startswith("app/"))):
                raise ValueError("Unsafe or duplicate archive member")
            names.add(m.name)
        for m in members:
            p = target / m.name
            p.parent.mkdir(parents=True, exist_ok=True)
            with archive.extractfile(m) as source, p.open("wb") as dest:
                shutil.copyfileobj(source, dest)
    metadata = json.loads((target / "release.json").read_text())
    if metadata["commit"] != expected_commit or metadata["app_id"] != APP_ID:
        raise ValueError("Artifact provenance does not match deployment")
    actual = {str(p.relative_to(target / "app")):
              hashlib.sha256(p.read_bytes()).hexdigest()
              for p in (target / "app").rglob("*") if p.is_file()}
    if actual != metadata["files"]:
        raise ValueError("Artifact checksum mismatch")
    manifest = json.loads((target / "app/app.json").read_text())
    if manifest["id"] != APP_ID or manifest["version"] != metadata["version"]:
        raise ValueError("Manifest mismatch")
    return metadata
