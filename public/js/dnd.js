/* SPDX-License-Identifier: GPL-3.0-or-later */
/* ドラッグ＆ドロップ：マウス（少し動かすと開始）とタッチ（長押しで開始）の両対応。プロジェクト・ファイル・タブの入れ替えに使う */
function dragKit(root, cfg) {
  let cand = null, st = null, timer = null, hl = null, suppress = false;
  const clear = () => { if (hl) { hl.el.classList.remove('dz-before', 'dz-after', 'dz-into'); hl = null; } };
  const move = (x, y) => { // つかんでいるもの＋移動先の説明を、指の上に表示する
    st.g.style.left = x + 14 + 'px'; st.g.style.top = y + 14 + 'px';
    const el = document.elementFromPoint(x, y), t = el ? cfg.target(el, x, y, st.p) : null;
    clear(); if (t) { t.el.classList.add('dz-' + t.pos); hl = t; } st.t = t;
  };
  const begin = (item, x, y) => {
    const p = cfg.start(item); if (!p) return false;
    const g = document.createElement('div'); g.className = 'dnd-ghost'; g.textContent = cfg.label(p); document.body.appendChild(g);
    if (window.getSelection) getSelection().removeAllRanges();
    document.body.classList.add('dragging'); st = { p, g, t: null, item }; cfg.onStart && cfg.onStart(p); move(x, y); return true;
  };
  const end = ok => { if (!st) return; const { p, t, g } = st; g.remove(); document.body.classList.remove('dragging'); clear(); cfg.onEnd && cfg.onEnd(); st = null; if (ok && t) cfg.drop(p, t); };
  const pick = e => { const it = e.target.closest(cfg.item); return it && root.contains(it) && !e.target.closest('button,input,select,textarea') ? it : null; };
  // 文字選択・長押しメニューを拒否
  root.addEventListener('mousedown', e => { if (e.button === 0 && pick(e)) e.preventDefault(); });
  root.addEventListener('contextmenu', e => { if (pick(e) && (st || cand)) e.preventDefault(); });
  document.addEventListener('selectstart', e => { if (st || cand) e.preventDefault(); });
  // マウス
  root.addEventListener('pointerdown', e => { if (e.pointerType === 'touch' || e.button !== 0) return; /* マウス・ペン */ const it = pick(e); if (it) cand = { it, x: e.clientX, y: e.clientY }; });
  document.addEventListener('pointermove', e => { if (e.pointerType === 'touch') return; if (st && e.buttons === 0) { end(false); return; } /* ボタンを離した通知を受け取れなかったときの保険 */ if (st) return move(e.clientX, e.clientY);
    if (cand && !cand.t && Math.hypot(e.clientX - cand.x, e.clientY - cand.y) > 6) { const c = cand; cand = null; if (begin(c.it, e.clientX, e.clientY)) suppress = true; } });
  document.addEventListener('pointerup', e => { if (e.pointerType === 'touch') return; cand = null; if (st) { end(true); setTimeout(() => suppress = false, 0); } });
  root.addEventListener('click', e => { if (suppress) { e.stopPropagation(); e.preventDefault(); suppress = false; } }, true);
  // タッチ：長押しで開始（動かすとスクロール扱い）。ドラッグ中はスクロールを止める
  const tp = e => ({ x: e.touches[0].clientX, y: e.touches[0].clientY });
  root.addEventListener('touchstart', e => { const it = pick(e); if (!it) return; const p = tp(e); cand = { it, x: p.x, y: p.y, t: true }; clearTimeout(timer); /* t：タッチの候補（ペンが先に作った候補は、タッチの長押しに置き換える。iPad のペンなど） */
    timer = setTimeout(() => { if (cand) { const c = cand; cand = null; if (begin(c.it, c.x, c.y) && navigator.vibrate) navigator.vibrate(15); } }, 380); }, { passive: true });
  root.addEventListener('touchmove', e => { const p = tp(e); if (st) { e.preventDefault(); return move(p.x, p.y); } if (cand && Math.hypot(p.x - cand.x, p.y - cand.y) > 10) { cand = null; clearTimeout(timer); } }, { passive: false });
  root.addEventListener('touchend', e => { clearTimeout(timer); cand = null; if (st) { e.preventDefault(); end(true); } });
  root.addEventListener('touchcancel', () => { clearTimeout(timer); cand = null; end(false); });
}
const half = (el, y) => { const r = el.getBoundingClientRect(); return y < r.top + r.height / 2 ? 'before' : 'after'; };

