/* SPDX-License-Identifier: GPL-3.0-or-later */
/* S11 ローカルツール：画像リサイズ・音声カット・動画から音声。ファイルはこの端末のブラウザ内だけで処理する（サーバーへ送らない）。
   ・登録は toolkit.js の Tools.register()。入力選択・出力・進捗・エラーは共通部品（Tk.*）を使う。
   ・音声・動画の変換は Media サービス（ffmpeg.wasm）。入力は ffmpeg が読める形式すべて、出力は検証済みの7形式（wav / mp3 / flac / m4a / ogg / opus / aac）。
   ・「保存」= システム（開いているプロジェクト）へアップロード（最大アップロードサイズの判定つき）、「ダウンロード」= 端末へ保存（上限なし）。 */
const opt = (arr, v) => arr.map(x => `<option ${x === v ? 'selected' : ''}>${x}</option>`).join('');
const fmtT = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const baseName = n => n.replace(/\.[^.]+$/, '');
/* システム（プロジェクト）へ保存：最大アップロードサイズの判定 → 進捗・キャンセルつきで保存（M08・M15） */
async function uploadToProject(blob, name) {
  if (S.role === 'shared-view' || S.proj.perm === 'view') return showToast('閲覧のみのプロジェクトには保存できません');
  const node = S.sel ? findFile(S.sel) : null, list = node && node.t === 'dir' ? node.c : files(), dir = node && node.t === 'dir' ? S.sel : '';
  let n = uniqName(list, name);
  const r = await Upl.start([{ name: n, size: blob.size, file: blob, dir }]);
  if (r.done.length) { await reloadTree(); notify('save', `${n} をプロジェクトに保存しました（${kb(blob.size)}）`); }
  return r;
}

/* ---- エンコーダ（wav は書き出しの補助。音声の書き出しは Media） ---- */
function encodeWav(chs, sr) {
  const n = chs[0].length, ch = chs.length, buf = new ArrayBuffer(44 + n * ch * 2), v = new DataView(buf), ws = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  ws(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, n * ch * 2, true);
  let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, chs[c][i])); v.setInt16(o, Math.round(s < 0 ? s * 32768 : s * 32767), true); o += 2; }
  return new Blob([buf], { type: 'audio/wav' });
}
function encodeBMP(img) { // 24bit。透明部分は白で合成
  const { width: w, height: h, data } = img, rs = Math.ceil(w * 3 / 4) * 4, size = 54 + rs * h, buf = new ArrayBuffer(size), v = new DataView(buf);
  v.setUint8(0, 66); v.setUint8(1, 77); v.setUint32(2, size, true); v.setUint32(10, 54, true); v.setUint32(14, 40, true); v.setInt32(18, w, true); v.setInt32(22, h, true); v.setUint16(26, 1, true); v.setUint16(28, 24, true); v.setUint32(34, rs * h, true); v.setUint32(38, 2835, true); v.setUint32(42, 2835, true);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, a = data[i + 3] / 255; for (const c of [2, 1, 0]) v.setUint8(o++, Math.round(data[i + c] * a + 255 * (1 - a))); } }
  return new Blob([buf], { type: 'image/bmp' });
}
async function encodeICO(png, w, h) { // PNG埋め込み形式のICO（最大256px）
  const p = new Uint8Array(await png.arrayBuffer()), buf = new ArrayBuffer(22 + p.length), v = new DataView(buf);
  v.setUint16(2, 1, true); v.setUint16(4, 1, true); v.setUint8(6, w >= 256 ? 0 : w); v.setUint8(7, h >= 256 ? 0 : h); v.setUint16(10, 1, true); v.setUint16(12, 32, true); v.setUint32(14, p.length, true); v.setUint32(18, 22, true); new Uint8Array(buf, 22).set(p);
  return new Blob([buf], { type: 'image/x-icon' });
}

