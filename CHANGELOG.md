## FE 2.2.5 (2026-11-10)
- 修正(通知): 通知表示時に通知履歴を同時表示しないよう変更し、通知履歴の一括削除ボタンを「履歴」行右側に追加。通知ボタン上部の不自然な当たり判定を除去。
- 修正(お知らせ): お知らせ本文内の URL をクリック可能なリンクとして表示（文字色は青にせず下線）。
- 修正(UI): 各種ポップアップで内容近傍の誤クリックによる閉じを抑制（遠い場所のクリックで閉じる挙動は維持）。
- 変更(共有): 共有パネルの一括指定ペンマークを右揃えにし、一括設定を「共有機能を有効にする」「共有された人が編集できる」「共有された人が公開できる」の3チェックボックス構成に変更。追補として、対象を「現在プロジェクトの全共有先（既存共有メンバー全員）に一律適用」に修正。
- 修正(共有): 部員検索の補完で部員 ID/名前の両方を扱えるよう改善し、自分以外の部員名が補完されにくい問題に対応。
- 変更(ログイン): ログイン時・認証時にプロジェクトを自動で開かないよう変更（未オープン状態で開始）。
- 変更(認証): QR/コードログイン時は信頼端末登録導線を表示せず登録不可に（`me.can_register_trusted` に追従）。
- 修正(メディア): エディタ内の動画/音声を全体ダウンロード前提から `files/raw` 参照による再生に変更し、ストリーミング再生/シークに対応。対応メディア拡張子を拡張。
- 改善(公開アプリ): `index.html` がない場合にファイル一覧 HTML を自動生成する旨を公開確認画面に表示（BE側自動生成と連携）。
- 修正(ファイル操作): ファイル/フォルダ追加の名前入力確定を1回1件に制限し、同一操作での多重作成を防止。
- 改善(管理/保守): GC 実行結果を保存・再表示できるようにし、GC ボタンを上部へ移動。GC 結果表示をカテゴリ別内訳に対応。
- 追加(統合/依存管理): 統一依存定義 `dependencies.json` を追加し、`tools/dependencies.json` を正規定義へのシンボリックリンクに変更。

## FE 2.2.4 (2026-11-10)
- 変更(アップロード): chunk分割送信を廃止し、`files/upload` による単発アップロード（最大2048MB）へ変更。送信前に全体ハッシュ(FNV-1a)を計算し、難読化した本文を1リクエストで送信。失敗時は全体再送する構成にし、WAF/連投起因の不安定化を回避。

## FE 2.2.3 (2026-11-10)
- 修正(アップロード): 大容量ファイル送信時のWAF誤検知403回避のため、chunkサイズを5MBから1MBへ縮小（BE側受信上限と整合、動的鍵ストリーム難読化・従来形式互換維持）。

## FE 2.2.2 (2026-11-10)
- 修正(アップロード): `files/upload_chunk` 生バイナリ送信の難読化を、固定XOR(0x55)から `upload_id` とチャンク番号由来の動的鍵ストリーム方式へ変更。チャンクごとに転送パターンが変化するようにし、WAFのシグネチャ誤検知による403回避性を強化（BE側で同方式復号・従来形式互換維持）。

## FE 2.2.1 (2026-11-10)
- 修正(アップロード): `files/upload_chunk` を生バイナリ+クエリ送信に変更し、転送時XOR(0x55)難読化を追加。LiteSpeed/WAF等による本文シグネチャ誤検知403を回避（BE側で復号・従来形式互換）。

## FE 2.2.0 (2026-11-10)
- 修正: Safari/WebKitで読み込み中表示のまま止まる場合がある問題を改善（起動処理の例外保護・ローディング解除保証、API呼び出しのタイムアウト/中断保護、互換性調整）
- 修正(バージョン表記): BEバージョンが旧形式扱いになる表示を修正し、FE/BEのバージョン情報をカード型UIに刷新。FE側変更の確認結果を「変更がある/ない」のみ表示するよう変更
- 変更(設定): ON/OFFで扱える設定項目（コード補完）をチェックボックス化し、保存形式の互換を維持
- 追加(エンコーディング): UTF-8テキストの形式表示からエンコーディング変更画面を開き、対応形式の「見る」（指定形式で表示）と「保存してみる」（変換保存）に対応
- 追加(ライセンス): CodeMirror 6 bundleをFE統合ツール用JSON（`local_dependencies`）/`complete.py`管理に統合し、ライセンス表記・NOTICE/manifestへ反映（別管理記述を廃止）
- 変更(通知): 下部通知と右下進捗通知を右下通知に統合。処理状態表示（アップロード中/処理中件数等）・通知の表示/非表示トグル・終了/閉じた通知の履歴表示・履歴削除（メモリ解放）に対応
- 追加(データ移行): ローカル設定のスキーマ版管理と正規化移行、破損/不明データの初期化を追加（V6方針に準拠）
- 文書: vwc-rules 1.0.5（V6追補含む）に追従して `docs/rules/` を更新

