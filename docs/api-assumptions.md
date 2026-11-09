# FE の API 仮定（契約に明記されていない項目 / v2 実態メモ）
BE 2.0 / FE 2.0（IdP専用）時点の実装メモ。**契約の正は BE `docs/04_API.md`（FE 写し: `docs/api-contract/04_API.md`）と `routes.php`**。本書は FE 側の補足・未明文化の仮定のみを記す。BE は未知の入力キーを `invalid` で拒否するため、キー名は契約/実装の正に合わせること。

- `members/search` は BE 1.2+ で提供され、v2 応答は `{"members":[{"id","name"}]}`（BE 実装）。無い環境（旧 BE）では、FE が既知の部員（`DATA.members`）から絞り込む（`Api.searchMembers`）。
- 信頼端末の確定（S03）は、選択時に `auth/trust` へ `label` を送る。一時ログインでは端末登録APIを呼ばない。
- 管理の再認証は専用エンドポイントが無いので、認証システム（IdP）の再認証（ポップアップ、`idp.php?mode=reauth`）後に `me` を呼び、`reauthUntil` の更新を待つ（FE 2.0+）。
- ファイルのコピーは `files/read` + `files/create`/`files/write`（テキスト）または `files/raw` + `files/upload_*`（バイナリ）で合成する。
- 部員追加は `admin/members_add` に `id?`（省略時自動採番）, `name`, `mail?`, `position` を送る（**管理者入力なし**。応答は `{"ok":true,"member_id":...}`。`mail` は任意/空可）。部員編集は `admin/members_update` に `member`, `name?`, `mail?`, `position?`, `active?` を送る。**`is_admin` / `isAdmin` / `member_id` / `email` 等の別名・管理者フラグ入力は 2.0 で廃止**（管理者は IdP が正。BE は未知入力キーを `invalid` で拒否）。
- お知らせ管理（`admin/announcements_save` 等）の入力項目名（表示期間の開始/終了キーを含む）は、BE 2.0 の正（`routes.php`・BE 実装/契約）に合わせる。`from`/`to` 固定の旧仮定は置かない（BE 側が `from`/`to` と `from_date`/`to_date` を許容する実装もあるため、契約/実装で確認）。
- `admin/admins_status` は BE 1.2+（v2 で利用）で、管理者2人要件の状態（`adminCount`/`executableAdminCount`/`hasMinimumAdmins`/`minimumRequired` 等、契約の応答形）を返す。
- `admin/members_list` 各部員には少なくとも `idp_linked` と表示用 `isAdmin` が含まれる（BE 04）。v2 実装では `named`/`adminDesignated` 等も返るため、FE は契約/実装の応答形に従って扱う。
- 監査ログの拒否（承認画面の「拒否」）は BE に拒否エンドポイントが無いため、FE 側では表示のみ行う。
- 部員削除のプロジェクト・アプリ操作は `admin/members_delete` の `projects` / `apps` 配列で送る。
- アプリ管理の閲覧者・コードは `apps/*` を使う。閲覧者の一覧に表示名が必要な場合は `DATA.members` から補う。
- `admin/apps_list` / `admin/projects_list` は引数なしで全件を取得し、絞り込みは FE 側で行う（BE 実装がフィルタ引数を受ける場合があっても、FE の現行挙動の前提）。
- `admin/announcements_list` は全期間を返すものと仮定する（要確認: 実装依存）。
- `admin/gc` は呼び出すと実行/見積もりを行い、`freed_mb` / `estimate_mb` 等を返すものと仮定する（要確認: 実装依存）。
- `admin/usage` の `member` 省略時は全体の 4 区分を返すものと仮定する（要確認: 実装依存）。
- `history/delete` の `before_hash` には、残したい先頭コミットのハッシュを送る。
