/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 共有(SM04) / 公開(SM05) / 履歴(SM11)。app.js の $ ico S toast DATA を利用。
   共有は所有者だけが変更できる（04_API.md の share/*）。部員の候補は members/search があれば使い、
   無い場合は、既に分かっている部員（管理一覧・共有先）から絞り込む。 */
const owner = () => (S.proj && (S.proj.owner === DATA.user.id || !S.proj.perm || S.proj.perm === 'owner')) && S.role !== 'shared-view' && S.role !== 'shared-edit'; // 所有者のみ共有操作可
function confirmDlg(title, msg, ok) {
  $('#conf-t').textContent = title; $('#conf-m').textContent = msg;
  $('#conf-ok').onclick = () => { $('#d-conf').close(); ok(); }; $('#d-conf').showModal();
}
function confirmHtml(title, html, ok, label) { $('#conf-t').textContent = title; $('#conf-m').innerHTML = html; $('#conf-ok').textContent = label || 'OK'; $('#conf-ok').onclick = () => { $('#d-conf').close(); ok(); }; $('#d-conf').showModal(); }
function resultDlg(title, html) { $('#res-t').textContent = title; $('#res-b').innerHTML = html; $('#d-res').showModal(); }
function openInfo(name, html) { // 右エリアにタブで表示（詳細・差分）
  const path = '#' + name; S.tabs = S.tabs.filter(t => t.path !== path);
  S.tabs.push({ name, path, g: 'g1', f: { text: '' }, prev: { md: true, html } }); S.act.g1 = S.tabs.at(-1); S.grp = 'g1';
  hideHome(); renderTabs(); $('#app').dataset.view = 'right';
}

/* SM04 共有 */
const av = n => `<span class="avatar">${esc(String(n || '?').trim()[0] || '?')}</span>`;
let shareCandidates = [], shareTimer = 0;
function renderShare() {
  if (!$('#sh-state') || !S.proj) return;
  const o = owner(), n = DATA.collab.length, st = S.proj.perm ? `共有されています（${S.proj.perm === 'edit' ? '編集可' : '閲覧のみ'}）` : n ? `${n}人に共有中` : '共有していません';
  if (!S.proj) return;
  $('#sh-state').innerHTML = `<span class="ms">${S.proj.perm || n ? 'group' : 'lock'}</span><div><b>${esc(S.proj.name)}</b><small>${st}</small></div>${o ? `<button data-sh-bulk title="共有を一括で ON / OFF" aria-label="共有を一括で ON / OFF">${ico('edit')}</button>` : ''}`;
  $('#sh-owner').hidden = !o; $('#sh-transfer').hidden = !o;
  const known = [...shareCandidates, ...DATA.members].filter((m, i, a) => m.active !== false && a.findIndex(x => x.id === m.id) === i && !DATA.collab.some(c => c.id === m.id));
  $('#sh-dl').innerHTML = known.map(m => `<option value="${esc(m.name)}（${m.id}）">`).join('');
  $('#sh-list').innerHTML = DATA.collab.map(c => `<div class="mem" data-c="${c.id}"><div class="mem-h">${av(c.name)}<b>${esc(c.name)}</b>` +
    (o ? `<button title="共有を解除" data-rm="${c.id}">${ico('person_remove')}</button></div><div class="mem-b"><select data-perm="${c.id}"><option value="view"${c.perm === 'view' ? ' selected' : ''}>閲覧</option><option value="edit"${c.perm === 'edit' ? ' selected' : ''}>編集</option></select>` +
      `<label class="tgl"><input type="checkbox" data-pub="${c.id}" ${c.pub ? 'checked' : ''}><span>公開権限</span></label></div>` : `<span class="badge">${c.perm === 'edit' ? '編集可' : '閲覧のみ'}</span></div>`) + '</div>').join('');
}
$('#sh-state').onclick = e => { if (e.target.closest('[data-sh-bulk]')) openBulkShare(); };

/* 共有の一括設定：部員を1人選び、自分のプロジェクトごとに、その部員への共有を ON / OFF で切り替える。
   「反映する」で、変えたものだけをまとめて送る（ON = 共有する／OFF = 共有を解除。ON のときは、閲覧・編集と公開権限も選べる）。 */
