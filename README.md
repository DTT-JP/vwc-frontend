# Visual Web Code フロントエンド

Visual Web Code は、ブラウザー上で HTML/CSS/JavaScript などを編集し、プロジェクト共有・履歴管理・アプリ公開を行う Web エディターです。このリポジトリはブラウザーへ配信するフロントエンドを収録します。サーバー側の PHP は含まず、バックエンドとは HTTP API で連携します。

> **公開前チェックリスト:** ライセンス表示（アプリ内「ライセンス」）と、FFmpeg（`@ffmpeg/core`、GPL-2.0-or-later）の構成部品・固定コミット・ライセンス文書は `tools/complete.py` が生成します。公開前に、[下のチェックリスト](#公開前チェックリスト) の未完了項目（FFmpeg のソース提供方法、再ビルド同一性の要否、Mermaid の依存ライセンス、法的確認）を済ませてください。

## 主な機能

- ファイル編集、プロジェクト共有（部員ごとの共有を、プロジェクトをまたいで一括で ON / OFF）、コミット履歴と復元
- 外部（エクスプローラーなど）からファイル・フォルダをファイル一覧へドラッグしてアップロード（落とした場所へ）
- 時間のかかる処理は、右下の通知と状態バーに「何をしているか・進み具合」を表示
- 履歴の差分は、ファイルごとに順に表示（大量のファイルでも画面が止まりません）
- 公開・限定公開・非公開アプリの管理画面
- 画像リサイズ、音声の切り出し、動画からの音声抽出
- ヘルプ、設定、検索、タッチ端末向け UI
- 外部 CDN に依存せず、必要なブラウザー資材は完成化時に取得して同一オリジンから配信

機能・API 契約の詳細は [`docs/`](docs/) とバックエンド側の `docs/` を参照してください。画面と動作の一部は開発用の偽 API を使って確認できます。偽 API は本番バックエンドではありません。

## リポジトリ構成

```text
public/       配布対象。tools/complete.py 実行後、中身をサーバーの editor/ に配置
  js/ css/    フロントエンド本体
  help/       ヘルプ記事と生成済みバンドル
  fonts/      完成化時に取得するアイコンフォント（生成物）
  vendor/     完成化時に取得する第三者ライブラリ・フォント（生成物）
  LICENSE     配布用 GPL-3.0-or-later 全文
  NOTICE.md   配布用第三者資材一覧
  license/    アプリ内「ライセンス」の文書（Markdown と bundle.js。complete.py が生成）
dev/          開発用の偽 API（本番配布には含めない）
docs/         画面・API 契約の写し
tools/        完成化スクリプト、外部依存定義、project.json（著作権者・ソース公開先）、
              fetch_ffmpeg_source.py（FFmpeg の対応ソース取得）
tests/        現在、自動ブラウザテストは未整備
LICENSE       GNU GPL version 3 or later
NOTICE.md     第三者資材一覧とライセンス文書への案内
CONTRIBUTING.md
```

FE と BE は別リポジトリ・別ライセンス・別配布物です。コード、ライブラリ、生成物を相互にコピーせず、HTTP API 契約を文書で同期します。API 契約の正本は BE の `docs/04_API.md`、このリポジトリの `docs/api-contract/04_API.md` はその写しです。

## 動作環境

サーバーには静的ファイルを配信できる Web サーバーが必要です。実 API を利用する場合は、同じオリジン・同じ `/editor/` 配下に別途 BE を配置します。

確認対象のブラウザーは次のとおりです。

- Chrome / Edge 111 以上
- Firefox 121 以上
- Safari / iOS 16.2 以上

ツールの一部は WebAssembly、カメラまたはブラウザーのメディア機能を使います。HTTPS が必要な機能があり、組織ポリシーや端末の制限により使えない場合があります。

## 配置方法

1. デプロイ前に、ネットワークへ接続できるビルド環境で完成化スクリプトを実行します。
2. BE の `editor/` の中身をサーバーの `editor/` に配置します。
3. 完成化した `public/` の中身を同じ `editor/` に配置します。FE と BE のファイルが上書きされないことを確認してください。
4. サーバーへ配置する `config.js` を作ります。

```sh
python3 tools/complete.py
cp public/config.sample.js public/config.js
```

完成化スクリプトは Python 3.8 以上の標準ライブラリだけを使います。`tools/dependencies.json` に固定された全フォント、アイコン、外部ライブラリをダウンロードし、SHA-256 を確認して `public/` に配置します。ダウンロードした資材は実行時に外部 CDN へ接続せず、配置先の同一オリジンから配信します。完了後の `public/` をデプロイ対象にしてください。

通常は `apiBase: 'system/api/index.php'`, `requiredApi: 1` のまま使います。`config.js` は環境ごとのローカル設定であり、公開リポジトリにコミットしないでください。FE と BE は同一オリジンで動かしてください。別オリジン構成はサポート対象外です。

## 開発用偽 API

Python 3 の標準ライブラリだけで、FE とサンプル API をローカル起動できます。

```sh
python3 dev/fake-api/server.py --port 8765
```

ブラウザーで `http://127.0.0.1:8765/` を開きます。画面に表示される名前、プロジェクト、IP アドレス等は合成データです。偽 API は認証やアクセス制御を実装していないため、LAN やインターネットへ公開しないでください。

## 開発・検証

```sh
# 外部資材を取得し、public/ を完成化
python3 tools/complete.py

# 生成済みファイルのハッシュ確認（ネットワーク不要）
python3 tools/complete.py --verify
```

FE に自動ブラウザテストの実行環境はまだありません。変更後は偽 API を起動して、対象画面を手動で確認してください。ヘルプ記事や NOTICE は完成化スクリプトが同時に再生成します。外部資材を追加・更新するときは `tools/dependencies.json` を変更し、完成化を実行して動作とライセンス表示を確認してください。

### `tools/dependencies.json` の記述方法

この JSON が外部依存の唯一の定義です。`dependencies` 配列に、利用する各パッケージを一件ずつ記述します。

```json
{
  "name": "package-name",
  "version": "固定した版",
  "license": "SPDXライセンス識別子",
  "use": "アプリ内での用途",
  "source": {
    "url": "https://registry.npmjs.org/package-name/-/package-name-固定した版.tgz",
    "sha256": "配布tarball全体の64桁のSHA-256"
  },
  "files": [
    {
      "from": "tarball内のパスまたはglob",
      "to": "public/以下の配置先（vendor/ または fonts/）"
    }
  ]
}
```

`license_document` には `public/` からの相対パスでライセンス本文を指定します。本文が配布物にない場合は `license_note` に確認できた根拠を記録します。GitHub 配布元も明示する場合は `repository` を追加できます。フォントCSSを加工する依存は、同じ項目に `css`（`from`、`to`、置換前後の `family`、出力先 `directory`）を指定します。可変版の更新時は版・URL・ライセンス・tarball SHA-256 を一緒に確認し、生成台帳との差分と動作を確認してください。完成化スクリプトは指定SHA-256と一致しない配布物を拒否します。

## ライセンス・第三者資材

この FE の自作部分は [GNU General Public License version 3 or later](LICENSE) で提供します。第三者資材はそれぞれ異なるライセンスに従います。

アプリ内では、ログインの有無に関係なく、ブラウザの中だけで次を表示します（バックエンドは不要）。

- 設定 → ライセンス、またはログアウト時のホームの「ライセンス」から、右エリアのタブとして開きます。
- 文書は `public/license/*.md` と、それをまとめた `public/license/bundle.js` です。**`tools/complete.py` が、固定した版の配布物と、上流リポジトリの固定コミットから取得した（SHA-256 を検証した）ライセンス文書から生成します。手で編集しないでください。**

`@ffmpeg/core` は GPL-2.0-or-later です（FFmpeg 5.1.4 を `--enable-gpl` でビルド）。構成部品と、固定したコミット、ライセンス文書は `tools/dependencies.json` の `corresponding_source` に記録し、[`public/vendor/ffmpeg/SOURCE.md`](public/vendor/ffmpeg/SOURCE.md) とアプリ内「ライセンス」に出力します。対応ソースの取得は次のコマンドです（git が必要）。

```sh
python3 tools/fetch_ffmpeg_source.py --out ffmpeg-source
```

### 公開前チェックリスト

1. **設定済み:** `tools/project.json` の `source_repository` はこのリポジトリの GitHub URL です。設定を変えた場合は `python3 tools/complete.py` を再実行してください。
2. **URL設定済み・公開方法は未確認:** `ffmpeg_source_url` は FFmpeg 本体（n5.1.4）の固定コミットを指します。その他の構成部品・ビルド手順の固定コミットは [`public/vendor/ffmpeg/SOURCE.md`](public/vendor/ffmpeg/SOURCE.md) に出力されます。全構成部品のアーカイブが必要な場合は `python3 tools/fetch_ffmpeg_source.py --out ffmpeg-source` で作成できます。GitHub上の参照先またはアーカイブの提供方法が、実際の配布形態における GPL の要件を満たすか確認してください。
3. **未実施:** 配布バイナリを `SOURCE.md` の手順で再ビルドして一致するかは確認していません。x264 と LAME は上流のビルド手順がブランチ名で指定しているため、同一性の確認には限界があります。公開に必要か判断してください。
4. **未確認:** Mermaid 11.17.2 の `mermaid.min.js` にバンドルされた各依存ライブラリのライセンス・著作権表示を確認してください（アプリ内「第三者ソフトウェア」にも記載）。
5. **未実施:** 公開前に、専門家による法的確認を受けてください。本 README は法的助言ではありません。

ログイン画面の「Microsoft でサインイン」ボタンは、[Microsoft のブランドガイドライン](https://learn.microsoft.com/ja-jp/entra/identity-platform/howto-add-branding-in-apps)に従っています（ロゴは改変せず、文言は「Microsoft でサインイン」）。寸法・色は公式画像に合わせた値ですが、公式画像との照合は **要確認** です。

## コントリビューション

変更を提案する前に [`CONTRIBUTING.md`](CONTRIBUTING.md) を確認してください。特に FE/BE の分離、第三者ライセンス、設定ファイル・利用者データの除外を守ってください。
