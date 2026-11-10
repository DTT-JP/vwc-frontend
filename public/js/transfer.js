/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 転送・通知・現在の処理（統合）：
   - 右下の通知パネル（Tray）に、進捗表示・完了/失敗・画面内通知（旧トースト）をすべて集約する。
   - ステータスバーの #s-proc は現在の処理状態を示し、押すと通知パネル（履歴含む）の表示/非表示を切り替える。
   - 終了/閉じた通知は履歴として保持し、履歴からの削除（各項目の×）でメモリからも消す。 */
const MB = 1048576;
const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB';
const limitVal = k => { const l = DATA.limits.find(x => x.key === k); return l ? l.value : 0; };
const maxUploadBytes = () => limitVal('max_upload_mb') * MB;
const TOO_BIG = 'ファイルが大きすぎます';

/* ---- 現在の処理（ステータスバー） ---- */
const Proc = (() => {
  const items = []; let seq = 0; const KIND_ICON = { upload: 'upload', zip: 'folder_zip', tool: 'build', task: 'sync' };
  const render = () => {
    const el = document.getElementById('s-proc'); if (!el) return;
    el.classList.add('proc-btn');
    if (!items.length) {
      el.innerHTML = `<span class="ms">notifications</span><span class="proc-text">通知</span>`;
      el.classList.remove('busy'); el.title = '通知・履歴を表示'; return;
    }
    el.classList.add('busy');
    const first = items[0], icon = first.kind === 'upload' ? 'upload' : (first.icon || KIND_ICON[first.kind] || 'sync');
    if (items.length === 1) {
      const pct = first.pct != null ? ` ${Math.round(first.pct * 100)}%` : '';
      el.innerHTML = `<span class="ms">${esc(icon)}</span><span class="proc-text">${esc(first.label)}${pct}</span>`;
    } else {
      const n = items.filter(x => x.kind === 'upload').length;
      const label = n && n === items.length ? `${n}件をアップロード中` : `${items.length}件の処理を実行中`;
      const ico = n ? 'upload' : 'sync';
      el.innerHTML = `<span class="ms">${esc(ico)}</span><span class="proc-text">${label}</span>`;
    }
    el.title = '通知を表示/非表示（クリック）\n' + items.map(x => x.label + (x.pct != null ? ' ' + Math.round(x.pct * 100) + '%' : '')).join('\n');
  };
  return {
    add(label, kind, icon) { const k = kind || 'tool'; const it = { id: ++seq, label, kind: k, icon: icon || KIND_ICON[k] || 'sync', pct: null }; items.push(it); render(); return it.id; },
    set(id, o) { const it = items.find(x => x.id === id); if (it) { Object.assign(it, o); render(); } },
    done(id) { const i = items.findIndex(x => x.id === id); if (i >= 0) items.splice(i, 1); render(); },
    list: () => items.map(x => ({ ...x })), render
  };
})();

