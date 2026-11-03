/* SPDX-License-Identifier: GPL-3.0-or-later */
/* キーボードがない端末向けの補助：補助キー行、ファイル内検索バー、幅の変更（スプリッター） */
function insertText(ta, txt) { // 入力履歴（元に戻す）を保ったまま挿入
  ta.focus(); if (!(document.execCommand && document.execCommand('insertText', false, txt))) { ta.setRangeText(txt, ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
}
/* 補助キー行：エディターにフォーカスがあるときだけ表示（タッチ端末・タブレット・スマホ） */
let kbTa = null; const kbar = $('#keybar');
document.addEventListener('focusin', e => { if (e.target.matches && e.target.matches('textarea.in')) { kbTa = e.target; kbar.classList.add('on'); } });
document.addEventListener('focusout', () => setTimeout(() => { const a = document.activeElement; if (!(a && a.matches && (a.matches('textarea.in') || kbar.contains(a)))) kbar.classList.remove('on'); }, 200));
kbar.addEventListener('mousedown', e => e.preventDefault()); // フォーカスを奪わない
const setCaret = p => { kbTa.focus(); kbTa.setSelectionRange(p, p); kbTa.dispatchEvent(new Event('keyup')); };
function lineMove(d) {
  const v = kbTa.value, p = kbTa.selectionStart, ls = p ? v.lastIndexOf('\n', p - 1) + 1 : 0, col = p - ls;
  if (d < 0) { if (!ls) return setCaret(0); const ps = ls > 1 ? v.lastIndexOf('\n', ls - 2) + 1 : 0; return setCaret(Math.min(ps + col, ls - 1)); }
  const le = v.indexOf('\n', p); if (le < 0) return setCaret(v.length); const ne = v.indexOf('\n', le + 1); setCaret(Math.min(le + 1 + col, ne < 0 ? v.length : ne));
}
kbar.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || !kbTa || kbTa.readOnly) return; const k = b.dataset.k, key = b.dataset.key;
  if (k !== undefined) return insertText(kbTa, k);
  if (key === 'tab') insertText(kbTa, ' '.repeat(DATA.settings.tab));
  if (key === 'undo' || key === 'redo') { kbTa.focus(); document.execCommand && document.execCommand(key); }
  if (key === 'left') setCaret(Math.max(0, kbTa.selectionStart - 1)); if (key === 'right') setCaret(Math.min(kbTa.value.length, kbTa.selectionEnd + 1));
  if (key === 'up') lineMove(-1); if (key === 'down') lineMove(1);
});

/* ファイル内検索バー（Ctrl+F／検索パネル／タブ欄のボタンから開く。押すたびに表示／非表示）
   対象：エディター（ハイライト・置換あり）／ヘルプ・Markdownプレビュー・管理画面などの文章／HTMLプレビュー */
