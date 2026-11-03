/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Media サービス（N01）と、ステータスバーの「現在の処理」（Proc / N12）。
   ・Media：アプリ全体で1つ。どのツール・画面からも Media.run() で呼べる。初回の呼び出しで ffmpeg.wasm を自動で読み込む（呼び出し側は意識しない）。
   ・同時に動くのは1件。ほかは待ち行列に積み、待ち数を画面に出す。進捗・中止・失敗を共通表示する。
   ・ffmpeg は vendor/ffmpeg/ から配信する（シングルスレッド版）。変換は1件ごとに新しいインスタンスで行う（再利用すると opus で止まることがあったため。
     読み込んだ本体（js と wasm）は Blob URL にして使い回すので、2回目からは通信も再読み込みも無い）。
   ・端末のメモリに収まる範囲だけ。足りなければ「メモリ不足」。
   ・ファイルは端末の外へ出ない。 */

/* ---- 現在の処理（ツール変換・アップロード・ZIP準備） ---- */
const Proc = (() => {
  const items = []; let seq = 0;
  const render = () => {
    const el = document.getElementById('s-proc'); if (!el) return;
    if (!items.length) { el.innerHTML = '<span class="ms">check</span> 待機中'; el.classList.remove('busy'); el.title = ''; return; }
    const a = items[0], pct = a.pct != null ? ` ${Math.round(a.pct * 100)}%` : '';
    el.classList.add('busy'); el.innerHTML = `<span class="ms">sync</span> ${a.label}${pct}` + (items.length > 1 ? `（ほか${items.length - 1}件）` : '');
    el.title = items.map(x => x.label + (x.pct != null ? ' ' + Math.round(x.pct * 100) + '%' : '')).join('\n');
  };
  return {
    add(label, kind) { const it = { id: ++seq, label, kind: kind || 'tool', pct: null }; items.push(it); render(); return it.id; },
    set(id, o) { const it = items.find(x => x.id === id); if (it) { Object.assign(it, o); render(); } },
    done(id) { const i = items.findIndex(x => x.id === id); if (i >= 0) items.splice(i, 1); render(); },
    list: () => items.map(x => ({ ...x })), render
  };
})();

