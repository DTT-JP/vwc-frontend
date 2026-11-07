#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""FE build ハッシュ計算（rules/03 §7.4, §8）。Python 3 標準ライブラリのみ。
public/build-manifest.json を生成する。tools/complete.py の実行後に実行する。
使い方:
  python3 tools/calc-build-hash.py            # public/ から build-manifest.json を生成
  python3 tools/calc-build-hash.py --vectors  # 適合テストベクタ確認
"""
from __future__ import annotations
import hashlib, json, os, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
TEXT_EXT = {'.php','.js','.css','.html','.json','.md','.txt','.svg','.xml','.yml','.yaml','.sh','.py'}
TEXT_NAMES = {'VERSION', '.htaccess', '.gitattributes'}
EXCLUDE_TOP = {'config.js', '.htaccess', 'build-manifest.json'}
EXCLUDE_DIRS = {'vendor', 'fonts'}  # public/ 直下

def is_text(name: str) -> bool:
    if name in TEXT_NAMES:
        return True
    return Path(name).suffix.lower() in TEXT_EXT

def normalize(data: bytes, name: str) -> bytes:
    if not is_text(name):
        return data
    # CRLF -> LF。孤立 CR は変えない。BOM は変えない。
    return data.replace(b'\r\n', b'\n')

def rel_key(rel: str) -> bytes:
    return rel.encode('utf-8')

def excluded(rel: str) -> bool:
    parts = rel.split('/')
    if parts[0] in EXCLUDE_DIRS:
        return True
    if rel in EXCLUDE_TOP:
        return True
    # help/media/**
    if len(parts) >= 2 and parts[0] == 'help' and parts[1] == 'media':
        return True
    return False

def collect(root: Path):
    files = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort()
        for fn in sorted(filenames):
            abs_p = Path(dirpath) / fn
            rel = abs_p.relative_to(root).as_posix()
            if excluded(rel):
                continue
            files.append(rel)
    files.sort(key=rel_key)
    return files

def file_hash(data_norm: bytes) -> str:
    return hashlib.sha256(data_norm).hexdigest()

def calc(root: Path, rels: list[str]):
    h = hashlib.sha256()
    file_hashes = {}
    for rel in rels:
        data = (root / rel).read_bytes()
        norm = normalize(data, Path(rel).name)
        file_hashes[rel] = file_hash(norm)
        h.update(rel.encode('utf-8') + b'\x00' + norm + b'\x00')
    full = h.hexdigest()
    return {'build': full[:7], 'build_full': full, 'files': file_hashes}

def run_vectors() -> int:
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        (root / 'img').mkdir()
        (root / 'lib').mkdir()
        (root / '日本語').mkdir()
        (root / '.htaccess').write_bytes(b'Require all denied\r\n')
        (root / 'VERSION').write_bytes(b'1.2.1\r\n')
        (root / 'img/dot.bin').write_bytes(bytes.fromhex('0001020d0aff'))
        (root / 'index.php').write_bytes(b'<?php\r\necho "ok";\r\n')
        (root / 'lib/a.js').write_bytes(b'var a=1;\n')
        (root / '日本語/と.txt').write_bytes('テスト\r\n'.encode('utf-8'))
        rels = ['.htaccess','VERSION','img/dot.bin','index.php','lib/a.js','日本語/と.txt']
        rels_sorted = sorted(rels, key=rel_key)
        expected = ['.htaccess','VERSION','img/dot.bin','index.php','lib/a.js','日本語/と.txt']
        order_ok = rels_sorted == expected
        res = calc(root, rels_sorted)
        hash_ok = res['build_full'] == 'c6e66df436462b6024f6e0c40d6a36b5e1b035db5acef5b14b4d12991275af37'
        build_ok = res['build'] == 'c6e66df'
    with tempfile.TemporaryDirectory() as td2:
        root = Path(td2)
        (root / 'img').mkdir(); (root / 'lib').mkdir(); (root / '日本語').mkdir()
        (root / '.htaccess').write_bytes(b'Require all denied\n')
        (root / 'VERSION').write_bytes(b'1.2.1\n')
        (root / 'img/dot.bin').write_bytes(bytes.fromhex('0001020d0aff'))
        (root / 'index.php').write_bytes(b'<?php\necho "ok";\n')
        (root / 'lib/a.js').write_bytes(b'var a=1;\n')
        (root / '日本語/と.txt').write_bytes('テスト\n'.encode('utf-8'))
        res2 = calc(root, expected)
        lf_ok = res2['build_full'] == res['build_full']
        (root / 'img/dot.bin').write_bytes(bytes.fromhex('0001020aff'))
        res3 = calc(root, expected)
        bin_ok = res3['build_full'] != res['build_full']
    all_ok = order_ok and hash_ok and build_ok and lf_ok and bin_ok
    print(f"order: {'OK' if order_ok else 'FAIL'}")
    print(f"hash:  {'OK' if hash_ok else 'FAIL'} {res['build_full']}")
    print(f"build: {'OK' if build_ok else 'FAIL'} {res['build']}")
    print(f"crlf-lf-invariant: {'OK' if lf_ok else 'FAIL'}")
    print(f"binary-not-normalized: {'OK' if bin_ok else 'FAIL'}")
    print('ALL PASS' if all_ok else 'FAIL')
    return 0 if all_ok else 1

def main() -> int:
    if '--vectors' in sys.argv:
        return run_vectors()
    if not PUBLIC.is_dir():
        print(f'missing: {PUBLIC}', file=sys.stderr)
        return 1
    rels = collect(PUBLIC)
    res = calc(PUBLIC, rels)
    ver = (PUBLIC / 'VERSION').read_text(encoding='utf-8').strip() if (PUBLIC / 'VERSION').is_file() else '0.0.0'
    from datetime import date
    manifest = {
        'version': ver,
        'build': res['build'],
        'build_full': res['build_full'],
        'files': res['files'],
        'generated': date.today().isoformat(),
    }
    out = PUBLIC / 'build-manifest.json'
    out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=False) + '\n', encoding='utf-8')
    print(f"version={ver}")
    print(f"build={res['build']}")
    print(f"build_full={res['build_full']}")
    print(f"files={len(rels)}")
    print(f"wrote={out}")
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