const FB = { case: false, re: false }, FIND = { kind: '', i: -1, n: 0, dom: null, root: null };
function makeDomFinder(root) { // 画面内の文章を <mark> で囲んで探す。HTMLプレビュー(iframe)にもこの関数ごと埋め込むため、外部に依存させない
  const marks = []; let cur = -1;
  const clear = () => { marks.splice(0).forEach(m => { const p = m.parentNode; if (!p) return; p.replaceChild(document.createTextNode(m.textContent), m); p.normalize(); }); cur = -1; };
  const set = (q, o) => {
    clear(); if (!q) return 0; let re; try { re = new RegExp(o.re ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), o.case ? 'g' : 'gi'); } catch (e) { return 0; }
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentNode.closest('script,style,svg,textarea,mark.fm') || !n.parentNode.getClientRects().length ? NodeFilter.FILTER_REJECT : /\S/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT }), nodes = [];
    while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(n => { const s = n.nodeValue; let m, last = 0, frag = null; re.lastIndex = 0;
      while ((m = re.exec(s)) && m[0].length) { frag = frag || document.createDocumentFragment(); frag.appendChild(document.createTextNode(s.slice(last, m.index))); const k = document.createElement('mark'); k.className = 'fm'; k.textContent = m[0]; frag.appendChild(k); marks.push(k); last = m.index + m[0].length; }
      if (frag) { frag.appendChild(document.createTextNode(s.slice(last))); n.parentNode.replaceChild(frag, n); } });
    return marks.length;
  };
  const go = d => { if (!marks.length) return -1; if (cur >= 0) marks[cur].classList.remove('cur'); cur = cur < 0 ? (d > 0 ? 0 : marks.length - 1) : (cur + d + marks.length) % marks.length; marks[cur].classList.add('cur'); marks[cur].scrollIntoView({ block: 'center' }); return cur; };
  return { set, go, clear };
}
const FRAME_HELPER = `<style>mark.fm{background:rgba(215,186,58,.5);color:inherit;border-radius:3px}mark.fm.cur{background:#e8a23a;color:#111}</style><script>(function(){var F=(${makeDomFinder.toString()})(document.body);addEventListener('message',function(e){var d=e.data||{};if(d.t!=='find')return;var n=F.set(d.q,d),i=-1;if(d.go)i=F.go(d.go);parent.postMessage({t:'found',n:n,i:i},'*');});})();<\/script>`;
addEventListener('message', e => { if (e.data && e.data.t === 'found') fbShow(e.data.n, e.data.i); });
function findTarget() { /* 右側に出ているものすべてが対象（ホーム・設定・管理・ヘルプ・プレビュー・ツール・エディター…）。左エリアは対象外 */
  const scr = $('#screens'); if (!scr.hidden) { const r = $('.scr:not([hidden])', scr); return r ? { kind: 'dom', pane: scr, root: r } : null; }
  if (!$('#home').hidden) return { kind: 'dom', pane: $('#home'), root: $('#home') };
  const t = S.act[S.grp]; if (!t) return null; const pane = $('.pane', $('#' + S.grp));
  if (t.prev && !t.prev.md) return { kind: 'frame', pane, frame: $('iframe', pane) };
  if (t.prev || t.render) return { kind: 'dom', pane, root: $('.mdx', pane) || $('.adm', pane) || pane };
  const ta = $('textarea.in', pane); return ta ? { kind: 'editor', pane, ta } : { kind: 'dom', pane, root: pane };
}
function fbRe() { const q = $('#fb-q').value; if (!q) return null; try { return new RegExp(FB.re ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), FB.case ? 'g' : 'gi'); } catch { return null; } }
function fbMatches(ta) { const re = fbRe(), out = []; if (!ta || !re) return out; let m; while ((m = re.exec(ta.value)) && out.length < 5000) { out.push([m.index, m.index + m[0].length]); if (!m[0].length) re.lastIndex++; } return out; }
function fbShow(n, i) { FIND.n = n; $('#fb-n').textContent = !$('#fb-q').value ? '' : n ? (i >= 0 ? `${i + 1}/${n}` : `${n}件`) : '0件'; }
function paintMarks(pane, ta) { // エディター上で、見つかった文字列を目立たせる（現在の1件は濃い色）
  const fm = $('pre.fm', pane); if (!fm) return; const T = !$('#findbar').hidden && $('#fb-q').value ? findTarget() : null;
  if (!T || T.kind !== 'editor' || T.ta !== ta) { fm.innerHTML = ''; return; }
  const v = ta.value, ms = fbMatches(ta); let out = '', last = 0; ms.forEach(([s, e], k) => { out += esc(v.slice(last, s)) + `<mark${k === FIND.i ? ' class="cur"' : ''}>${esc(v.slice(s, e))}</mark>`; last = e; });
  fm.innerHTML = out + esc(v.slice(last)) + '\n'; FIND.n = ms.length; if (FIND.i >= ms.length) FIND.i = -1; fbShow(ms.length, FIND.i);
}
function fbSearch(go) { // go: 0=件数とハイライトだけ更新 / ±1=その方向の次の一致へ移動
  const T = findTarget(), bar = $('#findbar'); if (!T) { fbShow(0, -1); return; } bar.dataset.kind = T.kind; const q = $('#fb-q').value;
  if (FIND.kind !== T.kind || (T.kind === 'dom' && FIND.root !== T.root)) { if (FIND.dom) FIND.dom.clear(); FIND.dom = null; FIND.i = -1; }
  FIND.kind = T.kind;
  if (T.kind === 'frame') { T.frame && T.frame.contentWindow && T.frame.contentWindow.postMessage({ t: 'find', q, case: FB.case, re: FB.re, go: go || 0 }, '*'); return; }
  if (T.kind === 'dom') { if (!FIND.dom) { FIND.dom = makeDomFinder(T.root); FIND.root = T.root; } const n = FIND.dom.set(q, FB); FIND.i = go && n ? FIND.dom.go(go) : -1; fbShow(n, FIND.i); return; }
  const ta = T.ta, ms = fbMatches(ta); if (go && ms.length) { // エディター：次/前の一致へ（フォーカスは検索欄のまま）
    const pos = FIND.i >= 0 ? null : (go > 0 ? ta.selectionEnd : ta.selectionStart); let i = FIND.i;
    if (i < 0) { i = go > 0 ? ms.findIndex(m => m[0] >= pos) : ms.map(m => m[1] <= pos).lastIndexOf(true); if (i < 0) i = go > 0 ? 0 : ms.length - 1; } else i = (i + go + ms.length) % ms.length;
    FIND.i = i; const [s, e] = ms[i], line = ta.value.slice(0, s).split('\n').length - 1; ta.setSelectionRange(s, e);
    ta.scrollTop = Math.max(0, (line - 3) * parseFloat(getComputedStyle(ta).lineHeight || 22)); }
  else if (!go) FIND.i = -1;
  paintMarks(T.pane, ta); syncScroll(T.pane, ta);
}
const fbRefresh = () => { FIND.i = -1; fbSearch(0); };
function openFind() {
  const T = findTarget(); if (!T) return showToast('開いているページがありません'); $('#app').dataset.view = 'right';
  if (T.kind === 'editor') { const sel = T.ta.value.slice(T.ta.selectionStart, T.ta.selectionEnd); if (sel && !sel.includes('\n')) $('#fb-q').value = sel; }
  $('#findbar').classList.remove('mini'); $('#findbar').hidden = false; $('#findbar').dataset.kind = T.kind; $('#fb-q').focus(); $('#fb-q').select(); fbSearch(0);
}
function closeFind() { $('#findbar').classList.remove('mini'); $('#findbar').hidden = true; if (FIND.dom) { FIND.dom.clear(); FIND.dom = null; } const T = findTarget(); if (T && T.kind === 'frame' && T.frame && T.frame.contentWindow) T.frame.contentWindow.postMessage({ t: 'find', q: '' }, '*'); if (T && T.kind === 'editor') paintMarks(T.pane, T.ta); }
function toggleFind() { /* 押すたびに表示／非表示。小さくしているときは、まず元の大きさに戻す */
  const bar = $('#findbar'); if (bar.hidden) return openFind(); if (bar.classList.contains('mini')) { bar.classList.remove('mini'); $('#fb-q').focus(); return; } closeFind();
}
$('#fb-min').onclick = () => $('#findbar').classList.add('mini'); $('#fb-restore').onclick = () => { $('#findbar').classList.remove('mini'); $('#fb-q').focus(); };
[$('#home'), $('#screens')].forEach(el => new MutationObserver(() => { if (!$('#findbar').hidden) fbRefresh(); }).observe(el, { attributes: true, attributeFilter: ['hidden'] }));
$('#find-open').onclick = toggleFind;
$('#fb-q').oninput = () => { FIND.i = -1; fbSearch(0); };
$('#fb-q').onkeydown = e => { // 検索欄にカーソルがあるときは、Enterも矢印キーも「検索の次/前へ」（エディターは動かさない）
  const q = e.target, k = e.key; let d = 0;
  if (k === 'Enter') d = e.shiftKey ? -1 : 1; else if (k === 'ArrowDown') d = 1; else if (k === 'ArrowUp') d = -1;
  else if (k === 'ArrowRight' && q.selectionStart === q.value.length && q.selectionEnd === q.value.length) d = 1; else if (k === 'ArrowLeft' && q.selectionStart === 0 && q.selectionEnd === 0) d = -1;
  if (d) { e.preventDefault(); fbSearch(d); } else if (k === 'Escape') { e.preventDefault(); closeFind(); } };