/* ---- 通知トレイ（進捗・通知・履歴を統合） ---- */
const Tray = (() => {
  let el = null, seq = 0; const rows = [], history = []; let panelVisible = true;
  const mount = () => {
    if (el) return el;
    el = document.createElement('div'); el.id = 'tray'; el.hidden = false;
    (window.floatStack ? floatStack() : document.body).appendChild(el);
    el.addEventListener('click', e => {
      const del = e.target.closest('[data-td]');
      const close = e.target.closest('[data-tx]');
      const cancel = e.target.closest('[data-tc]');
      if (del) { Tray.forget(+del.dataset.td); e.stopPropagation(); return; }
      if (close) { Tray.dismiss(+close.dataset.tx); e.stopPropagation(); return; }
      if (cancel) { const r = rows.find(r => r.id === +cancel.dataset.tc) || history.find(r => r.id === +cancel.dataset.tc); r && r.onCancel && r.onCancel(); e.stopPropagation(); return; }
      if (!e.target.closest('button,a,input,select,textarea')) Tray.toggle();
    });
    paint();
    return el;
  };
  const rowHtml = (r, inHistory) => {
    const run = r.state === 'run', known = r.pct != null, pct = Math.round((r.pct || 0) * 100);
    const showPct = run && known && r.kind !== 'notice';
    const showBar = run && r.kind !== 'notice';
    const action = run && r.onCancel
      ? `<button data-tc="${r.id}">キャンセル</button>`
      : inHistory
        ? `<button data-td="${r.id}" title="履歴から消す"><span class="ms">close</span></button>`
        : `<button data-tx="${r.id}" title="閉じる"><span class="ms">close</span></button>`;
    const msg = r.msg || (run ? '' : r.state === 'ok' ? '完了' : r.state === 'err' ? '失敗' : r.state === 'cancel' ? 'キャンセル' : '');
    return `<div class="tr-row ${esc(r.kind || '')} ${run ? 'run' : esc(r.state || '')}" data-id="${r.id}"><div class="tr-h"><span class="ms${run && r.spin ? ' spin' : ''}">${esc(r.icon || 'notifications')}</span><b title="${esc(r.title)}">${esc(r.title)}</b>` +
      (showPct ? `<span class="tr-pct">${pct}%</span>` : '') + action + `</div>` +
      (showBar ? `<div class="pgb${known ? '' : ' ind'}" role="progressbar"${known ? ` aria-valuenow="${pct}"` : ''}><i style="width:${known ? pct : 38}%"></i></div>` : '') +
      `<div class="tr-m" title="${esc(msg)}">${esc(msg)}</div></div>`;
  };
  const paint = () => {
    mount();
    const has = rows.length || history.length;
    el.classList.toggle('is-empty', !has);
    el.classList.toggle('is-hidden', !panelVisible);
    if (!has) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    let html = '';
    if (rows.length) html += `<div class="tr-sec">${rows.map(r => rowHtml(r, false)).join('')}</div>`;
    if (history.length) html += `<div class="tr-sec tr-hist"><div class="tr-cap">履歴</div>${[...history].reverse().map(r => rowHtml(r, true)).join('')}</div>`;
    el.innerHTML = html;
  };
  const toHistory = r => {
    if (!r || r._hist) return;
    r._hist = true; r.state = r.state === 'run' ? 'done' : r.state; r.onCancel = null; r.pct = r.pct == null ? r.pct : 1;
    if (!history.find(x => x.id === r.id)) history.push(r);
    if (history.length > 50) history.splice(0, history.length - 50);
  };
  const scheduleNoticeOut = id => {
    const r = rows.find(x => x.id === id); if (!r || r.kind !== 'notice') return;
    clearTimeout(r._t); r._t = setTimeout(() => { if (rows.find(x => x.id === id)) Tray.dismiss(id); }, r.ms || Math.min(12000, Math.max(2500, String((r.title || '') + (r.msg || '')).length * 130)));
  };
  return {
    add(o) {
      const r = { id: ++seq, kind: 'task', icon: 'sync', state: 'run', pct: null, msg: '', spin: false, title: '', ...o };
      rows.push(r); panelVisible = true; paint(); return r.id;
    },
    notify(o) {
      const r = { id: ++seq, kind: 'notice', icon: 'notifications', state: 'info', pct: null, msg: '', spin: false, title: '', ...o };
      rows.push(r); panelVisible = true; paint(); scheduleNoticeOut(r.id); return r.id;
    },
    set(id, o) {
      const r = rows.find(x => x.id === id) || history.find(x => x.id === id);
      if (r) { Object.assign(r, o); if (o.state && o.state !== 'run') { toHistory(r); } paint(); }
    },
    /* 表示中の項目を閉じる（履歴には残す） */
    dismiss(id) {
      const i = rows.findIndex(x => x.id === id); if (i < 0) return;
      const r = rows.splice(i, 1)[0]; clearTimeout(r._t); toHistory(r); paint();
    },
    /* 互換: close同等。進捗完了などでは履歴へ */
    remove(id) { Tray.dismiss(id); },
    /* 履歴から完全削除（メモリ解放） */
    forget(id) {
      let i = history.findIndex(x => x.id === id);
      if (i >= 0) { history.splice(i, 1); paint(); return; }
      i = rows.findIndex(x => x.id === id);
      if (i >= 0) { const r = rows.splice(i, 1)[0]; clearTimeout(r._t); r.msg = r.title = r.onCancel = null; paint(); }
    },
    toggle(force) { panelVisible = typeof force === 'boolean' ? force : !panelVisible; paint(); },
    show() { panelVisible = true; paint(); },
    hide() { panelVisible = false; paint(); },
    isVisible: () => panelVisible,
    rows: () => rows.map(r => ({ ...r })),
    history: () => history.map(r => ({ ...r })),
    paint
  };
})();

