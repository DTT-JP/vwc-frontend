> 複製元: vwc-backend docs/04_API.md（コミット 20ac273）／複製日: 2026-11-07
> この文書は複製です。直接直さず、複製元を直してから更新してください。

# 04 API定義（v3.3。**FE と BE の契約**。正は BE リポジトリの `docs/04_API.md`。FE は写しを `docs/api-contract/04_API.md` に置く。規則は `docs/rules/04_API規則.md` が正）
共通: `POST system/api/index.php?r=<名前>`、JSON応答（`GET` は `files/raw`, `files/zip` のみ）。認証済みAPIは `X-CSRF-Token` 必須。ただし `me`・`meta/version` はトークン不要（`auth/start`・`auth/poll`・`apps/gate_verify` は未ログイン時のみ免除）。すべてのPOSTで `Origin` が同一、または `Sec-Fetch-Site: same-origin`。エラーは `{"error":"コード"}`。
別入口: `system/api/gate.php`（アプリの配信ゲート。302 とプレーンテキストだけ。07）、`system/api/preview.php`（プレビュー配信。05）、`system/auth/microsoft.php`（OAuth。02）。定義の正は `editor/system/api/routes.php`（rules/04）。

| r | 認可（rules/04 §5） | 主な入力 | 応答・備考 |
|---|---|---|---|
| meta/version | 不要 (none) | — | `api_version`(整数/BE MAJOR), `server_version`(=VERSION), `features`(1.x互換・2.0で削除), `login_providers`(例:`["microsoft"]`), `backend`(`version`,`build`,`build_full`,`apis`=routes由来)。認証不要・CSRF免除 |
| auth/start | 不要 (none) | kind | id, poll_secret, code(6桁)（QRのURLは FE が組み立てる） |
| auth/poll | 不要 (none) | id, poll_secret | status |
| auth/approve | 信頼端末 (trusted_device) | code | ok。失敗は残り回数、ロックは429 |
| auth/lookup | 信頼端末 (trusted_device) | code | 承認コードの確認（信頼端末） |
| auth/logout | ログイン (login) | untrust? | ok（untrust=true でこの端末の信頼も解除） |
| auth/devices, device_revoke | ログイン (login) | id | 自分の信頼端末 |
| auth/trust | ログイン (login) | label | この端末を信頼端末として登録し、端末Cookieを発行 |
| me | ログイン (login) | — | member(position, isAdmin, reauthUntil), csrf, 画面が使う設定値（quota_mb, max_upload_mb, max_publish_mb, max_projects_per_member, track_limit_mb, code_ttl_sec, device_days, zip_max_mb など。`limits` に全制限値） |
| usage/me | ログイン (login) | — | 4区分の合計と全件（プロジェクト・アプリ・履歴・その他） |
| notices/list | ログイン (login) | — | 「忘れていませんか？」（放置アプリ・容量80%超・端末期限7日前・孤立アプリ［管理者のみ］）。サーバーが生成 |
| announcements/list | ログイン (login) | — | 表示期間内・対象に合うお知らせ |
| projects/list | ログイン (login) | — | 自分の+共有されたもの（perm, canPublish, owner, order, parent） |
| projects/create | ログイン (login) | name?, from_project?, from_commit? | project。from_* があれば分岐（フォーク）。name 省略時は日付名（重複時は連番） |
| projects/rename | ログイン/所有者 (login, perm=owner) | id, name | ok |
| projects/delete | ログイン/所有者 (login, perm=owner) | id, delete_apps? | アプリがあるとき delete_apps=true が必要（なければ `has_apps` 409） |
| projects/reorder | ログイン (login) | list, ids | 並び順（自分の一覧内のみ） |
| projects/transfer | ログイン/所有者 (login, perm=owner) | id, to | 所有者の移動（05） |
| share/list, set, remove | ログイン/所有者 (login, perm=owner) | project, member, mode, can_publish | ok |
| files/tree | ログイン/閲覧以上 (login, perm=view) | project | ツリー |
| files/read | ログイン/閲覧以上 (login, perm=view) | project, path | content, version |
| files/write | ログイン/編集以上 (login, perm=edit) | project, path, content, base_version | 競合は409、占有は423 |
| files/create, mkdir, rename, delete | ログイン/編集以上 (login, perm=edit) | project, path, to | ok（移動は rename） |
| files/upload_init, upload_chunk, upload_done | ログイン/編集以上 (login, perm=edit) | upload_id, index, データ | ok |
| files/preview_token | ログイン/閲覧以上 (login, perm=view) | project, path | `preview.php` 用URL（15分） |
| files/zip_prepare | ログイン/閲覧以上 (login, perm=view) | project, path? | 合計サイズ、短期トークン。`too_large` |

