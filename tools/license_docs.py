# SPDX-License-Identifier: GPL-3.0-or-later
"""アプリ内ライセンス表示（public/license/*.md と bundle.js）と vendor/ffmpeg/SOURCE.md を生成する。

tools/complete.py から呼ばれる。入力は、検証済みの MANIFEST（版・ライセンス・取得元）、
ダウンロードして検証した各ライセンス文書、tools/project.json（著作権者・ソース公開先）だけで、
手書きの文書は含まない。アプリは license/ をバックエンドなしで読み込む。
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
PROJECT = ROOT / "tools" / "project.json"

CORE = "@ffmpeg/core"


def cell(value):
    return str(value).replace("|", r"\|").replace("\n", " ")


def fence(text):
    text = text.replace("\r\n", "\n").rstrip("\n")
    if "```" in text:
        raise ValueError("ライセンス文書に ``` が含まれているため Markdown に埋め込めません")
    return "```text\n" + text + "\n```"


def load_project():
    data = {"copyright": "Copyright (C) 2026 DTT-JP", "source_repository": "", "ffmpeg_source_url": ""}
    if PROJECT.exists():
        data.update(json.loads(PROJECT.read_text(encoding="utf-8")))
    return data


def reader(outputs):
    def read(relative):
        key = "public/" + relative
        if key in outputs:
            return outputs[key].decode("utf-8", errors="replace")
        return (PUBLIC / relative).read_text(encoding="utf-8", errors="replace")
    return read


def source_lines(project):
    repo = project.get("source_repository", "").strip()
    if repo:
        return [f"- このフロントエンドのソースコード：[{repo}]({repo})"]
    return ["- このフロントエンドのソースコード：このアプリを配布している運営者から入手できます（GPL-3.0 の第6条）。"]


def overview(project, manifest):
    lines = [
        "# このアプリのライセンス",
        "",
        "Visual Web Code フロントエンド（以下「このアプリ」）は、**GNU General Public License version 3 or later（GPL-3.0-or-later）** で提供されます。",
        "",
        project["copyright"],
        "",
        "このプログラムは、自由ソフトウェアです。フリーソフトウェア財団が発行する GNU 一般公衆利用許諾契約書（バージョン3、または、あなたの選択により、それ以降のいずれかのバージョン）の定める条件のもとで、再配布・改変できます。",
        "",
        "このプログラムは有用であることを願って配布されていますが、**いかなる保証もありません**。商品性や特定目的への適合性についての黙示の保証もありません。詳細は GPL をご覧ください。",
        "",
        "> [!NOTE] 条文について",
        "> 条文は英語の原文が正本です（[GPL-3.0 全文](02-gpl-3.0.md)）。このページの日本語は説明であり、条文を置き換えるものではありません。",
        "",
        "## ソースコード",
        "",
        "このアプリの JavaScript・CSS・HTML は、圧縮や難読化をせず、ソースコードのまま配信されています。",
        *source_lines(project),
        "- FFmpeg（音声・動画の変換に使う WebAssembly）のソースコード：[FFmpeg](04-ffmpeg.md) を参照してください。",
        "",
        "このアプリ（フロントエンド）とサーバー側のプログラム（バックエンド）は、別のプログラムで、別々に配布されます。このアプリの配布物にバックエンドのコードは含まれません。",
        "",
        "## このアプリに含まれる第三者のソフトウェア",
        "",
        "フォント、アイコン、構文強調、図の描画、QRコード、音声・動画の変換などで第三者のソフトウェアを同梱しています。それぞれのライセンスに従います。",
        "",
        "- 一覧と版・取得元：[第三者ソフトウェア](03-third-party.md)",
        "- FFmpeg と、その中に含まれる部品：[FFmpeg](04-ffmpeg.md)",
        "- 各ライセンスの全文：[ライセンス全文](05-notices.md)",
        "",
        "このアプリを使うために、ログインや通信は必要ありません。このページはブラウザの中だけで表示しています。",
        "",
    ]
    return "\n".join(lines)


def gpl3(read):
    text = read("LICENSE")
    return "# GNU General Public License version 3\n\nこのアプリ本体のライセンス全文です（英語の原文）。\n\n" + fence(text) + "\n"


def third_party(manifest):
    lines = [
        "# 第三者ソフトウェア",
        "",
        "このアプリには、次の第三者ソフトウェアを同梱しています。版・取得元・SHA-256 は、配布物を作るときに検証したものです。ライセンスの全文は[ライセンス全文](05-notices.md)にあります。",
        "",
        "| 名前 | 版 | ライセンス | 用途 | 取得元 |",
        "|---|---|---|---|---|",
    ]
    for p in manifest["packages"]:
        lines.append("| " + " | ".join(cell(v) for v in (p["name"], p["version"], p["license"], p["use"], p["source"])) + " |")
    lines += [
        "",
        "## 補足",
        "",
        "- **FFmpeg（@ffmpeg/core）** は GPL-2.0-or-later のバイナリで、多くの部品を含みます。詳しくは [FFmpeg](04-ffmpeg.md) を参照してください。",
        "- **Mermaid** は、図を描くときだけ読み込みます。`mermaid.min.js` は、Mermaid が依存するライブラリをまとめた1ファイルです。確認できたのは DOMPurify の表示（Apache-2.0 と MPL-2.0 の選択）だけで、そのほかの同梱ライブラリ（D3、Cytoscape、KaTeX、dayjs、marked、roughjs など）の個別のライセンス表示は、**要確認**です。Mermaid 11.17.2 のパッケージの依存関係を、取得元の配布物で確認してください。",
        "- **Material Symbols**（アイコン）は Apache-2.0 です。Google のアイコンフォントです。",
        "- **QRコード**：「QRコード」は株式会社デンソーウェーブの登録商標です。",
        "- **Microsoft のロゴ**：ログイン画面の「Microsoft でサインイン」ボタンのロゴは Microsoft の商標で、同社のガイドラインに従って表示しています。このアプリのライセンス（GPL）の対象ではありません。",
        "",
    ]
    return "\n".join(lines)


def component_table(source):
    lines = [
        "| 部品 | 版 | ライセンス | 取得元と固定コミット |",
        "|---|---|---|---|",
    ]
    for c in source["components"]:
        lines.append("| " + " | ".join(cell(v) for v in (
            c["name"], c["version"], c["license"],
            f"[{c['repository'].split('github.com/')[1]}]({c['repository']}) の `{c['commit']}`",
        )) + " |")
    return "\n".join(lines)


def ffmpeg_doc(manifest, project):
    source = manifest.get("corresponding_source")
    core = next(p for p in manifest["packages"] if p["name"] == CORE)
    url = project.get("ffmpeg_source_url", "").strip()
    lines = [
        "# FFmpeg（音声・動画の変換）",
        "",
        f"音声の切り出しや動画からの音声の取り出しには、ブラウザの中で動く FFmpeg（ffmpeg.wasm の `{CORE}` {core['version']}）を使っています。変換はあなたのブラウザの中だけで行われ、ファイルはサーバーに送られません。",
        "",
        "## ライセンス",
        "",
        "- `ffmpeg-core.wasm` と `ffmpeg-core.js`：**GPL-2.0-or-later**（FFmpeg 5.1.4 を `--enable-gpl` でビルド。`--enable-version3` は使っていません）。x264・x265 を含むためです。",
        "- `ffmpeg.js`（呼び出し側）：MIT。",
        "- このアプリ本体（GPL-3.0-or-later）とは、GPL-2.0-or-later の「それ以降」の条件により、組み合わせて配布できます。",
        "",
        "GPL-2.0 の全文は[ライセンス全文](05-notices.md)にあります。",
        "",
        "## 含まれる部品",
        "",
        "`ffmpeg-core.wasm` に埋め込まれたビルド設定から確認した構成です。",
        "",
        "```text",
        source["configure"] if source else "",
        "```",
        "",
        "ビルド環境は " + (source["toolchain"] if source else "") + " です。",
        "",
        component_table(source) if source else "",
        "",
        "## ソースコードの入手",
        "",
        "GPL に基づき、`ffmpeg-core.wasm` の対応ソースコードを入手できます。",
        "",
    ]
    if url:
        lines += [f"- 対応ソースコード一式：[{url}]({url})", ""]
    else:
        lines += ["- 対応ソースコード一式：このアプリを配布している運営者に請求してください。", ""]
    lines += [
        "- 上の表のコミットを、各リポジトリから取得できます。ビルド手順は ffmpeg.wasm の Dockerfile と `build/*.sh` です。",
        f"- {source['build_recipe'] if source else ''}",
        "- 配布元は、リポジトリの `tools/fetch_ffmpeg_source.py` で、上の表のソースを検証しながらまとめて取得できます。",
        "",
        "> [!NOTE] 確認の範囲",
        "> 表の版は、`ffmpeg-core.wasm` に埋め込まれた文字列（FFmpeg 5.1 系、libvpx v1.13.1、LAME 3.100、zlib 1.2.11、FriBidi 1.0.9、HarfBuzz 5.2.0、Emscripten 3.1.40）と、上流の Dockerfile で照合しました。配布されたバイナリを、この手順で作り直して同一になることまでは確認していません。",
        "",
        "各部品のライセンス文書は、[ライセンス全文](05-notices.md)にあります。",
        "",
    ]
    return "\n".join(lines)


def notices(manifest, read):
    lines = [
        "# ライセンス全文",
        "",
        "同梱している第三者ソフトウェアのライセンス文書です。配布物に含まれていた文書、または上流のリポジトリの固定コミットから取得して SHA-256 を検証した文書を、そのまま載せています。",
        "",
    ]
    seen = set()
    for p in manifest["packages"]:
        doc = p.get("license_document")
        lines += [f"## {p['name']} {p['version']}（{p['license']}）", ""]
        if doc and doc not in seen:
            seen.add(doc)
            lines += [fence(read(doc)), ""]
        elif doc:
            lines += [f"上と同じ文書です（`{doc}`）。", ""]
        else:
            lines += [p.get("license_note", "ライセンス文書が配布物にありません。"), ""]
    source = manifest.get("corresponding_source")
    if source:
        lines += ["# FFmpeg に含まれる部品のライセンス", ""]
        for c in source["components"]:
            lines += [f"## {c['name']} {c['version']}（{c['license']}）", ""]
            if c.get("note"):
                lines += [c["note"], ""]
            for relative in c["files"]:
                lines += [f"`{Path(relative).name}`（`{c['commit'][:12]}`）", "", fence(read(relative)), ""]
    return "\n".join(lines)


def source_md(manifest, project):
    source = manifest["corresponding_source"]
    core = next(p for p in manifest["packages"] if p["name"] == CORE)
    lines = [
        "# ffmpeg.wasm の対応ソース",
        "",
        "本ファイルは `python3 tools/complete.py` が `tools/dependencies.json` から生成します。手で編集しないでください。",
        "",
        f"`{CORE}` {core['version']}（tarball SHA-256 `{core['tarball_sha256']}`）は GPL-2.0-or-later です。次が、そのバイナリの構成部品と、固定した取得元です。",
        "",
        f"- ビルド手順：{source['build_recipe']}",
        f"- ビルド環境：{source['toolchain']}",
        f"- configure：`{source['configure']}`",
        "",
        component_table(source),
        "",
        "## 取得方法",
        "",
        "```sh",
        "python3 tools/fetch_ffmpeg_source.py --out ffmpeg-source",
        "```",
        "",
        "各部品を固定コミットで取得し、`ffmpeg-source/` に tar.gz と `SHA256SUMS` を作ります（git が必要です）。GPL に基づき、`ffmpeg-core.wasm` を配信する運営者は、このソース一式を、配信するのと同じ場所から入手できるようにしてください。公開先は `tools/project.json` の `ffmpeg_source_url` に書きます（アプリ内のライセンス表示に出ます）。",
        "",
        "## 確認の範囲",
        "",
        "- `ffmpeg-core.wasm` に埋め込まれたビルド設定と版の文字列を、上流の Dockerfile（コミット `71aa99d37c02a7b4c435275ca9ef50e612f6efa1`）と照合しました。",
        "- x264 は `4-cores` ブランチ、LAME は `master` ブランチを Dockerfile が指しています。表のコミットは、取得時点の先頭で、どちらも `@ffmpeg/core` 0.12.10 の公開日（2025-01-07）より前の日付です。ビルド時点と同一かは、上流がブランチ名でしか固定していないため、確認できません。",
        "- 配布バイナリを、この手順で再ビルドして同一になることは確認していません。法的な確認は、公開前に専門家へ依頼してください。",
        "",
    ]
    return "\n".join(lines)


INDEX = """# ライセンスの目次

