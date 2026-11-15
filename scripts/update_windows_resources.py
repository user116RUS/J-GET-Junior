"""Set the Windows application's icons and version metadata without changing code.

Install lief==1.0.0 in a build-only environment, then run:
python scripts/update_windows_resources.py PATH/TO/ScratchJGET.exe
"""
import argparse
from pathlib import Path
import json
import re
import struct

import lief


def localized(rid, content):
    directory = lief.PE.ResourceDirectory(rid)
    value = lief.PE.ResourceData(list(content), 0)
    value.id = 1033
    directory.add_child(value)
    return directory


def utf16(value):
    return (value + '\0').encode('utf-16le')


def aligned(value):
    return value + b'\0' * (-len(value) % 4)


def version_block(key, value=b'', kind=1, children=b''):
    length = len(value) // 2 if kind else len(value)
    block = aligned(struct.pack('<HHH', 0, length, kind) + utf16(key)) + value
    if children:
        block = aligned(block) + children
    return struct.pack('<H', len(block)) + block[2:]


def update(executable):
    root = Path(__file__).resolve().parent.parent
    version = json.loads((root / 'package.json').read_text())['version']
    match = re.fullmatch(r'(\d+)\.(\d+)\.(\d+)-jget\.(\d+)', version)
    if not match:
        raise ValueError('Unexpected ScratchJGET version')
    major, minor, patch, release = map(int, match.groups())
    build = 4 + release
    numeric = f'{major}.{minor}.{patch}.{build}'
    binary = lief.PE.parse(str(executable))
    if binary is None or not binary.has_resources:
        raise ValueError('Expected a Windows executable with resources')
    original_sections = {s.name: bytes(s.content) for s in binary.sections if s.name != '.rsrc'}
    original_entry = binary.optional_header.addressof_entrypoint
    tree = binary.resources
    for rid in (3, 14, 16):
        tree.delete_child(rid)

    icon = (root / 'src/icons/win/icon.ico').read_bytes()
    reserved, kind, count = struct.unpack_from('<HHH', icon)
    if reserved or kind != 1 or not count:
        raise ValueError('Invalid Windows ICO')
    icons = lief.PE.ResourceDirectory(3)
    group = struct.pack('<HHH', 0, 1, count)
    expected_pixels = []
    for index in range(count):
        width, height, colors, reserved, planes, bits, size, offset = struct.unpack_from('<BBBBHHII', icon, 6 + 16 * index)
        pixels = icon[offset:offset + size]
        if len(pixels) != size:
            raise ValueError('Truncated Windows ICO')
        expected_pixels.append(pixels)
        icons.add_child(localized(index + 1, pixels))
        group += struct.pack('<BBBBHHIH', width, height, colors, reserved, planes, bits, size, index + 1)
    tree.add_child(icons)
    groups = lief.PE.ResourceDirectory(14)
    groups.add_child(localized(1, group))
    tree.add_child(groups)

    strings = {
        'CompanyName': 'J-GET', 'FileDescription': 'ScratchJGET',
        'FileVersion': numeric, 'InternalName': 'ScratchJGET',
        'LegalCopyright': 'Copyright (c) 2016, MIT; ScratchJGET contributors',
        'OriginalFilename': 'ScratchJGET.exe', 'ProductName': 'ScratchJGET',
        'ProductVersion': version, 'SquirrelAwareVersion': '1'
    }
    table = version_block('040904b0', children=b''.join(
        aligned(version_block(key, utf16(value))) for key, value in strings.items()))
    string_info = version_block('StringFileInfo', children=table)
    var_info = version_block('VarFileInfo', children=version_block(
        'Translation', struct.pack('<HH', 1033, 1200), kind=0))
    high, low = (major << 16) | minor, (patch << 16) | build
    fixed = struct.pack('<13I', 0xfeef04bd, 0x10000, high, low, high, low,
                        0x3f, 0, 0x40004, 1, 0, 0, 0)
    versions = lief.PE.ResourceDirectory(16)
    versions.add_child(localized(1, version_block('VS_VERSION_INFO', fixed, 0,
                                                aligned(string_info) + var_info)))
    tree.add_child(versions)
    config = lief.PE.Builder.config_t()
    config.resources = True
    config.relocations = config.load_configuration = config.tls = config.debug = False
    builder = lief.PE.Builder(binary, config)
    builder.build()
    output = executable.with_suffix('.resources.tmp')
    builder.write(str(output))
    checked = lief.PE.parse(str(output))
    assert checked.optional_header.addressof_entrypoint == original_entry
    for name, contents in original_sections.items():
        assert bytes(checked.get_section(name).content) == contents, name
    assert [bytes(item.pixels) for item in checked.resources_manager.icons] == expected_pixels
    resource_version = checked.resources_manager.version[0]
    assert resource_version.file_info.file_version_ms == high
    assert resource_version.file_info.file_version_ls == low
    assert 'ProductName: ScratchJGET' in str(resource_version)
    output.replace(executable)
    print(f'Updated Windows resources: {version} / {numeric}; {count} icon sizes; code sections unchanged')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('executable', type=Path)
    update(parser.parse_args().executable)