/* 通知を右下トレイへ統合（旧 #toast の代替） */
window.showToast = (m, ms) => {
  if (!m) return;
  try { Tray.notify({ icon: 'notifications', title: String(m), msg: '', ms }); } catch (e) { /* 初期化前フォールバック */ }
};
/* 設定に従う通知（settings.js からも利用） */
window.notify = (k, m) => {
  try { if (DATA && DATA.settings && DATA.settings.notify && !DATA.settings.notify[k]) return; } catch (e) { /* 判定不能なら表示 */ }
  showToast(m);
};
document.addEventListener('DOMContentLoaded', () => { Tray.paint(); Proc.render(); const p = document.getElementById('s-proc'); if (p) p.addEventListener('click', () => Tray.toggle()); });

/* ---- アップロード ---- */
const normalPath = p => String(p || '').replace(/\\/g, '/').split('/').filter(s => s && s !== '.' && s !== '..').join('/');
const dirName = p => p.split('/').slice(0, -1).join('/');
const baseNameOf = p => p.split('/').pop();
const toB64 = bytes => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(out);
};
async function ensureDirs(projectId, dir) {
  if (!dir) return;
  let cur = '';
  for (const part of dir.split('/')) {
    cur = cur ? cur + '/' + part : part;
    try { await Api.files.mkdir(projectId, cur); }
    catch (e) {
      /* 既にあるフォルダへのアップロードは、そのまま続ける。 */
      if (!(e instanceof ApiError) || e.status !== 409) throw e;
    }
  }
}

