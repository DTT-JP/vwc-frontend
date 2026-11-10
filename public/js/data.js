/* SPDX-License-Identifier: GPL-3.0-or-later */
/* データ層。API（04_API.md）の結果を、画面が使う形（DATA）に変換する。
   ・DATA は起動直後は空。boot.js が Api.version / me / projects/list ... を読み、applyXxx() で埋める。
   ・ファイル本文は files/tree に含まれない場合があるので、開いたときに files/read で取る（ensureText）。
   ・画面（app.js ほか）は DATA だけを参照する。 */
const SETTINGS_DEFAULT = {
  theme: 'dark', accent: 'blue', uiFont: 14, edFont: 14, lineH: 1.6, tab: 2, wrap: false, lineNo: true, density: 'standard',
  htmlComplete: 'on', // コード補完 ON/OFF（旧値 tab/auto は on、off は off に移行）
  notify: { save: true, share: true, publish: true, device: true, usage: true }
};
function normalizeCodeComplete(v) { return (v === 'off' || v === false) ? 'off' : 'on'; }
/* 制限値の表示用の定義（名前・説明・範囲）。値は API（me / admin/settings_get）から受け取る。 */
const LIMIT_META = [
  { key: 'quota_mb', name: '部員ごとの容量上限', description: '1人あたりの使用量の上限（プロジェクト・アプリ・履歴などの合計）', value: 2048, min: 1, max: 10000, default: 2048, unit: 'MB' },
  { key: 'max_upload_mb', name: '最大アップロードサイズ', description: 'これを超えるファイルは、システムに保存・アップロードできません（1〜8192MB）', value: 256, min: 1, max: 8192, default: 256, unit: 'MB' },
  { key: 'track_limit_mb', name: '履歴の追跡上限', description: 'これ以下のテキストは行の差分で、これを超えるファイルは形式を問わずハッシュ・名前・サイズで追跡します', value: 5, min: 1, max: 100, default: 5, unit: 'MB' },
  { key: 'device_days', name: '信頼端末の有効日数', description: '期限後は、もう一度承認が必要です', value: 90, min: 1, max: 365, default: 90, unit: '日' },
  { key: 'code_ttl_sec', name: 'ログイン用コードの有効秒数', description: 'QR・数字コードが使える時間', value: 300, min: 60, max: 900, default: 300, unit: '秒' },
  { key: 'code_max_fail', name: 'ログイン承認の失敗上限', description: '承認コードを間違えられる回数。超えるとロックされます', value: 5, min: 3, max: 10, default: 5, unit: '回' },
  { key: 'max_publish_mb', name: 'アプリの最大サイズ', description: '1つのアプリとして公開できる大きさ（1〜8192MB）', value: 1024, min: 1, max: 8192, default: 1024, unit: 'MB' },
  { key: 'max_projects_per_member', name: '部員ごとのプロジェクト数', description: '1人が持てるプロジェクトの数（1〜1000個）', value: 100, min: 1, max: 1000, default: 100, unit: '個' },
  { key: 'app_code_max_fail', name: 'アクセスコードの失敗上限', description: 'アプリの入口でコードを間違えられる回数', value: 5, min: 3, max: 10, default: 5, unit: '回' },
  { key: 'gate_private_minutes', name: '非公開アプリのアクセス有効分', description: '非公開アプリを開いてから、ログインを求め直すまでの時間', value: 60, min: 5, max: 1440, default: 60, unit: '分' },
  { key: 'gate_unlisted_hours', name: '限定公開アプリのアクセス有効時間', description: 'アクセスコードを入れてから、入れ直しを求めるまでの時間', value: 24, min: 1, max: 168, default: 24, unit: '時間' },
  { key: 'stale_app_days', name: '放置アプリの通知までの日数（提案）', description: 'この日数、更新のないアプリを「忘れていませんか？」で知らせます', value: 90, min: 7, max: 730, default: 90, unit: '日' },
  { key: 'audit_retention_days', name: '監査ログの保持日数（提案）', description: 'これより古い監査ログは削除されます', value: 365, min: 30, max: 3650, default: 365, unit: '日' },
  { key: 'zip_max_mb', name: 'ZIPの最大サイズ', description: 'ZIPでまとめてダウンロードできる上限', value: 2048, min: 1, max: 8192, default: 2048, unit: 'MB' }
];