$('#fb-next').onclick = () => fbSearch(1); $('#fb-prev').onclick = () => fbSearch(-1); $('#fb-x').onclick = closeFind;
$('#fb-case').onclick = e => { FB.case = !FB.case; e.currentTarget.classList.toggle('on', FB.case); fbRefresh(); }; $('#fb-re').onclick = e => { FB.re = !FB.re; e.currentTarget.classList.toggle('on', FB.re); fbRefresh(); };
$('#fb-rep').onclick = () => { const T = findTarget(); if (!T || T.kind !== 'editor' || T.ta.readOnly) return showToast('置換できるのは、編集できるファイルを開いているときです'); const ms = fbMatches(T.ta), cur = ms[FIND.i];
  if (!cur) return fbSearch(1); T.ta.setRangeText($('#fb-r').value, cur[0], cur[1], 'end'); T.ta.dispatchEvent(new Event('input', { bubbles: true })); FIND.i = FIND.i - 1; fbSearch(1); };
$('#fb-all').onclick = () => { const T = findTarget(), re = fbRe(); if (!T || T.kind !== 'editor' || T.ta.readOnly || !re) return showToast('置換できるのは、編集できるファイルを開いているときです'); const n = fbMatches(T.ta).length;
  T.ta.value = T.ta.value.replace(re, $('#fb-r').value); T.ta.dispatchEvent(new Event('input', { bubbles: true })); FIND.i = -1; fbSearch(0); showToast(n + '件を置換しました'); };
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && findTarget()) { e.preventDefault(); toggleFind(); } });

