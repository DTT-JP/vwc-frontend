#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""開発用の偽APIサーバー（Python標準ライブラリのみ）。
   public/ を配信し、/system/api/index.php?r=<名前> で 04_API.md の契約に沿った JSON を返す。
   実バックエンドではない。画面確認・FE の手動テスト用。"""
import json, os, zipfile, io, http.server, socketserver, urllib.parse, threading

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PUBLIC = os.path.join(ROOT, 'public')

LIMITS = [
    {"key":"quota_mb","name":"部員ごとの容量上限","description":"1人あたりの使用量の上限","value":2048,"min":10,"max":10000,"default":2048,"unit":"MB"},
    {"key":"max_upload_mb","name":"最大アップロードサイズ","description":"これを超えるファイルは、システムに保存・アップロードできません","value":256,"min":1,"max":8192,"default":256,"unit":"MB"},
    {"key":"track_limit_mb","name":"履歴の追跡上限","description":"これ以下のテキストは行の差分で、これを超えるファイルは形式を問わずハッシュ・名前・サイズで追跡します","value":5,"min":1,"max":100,"default":5,"unit":"MB"},
    {"key":"device_days","name":"信頼端末の有効日数","description":"期限後は、もう一度承認が必要です","value":90,"min":1,"max":365,"default":90,"unit":"日"},
    {"key":"code_ttl_sec","name":"ログイン用コードの有効秒数","description":"QR・数字コードが使える時間","value":300,"min":60,"max":900,"default":300,"unit":"秒"},
    {"key":"code_max_fail","name":"ログイン承認の失敗上限","description":"承認コードを間違えられる回数。超えるとロックされます","value":5,"min":3,"max":10,"default":5,"unit":"回"},
    {"key":"max_publish_mb","name":"アプリの最大サイズ","description":"1つのアプリとして公開できる大きさ","value":1024,"min":1,"max":8192,"default":1024,"unit":"MB"},
    {"key":"max_projects_per_member","name":"部員ごとのプロジェクト数","description":"1人が持てるプロジェクトの数","value":100,"min":1,"max":1000,"default":100,"unit":"個"},
    {"key":"app_code_max_fail","name":"アクセスコードの失敗上限","description":"アプリの入口でコードを間違えられる回数","value":5,"min":3,"max":10,"default":5,"unit":"回"},
    {"key":"gate_private_minutes","name":"非公開アプリのアクセス有効分","description":"非公開アプリを開いてから、ログインを求め直すまでの時間","value":60,"min":5,"max":1440,"default":60,"unit":"分"},
    {"key":"gate_unlisted_hours","name":"限定公開アプリのアクセス有効時間","description":"アクセスコードを入れてから、入れ直しを求めるまでの時間","value":24,"min":1,"max":168,"default":24,"unit":"時間"},
    {"key":"stale_app_days","name":"放置アプリの通知までの日数（提案）","description":"この日数、更新のないアプリを「忘れていませんか？」で知らせます","value":90,"min":7,"max":730,"default":90,"unit":"日"},
    {"key":"audit_retention_days","name":"監査ログの保持日数（提案）","description":"これより古い監査ログは削除されます","value":365,"min":30,"max":3650,"default":365,"unit":"日"},
    {"key":"zip_max_mb","name":"ZIPの最大サイズ","description":"ZIPでまとめてダウンロードできる上限","value":2048,"min":10,"max":8192,"default":2048,"unit":"MB"},
]

STATE = {
  "csrf": "fake-csrf-token",
  "user": {"id":"U001","name":"山田 太郎","position":"部長","isAdmin":False,"reauthUntil":0},
  "quota": {"limitMB":500,"usedMB":398},
  "projects": {"mine":[{"id":"p1","name":"portfolio","perm":"owner","canPublish":True,"owner":"U001","headCommit":"a1b2c3d","updatedAt":"2026-10-07","sizeMB":110,"order":0}],
               "shared":[{"id":"p2","name":"club-site","perm":"edit","canPublish":True,"owner":"U002","headCommit":"3c4d5e6","updatedAt":"2026-10-08","sizeMB":65,"order":0}]},
  "files": {"p1":[{"name":"index.html","type":"file","text":"<!doctype html>\n<h1>Hello</h1>","size":40},
                  {"name":"README.md","type":"file","text":"# portfolio","size":12},
                  {"name":"css","type":"dir","children":[{"name":"style.css","type":"file","text":"h1{color:tomato}"}]}]},
  "commits": {"p1":[{"hash":"a1b2c3d","message":"配色を調整","by":"山田","at":"2026-10-06 21:10","parent":"9f8e7d6","stat":{"add":0,"mod":2,"del":0}},
                    {"hash":"9f8e7d6","message":"トップ追加","by":"山田","at":"2026-10-05 18:02","parent":None,"stat":{"add":3,"mod":1,"del":0}}]},
  "status": {"p1":{"add":0,"mod":1,"del":0}},
  "apps": [{"name":"portfolio-site","state":"公開","commit":"a1b2c3d","proj":"p1","owner":"U001","ownerLabel":"山田 太郎","sizeMB":20,"updatedAt":"2026-10-07","code":None,"viewers":[],"stale":False,"orphan":False}],
  "adminApps": [{"name":"portfolio-site","state":"公開","commit":"a1b2c3d","proj":"p1","owner":"U001","ownerLabel":"山田 太郎","sizeMB":20,"updatedAt":"2026-10-07","code":None,"viewers":[],"stale":False,"orphan":False}],
  "members": [{"id":"U000","name":"管理 花子","mail":"admin@example.invalid","position":"顧問","isAdmin":True,"active":True,"usedMB":30,"projects":[{"id":"q0","name":"admin-notes"}],"apps":[]},
              {"id":"U001","name":"山田 太郎","mail":"yamada@example.invalid","position":"部長","isAdmin":False,"active":True,"usedMB":398,"projects":[{"id":"p1","name":"portfolio"}],"apps":["portfolio-site"]}],
  "devices": [{"id":"d1","member":"U001","name":"自宅のPC","last":"10/06","expires":"2026-12-31","current":True}],
  "adminDevices": [{"id":"d1","member":"U001","name":"自宅のPC","last":"10/06","expires":"2026-12-31","current":True}],
  "adminProjects": [{"id":"p1","name":"portfolio","owner":"U001","ownerLabel":"山田 太郎","orphan":False,"sizeMB":110}],
  "adminUsage": {"categories":[{"name":"プロジェクト","mb":110,"items":[["portfolio",110]]},{"name":"アプリ","mb":20,"items":[["portfolio-site",20]]},{"name":"履歴","mb":10,"items":[["portfolio の履歴",10]]},{"name":"その他","mb":258,"items":[["設定・一時ファイル・監査ログ",258]]}]},
  "usage": {"categories":[{"name":"プロジェクト","mb":110,"items":[["portfolio",110]]},{"name":"アプリ","mb":20,"items":[["portfolio-site",20]]},{"name":"履歴","mb":10,"items":[["portfolio の履歴",10]]},{"name":"その他","mb":258,"items":[["設定・一時ファイル・監査ログ",258]]}]},
  "announcements": [{"id":"an1","kind":"お知らせ","level":"info","title":"テストお知らせ","body":"本文","from":"2020-01-01","to":"2030-12-31","audience":"all"}],
  "notices": [{"key":"quota80","type":"quota","title":"使用量が上限の 80% になっています","body":"398MB / 500MB。容量がいっぱいになると、保存できなくなります。","actions":[{"label":"利用状況を見る","do":"open-usage"}],"state":"active"}],
  "shares": {"p1":[{"member":"U002","name":"佐藤 花子","mode":"edit","can_publish":True}]},
  "audit": [{"at":"2026-10-07 21:02","member":"U001","op":"保存","target":"portfolio","ip":"192.0.2.10"}],
}

def ok(data=None):
    return data if data is not None else {"ok": True}

def find_project(pid):
    for lst in (STATE["projects"]["mine"], STATE["projects"]["shared"]):
        for p in lst:
            if p["id"] == pid: return p
    return None

class Handler(http.server.BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json; charset=utf-8", extra=None):
        data = body if isinstance(body, (bytes, bytearray)) else json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        if extra:
            for k,v in extra.items(): self.send_header(k,v)
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self._send(204, b"")

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        r = qs.get("r", [""])[0]
        if parsed.path.endswith("index.php") or parsed.path.endswith("idp.php") or parsed.path == "/system/auth/idp.php":
            if "idp.php" in parsed.path:
                self.send_response(302); self.send_header("Location", "/?auth=done&mode=direct"); self.end_headers(); return
            if r == "files/raw":
                pid = qs.get("project",[""])[0]; path = qs.get("path",[""])[0]
                # find text
                content = "hello"
                node = None
                def walk(nodes, target):
                    nonlocal node
                    for n in nodes:
                        if n.get("name") == target.split("/")[-1]:
                            if n.get("type") == "file": node = n; return True
                        if n.get("type") in ("dir","directory") and target.startswith(n["name"]+"/"):
                            if walk(n.get("children", n.get("c",[])), target[len(n["name"])+1:]): return True
                    return False
                # simple: return first file text
                try:
                    for n in STATE["files"].get(pid,[]):
                        if n.get("name") == path.split("/")[-1] and n.get("type")=="file":
                            node = n; break
                except Exception: pass
                text = (node.get("text","") if node else "hello")
                self._send(200, text.encode(), "text/plain; charset=utf-8"); return
            if r == "files/zip":
                buf = io.BytesIO()
                with zipfile.ZipFile(buf, "w") as z:
                    z.writestr("sample.txt", "hello")
                self._send(200, buf.getvalue(), "application/zip"); return
            # default GET -> 405
            self._send(405, {"error":"method_not_allowed"}); return
        # static
        self.serve_static(parsed.path)

    def serve_static(self, path):
        if path == "/": path = "/index.html"
        full = os.path.join(PUBLIC, path.lstrip("/"))
        if os.path.isdir(full): full = os.path.join(full, "index.html")
        if not os.path.isfile(full):
            self._send(404, {"error":"not_found"}, "text/plain"); return
        # mime
        import mimetypes
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if full.endswith(".wasm"): ctype = "application/wasm"
        if full.endswith(".js") or full.endswith(".mjs"): ctype = "text/javascript"
        with open(full, "rb") as f: data = f.read()
        self.send_response(200); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        r = qs.get("r", [""])[0]
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try: body = json.loads(raw.decode("utf-8") or "{}")
        except Exception: body = {}
        # csrf check (lenient)
        try: resp = self.dispatch(r, body)
        except Exception as e:
            resp = {"error":"invalid","detail":str(e)}
        self._send(200, resp)

    def dispatch(self, r, body):
        # meta
        if r == "meta/version":
            # rules/04 §9 の形。backend.apis は契約の写しから作る（簡易: 主要API名）
            apis = {}
            for name in ["meta/version","auth/start","auth/poll","auth/approve","auth/lookup","auth/logout","auth/devices","auth/device_revoke","auth/trust","me","usage/me","notices/list","announcements/list","projects/list","projects/create","projects/rename","projects/delete","projects/reorder","projects/transfer","share/list","share/set","share/remove","files/tree","files/read","files/write","files/create","files/mkdir","files/rename","files/delete","files/upload_init","files/upload_chunk","files/upload_done","files/preview_token","files/zip_prepare","files/search","history/status","history/commit","history/log","history/diff","history/restore","history/delete","apps/check_name","apps/list","apps/publish","apps/update","apps/set_visibility","apps/code_get","apps/code_regen","apps/viewers_list","apps/viewers_add","apps/viewers_remove","apps/open","apps/gate_verify","apps/unpublish","admin/members_list","admin/members_add","admin/members_update","admin/members_import_csv","admin/members_delete","admin/devices_list","admin/devices_revoke","admin/settings_get","admin/settings_set","admin/usage","admin/projects_list","admin/projects_assign","admin/apps_list","admin/announcements_list","admin/announcements_save","admin/announcements_delete","admin/gc","members/search","admin/admins_status","admin/audit_list"]:
                apis[name] = {"since":"1.0"}
            return {"api_version":2,"server_version":"2.0.0","login_providers":["idp"],
                    "backend":{"version":"1.1.0","build":"fake000","build_full":"fake000"+"0"*57,"apis":apis}}
        if r == "me": return {"member":{"id":STATE["user"]["id"],"name":STATE["user"]["name"],"position":STATE["user"]["position"],"isAdmin":STATE["user"]["isAdmin"],"reauthUntil":STATE["user"]["reauthUntil"]},"csrf":STATE["csrf"],"quota":{"limitMB":STATE["quota"]["limitMB"],"usedMB":STATE["quota"]["usedMB"]},
               "max_upload_mb":256,"track_limit_mb":5,"code_ttl_sec":300,"device_days":90,"zip_max_mb":2048,"quota_mb":2048,"max_publish_mb":1024,"max_projects_per_member":100,"settings":{}}
        if r == "auth/start": return {"id":"fake-id","poll_secret":"fake-secret","code":"123456","ttl_sec":300}
        if r == "auth/poll": return {"status":"approved"}
        if r == "auth/approve": return {"ok":True}
        if r == "auth/lookup": return {"code": body.get("code",""), "requester": "偽端末", "kind": "qr"}
        if r == "auth/logout": return {"ok":True}
        if r == "auth/devices": return {"devices":STATE["devices"]}
        if r == "auth/device_revoke": 
            STATE["devices"] = [d for d in STATE["devices"] if d.get("id") != body.get("id")]
            STATE["adminDevices"] = [d for d in STATE["adminDevices"] if d.get("id") != body.get("id")]
            return {"ok":True}
        if r == "auth/trust": return {"ok":True}
        if r == "usage/me": return {"categories":STATE["usage"]["categories"]}
        if r == "notices/list": return {"notices":STATE["notices"]}
        if r == "announcements/list": return {"announcements":STATE["announcements"]}
        if r == "projects/list": return {"projects":STATE["projects"]}
        if r == "projects/create":
            pid = "p" + str(len(STATE["projects"]["mine"])+len(STATE["projects"]["shared"])+1)
            p = {"id":pid,"name":body.get("name") or ("project-"+pid),"perm":"owner","canPublish":True,"owner":STATE["user"]["id"],"headCommit":None,"updatedAt":"2026-10-09","sizeMB":0,"order":0}
            STATE["projects"]["mine"].append(p); STATE["files"][pid]=[]; STATE["commits"][pid]=[]; STATE["status"][pid]={"add":0,"mod":0,"del":0}
            return {"project":p}
        if r == "projects/rename":
            p = find_project(body.get("id")); 
            if p: p["name"]=body.get("name")
            return {"ok":True}
        if r == "projects/delete":
            pid=body.get("id")
            for lst in (STATE["projects"]["mine"],STATE["projects"]["shared"]):
                lst[:] = [p for p in lst if p["id"]!=pid]
            STATE["files"].pop(pid,None); STATE["commits"].pop(pid,None); STATE["status"].pop(pid,None)
            return {"ok":True}
        if r == "projects/reorder":
            lst = STATE["projects"].get(body.get("list"),"mine")
            ids = body.get("ids",[])
            arr = STATE["projects"][lst]
            byid = {p["id"]:p for p in arr}
            STATE["projects"][lst] = [byid[i] for i in ids if i in byid]
            return {"ok":True}
        if r == "projects/transfer":
            pid=body.get("id"); to=body.get("to")
            p=find_project(pid)
            if p: 
                p["owner"]=to
                # move list
                for lstname in ("mine","shared"):
                    STATE["projects"][lstname] = [x for x in STATE["projects"][lstname] if x["id"]!=pid]
                target = "mine" if to==STATE["user"]["id"] else "shared"
                STATE["projects"][target].append(p)
            return {"ok":True}
        if r == "share/list":
            return {"shares": STATE["shares"].get(body.get("project"),[])}
        if r in ("share/set","share/remove"):
            return {"ok":True}
        if r == "files/tree":
            pid=body.get("project")
            return {"tree": STATE["files"].get(pid,[])}
        if r == "files/read":
            # find node
            pid=body.get("project"); path=body.get("path")
            for n in STATE["files"].get(pid,[]):
                if n.get("name")==path.split("/")[-1] and n.get("type")=="file":
                    return {"content": n.get("text",""), "version": 1}
            return {"content":"", "version":1}
        if r == "files/write":
            return {"version":2}
        if r in ("files/create","files/mkdir","files/rename","files/delete"):
            return {"ok":True}
        if r == "files/upload_init":
            return {"upload_id":"u1"}
        if r == "files/upload_chunk":
            return {"ok":True}
        if r == "files/upload_done":
            return {"ok":True}
        if r == "files/preview_token":
            return {"token":"tok123"}
        if r == "files/zip_prepare":
            return {"token":"zip123"}
        if r == "files/search":
            q=body.get("query","")
            hits=[]
            for pid in STATE["files"]:
                if body.get("project") and pid!=body.get("project"): continue
                def walk(nodes,prefix=""):
                    for n in nodes:
                        if n.get("type")=="file" and n.get("text") and q in n.get("text",""):
                            for i,line in enumerate(n.get("text","").split("\n"),1):
                                if q in line: hits.append({"path":(prefix+n["name"]),"line":i,"text":line})
                        if n.get("type") in ("dir","directory"):
                            walk(n.get("children",n.get("c",[])), prefix+n["name"]+"/")
                walk(STATE["files"].get(pid if isinstance(pid,str) else body.get("project"),[]))
            return {"hits":hits[:200]}
        if r == "history/status":
            pid=body.get("project")
            return STATE["status"].get(pid,{"add":0,"mod":0,"del":0})
        if r == "history/commit":
            return {"ok":True}
        if r == "history/log":
            pid=body.get("project")
            return {"commits": STATE["commits"].get(pid,[])}
        if r == "history/diff":
            # 本物と同じ形：path なし＝変更の一覧だけ／path あり＝そのファイルの行差分
            files=[{"path":"index.html","status":"modified","kind":"text","before":40,"after":52},
                   {"path":"logo.png","status":"modified","kind":"bin","before":3000,"after":3100},
                   {"path":"movie.mp4","status":"added","kind":"large","before":None,"after":9000000}]
            out={"hash":body.get("hash"),"parent":None,"added":["movie.mp4"],"modified":["index.html","logo.png"],"deleted":[],"renamed":[],"files":files,"diffs":{}}
            p=body.get("path")
            if p=="index.html":
                out["diffs"][p]={"type":"modified","add":1,"del":1,"truncated":False,"encoding":"UTF-8","before":40,"after":52,
                    "diff":[{"op":"eq","line":"<!doctype html>"},{"op":"del","line":"<h1>Hello</h1>"},{"op":"add","line":"<h1>Hello, world</h1>"},{"op":"skip","count":12}]}
            elif p=="logo.png":
                out["diffs"][p]={"type":"bin","binary":True,"before":3000,"after":3100,"beforeHash":"aaaaaaaaaaaa","afterHash":"bbbbbbbbbbbb"}
            elif p=="movie.mp4":
                out["diffs"][p]={"type":"large","binary":True,"before":None,"after":9000000,"afterHash":"cccccccccccc"}
            return out
        if r == "history/restore":
            return {"ok":True}
        if r == "history/delete":
            return {"ok":True}
        if r == "apps/check_name":
            name=body.get("name")
            if name in [a["name"] for a in STATE["apps"]]: return {"ok":False,"reason":"taken"}
            return {"ok":True}
        if r == "apps/list":
            return {"apps": STATE["apps"]}
        if r == "apps/publish":
            app={"name":body.get("name"),"state":vis(body.get("visibility")),"commit":body.get("commit"),"proj":body.get("project"),"owner":STATE["user"]["id"],"ownerLabel":STATE["user"]["name"],"sizeMB":1,"updatedAt":"2026-10-09","code":None if body.get("visibility")!="unlisted" else "12345678","viewers":[]}
            STATE["apps"].append(app); STATE["adminApps"].append(dict(app))
            return {"app":app,"code":app.get("code"),"excluded":[]}
        if r == "apps/update":
            return {"ok":True}
        if r == "apps/set_visibility":
            for a in STATE["apps"]:
                if a["name"]==body.get("name"): a["state"]=vis(body.get("visibility"))
            return {"ok":True}
        if r == "apps/code_get":
            return {"code":"12345678"}
        if r == "apps/code_regen":
            return {"code":"87654321"}
        if r == "apps/viewers_list":
            return {"viewers":[]}
        if r in ("apps/viewers_add","apps/viewers_remove"):
            return {"ok":True}
        if r == "apps/open":
            return {"url": "app/"+body.get("name")+"/"}
        if r == "apps/gate_verify":
            return {"ok":True}
        if r == "apps/unpublish":
            STATE["apps"]=[a for a in STATE["apps"] if a["name"]!=body.get("name")]
            STATE["adminApps"]=[a for a in STATE["adminApps"] if a["name"]!=body.get("name")]
            return {"ok":True}
        # admin
        if r == "admin/members_list": return {"members":STATE["members"]}
        if r == "admin/members_add":
            m={"id":body.get("id") or ("U"+str(len(STATE["members"])+100)),"name":body.get("name"),"mail":body.get("mail"),"position":body.get("position"),"isAdmin":False,"active":True,"idp_linked":False,"usedMB":0,"projects":[],"apps":[]}
            STATE["members"].append(m); return {"member":m}
        if r == "admin/members_update":
            for m in STATE["members"]:
                if m["id"]==body.get("member"):
                    if "name" in body: m["name"]=body["name"]
                    if "mail" in body: m["mail"]=body["mail"]
                    if "position" in body: m["position"]=body["position"]
                    if "active" in body: m["active"]=bool(body["active"])
            return {"ok":True}
        if r == "admin/members_import_csv": return {"ok":True}
        if r == "admin/members_delete": return {"ok":True}
        if r == "admin/devices_list": 
            mem=body.get("member")
            devs=STATE["adminDevices"] if not mem else [d for d in STATE["adminDevices"] if d.get("member")==mem]
            return {"devices":devs}
        if r == "admin/devices_revoke": return {"ok":True}
        if r == "admin/settings_get": return {"settings":{l["key"]:l["value"] for l in LIMITS}}
        if r == "admin/settings_set":
            for l in LIMITS:
                if l["key"]==body.get("key"): l["value"]=body.get("value")
            return {"ok":True}
        if r == "admin/usage":
            mem=body.get("member")
            return {"categories":STATE["adminUsage"]["categories"]}
        if r == "admin/projects_list":
            mem=body.get("member")
            return {"projects":STATE["adminProjects"]}
        if r == "admin/projects_assign": return {"ok":True}
        if r == "admin/apps_list": return {"apps":STATE["adminApps"]}
        if r == "admin/announcements_list": return {"announcements":STATE["announcements"]}
        if r == "admin/announcements_save":
            ann=dict(body)
            if not ann.get("id"): ann["id"]="an"+str(len(STATE["announcements"])+1)
            # normalize keys
            if "from" not in ann and "from_date" in ann: ann["from"]=ann["from_date"]
            if "to" not in ann and "to_date" in ann: ann["to"]=ann["to_date"]
            STATE["announcements"]=[a for a in STATE["announcements"] if a.get("id")!=ann.get("id")]
            STATE["announcements"].append(ann)
            return {"announcement":ann}
        if r == "admin/announcements_delete":
            STATE["announcements"]=[a for a in STATE["announcements"] if a.get("id")!=body.get("id")]
            return {"ok":True}
        if r == "admin/gc": return {"freed_mb":0,"estimate_mb":0}
        if r == "admin/audit_list": return {"log":STATE["audit"]}
        if r == "members/search": return {"members":STATE["members"]}
        return {"error":"not_found"}

def vis(v):
    return {"public":"公開","unlisted":"限定公開","private":"非公開"}.get(v,v)

def bool(v):
    return v is True or v == 1 or v == "1" or v == "true"

if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    args = ap.parse_args()
    os.chdir(ROOT)
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", args.port), Handler)
    httpd.allow_reuse_address = True
    print("Fake API server: http://127.0.0.1:%d/" % args.port)
    print("API base: http://127.0.0.1:%d/system/api/index.php" % args.port)
    httpd.serve_forever()