const DATA = {
  meta: { api_version: null, server_version: '', backend: null, login_providers: [] },
  user: { id: '', name: '', position: '', isAdmin: false, reauthUntil: 0, trusted: false, idpLinked: false },
  quota: { limitMB: 0, usedMB: 0 },
  projects: { mine: [], shared: [] },
  files: {},
  commits: [],
  commitsByProject: {},
  historyPageByProject: {},
  commitStatus: {},
  fileStates: {},
  apps: [],
  adminApps: [],
  members: [],
  devices: [],
  adminDevices: [],
  adminProjects: [],
  adminUsage: { categories: [] },
  limits: LIMIT_META.map(l => ({ ...l })),
  audit: [],
  settings: JSON.parse(JSON.stringify(SETTINGS_DEFAULT)),
  usage: { categories: [] },
  announcements: [],
  notices: [],
  media: { inputFormats: [], outputFormats: [] },
  tools: [],
  login: { code: '', approveUrl: '', requester: '', id: '', pollSecret: '', expires: 0, kind: 'qr' },
  collab: [],
  sharesByProject: {}
};

/* 容量（MB）の表示は、いつでも 0.01MB 単位（小数第2位まで）に四捨五入する。 */
const roundMB = v => Math.round((Number(v) || 0) * 100) / 100;
const fmtMB = v => roundMB(v).toFixed(2);
const arr = (d, key) => Array.isArray(d) ? d : (d && Array.isArray(d[key]) ? d[key] : []);
const num = (v, d) => Number.isFinite(+v) ? +v : d;
const bool = (v, d) => v === undefined || v === null ? d : (v === true || v === 1 || v === '1' || v === 'true');
const first = (o, keys, d) => { for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k]; return d; };
const TEXTX = new Set('html htm css js mjs json md txt php sql py c h cpp cc hpp cs java kt go rs ts tsx jsx sh bash ps1 yml yaml xml csv ini conf env toml lua rb pl r vue svg diff graphql'.split(' '));
const BINX = new Set('png jpg jpeg gif webp bmp ico avif mp3 wav m4a flac ogg opus mp4 webm mov m4v ogv avi mkv pdf zip gz tar wasm woff woff2 ttf otf'.split(' '));
const textPath = name => { const e = String(name || '').split('.').pop().toLowerCase(); return TEXTX.has(e) || (!BINX.has(e) && !e.includes('/')); };

/* 表示用の列挙（BE は英語の値、画面は日本語） */
const VIS_IN = { public: '公開', unlisted: '限定公開', private: '非公開', '公開': '公開', '限定公開': '限定公開', '非公開': '非公開' };
const VIS_OUT = { '公開': 'public', '限定公開': 'unlisted', '非公開': 'private', public: 'public', unlisted: 'unlisted', private: 'private' };
const visLabel = v => VIS_IN[v] || v || '公開';
const visValue = v => VIS_OUT[v] || v || 'public';
const PERM_IN = { view: 'view', edit: 'edit', owner: 'owner', '閲覧': 'view', '編集': 'edit', '所有者': 'owner' };

/* API の形 → 画面が使う形 */
function fromApi(a) {
  const d = JSON.parse(JSON.stringify(a || {}));
  if (d.projects) {
    const pj = p => {
      const o = { ...p };
      o.id = String(first(p, ['id', 'project', 'project_id'], ''));
      o.name = first(p, ['name'], '');
      if (o.perm === 'owner') delete o.perm;
      o.owner = first(p, ['owner', 'owner_id'], o.owner);
      if (o.owner === undefined) delete o.owner;
      o.ownerLabel = first(p, ['ownerLabel', 'owner_label'], o.ownerLabel);
      if (o.ownerLabel === undefined) delete o.ownerLabel;
      o.canPublish = bool(first(p, ['canPublish', 'can_publish'], o.canPublish), false);
      o.updatedAt = first(p, ['updatedAt', 'updated_at'], o.updatedAt);
      o.sizeMB = roundMB(num(first(p, ['sizeMB', 'size_mb'], first(p, ['work_bytes', 'bytes'], 0) / 1048576), o.sizeMB));
      o.order = num(first(p, ['order', 'sort_order'], o.order), 0);
      o.parent = first(p, ['parent', 'parent_label'], o.parent);
      o.parentCommit = first(p, ['parentCommit', 'fork_commit'], o.parentCommit);
      o.headCommit = first(p, ['headCommit', 'head_commit'], o.headCommit);
      if (p.perm) o.perm = PERM_IN[p.perm] || p.perm;
      if (o.perm === 'owner') delete o.perm;
      return o;
    };
    d.projects = { mine: arr(d.projects, 'mine').map(pj), shared: arr(d.projects, 'shared').map(pj) };
  }
  if (d.files) {
    const node = n => {
      const o = { n: first(n, ['name', 'n'], ''), t: first(n, ['type', 't'], 'file') };
      if (o.t === 'dir' || o.t === 'directory') { o.t = 'dir'; o.c = arr(n.children ?? n.c, '').map(node); }
      else {
        o.t = 'file';
        if (n.text !== undefined) o.text = n.text;
        if (n.size !== undefined) o.size = n.size;
        if (n.version !== undefined) o.version = n.version;
      }
      const status = first(n, ['status'], '');
      if (status === '新規' || status === 'new' || status === 'added') o.inBase = false;
      if (status === '変更' || status === 'modified' || status === 'renamed') o.mod = true;
      if (status === '未保存' || status === 'unsaved') o.saved = false;
      if (bool(first(n, ['untracked'], false), false)) o.untracked = true;
      return o;
    };
    const files = {};
    Object.keys(d.files).forEach(k => { files[k] = arr(d.files[k], '').map(node); });
    d.files = files;
  }
  return d;
}

