#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""ffmpeg-core.wasm の対応ソース（tools/dependencies.json の corresponding_source）を固定コミットで取得する。

GPL に基づき、ffmpeg-core.wasm を配信する運営者は、ここで作ったソース一式を
配信と同じ場所から入手できるようにする。git が必要。

使い方: python3 tools/fetch_ffmpeg_source.py [--out ffmpeg-source] [--only 名前スラッグ ...]
出力:   <out>/<slug>-<コミット先頭12桁>.tar.gz と SHA256SUMS（Dockerfile のビルド手順は ffmpeg-wasm-build に含まれる）
"""

import argparse
import hashlib
import json
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run(*command, cwd=None):
    subprocess.run(command, cwd=cwd, check=True, stdout=subprocess.DEVNULL)


def fetch(component, out):
    slug, commit, url = component["slug"], component["commit"], component["repository"] + ".git"
    archive = out / f"{slug}-{commit[:12]}.tar.gz"
    with tempfile.TemporaryDirectory(prefix="vwc-src-") as temp:
        work = Path(temp) / slug
        work.mkdir()
        run("git", "init", "-q", cwd=work)
        run("git", "remote", "add", "origin", url, cwd=work)
        run("git", "fetch", "-q", "--depth", "1", "origin", commit, cwd=work)
        run("git", "checkout", "-q", "FETCH_HEAD", cwd=work)
        run("git", "submodule", "update", "--init", "--recursive", "--depth", "1", cwd=work)
        head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=work, check=True, capture_output=True, text=True).stdout.strip()
        if head != commit:
            raise SystemExit(f"{slug}: 取得したコミットが固定値と違います: {head} != {commit}")
        with tarfile.open(archive, "w:gz") as tar:
            tar.add(work, arcname=f"{slug}-{commit[:12]}", filter=lambda info: None if ".git" in Path(info.name).parts[1:2] or Path(info.name).name == ".git" else info)
    return archive


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default="ffmpeg-source")
    parser.add_argument("--only", nargs="*", help="取得する部品のスラッグ（省略時は全部）")
    args = parser.parse_args()
    spec = json.loads((ROOT / "tools" / "dependencies.json").read_text(encoding="utf-8"))
    components = spec["corresponding_source"]["components"]
    if args.only:
        components = [c for c in components if c["slug"] in args.only]
        if not components:
            raise SystemExit("該当する部品がありません")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    sums = []
    for component in components:
        print(f"取得: {component['name']} {component['commit'][:12]}", file=sys.stderr)
        archive = fetch(component, out)
        sums.append(f"{hashlib.sha256(archive.read_bytes()).hexdigest()}  {archive.name}")
    with (out / "SHA256SUMS").open("a", encoding="utf-8") as file:
        file.write("\n".join(sums) + "\n")
    print(f"完了: {len(components)}件を {out}/ に保存しました")


if __name__ == "__main__":
    main()