## FE 2.1.0 (2026-11-10)
- 変更(エディタ): 独自textarea/ハイライト/HTML補完実装を **CodeMirror 6** に置換（`public/vendor/codemirror/cm6.bundle.js`, `js/editor.js` をEditorCore化）。補完はON/OFF設定（`htmlComplete` 旧値 `tab/auto→on` 移行）、標準CM6言語/拡張を同梱し `EditorCore.langs/EXT` で追加可能。ファイル内検索・プロジェクト検索ジャンプ・タッチ補助キー・タブ再利用(undo/選択保持)・テーマ/wrap/行番号/tab幅反映に対応。
- 追加(エンコーディング): テキスト読込/表示/保存で差分表示と同等のエンコーディングに対応（UTF-8, UTF-8 BOM, UTF-16 LE/BE［BOM有無］, Shift-JIS, EUC-JP, ANSI）。ステータスバー種別を `形式(エンコーディング)` 表示（例: `HTML(UTF-8 BOM)`）。BEが返す `encoding/charset` を保持し保存時に送信。
- 追加(ヘルプ): `help/18-errors.md` 追加、`99-writing.md` を特殊MD記法（標準Markdown+VWC拡張: 色/bg/size/icon/コールアウト/タスク/コード・Mermaid・メディア等）へ改訂、`01-start/10-trouble/12-preview/13-usage/14-admin/15-shortcuts/_index` を現行挙動に更新。`help/bundle.js` 再生成。
- 修正(ログイン/信頼端末): MS面影を除去し部活アカウント(IdP)をハイライト色のログインボタン1つに統一。ログイン/初回区別を廃止し通常ログイン後は信頼端末未登録なら登録レーンへ、登録済み(`me.trusted`)はSKIP。`login_providers`/既存認証契約は維持。
- 修正(IdP連携UI): `login_providers` にIdPがあればBE応答前からユーザー管理をIdP連携状態として扱い、同期/「IdPから同期」時に右下へ「IdPと連携中」タスク表示。BE `managedByIdp` 明示値を優先して最終確定。
- 修正(ファイル/状態): ツール保存後に `refreshStatus()` を呼び追跡状態を即時反映。`history/status` 反映時にツリー名色/バッジを即時再描画（スクロール保持）。rename後に `refreshStatus()` 実行、`renamed` 状態表示に対応。
- 修正(UI): プロジェクト未オープン時の案内表示（SM02/04/05/11、ツール操作、左下ステータス）、起動/エラー/読み込み中画面のテーマ対応・ボタンなし・フェード遷移。新規プロジェクト作成後に上部 `.sync` アニメーションが残る問題を修正。
- 修正(履歴): 履歴画面の巨大サイズファイル表示を削除し、件数とコミットボタンの間に変更ファイル一覧（追加/変更/削除、3件分+スクロール）を追加。
- 修正(容量): 保存/作成/削除/移動/rename/アップロード/ツール保存/コミット・復元・履歴削除/アプリ操作後に使用量・プロジェクト容量表示を再取得して反映（デバウンス付き）。
- 修正(エディタ確認): 大容量テキスト(TEXTX, 5MB以上)の表示前確認、解読不能/文字化け疑いの非メディア警告を表示（既存判定と整合）。
- 修正(ツール): 動画から音声/音声カットの「原音忠実」時、wav/flac選択で誤警告が出る条件を修正（非可逆形式の不整合時のみ警告）。
- 修正(公開): 公開成功URL表示を青リンクからテーマ文字色に変更し、URLコピー/URLを開くボタンを追加。`files/raw`・`files/zip` の能力広告整合により「ファイル配信・ZIP取得」誤警告が出ない構成へ（BE側routes反映が必要）。
- その他: `Api.admin.idpMembersSync` 追加、`me.project`互換フィールド等の契約写し/補助修正、`build-manifest.json` 更新。
- 備考: 実機ブラウザ・IdP/WebAuthn・実サーバー配備/E2E確認は未実施項目あり。`public/vendor/codemirror/cm6.bundle.js` は `tools/dependencies.json`（`local_dependencies`）/`tools/complete.py` で管理する同梱（FE内統合ツールで読込・ライセンス表記に反映）。

## FE 2.0.4 (2026-11-09)
- 修正: 管理画面（SM07）の「認証システム（IdP）の管理を開く」リンク（`<a class="row">`）が周囲のメニュー項目より青いリンク表示で浮いて見える問題を修正。`public/css/layout.css` の `.row` に `color: inherit; text-decoration: none;` を追加し、周囲の `.row` と同じ見た目に統一。
- 追加(FIX#4): 管理「ユーザー管理」画面に「IdP管理画面を開く」ボタンを設置。URLは `EDITOR_CONFIG.idpAdminUrl`（任意）を優先し、未指定時は `idpBase`/既定 `../auth/` から `index.php?p=admin` を安全に組み立て（ハードコード回避）。IdP未設定時は無効+理由、URL組み立て不可時も無効+理由。左メニューのIdP管理リンクも同じ管理画面URLを参照するよう更新。

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