function setLimits(values) {
  if (!values) return;
  DATA.limits.forEach(l => { if (values[l.key] !== undefined && values[l.key] !== null && Number.isFinite(+values[l.key])) l.value = +values[l.key]; });
}
function limitOf(k) { return DATA.limits.find(l => l.key === k) || { key: k, value: 0 }; }
const quotaLimit = () => limitOf('quota_mb').value;
const catOf = n => DATA.usage.categories.find(c => c.name === n);
const usedMB = () => {
  const total = DATA.usage.categories.reduce((s, c) => s + num(c.mb, 0), 0);
  return roundMB(total || DATA.quota.usedMB || 0);
};
const catItems = c => (c && c.items ? c.items : []).map(([n, v]) => [n, v]).sort((a, b) => b[1] - a[1]);
const allProjects = () => [...DATA.projects.mine, ...DATA.projects.shared];
const digits = s => String(s || '').replace(/\D/g, '').slice(0, 8);
const fmtCode = c => { const d = digits(c); return d.length > 4 ? d.slice(0, 4) + ' ' + d.slice(4) : d; };
const today = () => new Date().toISOString().slice(0, 10);
/* BE は日時を UNIX 秒で返す。画面は 'YYYY-MM-DD HH:MM' の文字列を前提にしているので変換する。 */
const dt = v => {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'string' && !/^\d+$/.test(v)) return v;
  const n = +v; if (!Number.isFinite(n) || n <= 0) return '';
  const d = new Date(n < 1e12 ? n * 1000 : n), p = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const memberLabel = id => {
  if (!id) return '';
  if (DATA.user.id === id) return DATA.user.name || id;
  const m = DATA.members.find(x => x.id === id);
  return m && m.name ? m.name : id;
};

/* ---- 設定（端末の localStorage。キーに部員IDを含める：03） ---- */
/* V6: 保存データ互換。変換可能なら正規化、破損/不明形式は放棄して既定値を再生成する。 */
const SETTINGS_SCHEMA = 1;
function migrateSettings(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const s = { ...v };
  // 旧形式の正規化（変換可能）
  if (s.htmlComplete === 'tab' || s.htmlComplete === 'auto') s.htmlComplete = 'on';
  if (s.htmlComplete === true) s.htmlComplete = 'on';
  if (s.htmlComplete === false) s.htmlComplete = 'off';
  if (!s.notify || typeof s.notify !== 'object') s.notify = {};
  s._v = SETTINGS_SCHEMA;
  return s;
}
function settingsKey() { return 'vwc.settings.' + (DATA.user.id || 'anon'); }
function loadSettings() {
  let base = JSON.parse(JSON.stringify(SETTINGS_DEFAULT));
  try {
    const raw = localStorage.getItem(settingsKey());
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      const migrated = migrateSettings(parsed);
      if (migrated) {
        base = { ...base, ...migrated, notify: { ...SETTINGS_DEFAULT.notify, ...(migrated.notify || {}) } };
        // 変換/正規化結果を保存（冪等）
        if (!parsed || parsed._v !== SETTINGS_SCHEMA || JSON.stringify(parsed) !== JSON.stringify(migrated)) {
          try { localStorage.setItem(settingsKey(), JSON.stringify(base)); } catch { /* noop */ }
        }
      } else {
        // 形式不明は放棄して新規生成（V6-3）
        try { localStorage.removeItem(settingsKey()); } catch { /* noop */ }
      }
    }
  } catch {
    // 破損データは放棄して新規生成（V6-3）
    try { localStorage.removeItem(settingsKey()); } catch { /* noop */ }
  }
  DATA.settings = base;
  DATA.settings.htmlComplete = normalizeCodeComplete(DATA.settings.htmlComplete);
}
function saveSettings() {
  try {
    DATA.settings._v = SETTINGS_SCHEMA;
    localStorage.setItem(settingsKey(), JSON.stringify(DATA.settings));
  } catch { /* 保存できなくても画面は動く */ }
}

