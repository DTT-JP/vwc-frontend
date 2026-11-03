#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Download pinned browser dependencies and generate the complete deployable frontend."""

import fnmatch
import hashlib
import io
import json
import os
import re
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path, PurePosixPath

sys.path.insert(0, str(Path(__file__).resolve().parent))
import license_docs  # noqa: E402  アプリ内ライセンス表示と SOURCE.md の生成

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
DEPENDENCIES = ROOT / "tools" / "dependencies.json"
MANIFEST = PUBLIC / "vendor" / "MANIFEST.json"


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def safe_relative_path(value):
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts or not path.parts:
        raise ValueError(f"不正な出力パスです: {value}")
    return Path(*path.parts)


def download(url):
    print(f"取得: {url}")
    request = urllib.request.Request(url, headers={"User-Agent": "vwc-frontend-complete/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def fetch_verified(url, expected, label):
    data = download(url)
    actual = sha256(data)
    if actual != expected:
        raise ValueError(f"{label} の SHA-256 が一致しません: expected={expected}, actual={actual}\n  {url}")
    return data


def download_components(spec, outputs):
    """@ffmpeg/core の構成部品（固定コミット）のライセンス文書を取得して検証する。"""
    source = spec.get("corresponding_source")
    if not source:
        return None
    components = []
    for component in source["components"]:
        files = {}
        for item in component["license_files"]:
            url = f"https://raw.githubusercontent.com/{component['repository'].split('github.com/')[1]}/{component['commit']}/{item['path']}"
            data = fetch_verified(url, item["sha256"], f"{component['name']} / {item['path']}")
            public_path = f"vendor/ffmpeg/components/{component['slug']}/{PurePosixPath(item['path']).name}"
            add_output(outputs, public_path, data)
            files[public_path] = sha256(data)
        entry = {k: v for k, v in component.items() if k != "license_files"}
        entry["files"] = dict(sorted(files.items()))
        components.append(entry)
    return {k: v for k, v in source.items() if k != "components"} | {"components": components}


def selected_files(tarball, patterns):
    wanted = {item["from"]: item for item in patterns}
    found = {}
    with tarfile.open(fileobj=io.BytesIO(tarball), mode="r:gz") as archive:
        for member in archive.getmembers():
            if not member.isfile():
                continue
            matches = [pattern for pattern in wanted if fnmatch.fnmatch(member.name, pattern)]
            for pattern in matches:
                stream = archive.extractfile(member)
                if stream is None:
                    raise ValueError(f"tarball から読み取れません: {member.name}")
                found.setdefault(pattern, []).append((member.name, stream.read()))
    for pattern in wanted:
        if pattern not in found:
            raise ValueError(f"tarball 内にファイルがありません: {pattern}")
    return found


def make_css(css_config, source):
    css = source.decode("utf-8")
    css = css.replace(f"'{css_config['family'][0]}'", f"'{css_config['family'][1]}'")
    directory = css_config["directory"]
    css = re.sub(
        r"url\(\./files/([^)]+)\) format\('woff2-variations'\)",
        lambda match: f"url(./{directory}/{match.group(1)}) format('woff2')",
        css,
    )
    css = re.sub(r"url\(\./files/[^)]+\) format\('woff'\),?\s*", "", css)
    if "only" in css_config:
        blocks = re.findall(r"/\*[^*]*\*/\s*@font-face\s*\{[^}]*\}", css)
        keep = [
            block for block in blocks
            if any(f"-{subset}-wght" in block for subset in css_config["only"])
        ]
        if not keep:
            raise ValueError(f"フォントCSSの対象ブロックがありません: {css_config['to']}")
        css = "\n".join(keep) + "\n"
    if "./files/" in css or "woff2-variations" in css:
        raise ValueError(f"フォントCSSのURLを書き換えられません: {css_config['to']}")
    return css.encode("utf-8")


def add_output(outputs, public_path, data):
    relative = safe_relative_path(public_path)
    root_path = Path("public") / relative
    key = root_path.as_posix()
    if key in outputs:
        raise ValueError(f"出力先が重複しています: {key}")
    outputs[key] = data
    return relative.as_posix()


def download_dependencies(spec):
    outputs = {}
    packages = []
    for dependency in spec["dependencies"]:
        name = dependency["name"]
        source = dependency["source"]
        tarball = download(source["url"])
        actual_hash = sha256(tarball)
        expected_hash = source["sha256"]
        if actual_hash != expected_hash:
            raise ValueError(
                f"{name} の SHA-256 が一致しません: "
                f"expected={expected_hash}, actual={actual_hash}"
            )
        print(f"検証済み: {name}@{dependency['version']}")
        patterns = list(dependency["files"])
        if "css" in dependency:
            patterns.append({"from": dependency["css"]["from"]})
        selected = selected_files(tarball, patterns)
        package_files = {}
        for item in dependency["files"]:
            for source_name, data in selected[item["from"]]:
                destination = item["to"]
                if destination.endswith("/"):
                    destination = destination + PurePosixPath(source_name).name
                public_path = safe_relative_path(destination).as_posix()
                package_files[public_path] = sha256(data)
                add_output(outputs, public_path, data)
        if "license_download" in dependency:
            item = dependency["license_download"]
            data = fetch_verified(item["url"], item["sha256"], f"{name} のライセンス文書")
            public_path = safe_relative_path(item["to"]).as_posix()
            package_files[public_path] = sha256(data)
            add_output(outputs, public_path, data)
        license_document = dependency.get("license_document")
        if license_document and license_document not in package_files:
            license_path = PUBLIC / safe_relative_path(license_document)
            if not license_path.is_file():
                raise ValueError(f"ライセンス文書がありません: {license_document}")
            package_files[license_document] = sha256(license_path.read_bytes())
        if "css" in dependency:
            css_config = dependency["css"]
            css_source = selected[css_config["from"]][0][1]
            css_output = make_css(css_config, css_source)
            css_path = safe_relative_path(css_config["to"]).as_posix()
            package_files[css_path] = sha256(css_output)
            add_output(outputs, css_path, css_output)
        package = {
            "name": name,
            "version": dependency["version"],
            "license": dependency["license"],
            "source": source["url"],
            "tarball_sha256": actual_hash,
            "use": dependency["use"],
            "files": dict(sorted(package_files.items())),
        }
        for key in ("repository", "license_document", "license_note", "license_download"):
            if key in dependency:
                package[key] = dependency[key]
        packages.append(package)
    return packages, outputs


def previous_generated_files():
    if not MANIFEST.exists():
        return set()
    old_manifest = read_json(MANIFEST)
    paths = set()
    for package in old_manifest.get("packages", []) + old_manifest.get("local", []):
        paths.update(package.get("files", {}).keys())
    for component in old_manifest.get("corresponding_source", {}).get("components", []):
        paths.update(component.get("files", {}).keys())
    paths.update(old_manifest.get("generated_docs", []))
    return paths


def make_manifest(spec, packages, source=None):
    manifest = {
        "_comment": "tools/dependencies.json と tools/complete.py から生成。手で編集しない。",
        "schema_version": spec["schema_version"],
        "dependencies_sha256": sha256(
            json.dumps(spec, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ),
        "packages": packages,
    }
    if source:
        manifest["corresponding_source"] = source
    return manifest


def make_manifest_markdown(manifest):
    lines = [
        "# 外部依存の生成台帳",
        "",
        "本ファイルと `MANIFEST.json` は `python3 tools/complete.py` が生成します。",
        "外部ファイルは `tools/dependencies.json` に固定した版・SHA-256を検証して取得し、",
        "デプロイ後は同一オリジンの `vendor/` と `fonts/` から配信します。",
        "",
        "| 名前 | 版 | ライセンス | 用途 | 取得元 | upstream | tarball SHA-256 | ファイル数 |",
        "|---|---|---|---|---|---|---|---:|",
    ]
    for package in manifest["packages"]:
        values = [
            package["name"],
            package["version"],
            package["license"],
            package["use"],
            package["source"],
            package.get("repository", "—"),
            f"`{package['tarball_sha256']}`",
            str(len(package["files"])),
        ]
        lines.append("| " + " | ".join(value.replace("|", r"\|") for value in values) + " |")
    lines.extend(["", "各生成ファイルの SHA-256 は `MANIFEST.json` を参照してください。", ""])
    return "\n".join(lines)


def make_notice(manifest, deployed):
    manifest_path = "vendor/MANIFEST.json" if deployed else "public/vendor/MANIFEST.json"
    lines = [
        "# NOTICE",
        "",
        "Copyright (C) 2026 DTT-JP",
        "",
        "Visual Web Code フロントエンドの自作部分は GNU GPL version 3 or later "
        "(`GPL-3.0-or-later`) で提供します。",
        "以下の第三者資材は、それぞれのライセンス条件で提供されます。",
        f"この一覧は `{manifest_path}` から生成しています。",
        "",
        "| 資材 | 版 | ライセンス | ライセンス文書・補足 | 取得元 | 用途 |",
        "|---|---|---|---|---|---|",
    ]
    for package in manifest["packages"]:
        document = package.get("license_document")
        if document:
            target = document if deployed else f"public/{document}"
            license_text = f"[`{document}`]({target})"
        else:
            license_text = package.get("license_note", "同梱文書なし")
        if package.get("license_note") and document:
            license_text += " " + package["license_note"]
        values = [
            package["name"],
            package["version"],
            package["license"],
            license_text,
            package["source"],
            package["use"],
        ]
        lines.append("| " + " | ".join(
            str(value).replace("|", r"\|").replace("\n", " ") for value in values
        ) + " |")
    source_path = "vendor/ffmpeg/SOURCE.md" if deployed else "public/vendor/ffmpeg/SOURCE.md"
    lines.extend([
        "",
        "FE と BE は別リポジトリ・別配布物です。このリポジトリに PHP、BE の画面、BE のライブラリは含みません。",
        "",
        f"`@ffmpeg/core` の構成部品・対応ソース・取得方法は [`{source_path}`]({source_path}) "
        "とアプリ内の「ライセンス」に記載しています。",
        "",
    ])
    return "\n".join(lines)


def make_help_bundle():
    help_dir = PUBLIC / "help"
    files = {
        path.name: path.read_text(encoding="utf-8")
        for path in sorted(help_dir.glob("*.md"))
    }
    content = (
        "/* SPDX-License-Identifier: GPL-3.0-or-later */\n"
        "/* 自動生成: tools/complete.py（直接編集しない） */\n"
        "window.HELP_BUNDLE = " + json.dumps(files, ensure_ascii=False, indent=1) + ";\n"
    )
    return content.encode("utf-8")


def publish(outputs, stale_files, managed_files):
    with tempfile.TemporaryDirectory(prefix=".complete-", dir=ROOT) as temp_dir:
        staging = Path(temp_dir)
        for relative, content in outputs.items():
            path = staging / safe_relative_path(relative)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        for relative in sorted(outputs):
            source = staging / safe_relative_path(relative)
            destination = ROOT / safe_relative_path(relative)
            destination.parent.mkdir(parents=True, exist_ok=True)
            os.replace(source, destination)
    current = {
        Path(relative).relative_to("public").as_posix()
        for relative in outputs
        if relative.startswith("public/")
    }
    current.update(managed_files)
    for relative in stale_files - current:
        stale = PUBLIC / safe_relative_path(relative)
        if stale.is_file():
            stale.unlink()


def complete():
    spec = read_json(DEPENDENCIES)
    if spec.get("schema_version") != 1 or not spec.get("dependencies"):
        raise ValueError("dependencies.json の schema_version または dependencies が不正です")
    stale_files = previous_generated_files()
    packages, outputs = download_dependencies(spec)
    source = download_components(spec, outputs)
    manifest = make_manifest(spec, packages, source)
    docs, warnings = license_docs.build(manifest, outputs)  # public/license/*.md・bundle.js・vendor/ffmpeg/SOURCE.md
    for relative, data in docs.items():
        add_output(outputs, relative, data)
    manifest["generated_docs"] = sorted(docs)
    outputs["public/vendor/MANIFEST.json"] = (
        json.dumps(manifest, ensure_ascii=False, indent=1) + "\n"
    ).encode("utf-8")
    outputs["public/vendor/MANIFEST.md"] = make_manifest_markdown(manifest).encode("utf-8")
    outputs["public/help/bundle.js"] = make_help_bundle()
    outputs["NOTICE.md"] = make_notice(manifest, deployed=False).encode("utf-8")
    outputs["public/NOTICE.md"] = make_notice(manifest, deployed=True).encode("utf-8")
    outputs["public/LICENSE"] = (ROOT / "LICENSE").read_bytes()
    managed_files = {
        path
        for package in packages
        for path in package["files"]
    }
    for component in (source or {}).get("components", []):
        managed_files.update(component["files"])
    managed_files.update(docs)
    publish(outputs, stale_files, managed_files)
    for warning in warnings:
        print(f"警告: {warning}")
    print(f"完成: {len(packages)}依存、{sum(len(p['files']) for p in packages)}ファイルを public/ に生成しました")


def verify():
    spec = read_json(DEPENDENCIES)
    manifest = read_json(MANIFEST)
    expected_spec_hash = sha256(
        json.dumps(spec, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    )
    if manifest.get("dependencies_sha256") != expected_spec_hash:
        raise ValueError("MANIFEST.json は現在の tools/dependencies.json から生成されていません")
    expected = {
        (dependency["name"], dependency["version"], dependency["source"]["sha256"])
        for dependency in spec["dependencies"]
    }
    actual = {
        (package["name"], package["version"], package["tarball_sha256"])
        for package in manifest.get("packages", [])
    }
    if expected != actual:
        raise ValueError("MANIFEST.json と tools/dependencies.json の依存が一致しません")
    checked = 0
    failures = []
    groups = list(manifest["packages"]) + list(manifest.get("corresponding_source", {}).get("components", []))
    for package in groups:
        for relative, expected_hash in package["files"].items():
            path = PUBLIC / safe_relative_path(relative)
            if not path.is_file():
                failures.append(f"なし: {relative}")
            elif sha256(path.read_bytes()) != expected_hash:
                failures.append(f"SHA-256不一致: {relative}")
            checked += 1
    if failures:
        raise ValueError("\n".join(failures))
    print(f"検証OK: {len(manifest['packages'])}依存、{checked}ファイル（ネットワーク不要）")


if __name__ == "__main__":
    arguments = sys.argv[1:]
    if arguments == ["--verify"]:
        verify()
    elif not arguments:
        complete()
    else:
        raise SystemExit("使い方: python3 tools/complete.py [--verify]")