このファイルに並べた `.md` が、アプリ内のライセンス表示の項目になります（tools/complete.py が生成）。

## このアプリ
- 01-overview.md
- 02-gpl-3.0.md

## 第三者ソフトウェア
- 03-third-party.md
- 04-ffmpeg.md
- 05-notices.md
"""


def build(manifest, outputs):
    """生成物 {public からの相対パス: bytes} を返す。"""
    project = load_project()
    read = reader(outputs)
    docs = {
        "_index.md": INDEX,
        "01-overview.md": overview(project, manifest),
        "02-gpl-3.0.md": gpl3(read),
        "03-third-party.md": third_party(manifest),
        "05-notices.md": notices(manifest, read),
    }
    if manifest.get("corresponding_source"):
        docs["04-ffmpeg.md"] = ffmpeg_doc(manifest, project)
    else:
        docs["_index.md"] = INDEX.replace("- 04-ffmpeg.md\n", "")
    result = {"license/" + name: text.encode("utf-8") for name, text in docs.items()}
    bundle = (
        "/* SPDX-License-Identifier: GPL-3.0-or-later */\n"
        "/* 自動生成: tools/complete.py（直接編集しない） */\n"
        "window.LICENSE_BUNDLE = " + json.dumps(docs, ensure_ascii=False, indent=1) + ";\n"
    )
    result["license/bundle.js"] = bundle.encode("utf-8")
    if manifest.get("corresponding_source"):
        result["vendor/ffmpeg/SOURCE.md"] = source_md(manifest, project).encode("utf-8")
    warnings = []
    if not project.get("source_repository", "").strip():
        warnings.append("tools/project.json の source_repository が未設定です（公開先が決まったら設定して再実行してください）")
    if manifest.get("corresponding_source") and not project.get("ffmpeg_source_url", "").strip():
        warnings.append("tools/project.json の ffmpeg_source_url が未設定です（FFmpeg の対応ソースの公開先）")
    return result, warnings