/* プロジェクト：「自分の」内、「共有された」内で並べ替え */
dragKit($('#left'), {
  item: '.row[data-id]',
  start: el => ({ id: el.dataset.id, list: el.parentElement.id === 'list-mine' ? 'mine' : 'shared', name: el.querySelector('.nm').textContent }),
  label: p => p.name,
  target: (el, x, y, p) => { const row = el.closest('.row[data-id]'); if (!row || row.dataset.id === p.id || row.parentElement.id !== 'list-' + p.list) return null; return { el: row, pos: half(row, y), id: row.dataset.id, name: row.querySelector('.nm').textContent }; },
  drop: async (p, t) => {
    const l = DATA.projects[p.list], it = l.find(x => x.id === p.id); if (!it) return;
    const ids = l.map(x => x.id);
    const oldIndex = l.indexOf(it); const targetIndex = t ? l.findIndex(x => x.id === t.id) + (t.pos === 'after' ? 1 : 0) : l.length;
    l.splice(oldIndex, 1); const insert = oldIndex < targetIndex ? targetIndex - 1 : targetIndex; l.splice(insert, 0, it);
    renderProjects();
    try { await Api.projects.reorder(p.list, l.map(x => x.id)); }
    catch (e) { showApiError(e); await loadProjects(); renderProjects(); }
  }
});

