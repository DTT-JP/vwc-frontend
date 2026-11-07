# CHANGELOG (vwc-frontend)

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