**別扱い（`index.php` の GET 分岐。`routes.php` には載せない。指示書 B1/C1 整合）**: `files/raw`（GET, ログイン/閲覧以上, `project,path`）、`files/zip`（GET, トークン, `token`）。
| files/search | ログイン/閲覧以上 (login, perm=view) | project, query, case, regex | 内容検索（最大200件） |
| history/status | ログイン/閲覧以上 (login, perm=view) | project | パスごとの状態（new / modified / deleted / unchanged）と件数（追加・変更・削除）。ファイルのハッシュは前回の値をキャッシュして再利用するため、ファイルが多くても速い |
| history/commit | ログイン/編集以上 (login, perm=edit) | project, message | 変更なしは `invalid` |
| history/log | ログイン/閲覧以上 (login, perm=view) | project, cursor?, limit? | 新しい順、親・分岐点・関連（分岐/公開）。既定50件、最大100件。`cursor` は前ページ末尾ハッシュで古いページを取得 |
| history/diff | ログイン/閲覧以上 (login, perm=view) | project, hash, path（省略可） | `path` なし＝変更の一覧だけ（`added` `modified` `deleted` `renamed` と、ファイルごとの `files[{path,status,kind,before,after,from?}]`。内容は読まない）。`path` あり＝そのファイルの差分を `diffs[path]` に返す（テキストは `type: modified/added/deleted`・`diff`（`eq` `del` `add` と、変更のない行をまとめた `skip`）・`add` `del` 行数・`encoding`。バイナリは `bin`、追跡上限超は `large`、巨大テキストは `toolarge`。名前の変更のみは `renamed`）。計算結果はサーバーが覚えておく |
| history/restore | ログイン/編集以上 (login, perm=edit) | project, hash | 復元前と復元後にコミットを作る（06） |
| history/delete | ログイン/所有者 (login, perm=owner) | project, before_hash | 選んだコミットより古い履歴を削除（06） |
| apps/check_name | ログイン (login) | name | 使用可否と理由（形式・予約語・重複） |
| apps/list | ログイン (login) | scope? | 自分が管理できるアプリ（管理者は scope=all） |
| apps/publish | ログイン (login, 公開権限者) | name, project, commit, visibility | 公開。結果に除外ファイル一覧とコード |
| apps/update | ログイン (login, 公開権限者) | name, commit | 同じプロジェクト（またはそのフォーク先）の任意のコミットへ。新しければ「更新」、古ければ「ロールバック」 |
| apps/set_visibility | ログイン (login, 公開権限者) | name, visibility | `public`/`unlisted`/`private` |
| apps/code_get, code_regen | ログイン (login, 公開権限者) | name | アクセスコード表示・再生成（限定公開） |
| apps/viewers_list, add, remove | ログイン (login, 公開権限者) | name, member | 非公開の閲覧権 |
| apps/open | ログイン (login, 閲覧可能な人) | name | ゲートトークン発行 |
| apps/gate_verify | 不要 (none) | name, code | 限定公開のコードを検証し、アクセストークンの Cookie を発行。誤りは `bad_code`（残り回数）、ロックは `rate`（解除までの秒数） |
| apps/unpublish | ログイン (login, 公開権限者) | name | 削除 |
| admin/members_list, add, update, import_csv | 管理者+再認証 (admin_reauth) | add: id? (省略時は自動採番), name, mail, position, is_admin; update: member または id/member_id と変更項目。※`member_id`/`email`/`isAdmin` は `admin/members_add,update` の別名、`member_id` は `admin/members_delete` の別名（2.0で削除） | 役職・管理者権限・メール・名前・有効/無効の編集。CSV列は `部員ID,名前,メール,役職,管理者権限` |
| admin/members_delete | 管理者+再認証 (admin_reauth) | member, projects[{id, action(keep/transfer/delete), to?}], apps[{name, action(keep/private/unlisted/delete)}] | 既定は keep |
| admin/devices_list | 管理者+再認証 (admin_reauth) | member? | 端末一覧 |
| admin/devices_revoke | 管理者+再認証 (admin_reauth) | id | 端末の失効（正規名） |
| admin/device_revoke | 管理者+再認証 (admin_reauth) | id | **非推奨の別名**（`admin/devices_revoke` と同じ。BE 1.1 から非推奨、2.0 で削除） |
| admin/settings_get, set | 管理者+再認証 (admin_reauth) | set: key, value（get は入力なし） | get は全設定値、set は範囲検証 |
| admin/usage | 管理者+再認証 (admin_reauth) | member? | 全部員、部員別の内訳（4区分）。再認証必須（実装に合わせる） |
| admin/projects_list | 管理者+再認証 (admin_reauth) | member? | 全プロジェクト（孤立を含む）。再認証必須 |
| admin/projects_assign | 管理者+再認証 (admin_reauth) | project, to | 孤立プロジェクトを部員へ割り当て |
| admin/apps_list | 管理者+再認証 (admin_reauth) | filter? | 全アプリ（孤立を含む）。再認証必須 |
| admin/announcements_list, save, delete | 管理者+再認証 (admin_reauth) | | お知らせ管理 |
| admin/gc | 管理者+再認証 (admin_reauth) | execute? | 見積もりと実行。再認証必須（実行時は再認証を再確認） |
| admin/audit_list | 管理者+再認証 (admin_reauth) | member?, op?, ip? | 監査ログ。再認証必須 |
| members/search | ログイン (login) | query | 部員検索 |

