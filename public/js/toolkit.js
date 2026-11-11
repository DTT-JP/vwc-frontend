/* SPDX-License-Identifier: GPL-3.0-or-later */
/* ツール登録の仕組み（N02）と、ツール共通部品（N03）。
   新しいツールは Tools.register({...}) で「登録」するだけで、左のツール一覧・入力選択・出力・進捗・エラー・Media が使える。
   ツールごとに別の読み込みを書かない。手順と例は docs/ツール追加ガイド.md。

   登録するもの（5.2）：
     id        ツールの識別子（英数字）
     name      一覧とタブに出す名前
     icon      Material Symbols のアイコン名
     desc      説明（一覧のヒントと、ヘルプ用）
     accepts   受け入れる入力の種類：'image' | 'audio' | 'video'（複数可）
     render()  画面（入力・設定・実行）のHTML文字列を返す。中の部品は Tk.* で作る
     after(pane)    描画のたびに呼ばれる（任意）
     onFile(file)   入力ファイルが選ばれたとき（端末・ドロップ・システムのどれでも同じ形で届く）
     output()       「保存」「ダウンロード」が押されたとき、{ blob, name } を返す（Promise 可）
     media     true のとき、Media が使えない環境（WebAssembly なし）の案内を画面の先頭に出す */
const Tools = (() => {
  const list = [], ST = {}; /* ST: ツールごとの実行状態 { kind: idle|run|ok|err, msg, pct } */
  const KIND = { image: () => 'png jpg jpeg gif webp bmp ico svg avif', audio: () => Media.capsSync().inputs.audio.join(' '), video: () => Media.capsSync().inputs.video.join(' ') };
  const exts = d => { const s = new Set(); d.accepts.forEach(k => (KIND[k] ? KIND[k]() : '').split(' ').forEach(e => e && s.add(e))); return s; };
  const get = id => list.find(t => t.id === id);
  function register(def) {
    const d = { icon: 'build', desc: '', accepts: [], media: false, ...def }; if (!d.id || !d.name || typeof d.render !== 'function') throw new Error('Tools.register: id・name・render が必要です');
    const i = list.findIndex(t => t.id === d.id); i >= 0 ? list[i] = d : list.push(d); renderList(); return d;
  }
  function renderList() { const el = document.getElementById('tools'); if (el) el.innerHTML = list.map(t => `<div class="row" data-tool="${t.id}" title="${esc(t.desc)}">${ico(t.icon)}<span class="nm">${esc(t.name)}</span></div>`).join(''); DATA.tools = list.map(t => ({ id: t.id, name: t.name, icon: t.icon, accepts: t.accepts })); }
  function open(id) { const T = get(id); if (!T) return; openTab(T.name, () => (T.media ? Tk.guide() : '') + T.render(), T.icon, T.after ? p => T.after(p) : undefined); }
  return { list, register, get, open, exts, ST, renderList };
})();

const Tk = (() => {
  /* WebAssembly が使えない環境の案内（N11）。ツールの画面の先頭に出す */
  const guide = () => { const s = Media.supported(); return s.ok ? '' : `<div class="tk-guide" role="alert">${ico('warning')}<div><b>このツールは、いまの環境では変換できません</b><p>${esc(s.message)}</p><p class="dnote">画像リサイズなど、変換エンジンを使わないツールは使えます。</p></div></div>`; };

  /* 入力選択（システムのプロジェクトのファイル / 端末のファイル / ドロップ） */
  function input(id, o = {}) {
    const T = Tools.get(id), ex = [...Tools.exts(T)], acc = T.accepts.includes('image') && T.accepts.length === 1 ? 'image/*' : ex.map(e => '.' + e).concat(T.accepts.includes('video') ? ['video/*'] : [], T.accepts.includes('audio') ? ['audio/*'] : []).join(',');
    return `<div class="tools"><button class="o" data-pick="${id}">${ico('cloud_download')} システムから開く</button></div>` +
      `<label class="drop"><span class="ms">upload_file</span><b>${o.label || 'この端末から選ぶ / ここにドロップ'}</b><span class="tnote">${o.note || '入力：' + ex.slice(0, 14).join('・') + (ex.length > 14 ? ' ほか' : '')}</span><span class="tnote">ファイルはこの端末の中だけで処理され、サーバーには送られません。</span><input type="file" id="tk-file-${id}" accept="${acc}" hidden></label>`;
  }
  /* 出力（システムへ保存 / ダウンロード） */
  const output = id => `<div class="tools"><button class="primary" data-tk="${id}:save" title="システムに上げる">${ico('cloud_upload')} システムに上げる</button><button class="o" data-tk="${id}:dl" title="端末に保存">${ico('download')} ダウンロード</button></div>`;
  /* 実行状態（進捗・中止・結果・エラー）。Tk.set(id, {kind, msg, pct}) で更新すると、開いている画面も更新される */
  const status = id => { const s = Tools.ST[id] || { kind: 'idle' }; return `<div class="tk-st ${s.kind}" id="tk-st-${id}" role="status">${statusInner(s)}</div>`; };
  const statusInner = s => s.kind === 'run' ? `<div class="tk-r"><span class="ms">sync</span><span>${esc(s.msg || '処理中…')}</span><span class="sp"></span><button class="o" data-mcancel>中止</button></div><div class="pgb"><i style="width:${Math.round((s.pct || 0) * 100)}%"></i></div>` :
    s.kind === 'ok' ? `<div class="tk-r ok">${ico('check_circle')}<span>${esc(s.msg || '完了しました')}</span></div>` : s.kind === 'err' ? `<div class="tk-r err">${ico('error')}<span>${esc(s.msg || 'エラーが発生しました')}</span></div>` : '';
  function set(id, s) { Tools.ST[id] = s; const el = document.getElementById('tk-st-' + id); if (el) { el.className = 'tk-st ' + s.kind; el.innerHTML = statusInner(s); } }
  /* Media で実行する共通処理。進捗・中止・失敗の表示を引き受け、成功なら Blob、失敗なら null を返す */
  async function runMedia(id, job, okMsg) {
    set(id, { kind: 'run', msg: job.label || '変換中…', pct: 0 });
    try { const r = await Media.run({ ...job, onProgress: p => set(id, { kind: 'run', msg: job.label || '変換中…', pct: p }) }); set(id, { kind: 'ok', msg: okMsg || '変換できました' }); return r.blob; }
    catch (e) {
      /* エンジンの読み込み失敗は Media の右下共通枠だけに出す。
         それ以外は、操作対象を特定できるツール内状態に残す。 */
      if (e && e.code === 'load') set(id, { kind: 'idle' });
      else set(id, { kind: 'err', msg: e.message || '変換に失敗しました' });
      return null;
    }
  }
  /* 出力の届け先：保存（システムへ。最大アップロードサイズの判定つき）／ダウンロード（上限なし） */
  async function deliver(op, blob, name) {
    if (!blob) return;
    if (op === 'dl') return dl(blob, name);
    if (!(typeof hasProject === 'function' ? hasProject() : !!(S.proj && S.proj.id))) {
      return showToast(typeof NO_PROJECT_MSG === 'string' ? NO_PROJECT_MSG : 'プロジェクトを作成するか、開いてください');
    }
    return uploadToProject(blob, name);
  }
  return { guide, input, output, status, set, runMedia, deliver };
})();

