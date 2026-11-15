"""Build from a verified upstream v1.3.2 installer or Classroom fix1 portable ZIP.

Requires Python lief==1.0.0 for the application icon/version resource update.
Install compiler tools in a temporary folder with npm install --ignore-scripts
babel-core@6.26.0 babel-preset-env@1.6.1 babel-preset-react@6.24.1
babel-plugin-transform-async-to-generator@6.24.1. Then run:
python3 scripts/package_windows.py SETUP_OR_FIX1_ZIP /path/to/node_modules OUTPUT.ZIP
"""
import argparse
import hashlib
import io
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import zipfile


def unpack(setup, stage):
    data = setup.read_bytes()
    if setup.suffix.lower() == ".zip":
        if hashlib.sha256(data).hexdigest() != "0ee921cb56515ee5f6844f12d6a22fa868cbe7ac443419657eadda475f766ade":
            raise ValueError("Expected the verified ScratchJr Classroom fix1 portable ZIP")
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for item in archive.infolist():
                if not item.is_dir():
                    dest = stage / Path(item.filename).relative_to("ScratchJr-Classroom")
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(archive.read(item))
        return
    if hashlib.sha256(data).hexdigest() != "5ea360e48bfba952189f0c791b95788c7e213c55b34adb480714ecb6108dedcb":
        raise ValueError("Expected the upstream ScratchJr-1.3.2.Setup.exe (x64)")
    # The self-extractor has a trailing PE section after the end of the ZIP.
    eocd = data.rindex(b"PK\x05\x06")
    end = eocd + 22 + struct.unpack_from("<H", data, eocd + 20)[0]
    with zipfile.ZipFile(io.BytesIO(data[:end])) as squirrel:
        nuget = squirrel.read("ScratchJr-1.3.2-full.nupkg")
    with zipfile.ZipFile(io.BytesIO(nuget)) as package:
        for name in package.namelist():
            prefix = "lib/net45/"
            if name.startswith(prefix) and not name.endswith("/"):
                dest = stage / name[len(prefix):]
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(package.read(name))


def build(args, stage):
    unpack(args.setup, stage)
    subprocess.run(["node", Path(__file__).with_name("compile-portable.js"), stage / "resources/app"],
                   env={**os.environ, "NODE_PATH": str(args.compiler.resolve())}, check=True)
    executable = stage / "J-GET-Junior.exe"
    (stage / "ScratchJr.exe").rename(executable)
    # The old Squirrel launcher is unused by the per-user NSIS installation.
    (stage / "ScratchJr_ExecutionStub.exe").unlink(missing_ok=True)
    subprocess.run([sys.executable, str(Path(__file__).with_name("update_windows_resources.py")),
                    str(executable)], check=True)
    guide = Path(__file__).resolve().parent.parent / "docs/Windows-класс.txt"
    (stage / "Прочитайте.txt").write_bytes(guide.read_text(encoding="utf-8").replace("\n", "\r\n").encode("utf-8-sig"))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.output, "w", zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(stage.rglob("*")):
            if file.is_file():
                archive.write(file, Path("J-GET-Junior") / file.relative_to(stage))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("setup", type=Path, help="Original installer or verified Classroom fix1 portable ZIP")
    parser.add_argument("compiler", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--stage", type=Path, help="Keep a fresh unpacked copy for verification")
    args = parser.parse_args()
    if args.stage:
        args.stage.mkdir(parents=True, exist_ok=False)
        build(args, args.stage)
    else:
        with tempfile.TemporaryDirectory() as temp:
            build(args, Path(temp))
