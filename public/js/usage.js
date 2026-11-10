/* SPDX-License-Identifier: GPL-3.0-or-later */
/* SM08 利用状況：縦に積み上がるバー + 引き出し線 + ホバー詳細 / 詳細タブ（隠さず全件を表示） */
/* 区分（プロジェクト/アプリ/履歴/その他）の色。バーは下から その他→履歴→アプリ→プロジェクト の順に積む。合計・バー・上限の判定は、すべて同じ値（その他を含む） */
const UCOL = { 'プロジェクト': '#0078d4', 'アプリ': '#e5a50a', '履歴': '#b180d7', 'その他': '#8a8a8a' };
const UNOTE = '合計には「その他」（システム設定・キャッシュ・ログ）も含みます。上限の判定も、この合計で行います。';
const stackOf = () => [...DATA.usage.categories].reverse();
const itemsOf = u => catItems(u);
const usageCats = () => (S.role === 'admin' && DATA.adminUsage.categories.length ? DATA.adminUsage.categories : DATA.usage.categories);
let usageMember = '';
const usageTotal = cats => cats.reduce((s, c) => s + num(c.mb, 0), 0);
function tipHtml(u) { // 上位5件 + その他（内訳つき）
  const it = itemsOf(u), top = it.slice(0, 5), rest = it.slice(5), rs = rest.reduce((a, x) => a + x[1], 0);
  return `<b>${esc(u.name)}　${fmtMB(u.mb)}MB</b>` + top.map(([n, v]) => `<div><span>${esc(n)}</span><span>${fmtMB(v)}MB</span></div>`).join('') +
    (rest.length ? `<div><span>その他（${rest.length}件）</span><span>${fmtMB(rs)}MB</span></div><span class="rest">${rest.map(([n, v]) => n + ' ' + fmtMB(v) + 'MB').join(' / ')}</span>` : '');
}
function renderUsage() {
  const box = $('#u-chart'), sum = $('#u-sum'), hUsage = $('#h-usage');
  if (!box || !sum || !hUsage) return;
  const used = usedMB(), pct = quotaLimit() ? used / quotaLimit() * 100 : 0, warn = pct >= 80, full = pct >= 100;
  sum.innerHTML = `<b>${fmtMB(used)}MB</b> / 上限 ${fmtMB(quotaLimit())}MB（${pct.toFixed(0)}%）<div class="dnote" id="u-note">${UNOTE}</div>` + (warn ? `<div class="warnline">${full ? '容量が上限に達しました。書き込みできません。' : '容量が上限に近づいています。'}</div>` : '');
  hUsage.innerHTML = `<b>${fmtMB(used)}MB</b> / ${fmtMB(quotaLimit())}MB（${pct.toFixed(0)}%）`;
  const hl = $('#hl-usage'); if (hl) hl.textContent = '使用量 ' + fmtMB(used) + '/' + fmtMB(quotaLimit()) + 'MB';
  const meter = $('#h-meter'), mbox = $('#h-meterbox'), note = $('#h-usage-note');
  if (meter) meter.style.width = Math.min(100, pct) + '%';
  if (mbox) mbox.className = 'meter' + (full ? ' danger' : warn ? ' warn' : '');
  if (note) note.textContent = warn ? '容量が上限に近づいています。' : '';
  const W = Math.max(box.clientWidth || 236, 224), H = 280, top = 26, bw = 44, base = top + H; let cum = 0;
  const segs = stackOf().map(u => { const h = u.mb / quotaLimit() * H, y = base - (cum + u.mb) / quotaLimit() * H; cum += u.mb; return { u, h, y, mid: y + h / 2 }; });
  const lab = [...segs].sort((a, b) => b.mid - a.mid); let lim = base + 4; lab.forEach(s => { s.ly = Math.min(s.mid, lim - 26); lim = s.ly; }); const dy = Math.max(0, top + 8 - Math.min(...lab.map(s => s.ly))); lab.forEach(s => s.ly += dy); // 上にはみ出すときだけ下へずらす
  const edge = full ? 'var(--danger)' : warn ? 'var(--warn)' : 'var(--border)', lx = bw + 38;
  box.innerHTML = `<svg width="${W}" height="${base + 8}" viewBox="0 0 ${W} ${base + 8}"><text x="0" y="16" class="sub">上限 ${fmtMB(quotaLimit())}MB</text>
    <defs><clipPath id="bar-r"><rect x="0" y="${top}" width="${bw}" height="${H}" rx="10"/></clipPath></defs>
    <rect x="0" y="${top}" width="${bw}" height="${H}" rx="10" fill="var(--active)"/><g clip-path="url(#bar-r)">` +
    segs.map(s => `<rect class="seg1" data-u="${esc(s.u.name)}" x="0" y="${s.y}" width="${bw}" height="${Math.max(s.h, 1)}" fill="${UCOL[s.u.name]}"/>`).join('') + `</g>
    <rect x="0" y="${top}" width="${bw}" height="${H}" rx="10" fill="none" stroke="${edge}" stroke-width="${warn ? 2 : 1}" pointer-events="none"/>` +
    segs.map(s => `<polyline points="${bw + 2},${s.mid} ${bw + 18},${s.ly} ${lx - 4},${s.ly}" fill="none" stroke="var(--fg-dim)" stroke-width="1"/><circle cx="${bw + 2}" cy="${s.mid}" r="2" fill="var(--fg-dim)"/><text x="${lx}" y="${s.ly + 5}">${esc(s.u.name)}<tspan class="sub" dx="8">${fmtMB(s.u.mb)}MB</tspan></text>`).join('') + '</svg>';
  const P = itemsOf(catOf('プロジェクト')), pt = P.slice(0, 5), pr = P.slice(5);
  $('#u-rank').innerHTML = '<div class="pnote">プロジェクトの容量ランキング（上位5）</div>' + pt.map(([n, v], i) => `<div class="rank"><span>${i + 1}.</span><span class="rank-name" title="${esc(n)}">${esc(n)}</span><b>${fmtMB(v)}MB</b></div>`).join('') +
    (pr.length ? `<div class="rank dim"><span></span>その他（${pr.length}件）<b>${fmtMB(pr.reduce((a, x) => a + x[1], 0))}MB</b></div>` : '');
}
/* ホバー（マウス）/ タップ（タッチ）で内訳を表示 */
const tip = () => { let t = $('#u-tip'); if (!t) { t = document.createElement('div'); t.id = 'u-tip'; t.hidden = true; document.body.appendChild(t); } return t; };
function showTip(e) {
  const r = e.target.closest('[data-u]'), t = tip(); if (!r) { t.hidden = true; return; }
  t.innerHTML = tipHtml(catOf(r.dataset.u)); t.hidden = false;
  t.style.left = Math.min(e.clientX + 14, innerWidth - 310) + 'px'; t.style.top = Math.max(8, Math.min(e.clientY - 10, innerHeight - t.offsetHeight - 8)) + 'px';
}
$('#u-chart').addEventListener('mousemove', showTip); $('#u-chart').addEventListener('click', showTip);
$('#u-chart').addEventListener('mouseleave', () => tip().hidden = true);
document.addEventListener('click', e => { if (!e.target.closest('#u-chart')) tip().hidden = true; });
addEventListener('resize', () => $('#sm08').classList.contains('on') && renderUsage());

