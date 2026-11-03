# コントリビューション

## 基本方針

- FE と BE は別リポジトリです。FE は GPL-3.0-or-later を維持します。
- API 契約の正本は BE の `docs/04_API.md`、FE 側は `docs/api-contract/04_API.md` の写しです。契約変更時は両方を更新してください。
- `public/` がブラウザーへの配布物です。外部資材、ヘルプバンドル、NOTICE は `python3 tools/complete.py` 一つで生成します。生成依存ファイルは `.gitignore` 対象です。
- `dev/` は開発専用の偽 API です。本番環境へ配置したり、実データ・シークレットを入れたりしないでください。
- 外部 CDN は使いません。依存定義は `tools/dependencies.json`、生成台帳は `public/vendor/MANIFEST.json` で管理します。依存定義の編集形式は README を参照してください。
- 見た目・操作性を変える変更は、変更理由と確認した画面・端末を記述してください。

## 開発・検証

Python 3 の標準ライブラリを使い、次のコマンドで偽 API を起動します。

```sh
python3 dev/fake-api/server.py --port 8765
```

`python3 tools/complete.py` で依存資材を取得し、完成した配布物を生成します。`python3 tools/complete.py --verify` で生成済み資材のハッシュをネットワークなしで検証できます。FE の自動ブラウザテストは未整備です。画面変更は偽 API を使って手動確認してください。

## ライセンスと境界

- 自作の FE コードは GPL-3.0-or-later です。第三者資材には個別のライセンスが適用されます。
- BE の PHP、BE の画面、BE のライブラリをこのリポジトリへコピーしないでください。
- ffmpeg.wasm は [`ffmpegwasm/ffmpeg.wasm`](https://github.com/ffmpegwasm/ffmpeg.wasm) の公式配布物を使い、版と取得物の SHA-256 は `tools/dependencies.json` に固定します。
- ffmpeg.wasm の構成部品と固定コミットは `tools/dependencies.json` の `corresponding_source` に記録し、`public/vendor/ffmpeg/SOURCE.md` とアプリ内「ライセンス」は `tools/complete.py` が生成します。公開前の作業は README の「公開前チェックリスト」を参照してください。
- アプリ内「ライセンス」（`public/license/`）は手で編集せず、`tools/complete.py`（と `tools/project.json`）から生成します。
- 新しい第三者資材を追加・更新するときは、権利者、正確な版、ライセンス、取得元、ライセンス文書、ハッシュを確認し、`NOTICE.md` とアプリ内ライセンス表示を更新してください。
- 設定ファイル、利用者のファイル、ローカル DB、アクセストークン、個人情報をコミットしないでください。
