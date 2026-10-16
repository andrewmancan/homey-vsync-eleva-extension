#!/usr/bin/env python3
"""Exercise the same compiled-package preprocessing the Pi will use, without auth."""
import os
from pathlib import Path
import subprocess
import tempfile
from deploy import extract_verified

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="homepi-package-check-") as temp:
    stage = Path(temp)
    extract_verified(root / "dist/eleva.tar.gz", stage, os.environ["GITHUB_SHA"])
    subprocess.run([str(root / "tooling/node_modules/.bin/homey"), "app", "build"],
                   cwd=stage / "app", check=True)