/* 詳細（右エリア）：隠さず、プロジェクト・アプリ・履歴・その他のすべてを一覧で表示する（小さいものも省略しない） */
function rUsage() {
  const cats = usageCats(), used = usageTotal(cats), showMembers = S.role === 'admin' && DATA.members.length;
  const grp = (u, title) => {
    const list = itemsOf(u), c = UCOL[u.name];
    return `<section class="ug"><div class="ug-h"><span class="sw" style="background:${c}"></span><b>${esc(title)}（${list.length}件）</b><span>${fmtMB(u.mb)}MB ・ ${(used ? u.mb / used * 100 : 0).toFixed(1)}%</span></div>` +
      list.map(([n, v]) => {
        const actions = (u.name === 'プロジェクト' ? `<button class="o" data-usage-open="${esc(n)}" title="プロジェクトを開く">${ico('open_in_new')}</button>` : '') +
          (u.name === '履歴' ? `<button class="o" data-usage-history="${esc(n)}" title="履歴を削除">${ico('delete')}</button>` : '') +
          (u.name === 'アプリ' ? `<button class="o" data-usage-open-app="${esc(n)}" title="アプリを開く">${ico('open_in_new')}</button><button class="o" data-usage-delete-app="${esc(n)}" title="アプリを削除">${ico('delete')}</button>` : '');
        return `<div class="urow"><span title="${esc(n)}">${esc(n)}</span><span class="ubar"><i style="width:${v / u.mb * 100}%;background:${c}"></i></span><b>${fmtMB(v)}MB</b>${actions ? `<span class="u-actions">${actions}</span>` : ''}</div>`;
      }).join('') + '</section>';
  };
  return `<h2>使用状況の詳細</h2><div class="tools"><label>部員<select id="usage-member"><option value="">${S.role === 'admin' ? '全体' : '全体'}</option>${showMembers ? DATA.members.map(m => `<option value="${m.id}" ${usageMember === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('') : ''}</select></label></div><p>使用 ${fmtMB(used)}MB / 上限 ${fmtMB(quotaLimit())}MB</p><p class="dnote" id="u-note2">${UNOTE}</p>` + cats.map(u => grp(u, u.name === 'その他' ? 'その他すべて（システム設定・キャッシュ・ログ）' : u.name + 'すべて')).join('');
}
const findUsageProject = name => allProjects().find(p => p.name === name) || DATA.adminProjects.find(p => p.name === name);
async function refreshUsageAfter() {
  if (S.role === 'admin') {
    try { await loadAdminUsage(usageMember || undefined); } catch (e) { showApiError(e); }
  }
  try { await loadUsage(); } catch (e) { showApiError(e); }
  if (typeof renderUsage === 'function') try { renderUsage(); } catch {}
  const t = S.tabs.find(x => x.name === '使用状況の詳細'); if (t) { t.render = rUsage; renderTabs(); }
}
document.addEventListener('change', async e => {
  if (e.target.id !== 'usage-member') return;
  usageMember = e.target.value;
  if (S.role === 'admin') {
    try { await loadAdminUsage(usageMember || undefined); } catch (err) { showApiError(err); }
    const t = S.tabs.find(x => x.name === '使用状況の詳細'); if (t) { t.render = rUsage; renderTabs(); }
  } else {
    showToast(usageMember ? '選択した部員の4区分を表示しました' : '全体の使用状況を表示しました');
  }
});
document.addEventListener('click', async e => {
  const open = e.target.closest('[data-usage-open]'), openApp = e.target.closest('[data-usage-open-app]'), hist = e.target.closest('[data-usage-history]'), delApp = e.target.closest('[data-usage-delete-app]');
  if (!open && !openApp && !hist && !delApp) return;
  const name = (open || openApp || hist || delApp).dataset.usageOpen || (open || openApp || hist || delApp).dataset.usageOpenApp || (open || openApp || hist || delApp).dataset.usageHistory || (open || openApp || hist || delApp).dataset.usageDeleteApp;
  if (open) {
    const p = findUsageProject(name);
    if (!p) return showToast('プロジェクトが見つかりません');
    if (!allProjects().some(x => x.id === p.id)) return showToast('このプロジェクトは開けません');
    openProject(p.id);
  }
  if (openApp) {
    const a = appByName(name) || DATA.apps.find(x => x.name === name);
    if (!a) return showToast('アプリが見つかりません');
    openPublishedApp(name);
  }
  if (hist) {
    const p = findUsageProject(name.replace(/ の履歴$/, ''));
    if (!p) return showToast('プロジェクトが見つかりません');
    confirmDlg('履歴を削除', `${p.name} の履歴を削除します。`, async () => {
      try {
        const list = await Api.history.log(p.id);
        const commits = Array.isArray(list) ? list : (list.commits || []);
        if (!commits.length) { showToast('履歴がありません'); return; }
        await Api.history.remove(p.id, commits[0].hash || commits[0].id);
        showToast('履歴を削除しました');
        await refreshUsageAfter();
      } catch (e) { showApiError(e); }
    });
  }
  if (delApp) {
    confirmDlg('アプリを削除', `${name} を削除します。`, async () => {
      try {
        await Api.apps.unpublish(name);
        await refreshUsageAfter(); renderPub(); refreshNotices(); showToast('削除しました');
      } catch (e) { showApiError(e); }
    });
  }
});
