#!/usr/bin/env python3
"""Package a tested, compiled Eleva app; fail on architecture-specific binaries."""
import hashlib
import json
import os
from pathlib import Path
import re
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]
APP_ID = "com.andrewmccann.vesync.eleva"

def create_package(build, output, commit):
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("Expected a full Git commit SHA")
    app = json.loads((build / "app.json").read_text())
    if app["id"] != APP_ID:
        raise ValueError("Unexpected app ID")
    # The CLI identifies TypeScript via devDependencies, even after compilation.
    # Normalize only generated runtime metadata; never alter the source package.
    package_path = build / "package.json"
    if package_path.exists():
        runtime = json.loads(package_path.read_text())
        runtime.pop("devDependencies", None)
        runtime.pop("scripts", None)
        runtime["main"] = "app.js"
        package_path.write_text(json.dumps(runtime, indent=2) + "\n")
    lock_path = build / "package-lock.json"
    if lock_path.exists():
        lock = json.loads(lock_path.read_text())
        packages = lock.get("packages", {})
        packages.get("", {}).pop("devDependencies", None)
        lock["packages"] = {name: value for name, value in packages.items()
                            if not value.get("dev", False)}
        lock_path.write_text(json.dumps(lock, indent=2) + "\n")
    paths = sorted(p for p in build.rglob("*") if p.is_file() or p.is_symlink())
    hashes = {}
    for p in paths:
        relative = p.relative_to(build)
        if p.is_symlink():
            raise ValueError(f"Symlinks not allowed in deployment bundle: {relative}")
        if p.suffix == ".node" or p.read_bytes()[:4] == b"\x7fELF":
            raise ValueError(f"Native binary requires an ARM64 build: {relative}")
        hashes[str(relative)] = hashlib.sha256(p.read_bytes()).hexdigest()
    metadata = {"app_id": APP_ID, "version": app["version"],
                "commit": commit, "files": hashes}
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as temp:
        manifest = Path(temp) / "release.json"
        manifest.write_text(json.dumps(metadata, indent=2) + "\n")
        with tarfile.open(output, "w:gz") as archive:
            archive.add(manifest, arcname="release.json")
            for p in paths:
                archive.add(p, arcname="app/" + str(p.relative_to(build)), recursive=False)
    return metadata

if __name__ == "__main__":
    result = create_package(ROOT / ".homeybuild",
                            ROOT / "dist/eleva.tar.gz",
                            os.environ.get("GITHUB_SHA", ""))
    print(f"Packaged Eleva {result['version']} from {result['commit']}")