const Upl = {
  chunkMB: 5, active: [],
  /* items: [{ name, size, file, dir, commit? }]。戻り値：{ done, rejected, cancelled, failed } */
  async start(items, opts = {}) {
    const max = opts.maxBytes !== undefined ? opts.maxBytes : maxUploadBytes(), ok = [], bad = [];
    items.forEach(it => (it.size > max ? bad : ok).push(it));
    if (bad.length) this.reject(bad, max);
    if (!ok.length) return { done: [], rejected: bad, cancelled: false, failed: [] };

    const total = ok.reduce((a, x) => a + x.size, 0), label = ok.length === 1 ? ok[0].name : ok.length + '件のファイル';
    if (quotaLimit() > 0 && usedMB() + total / MB > quotaLimit() && !opts.ignoreQuota) {
      this.rejectQuota(ok, total);
      return { done: [], rejected: ok, cancelled: false, failed: [], quota: true };
    }

    const job = { cancelled: false }, tid = Tray.add({ title: label + 'をアップロード中', msg: '準備しています…', pct: null, spin: true, onCancel: () => { job.cancelled = true; } }), pid = Proc.add(label + 'をアップロード中', 'upload', 'upload');
    this.active.push(job);
    const done = [], failed = []; let sent = 0;
    try {
      for (const it of ok) {
        if (job.cancelled) break;
        const full = normalPath((it.dir ? it.dir + '/' : '') + it.name);
        if (!full) { failed.push({ item: it, error: new ApiError('bad_path', 0) }); continue; }
        const dir = dirName(full), name = baseNameOf(full), chunks = Math.max(1, Math.ceil(it.size / (this.chunkMB * MB)));
        let uploadId = '';
        const baseSent = sent;
        try {
          await ensureDirs(S.proj.id, dir);
          const d = await Api.files.uploadInit(S.proj.id, dir, name, it.size, chunks);
          uploadId = d.upload_id || d.id || '';
          if (!uploadId) throw new ApiError('invalid', 0, d);
          for (let c = 0; c < chunks && !job.cancelled; c++) {
            const start = c * this.chunkMB * MB, end = Math.min(it.size, start + this.chunkMB * MB);
            const bytes = new Uint8Array(await (it.file || new Blob()).slice(start, end).arrayBuffer());
            await Api.files.uploadChunk(uploadId, c, toB64(bytes));
            sent = baseSent + end;
            const p = total ? Math.min(.99, sent / total) : .5;
            Tray.set(tid, { pct: p, spin: false, icon: 'cloud_upload', msg: `${name}（${c + 1}/${chunks} 分割）　${kb(sent)} / ${kb(total)}` });
            Proc.set(pid, { pct: p });
          }
          if (job.cancelled) break;
          const finished = await Api.files.uploadDone(uploadId);
          if (it.commit) await it.commit(finished);
          done.push(it);
        } catch (e) {
          failed.push({ item: it, error: e });
          if (!(e instanceof ApiError) || !['too_large', 'quota'].includes(e.code)) showApiError(e, { silent: true });
        }
      }
    } catch (e) {
      failed.push({ item: null, error: e });
      showApiError(e, { silent: true });
    } finally {
      Proc.done(pid); this.active = this.active.filter(j => j !== job);
    }

    if (job.cancelled) {
      Tray.set(tid, { state: 'cancel', icon: 'cancel', msg: `キャンセルしました（${done.length}/${ok.length}件が保存済み）`, pct: 0 });
      showToast('アップロードをキャンセルしました');
    } else if (failed.length) {
      const code = failed.find(x => x.error instanceof ApiError)?.error?.code;
      const msg = code === 'too_large' ? TOO_BIG : code === 'quota' ? '容量が上限に達しています。' : `${failed.length}件を保存できませんでした。`;
      Tray.set(tid, { state: 'err', icon: 'error', msg, pct: 0 });
      if (code === 'quota') $('#d-cap').showModal(); else showToast(msg);
    } else if (done.length) {
      Tray.set(tid, { state: 'ok', icon: 'cloud_done', msg: `${done.length}件を保存しました（${kb(total)}）` });
      setTimeout(() => Tray.dismiss(tid), 4000);
    } else {
      Tray.set(tid, { state: 'err', icon: 'error', msg: '保存できませんでした。', pct: 0 });
    }
    if (done.length && typeof scheduleUsageRefresh === 'function') scheduleUsageRefresh();
    return { done, rejected: bad, cancelled: job.cancelled, failed };
  },
  reject(bad, max) {
    const d = $('#d-err'); $('#err-t').textContent = TOO_BIG;
    $('#err-m').innerHTML = `最大アップロードサイズ（${+(max / MB).toFixed(1)}MB）を超えているため、保存しませんでした。ダウンロードには上限はありません。<ul>` + bad.map(b => `<li><b>${esc(b.name)}</b>（${kb(b.size)}）</li>`).join('') + '</ul>';
    d.showModal();
  },
  rejectQuota(items, total) {
    const d = $('#d-err'); $('#err-t').textContent = '容量が上限に達しています';
    $('#err-m').innerHTML = `使用量（${usedMB()}MB）に、今回の ${kb(total)} を加えると上限（${quotaLimit()}MB）を超えます。大きいファイルや不要なアプリを整理してください。<ul>` + items.slice(0, 10).map(b => `<li><b>${esc(b.name)}</b>（${kb(b.size)}）</li>`).join('') + '</ul>';
    d.showModal();
  },
  cancelAll() { this.active.forEach(j => j.cancelled = true); }
};

