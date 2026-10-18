import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('eleva_package', Path(__file__).resolve().parents[1] / 'scripts/package.py')
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)

class ReproduciblePackageTests(unittest.TestCase):
    def test_same_runtime_ignores_file_times_and_archive_name(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            build = root / 'build'
            build.mkdir()
            (build / 'app.json').write_text(json.dumps({'id': package.APP_ID, 'version': '0.1.1'}))
            (build / 'app.js').write_text('module.exports = {};\n')
            first, second = root / 'first.tar.gz', root / 'second.tar.gz'
            package.create_package(build, first, 'a' * 40)
            for path in build.iterdir():
                os.utime(path, (1800000000, 1800000000))
            package.create_package(build, second, 'a' * 40)
            self.assertEqual(first.read_bytes(), second.read_bytes())
            (build / 'app.js').write_text('module.exports = {changed: true};\n')
            package.create_package(build, second, 'a' * 40)
            self.assertNotEqual(first.read_bytes(), second.read_bytes())
