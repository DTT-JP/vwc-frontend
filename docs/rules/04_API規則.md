> 複製元: vwc-rules rules-v1.0.2（コミット 73965f2）／複製日: 2026-11-07
> この文書は複製です。直接直さず、複製元を直してから更新してください。

# 04 API 規則

規則 ID: `A1`〜。正は `vwc-rules`。API の**表**（個々の API の一覧）は、提供する側のリポジトリが持つ（BE: `docs/04_API.md`、IdP: `docs/contract/IdP契約.md`）。本書は、その**書き方・守り方・変え方**を定める。

## 1. 位置づけ

- 目的: API の追加・変更・削除で、BE・FE・IdP・文書・テストの食い違いが起きないようにする。API を、1か所の定義から管理できるようにする。
- 現状の食い違い（2026-11-06 の files.zip）は `plans/2026-11_修正計画.md` §2 に一覧がある。本書は、それが再発しないための規則。
- 用語: **契約** = 提供側が持つ API の一覧と仕様。**規則** = 本書。**レジストリ** = 提供側のコードにある、API の定義表（3 章）。

## 2. API の種類と所有

| 区分 | 形 | 提供側 | 契約 |
|---|---|---|---|
| FE ↔ BE | `POST system/api/index.php?r=<名前>`（JSON）。`GET` は `files/raw`・`files/zip` だけ。別入口: `gate.php`・`preview.php`・`system/auth/idp.php` | BE | BE `docs/04_API.md`（FE は写しを `docs/api-contract/` に置く） |
| BE ↔ IdP | OIDC の認可コード＋PKCE（`authorize.php`・`token.php`・`jwks.php`）、`state.php`、`logout.php`、`version.php` | IdP | IdP `docs/contract/IdP契約.md`（BE は写しを `docs/idp-contract/` に置く） |
| FE ↔ IdP | なし（B15）。BE の入口への遷移だけ | — | 11 章の URL 契約 |

| # | ルール |
|---|---|
| A1 | 契約の正は**提供側のリポジトリ**。使う側は**写し**を持ち、先頭に元の版を書く（10 章）。写しを直接直さない |
| A2 | 文書だけを共有する。型・定数・コードを生成して共有しない（B1・B7） |
| A3 | 同一オリジンのみ。CORS は使わない（B11） |

## 3. レジストリ（API の定義表）

提供側は、API の定義を**1つのファイル**にまとめる。これを、API の機械が読める唯一の正とする。

| 提供側 | 場所 | 対象 |
|---|---|---|
| BE | `editor/system/api/routes.php`（配列を返す） | `index.php?r=<名前>` のすべて（`gate`・`preview` は別入口なので項目を持たない） |
| IdP | `auth/system/lib/Routes.php`（配列を返す） | 公開するすべての入口（プロトコルの入口と画面の入口を区別する） |

**項目**（BE。IdP は `body` を入力項目に読み替える）

| 項目 | 内容 |
|---|---|
| キー | API の名前（例: `files/write`） |
| `since` | 導入した版（`"1.0"` の形。MAJOR.MINOR） |
| `methods` | `['POST']`、または `['GET']`（`files/raw`・`files/zip` のみ） |
| `auth` | 5 章の語彙 |
| `csrf` | `when_logged_in`（ログイン中なら検証。既定）／`exempt`（常に免除）／`exempt_if_anonymous`（未ログインのときだけ免除） |
| `body` | 受け付ける入力キー（正式な名前だけ） |
| `body_deprecated` | まだ受け付けるが、非推奨の別名のキー |
| `params_since` | 導入が API 自体より新しい入力キーの、`キー => 導入した版` |
| `perm` | 資源への権限（文書用: `none` `view` `edit` `owner` `publish`）。判定の実装は別 |
| `summary` | 1行の説明（日本語） |
| `deprecated` | `null`、または `['since'=>'1.2','remove_in'=>'2.0','replaced_by'=>'…']` |

**例**

```php
'files/write' => [
    'since' => '1.0', 'methods' => ['POST'], 'auth' => 'login', 'csrf' => 'when_logged_in',
    'body' => ['project','path','content','base_version'], 'body_deprecated' => [], 'params_since' => [],
    'perm' => 'edit', 'summary' => 'ファイルを保存する', 'deprecated' => null,
],
'admin/device_revoke' => [          // 別名。admin/devices_revoke が正
    'since' => '1.0', 'methods' => ['POST'], 'auth' => 'admin_reauth', 'csrf' => 'when_logged_in',
    'body' => ['id'], 'body_deprecated' => [], 'params_since' => [],
    'perm' => 'none', 'summary' => '（別名）端末の失効',
    'deprecated' => ['since' => '1.1', 'remove_in' => '2.0', 'replaced_by' => 'admin/devices_revoke'],
],
```

