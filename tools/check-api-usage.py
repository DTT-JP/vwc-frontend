#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""FE API 契約チェック（rules/04 §12 C6〜C8）。Python 3 標準ライブラリのみ。
  python3 tools/check-api-usage.py
"""
from __future__ import annotations
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUB = ROOT / 'public' / 'js'
CONTRACT = ROOT / 'docs' / 'api-contract' / '04_API.md'
COMPAT = ROOT / 'public' / 'js' / 'compat.js'
FAKE = ROOT / 'dev' / 'fake-api' / 'server.py'

ok = True
def report(pass_, label, detail=''):
    global ok
    if pass_:
        print(f'PASS: {label}')
    else:
        ok = False
        print(f'FAIL: {label}' + (f' / {detail}' if detail else ''))

def warn(label, detail=''):
    print(f'WARN: {label}' + (f' / {detail}' if detail else ''))

def parse_contract_apis(text: str):
    apis = set()
    # stop at URL契約
    m = re.search(r'^## URL契約', text, re.M)
    tbl = text[:m.start()] if m else text
    for m in re.finditer(r'^\|\s*([^|]+?)\s*\|', tbl, re.M):
        cell = m.group(1).strip()
        if not cell or cell == 'r' or re.match(r'^-+$', cell): continue
        if cell.startswith('`…') or cell.startswith('http'): continue
        gm = re.match(r'^files/(raw|zip)\s*\(GET\)', cell)
        if gm: apis.add(f'files/{gm.group(1)}'); continue
        parts = [p.strip() for p in cell.split(',')]
        prefix = None
        for p in parts:
            p = re.sub(r'\s*\(.*$', '', p).strip()
            if not p: continue
            if p == 'me': apis.add('me'); continue
            if '/' in p:
                prefix = p.split('/', 1)[0]
                apis.add(p); continue
            if prefix and re.match(r'^[a-z_]+$', p):
                first = re.sub(r'\s*\(.*$', '', parts[0]).strip()
                base = first.split('/', 1)[1] if '/' in first else first
                stem = re.sub(r'_(list|get)$', '', base)
                cands = [f'{prefix}/{p}']
                if stem != base and stem: cands.append(f'{prefix}/{stem}_{p}')
                apis.add(cands[0] if len(cands)==1 else cands[-1] if re.match(r'^(add|update|set|save|delete|remove|revoke|import_csv|regen)$', p) else cands[0])
    return apis

# better: resolve using known BE route names logic by also trying prefix/p directly
def parse_contract_apis_resolved(text: str, valid: set[str]|None=None):
    apis = set()
    m = re.search(r'^## URL契約', text, re.M)
    tbl = text[:m.start()] if m else text
    for m in re.finditer(r'^\|\s*([^|]+?)\s*\|', tbl, re.M):
        cell = m.group(1).strip()
        if not cell or cell == 'r' or re.match(r'^-+$', cell): continue
        if cell.startswith('`…') or cell.startswith('http'): continue
        gm = re.match(r'^files/(raw|zip)\s*\(GET\)', cell)
        if gm: apis.add(f'files/{gm.group(1)}'); continue
        parts = [p.strip() for p in cell.split(',')]
        prefix = None
        for p in parts:
            p = re.sub(r'\s*\(.*$', '', p).strip()
            if not p: continue
            if p == 'me': apis.add('me'); continue
            if '/' in p:
                prefix = p.split('/', 1)[0]; apis.add(p); continue
            if prefix and re.match(r'^[a-z_]+$', p):
                first = re.sub(r'\s*\(.*$', '', parts[0]).strip()
                base = first.split('/', 1)[1] if '/' in first else first
                stem = re.sub(r'_(list|get)$', '', base)
                cands = [f'{prefix}/{p}']
                if stem and stem != base: cands.append(f'{prefix}/{stem}_{p}')
                if valid:
                    picked = next((c for c in cands if c in valid), None)
                    apis.add(picked or cands[0])
                else:
                    apis.update(cands)
    return apis

def main() -> int:
    ctext = CONTRACT.read_text(encoding='utf-8') if CONTRACT.is_file() else ''
    # C7
    if ctext.startswith('> 複製元:') and '複製です' in ctext.splitlines()[1] if len(ctext.splitlines())>1 else False:
        print('PASS: C7 複製ヘッダーあり')
    elif ctext.startswith('> 複製元:'):
        print('PASS: C7 複製ヘッダーあり')
    else:
        warn('C7 複製ヘッダーが先頭にない')

    # USED_APIS from compat.js
    compat_text = COMPAT.read_text(encoding='utf-8') if COMPAT.is_file() else ''
    used = set(re.findall(r"'([a-z_/]+)'\s*:\s*'", compat_text))
    # filter out non-api keys if any (USED_APIS keys are api names with / or meta)
    used = {u for u in used if '/' in u or u == 'me'}

    # called APIs from js
    called = set()
    for f in PUB.glob('*.js'):
        s = f.read_text(encoding='utf-8')
        for m in re.finditer(r"\b(?:call|getBlob|query)\(\s*'([^']+)'", s):
            called.add(m.group(1))

    contract_apis = parse_contract_apis_resolved(ctext, valid=used|called)
    # ensure resolution: add any used/called that appear in contract by direct presence
    for u in list(used|called):
        if u in ctext: contract_apis.add(u)

    # C6-1: called ⊂ contract
    not_in_contract = sorted(called - contract_apis)
    report(not not_in_contract, 'C6-1 呼び出しAPIが契約の写しに含まれる', f'契約にない: {",".join(not_in_contract)}')
    # C6-2: USED_APIS と一致（過不足）
    miss_used = sorted(called - used)
    extra_used = sorted(used - called)
    report(not miss_used and not extra_used, 'C6-2 呼び出しAPIとUSED_APISが一致',
           (f'USED_APISにない呼び出し: {",".join(miss_used)} ' if miss_used else '') +
           (f'USED_APISにあるが未呼び出し: {",".join(extra_used)}' if extra_used else ''))

    # C8: fake-api responds to all contract API names
    fake_text = FAKE.read_text(encoding='utf-8') if FAKE.is_file() else ''
    fake_ok = True; missing_fake = []
    for name in sorted(contract_apis):
        if name in ('files/raw', 'files/zip'):
            if f'"{name}"' not in fake_text and f"'{name}'" not in fake_text and f'r == "{name}"' not in fake_text:
                # do_GET handles by r value
                if f'r == "{name}"' not in fake_text: missing_fake.append(name)
        else:
            if f'if r == "{name}"' not in fake_text and f'"{name}"' not in fake_text:
                missing_fake.append(name)
    report(not missing_fake, 'C8 偽APIが写しの全API名に応答', f'未応答: {",".join(missing_fake)}')

    print('---')
    print('OK' if ok else 'FAIL')
    return 0 if ok else 1

if __name__ == '__main__':
    raise SystemExit(main())
