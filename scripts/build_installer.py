"""Wrap the verified Windows ZIP in a per-user NSIS Setup.exe.

Requires makensis 3. Usage:
python3 scripts/build_installer.py PORTABLE.zip OUTPUT.exe --sha256 SHA256
"""
import argparse
import hashlib
import json
import re
from pathlib import Path, PurePosixPath
import subprocess
import tempfile
import zipfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("portable", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--sha256", required=True, help="Verified SHA-256 of the portable ZIP")
    args = parser.parse_args()
    if hashlib.sha256(args.portable.read_bytes()).hexdigest() != args.sha256.lower():
        raise ValueError("Portable ZIP does not match its expected SHA-256")
    args.output = args.output.resolve()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    source = Path(__file__).resolve().parent
    with tempfile.TemporaryDirectory(prefix="scratchjget-installer-") as temporary:
        work = Path(temporary)
        with zipfile.ZipFile(args.portable) as archive:
            for item in archive.infolist():
                name = PurePosixPath(item.filename)
                if not name.parts or name.parts[0] != "ScratchJGET" or ".." in name.parts or "\\" in item.filename:
                    raise ValueError("Unexpected archive path")
            archive.extractall(work)
        payload = work / "ScratchJGET"
        package = json.loads((payload / "resources/app/package.json").read_text())
        if package.get("productName") != "ScratchJGET":
            raise ValueError("Unexpected application product name")
        version = package["version"]
        match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)-jget\.(\d+)", version)
        if not match:
            raise ValueError("Unexpected ScratchJGET application version")
        # Continue the numeric version sequence after Classroom 1.3.2.4.
        file_version = ".".join(match.groups()[:3]) + "." + str(4 + int(match.group(4)))
        if not (payload / "ScratchJGET.exe").is_file():
            raise ValueError("The ScratchJGET executable is missing")
        guide = source.parent / "docs/Windows-класс.txt"
        (payload / "Прочитайте.txt").write_bytes(guide.read_text().replace("\n", "\r\n").encode("utf-8-sig"))
        files = sorted(p for p in payload.rglob("*") if p.is_file())
        directories = sorted((p for p in payload.rglob("*") if p.is_dir()),
                             key=lambda p: len(p.parts), reverse=True)

        def target(file):
            relative = str(file.relative_to(payload)).replace("/", "\\")
            return "$INSTDIR\\app\\" + relative.replace("$", "$$")

        manifest = work / "remove-files.nsh"
        lines = [f'Delete "{target(file)}"' for file in files]
        lines += [f'RMDir "{target(folder)}"' for folder in directories]
        lines.append('RMDir "$INSTDIR\\app"')
        manifest.write_text("\n".join(lines), encoding="utf-8-sig")
        obsolete = work / "remove-obsolete.nsh"
        removed_assets = json.loads((source / "removed-brand-assets.json").read_text())
        obsolete_lines = []
        for relative in removed_assets:
            if not relative.startswith(("src/", "docs/")) or ".." in PurePosixPath(relative).parts:
                raise ValueError("Unexpected obsolete asset path")
            name = relative.replace("/", "\\").replace("$", "$$")
            obsolete_lines.append(f'Delete "$INSTDIR\\app\\resources\\app\\{name}"')
        obsolete.write_text("\n".join(obsolete_lines), encoding="utf-8-sig")
        output = work / args.output.name
        subprocess.run([
            "makensis", "-WX", "-V2", f"-DOUTPUT_FILE={output}",
            f"-DAPP_VERSION={version}", f"-DAPP_FILE_VERSION={file_version}",
            f"-DPAYLOAD_DIR={payload}", f"-DREMOVE_MANIFEST={manifest}",
            f"-DREMOVE_OBSOLETE={obsolete}",
            f"-DINSTALLED_KIB={(sum(f.stat().st_size for f in files) + 1023) // 1024}",
            str(source / "windows-installer.nsi")
        ], check=True)
        args.output.write_bytes(output.read_bytes())
        print(f"Built {args.output} ({args.output.stat().st_size:,} bytes)")
        print("SHA-256 " + hashlib.sha256(args.output.read_bytes()).hexdigest())


if __name__ == "__main__":
    main()