/* ---- me / 初期データ ---- */
function applyMe(d) {
  const u = d.member || d.user || {};
  let reauth = num(first(u, ['reauthUntil', 'reauth_until'], 0), 0);
  /* BE が秒で返す場合にも対応（10桁未満は秒とみなす） */
  if (reauth > 0 && reauth < 1e12) reauth *= 1000;
  DATA.user = {
    id: u.id || u.member_id || '', name: u.name || '', position: u.position || '',
    isAdmin: bool(first(u, ['isAdmin', 'is_admin'], u.role === 'admin'), false),
    reauthUntil: reauth,
    trusted: bool(first(d, ['trusted'], false), false),
    idpLinked: bool(first(u, ['idpLinked', 'idp_linked'], false), false)
  };
  const q = d.quota || {};
  DATA.quota = { limitMB: num(q.limitMB ?? q.limit_mb ?? d.quota_mb ?? (d.limits || {}).quota_mb, 0), usedMB: roundMB(num(q.usedMB ?? q.used_mb, 0)) };
  const values = { ...(d.limits || {}) };
  LIMIT_META.forEach(l => { if (d[l.key] !== undefined) values[l.key] = d[l.key]; });
  setLimits(values);
  if (d.settings && typeof d.settings === 'object') {
    const s = d.settings;
    Object.keys(s).forEach(k => { if (SETTINGS_DEFAULT[k] !== undefined) DATA.settings[k] = s[k]; });
  }
  loadSettings();
  if (d.csrf) Api.setCsrf(d.csrf);
  if (typeof applyTrustUi === 'function') applyTrustUi();
}