/* ---- 端末へのダウンロード（上限なし） ---- */
function dl(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

/* ---- ZIP ---- */
const ZIP_MAX_MB = () => limitVal('zip_max_mb');
const nodeBytes = f => f.t === 'dir' ? f.c.reduce((a, c) => a + nodeBytes(c), 0) : f.blob ? f.blob.size : f.text !== undefined ? new Blob([f.text]).size : (f.size || 0);
const Zip = {
  /* 準備中 → ダウンロード開始 / 失敗 / 大きすぎ。projectId=プロジェクト、path=フォルダ（空なら全体）、rootName=ZIP内の先頭フォルダ名 */
  async download(zipName, projectId, path, rootName) {
    if (!projectId) { showToast('プロジェクトを選んでください'); return { ok: false, why: 'no_project' }; }
    const pid = Proc.add(zipName + ' のZIPを準備中', 'zip', 'folder_zip'), tid = Tray.add({ kind: 'zip', icon: 'folder_zip', title: zipName + ' のZIPを準備中', msg: 'サーバーで作成しています…', pct: null, spin: true });
    const finish = (state, icon, msg) => { Proc.done(pid); Tray.set(tid, { state, icon, msg, pct: 0 }); };
    try {
      const prep = await Api.files.zipPrepare(projectId, path || '');
      const token = prep.token || prep.zip_token || prep.preview_token || '';
      if (!token) throw new ApiError('invalid', 0, prep);
      Tray.set(tid, { pct: 0, spin: false, title: zipName + ' をダウンロード中', msg: 'ZIPをダウンロードしています…' }); Proc.set(pid, { label: zipName + ' をダウンロード中', pct: 0 });
      const { blob } = await Api.files.zip(token, { onProgress: (n, t) => { if (t) { Tray.set(tid, { pct: n / t, msg: `${kb(n)} / ${kb(t)}` }); Proc.set(pid, { pct: n / t }); } } });
      finish('ok', 'download_done', `ダウンロードを開始しました（${kb(blob.size)}）`);
      dl(blob, zipName);
      setTimeout(() => Tray.dismiss(tid), 5000);
      return { ok: true, blob };
    } catch (e) {
      if (e instanceof ApiError && e.code === 'too_large') {
        const max = e.data && (e.data.total_mb || e.data.size_mb), over = max ? `（このフォルダは ${max}MB）` : '';
        finish('err', 'error', `大きすぎます：ZIPにできるのは ${ZIP_MAX_MB()}MB までです${over}。フォルダを分けるか、ファイルを個別にダウンロードしてください。`);
        return { ok: false, why: 'big' };
      }
      finish('err', 'error', 'ZIPを作成できませんでした。しばらくしてから、もう一度お試しください。');
      showApiError(e, { silent: true });
      return { ok: false, why: 'fail', error: e };
    }
  }
};

/* ---- 待たされる処理の共通表示 ----
   時間のかかる処理は、Task.run で包む。状態バー（右下の「現在の処理」）には、すぐに「何をしているか」を出し、
   ある程度かかったら（既定 0.35 秒）、右下の通知エリアにも、処理の名前と進み具合を出す。
   進み具合が分からない処理は、動いている帯で示す。終わったら、どちらからも消える（失敗は呼び出し側が通知する）。
     await Task.run({ title: 'index.html を開いています', icon: 'description' }, async t => { t.set({ pct: .5, msg: '…' }); … }) */
const Task = (() => {
  async function run(opts, fn) {
    const o = typeof opts === 'string' ? { title: opts } : (opts || {});
    const t = { tid: 0, done: false, state: { pct: o.pct ?? null, msg: o.detail || '' } };
    const proc = Proc.add(o.title || '処理中', o.kind || 'task', o.icon || 'sync');
    const show = () => { if (t.done || t.tid) return; t.tid = Tray.add({ kind: 'task', icon: o.icon || 'sync', spin: t.state.pct == null, title: o.title || '処理中', msg: t.state.msg, pct: t.state.pct, onCancel: o.onCancel }); };
    const timer = o.delay === 0 ? (show(), 0) : setTimeout(show, o.delay ?? 350);
    const api = {
      set(p) {
        Object.assign(t.state, p);
        if (t.tid) Tray.set(t.tid, { pct: t.state.pct, msg: t.state.msg, spin: t.state.pct == null, ...(p.title ? { title: p.title } : {}) });
        Proc.set(proc, { ...(p.title ? { label: p.title } : {}), pct: t.state.pct });
      }
    };
    try { const r = await fn(api); if (t.tid) Tray.set(t.tid, { state: 'ok', msg: t.state.msg || '完了', pct: 1, spin: false }); return r; }
    catch (e) { if (t.tid) Tray.set(t.tid, { state: 'err', msg: (e && e.message) || '失敗', spin: false }); throw e; }
    finally { t.done = true; clearTimeout(timer); Proc.done(proc); if (t.tid) setTimeout(() => Tray.dismiss(t.tid), 2500); }
  }
  return { run };
})();
const busy = (title, icon, fn) => Task.run({ title, icon }, fn);
