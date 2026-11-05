# 04 API定義（v3.2。**FE と BE の契約**。正は BE リポジトリの `docs/`。FE は写しを `docs/api-contract/` に置く）
共通: `POST system/api/index.php?r=<名前>`、JSON応答（`GET` は `files/raw`, `files/zip` のみ）。認証済みAPIは `X-CSRF-Token` 必須。ただし `me` はログイン直後のCSRFトークン取得にも使うためトークン不要。すべてのPOSTで `Origin` が同一、または `Sec-Fetch-Site: same-origin`。エラーは `{"error":"コード"}`。
別入口: `system/api/gate.php`（アプリの配信ゲート。302 とプレーンテキストだけ。07）、`system/api/preview.php`（プレビュー配信。05）、`system/auth/microsoft.php`（OAuth。02）。
| r | 認可 | 主な入力 | 応答・備考 |
|---|---|---|---|
| meta/version | 不要 | — | api_version（整数）, server_version, features[] |
| auth/start | 不要 | kind | id, poll_secret, code(6桁)（QRのURLは FE が組み立てる） |
| auth/poll | 不要 | id, poll_secret | status |
| auth/approve | 信頼端末 | code | ok。失敗は残り回数、ロックは429 |
| auth/logout | ログイン | untrust? | ok（untrust=true でこの端末の信頼も解除） |
| auth/devices, device_revoke | ログイン | id | 自分の信頼端末 |
| me | ログイン | — | member(position, isAdmin, reauthUntil), csrf, 画面が使う設定値（quota_mb, max_upload_mb, max_publish_mb, max_projects_per_member, track_limit_mb, code_ttl_sec, device_days, zip_max_mb など。`limits` に全制限値） |
| usage/me | ログイン | — | 4区分の合計と全件（プロジェクト・アプリ・履歴・その他） |
| notices/list | ログイン | — | 「忘れていませんか？」（放置アプリ・容量80%超・端末期限7日前・孤立アプリ［管理者のみ］）。サーバーが生成 |
| announcements/list | ログイン | — | 表示期間内・対象に合うお知らせ |
| projects/list | ログイン | — | 自分の+共有されたもの（perm, canPublish, owner, order, parent） |
| projects/create | ログイン | name?, from_project?, from_commit? | project。from_* があれば分岐（フォーク）。name 省略時は日付名（重複時は連番） |
| projects/rename | 所有者 | id, name | ok |
| projects/delete | 所有者 | id, delete_apps? | アプリがあるとき delete_apps=true が必要（なければ `has_apps` 409） |
| projects/reorder | 所有者/共有先 | list, ids | 並び順（自分の一覧内のみ） |
| projects/transfer | 所有者 | id, to | 所有者の移動（05） |
| share/list, set, remove | 所有者 | project, member, mode, can_publish | ok |
| files/tree | 閲覧以上 | project | ツリー |
| files/read | 閲覧以上 | project, path | content, version |
| files/write | 編集以上 | project, path, content, base_version | 競合は409、占有は423 |
| files/create, mkdir, rename, delete | 編集以上 | project, path, to | ok（移動は rename） |
| files/upload_init, upload_chunk, upload_done | 編集以上 | upload_id, index, データ | ok |
| files/raw (GET) | 閲覧以上 | project, path | `Content-Type` 固定で配信 |
| files/preview_token | 閲覧以上 | project, path | `preview.php` 用URL（15分） |
| files/zip_prepare | 閲覧以上 | project, path? | 合計サイズ、短期トークン。`too_large` |
| files/zip (GET) | トークン | token | 無圧縮ZIPをストリーム配信 |
| files/search | 閲覧以上 | project, query, case, regex | 内容検索（最大200件） |
| history/status | 閲覧以上 | project | パスごとの状態（new / modified / deleted / unchanged）と件数（追加・変更・削除）。ファイルのハッシュは前回の値をキャッシュして再利用するため、ファイルが多くても速い |
| history/commit | 編集以上 | project, message | 変更なしは `invalid` |
| history/log | 閲覧以上 | project | 新しい順、親・分岐点・関連（分岐/公開） |
| history/diff | 閲覧以上 | project, hash, path（省略可） | `path` なし＝変更の一覧だけ（`added` `modified` `deleted` `renamed` と、ファイルごとの `files[{path,status,kind,before,after,from?}]`。内容は読まない）。`path` あり＝そのファイルの差分を `diffs[path]` に返す（テキストは `type: modified/added/deleted`・`diff`（`eq` `del` `add` と、変更のない行をまとめた `skip`）・`add` `del` 行数・`encoding`。バイナリは `bin`、追跡上限超は `large`、巨大テキストは `toolarge`。名前の変更のみは `renamed`）。計算結果はサーバーが覚えておく |
| history/restore | 編集以上 | project, hash | 復元前と復元後にコミットを作る（06） |
| history/delete | 所有者 | project, before_hash | 選んだコミットより古い履歴を削除（06） |
| apps/check_name | ログイン | name | 使用可否と理由（形式・予約語・重複） |
| apps/list | ログイン | scope? | 自分が管理できるアプリ（管理者は scope=all） |
| apps/publish | 公開権限者・管理者 | name, project, commit, visibility | 公開。結果に除外ファイル一覧とコード |
| apps/update | 同上 | name, commit | 同じプロジェクト（またはそのフォーク先）の任意のコミットへ。新しければ「更新」、古ければ「ロールバック」 |
| apps/set_visibility | 同上 | name, visibility | `public`/`unlisted`/`private` |
| apps/code_get, code_regen | 同上 | name | アクセスコード表示・再生成（限定公開） |
| apps/viewers_list, add, remove | 同上 | name, member | 非公開の閲覧権 |
| apps/open | 閲覧可能な人 | name | ゲートトークン発行 |
| apps/gate_verify | 不要 | name, code | 限定公開のコードを検証し、アクセストークンの Cookie を発行。誤りは `bad_code`（残り回数）、ロックは `rate`（解除までの秒数） |
| apps/unpublish | 同上 | name | 削除 |
| admin/members_list, add, update, import_csv | 管理者+再認証 | add: id? (省略時は自動採番), name, mail, position, is_admin; update: member または id/member_id と変更項目 | 役職・管理者権限・メール・名前・有効/無効の編集。CSV列は `部員ID,名前,メール,役職,管理者権限` |
| admin/members_delete | 管理者+再認証 | member, projects[{id, action(keep/transfer/delete), to?}], apps[{name, action(keep/private/unlisted/delete)}] | 既定は keep |
| admin/devices_list, revoke | 管理者+再認証 | member | |
| admin/settings_get, set | 管理者+再認証 | key, value | 範囲検証 |
| admin/usage | 管理者 | member? | 全部員、部員別の内訳（4区分） |
| admin/projects_list | 管理者 | member? | 全プロジェクト（孤立を含む） |
| admin/projects_assign | 管理者+再認証 | project, to | 孤立プロジェクトを部員へ割り当て |
| admin/apps_list | 管理者 | filter? | 全アプリ（孤立を含む） |
| admin/announcements_list, save, delete | 管理者+再認証 | | お知らせ管理 |
| admin/gc, audit_list | 管理者 | audit_list: member?, op?, ip? | GCは見積もりと実行、監査ログ |
## 共通エラーコード
`unauthorized`(401), `forbidden`(403), `not_found`(404), `conflict`(409), `locked`(423), `too_large`(413), `quota`(413), `limit`(409), `has_apps`(409), `rate`(429), `bad_path`, `bad_name`, `invalid`, `csrf`, `origin`。
## 監査ログ
`audit_log` に、ログイン・承認・公開・更新・状態変更・コード再生成・共有・所有者移動・管理操作・コミット・復元・履歴削除・削除を記録（IPつき）。**ファイルの保存は、共有されているプロジェクト（共有先が1人以上いる）のものだけ**記録する。書き込みのたびに、`audit_retention_days` より古い行があれば削除する。
## 契約のルール（FE と BE を別リポジトリで保つため）
- **バージョン**: `meta/version` の `api_version`（整数）。互換を壊す変更のときだけ上げる。項目の追加・新しいエラーコードの追加は互換とみなす。FE は `config.js` の `requiredApi` と比べ、合わなければ全画面で「サーバーとエディターの版が合いません」を出す。
- FE は知らない項目を無視する。BE は知らない入力を無視せず、`invalid` で拒否する。
- 契約を変えるときは、BE の `docs/04` を直し、FE の写しを更新する。写しの先頭に、元の版（BE のコミットID）を書く。
- 共有するのは文書だけ。コード・型定義・定数の生成物は共有しない（19 の B1・B7）。
- 同一オリジン（19 の B11）。CORS は使わない。
## URL契約（BE が FE の入口へ戻すときの形。基準は `base_url`）
| URL | 意味 | 発行元 |
|---|---|---|
| `…/editor/?approve=<6桁>` | 承認画面（S02）を開く。QRの中身 | FE |
| `…/editor/?auth=done&mode=register\|direct` | Microsoft ログインの成功。FE は `me` を呼ぶ | BE（`microsoft.php`） |
| `…/editor/?auth=error&reason=<コード>` | 同・失敗（`forbidden` `expired` `state` など） | BE（`microsoft.php`） |
| `…/editor/?gate=<名前>&need=code&return=<パス>` | 限定公開のコード入力（S19） | BE（`gate.php`） |
| `…/editor/?gate=<名前>&need=login&return=<パス>` | 非公開でログインが必要（S19） | BE（`gate.php`） |
| `…/editor/?gate=<名前>&need=denied` | 非公開で権限なし（S19） | BE（`gate.php`） |
`return` は `/editor/app/<名前>/…` で始まる同一サイトのパスだけ（BE が生成時に検証し、FE も遷移前に検証する。オープンリダイレクトの防止）。
## 契約テストの例（両側が同じ例でテストする）
`meta/version` → `{"api_version":1,"server_version":"1.0.0","features":["zip","announcements"]}`。`apps/gate_verify`（誤り）→ `{"error":"bad_code","remaining":3}`、（ロック）→ 429 `{"error":"rate","retry_after":540}`。