## 共通エラーコード
コードは `{"error":"<コード>"}`（小文字+`_`）。意味を変える・消すのは MAJOR（rules/04 A19/A20）。HTTP ステータスは主なもの。

| コード | HTTP | 意味 |
|---|---|---|
| `bad_code` | 400/401 | 承認・ゲート等のコードが不正/不一致（残り回数等は応答に含む場合あり） |
| `bad_name` | 400 | 名前が不正 |
| `bad_path` | 400 | パスが不正 |
| `configuration` | 500 | 設定エラー（必須設定の欠落・不正） |
| `conflict` | 409 | 競合（版・状態） |
| `csrf` | 403 | CSRF トークン不正 |
| `expired` | 400/410 | 期限切れ（要求・トークン等） |
| `forbidden` | 403 | 権限なし |
| `has_apps` | 409 | アプリが存在するため操作不可（削除時など） |
| `internal` | 500 | 内部エラー |
| `invalid` | 400 | 入力不正・未知の入力キー（未知キーは拒否）・許可されない操作 |
| `limit` | 409 | 制限超過（件数など） |
| `locked` | 423 | 占有・ロック中 |
| `method_not_allowed` | 405 | メソッド不許可 |
| `not_admin` | 403 | 管理者権限なし |
| `not_found` | 404 | 対象なし |
| `origin` | 403 | Origin/Sec-Fetch-Site 不正 |
| `quota` | 413 | 容量超過 |
| `rate` | 429 | 試行回数超過・ロック（解除までの秒数等） |
| `reauth_required` | 403 | 再認証が必要（10分以内の再認証なし） |
| `too_large` | 413 | サイズ超過 |
| `unauthorized` | 401 | 未ログイン・認証が必要 |
| `untrusted` | 403 | 信頼端末が必要 |

## 監査ログ
`audit_log` に、ログイン・承認・公開・更新・状態変更・コード再生成・共有・所有者移動・管理操作・コミット・復元・履歴削除・削除を記録（IPつき）。**ファイルの保存は、共有されているプロジェクト（共有先が1人以上いる）のものだけ**記録する。書き込みのたびに、`audit_retention_days` より古い行があれば削除する。

## 契約のルール
契約の変更・命名・認可語彙・入力/出力・エラー・非推奨・機械チェックの規則は **`docs/rules/04_API規則.md` が正**（本書は契約の表とエラーコード表を保持する。B4-7）。

## URL契約（遷移・認証入口）
URL契約の正は **`docs/rules/04_API規則.md` §11**。本書では BE が発行する `?auth=error` の形を明記する。

| URL | 意味 | 発行元 |
|---|---|---|
| `…/editor/?approve=<6桁>` | 承認画面（S02）を開く。QRの中身 | FE |
| `…/editor/system/auth/microsoft.php?mode=…` | Microsoft ログイン開始（BE 1.x） | FE |
| `…/editor/?auth=done&mode=register\|direct\|reauth` | ログイン成功。FE は `me` を呼ぶ | BE（`microsoft.php` / 将来 `idp.php`） |
| `…/editor/?auth=error&reason=<分類>&detail=<詳細>&code=<E-A..>` | ログイン失敗。`detail` は省略されることがある。`reason` は分類、`code` は FE の表示用（例: `E-A01`〜`E-A15`、`E-A99`。IdP由来は `E-A20`〜`E-A24` を BE 1.2+ で追加） | BE（現行は `auth/microsoft.php` の `authFail()` が `reason`・`detail`・`code` を付与） |
| `…/editor/?gate=<名前>&need=code&return=<パス>` | 限定公開のコード入力（S19） | BE（`gate.php`） |
| `…/editor/?gate=<名前>&need=login&return=<パス>` | 非公開でログインが必要（S19） | BE（`gate.php`） |
| `…/editor/?gate=<名前>&need=denied` | 非公開で権限なし（S19） | BE（`gate.php`） |

`return` は `/editor/app/<名前>/…` で始まる同一サイトのパスだけ（生成側・遷移側で検証）。

## 契約テストの例
`meta/version` → `api_version`(整数), `server_version`(=VERSION), `features`, `login_providers`, `backend`(`version`,`build`,`build_full`,`apis`) を含む（rules/04 §9）。`api_version` と `backend.version` の MAJOR が一致。`apps/gate_verify`（誤り）→ `{"error":"bad_code","remaining":3}`、（ロック）→ 429 `{"error":"rate","retry_after":540}`。未知の入力キー → 400 `{"error":"invalid"}`。
