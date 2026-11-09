## FE 2.0.4 (2026-11-09)
- 修正: 管理画面（SM07）の「認証システム（IdP）の管理を開く」リンク（`<a class="row">`）が周囲のメニュー項目より青いリンク表示で浮いて見える問題を修正。`public/css/layout.css` の `.row` に `color: inherit; text-decoration: none;` を追加し、周囲の `.row` と同じ見た目に統一。

## FE 2.0.3 (2026-11-09)
- 修正: `dev/fake-api/server.py` を BE/FE 2.0 実態に対応（`meta/version` の MAJOR/`backend.version` 整合、`login_providers=["idp"]`、`backend.apis` の `since`［`admin/admins_status`=1.2］、`me` の `idp_linked`/`adminDesignated`/`limits`、部員・管理APIの v2 形状、`admin/admins_status` 実装、`members/search` の `[{id,name}]` 応答 等）
- 訂正: `docs/api-assumptions.md`・`docs/09_UI.md`・`docs/instructions/00_修正指示書_FE.md` を v2 実態に整合（`is_admin` 非送信/BE入力廃止、`requiredApi`/`features` 廃止、IdP専用、MAJOR 判定は `backend.version` と FE `VERSION`。指示書は履歴+現行注記）
- 更新: `docs/rules/03_バージョン管理_適用と追補.md`・`04_API規則.md`・`VERSION` を vwc-rules rules-v1.0.4（7cef352）正本から再複製

# CHANGELOG (vwc-frontend)

## FE 2.0.2 (2026-11-09)
- 修正: メディアファイルのプレビュー表示（コード表示・MD/HTMLプレビューを除く）で、画像・動画が割り当てエリア（分割表示の各ペイン/非分割）から上下左右にはみ出す問題を修正。`public/js/tools.js` の `mediaPane()` を `.media-preview` / `.media-fit-wrap` / `.media-fit` 構造へ変更し、`public/css/layout.css` に `max-width`/`max-height`/`object-fit: contain`/`min-height:0`/`min-width:0`/`overflow:hidden` による収まり込み用スタイルを追加。
- 影響範囲: エディタペインで開く非テキストの画像/動画プレビューが対象。既存の `.tl-pv`（ツール用サムネイル等）は維持。MD/HTMLプレビュー（`.md-fig` 等）は対象外。

## FE 2.0.1 (2026-11-09)
- 修正(U1準拠): すべてのアイコンの回転アニメーションを例外なく禁止（アップロード中/処理中等を含む）。`public/css/features.css` の `.ms.spin` 回転（`@keyframes msspin`）を無効化し、`public/css/layout.css` の `.dsc-h` 展開矢印は回転トランジションを除去。特定角度への固定回転表示（展開時矢印の180°）は従来どおり維持。
- 規則: `vwc-rules` 1.0.3 の `rules/06_UI・視覚ルール.md`（`U1`）に準拠。

## FE 2.0.0 (2026-11-08)
- 破壊的変更(MAJOR, P5): Entra/Microsoft ログイン UI・経路を廃止（`Api.microsoftUrl`、ログインの `ms` タブ/`#ms-login`/MSカード、`openLogin('ms')`/MSプロバイダ分岐、関連文言を削除）。ログインは部活アカウント（IdP）+ QR/数字コード（案A）。
- 破壊的変更: `config.sample.js` から `requiredApi` を削除。`boot.js` の `requiredApi`/`api_version` 比較を削除し、MAJOR 比較は `backend.version` と `public/VERSION` のみ。`meta.features` の読み取りを削除。
- 破壊的変更(D4): 管理画面から管理者チェック/`is_admin` 送信/CSV「管理者権限」列を削除（BE 2.0 が受け付けない）。部員追加/編集は許可フィールドのみ送信、CSV は `部員ID,名前,メール,役職`。管理者権限は IdP 管理で設定。
- 変更(D5): Microsoft 固有エラー `E-A03` `E-A04` `E-A05` `E-A10` `E-A12` `E-A14` を `app.js`/`boot.js` から削除。未知コードは `E-A99` にフォールバック維持。
- 変更: 再認証は `Api.idpUrl('reauth')` を使用。`help/14-admin.md` 等の主要ヘルプ/文書の MS 表現を IdP 前提へ更新（`help/bundle.js` 等の生成物は要確認）。
- 契約: `docs/api-contract/04_API.md` を BE 2.0.0（P5作業結果）に複製ヘッダー付きで更新。`dev/fake-api/server.py` を 2.0 形（`features` なし・`api_version=2`・`login_providers=["idp"]`・`admin/device_revoke`/`is_admin`/MS入口除去）へ更新。
- 検証: `node --check` 全 `public/js/*.js` OK。`tools/calc-build-hash.py --vectors` ALL PASS。`tools/check-api-usage.py` C6-1/C6-2/C7/C8 PASS。`build-manifest.json`/`BUILD_REFERENCE` 更新（build `8cc93c8`）。
- 備考: ユーザー承諾なしに git コミット/タグは未作成。配備は BE 2.0.0 → FE 2.0.0 を続けて。実機/iPad/通常ブラウザでのログイン・再認証ポップアップ・COOP（U6）確認は人間が必要。
- 予定タグ: `fe-v2.0.0`（利用者の承諾後）

