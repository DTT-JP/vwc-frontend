# FE の API 仮定（契約に明記されていない項目）

- `members/search` が無い環境では、FE が既知の部員（`DATA.members`）から絞り込む（`Api.searchMembers`）。
- 信頼端末の確定（S03）は、選択時に `auth/trust` へ `label` を送る。一時ログインでは端末登録APIを呼ばない。
- 管理の再認証は専用エンドポイントが無いので、Microsoft の直接ログイン（ポップアップ）後に `me` を呼び、`reauthUntil` の更新を待つ。
- ファイルのコピーは `files/read` + `files/create`/`files/write`（テキスト）または `files/raw` + `files/upload_*`（バイナリ）で合成する。
- 部員追加・編集は `admin/members_add` / `admin/members_update` に `name, mail, position, is_admin, active` を送る。
- お知らせ管理の日付項目は `from` / `to` で送る。
- 監査ログの拒否（承認画面の「拒否」）は BE に拒否エンドポイントが無いため、FE 側では表示のみ行う。
- 部員削除のプロジェクト・アプリ操作は `admin/members_delete` の `projects` / `apps` 配列で送る。
- アプリ管理の閲覧者・コードは `apps/*` を使う。閲覧者の一覧に表示名が必要な場合は `DATA.members` から補う。
- `admin/apps_list` / `admin/projects_list` は引数なしで全件を取得し、絞り込みは FE 側で行う。
- `admin/announcements_list` は全期間を返すものと仮定する。
- `admin/gc` は呼び出すと実行し、`freed_mb` / `estimate_mb` を返すものと仮定する。
- `admin/usage` の `member` 省略時は全体の 4 区分を返すものと仮定する。
- `history/delete` の `before_hash` には、残したい先頭コミットのハッシュを送る。
