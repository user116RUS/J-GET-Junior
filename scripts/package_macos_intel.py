"""Update an existing ScratchJr 1.3.2 Intel app, keeping its Electron runtime.

python3 scripts/package_macos_intel.py BASE.app BABEL_NODE_MODULES OUTPUT.app
Requires the same Babel 6.26 tools as scripts/package_windows.py.
"""
import argparse
import json
import os
from pathlib import Path
import plistlib
import re
import subprocess


def build(args):
    if args.output.exists():
        raise ValueError('Output already exists; use a fresh output path')
    base_info = plistlib.loads((args.base / 'Contents/Info.plist').read_bytes())
    arch = subprocess.check_output([
        'lipo', '-archs', str(args.base / 'Contents/MacOS' / base_info['CFBundleExecutable'])
    ], text=True).strip()
    if arch != 'x86_64':
        raise ValueError('Expected the existing Intel ScratchJr app')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['ditto', str(args.base), str(args.output)], check=True)
    subprocess.run([
        'node', str(Path(__file__).with_name('compile-portable.js')),
        str(args.output / 'Contents/Resources/app')
    ], env={**os.environ, 'NODE_PATH': str(args.compiler.resolve())}, check=True)
    info_file = args.output / 'Contents/Info.plist'
    info = plistlib.loads(info_file.read_bytes())
    source = Path(__file__).resolve().parent.parent
    version = json.loads((source / 'package.json').read_text())['version']
    match = re.fullmatch(r'(\d+)\.(\d+)\.(\d+)-jget\.(\d+)', version)
    if not match:
        raise ValueError('Unexpected J-GET Junior version')
    file_version = '.'.join(match.groups()[:3]) + '.' + str(4 + int(match.group(4)))
    executable = args.output / 'Contents/MacOS' / info['CFBundleExecutable']
    executable.rename(executable.with_name('J-GET Junior'))
    info.update({'CFBundleName': 'J-GET Junior', 'CFBundleDisplayName': 'J-GET Junior',
                 'CFBundleExecutable': 'J-GET Junior', 'CFBundleIdentifier': 'it.jget.junior',
                 'CFBundleShortVersionString': '.'.join(match.groups()[:3]),
                 'CFBundleVersion': file_version})
    icon = info.get('CFBundleIconFile', 'electron.icns')
    if not icon.endswith('.icns'):
        icon += '.icns'
    (args.output / 'Contents/Resources' / icon).write_bytes((source / 'src/icons/mac/icon.icns').read_bytes())
    info_file.write_bytes(plistlib.dumps(info))
    for helper_info in list((args.output / 'Contents/Frameworks').glob('*.app/Contents/Info.plist')):
        helper = plistlib.loads(helper_info.read_bytes())
        display = helper.get('CFBundleDisplayName', helper.get('CFBundleName', 'Helper'))
        display = display.replace('ScratchJr', 'J-GET Junior')
        helper.update({'CFBundleDisplayName': display, 'CFBundleName': display})
        if 'CFBundleIdentifier' in helper:
            helper['CFBundleIdentifier'] = helper['CFBundleIdentifier'].replace('com.electron.scratchjr', 'it.jget.junior')
        # Chromium derives the helper bundle name from the main application
        # name. Keep bundle, executable and metadata consistent after rename.
        old_executable = helper['CFBundleExecutable']
        new_executable = old_executable.replace('ScratchJr', 'J-GET Junior')
        if new_executable != old_executable:
            (helper_info.parent / 'MacOS' / old_executable).rename(
                helper_info.parent / 'MacOS' / new_executable)
        helper['CFBundleExecutable'] = new_executable
        helper_info.write_bytes(plistlib.dumps(helper))
        helper_bundle = helper_info.parent.parent
        new_bundle_name = helper_bundle.name.replace('ScratchJr', 'J-GET Junior')
        if helper_bundle.name != new_bundle_name:
            helper_bundle.rename(helper_bundle.with_name(new_bundle_name))
    print('Built Intel app: ' + str(args.output))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('base', type=Path)
    parser.add_argument('compiler', type=Path)
    parser.add_argument('output', type=Path)
    build(parser.parse_args())