/* 入力・出力の共通の配線。ツールごとに書かなくてよい */
document.addEventListener('change', e => { const m = e.target.id && e.target.id.match(/^tk-file-(.+)$/); if (!m || !e.target.files[0]) return; const T = Tools.get(m[1]); T && T.onFile && T.onFile(e.target.files[0]); e.target.value = ''; });
document.addEventListener('dragover', e => { const d = e.target.closest && e.target.closest('.drop'); if (d) { e.preventDefault(); d.classList.add('over'); } });
document.addEventListener('dragleave', e => e.target.closest && e.target.closest('.drop')?.classList.remove('over'));
document.addEventListener('drop', e => { const d = e.target.closest && e.target.closest('.drop'); if (!d) return; e.preventDefault(); d.classList.remove('over'); const f = e.dataTransfer.files[0], i = d.querySelector('input'), m = i && i.id.match(/^tk-file-(.+)$/); if (f && m) { const T = Tools.get(m[1]); T && T.onFile && T.onFile(f); } });
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-tool]'); if (t && t.closest('#tools')) return Tools.open(t.dataset.tool);
  const k = e.target.closest('[data-tk]'); if (k) { const [id, op] = k.dataset.tk.split(':'), T = Tools.get(id); if (!T || !T.output) return; const o = await T.output(op); if (o && o.blob) Tk.deliver(op, o.blob, o.name); else if (o && o.err) showToast(o.err); }
  if (e.target.closest('[data-mcancel]') && !e.target.closest('#media-box')) Media.cancel();
  const p = e.target.closest('[data-pick]'); if (p) pickFromSystem(p.dataset.pick);
});

/* 入力元：システム（プロジェクト）のファイルから選ぶ */
let pickRows = [], pickTool = '';
function pickFromSystem(id) {
  if (!(typeof hasProject === 'function' ? hasProject() : !!(S.proj && S.proj.id))) {
    return showToast(typeof NO_PROJECT_MSG === 'string' ? NO_PROJECT_MSG : 'プロジェクトを作成するか、開いてください');
  }
  const T = Tools.get(id); if (!T) return; const ok = Tools.exts(T); pickRows = []; pickTool = id;
  (function w(l, p) { l.forEach(f => f.t === 'dir' ? w(f.c, p + f.n + '/') : ok.has(ext(f.n)) && pickRows.push([p + f.n, f])); })(files(), '');
  $('#pick-l').innerHTML = pickRows.map(([p, f], i) => `<div class="row ${f.blob ? '' : 'dim'}" data-pi="${i}">${ico(fileIcon(f.n))}<span class="nm">${esc(p)}</span><span class="dnote">${f.blob ? kb(f.blob.size) : (f.size ? kb(f.size) : '未取得')}</span></div>`).join('')
    || '<div class="dnote">対応するファイルがありません。先にファイルをアップロードするか、ツールの結果を「保存」してください。</div>';
  $('#d-pick').showModal();
}
$('#pick-l').onclick = async e => {
  const r = e.target.closest('[data-pi]'); if (!r) return;
  const [path, f] = pickRows[+r.dataset.pi], T = Tools.get(pickTool);
  if (!T) return;
  const deliver = () => { if (f.blob) T.onFile && T.onFile(new File([f.blob], f.n, { type: f.blob.type || '' })); };
  $('#d-pick').close();
  if (f.blob) return deliver();
  if (!(typeof hasProject === 'function' ? hasProject() : !!(S.proj && S.proj.id))) {
    return showToast(typeof NO_PROJECT_MSG === 'string' ? NO_PROJECT_MSG : 'プロジェクトを作成するか、開いてください');
  }
  if (typeof ensureBlob !== 'function') return showToast('このファイルはサンプルのため、実データがありません');
  try { await ensureBlob(f, path, S.proj.id); }
  catch (err) { return showApiError ? showApiError(err) : showToast('ファイルを読み込めませんでした'); }
  if (!f.blob) return showToast('このファイルはサンプルのため、実データがありません');
  deliver();
};