function applyProjects(d) {
  /* BE の projects/list は { mine, shared } を直接返す。{ projects: { mine, shared } } の形も受け付ける。 */
  const p = fromApi({ projects: (d && d.projects) || d || {} }).projects;
  const order = l => l.map((x, i) => ({ ...x, order: x.order ?? i })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  /* 自分のものは「共有されたプロジェクト」に入れない（同じプロジェクトが両方に出て、閲覧のみ扱いになるのを防ぐ） */
  const mineIds = new Set(p.mine.map(x => x.id));
  const shared = p.shared.filter(x => !mineIds.has(x.id) && !(DATA.user.id && x.owner === DATA.user.id));
  DATA.projects = { mine: order(p.mine), shared: order(shared) };
}

function normalizeUsage(d) {
  if (!d) return { categories: [] };
  let raw = Array.isArray(d) ? d : (d.categories || d.usage || d.items);
  let cats;
  if (Array.isArray(raw)) cats = raw;
  else if (raw && typeof raw === 'object') {
    const keys = ['プロジェクト', 'アプリ', '履歴', 'その他'];
    cats = keys.filter(k => raw[k] !== undefined).map(k => ({ name: k, mb: num(raw[k], 0), items: [] }));
  } else cats = [];
  cats = cats.map(c => ({ ...c, name: c.name || c.category || '', mb: roundMB(num(c.mb ?? c.size ?? c.totalMB, 0)), items: Array.isArray(c.items) ? c.items.map(x => Array.isArray(x) ? [x[0], roundMB(num(x[1], 0))] : [x.name, roundMB(num(x.mb, 0))]) : [] }));
  return { categories: cats, totalMB: num(d.totalMB ?? d.total_mb, NaN) };
}
function applyUsage(d) {
  if (!d) return;
  const u = normalizeUsage(d);
  DATA.usage = { categories: u.categories };
  if (Number.isFinite(u.totalMB)) DATA.quota.usedMB = roundMB(u.totalMB);
  else DATA.quota.usedMB = roundMB(u.categories.reduce((s, c) => s + c.mb, 0));
}
function applyAdminUsage(d) {
  /* BE の admin/usage は、部員を指定しないと { members: [ { member, totalMB, categories } ] } を返す。
     画面は { categories } を使うので、全員分を区分ごとに合算し、部員ごとの使用量も DATA.members に入れる。 */
  if (d && Array.isArray(d.members)) {
    const sums = new Map();
    d.members.forEach(m => {
      const known = DATA.members.find(x => x.id === m.member);
      if (known) known.usedMB = roundMB(num(m.totalMB, 0));
      (m.categories || []).forEach(c => {
        const cur = sums.get(c.name) || { name: c.name, mb: 0, items: [] };
        cur.mb += num(c.mb, 0);
        (c.items || []).forEach(x => cur.items.push(Array.isArray(x) ? [x[0], roundMB(num(x[1], 0))] : [x.name, roundMB(num(x.mb, 0))]));
        sums.set(c.name, cur);
      });
    });
    DATA.adminUsage = { categories: [...sums.values()].map(c => ({ ...c, mb: Math.round(c.mb * 100) / 100 })) };
    return DATA.adminUsage;
  }
  const u = normalizeUsage(d);
  DATA.adminUsage = { categories: u.categories };
  return DATA.adminUsage;
}
function applyAnnouncements(d) {
  DATA.announcements = arr(d, 'announcements').map(a => ({
    ...a, id: String(a.id ?? a.key ?? ''), kind: a.kind || 'お知らせ', level: a.level || 'info',
    title: a.title || '', body: a.body || '', from: a.from || a.from_date || '', to: a.to || a.to_date || '',
    audience: a.audience || 'all'
  }));
}
/* 通知の操作が API から来ない場合の既定（種類ごとの行き先）。文言・見た目は変えない。 */
const NOTICE_ACTIONS = {
  stale_app: [['アプリを管理', 'open-app']],
  quota: [['利用状況を見る', 'open-usage']],
  device_expiry: [['信頼端末を見る', 'open-devices']],
  orphan_app: [['アプリ(管理)を開く', 'open-adm-apps']]
};
function applyNotices(d) {
  DATA.notices = arr(d, 'notices').map(n => {
    const type = n.type || '';
    const actions = Array.isArray(n.actions) && n.actions.length ? n.actions
      : (NOTICE_ACTIONS[type] || []).map(([label, do_]) => ({ label, do: do_, arg: n.target || n.name || '' }));
    return {
      ...n, key: n.key || n.id || '', type, title: n.title || '', body: n.body || '',
      actions, state: n.state || 'active'
    };
  });
}
function normApp(a) {
  return {
    ...a, name: a.name || '', state: visLabel(a.state ?? a.visibility),
    commit: a.commit ?? a.commit_hash ?? a.hash ?? '', commitMessage: a.commitMessage ?? a.commit_message ?? '', proj: a.proj ?? a.project ?? a.project_id ?? '',
    owner: a.owner ?? a.owner_id ?? null, ownerLabel: a.ownerLabel ?? a.owner_label ?? '',
    sizeMB: roundMB(Math.max(0, num(a.sizeMB ?? a.size_mb, num(a.size_bytes, 0) / 1048576))),
    updatedAt: dt(a.updatedAt ?? a.updated_at ?? ''), code: a.code ?? a.access_code ?? '', viewers: Array.isArray(a.viewers) ? a.viewers : (a.viewers || []),
    stale: bool(a.stale, false), orphan: bool(a.orphan, false)
  };
}
function applyApps(d) {
  DATA.apps = arr(d, 'apps').map(normApp);
}
function applyAdminApps(d) {
  const list = Array.isArray(d) ? d : (d && (d.apps || d.items)) || [];
  DATA.adminApps = list.map(normApp);
}
function applyAdminProjects(d) {
  const list = Array.isArray(d) ? d : (d && (d.projects || d.items)) || [];
  DATA.adminProjects = list.map(p => {
    const o = { ...p };
    o.id = String(first(p, ['id', 'project', 'project_id'], ''));
    o.name = p.name || '';
    o.owner = first(p, ['owner', 'owner_id'], null);
    o.ownerLabel = first(p, ['ownerLabel', 'owner_label'], '');
    o.orphan = bool(first(p, ['orphan'], false), false);
    o.sizeMB = roundMB(num(first(p, ['sizeMB', 'size_mb'], num(first(p, ['work_bytes', 'bytes'], 0), 0) / 1048576), 0));
    return o;
  });
}
function hasIdpLoginProvider() {
  return !!(DATA.meta && Array.isArray(DATA.meta.login_providers) && DATA.meta.login_providers.includes('idp'));
}
function applyMembers(d) {
  /* IdP連携あり判定: ログイン手段にIdPがあれば、同期完了前/BE応答前でもIdP管理モード相当に扱う（誤追加防止）。
     BE が managedByIdp を明示した場合は BE確定値を優先する。
     - managedByIdp:true  -> IdP正本（VWCから追加・削除・管理者設定不可）
     - managedByIdp:false -> IdP実質無効/未設定等でBEがローカル管理を許容するため、それに合わせて解放（BEと整合） */
  const explicit = first(d || {}, ['managedByIdp', 'managed_by_idp'], undefined);
  if (explicit !== undefined) DATA.membersManagedByIdp = bool(explicit, hasIdpLoginProvider());
  else if (hasIdpLoginProvider() || !!(typeof S !== 'undefined' && S && S.idpMode)) DATA.membersManagedByIdp = true;
  else DATA.membersManagedByIdp = false;
  DATA.members = arr(d, 'members').map(m => ({
    ...m, id: String(m.id ?? m.member_id ?? ''), name: m.name || '', mail: m.mail ?? m.email ?? '-',
    position: m.position || '部員', isAdmin: bool(first(m, ['isAdmin', 'is_admin'], m.role === 'admin'), false),
    active: bool(first(m, ['active'], true), true),
    idpLinked: bool(first(m, ['idpLinked', 'idp_linked'], false), false),
    usedMB: roundMB(num(m.usedMB ?? m.used_mb, 0)),
    projects: Array.isArray(m.projects) ? m.projects.map(p => typeof p === 'string' ? { id: p, name: p } : p) : [],
    apps: Array.isArray(m.apps) ? m.apps.map(a => typeof a === 'string' ? a : (a.name || a)) : []
  }));
}
function applyDevices(d) {
  DATA.devices = arr(d, 'devices').map(v => ({
    ...v, id: String(v.id ?? ''), member: v.member ?? v.member_id ?? '',
    name: v.name ?? v.label ?? '', last: dt(v.last ?? v.last_used ?? ''), expires: dt(v.expires ?? ''),
    current: bool(v.current, false)
  }));
}
function applyAdminDevices(d) {
  const list = Array.isArray(d) ? d : (d && (d.devices || d.items)) || [];
  DATA.adminDevices = list.map(v => ({
    ...v, id: String(v.id ?? ''), member: v.member ?? v.member_id ?? '',
    name: v.name ?? v.label ?? '', last: dt(v.last ?? v.last_used ?? ''), expires: dt(v.expires ?? ''),
    current: bool(v.current, false)
  }));
}
function applyAudit(d) {
  DATA.audit = arr(d, 'log').length ? arr(d, 'log') : arr(d, 'audit');
  DATA.audit = DATA.audit.map(l => ({ ...l, at: dt(l.at ?? l.ts ?? ''), member: l.member ?? l.member_id ?? '', op: l.op ?? l.action ?? '', target: l.target ?? '', ip: l.ip ?? '' }));
}
function applyShares(d) {
  DATA.collab = arr(d, 'shares').map(s => ({
    id: String(s.member ?? s.id ?? s.member_id ?? ''),
    name: s.name || (DATA.members.find(m => m.id === (s.member || s.id || s.member_id)) || {}).name || s.member,
    perm: s.mode || s.perm || 'view',
    pub: bool(s.can_publish ?? s.pub, false)
  }));
}
function applyTree(projectId, d) {
  const root = Array.isArray(d) ? d : (d && (d.tree || d.files)) || [];
  DATA.files[projectId] = fromApi({ files: { [projectId]: root } }).files[projectId] || [];
  if (DATA.fileStates && DATA.fileStates[projectId]) markStates(projectId, DATA.fileStates[projectId]);
  return DATA.files[projectId];
}
function applyCommits(projectId, d, opts = {}) {
  const list = arr(d, 'commits').map(c => ({
    ...c, hash: String(c.hash || c.id || ''), message: c.message || '',
    by: c.by ?? memberLabel(c.author) ?? '', at: dt(c.at ?? c.ts ?? ''), short: c.short || String(c.hash || c.id || '').slice(0, 7), parent: c.parent ?? c.parent_hash ?? null,
    stat: c.stat || { add: num(c.add, 0), mod: num(c.mod, 0), del: num(c.del, 0) }, rel: c.rel || null
  }));
  const previous = DATA.commitsByProject[projectId] || [];
  const merged = opts.append ? [...previous, ...list.filter(c => !previous.some(p => p.hash === c.hash))] : list;
  DATA.commits = projectId === (S.proj && S.proj.id) ? merged : DATA.commits;
  if (projectId) {
    DATA.commitsByProject[projectId] = merged;
    if (d && typeof d === 'object') {
      DATA.historyPageByProject[projectId] = {
        next: d.next_cursor ?? d.nextCursor ?? d.next ?? null,
        loading: false
      };
    }
  }
  return merged;
}
function applyStatus(projectId, d) {
  /* BE の history/status は { states: { パス: 状態 }, counts: { add, mod, del } } を返す。 */
  const s = (d && (d.counts || d.status)) || d || {};
  const out = { add: num(s.add, 0), mod: num(s.mod, 0), del: num(s.del, 0) };
  if (projectId) {
    DATA.commitStatus[projectId] = out;
    const hasStates = !!(d && d.states && !Array.isArray(d.states));
    if (hasStates) { (DATA.fileStates = DATA.fileStates || {})[projectId] = d.states; markStates(projectId, d.states); }
    if (typeof S !== 'undefined' && S.proj && S.proj.id === projectId) {
      if (typeof renderTree === 'function') renderTree();
      if (typeof renderHist === 'function') renderHist();
      if (typeof updateCommitControl === 'function') updateCommitControl();
    }
  }
  return out;
}
/* states（new / modified / renamed / deleted / unchanged / untracked）を、ファイルツリーの印（新・更）に反映する。 */
function markStates(projectId, states) {
  const walk = (list, prefix) => (list || []).forEach(n => {
    const path = prefix ? prefix + '/' + n.n : n.n;
    if (n.t === 'dir') { walk(n.c, path); return; }
    const st = states[path];
    delete n.untracked;
    delete n.renamed;
    if (st === 'new') { n.inBase = false; n.mod = false; }
    else if (st === 'modified') { n.inBase = true; n.mod = true; }
    else if (st === 'renamed') { n.inBase = true; n.mod = true; n.renamed = true; } // 名前変更・移動（内容不変）= オレンジ「更」
    else if (st === 'untracked') { n.untracked = true; }
    else if (st === 'unchanged') { n.inBase = true; n.mod = false; }
  });
  walk(DATA.files[projectId], '');
}

/* ---- 読み込み ---- */
/* 同時に何度か呼ばれても、いちばん新しい応答だけを反映する（古い応答が後から届いて上書きするのを防ぐ） */
let projectsSeq = 0;
async function loadProjects() { const seq = ++projectsSeq, d = await Api.projects.list(); if (seq === projectsSeq) applyProjects(d); }
async function loadUsage() { applyUsage(await Api.call('usage/me', {})); }
/* ファイル変更後の使用量表示更新。連続操作（自動保存・一括処理）ではまとめて1回にする。 */
let _usageRefreshTimer = 0, _usageRefreshSeq = 0;
function scheduleUsageRefresh(delay = 900) {
  clearTimeout(_usageRefreshTimer);
  _usageRefreshTimer = setTimeout(() => { refreshUsageDisplay().catch(() => {}); }, delay);
}
async function refreshUsageDisplay() {
  const seq = ++_usageRefreshSeq;
  const tasks = [loadUsage().catch(() => {})];
  if (typeof S !== 'undefined' && S.role === 'admin' && typeof loadAdminUsage === 'function') {
    tasks.push(loadAdminUsage(typeof usageMember !== 'undefined' ? (usageMember || undefined) : undefined).catch(() => {}));
  }
  if (typeof loadProjects === 'function') tasks.push(loadProjects().catch(() => {}));
  await Promise.all(tasks);
  if (seq !== _usageRefreshSeq) return;
  if (typeof renderProjects === 'function') { try { renderProjects(); } catch {} }
  if (typeof renderUsage === 'function') { try { renderUsage(); } catch {} }
  if (typeof S !== 'undefined' && S.tabs) {
    const t = S.tabs.find(x => x.name === '使用状況の詳細');
    if (t && typeof rUsage === 'function') { t.render = rUsage; if (typeof renderTabs === 'function') renderTabs(); }
  }
}
async function refreshUsageAndProjects(delay = 0) {
  if (delay > 0) { scheduleUsageRefresh(delay); return; }
  clearTimeout(_usageRefreshTimer);
  await refreshUsageDisplay().catch(() => {});
  if (typeof loadProjects === 'function') {
    await loadProjects().catch(() => {});
    if (typeof renderProjects === 'function') { try { renderProjects(); } catch {} }
  }
}
async function loadAnnouncements() { applyAnnouncements(await Api.call('announcements/list', {})); }
async function loadAdminAnnouncements() { applyAnnouncements(await Api.admin.announcementsList()); }
async function loadNotices() { applyNotices(await Api.call('notices/list', {})); }
async function loadApps(scope) { applyApps(await Api.apps.list(scope)); }
let _idpSyncTask = 0;
async function loadMembers(opts = {}) {
  const show = opts.idpTask !== false && hasIdpLoginProvider();
  if (show && !_idpSyncTask) {
    _idpSyncTask++;
    try {
      await Task.run({ title: 'IdPと連携中', icon: 'sync' }, async () => { applyMembers(await Api.admin.membersList()); });
    } finally { _idpSyncTask--; }
    return;
  }
  applyMembers(await Api.admin.membersList());
}
async function loadAdminDevices(member) { applyAdminDevices(await Api.admin.devicesList(member)); }
async function loadAdminProjects(member) { applyAdminProjects(await Api.admin.projectsList(member)); }
async function loadAdminUsage(member) { return applyAdminUsage(await Api.admin.usage(member)); }
async function loadAdminLimits() {
  const d = await Api.admin.settingsGet();
  const vals = d.settings || d.values || (d.key ? { [d.key]: d.value } : d);
  setLimits(vals);
  return d;
}
async function loadAudit(filter) { applyAudit(await Api.admin.auditList(filter)); }
async function loadAdminApps() { applyAdminApps(await Api.admin.appsList()); }
async function loadMyDevices() { applyDevices(await Api.auth.devices()); }

async function loadProject(projectId, opts = {}) {
  if (!projectId) return;
  const tasks = [
    Api.files.tree(projectId).then(d => applyTree(projectId, d)),
    Api.history.log(projectId).then(d => applyCommits(projectId, d)).catch(e => { if (!(e instanceof ApiError) || e.status !== 404) throw e; DATA.commits = []; })
  ];
  /* 変更の判定（ファイルの比較）は時間がかかることがあるので、プロジェクトを開く処理は待たない。終わりしだい画面に反映する */
  const statusDone = Api.history.status(projectId).then(d => {
    applyStatus(projectId, d);
    if (S.proj && S.proj.id === projectId) { if (typeof renderTree === 'function') renderTree(); if (typeof renderHist === 'function') renderHist(); }
  }).catch(() => { /* 表示は、判定できるまで「変更なし」扱いのまま */ });
  if (opts.waitStatus) tasks.push(statusDone);
  const p = allProjects().find(x => x.id === projectId);
  if (p && (!p.perm || p.perm === 'owner')) {
    tasks.push(Api.share.list(projectId).then(d => { DATA.sharesByProject[projectId] = d; if (opts.shares !== false) applyShares(d); }).catch(e => { if (!(e instanceof ApiError) || ![403, 404].includes(e.status)) throw e; }));
  } else if (p) {
    DATA.collab = [];
  }
  await Promise.all(tasks);
}

/* ファイル本文を必要になったときに読む。テキストでなければ何もしない。 */
async function ensureText(node, path, projectId) {
  if (!node || node.t === 'dir' || node.text !== undefined || !textPath(node.n)) return node;
  const name = String(path).split('/').pop(), big = (node.size || 0) >= 1048576;
  const read = () => Api.files.read(projectId, path);
  /* 1MB以上は、すぐに右下の通知を出す。それ未満・サイズ不明でも、0.35秒以上かかったら通知を出す（通信が遅いとき） */
  const label = node.size ? `${name} を読み込み中（${kb(node.size)}）` : `${name} を読み込み中`;
  const d = await Task.run({ title: label, icon: 'description', ...(big ? { delay: 0 } : {}) }, read);
  if (d.text === false || d.encoding === 'base64') {
    node.encoding = 'base64'; node.charset = null;
    if (d.content) try { node.blob = new Blob([Uint8Array.from(atob(d.content), c => c.charCodeAt(0))]); } catch {}
    return node;
  }
  node.text = typeof d.content === 'string' ? d.content : '';
  if (d.version !== undefined) node.version = d.version;
  if (d.encoding) node.encoding = d.encoding;
  if (d.charset) node.charset = d.charset;
  if (node.bt === undefined) node.bt = node.text;
  return node;
}
/* ファイルの中身を取得する。数MB以上のものは時間がかかるので、右下の通知に進み具合を出す。 */
async function ensureBlob(node, path, projectId) {
  if (!node || node.t === 'dir' || node.blob) return node;
  const name = String(path).split('/').pop(), big = (node.size || 0) >= 1048576;
  const fetchIt = onProgress => Api.files.raw(projectId, path, onProgress ? { onProgress } : undefined);
  const label = node.size ? `${name} を読み込み中（${kb(node.size)}）` : `${name} を読み込み中`;
  /* 小さいファイルでも、遅ければ（0.35秒を超えたら）通知を出し、受け取った量を進み具合に出す */
  const { blob } = await Task.run({ title: label, icon: 'download', ...(big ? { delay: 0 } : {}) },
    t => fetchIt((got, total) => t.set({ pct: total ? got / total : null, msg: total ? `${kb(got)} / ${kb(total)}` : kb(got) })));
  node.blob = blob;
  if (!node.size) node.size = blob.size;
  return node;
}

/* 初期表示に必要なものをまとめて読む。失敗しても、取れたものだけで画面を出す。 */
async function loadInitial() {
  const tasks = [
    ['projects/list', loadProjects], ['usage/me', loadUsage],
    ['announcements/list', loadAnnouncements], ['notices/list', loadNotices], ['apps/list', loadApps]
  ];
  const results = await Promise.allSettled(tasks.map(([, load]) => load()));
  const failed = results.flatMap((result, index) => result.status === 'rejected'
    ? [{ endpoint: tasks[index][0], error: result.reason }]
    : []);
  if (DATA.user.isAdmin) {
    await Promise.allSettled([
      loadMembers(), loadAdminDevices(), loadAdminLimits(), loadAudit(), loadAdminApps(), loadAdminProjects(),
      loadAdminUsage(), loadAdminAnnouncements(), loadMyDevices()
    ]);
  } else {
    loadMyDevices().catch(() => {});
  }
  return failed;
}

/* 設定の既定値へ戻す（開発用） */
function resetLocalSettings() { try { localStorage.removeItem(settingsKey()); } catch { /* noop */ } DATA.settings = JSON.parse(JSON.stringify(SETTINGS_DEFAULT)); }
