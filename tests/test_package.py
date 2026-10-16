import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / (name + ".py"))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

package = module("package")
deploy = module("deploy")
SHA = "a" * 40

class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.app = self.root / "build"
        self.app.mkdir()
        (self.app / "app.json").write_text(json.dumps({"id":package.APP_ID,"version":"0.1.1"}))
        (self.app / "app.js").write_text("module.exports = {};")
        self.bundle = self.root / "eleva.tar.gz"

    def tearDown(self):
        self.temp.cleanup()

    def pack(self):
        return package.create_package(self.app,self.bundle,SHA)

    def test_round_trip(self):
        self.pack()
        result = deploy.extract_verified(self.bundle,self.root / "extracted",SHA)
        self.assertEqual(result["version"],"0.1.1")
        self.assertTrue((self.root / "extracted/app/app.js").exists())

    def test_wrong_commit(self):
        self.pack()
        with self.assertRaises(ValueError):
            deploy.extract_verified(self.bundle,self.root / "extracted","b" * 40)

    def test_runtime_package_does_not_trigger_typescript_build(self):
        (self.app / "package.json").write_text(json.dumps({
            "main":"app.ts", "scripts":{"build":"tsc"},
            "devDependencies":{"typescript":"6.0.3"}, "dependencies":{"axios":"1.18.1"}}))
        self.pack()
        runtime=json.loads((self.app / "package.json").read_text())
        self.assertNotIn("devDependencies",runtime)
        self.assertNotIn("scripts",runtime)
        self.assertEqual(runtime["main"],"app.js")
        self.assertIn("axios",runtime["dependencies"])

    def test_wrong_app(self):
        (self.app / "app.json").write_text('{"id":"other","version":"0.1.1"}')
        with self.assertRaises(ValueError):
            self.pack()

    def test_native_binary_rejected(self):
        (self.app / "binary").write_bytes(b"\x7fELFpayload")
        with self.assertRaises(ValueError):
            self.pack()

    def test_symlink_rejected(self):
        (self.app / "link").symlink_to("app.js")
        with self.assertRaises(ValueError):
            self.pack()

    def test_unsafe_archive_rejected(self):
        with tarfile.open(self.bundle,"w:gz") as archive:
            info=tarfile.TarInfo("../outside")
            info.size=1
            archive.addfile(info,io.BytesIO(b"x"))
        with self.assertRaises(ValueError):
            deploy.extract_verified(self.bundle,self.root / "extracted",SHA)
        self.assertFalse((self.root / "outside").exists())

    def test_tampered_payload_rejected(self):
        metadata=self.pack()
        with tarfile.open(self.bundle,"w:gz") as archive:
            for name,content in {
                "release.json":json.dumps(metadata).encode(),
                "app/app.json":(self.app / "app.json").read_bytes(),
                "app/app.js":b"changed",
            }.items():
                info=tarfile.TarInfo(name); info.size=len(content)
                archive.addfile(info,io.BytesIO(content))
        with self.assertRaises(ValueError):
            deploy.extract_verified(self.bundle,self.root / "extracted",SHA)


if __name__ == "__main__":
    unittest.main()