/* ファイル：プロジェクト内の任意の場所（フォルダの中・並び順）へ移動 */
const listOf = dir => dir ? findFile(dir).c : files();
function retarget(oldP, newP) { // 開いているタブ・折りたたみ状態のパスを更新
  const re = p => p === oldP || p.startsWith(oldP + '/') || p.startsWith(oldP + '#') ? newP + p.slice(oldP.length) : p;
  S.tabs.forEach(t => { if (!t.render && !t.prev || t.prev) { t.path = re(t.path); t.name = t.prev ? t.path.split('#')[0].split('/').pop() : t.path.split('/').pop(); } });
  S.closed = new Set([...S.closed].map(re)); if (S.sel) S.sel = re(S.sel); S.msel = new Set([...S.msel].map(re)); if (S.anchor) S.anchor = re(S.anchor); if (S.hov) S.hov = re(S.hov);
}
async function moveNode(src, t) {
  if (S.role === 'shared-view' || S.proj.perm === 'view') return showToast('閲覧のみのため移動できません');
  const node = findFile(src); if (!node) return;
  const sParent = listOf(src.split('/').slice(0, -1).join('/'));
  let list, dir, dest;
  if (t.root) { list = files(); dir = ''; dest = (dir ? dir + '/' : '') + node.n; }
  else {
    const tn = findFile(t.path), td = t.path.split('/').slice(0, -1).join('/');
    if (t.pos === 'into') { list = tn.c; dir = t.path; }
    else { list = listOf(td); dir = td; }
    dest = (dir ? dir + '/' : '') + node.n;
  }
  if (dest === src) return;
  if (list !== sParent && list.some(x => x.n === node.n)) return showToast('移動先に同じ名前があります');
  const si = sParent.indexOf(node); sParent.splice(si, 1); if (list === sParent && si < (t && t.pos === 'after' ? list.indexOf(findFile(t.path)) + 1 : list.length)) { /* noop */ }
  // 位置調整はサーバー側に任せる。ローカルは retarget と再読み込みで反映する。
  try {
    await Api.files.rename(S.proj.id, src, dest);
    retarget(src, dest);
    await reloadTree();
    await refreshStatus();
    renderTabs(); renderTree();
    showToast('移動しました');
  } catch (e) { showApiError(e); await reloadTree(); renderTree(); renderTabs(); }
}
/* 複数選択しているときは、選択しているものをまとめて移動する */
async function moveMany(paths, t) {
  if (paths.length === 1) return moveNode(paths[0], t);
  const targets = topOnly(paths);
  let failed = 0;
  for (const p of targets) {
    try {
      const node = findFile(p); if (!node) continue;
      const td = t && !t.root ? t.path.split('/').slice(0, -1).join('/') : '';
      const dir = t && t.pos === 'into' ? t.path : td;
      const dest = (dir ? dir + '/' : '') + node.n;
      if (dest === p) continue;
      await Api.files.rename(S.proj.id, p, dest);
      retarget(p, dest);
    } catch (e) { failed++; showApiError(e); }
  }
  await reloadTree(); await refreshStatus(); renderTabs(); renderTree();
  if (failed) showToast(`${failed}件を移動できませんでした`);
  else showToast(targets.length + '件を移動しました');
}
dragKit($('#tree'), {
  item: '.row[data-file], .row[data-dir]',
  start: el => { const path = el.dataset.file || el.dataset.dir; return { path, paths: S.msel.size > 1 && S.msel.has(path) ? topOnly(S.msel) : [path] }; },
  label: p => p.paths.length > 1 ? p.paths.length + '件' : p.path.split('/').pop(),
  target: (el, x, y, p) => { const row = el.closest('#tree .row');
    if (!row) return el.closest('#tree') ? { el: $('#tree'), pos: 'into', root: true } : null;
    const path = row.dataset.file || row.dataset.dir; if (p.paths.some(q => path === q || path.startsWith(q + '/'))) return null;
    const r = row.getBoundingClientRect(), f = (y - r.top) / (r.height || 1);
    return { el: row, path, pos: row.dataset.dir ? (f < .25 ? 'before' : f > .75 ? 'after' : 'into') : (f < .5 ? 'before' : 'after') }; },
  drop: (p, t) => moveMany(p.paths, t)
});

/* タブ：並べ替え・別グループへの移動（上2＋下1）。タッチでも可能。非表示のグループは端のゾーンへドロップして開く */
dragKit($('#bench'), {
  item: '.tab',
  start: el => { const tab = S.tabs.find(x => x.path === el.dataset.p); return tab && { tab }; },
  label: p => p.tab.name,
  onStart: () => { $('#dz-sub').hidden = !$('#g2').hidden; },
  onEnd: () => { $('#dz-sub').hidden = true; },
  target: (el, x, y, p) => {
    const tab = el.closest('.tab'); if (tab) { if (tab.dataset.p === p.tab.path) return null; return { el: tab, pos: (() => { const r = tab.getBoundingClientRect(); return x < r.left + r.width / 2 ? 'before' : 'after'; })(), tab: S.tabs.find(t => t.path === tab.dataset.p) }; }
    const z = el.closest('.dz'); if (z) return { el: z, pos: 'into', zone: z.dataset.z };
    const g = el.closest('.group'); return g ? { el: g, pos: 'into', g: g.dataset.g } : null; },
  drop: (p, t) => { const tab = p.tab; tab.fromSub = false; S.tabs = S.tabs.filter(x => x !== tab);
    if (t.tab) { tab.g = t.tab.g; S.tabs.splice(S.tabs.indexOf(t.tab) + (t.pos === 'after' ? 1 : 0), 0, tab); }
    else { tab.g = t.zone ? 'g2' : t.g; const el = $('#' + tab.g); el.dataset.keep = 1; el.hidden = false; S.tabs.push(tab); }
    S.act[tab.g] = tab; S.grp = tab.g; renderTabs(); navPush(); }
});