| # | ルール |
|---|---|
| A4 | API は、レジストリに載せてから実装する。レジストリにない API を、コードに追加しない |
| A5 | 入力キーの許可リスト（現行の `$allowedBodyKeys`）と、CSRF の免除（現行の `$csrfExempt`）は、レジストリから作る。コードに別に書かない |
| A6 | `meta/version` の `apis` は、レジストリから**自動生成**する。手書きしない（`03` §5） |
| A7 | 認可の呼び出し（`requireLogin` など）の置き場は、まず現状のまま（各 `case` の中）にして、レジストリの `auth` と**一致することをテストで確認**する。レジストリから認可を実行する形への移行は、認可の一致テストが通ってから、別のリリースで行う |

## 4. 命名

| # | ルール |
|---|---|
| A8 | API 名は `<領域>/<動作>`、すべて小文字と `_`。領域は `meta` `auth` `me` `usage` `notices` `announcements` `projects` `share` `files` `history` `apps` `admin` `members`。新しい領域を足すときは、本書を更新する |
| A9 | 動作は、`list` `get` `create` `update` `delete` `set` `add` `remove` など、既存の語を優先する |
| A10 | 入力キーは `snake_case`。**同じ意味の別名のキーを作らない**（現行の `mail`／`email`、`is_admin`／`isAdmin`、`id`／`member`／`member_id` は別名。非推奨にして、次の MAJOR で消す） |
| A11 | 応答のキーは、既存の `camelCase`（`isAdmin`、`reauthUntil`）を、互換のために維持する。新しいキーは `snake_case` |
| A12 | 同じ API を2つの名前で提供しない。名前を変えるときは、新しい名前を足し、旧名を非推奨にする（8 章） |

## 5. 認可の語彙

レジストリの `auth` と、`docs/04_API.md` の「認可」列は、次の語彙で対応させる。

| `auth` | 意味 | 04 の「認可」列の表記 |
|---|---|---|
| `none` | ログイン不要 | 不要 |
| `login` | ログイン済み | ログイン（資源の権限は `perm` に従って 閲覧以上／編集以上／所有者 など） |
| `trusted_device` | ログイン済み＋信頼端末 | 信頼端末 |
| `token` | 短期トークン | トークン |
| `admin` | 管理者（再認証なし） | 管理者 |
| `admin_reauth` | 管理者＋10分以内の再認証 | 管理者+再認証 |

- 管理者の判定の正本は IdP（B16）。BE の `admin` 系は、IdP の値の写し（`members.role`）で判定する。
- 04 の表に書く認可は、実際のコード・レジストリと**一致させる**。一致しているかは、契約テスト（12 章）が確認する。
- 公開アプリの権限など、資源ごとの判定は `perm` と文書に書く（この語彙の対象外）。

## 6. 入力と出力

| # | ルール |
|---|---|
| A13 | **BE は、知らない入力キーを無視せず `invalid` で拒否する。** この性質を、変えない（現行 `04_API.md` の契約のルール） |
| A14 | **FE は、知らない応答の項目を無視する。** 応答に項目を足すのは、互換のある変更（MINOR） |
| A15 | 新しい入力キーは、**任意**にする。省略したときは従来の動作にする（原文 §4-6） |
| A16 | 新しい入力キーを足したら、`params_since` に導入版を書く。FE は、BE が知っているキー（`since` または `params_since` が BE の版以下）だけを送る。BE が知らないキーを送ると `invalid` になるため（V-R5） |
| A17 | 値（上限など）は API が返す。FE に定数としてコピーしない（B7） |
| A18 | 「同名で意味や形を変える」ことをしない。新しい名前の API として足す（原文 §4-2） |

## 7. エラー

| # | ルール |
|---|---|
| A19 | エラー応答は `{"error":"<コード>"}`。コードは小文字と `_`。コードを**足す**のは互換のある変更。意味を変える・消すのは MAJOR |
| A20 | BE のコード上のエラーコードは、すべて `docs/04_API.md` の「共通エラーコード」に載せる。載っていないコードがないことを、契約テスト（12 章）で確認する |
| A21 | 画面の表示用コード（`E-A..` `E-P..` など）は FE が持つ。BE が返すのは、`?auth=error` に付ける `code`（11 章）だけ |
| A22 | HTTP ステータスは、エラーコードの表（04）に書く。新しいコードには、ステータスも書く |

## 8. 版・非推奨・削除（原文 §4 の API への適用）