/* 左領域の幅：スプリッターをドラッグ（マウス・タッチ）。CSSのresizeはタッチで使えないため */
const sp = $('#split-v');
sp.addEventListener('pointerdown', e => { sp.setPointerCapture && sp.setPointerCapture(e.pointerId); sp.classList.add('drag'); });
sp.addEventListener('pointermove', e => { if (!sp.classList.contains('drag')) return; const x = e.clientX - $('#app').getBoundingClientRect().left - $('#activity').offsetWidth; $('#left').style.width = Math.max(180, Math.min(x, innerWidth * .6)) + 'px'; });
const spEnd = () => { sp.classList.remove('drag'); if ($('#sm08').classList.contains('on')) renderUsage(); }; sp.addEventListener('pointerup', spEnd); sp.addEventListener('pointercancel', spEnd);

/* 入力方式は、実際の操作から自動で決める（手動の切替は無い）：html の data-input = touch | pen | mouse
     起動時は pointer:coarse（指が主の端末）なら touch、そうでなければ mouse。以後、触れた／動かした入力に合わせて切り替える
     （ノートPCのタッチ画面や iPad＋キーボードのように、途中で変わっても追従する）。
     touch … 補助キー行・複数選択の操作ボタン・スクロールバーの自動非表示・長押し操作。pen … マウスと同じ（ホバーできる）で、ドラッグも可。mouse … 従来どおり。 */
const rootEl = document.documentElement;
const coarse = () => !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
const setInput = m => { if (rootEl.dataset.input === m) return; rootEl.dataset.input = m; dispatchEvent(new CustomEvent('vwc:input', { detail: { input: m } })); };
rootEl.dataset.input = coarse() ? 'touch' : 'mouse';
const kindOf = e => e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'pen' : 'mouse';
addEventListener('pointerdown', e => setInput(kindOf(e)), true);
addEventListener('pointermove', e => { if (e.pointerType !== 'touch') setInput(kindOf(e)); }, true); /* マウス・ペンは、動かしただけ（ホバー）でも切り替わる */

/* メイン／サブの境界をドラッグして大きさを変える（マウス・タッチ。ダブルクリックで均等に戻す） */
const sg = $('#split-g');
sg.addEventListener('pointerdown', e => { sg.setPointerCapture && sg.setPointerCapture(e.pointerId); sg.classList.add('drag'); });
sg.addEventListener('pointermove', e => { if (!sg.classList.contains('drag')) return; const r = $('#top').getBoundingClientRect(), ph = isPhone(), px = ph ? r.bottom - e.clientY : r.right - e.clientX, total = ph ? r.height : r.width;
  /* どちらの画面も最低260px */ $('#g2').style.flex = `0 0 ${Math.max(260, Math.min(px, total - 260))}px`; });
['pointerup', 'pointercancel'].forEach(t => sg.addEventListener(t, () => sg.classList.remove('drag'))); sg.addEventListener('dblclick', () => $('#g2').style.flex = '');