/* ================= 画像リサイズ（Canvas） ================= */
const newImg = () => ({ name: '', img: null, ow: 0, oh: 0, w: 0, h: 0, lock: true, fmt: 'jpeg', q: 80, blob: null, err: '', pv: '' });
const TL = { img: newImg() };
const EXT = { jpeg: 'jpg', png: 'png', webp: 'webp', bmp: 'bmp', ico: 'ico' };
function rImg() {
  const i = TL.img;
  if (!i.img) return `<h2>画像リサイズ</h2><p>画像をこの端末で変換します。「保存」でプロジェクトに追加、「ダウンロード」で端末に保存します。</p>` + Tk.input('img', { note: '入力：png・jpeg・webp・gif・bmp・ico・svg など（ブラウザが表示できる形式）' }) + `<div class="err">${i.err}</div>`;
  return `<h2>画像リサイズ</h2><p>${esc(i.name)}（元 ${i.ow}×${i.oh}） <button class="o" data-a="ti-clear">別のファイルを選ぶ</button></p>
  <p>幅 <input id="t-w" type="number" min="1" value="${i.w}" style="width:90px"> 高さ <input id="t-h" type="number" min="1" value="${i.h}" style="width:90px"> <label><input id="t-lock" type="checkbox" ${i.lock ? 'checked' : ''} style="width:auto">縦横比を固定</label></p>
  <p>形式 <select id="t-fmt">${opt(Object.keys(EXT), i.fmt)}</select> 品質 <input id="t-q" type="range" min="10" max="100" value="${i.q}" ${['jpeg', 'webp'].includes(i.fmt) ? '' : 'disabled'}> <span id="t-qv">${i.q}</span></p>
  <div class="err" id="ti-err">${i.err}</div><p>出力サイズ <b id="ti-size">${i.blob ? kb(i.blob.size) : '計算中…'}</b></p>
  <img class="tl-pv" id="ti-pv" alt="プレビュー" ${i.pv ? `src="${i.pv}"` : ''}>` + Tk.output('img');
}
async function setImg(f) {
  const url = URL.createObjectURL(f), im = new Image(); im.src = url;
  try { await im.decode(); } catch { TL.img = Object.assign(newImg(), { err: '読み込めない画像です。別のファイルを選んでください。' }); return renderTabs(); }
  const ow = im.naturalWidth || 512, oh = im.naturalHeight || 512;
  TL.img = Object.assign(newImg(), { name: f.name, img: im, ow, oh, w: ow, h: oh }); renderTabs(); makeImg();
}
let imgT; const scheduleImg = () => { clearTimeout(imgT); imgT = setTimeout(makeImg, 250); };
async function makeImg() {
  const i = TL.img; if (!i.img) return; i.err = ''; i.blob = null;
  if (i.fmt === 'ico' && (i.w > 256 || i.h > 256)) i.err = 'ICOは256×256px以内にしてください。';
  else if (i.w * i.h > 120e6) i.err = 'メモリ不足：画像が大きすぎます。幅と高さを小さくしてください。';
  else try {
    const c = document.createElement('canvas'); c.width = i.w; c.height = i.h; const g = c.getContext('2d'); if (!g) throw new Error('この環境ではCanvasを使えません');
    if (i.fmt === 'jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, i.w, i.h); } g.imageSmoothingQuality = 'high'; g.drawImage(i.img, 0, 0, i.w, i.h);
    if (i.fmt === 'bmp') i.blob = encodeBMP(g.getImageData(0, 0, i.w, i.h));
    else { const mime = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', ico: 'image/png' }[i.fmt], b = await new Promise(r => c.toBlob(r, mime, i.q / 100)); if (!b) throw new Error('書き出しに失敗しました');
      i.blob = i.fmt === 'ico' ? await encodeICO(b, i.w, i.h) : b; if (i.fmt !== 'ico' && b.type !== mime) i.err = `このブラウザは ${i.fmt} の書き出しに未対応です（${b.type} になりました）。`; }
  } catch (e) { i.blob = null; i.err = '変換に失敗しました：' + e.message; }
  const s = $('#ti-size'); if (!s) return; s.textContent = i.blob ? kb(i.blob.size) : '-'; $('#ti-err').textContent = i.err;
  if (i.pv) URL.revokeObjectURL(i.pv); i.pv = i.blob ? URL.createObjectURL(i.blob) : ''; const pv = $('#ti-pv'); if (pv) pv.src = i.pv;
}
$('#bench').addEventListener('input', e => { const id = e.target.id, i = TL.img, v = e.target.value; if (!['t-w', 't-h', 't-lock', 't-q', 't-fmt'].includes(id) || !i.img) return;
  if (id === 't-w' || id === 't-h') { const k = id === 't-w' ? 'w' : 'h'; i[k] = Math.max(1, +v || 1);
    if (i.lock) { k === 'w' ? i.h = Math.max(1, Math.round(i.w * i.oh / i.ow)) : i.w = Math.max(1, Math.round(i.h * i.ow / i.oh)); $('#t-w').value = i.w; $('#t-h').value = i.h; } }
  if (id === 't-lock') i.lock = e.target.checked; if (id === 't-q') { i.q = +v; $('#t-qv').textContent = v; } if (id === 't-fmt') { i.fmt = v; $('#t-q').disabled = !['jpeg', 'webp'].includes(v); }
  i.blob = null; $('#ti-size').textContent = '計算中…'; scheduleImg(); });

/* ================= 音声・動画（Web Audio で波形、ffmpeg で変換） ================= */
let actx; const AC = () => actx || (actx = new (window.AudioContext || window.webkitAudioContext)());
/* 出力形式ごとの品質プリセット（M24） */
const PREN = ['容量削減', '標準', '高音質', '原音忠実', 'カスタム'];
const AOUT = {
  mp3: { n: 'mp3', lossy: true, mime: 'audio/mpeg' },
  m4a: { n: 'm4a（AAC）', lossy: true, mime: 'audio/mp4' },
  aac: { n: 'aac（AAC・ADTS）', lossy: true, mime: 'audio/aac' },
  ogg: { n: 'ogg（Vorbis）', lossy: true, mime: 'audio/ogg' },
  opus: { n: 'opus', lossy: true, mime: 'audio/ogg' },
  wav: { n: 'wav（非圧縮）', lossy: false, mime: 'audio/wav' },
  flac: { n: 'flac（可逆圧縮）', lossy: false, mime: 'audio/flac' }
};
const outFormats = () => ['mp3', 'm4a', 'aac', 'ogg', 'opus', 'wav', 'flac'].filter(f => Media.capsSync().outputs.includes(f));
const PRESET = [
  { sr: 22050, bits: 16, stereo: { mp3: 96, m4a: 80, aac: 80, ogg: 80, opus: 48 }, mono: { mp3: 56, m4a: 48, aac: 48, ogg: 48, opus: 32 }, flac: 8 },
  { sr: 44100, bits: 16, stereo: { mp3: 160, m4a: 128, aac: 128, ogg: 128, opus: 96 }, mono: { mp3: 96, m4a: 80, aac: 80, ogg: 80, opus: 56 }, flac: 5 },
  { sr: 48000, bits: 24, stereo: { mp3: 256, m4a: 192, aac: 192, ogg: 192, opus: 128 }, mono: { mp3: 160, m4a: 112, aac: 112, ogg: 112, opus: 80 }, flac: 8 }
];
const BROWSER_DEC = new Set('wav mp3 m4a aac ogg opus flac mp4 webm'.split(' '));
const audErr = e => ({ size: 'サイズ超過：300MBを超えるファイルは読み込めません。' }[e.message]) || e.message;
const newAud = () => ({ name: '', file: null, buf: null, dur: 0, s: 0, e: 0, fmt: 'mp3', preset: '標準', br: 160, sr: 44100, ch: 2, bits: 16, flacLevel: 5, srcSr: 44100, srcBits: 16, srcCh: 2, err: '', zoom: 1, vs: 0, ph: 0, ro: true, pk: null, rangeMode: false, hz: 0, via: '' });
TL.aud = newAud(); TL.vid = newAud();
/* 入力ファイルを調べて編集用に読み込む。ブラウザが読めればそのまま、読めない形式（wma・aiff・avi など）は Media で wav にしてから読む */
async function setAud(k, f) {
  playStop(false); TL[k] = Object.assign(newAud(), { err: '読み込み中…' }); renderTabs();
  Tk.set(k, { kind: 'run', msg: '読み込み中…', pct: 0 });
  try {
    if (f.size > 300 * 1048576) throw new Error('size');
    if (k === 'vid') { const pr = await Media.probe(f); TL[k] = Object.assign(newAud(), { name: f.name, file: f, dur: +pr.dur.toFixed(1), e: +pr.dur.toFixed(1), hz: pr.hz, srcSr: pr.hz, srcBits: pr.lossless ? pr.bits : 16, srcCh: pr.ch, hasVideo: pr.hasVideo }); Tk.set(k, { kind: 'idle' }); return renderTabs(); }
    const pr = await Media.probe(f);
    let buf = null, via = 'ブラウザ';
    if (BROWSER_DEC.has(ext(f.name))) { try { buf = await AC().decodeAudioData(await f.arrayBuffer()); } catch (e) { if (e instanceof RangeError) throw new Error('メモリ不足：このファイルは端末のメモリでは処理できません。'); buf = null; } }
    if (!buf) { via = 'ffmpeg'; const w = await Media.run({ label: '読み込み用に変換中', inputs: [{ name: f.name, data: f }], output: { name: 'edit.wav', type: 'audio/wav' }, args: (n, o) => ['-i', n[0], '-vn', '-map', '0:a:0', '-ac', '2', '-ar', '44100', '-c:a', 'pcm_s16le', o] }); buf = await AC().decodeAudioData(await w.blob.arrayBuffer()); }
    TL[k] = Object.assign(newAud(), { name: f.name, file: f, buf, via, dur: +buf.duration.toFixed(1), e: +buf.duration.toFixed(1), pk: peakPyramid(buf), srcSr: pr.hz, srcBits: pr.lossless ? pr.bits : 16, srcCh: pr.ch });
    Tk.set(k, { kind: 'idle' });
  } catch (e) {
    TL[k] = Object.assign(newAud(), { err: e instanceof Media.MediaFail ? e.message : audErr(e) });
    Tk.set(k, e && e.code === 'load' ? { kind: 'idle' } : { kind: 'err', msg: TL[k].err });
    if (e && e.code !== 'load' && (e.message === 'size' || e.code === 'mem' || /メモリ不足/.test(TL[k].err))) Media.showError(TL[k].err);
  }
  renderTabs();
}
const outOpts = a => outFormats().map(f => `<option value="${f}" ${a.fmt === f ? 'selected' : ''} ${fidelityInfo(a) && AOUT[f].lossy ? 'disabled' : ''}>${AOUT[f].n}</option>`).join('');
const WARNT = 'この形式は非圧縮ではありません。原音を保つには wav か flac を選んでください。';
const fidelityInfo = a => a.preset === '原音忠実';
const warnOf = (p, a) => `<div class="tnote" id="${p}-warn" ${fidelityInfo(a) ? '' : 'hidden'}>${WARNT}</div>`;
const estOf = (a, s, e) => { const o = AOUT[a.fmt], d = e - s; if (!o.lossy) { const w = (a.sr || 44100) * (a.ch || 2) * (presetBits(a) / 8) * d; return a.fmt === 'wav' ? w : w * .6; } return a.br * 125 * d; };
const presetBits = a => a.preset === '原音忠実' ? (a.fmt === 'flac' ? Math.min(a.srcBits || 16, 24) : a.srcBits || 16) : a.bits || 16;
const closestRate = (rate, choices) => choices.reduce((best, n) => Math.abs(n - rate) < Math.abs(best - rate) ? n : best, choices[0]);
const sampleRateFor = a => a.fmt === 'opus' ? closestRate(a.sr || 44100, [8000, 12000, 16000, 24000, 48000]) : a.sr || 44100;
const presetRate = a => {
  const i = PREN.indexOf(a.preset), item = PRESET[i];
  if (!item) return a.br;
  return item[a.ch === 1 ? 'mono' : 'stereo'][a.fmt] || a.br;
};
function setPreset(a, p) {
  a.preset = p;
  if (p === 'カスタム') { if (a.fmt === 'opus') a.sr = sampleRateFor(a); return; }
  if (p === '原音忠実') {
    if (AOUT[a.fmt].lossy) { a.fmt = 'flac'; showToast('原音忠実では wav / flac のみ選べるため、flac に切り替えました'); }
    a.sr = a.srcSr || 44100; a.bits = a.fmt === 'flac' ? Math.min(a.srcBits || 16, 24) : a.srcBits || 16;
    return;
  }
  const preset = PRESET[PREN.indexOf(p)];
  if (!preset) return;
  a.sr = preset.sr; a.bits = preset.bits; a.flacLevel = preset.flac;
  if (AOUT[a.fmt].lossy) a.br = presetRate(a);
}
/* ffmpeg に渡す引数（-i より前 / 後）。切り出しは入力側の -ss/-t（再エンコードでも位置が正確） */
function audioArgs(a, s, e) {
  const o = AOUT[a.fmt], pre = [], post = ['-vn', '-map', '0:a:0', '-ac', String(a.ch || 2)];
  if (s > 0 || e < a.dur - .05) pre.push('-ss', String(s), '-t', String(+(e - s).toFixed(3)));
  post.push('-ar', String(sampleRateFor(a)));
  const k = a.br + 'k';
  if (a.fmt === 'wav') post.push('-c:a', presetBits(a) === 32 ? 'pcm_s32le' : presetBits(a) === 24 ? 'pcm_s24le' : 'pcm_s16le');
  else if (a.fmt === 'flac') post.push('-c:a', 'flac', '-compression_level', String(a.flacLevel), ...(presetBits(a) === 24 ? ['-sample_fmt', 's32', '-bits_per_raw_sample', '24'] : ['-sample_fmt', 's16']));
  else if (a.fmt === 'mp3') post.push('-c:a', 'libmp3lame', '-b:a', k);
  else if (a.fmt === 'm4a' || a.fmt === 'aac') post.push('-c:a', 'aac', '-b:a', k);
  else if (a.fmt === 'ogg') post.push('-c:a', 'libvorbis', '-q:a', String(a.br <= 64 ? 1 : a.br <= 128 ? 4 : a.br <= 192 ? 6 : 8));
  else if (a.fmt === 'opus') post.push('-c:a', 'libopus', '-b:a', k, '-compression_level', '3');
  return { pre, post };
}
function channelOptions(prefix, a) {
  const b = (n, label) => `<button type="button" role="radio" aria-checked="${a.ch === n}" data-a-ch="${prefix}:${n}" class="${a.ch === n ? 'on' : ''}">${label}</button>`;
  return `<div class="aud-ch" role="radiogroup" aria-label="チャンネル"><span>チャンネル</span><span class="aud-seg">${b(2, 'ステレオ')}${b(1, 'モノラル')}</span></div>`;
}
function customSettings(prefix, a) {
  if (a.preset !== 'カスタム') return '';
  const rates = a.fmt === 'opus' ? [8000, 12000, 16000, 24000, 48000] : [22050, 24000, 32000, 44100, 48000, 88200, 96000];
  if (!rates.includes(a.sr)) rates.push(a.sr);
  const bits = a.fmt === 'flac' ? [16, 24] : [16, 24, 32];
  return `<div class="dsc"><button type="button" class="dsc-h" aria-expanded="true">詳細設定<span class="ms">keyboard_arrow_down</span></button><div class="dsc-b">
    ${AOUT[a.fmt].lossy ? `<label>ビットレート <input id="${prefix}-br" type="number" min="32" max="512" value="${a.br}" style="width:88px"> kbps</label>` : `<label>ビット深度 <select id="${prefix}-bits">${bits.map(n => `<option value="${n}" ${a.bits === n ? 'selected' : ''}>${n}bit</option>`).join('')}</select></label>`}
    <label>サンプリングレート <select id="${prefix}-sr">${rates.map(n => `<option value="${n}" ${a.sr === n ? 'selected' : ''}>${n >= 1000 ? (n / 1000) + 'kHz' : n + 'Hz'}</option>`).join('')}</select></label>
    ${a.fmt === 'flac' ? `<label>圧縮レベル <select id="${prefix}-flac">${Array.from({ length: 13 }, (_, n) => n).map(n => `<option value="${n}" ${a.flacLevel === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>` : ''}
  </div></div>`;
}
function audioOutput(prefix, a) {
  return `<div class="aud-output"><label>出力形式 <select id="${prefix}-fmt">${outOpts(a)}</select></label>${channelOptions(prefix, a)}<label>品質 <select id="${prefix}-pre">${opt(PREN, a.preset)}</select></label><span class="tnote" id="${prefix}-preinfo">${preInfo(a)}</span></div>${warnOf(prefix, a)}${customSettings(prefix, a)}`;
}
function rAud() {
  const a = TL.aud;
  if (!a.buf) return `<h2>音声カット</h2>` + Tk.input('aud', { note: '入力：ffmpeg が読める形式すべて（mp3・wav・m4a・aac・ogg・opus・flac・wma・aiff など）。動画ファイルの音声も使えます' }) + Tk.status('aud') + (a.err && !a.err.startsWith('読み込み中') ? `<div class="err" id="ta-err">${esc(a.err)}</div>` : '');
  return `<h2>音声カット</h2><p>${esc(a.name)}（${mmss(a.dur)}） <button class="o" data-a="ta-clear">別のファイルを選ぶ</button></p><div class="err" id="ta-err">${esc(a.err)}</div>
  <div class="track">
    <div class="tr-head">${ico('graphic_eq')}<b>トラック1</b><button class="o" id="ta-rangebtn" data-a="ta-range" title="押してから波形をドラッグすると、その範囲を切り出し範囲にします">${ico('select_all')}範囲指定</button><span id="ta-hint" class="tnote" style="padding:0"></span><span class="sp"></span><span class="tnote" style="padding:0">拡大</span>
      <button data-a="ta-zout" title="縮小">${ico('zoom_out')}</button><b id="ta-zl">×1</b><button data-a="ta-zin" title="拡大">${ico('zoom_in')}</button><button data-a="ta-fit" title="全体を表示">${ico('fit_screen')}</button></div>
    <div class="wv" id="ta-wv"><canvas id="ta-cv"></canvas><div class="dim l" id="ta-dl"></div><div class="dim r" id="ta-dr"></div>
      <div class="hd s" id="ta-hs" title="はじめ（ドラッグ）"></div><div class="hd e" id="ta-he" title="おわり（ドラッグ）"></div><div class="ph" id="ta-ph" title="再生位置"><i></i></div></div>
    <div class="transport"><button data-a="ta-gfirst" title="全体の最初へ">${ico('first_page')}</button><button data-a="ta-first" title="選択範囲の最初へ">${ico('skip_previous')}</button><button data-a="ta-back" title="10秒戻る">${ico('replay_10')}</button>
      <button class="primary round" id="ta-play" data-a="ta-play" title="再生">${ico('play_arrow')}</button>
      <button data-a="ta-fwd" title="10秒進む">${ico('forward_10')}</button><button data-a="ta-last" title="選択範囲の最後へ">${ico('skip_next')}</button><button data-a="ta-glast" title="全体の最後へ">${ico('last_page')}</button>
      <b id="ta-time" style="margin-left:8px">0:00.0 / ${mmss(a.dur)}</b><span class="sp"></span><label class="tgl"><input type="checkbox" id="ta-ro" ${a.ro ? 'checked' : ''}><span>選択範囲だけ再生</span></label></div>
    <div class="tr-sel">${ico('content_cut')}<span id="ta-info"></span><span class="sp"></span>
      <label>開始 <input id="ta-sn" type="number" step="0.1" min="0" max="${a.dur}" value="${a.s.toFixed(1)}" style="width:84px"></label><label>終了 <input id="ta-en" type="number" step="0.1" min="0" max="${a.dur}" value="${a.e.toFixed(1)}" style="width:84px"></label></div>
  </div>
  ${audioOutput('ta', a)}
  <p>推定出力サイズ <b id="ta-est">${kb(estOf(a, a.s, a.e))}</b></p>${Tk.status('aud')}` + Tk.output('aud');
}
const preInfo = a => AOUT[a.fmt].lossy ? `${a.br}kbps` : `${presetBits(a)}bit`;
function rVid() {
  const v = TL.vid;
  if (!v.file || !v.dur) return `<h2>動画から音声を取り出す</h2>` + Tk.input('vid', { note: '入力：ffmpeg が読める動画（mp4・webm・mkv・mov・avi・wmv など）。音声ファイルも使えます' }) + Tk.status('vid') + (v.err && !v.err.startsWith('読み込み中') ? `<div class="err" id="tv-err">${esc(v.err)}</div>` : '');
  return `<h2>動画から音声を取り出す</h2><p>${esc(v.name)}（${fmtT(v.dur)}・${v.srcCh}ch・${v.hz}Hz） <button class="o" data-a="tv-clear">別のファイルを選ぶ</button></p><div class="err" id="tv-err">${esc(v.err)}</div>
  ${audioOutput('tv', v)}
  <p>推定出力サイズ <b id="tv-est">${kb(estOf(v, 0, v.dur))}</b></p>${Tk.status('vid')}` + Tk.output('vid');
}
/* ---- 波形エディター（1トラック）：波形・はじめ/おわりのつまみ・再生位置・ズーム ---- */
function peakPyramid(buf, bin = 256) { // 拡大・縮小しても速く描けるよう、256サンプルごとの最小・最大を先に作る
  const n = Math.ceil(buf.length / bin), mn = new Float32Array(n), mx = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let b = 0; b < n; b++) { let lo = 1, hi = -1; const e = Math.min(d.length, (b + 1) * bin); for (let i = b * bin; i < e; i++) { const v = d[i]; if (v < lo) lo = v; if (v > hi) hi = v; } if (c === 0 || lo < mn[b]) mn[b] = lo; if (c === 0 || hi > mx[b]) mx[b] = hi; } }
  return { bin, mn, mx };
}
const mmss = s => { s = Math.max(0, s); const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function drawWave() {
  const a = TL.aud, cv = $('#ta-cv'); if (!cv || !a.buf || !a.pk) return;
  const dpr = window.devicePixelRatio || 1, W = Math.max(50, cv.clientWidth), H = cv.clientHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const g = cv.getContext('2d'); if (!g) return; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const cs = getComputedStyle(cv), fg = cs.getPropertyValue('--fg-dim').trim() || '#888', ac = cs.getPropertyValue('--accent').trim() || '#08f', bd = cs.getPropertyValue('--border').trim() || '#444';
  const vis = a.dur / a.zoom, t0 = a.vs, sr = a.buf.sampleRate, d0 = a.buf.getChannelData(0), RH = 22, hh = H - RH, mid = RH + hh / 2, P = a.pk;
  const step = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find(s => s / vis * W >= 84) || 600; // ルーラー（時間の目盛り）
  g.font = '12px system-ui,sans-serif'; g.textBaseline = 'middle'; g.fillStyle = fg; g.strokeStyle = bd; g.lineWidth = 1;
  for (let t = Math.ceil(t0 / step) * step; t <= t0 + vis + 1e-9; t += step) { const x = Math.round((t - t0) / vis * W) + .5; g.beginPath(); g.moveTo(x, RH - 8); g.lineTo(x, RH); g.stroke(); g.fillText(mmss(t), x + 4, RH / 2 - 1); }
  g.beginPath(); g.moveTo(0, RH + .5); g.lineTo(W, RH + .5); g.moveTo(0, Math.round(mid) + .5); g.lineTo(W, Math.round(mid) + .5); g.stroke();
  g.fillStyle = ac;
  for (let x = 0; x < W; x++) { const s0 = Math.floor((t0 + x / W * vis) * sr), s1 = Math.max(s0 + 1, Math.floor((t0 + (x + 1) / W * vis) * sr)); let lo = 0, hi = 0;
    if (s1 - s0 >= P.bin * 2) { for (let b = Math.floor(s0 / P.bin); b <= Math.min(P.mn.length - 1, Math.floor(s1 / P.bin)); b++) { if (P.mn[b] < lo) lo = P.mn[b]; if (P.mx[b] > hi) hi = P.mx[b]; } }
    else for (let i = s0; i < Math.min(d0.length, s1); i++) { const v = d0[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    const y1 = mid - hi * hh / 2, y2 = mid - lo * hh / 2; g.fillRect(x, y1, 1, Math.max(1, y2 - y1)); }
}
function layoutWave() { // 範囲の外を暗くし、つまみ・再生位置の線を置く
  const a = TL.aud, wv = $('#ta-wv'); if (!wv || !a.buf) return; const W = wv.clientWidth, vis = a.dur / a.zoom, pos = t => (t - a.vs) / vis * W, xs = pos(a.s), xe = pos(a.e), xp = pos(a.ph);
  $('#ta-dl').style.width = clampN(xs, 0, W) + 'px'; $('#ta-dr').style.width = clampN(W - xe, 0, W) + 'px';
  const put = (id, x) => { const e = $('#' + id); e.style.left = x + 'px'; e.hidden = x < -14 || x > W + 14; }; put('ta-hs', xs); put('ta-he', xe); put('ta-ph', xp);
  $('#ta-time').textContent = `${mmss(a.ph)} / ${mmss(a.dur)}`; $('#ta-zl').textContent = '×' + (a.zoom < 10 ? +a.zoom.toFixed(1) : Math.round(a.zoom));
  $('#ta-info').textContent = `範囲 ${mmss(a.s)} – ${mmss(a.e)}（${(a.e - a.s).toFixed(1)}秒）`;
  [['ta-sn', a.s], ['ta-en', a.e]].forEach(([id, v]) => { const e = $('#' + id); if (e && document.activeElement !== e) e.value = v.toFixed(1); }); $('#ta-est').textContent = kb(estOf(a, a.s, a.e));
}
function zoomBy(f, anchor) { const a = TL.aud, vOld = a.dur / a.zoom; a.zoom = clampN(a.zoom * f, 1, 64); const vNew = a.dur / a.zoom, fx = (anchor - a.vs) / vOld; a.vs = clampN(anchor - fx * vNew, 0, a.dur - vNew); drawWave(); layoutWave(); }
const visAnchor = a => a.ph >= a.vs && a.ph <= a.vs + a.dur / a.zoom ? a.ph : a.vs + a.dur / a.zoom / 2;
function showPlayhead() { const a = TL.aud, vis = a.dur / a.zoom; if (a.zoom > 1 && (a.ph < a.vs || a.ph > a.vs + vis)) { a.vs = clampN(a.ph - vis * .1, 0, a.dur - vis); drawWave(); } }
function bindWave(pane) { // つまみ・再生位置のドラッグ、波形のクリック（再生位置）、拡大中のドラッグ（移動）、ホイール（Ctrl+ホイールで拡大）
  const wv = $('#ta-wv', pane); if (!wv) return; const a = TL.aud; let drag = null;
  const tAt = x => a.vs + x / wv.clientWidth * (a.dur / a.zoom);
  wv.addEventListener('pointerdown', e => { const k = e.target.closest('.hd,.ph'); wv.setPointerCapture && wv.setPointerCapture(e.pointerId);
    if (!k && a.rangeMode) { const left = wv.getBoundingClientRect().left; drag = { kind: 'range', anchor: clampN(tAt(e.clientX - left), 0, a.dur), left, x0: e.clientX, moved: false }; e.preventDefault(); return; }
    drag = { kind: k ? (k.classList.contains('ph') ? 'ph' : k.classList.contains('s') ? 's' : 'e') : 'bg', x0: e.clientX, vs0: a.vs, moved: false, left: wv.getBoundingClientRect().left, was: false };
    if (drag.kind === 'ph' && play) { drag.was = true; playStop(false); } e.preventDefault(); });
  wv.addEventListener('pointermove', e => { if (!drag) return; const t = clampN(tAt(e.clientX - drag.left), 0, a.dur);
    if (drag.kind === 's') a.s = clampN(t, 0, a.e - .05); else if (drag.kind === 'e') a.e = clampN(t, a.s + .05, a.dur); else if (drag.kind === 'ph') a.ph = t;
    else if (drag.kind === 'range') { a.s = Math.min(drag.anchor, t); a.e = Math.max(drag.anchor, t); if (a.e - a.s < .05) a.e = Math.min(a.dur, a.s + .05); a.blob = null; }
    else { if (Math.abs(e.clientX - drag.x0) > 4) drag.moved = true; if (drag.moved && a.zoom > 1) { const vis = a.dur / a.zoom; a.vs = clampN(drag.vs0 - (e.clientX - drag.x0) / wv.clientWidth * vis, 0, a.dur - vis); drawWave(); } }
    if (drag.kind === 's' || drag.kind === 'e') a.blob = null; layoutWave(); });
  wv.addEventListener('pointerup', e => { if (!drag) return; const d = drag; drag = null;
    if (d.kind === 'range') { a.rangeMode = false; rangeUi(); layoutWave(); return; }
    if (d.kind === 'bg' && !d.moved) { const was = !!play; if (was) playStop(false); a.ph = clampN(tAt(e.clientX - d.left), 0, a.dur); layoutWave(); if (was) playStart(); } else if (d.was) playStart(); });
  wv.addEventListener('pointercancel', () => { drag = null; });
  wv.addEventListener('wheel', e => { e.preventDefault(); if (e.ctrlKey || e.metaKey) zoomBy(e.deltaY < 0 ? 1.4 : 1 / 1.4, tAt(e.clientX - wv.getBoundingClientRect().left));
    else if (a.zoom > 1) { const vis = a.dur / a.zoom; a.vs = clampN(a.vs + (e.deltaY + e.deltaX) / wv.clientWidth * vis * .5, 0, a.dur - vis); drawWave(); layoutWave(); } }, { passive: false });
  if (window.ResizeObserver) new ResizeObserver(() => { drawWave(); layoutWave(); }).observe(wv);
}
function rangeUi() { const a = TL.aud, b = $('#ta-rangebtn'), wv = $('#ta-wv'); if (b) b.classList.toggle('on', a.rangeMode); if (wv) wv.classList.toggle('arm', a.rangeMode); const hnt = $('#ta-hint'); if (hnt) hnt.textContent = a.rangeMode ? '波形をドラッグして、切り出す範囲を決めてください' : ''; }
function afterAud(pane) { drawWave(); layoutWave(); bindWave(pane); playIcon(); rangeUi(); }
/* 再生：再生位置から、トラックの最後（または選択範囲の終わり）まで */
let play = null, raf = 0;
function playIcon() { const b = $('#ta-play'); if (b) { b.innerHTML = ico(play ? 'pause' : 'play_arrow'); b.title = play ? '一時停止' : '再生'; } }
function playStop(keep) { if (!play) return; const p = play; play = null; p.src.onended = null; try { p.src.stop(); } catch (e) { /* 停止済み */ } cancelAnimationFrame(raf); if (keep) TL.aud.ph = Math.min(p.to, p.from + (AC().currentTime - p.t0)); playIcon(); }
function playStart() {
  const a = TL.aud; AC().resume(); playStop(false); let from = a.ph, to = a.dur;
  if (a.ro) { to = a.e; if (from < a.s || from >= a.e - .02) from = a.s; } else if (from >= a.dur - .02) from = 0;
  const src = AC().createBufferSource(); src.buffer = a.buf; src.connect(AC().destination); play = { src, from, to, t0: AC().currentTime }; src.start(0, from, to - from);
  src.onended = () => { if (play && play.src === src) { a.ph = to; play = null; playIcon(); layoutWave(); } };
  playIcon(); const f = () => { if (!play) return; a.ph = Math.min(play.to, play.from + (AC().currentTime - play.t0)); showPlayhead(); layoutWave(); raf = requestAnimationFrame(f); }; raf = requestAnimationFrame(f);
}
const AUDCTL = new Set(['play', 'gfirst', 'first', 'last', 'glast', 'back', 'fwd', 'zin', 'zout', 'fit', 'range']);
function audCtl(op) {
  const a = TL.aud; if (!a.buf) return;
  if (op === 'range') { a.rangeMode = !a.rangeMode; rangeUi(); return; }
  if (op === 'play') { play ? playStop(true) : playStart(); layoutWave(); return; }
  if (op === 'zin') return zoomBy(1.6, visAnchor(a)); if (op === 'zout') return zoomBy(1 / 1.6, visAnchor(a)); if (op === 'fit') { a.zoom = 1; a.vs = 0; drawWave(); layoutWave(); return; }
  const was = !!play; if (play) playStop(true); a.ph = op === 'gfirst' ? 0 : op === 'glast' ? a.dur : op === 'first' ? a.s : op === 'last' ? a.e : clampN(a.ph + (op === 'back' ? -10 : 10), 0, a.dur);
  showPlayhead(); layoutWave(); if (was && a.ph < a.dur - .02) playStart();
}
function refreshOut(p, a) { /* 出力設定の変更を画面に反映（作り直さず、必要な部分だけ） */
  const w = $('#' + p + '-warn'); if (w) w.hidden = !fidelityInfo(a); const pi = $('#' + p + '-preinfo'); if (pi) pi.textContent = preInfo(a);
  const fmt = $('#' + p + '-fmt'); if (fmt) { fmt.innerHTML = outOpts(a); fmt.value = a.fmt; }
  const details = fmt?.closest('.adm')?.querySelector('.dsc'); if (details) details.hidden = a.preset !== 'カスタム';
  const br = $('#' + p + '-br'); if (br) br.value = a.br;
  const sr = $('#' + p + '-sr'); if (sr) sr.value = a.sr;
  const bits = $('#' + p + '-bits'); if (bits) bits.value = a.bits;
  const flac = $('#' + p + '-flac'); if (flac) flac.value = a.flacLevel;
  const est = $('#' + p + '-est'); if (est) est.textContent = kb(p === 'ta' ? estOf(a, a.s, a.e) : estOf(a, 0, a.dur));
}
$('#bench').addEventListener('input', e => { const id = e.target.id, v = e.target.value, a = TL.aud, w = TL.vid;
  if (id.startsWith('ta-') && a.buf) {
    if (id === 'ta-sn') a.s = clampN(+v || 0, 0, a.e - .05); if (id === 'ta-en') a.e = clampN(+v || 0, a.s + .05, a.dur); if (id === 'ta-ro') a.ro = e.target.checked;
    if (id === 'ta-fmt') { a.fmt = v; setPreset(a, a.preset); renderTabs(); return; }
    if (id === 'ta-pre') { setPreset(a, v); renderTabs(); return; }
    if (id === 'ta-br') a.br = Math.max(32, +v || 96); if (id === 'ta-sr') a.sr = +v; if (id === 'ta-bits') a.bits = +v; if (id === 'ta-flac') a.flacLevel = +v;
    refreshOut('ta', a); layoutWave(); }
  if (id.startsWith('tv-') && w.dur) {
    if (id === 'tv-fmt') { w.fmt = v; setPreset(w, w.preset); renderTabs(); return; }
    if (id === 'tv-pre') { setPreset(w, v); renderTabs(); return; }
    if (id === 'tv-br') w.br = Math.max(32, +v || 96); if (id === 'tv-sr') w.sr = +v; if (id === 'tv-bits') w.bits = +v; if (id === 'tv-flac') w.flacLevel = +v;
    refreshOut('tv', w); }
});
$('#bench').addEventListener('click', e => {
  const b = e.target.closest('[data-a-ch]'); if (!b) return;
  const [key, count] = b.dataset.aCh.split(':'), a = TL[key === 'ta' ? 'aud' : 'vid'];
  a.ch = +count;
  if (AOUT[a.fmt].lossy && PRESET[PREN.indexOf(a.preset)]) a.br = presetRate(a);
  renderTabs();
});
/* 変換して Blob を返す（保存・ダウンロード共通）。Media が使えない環境でも、wav だけはブラウザ内で書き出せる */
async function buildAudio(k) {
  const a = TL[k], s = k === 'aud' ? a.s : 0, e = k === 'aud' ? a.e : a.dur, st = Media.supported();
  if (!st.ok && a.fmt === 'wav' && a.buf && presetBits(a) === 16) { const chs = await renderRange(a.buf, s, e, a.sr || 44100, a.ch || 2); const b = encodeWav(chs, a.sr || 44100); Tk.set(k, { kind: 'ok', msg: '変換できました（この環境ではブラウザ内で wav に書き出しました）' }); return b; }
  const ar = audioArgs(a, s, e), out = 'out.' + a.fmt;
  return Tk.runMedia(k, { label: `${AOUT[a.fmt].n} に変換中`, inputs: [{ name: a.name, data: a.file }], output: { name: out, type: AOUT[a.fmt].mime }, args: (n, o) => [...ar.pre, '-i', n[0], ...ar.post, o] }, `${AOUT[a.fmt].n} に変換できました`);
}
async function renderRange(buf, s, e, sr, ch) {
  const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext, oc = new OC(ch, Math.max(1, Math.ceil((e - s) * sr)), sr), src = oc.createBufferSource();
  src.buffer = buf; src.connect(oc.destination); src.start(0, s, e - s); const r = await oc.startRendering(); return Array.from({ length: ch }, (_, c) => r.getChannelData(c));
}
$('#bench').addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b) return; const m = b.dataset.a.match(/^(ti|ta|tv)-(.+)$/); if (!m) return; const [, k, op] = m;
  if (op === 'clear') { playStop(false); Tk.set(k === 'ti' ? 'img' : k === 'ta' ? 'aud' : 'vid', { kind: 'idle' }); if (k === 'ti') TL.img = newImg(); if (k === 'ta') TL.aud = newAud(); if (k === 'tv') TL.vid = newAud(); return renderTabs(); }
  if (k === 'ta' && AUDCTL.has(op)) return audCtl(op); });

/* ---- ツールの登録（toolkit.js）。新しいツールも、ここと同じ形で登録するだけ ---- */
Tools.register({ id: 'img', name: '画像リサイズ', icon: 'photo_size_select_large', desc: '画像の大きさ・形式を変える', accepts: ['image'], render: rImg, onFile: setImg,
  async output() { const i = TL.img; if (!i.blob) await makeImg(); return i.blob ? { blob: i.blob, name: `${baseName(i.name)}-${i.w}x${i.h}.${EXT[i.fmt]}` } : { err: i.err || 'エラーを解消してください' }; } });
Tools.register({ id: 'aud', name: '音声カット', icon: 'content_cut', desc: '音声の一部を切り出して書き出す', accepts: ['audio', 'video'], media: true, render: rAud, after: afterAud, onFile: f => setAud('aud', f),
  async output() { const a = TL.aud; if (!a.buf) return { err: 'ファイルを選んでください' }; const b = await buildAudio('aud'); return b ? { blob: b, name: `${baseName(a.name)}-cut.${a.fmt}` } : null; } });
Tools.register({ id: 'vid', name: '動画から音声を取り出す', icon: 'movie', desc: '動画の音声を取り出して書き出す', accepts: ['video', 'audio'], media: true, render: rVid, onFile: f => setAud('vid', f),
  async output() { const v = TL.vid; if (!v.file) return { err: 'ファイルを選んでください' }; const b = await buildAudio('vid'); return b ? { blob: b, name: `${baseName(v.name)}.${v.fmt}` } : null; } });