1. 追加は自由（MINOR）。新しい API または任意の入力キーで行う。
2. 互換を壊す変更は、同名を書き換えず、新しい名前の API として足す（MINOR）。旧 API はそのまま残す。
3. 旧 API は、レジストリの `deprecated` に `since`・`remove_in`・`replaced_by` を書く。`meta/version` の `apis` に出て、契約文書に印が付く。
4. 旧 API・別名のキーの削除は、**次の MAJOR で、まとめて**行う。それまで削除しない。
5. 非推奨の API を FE が使うと、開発者向けにコンソールへ警告を出す（原文 §7-4）。
6. 削除予定の `remove_in` は、実際に削除するまで書き換えない。延期するときは、`CHANGELOG.md` に理由を書く。

## 9. `meta/version`（BE）と `version.php`（IdP）の正式な形

**BE: `POST system/api/index.php?r=meta/version`**（入力なし。認証不要。CSRF 免除）

```json
{
  "api_version": 1,
  "server_version": "1.1.0",
  "features": ["zip", "announcements"],
  "login_providers": ["idp", "microsoft"],
  "backend": {
    "version": "1.1.0",
    "build": "3a8b123",
    "build_full": "3a8b123…（64文字）",
    "apis": {
      "files/write": { "since": "1.0" },
      "admin/device_revoke": { "since": "1.0", "deprecated": true, "remove_in": "2.0", "replaced_by": "admin/devices_revoke" },
      "files/read": { "since": "1.0", "params": { "例のキー": "1.2" } }
    }
  }
}
```

- `api_version` = BE の MAJOR（整数）。`server_version` = `VERSION` と同じ値。`features` は BE 1.x の間だけ残す（非推奨。2.0.0 で削除）。
- `login_providers`: ログイン画面が出す方式の一覧（`idp` `microsoft`）。ログイン前に FE が読む。BE 2.0.0 では `["idp"]`（キーも残してよい）。
- `backend.apis`: レジストリから自動生成（A6）。`params` は `params_since` から。
- 内部パスや設定値は返さない。

**IdP: `GET /auth/version.php`**（認証不要）の形は IdP 契約に書く。

## 10. 契約文書

| # | ルール |
|---|---|
| A23 | 契約を変えるときは、提供側の契約文書を直し、使う側の写しを更新する。順は「契約 → 提供側の実装 → 使う側の写し → 使う側の実装」 |
| A24 | 写しの**先頭**に、次の複製ヘッダーを付ける。写しの本文は、元と一字も変えない |
| A25 | 契約の変更は、`CHANGELOG.md` にも書く。API の追加は MINOR、削除は MAJOR（`03` §10） |

**複製ヘッダー（契約・規則の写し共通）**

```text
> 複製元: <リポジトリ名> <タグ>（コミット <先頭7桁>）／複製日: <YYYY-MM-DD>
> この文書は複製です。直接直さず、複製元を直してから更新してください。
```

**契約テストの例（両側が同じ例でテストする）**

- `meta/version` → 9 章の形。`api_version` と `backend.version` の MAJOR が一致する。
- `apps/gate_verify`（誤り）→ `{"error":"bad_code","remaining":3}`。（ロック）→ 429 `{"error":"rate","retry_after":540}`。
- BE が知らない入力キーを付けた要求 → 400 `{"error":"invalid"}`（A13）。
- 適合テストベクタ（`03` §8）。

## 11. URL 契約（遷移のための URL）

基準は `base_url`（BE）と、IdP の `issuer`（`https://ドメイン/auth`）。`return` は `/editor/app/<名前>/…` で始まる同一サイトのパスだけ（生成側が検証し、使う側も遷移前に検証する。オープンリダイレクトの防止）。

| URL | 意味 | 発行元 |
|---|---|---|
| `…/editor/?approve=<6桁>` | 承認画面（S02）を開く。QR の中身 | FE |
| `…/editor/system/auth/idp.php?mode=direct\|register\|reauth` | ログインの開始。BE が IdP の `authorize.php` へ送る | FE が遷移、BE が受ける |
| `…/editor/system/auth/idp.php?mode=logout` | IdP 側のセッションを終える。BE が IdP の `logout.php` へ送る | FE が遷移、BE が受ける |
| `…/auth/authorize.php?…` | 認可の要求（認可コード＋PKCE） | BE（`idp.php`）が作る |
| `…/editor/system/auth/idp.php?code=…&state=…` | 認可コードの受け取り（`redirect_uri` に登録する） | IdP |
| `…/editor/?auth=done&mode=register\|direct\|reauth` | ログインの成功。FE は `me` を呼ぶ | BE（`idp.php`・`microsoft.php`） |
| `…/editor/?auth=error&reason=<分類>&detail=<詳細>&code=<E-A..>` | ログインの失敗。`detail` は省略されることがある | BE（`idp.php`・`microsoft.php`） |
| `…/editor/?gate=<名前>&need=code\|login\|denied&return=<パス>` | アプリのゲート（S19） | BE（`gate.php`） |
| `…/auth/logout.php?client_id=…&post_logout_redirect_uri=…` | IdP のログアウト。戻り先は登録済みのものだけ | BE（`idp.php`） |

