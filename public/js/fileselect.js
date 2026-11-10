/* SPDX-License-Identifier: GPL-3.0-or-later */
/* ファイル一覧：複数選択（キーボード・マウス・タッチ）、タッチ用の操作ボタン、ポインターを乗せた行のボタン表示
   選択の状態は S.msel（パスの集合）／S.mmode（複数選択モード）／S.anchor（Shiftで範囲を取る起点）／S.hov（ポインターを乗せている行）。
   クリックでの選択の更新は app.js の pickNode()。ここは「それ以外」の入口をまとめる */
const topOnly = paths => { const s = [...paths]; return s.filter(p => !s.some(q => q !== p && p.startsWith(q + '/'))); }; /* 選んだフォルダの中身は、フォルダごと扱う */
const baseOf = p => p.split('/').pop(), dirOf = p => p.split('/').slice(0, -1).join('/');
const treeEl = $('#tree');

function clearSel() { S.msel = new Set(); S.mmode = false; S.anchor = null; renderTree(); }
function selAll() { const o = treeOrder(); if (!o.length) return; S.msel = new Set(o); S.anchor = o[0]; S.mmode = true; renderTree(); }

/* ---- ポインターを乗せた行（マウス・ペン）。タッチにはホバーが無いので対象外 ---- */
treeEl.addEventListener('pointerover', e => { if (e.pointerType === 'touch') return; const r = e.target.closest('.row'), p = r ? (r.dataset.file || r.dataset.dir) : null; if (p !== S.hov) { S.hov = p; updActs(); } });
treeEl.addEventListener('pointerleave', e => { if (e.pointerType === 'touch') return; if (S.hov) { S.hov = null; updActs(); } });

/* ---- タッチ：長押しで複数選択モードへ（動かすとスクロール）。そのまま指を動かせば、従来どおり移動（ドラッグ）になる ---- */
let lp = null, lpFired = false, lpSwallow = false;
treeEl.addEventListener('touchstart', e => {
  lpFired = false; const row = e.target.closest('.row'); if (!row || e.target.closest('button') || S.mmode || e.touches.length > 1) return;
  const t = e.touches[0], path = row.dataset.file || row.dataset.dir; if (lp) clearTimeout(lp.timer);
  lp = { x: t.clientX, y: t.clientY, timer: setTimeout(() => { /* 押した瞬間にDOMを作り直さない（クリックが成立しなくなる）ので、見た目は指を離してから整える */
    lpFired = true; S.msel = new Set([path]); S.anchor = path; S.mmode = true; row.classList.add('pk'); if (navigator.vibrate) navigator.vibrate(15); }, 380) };
}, { passive: true });
treeEl.addEventListener('touchmove', e => { if (!lp) return; const t = e.touches[0]; if (Math.hypot(t.clientX - lp.x, t.clientY - lp.y) > 10) { clearTimeout(lp.timer); lp = null; } }, { passive: true });
const lpEnd = e => { if (lp) clearTimeout(lp.timer); lp = null; if (lpFired) { lpFired = false; if (!e.defaultPrevented) { lpSwallow = true; setTimeout(() => lpSwallow = false, 250); } /* ドラッグで終えたときは、クリックは来ない */ renderTree(); } };
treeEl.addEventListener('touchend', lpEnd); treeEl.addEventListener('touchcancel', lpEnd);
window.lpConsume = () => { if (lpSwallow) { lpSwallow = false; return true; } return false; }; /* 長押しを離したときのクリックは、選択の解除に使わない */
treeEl.addEventListener('contextmenu', e => { if (document.documentElement.dataset.input === 'touch' && e.target.closest('.row')) e.preventDefault(); });

/* ---- 操作：コピー（同じ場所に複製）・削除 ---- */
async function copySel() {
  if (readOnly()) return; const ps = topOnly(S.msel); if (!ps.length) return; const out = [];
  for (const p of ps) {
    const node = findFile(p); if (!node) continue;
    const dir = dirOf(p), list = listOf(dir), n = uniqName(list, baseOf(p)), dest = dir ? dir + '/' + n : n;
    try {
      if (isText(node)) {
        const d = await Api.files.read(S.proj.id, p);
        await Api.files.create(S.proj.id, dest, d.content ?? d.text ?? '');
      } else {
        const { blob } = await Api.files.raw(S.proj.id, p);
        await Upl.start([{ name: n, size: blob.size, file: blob, dir }]);
      }
      out.push(dest);
    } catch (e) { showApiError(e); }
  }
  if (!out.length) return;
  await reloadTree(); S.msel = new Set(out); S.anchor = out[0]; S.mmode = true; renderTree(); if (typeof scheduleUsageRefresh === 'function') scheduleUsageRefresh(); showToast(out.length + '件をコピーしました');
}
function askDelSel() {
  if (readOnly()) return; const ps = topOnly(S.msel); if (!ps.length) return; const names = ps.map(baseOf);
  delF = ps.length + '件'; delDone = () => deletePaths(ps);
  $('#delf-n').textContent = ps.length === 1 ? names[0] : `${ps.length}件（${names.slice(0, 3).join('、')}${ps.length > 3 ? ' ほか' : ''}）`; $('#d-delf').showModal();
}
$('#msb-x').onclick = clearSel; $('#msb-all').onclick = selAll; $('#msb-cp').onclick = copySel; $('#msb-del').onclick = askDelSel;

/* ---- キー：Ctrl/Cmd+A＝すべて選択、Delete＝削除、Esc＝選択を解除（文字入力中・ダイアログ表示中は何もしない） ---- */
const typingNow = () => { const a = document.activeElement; return !!a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); };
const treeActive = () => curPanel === 'sm02' && !leftHidden && S.auth !== false && !document.querySelector('dialog[open]') && (!isPhone() || $('#app').dataset.view === 'left');
document.addEventListener('keydown', e => {
  if (typingNow() || !treeActive()) return;
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'a') { e.preventDefault(); selAll(); }
  else if (e.key === 'Delete' && S.msel.size) { e.preventDefault(); askDelSel(); }
  else if (e.key === 'Escape' && (S.mmode || S.msel.size > 1)) { clearSel(); }
});
