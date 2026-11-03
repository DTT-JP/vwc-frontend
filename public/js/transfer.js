/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 転送：アップロード（M08・M15）と、ZIPダウンロード（N04）。画面右下の「転送トレイ」に進捗を出し、ステータスバーの「現在の処理」（Proc）と連動する。
   ・アップロード：files/upload_init → files/upload_chunk（5MBずつ）→ files/upload_done。
     保存・アップロードの前に、管理設定の最大アップロードサイズ（max_upload_mb）を超えていないか確認する。超えたら「ファイルが大きすぎます」で、保存しない。
     ダウンロードには上限をかけない。進捗バーとキャンセルあり（分割アップロードを想定して、5MBずつ送る表示）。
   ・ZIP：サーバーが作る。files/zip_prepare → files/zip（GET）。準備中 → ダウンロード開始 / 失敗 / 大きすぎ。 */
const MB = 1048576;
const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB';
const limitVal = k => { const l = DATA.limits.find(x => x.key === k); return l ? l.value : 0; };
const maxUploadBytes = () => limitVal('max_upload_mb') * MB;
const TOO_BIG = 'ファイルが大きすぎます';

/* ---- 転送トレイ ---- */
const Tray = (() => {
  let el = null, seq = 0; const rows = [];
  const mount = () => { if (el) return el; el = document.createElement('div'); el.id = 'tray'; el.hidden = true; (window.floatStack ? floatStack() : document.body).appendChild(el);
    el.onclick = e => { const x = e.target.closest('[data-tx]'), c = e.target.closest('[data-tc]'); if (x) Tray.remove(+x.dataset.tx); if (c) { const r = rows.find(r => r.id === +c.dataset.tc); r && r.onCancel && r.onCancel(); } }; return el; };
  const paint = () => { mount(); el.hidden = !rows.length;
    el.innerHTML = rows.map(r => `<div class="tr-row ${r.kind}" data-id="${r.id}"><div class="tr-h"><span class="ms">${r.icon}</span><b title="${esc(r.title)}">${esc(r.title)}</b>` +
      (r.state === 'run' && r.onCancel ? `<button data-tc="${r.id}">キャンセル</button>` : r.state !== 'run' ? `<button data-tx="${r.id}" title="閉じる"><span class="ms">close</span></button>` : '') + `</div>` +
      (r.state === 'run' ? `<div class="pgb" role="progressbar" aria-valuenow="${Math.round((r.pct || 0) * 100)}"><i style="width:${Math.round((r.pct || 0) * 100)}%"></i></div>` : '') + `<div class="tr-m">${esc(r.msg || '')}</div></div>`).join(''); };
  return {
    add(o) { const r = { id: ++seq, kind: 'up', icon: 'cloud_upload', state: 'run', pct: 0, msg: '', ...o }; rows.push(r); paint(); return r.id; },
    set(id, o) { const r = rows.find(x => x.id === id); if (r) { Object.assign(r, o); paint(); } },
    remove(id) { const i = rows.findIndex(x => x.id === id); if (i >= 0) rows.splice(i, 1); paint(); },
    rows: () => rows.map(r => ({ ...r })), paint
  };
})();

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

    const job = { cancelled: false }, tid = Tray.add({ title: 'アップロード：' + label, msg: '準備しています…', onCancel: () => { job.cancelled = true; } }), pid = Proc.add('アップロード：' + label, 'upload');
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
            Tray.set(tid, { pct: p, msg: `${name}（${c + 1}/${chunks} 分割）　${kb(sent)} / ${kb(total)}` });
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
      setTimeout(() => Tray.remove(tid), 4000);
    } else {
      Tray.set(tid, { state: 'err', icon: 'error', msg: '保存できませんでした。', pct: 0 });
    }
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
    const pid = Proc.add('ZIPを準備中：' + zipName, 'zip'), tid = Tray.add({ kind: 'zip', icon: 'folder_zip', title: 'ZIP：' + zipName, msg: '準備中…（サーバーで作成しています）', pct: .1 });
    const finish = (state, icon, msg) => { Proc.done(pid); Tray.set(tid, { state, icon, msg, pct: 0 }); };
    try {
      const prep = await Api.files.zipPrepare(projectId, path || '');
      const token = prep.token || prep.zip_token || prep.preview_token || '';
      if (!token) throw new ApiError('invalid', 0, prep);
      Tray.set(tid, { pct: .55, msg: 'ZIPをダウンロードしています…' }); Proc.set(pid, { pct: .55 });
      const { blob } = await Api.files.zip(token);
      finish('ok', 'download_done', `ダウンロードを開始しました（${kb(blob.size)}）`);
      dl(blob, zipName);
      setTimeout(() => Tray.remove(tid), 5000);
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