`?auth=error` の `code`（表示用）は、BE が分類から作る。IdP 由来の失敗の分類は、IdP 契約の「エラー」に書く。IdP 由来の新しい表示用コードは `E-A20`〜（`E-A20` 認証システムの版が合わない、`E-A21` 認証システムに接続できない、`E-A22` トークンを確認できない、`E-A23` アカウントの結び付きが合わない、`E-A24` アカウントが無効）。割り当ては BE が管理する。

## 12. 機械チェック（契約テスト）

各リポジトリは、リリース前に実行できるチェックを持つ。コードを共有しないため、チェックは各リポジトリが別々に実装する（B1）。

| # | チェック | 実装する場所 |
|---|---|---|
| C1 | レジストリの API 名 = `docs/04_API.md` の API 名（過不足がない） | BE `tests/contract.php` |
| C2 | レジストリの `auth` = 04 の「認可」列（5 章の語彙で比較） | BE `tests/contract.php` |
| C3 | レジストリの `auth` = 実際の挙動（未ログイン・一般・管理者・再認証切れで、全ルートを呼んで確かめる） | BE `tests/contract.php`（認可の一致テスト） |
| C4 | コード上のすべてのエラーコードが、04 の「共通エラーコード」にある | BE `tests/contract.php` |
| C5 | `meta/version` の `backend.apis` = レジストリ。`backend.version` = `VERSION` | BE `tests/contract.php` |
| C6 | FE が呼ぶ API 名（`js/*.js` の `call('…')` など）⊂ FE の写しの API 名。FE が使う API の一覧と一致 | FE `tools/check-api-usage.py` |
| C7 | FE の写しの先頭ヘッダー（複製元のタグ）が、最新の複製元と一致 | FE `tools/check-api-usage.py`（任意） |
| C8 | 偽 API（`dev/fake-api/server.py`）が、レジストリ・04 のすべての API 名に応答する | FE `tools/check-api-usage.py` |
| C9 | IdP のレジストリ = IdP 契約の入口 | IdP `tests/contract.php` |
| C10 | `docs/rules/` の複製ヘッダーが、`vwc-rules` の最新タグと一致（古いときは警告） | 各リポジトリのリリース手順（05） |

**C3 の「通過」の定義**

- 認証状態は、未ログイン・一般の部員・管理者（再認証なし）・管理者（再認証あり）・信頼端末あり／なし。API ごとに、状態の組み合わせで検査する。
- **拒否**: 認可エラー4種（`unauthorized` `not_admin` `reauth_required` `untrusted`）のいずれかを返す。
- **通過**: 認可エラー4種を**返さない**こと。認可を通った後に、ハンドラが返す業務のエラー（`not_found` `forbidden` `invalid` `conflict` など）は「通過」と扱う。業務の成功までは要求しない（多段の流れの前提データが要り、別の統合テストの範囲）。
- レジストリの `auth` が要求する状態より**弱い**状態で、拒否になること（認可の抜けの検出）が、このチェックの主な目的。
- 全ルートを呼ぶので、**一時の DB・一時のファイル領域**で実行する（`admin/gc` や削除系の副作用のため）。
- CSRF は C3 の対象外。必要なら、別のチェックとして、ログイン中に CSRF トークンなしで状態を変える API を呼び、拒否を確認する。

## 13. 変更の手順

**API を追加する**
1. 契約文書（04 など）に行を足す。 2. レジストリに足す（`since` は次の版）。 3. 実装する。 4. 契約テストを通す。 5. `CHANGELOG.md`（MINOR）。 6. 写しを更新する。 7. 使う側が実装する。

**入力キーを足す**
1. 任意のキーとして足す（A15）。 2. `params_since` に導入版を書く。 3. 契約文書に書く。 4. FE は、BE の `params` を確認してから送る（A16）。

**API・キーを消す・名前を変える**
1. 新しい名前を足す。 2. 旧名に `deprecated` を書く（8 章）。 3. 次の MAJOR で、まとめて消す。
