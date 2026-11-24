"""Build a deterministic AMD64 COFF .rsrc with icon, manifest and version info.

Only Python's standard library is needed; no windres or downloaded build tools.
"""
import json
import pathlib
import re
import struct
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
NAME = 'DFO-Client-Expander-RU'
AUTHOR = 'AutomaticYobaMachine'
VERSION = json.loads((ROOT / 'src/mod/version.json').read_text(encoding='utf-8'))['version']
GUI = ROOT / 'src/gui'
if re.search(r'appVersion\s*=\s*"([^"]+)"', (GUI / 'options.go').read_text(encoding='utf-8'))[1] != VERSION:
    raise ValueError('Installer and mod versions must match')


def align(blob):
    return blob + b'\0' * (-len(blob) % 4)


def wide(s):
    return (s + '\0').encode('utf-16le')


def block(key, value=b'', children=(), kind=1, value_length=None):
    size = len(value) // 2 if kind else len(value)
    if value_length is not None:
        size = value_length
    head = align(struct.pack('<HHH', 0, size, kind) + wide(key))
    result = head + value
    for child in children:
        result = align(result) + child
    return struct.pack('<H', len(result)) + result[2:]


def version_info():
    parts = [int(s) for s in VERSION.split('.')]
    parts = (parts + [0] * 4)[:4]
    hi, lo = parts[0] << 16 | parts[1], parts[2] << 16 | parts[3]
    fixed = struct.pack('<13I', 0xFEEF04BD, 0x10000, hi, lo, hi, lo, 0x3f, 0, 0x40004, 1, 0, 0, 0)
    values = {
        'CompanyName': AUTHOR, 'FileDescription': NAME + ' — установщик расширения',
        'FileVersion': VERSION, 'InternalName': NAME, 'OriginalFilename': NAME + '.exe',
        'ProductName': NAME, 'ProductVersion': VERSION,
        'LegalCopyright': '© 2026 ' + AUTHOR,
        'Comments': 'Создано специально для русского сообщества DFO Online.',
    }
    table = block('040904B0', children=[block(k, wide(v)) for k, v in values.items()])
    strings = block('StringFileInfo', children=[table])
    translation = block('Translation', struct.pack('<HH', 0x409, 1200), kind=0)
    variables = block('VarFileInfo', children=[translation])
    return block('VS_VERSION_INFO', fixed, [strings, variables], kind=0)


def resources():
    data = {(16, 1, 0x409): version_info(), (24, 1, 0x409): (GUI / 'assets/app.manifest').read_bytes()}
    icon = (GUI / 'assets/expander.ico').read_bytes()
    reserved, kind, count = struct.unpack_from('<HHH', icon)
    if reserved or kind != 1 or not 1 <= count <= 16:
        raise ValueError('Invalid installer icon')
    group = struct.pack('<HHH', 0, 1, count)
    for i in range(count):
        w, h, colors, r, planes, bits, size, offset = struct.unpack_from('<BBBBHHII', icon, 6 + 16 * i)
        data[(3, i + 1, 0x409)] = icon[offset:offset + size]
        group += struct.pack('<BBBBHHIH', w, h, colors, r, planes, bits, size, i + 1)
    data[(14, 1, 0x409)] = group
    return data


def coff(entries):
    tree = {}
    for (kind, name, lang), value in sorted(entries.items()):
        tree.setdefault(kind, {}).setdefault(name, {})[lang] = value
    buf, leaves, relocations = bytearray(), [], []

    def reserve(n):
        at = len(buf)
        buf.extend(b'\0' * n)
        return at

    def directory(node):
        start = reserve(16 + 8 * len(node))
        struct.pack_into('<IIHHHH', buf, start, 0, 0, 0, 0, 0, len(node))
        for i, (key, value) in enumerate(sorted(node.items())):
            if isinstance(value, dict):
                target = directory(value) | 0x80000000
            else:
                target = reserve(16)
                leaves.append((target, value))
            struct.pack_into('<II', buf, start + 16 + 8 * i, key, target)
        return start

    assert directory(tree) == 0
    for entry, value in leaves:
        buf.extend(b'\0' * (-len(buf) % 4))
        struct.pack_into('<IIII', buf, entry, len(buf), len(value), 0, 0)
        relocations.append(struct.pack('<IIH', entry, 0, 3))  # IMAGE_REL_AMD64_ADDR32NB, section symbol 0
        buf.extend(value)
    buf.extend(b'\0' * (-len(buf) % 4))
    raw = bytes(buf)
    rel = b''.join(relocations)
    symbol = struct.pack('<8sIhHBB', b'.rsrc', 0, 1, 0, 3, 1)
    auxiliary = struct.pack('<IHHIhB3s', len(raw), len(leaves), 0, 0, 0, 0, b'\0' * 3)
    header = struct.pack('<HHIIIHH', 0x8664, 1, 0, 60 + len(raw) + len(rel), 2, 0, 0)
    section = struct.pack('<8sIIIIIIHHI', b'.rsrc', 0, 0, len(raw), 60, 60 + len(raw), 0, len(leaves), 0, 0x40300040)
    return header + section + raw + rel + symbol + auxiliary + struct.pack('<I', 4)


if __name__ == '__main__':
    dest = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else GUI / 'resources_windows_amd64.syso'
    dest.write_bytes(coff(resources()))
    print('Windows resources:', NAME, VERSION)
