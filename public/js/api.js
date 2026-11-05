/* SPDX-License-Identifier: GPL-3.0-or-later */
/* API クライアント（04_API.md の契約）。
   ・同一オリジンの POST system/api/index.php?r=<名前> に JSON を送る。
   ・GET は files/raw / files/zip だけ（Cookie 認証）。
   ・X-CSRF-Token は me が返す値を付ける。csrf エラーのときだけ、me を取り直して1回やり直す。
   ・自動リトライはしない（locked は「待ってから利用者がもう一度」）。
   ・BE がまだ無い環境でも画面を確認できるよう、dev/fake-api が同じ契約を返す。 */
const Api = (() => {
  class ApiError extends Error {
    constructor(code, status, data) {
      super(code);
      this.name = 'ApiError';
      this.code = code;
      this.status = status || 0;
      this.data = data || {};
    }
  }

  const config = () => window.EDITOR_CONFIG || {};
  const base = () => String(config().apiBase || 'system/api/index.php').trim();
  let csrf = '';
  let meta = null;
  let csrfPending = null;

  const isJson = res => (res.headers.get('content-type') || '').includes('application/json');
  async function readResponse(res) {
    let data = null;
    const text = await res.text();
    if (text) {
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
    }
    if (!res.ok || (data && data.error)) {
      const raw = (data && data.error) || `http_${res.status}`;
      /* Older API handlers only set the HTTP status. Keep one stable error
         code so all callers take the same expiry/permission path. */
      const code = (!data?.error && res.status === 401) || raw === 'http_401' ? 'unauthorized'
        : (!data?.error && res.status === 403) || raw === 'http_403' ? 'forbidden' : raw;
      throw new ApiError(code, res.status, data || {});
    }
    return data == null ? {} : data;
  }

  async function rawCall(name, body, opts = {}) {
    const headers = { Accept: 'application/json', 'X-Requested-With': 'fetch' };
    if (csrf) headers['X-CSRF-Token'] = csrf;
    const init = { method: 'POST', credentials: 'same-origin', headers };
    if (body instanceof FormData) init.body = body;
    else {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body || {});
    }
    if (opts.signal) init.signal = opts.signal;
    const url = base() + '?r=' + encodeURIComponent(name);
    const res = await fetch(url, init);
    return readResponse(res);
  }

  async function refreshCsrf() {
    if (!csrfPending) {
      csrfPending = rawCall('me', {}).then(d => {
        if (d && d.csrf) csrf = d.csrf;
        return d;
      }).finally(() => { csrfPending = null; });
    }
    return csrfPending;
  }

  async function call(name, params = {}, opts = {}) {
    try {
      return await rawCall(name, params, opts);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'csrf' && !opts.retried) {
        await refreshCsrf();
        return call(name, params, { ...opts, retried: true });
      }
      throw e;
    }
  }

  function query(name, params = {}) {
    const q = new URLSearchParams({ r: name });
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null) q.set(k, String(v)); });
    return base() + '?' + q.toString();
  }

  async function getBlob(name, params = {}, opts = {}) {
    const headers = { Accept: '*/*' };
    if (csrf) headers['X-CSRF-Token'] = csrf;
    const res = await fetch(query(name, params), { method: 'GET', credentials: 'same-origin', headers, signal: opts.signal });
    if (!res.ok) {
      let data = {};
      try { data = await res.json(); } catch { /* バイナリ応答の失敗 */ }
      throw new ApiError(data.error || `http_${res.status}`, res.status, data);
    }
    /* 大きいファイルは、受け取った量を onProgress(受け取った, 全体) で知らせる（全体が分からなければ 0） */
    const total = +res.headers.get('content-length') || 0;
    if (opts.onProgress && res.body && res.body.getReader) {
      const reader = res.body.getReader(), parts = []; let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value); got += value.length; opts.onProgress(got, total);
      }
      return { blob: new Blob(parts, { type: res.headers.get('content-type') || '' }), headers: res.headers };
    }
    return { blob: await res.blob(), headers: res.headers };
  }

  /* preview.php は index.php と同じディレクトリにある。 */
  function previewBase() {
    try { return new URL('preview.php', new URL(base(), location.href)).href; }
    catch { return 'system/api/preview.php'; }
  }
  function previewUrl(token, path) {
    const clean = String(path || '').split('/').map(encodeURIComponent).join('/');
    return previewBase().replace(/\/?$/, '/') + encodeURIComponent(token) + '/' + clean;
  }
  function microsoftUrl(mode) {
    /* index.php と同じ system/ の下にある auth/microsoft.php。 */
    const u = new URL('../auth/microsoft.php', new URL(base(), location.href));
    u.searchParams.set('mode', mode || 'direct');
    return u.href;
  }

  const version = async () => {
    const d = await call('meta/version', {});
    meta = d;
    return d;
  };

  const me = async () => {
    const d = await call('me', {});
    if (d && d.csrf) csrf = d.csrf;
    return d;
  };
  const setCsrf = v => { csrf = String(v || ''); };
  const getMeta = () => meta;

  const auth = {
    start: kind => call('auth/start', { kind }),
    poll: (id, pollSecret) => call('auth/poll', { id, poll_secret: pollSecret }),
    lookup: code => call('auth/lookup', { code }),
    approve: code => call('auth/approve', { code }),
    logout: untrust => call('auth/logout', untrust ? { untrust: true } : {}),
    devices: () => call('auth/devices', {}),
    deviceRevoke: id => call('auth/device_revoke', { id }),
    /* 信頼端末の登録は、BE の auth/trust 契約に合わせて label を送る。 */
    trust: label => call('auth/trust', { label })
  };

  const projects = {
    list: () => call('projects/list', {}),
    create: p => call('projects/create', p),
    rename: (id, name) => call('projects/rename', { id, name }),
    remove: (id, deleteApps) => call('projects/delete', { id, delete_apps: !!deleteApps }),
    reorder: (list, ids) => call('projects/reorder', { list, ids }),
    transfer: (id, to) => call('projects/transfer', { id, to })
  };

  const share = {
    list: project => call('share/list', { project }),
    set: (project, member, mode, canPublish) => call('share/set', { project, member, mode, can_publish: !!canPublish }),
    remove: (project, member) => call('share/remove', { project, member })
  };

  const files = {
    tree: project => call('files/tree', { project }),
    read: (project, path) => call('files/read', { project, path }),
    write: (project, path, content, baseVersion) => call('files/write', { project, path, content, base_version: baseVersion }),
    create: (project, path, content) => call('files/create', content === undefined ? { project, path } : { project, path, content }),
    mkdir: (project, path) => call('files/mkdir', { project, path }),
    rename: (project, path, to) => call('files/rename', { project, path, to }),
    remove: (project, path) => call('files/delete', { project, path }),
    uploadInit: (project, dir, name, size, chunks) => call('files/upload_init', { project, path: dir || '', name, size, chunks }),
    uploadChunk: (uploadId, index, data) => call('files/upload_chunk', { upload_id: uploadId, index, data }),
    uploadDone: uploadId => call('files/upload_done', { upload_id: uploadId }),
    raw: (project, path, opts) => getBlob('files/raw', { project, path }, opts),
    rawUrl: (project, path) => query('files/raw', { project, path }),
    previewToken: (project, path) => call('files/preview_token', { project, path }),
    zipPrepare: (project, path) => call('files/zip_prepare', path ? { project, path } : { project }),
    zip: (token, opts) => getBlob('files/zip', { token }, opts),
    search: (project, search, caseSensitive, regex) => call('files/search', { project, query: search, case: !!caseSensitive, regex: !!regex })
  };

  const history = {
    status: project => call('history/status', { project }),
    commit: (project, message) => call('history/commit', { project, message }),
    log: (project, opts = {}) => call('history/log', { project, ...opts }),
    diff: (project, hash, path) => call('history/diff', path === undefined ? { project, hash } : { project, hash, path }),
    restore: (project, hash) => call('history/restore', { project, hash }),
    remove: (project, beforeHash) => call('history/delete', { project, before_hash: beforeHash })
  };

  const apps = {
    checkName: name => call('apps/check_name', { name }),
    list: scope => call('apps/list', scope ? { scope } : {}),
    publish: (name, project, commit, visibility) => call('apps/publish', { name, project, commit, visibility }),
    update: (name, commit) => call('apps/update', { name, commit }),
    setVisibility: (name, visibility) => call('apps/set_visibility', { name, visibility }),
    codeGet: name => call('apps/code_get', { name }),
    codeRegen: name => call('apps/code_regen', { name }),
    viewersList: name => call('apps/viewers_list', { name }),
    viewerAdd: (name, member) => call('apps/viewers_add', { name, member }),
    viewerRemove: (name, member) => call('apps/viewers_remove', { name, member }),
    open: name => call('apps/open', { name }),
    gateVerify: (name, code) => call('apps/gate_verify', { name, code }),
    unpublish: name => call('apps/unpublish', { name })
  };

  const admin = {
    membersList: () => call('admin/members_list', {}),
    membersAdd: member => call('admin/members_add', member),
    membersUpdate: member => call('admin/members_update', member),
    membersImportCsv: csv => call('admin/members_import_csv', { csv }),
    membersDelete: (member, projectActions, appActions) => call('admin/members_delete', { member, projects: projectActions, apps: appActions }),
    devicesList: member => call('admin/devices_list', member ? { member } : {}),
    devicesRevoke: id => call('admin/devices_revoke', { id }),
    settingsGet: () => call('admin/settings_get', {}),
    settingsSet: (key, value) => call('admin/settings_set', { key, value }),
    usage: member => call('admin/usage', member ? { member } : {}),
    projectsList: member => call('admin/projects_list', member ? { member } : {}),
    projectsAssign: (project, to) => call('admin/projects_assign', { project, to }),
    appsList: filter => call('admin/apps_list', filter ? { filter } : {}),
    announcementsList: () => call('admin/announcements_list', {}),
    announcementSave: a => call('admin/announcements_save', a),
    announcementDelete: id => call('admin/announcements_delete', { id }),
    gc: () => call('admin/gc', {}),
    auditList: filter => call('admin/audit_list', filter || {})
  };

  /* 部員の候補検索。契約 04 には一般部員向けの一覧が無いため、
     BE が members/search を実装していれば使い、無ければ分かっている部員から絞る。 */
  async function searchMembers(q) {
    try {
      const d = await call('members/search', { query: q || '' });
      return Array.isArray(d) ? d : (d.members || d.items || []);
    } catch (e) {
      if (!(e instanceof ApiError) || !['not_found', 'invalid', 'http_404'].includes(e.code)) throw e;
      const needle = String(q || '').toLowerCase();
      return (DATA.members || []).filter(m => m.active !== false && (!needle || `${m.name} ${m.id}`.toLowerCase().includes(needle)));
    }
  }

  return {
    ApiError, call, getBlob, query, previewBase, previewUrl, microsoftUrl,
    version, me, setCsrf, getMeta, auth, projects, share, files, history, apps, admin,
    searchMembers,
    get csrf() { return csrf; }
  };
})();
window.Api = Api;
window.ApiError = Api.ApiError;