## FE 1.2.0 (2026-11-07)
- 追加: 部活アカウント（IdP）でのログイン・再認証・ログアウト（`meta/version.login_providers` で出し分け、先頭が既定タブ）。`Api.idpUrl(mode)`（`direct/register/reauth/logout`）追加、`microsoftUrl` は 2.0.0 まで維持。
- 追加: エラー `E-A20`〜`E-A24`（IdP由来）と `E-P22`（`managed_by_idp`）。`E-A01`〜`E-A15` の文言は方式非依存（認証システム）に整理済み。
- 変更: 結び付いた部員（`idp_linked`）の管理者フラグは FE では無効化し、認証システム（IdP）の管理画面で設定する案内を表示。CSV 取込で `ignored_admin` があれば案内を表示。
- 追加: 管理画面の「認証システム（IdP）の管理を開く」リンク（`config.js` の任意設定 `idpBase`、既定 `../auth/`）。FE は IdP API を fetch せず画面遷移/リンクのみ。
- 変更: 再認証は部員の IdP 結び付きと `login_providers` に応じて `idp.php`/`microsoft.php` を選択。ログアウト後、IdP 結び付き部員は `idp.php?mode=logout` へ遷移。
- 変更: ヘルプ/文書のログイン・再認証表現を方式非依存に更新（`help/14-admin.md`・`help/bundle.js`・`docs/15_画面定義.md`・`docs/api-assumptions.md`）。契約の写し `docs/api-contract/04_API.md` を BE 1.2.0 相当（作業ツリー, HEAD 4f57482）に複製ヘッダー付きで更新。
- 備考: 配備は IdP 1.0.0 → BE 1.2.0 → FE 1.2.0。再認証ポップアップの実機動作（U6）・ログイン画面の実UI確認は人間確認が必要。偽 API は既存契約整合を維持（P3専用エンドポイント追加なし）。
- 予定タグ: `fe-v1.2.0`（本コミット時点では未作成。コミットは利用者の承諾後）

## FE 1.1.0 (2026-11-07)
- 追加: `public/VERSION`（1.1.0）・`public/build-manifest.json`・設定画面のバージョン情報（`#sm09`「バージョン情報」）・整合性の確認（`js/version.js`。`CRLF→LF` 正規化、同時4件取得、差分表示）
- 追加: 互換判定（`js/compat.js` の `VWCCompat`/`USED_APIS`、`js/boot.js`。`backend.version` の MAJOR 優先・`api_version` 併用、`backend.apis` による部分互換/非推奨警告。取得失敗時はアプリ本体を継続）
- 追加: `tools/calc-build-hash.py`（`--vectors` 対応、`build-manifest.json` 生成）・`tools/check-api-usage.py`（C6〜C8）・`dev/vector-test.html`（JS適合テストベクタ手動確認）
- 変更: 契約の写し `docs/api-contract/04_API.md` を BE 1.1.0 相当（コミット f82dad7）に更新（複製ヘッダー付き。本文は複製元と同一）
- 変更: 偽 API `dev/fake-api/server.py` を `meta/version` の新しい形（`backend`/`login_providers`/`apis`）と `auth/lookup`、`admin/device_revoke` 応答に対応
- 変更: `public/.htaccess` の no-cache 対象に `VERSION`・`build-manifest.json` を追加
- 変更: `js/data.js` の `DATA.meta` に `backend`/`login_providers`、`DATA.user` に `idpLinked`（将来用）を追加
- 備考: 配備は BE 1.1.0 の後（BE→FE）。`api_version`/`requiredApi` による旧互換は FE 1.x の間維持
- 予定タグ: `fe-v1.1.0`（本コミット時点では未作成。コミットは利用者の承諾後）