const BK = { member: null, rows: [] };
function bulkRender() {
  const changed = BK.rows.filter(r => r.on !== r.was.on || (r.on && (r.perm !== r.was.perm || r.pub !== r.was.pub)));
  $('#bk-tools').hidden = !BK.member;
  $('#bk-sum').textContent = BK.member ? `ON ${BK.rows.filter(r => r.on).length} / ${BK.rows.length} 件　変更 ${changed.length} 件` : '';
  $('#bk-go').disabled = !changed.length;
  $('#bk-list').innerHTML = BK.rows.map((r, i) => `<div class="bulk-row"><div class="nm" title="${esc(r.name)}">${esc(r.name)}${r.err ? `<small class="err">${esc(r.err)}</small>` : ''}</div>` +
    `<select data-bk-perm="${i}" ${r.on ? '' : 'disabled'} aria-label="権限"><option value="view"${r.perm === 'view' ? ' selected' : ''}>閲覧</option><option value="edit"${r.perm === 'edit' ? ' selected' : ''}>編集</option></select>` +
    `<label class="tgl"><input type="checkbox" data-bk-pub="${i}" ${r.pub ? 'checked' : ''} ${r.on ? '' : 'disabled'}><span>公開権限</span></label>` +
    `<label class="tgl"><input type="checkbox" data-bk-on="${i}" ${r.on ? 'checked' : ''}><span>${r.on ? 'ON' : 'OFF'}</span></label></div>`).join('') || '<div class="pnote">あなたが所有しているプロジェクトがありません</div>';
}
function openBulkShare() {
  BK.member = null; BK.rows = []; $('#bk-m').value = ''; bulkRender(); $('#d-bulk').showModal();
}
$('#bk-m').addEventListener('input', e => {
  const q = e.target.value.trim(); clearTimeout(shareTimer);
  shareTimer = setTimeout(async () => {
    try { shareCandidates = await Api.searchMembers(q); } catch { shareCandidates = []; }
    const known = [...shareCandidates, ...DATA.members].filter((m, i, a) => m.active !== false && m.id !== DATA.user.id && a.findIndex(x => x.id === m.id) === i);
    $('#bk-dl').innerHTML = known.map(m => `<option value="${esc(m.name)}（${m.id}）">`).join('');
  }, 200);
});
$('#bk-load').onclick = async () => {
  const m = memberOfInput($('#bk-m').value.trim());
  if (!m) return showToast('登録済みの有効な部員を検索して選んでください');
  if (m.id === DATA.user.id) return showToast('自分自身には共有できません');
  BK.member = m; BK.rows = [];
  const mine = DATA.projects.mine.slice();
  await Task.run({ title: `共有の状態を確認中（${m.name}）`, icon: 'share', delay: 0 }, async t => {
    let done = 0, next = 0;
    const one = async () => {
      while (next < mine.length) {
        const p = mine[next++];
        try {
          const d = await Api.share.list(p.id); DATA.sharesByProject[p.id] = d;
          const c = arr(d, 'shares').find(s => String(s.member ?? s.id ?? s.member_id) === m.id);
          const st = { on: !!c, perm: c ? (c.mode || c.perm || 'view') : 'view', pub: c ? bool(c.can_publish ?? c.pub, false) : false };
          BK.rows[mine.indexOf(p)] = { id: p.id, name: p.name, ...st, was: { ...st } };
        } catch (e) { BK.rows[mine.indexOf(p)] = { id: p.id, name: p.name, on: false, perm: 'view', pub: false, was: { on: false, perm: 'view', pub: false }, err: '共有の状態を確認できませんでした' }; }
        done++; t.set({ pct: done / mine.length, msg: `${done}/${mine.length}件` });
      }
    };
    await Promise.all([one(), one(), one(), one()]);
  });
  bulkRender();
};
$('#bk-list').addEventListener('change', e => {
  const t = e.target, i = t.dataset.bkOn ?? t.dataset.bkPerm ?? t.dataset.bkPub; if (i === undefined) return;
  const r = BK.rows[+i]; if (!r) return;
  if (t.dataset.bkOn !== undefined) r.on = t.checked; else if (t.dataset.bkPerm !== undefined) r.perm = t.value; else r.pub = t.checked;
  bulkRender();
});
$('#bk-on').onclick = () => { BK.rows.forEach(r => { r.on = true; }); bulkRender(); };
$('#bk-off').onclick = () => { BK.rows.forEach(r => { r.on = false; }); bulkRender(); };
$('#bk-go').onclick = async () => {
  const todo = BK.rows.filter(r => r.on !== r.was.on || (r.on && (r.perm !== r.was.perm || r.pub !== r.was.pub)));
  if (!todo.length || !BK.member) return;
  let ok = 0, ng = 0;
  await Task.run({ title: `共有を反映中（${BK.member.name}）`, icon: 'share', delay: 0 }, async t => {
    for (const r of todo) {
      try {
        if (r.on) await Api.share.set(r.id, BK.member.id, r.perm, r.pub); else await Api.share.remove(r.id, BK.member.id);
        r.was = { on: r.on, perm: r.perm, pub: r.pub }; r.err = ''; ok++;
      } catch (e) { r.err = apiMessage(e); ng++; }
      t.set({ pct: (ok + ng) / todo.length, msg: `${ok + ng}/${todo.length}件：${r.name}` });
    }
  });
  bulkRender();
  if (S.proj && S.proj.id) { try { const d = await Api.share.list(S.proj.id); DATA.sharesByProject[S.proj.id] = d; applyShares(d); renderShare(); } catch { /* 表示は次の更新で */ } }
  showToast(ng ? `${ok}件を反映、${ng}件は失敗しました` : `${ok}件の共有を反映しました`);
};
$('#sh-list').addEventListener('click', async e => {
  const b = e.target.closest('[data-rm]'); if (!b) return;
  try { await Api.share.remove(S.proj.id, b.dataset.rm); DATA.collab = DATA.collab.filter(c => c.id !== b.dataset.rm); renderShare(); showToast('共有を解除しました'); }
  catch (e) { showApiError(e); }
});
$('#sh-list').addEventListener('change', async e => {
  const c = DATA.collab.find(x => x.id === (e.target.dataset.perm || e.target.dataset.pub)); if (!c) return;
  const next = e.target.dataset.perm ? { perm: e.target.value } : { pub: e.target.checked }, old = { perm: c.perm, pub: c.pub };
  Object.assign(c, next);
  try {
    await Api.share.set(S.proj.id, c.id, c.perm, c.pub);
    showToast('権限を更新しました');
  } catch (err) { Object.assign(c, old); renderShare(); showApiError(err); }
});
const memberOfInput = value => shareCandidates.find(m => value === `${m.name}（${m.id}）` || value === m.id || value === m.name) || DATA.members.find(m => m.active && (value === `${m.name}（${m.id}）` || value === m.id || value === m.name));
$('#sh-add').addEventListener('input', e => {
  const q = e.target.value.trim(); clearTimeout(shareTimer);
  shareTimer = setTimeout(async () => {
    try { shareCandidates = await Api.searchMembers(q); } catch { shareCandidates = []; }
    renderShare();
  }, 200);
});
$('#sh-addbtn').onclick = async () => {
  const value = $('#sh-add').value.trim(), member = memberOfInput(value);
  if (!member) return showToast('登録済みの有効な部員を検索して選んでください');
  if (DATA.collab.some(c => c.id === member.id)) return showToast('この部員はすでに共有されています');
  try {
    await Api.share.set(S.proj.id, member.id, 'view', false);
    const d = await Api.share.list(S.proj.id); DATA.sharesByProject[S.proj.id] = d; applyShares(d);
    shareCandidates = []; $('#sh-add').value = ''; renderShare();
  } catch (e) { showApiError(e); }
};
$('#sh-transfer').onclick = () => {
  if (!DATA.collab.length) return showToast('先に共有先を追加してください');
  $('#own-sel').innerHTML = DATA.collab.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join(''); $('#own-sel').onchange(); $('#d-own').showModal();
};
const projMB = () => { if (!S.proj) return 0; const c = DATA.usage.categories.find(x => x.name === 'プロジェクト'); if (!c) return 0; const m = (c.items || []).find(x => x[0] === S.proj.name); return m ? m[1] : 0; };
$('#own-sel').onchange = () => { const c = DATA.collab.find(x => x.id === $('#own-sel').value); $('#own-note').innerHTML = c ? `<b>容量の付け替え：</b>このプロジェクトの容量（約${fmtMB(projMB())}MB）は、あなたの使用量から外れ、<b>${esc(c.name)}</b> さんの使用量に加わります。移動後、あなたは編集権限になります。` : ''; };
$('#own-go').onclick = async () => {
  const c = DATA.collab.find(x => x.id === $('#own-sel').value); if (!c) return;
  const id = S.proj.id;
  try {
    await Api.projects.transfer(id, c.id);
    $('#d-own').close();
    await Promise.allSettled([loadProjects(), loadUsage()]);
    S.proj = allProjects().find(x => x.id === id) || S.proj;
    renderProjects(); renderShare(); renderPub(); renderUsage(); renderHome();
    showToast(`${c.name} さんに所有者を移動しました（容量 約${fmtMB(projMB())}MB も付け替えました）`);
  } catch (e) { showApiError(e); }
};