/* ---- Media ---- */
class MediaFail extends Error { constructor(code, message) { super(message); this.code = code; } }
const MEDIA_MSG = {
  nowasm: 'このブラウザでは WebAssembly を使えないため、変換できません。Chrome・Edge・Firefox・Safari の対応版でお試しください。',
  nohttp: 'このページはファイルとして直接開かれているため、変換エンジンを起動できません。HTTP(S) のサーバー経由で開いてください。',
  load: '変換エンジン（ffmpeg）を読み込めませんでした。vendor/ffmpeg/ のファイルを確認して、もう一度お試しください。',
  mem: 'メモリ不足：このファイルは端末のメモリでは処理できません。範囲を短くするか、別の端末で試してください。',
  abort: '変換を中止しました。',
  fmt: '形式非対応：ffmpeg でも読み込めないファイルです。',
  noaudio: '音声トラックがありません。',
  fail: '変換に失敗しました。'
};
const Media = (() => {
  const BASE = 'vendor/ffmpeg/';
  let core = null, loading = null, caps = null, active = null, seq = 0; const queue = [], listeners = [];
  const st = { phase: 'idle', pct: 0, waiting: 0, label: '', error: '' };
  const emit = () => { st.waiting = queue.length; listeners.forEach(f => f({ ...st })); renderBox(); };
  const forced = () => 'normal';

  /* 使えるか（N11）。WebAssembly が無い、または file:// のとき理由を返す */
  function supported() {
    if (typeof WebAssembly !== 'object') return { ok: false, code: 'nowasm', message: MEDIA_MSG.nowasm };
    if (location.protocol === 'file:') return { ok: false, code: 'nohttp', message: MEDIA_MSG.nohttp };
    return { ok: true };
  }

  /* 能力：検証済みの入力・出力形式（vendor/ffmpeg/verified.json）。選択肢の表示に使う */
  async function capabilities() {
    if (caps) return caps;
    const d = { inputs: { audio: ['wav', 'mp3', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'wma', 'aiff'], video: ['mp4', 'webm', 'mkv', 'mov', 'avi', 'wmv'] }, outputs: ['wav', 'mp3', 'flac', 'm4a', 'ogg', 'opus', 'aac'], verified: false };
    if (location.protocol === 'file:') { caps = d; return caps; } /* file:// では fetch できない（変換も動かない）。既定の一覧で表示だけ行う */
    try { const r = await fetch(BASE + 'verified.json'); if (!r.ok) throw 0; const j = await r.json(); caps = { inputs: j.inputs, outputs: j.outputs, verified: true, ffmpeg: j.ffmpeg, license: j.license, verifiedAt: j.verifiedAt }; }
    catch { caps = d; }
    return caps;
  }
  const capsSync = () => caps || { inputs: { audio: ['wav', 'mp3', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'wma', 'aiff'], video: ['mp4', 'webm', 'mkv', 'mov', 'avi', 'wmv'] }, outputs: ['wav', 'mp3', 'flac', 'm4a', 'ogg', 'opus', 'aac'] };

  const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new MediaFail('load', MEDIA_MSG.load)); document.head.appendChild(s); });
  /* 初回：本体（約31MB）を進捗つきで取得して Blob URL にする。2回目以降は取得済みの Blob URL を使う */
  async function ensureCore() {
    const sp = supported(); if (!sp.ok) throw new MediaFail(sp.code, sp.message);
    if (core) return core;
    return loading || (loading = (async () => {
      st.phase = 'loading'; st.pct = 0; emit();
      try {
        if (!window.FFmpegWASM) await loadScript(BASE + 'ffmpeg.js');
        const js = await (await fetch(BASE + 'ffmpeg-core.js')).blob();
        const res = await fetch(BASE + 'ffmpeg-core.wasm'); if (!res.ok) throw 0;
        const total = +res.headers.get('content-length') || 31e6, rd = res.body.getReader(), parts = []; let got = 0;
        for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; st.pct = Math.min(.99, got / total); emit(); }
        core = { coreURL: URL.createObjectURL(new Blob([js], { type: 'text/javascript' })), wasmURL: URL.createObjectURL(new Blob(parts, { type: 'application/wasm' })) };
        return core;
      } catch (e) { loading = null; throw e instanceof MediaFail ? e : new MediaFail('load', MEDIA_MSG.load); }
      finally { st.phase = active ? 'running' : 'idle'; emit(); }
    })());
  }

  /* 1件の実行。inputs=[{name,data(File|Blob|Uint8Array)}]、args(入力名の配列,出力名)→ffmpegの引数、output={name}。戻り値 {blob, log} */
  async function exec(job) {
    const c = await ensureCore(), ff = new FFmpegWASM.FFmpeg(), logs = []; job._ff = ff;
    ff.on('log', ({ message }) => logs.push(message));
    ff.on('progress', ({ progress }) => { if (progress >= 0 && progress <= 1) { st.pct = progress; job.onProgress && job.onProgress(progress); Proc.set(job.proc, { pct: progress }); emit(); } });
    try {
      await ff.load({ coreURL: c.coreURL, wasmURL: c.wasmURL });
      const names = [];
      for (const [i, inp] of job.inputs.entries()) {
        const n = 'in' + i + '.' + ((inp.name.split('.').pop() || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin'); names.push(n);
        const d = inp.data instanceof Uint8Array ? inp.data : new Uint8Array(await inp.data.arrayBuffer()); await ff.writeFile(n, d);
      }
      if (job.cancelled) throw new MediaFail('abort', MEDIA_MSG.abort);
      const out = job.output ? job.output.name : null, code = await ff.exec(['-y', ...job.args(names, out)], job.timeout || 600000);
      if (job.cancelled) throw new MediaFail('abort', MEDIA_MSG.abort);
      const text = logs.join('\n');
      if (job.probe) return { log: text, code };
      if (code !== 0) throw new MediaFail(/does not contain any stream|Stream map .* matches no streams|no audio/i.test(text) ? 'noaudio' : /Invalid data found|could not find codec|Unsupported|moov atom not found/i.test(text) ? 'fmt' : /memory|OOM/i.test(text) ? 'mem' : 'fail', null);
      const data = await ff.readFile(out); return { blob: new Blob([data], { type: job.output.type || 'application/octet-stream' }), log: text };
    } catch (e) {
      if (e instanceof MediaFail) throw e;
      if (job.cancelled || /terminate/i.test(String(e && e.message))) throw new MediaFail('abort', MEDIA_MSG.abort);
      if (e instanceof RangeError || /memory|out of bounds|OOM/i.test(String(e && e.message))) throw new MediaFail('mem', MEDIA_MSG.mem);
      throw new MediaFail('fail', MEDIA_MSG.fail);
    } finally { try { ff.terminate(); } catch (e) { /* 終了済み */ } job._ff = null; }
  }
  const fixMsg = e => { if (!e.message) e.message = MEDIA_MSG[e.code] || MEDIA_MSG.fail; return e; };

  async function pump() {
    if (active || !queue.length) return;
    const job = queue.shift(); active = job; st.phase = 'running'; st.pct = 0; st.label = job.label; emit();
    job.proc = Proc.add(job.label, 'tool'); Proc.set(job.proc, { pct: 0 });
    const fs = forced();
    if (false) setTimeout(() => Media.cancel(job.id), 500);
    let failure = null;
    try { const r = await exec(job); job.resolve(r); } catch (e) {
      failure = fixMsg(e instanceof MediaFail ? e : new MediaFail('fail', null));
      job.reject(failure);
    }
    Proc.done(job.proc); active = null; st.phase = 'idle'; st.pct = 0; st.label = ''; emit();
    /* エンジンの読み込み失敗は、ツールごとに重ねて表示せず共通枠へ集約する。 */
    if (failure && failure.code === 'load') showError(failure.message);
    pump();
  }

  /* 呼び出し：Media.run({ label, inputs, args, output, onProgress }) → Promise<{blob, log}>。失敗は MediaFail（code: nowasm/nohttp/load/mem/abort/fmt/noaudio/fail） */
  function run(job) {
    const sp = supported(); if (!sp.ok) return Promise.reject(new MediaFail(sp.code, sp.message));
    return new Promise((resolve, reject) => { Object.assign(job, { id: ++seq, resolve, reject, label: job.label || '変換' }); queue.push(job); emit(); pump(); });
  }
  /* 中止：実行中なら ffmpeg を止める。待ち行列にいるものは取り除く */
  function cancel(id) {
    /* 引数なしは実行中のジョブを止める。待機中のジョブを先に消すと、
       右下の「中止」が押された対象とツール内の状態がずれる。 */
    if (active && (!id || active.id === id)) {
      active.cancelled = true;
      try { active._ff && active._ff.terminate(); } catch (e) { /* 終了済み */ }
      return;
    }
    const q = queue.findIndex(j => !id || j.id === id);
    if (q >= 0) { const j = queue.splice(q, 1)[0]; j.reject(new MediaFail('abort', MEDIA_MSG.abort)); emit(); }
  }
  /* 中身の調査（長さ・音声の有無・サンプルレート・チャンネル数・ビット深度）。ffmpeg の -i のログを読む */
  async function probe(file) {
    const r = await run({ label: '読み込み中', inputs: [{ name: file.name, data: file }], probe: true, args: n => ['-i', n[0]] }), t = r.log;
    if (/Invalid data found|moov atom not found/i.test(t) && !/Duration/.test(t)) throw new MediaFail('fmt', MEDIA_MSG.fmt);
    const d = t.match(/Duration:\s*(\d+):(\d+):([\d.]+)/), a = t.match(/Stream #\d+:\d+[^:]*: Audio: ([^,\s]+).*?, (\d+) Hz, ([a-z0-9. ()]+?)(?:,|$)/m);
    const ch = a ? (/mono/.test(a[3]) ? 1 : /stereo/.test(a[3]) ? 2 : parseInt(a[3]) || 2) : 0;
    if (!a) throw new MediaFail('noaudio', MEDIA_MSG.noaudio);
    const depth = a[1].match(/(?:s|u)(8|16|24|32)(?:le|be)?$/i) || t.match(/\((8|16|24|32) bit\)/i);
    const lossless = /^(pcm_|flac$|alac$|wavpack$|ape$|tta$)/i.test(a[1]);
    return { dur: d ? (+d[1]) * 3600 + (+d[2]) * 60 + parseFloat(d[3]) : 0, hz: +a[2], ch, codec: a[1], bits: depth ? +depth[1] : 16, lossless, hasVideo: /Stream #\d+:\d+[^:]*: Video:/.test(t) };
  }

  /* 進行表示（画面右下の小さな枠。ツール画面とは別に、どの画面でも見える） */
  let box = null;
  function renderBox() {
    if (!document.body) return; if (!box) { box = document.createElement('div'); box.id = 'media-box'; box.hidden = true; box.setAttribute('role', 'status'); (window.floatStack ? floatStack() : document.body).appendChild(box); box.onclick = e => { if (e.target.closest('[data-mcancel]')) Media.cancel(); if (e.target.closest('[data-mclose]')) { st.phase = 'idle'; st.error = ''; emit(); } }; }
    const busy = st.phase !== 'idle'; box.hidden = !busy; if (!busy) return;
    if (st.phase === 'error') {
      box.innerHTML = `<div class="mb-t"><span class="ms">error</span><b>変換エンジン</b></div><div class="mb-s">${esc(st.error)}</div><button data-mclose>閉じる</button>`;
      return;
    }
    const loadingNow = st.phase === 'loading', pct = Math.round(st.pct * 100);
    box.innerHTML = `<div class="mb-t"><span class="ms">sync</span><b>${loadingNow ? '変換エンジンを読み込み中' : st.label || '変換中'}</b><span class="mb-p">${pct}%</span></div><div class="pgb"><i style="width:${pct}%"></i></div>` +
      `<div class="mb-s">${loadingNow ? '初回だけ時間がかかります（約31MB）。次回からは読み込み済みです。' : ''}${st.waiting ? `待ち ${st.waiting}件` : ''}</div><button data-mcancel>中止</button>`;
  }
  function showError(message) {
    st.phase = 'error'; st.error = message; emit();
    setTimeout(() => { if (st.phase === 'error' && st.error === message) { st.phase = 'idle'; st.error = ''; emit(); } }, 5000);
  }
  return { run, cancel, probe, capabilities, capsSync, supported, state: () => ({ ...st }), on: f => listeners.push(f), showError, MediaFail };
})();
Media.capabilities();
