/* SPDX-License-Identifier: GPL-3.0-or-later */
/* フェーズ4：管理(SM07/S14-S18)・設定(SM09)・利用状況詳細。右エリアのタブとして描画(render関数)する。
   すべて 04_API.md の admin/* を使う。管理の更新操作は、直近10分以内の Microsoft 直接ログイン（再認証）を通す。 */
function openTab(name, render, icon, after) {
  const path = '#' + name; let t = S.tabs.find(x => x.path === path);
  if (!t) { t = { name, path, g: 'g1', f: { text: '' }, render, icon, after }; S.tabs.push(t); } else { t.render = render; t.after = after; }
  S.act[t.g] = t; S.grp = t.g; hideHome(); renderTabs(); $('#app').dataset.view = 'right';
}
const bd = (t, c = '') => `<span class="badge ${c}">${t}</span>`;
const redo = () => renderTabs();
/* 管理の再認証（M04）：管理画面の「更新」操作は、ログイン（または再認証）から10分以内に限る。
   user.reauthUntil（API が返す）を過ぎていたら、認証システムの再認証をポップアップで行い、成功後に元の操作を続ける。
   IdP 結び付き部員は idp.php、そうでなければ microsoft.php を使う（並走）。
   残り時間は管理画面の上に常に表示する。 */
const REAUTH_MS = 10 * 60 * 1000;
const reauthLeft = () => Math.max(0, DATA.user.reauthUntil - Date.now()), mmssL = ms => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
let reauthCb = null, reauthWin = null, reauthPoll = 0;
function stopReauthPoll() { clearInterval(reauthPoll); reauthPoll = 0; }
function settleReauth(ok) {
  stopReauthPoll();
  try { if (reauthWin && !reauthWin.closed) reauthWin.close(); } catch { /* 閉じられない場合もある */ }
  reauthWin = null;
  if (ok) {
    $('#d-re').close(); renderAdmReauth();
    const cb = reauthCb; reauthCb = null;
    /* 再認証のあと、ページを読み込み直さなくても管理の画面が使えるように、管理のデータを取り直して、開いている管理の画面を描き直す */
    refreshAdminAfterReauth().then(() => { if (cb) cb(); });
    showToast('再認証しました。10分間、管理の操作ができます');
  }
}
async function pollReauth(started) {
  try {
    applyMe(await Api.me());
    if (reauthLeft() > 0) return settleReauth(true);
  } catch { /* ポップアップの処理中は失敗してもよい */ }
  if (Date.now() - started > 120000) { settleReauth(false); showToast('再認証を確認できませんでした'); }
  else if (reauthWin && reauthWin.closed && reauthLeft() <= 0) { stopReauthPoll(); reauthWin = null; showToast('再認証を確認できませんでした'); }
}
function reauthUrl() {
  const linked = DATA.user && (DATA.user.idpLinked || DATA.user.idp_linked);
  const providers = (DATA.meta && DATA.meta.login_providers) || [];
  if (linked || (providers.includes('idp') && !providers.includes('microsoft'))) return Api.idpUrl('reauth');
  return Api.microsoftUrl('reauth');
}
function startReauth() {
  if (reauthWin && !reauthWin.closed) { try { reauthWin.focus(); } catch { /* noop */ } return; }
  reauthWin = window.open(reauthUrl(), 'vwc-reauth', 'width=520,height=720');
  if (!reauthWin) { showToast('ポップアップがブロックされました。ブラウザの設定で許可してください'); return; }
  const started = Date.now();
  stopReauthPoll();
  reauthPoll = setInterval(() => pollReauth(started), 1000);
}
function reauth(cb) {
  if (reauthLeft() > 0) { cb(); return; }
  reauthCb = cb;
  const t = $('#re-t'); if (t) t.textContent = '切れています';
  $('#d-re').showModal();
}
const admReauthBar = () => `<div class="adm-re" role="status">${ico('verified_user')}<span data-re-t></span><button class="o" data-a="re-now">いま再認証する</button></div>`;
/* 再認証が切れている間は、管理の画面の全体を覆って、操作できなくする。認証するまで、中の情報も見せない（覆いの下の内容は取り除く） */
const isAdminTab = t => !!t && typeof t.name === 'string' && t.name.startsWith('管理: ');
function adminLockHtml() {
  return `<div class="adm-lock" role="alertdialog" aria-labelledby="adm-lock-t"><div class="box"><span class="ms big">lock_clock</span><h2 id="adm-lock-t">管理の再認証が必要です</h2><p>再認証の有効時間（10分）が切れました。Microsoft で再認証すると、続けて管理の操作ができます。</p><button class="primary" data-a="re-now">${ico('verified_user')} 再認証する</button></div></div>`;
}
function applyAdminLock() {
  const expired = reauthLeft() <= 0;
  G.forEach(g => {
    const t = S.act[g], pane = document.querySelector('#' + g + ' .pane'); if (!pane) return;
    const lock = pane.querySelector(':scope > .adm-lock');
    if (isAdminTab(t) && expired) {
      if (!lock) { const host = pane.querySelector(':scope > .adm'); if (host) { host.innerHTML = ''; host.inert = true; } pane.insertAdjacentHTML('beforeend', adminLockHtml()); }
    } else if (lock) {
      lock.remove(); const host = pane.querySelector(':scope > .adm'); if (host) host.inert = false;
      if (isAdminTab(t)) renderTabs();   // 覆いを外すときは、中身を描き直す（覆っている間は取り除いてあるため）
    }
  });
}
function renderAdmReauth() { $$('.adm-re').forEach(b => { const l = reauthLeft(); b.classList.toggle('exp', !l); $('[data-re-t]', b).textContent = l ? `管理の再認証 あと ${mmssL(l)}` : '管理の再認証 切れています'; }); applyAdminLock(); }
setInterval(renderAdmReauth, 1000);
$('#re-ok').onclick = startReauth;
$('#d-re').addEventListener('close', () => { stopReauthPoll(); });
const memName = id => (DATA.members.find(m => m.id === id) || {}).name || id || '（なし）';
const memberProjects = m => (m && m.projects && m.projects.length ? m.projects : DATA.adminProjects.filter(p => p.owner === (m && m.id)))
  .map(p => ({ id: String(p.id || p.project || ''), name: p.name || String(p.id || ''), sizeMB: num(p.sizeMB, 0), orphan: !!p.orphan }));
const memberApps = m => (m && m.apps && m.apps.length ? m.apps : DATA.adminApps.filter(a => a.owner === (m && m.id)).map(a => a.name));
/* 再認証のあとの取り直し：管理者のデータを読み直し、開いている管理のタブを描き直す。画面の再読み込みは要らない。 */
async function refreshAdminAfterReauth() {
  try { await reloadAdminAll(); } catch (e) { showApiError(e); }
  S.tabs.filter(isAdminTab).forEach(t => { /* 再描画は renderTabs が行う */ });
  renderTabs(); renderAdmReauth();
}
async function reloadAdminAll() {
  const tasks = [loadMembers(), loadAdminDevices(), loadAdminProjects(), loadAdminApps(), loadAdminUsage(), loadAdminLimits(), loadAudit(), loadAdminAnnouncements(), loadMyDevices()];
  await Promise.allSettled(tasks);
  await Promise.allSettled([loadProjects(), loadApps(), loadNotices()]);
  renderProjects(); renderPub(); renderUsage(); refreshNotices();
}

/* 左領域のメニュー */
const ADM = { members: ['部員', rMembers], devices: ['端末', rDevices], limits: ['制限値', rLimits], apps: ['アプリ(管理)', rApps], ann: ['お知らせ', rAnn], maint: ['使用状況・保守', rMaint] };
$('#sm07').onclick = async e => {
  const r = e.target.closest('[data-adm]'); if (!r) return;
  const key = r.dataset.adm;
  if (key === 'ann') { try { await loadAdminAnnouncements(); } catch (err) { showApiError(err); } }
  if (key === 'maint') { try { await loadAdminUsage(); await loadAudit(); auditOps = [...new Set(DATA.audit.map(l => l.op))]; } catch (err) { showApiError(err); } }
  openTab('管理: ' + ADM[key][0], ADM[key][1], undefined, renderAdmReauth);
};
$('#u-more').onclick = () => openTab('使用状況の詳細', rUsage, 'data_usage');

/* S14 部員 */
function rMembers() {
  const rows = DATA.members.map(m => {
    const pc = memberProjects(m).length, ac = memberApps(m).length;
    const admCell = m.idpLinked
      ? `<span title="管理者の変更は認証システム（IdP）の管理画面で行います">${m.isAdmin ? bd('あり', 'b-warn') : 'なし'} <small class="dnote">IdP</small></span>`
      : `<label><input type="checkbox" data-a="mem-adm" data-id="${m.id}" ${m.isAdmin ? 'checked' : ''} style="width:auto"> ${m.isAdmin ? bd('あり', 'b-warn') : 'なし'}</label>`;
    return `<tr><td data-l="ID">${m.id}</td><td data-l="名前">${esc(m.name)}</td><td data-l="メール">${esc(m.mail)}</td><td data-l="役職"><select data-a="mem-pos" data-id="${m.id}">${['顧問', '部長', '副部長', '部員'].map(p => `<option ${m.position === p ? 'selected' : ''}>${p}</option>`).join('')}</select></td><td data-l="管理者権限">${admCell}</td><td data-l="状態">${bd(m.active ? '有効' : '無効', m.active ? 'b-ok' : 'b-ng')}</td><td data-l="使用量">${fmtMB(m.usedMB)}MB<small class="dnote">（P${pc} / A${ac}）</small></td>` +
    `<td class="adm-actions"><div class="adm-actions-in"><button data-a="mem-edit" data-id="${m.id}" title="編集">${ico('edit')}</button><button data-a="mem-tog" data-id="${m.id}" title="無効化/有効化">${ico('block')}</button><button data-a="mem-del" data-id="${m.id}" title="削除">${ico('delete')}</button></div></td></tr>`;
  });
  return `<h2>部員</h2>${admReauthBar()}<div class="tools"><input placeholder="検索" id="adm-q"><button class="o" data-a="mem-add">${ico('person_add')} 追加</button><button class="o" data-a="csv">${ico('upload_file')} CSV一括登録</button></div>
  <table class="tbl"><thead><tr><th>ID</th><th>名前</th><th>メール</th><th>役職</th><th>管理者権限</th><th>状態</th><th>使用量</th><th></th></tr></thead><tbody>` + (rows.join('') || '<tr><td colspan="8">部員はいません</td></tr>') + '</tbody></table>';
}
let delM = null, step = 1;
function mdStep(n) {
  step = n; $$('#d-md [data-step]').forEach(s => s.hidden = +s.dataset.step !== n);
  $('#md-next').textContent = n === 4 ? '削除（再認証へ）' : '次へ';
  if (n === 2) {
    const choices = DATA.members.filter(m => m !== delM && m.active).map(m => `<option value="${m.id}">${esc(m.name)}へ移管</option>`).join('');
    $('#md-proj').innerHTML = memberProjects(delM).map(p => `<label class="fld">${esc(p.name)}<select data-project-id="${p.id}"><option value="keep">残す（孤立プロジェクトにする）</option>${choices}<option value="delete">削除</option></select></label>`).join('') || '<p>プロジェクトはありません</p>';
    $$('#md-proj select').forEach(select => select.onchange = updateMemberDeleteApps);
  }
  if (n === 3) {
    $('#md-apps').innerHTML = memberApps(delM).map(name => {
      const app = DATA.adminApps.find(x => x.name === name) || DATA.apps.find(x => x.name === name), projectId = app && app.proj || '';
      return `<label class="fld">${esc(name)}<select data-app-name="${esc(name)}" data-app-proj="${esc(projectId)}"><option value="same">状態はそのまま</option><option value="private">非公開</option><option value="unlisted">限定公開</option><option value="delete">削除</option></select></label>`;
    }).join('') || '<p>アプリはありません</p>';
    updateMemberDeleteApps();
  }
  if (n === 4) { $('#md-in').value = ''; $('#md-in').placeholder = delM.id; $('#md-next').disabled = true; } else $('#md-next').disabled = false;
}
function updateMemberDeleteApps() {
  const deletedProjects = new Set($$('#md-proj select').filter(s => s.value === 'delete').map(s => s.dataset.projectId));
  $$('#md-apps select').forEach(s => {
    const wasFixed = s.disabled;
    const fixed = deletedProjects.has(s.dataset.appProj);
    s.disabled = fixed;
    if (fixed) s.value = 'delete';
    else if (wasFixed && s.value === 'delete') s.value = 'same';
  });
}
$('#md-in').oninput = e => $('#md-next').disabled = e.target.value !== delM.id;
$('#md-next').onclick = () => step < 4 ? mdStep(step + 1) : (() => {
  const projectActions = $$('#md-proj select').map(s => ({ id: s.dataset.projectId, action: s.value === 'keep' || s.value === 'delete' ? s.value : 'transfer', to: s.value === 'keep' || s.value === 'delete' ? undefined : s.value }));
  const appActions = $$('#md-apps select').map(s => ({ name: s.dataset.appName, action: s.value === 'same' ? 'keep' : s.value }));
  const id = delM.id, name = delM.name;
  $('#d-md').close();
  reauth(async () => {
    try {
      await Api.admin.membersDelete(id, projectActions, appActions);
      await reloadAdminAll();
      showToast(`${name} さんを削除しました`);
    } catch (e) { showApiError(e); }
  });
})();

/* S15 端末 */
let devF = '';
function rDevices() {
  return `<h2>端末</h2>${admReauthBar()}<div class="tools"><select data-a="dev-f"><option value="">全部員</option>${DATA.members.map(m => `<option value="${m.id}" ${devF === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
  <table class="tbl"><thead><tr><th>部員</th><th>端末名</th><th>最終利用</th><th>有効期限</th><th></th></tr></thead><tbody>` +
    (DATA.adminDevices.filter(d => !devF || d.member === devF).map(d => `<tr><td data-l="部員">${esc(memName(d.member))}</td><td data-l="端末名">${esc(d.name)}</td><td data-l="最終利用">${esc(d.last)}</td><td data-l="有効期限">${fmtDate(d.expires)}</td><td class="adm-actions"><div class="adm-actions-in"><button data-a="dev-rev" data-i="${DATA.adminDevices.indexOf(d)}" aria-label="失効" title="失効">${ico('block')}</button><span class="adm-action-spacer" aria-hidden="true"></span></div></td></tr>`).join('') || '<tr><td colspan="5">端末はありません</td></tr>') + '</tbody></table>';
}

/* S16 制限値（14項目）。単位つき。保存の前に変更点を確認し、再認証を求める */
function rLimits() {
  return `<h2>制限値</h2>${admReauthBar()}<table class="tbl"><thead><tr><th>名前</th><th>説明</th><th>現在値</th><th>範囲</th><th></th></tr></thead><tbody>` +
    DATA.limits.map(l => `<tr><td data-l="名前">${esc(l.name)}<br><code class="lkey">${l.key}</code></td><td data-l="説明">${esc(l.description)}</td><td data-l="現在値"><input type="number" data-lim="${l.key}" value="${l.value}" style="width:90px"> ${l.unit}<div class="err" id="le-${l.key}"></div></td><td data-l="範囲">${l.min}〜${l.max} ${l.unit}</td><td><button data-a="lim-def" data-k="${l.key}"><span>既定値</span><span>(${l.default})</span><span>に戻す</span></button></td></tr>`).join('') +
    `</tbody></table><div class="tools" style="margin-top:12px"><button class="primary" data-a="lim-save">保存</button></div>`;
}
$('#bench').addEventListener('input', e => { const k = e.target.dataset.lim; if (!k) return; const l = limitOf(k), v = +e.target.value;
  $('#le-' + k).textContent = !Number.isFinite(v) || e.target.value === '' || v < l.min || v > l.max || !Number.isInteger(v) ? `${l.min}〜${l.max}の整数で入力してください` : ''; });

/* S17 アプリ（管理）：全員分。放置・孤立の印つき */
function rApps() {
  const mp = DATA.members;
  return `<h2>アプリ</h2>${admReauthBar()}<div class="tools"><select data-a="app-filter-state"><option value="">状態：すべて</option><option ${window.admAppState === '公開' ? 'selected' : ''}>公開</option><option ${window.admAppState === '限定公開' ? 'selected' : ''}>限定公開</option><option ${window.admAppState === '非公開' ? 'selected' : ''}>非公開</option></select><select data-a="app-filter-owner"><option value="">所有者：すべて</option>${DATA.members.map(m => `<option value="${m.id}" ${window.admAppOwner === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div><table class="tbl"><thead><tr><th>公開名</th><th>所有者</th><th>状態</th><th>サイズ</th><th>更新</th><th></th></tr></thead><tbody>` +
    (DATA.adminApps.filter(a => (!window.admAppState || a.state === window.admAppState) && (!window.admAppOwner || a.owner === window.admAppOwner)).map(a => `<tr><td data-l="公開名"><div class="adm-app-cell"><span class="adm-app-name">${esc(a.name)}</span><span class="adm-app-badges">${a.orphan ? bd('孤立', 'b-warn') : ''}${a.stale ? bd('放置', 'b-ng') : ''}</span><small class="adm-app-url">${APP_URL(a.name)}</small><div class="adm-app-tools"><button data-a="app-open" data-n="${esc(a.name)}">開く</button><button data-a="app-copy" data-n="${esc(a.name)}">URLをコピー</button></div></div></td><td data-l="所有者">${esc(a.ownerLabel || memName(a.owner))}</td><td data-l="状態"><select data-a="app-st" data-n="${esc(a.name)}">${['公開', '限定公開', '非公開'].map(s => `<option ${a.state === s ? 'selected' : ''}>${s}</option>`).join('')}</select></td><td data-l="サイズ">${fmtMB(a.sizeMB)}MB</td><td data-l="更新">${fmtDate(a.updatedAt)}</td>` +
      `<td class="adm-actions"><div class="adm-actions-in">${a.orphan ? `<button data-a="app-re" data-n="${esc(a.name)}" aria-label="再関連付け" title="再関連付け">${ico('link')}</button>` : '<span class="adm-action-spacer" aria-hidden="true"></span>'}<button data-a="app-mgr" data-n="${esc(a.name)}" aria-label="管理" title="管理">${ico('settings')}</button><button data-a="app-view" data-n="${esc(a.name)}" aria-label="閲覧者" title="閲覧者">${ico('group')}</button><button data-a="app-del" data-n="${esc(a.name)}" aria-label="削除" title="削除">${ico('delete')}</button></div></td></tr>`).join('') || '<tr><td colspan="6">該当するアプリはありません</td></tr>') +
    `</tbody></table><h3>他者のプロジェクトを公開</h3><div class="tools"><select id="ox-m">${mp.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select><select id="ox-p">${memberProjects(mp[0]).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select><button class="primary" data-a="ox-go">公開へ進む</button></div><div class="anote" id="ox-w"></div>`;
}
const fillOx = () => { const m = DATA.members.find(x => x.id === ($('#ox-m') || {}).value); if ($('#ox-p')) $('#ox-p').innerHTML = memberProjects(m).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join(''); };
$('#bench').addEventListener('change', e => { if (e.target.id === 'ox-m') fillOx(); });

/* S18 使用状況・保守：ランキング・GC・監査ログ（部員・操作・IPで絞り込める） */
const AUD = { m: '', op: '', ip: '' };
let maintMember = '', auditOps = [];
function auditRows() { return DATA.audit.filter(l => (!AUD.m || l.member === AUD.m) && (!AUD.op || String(l.op).includes(AUD.op)) && (!AUD.ip || String(l.ip).includes(AUD.ip))); }
function rMaint() {
  const mx = Math.max(1, ...DATA.members.map(m => m.usedMB || 0)), ops = auditOps.length ? auditOps : [...new Set(DATA.audit.map(l => l.op))];
  const selected = DATA.members.find(m => m.id === maintMember);
  const memberNames = selected ? new Set(memberProjects(selected).map(p => p.name)) : null;
  const memberAppNames = selected ? new Set(memberApps(selected)) : null;
  const cats = DATA.adminUsage.categories || [];
  const usageRows = cats.flatMap(c => (c.items || []).filter(([name]) => !selected || c.name === 'その他' || (c.name === 'プロジェクト' && memberNames.has(name)) || (c.name === 'アプリ' && memberAppNames.has(name)) || (c.name === '履歴' && [...memberNames].some(p => name.startsWith(p + ' の履歴')))).map(([name, mb]) => ({ c: c.name, name, mb })));
  return `<h2>使用状況・保守</h2>${admReauthBar()}<h3>使用量ランキング</h3><table class="tbl"><tbody>` + [...DATA.members].sort((a, b) => (b.usedMB || 0) - (a.usedMB || 0)).map(m => `<tr><td data-l="部員">${esc(m.name)}</td><td data-l="使用量" style="width:50%"><div class="bar" style="width:${(m.usedMB || 0) / mx * 100}%"></div></td><td>${fmtMB(m.usedMB || 0)}MB</td></tr>`).join('') +
    `</tbody></table><h3>容量の内訳と操作</h3><div class="tools"><label>部員<select data-maint-member><option value="">全体</option>${DATA.members.map(m => `<option value="${m.id}" ${maintMember === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label></div><table class="tbl"><thead><tr><th>区分</th><th>項目</th><th>容量</th><th>操作</th></tr></thead><tbody>${usageRows.map(x => `<tr><td>${esc(x.c)}</td><td>${esc(x.name)}</td><td>${fmtMB(x.mb)}MB</td><td>${x.c === 'プロジェクト' ? `<button class="o" data-usage-open="${esc(x.name)}">開く</button>` : ''}${x.c === '履歴' ? `<button class="o" data-usage-history="${esc(x.name)}">履歴を削除</button>` : ''}${x.c === 'アプリ' ? `<button class="o" data-usage-open-app="${esc(x.name)}">開く</button><button class="o" data-usage-delete-app="${esc(x.name)}">削除</button>` : ''}</td></tr>`).join('')}</tbody></table>` +
    `<h3>GC（不要データの回収）</h3><p>回収できる見込み：<span id="gc-est">実行して確認</span></p><button class="o" data-a="gc">GCを実行</button><span id="gc-r" class="anote"></span>
  <h3>監査ログ</h3><p class="dnote">${limitOf('audit_retention_days').value}日より古いものは削除されます。IPアドレスは、操作した端末の接続元です。</p>
  <div class="tools" id="aud-f"><select data-aud="m"><option value="">全部員</option>${DATA.members.map(m => `<option value="${m.id}" ${AUD.m === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select><select data-aud="op"><option value="">全操作</option>${ops.map(o => `<option ${AUD.op === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select><input data-aud="ip" placeholder="IPで絞り込み（例 192.0.2）" value="${esc(AUD.ip)}" style="width:190px"></div>
  <table class="tbl"><thead><tr><th>日時</th><th>部員</th><th>操作</th><th>対象</th><th>IP</th></tr></thead><tbody id="aud-b">${auditBody()}</tbody></table>`;
}
const auditBody = () => auditRows().map(l => { const at = String(l.at || '').replace('T', ' '), [date, time] = at.split(' '); return `<tr><td data-l="日時"><span class="audit-at">${fmtDate(date)}<span class="audit-time">${esc(time || '')}</span></span></td><td data-l="部員">${esc(memName(l.member))}</td><td data-l="操作">${esc(l.op)}</td><td data-l="対象">${esc(l.target)}</td><td data-l="IP"><code>${esc(l.ip)}</code></td></tr>`; }).join('') || '<tr><td colspan="5">該当するログはありません</td></tr>';
$('#bench').addEventListener('input', e => { const k = e.target.dataset.aud; if (k === 'ip') { AUD.ip = e.target.value.trim(); $('#aud-b').innerHTML = auditBody(); } });
$('#bench').addEventListener('change', e => { const k = e.target.dataset.aud; if (k === 'm' || k === 'op') { AUD[k] = e.target.value; $('#aud-b').innerHTML = auditBody(); } });
$('#bench').addEventListener('change', async e => {
  if (!e.target.matches('[data-maint-member]')) return;
  maintMember = e.target.value;
  try { await loadAdminUsage(maintMember || undefined); } catch (err) { showApiError(err); }
  const t = S.tabs.find(x => x.name === '管理: 使用状況・保守'); if (t) { t.render = rMaint; renderTabs(); }
});

/* N07 お知らせ管理：作成・編集・削除・表示の確認 */
const ANN_L = { info: '通常', warn: '注意', danger: '重要' }, ANN_K = ['お知らせ', 'メンテナンス', '障害'], ANN_A = { all: '全員', admin: '管理者のみ' };
function rAnn() {
  return `<h2>お知らせ</h2>${admReauthBar()}<div class="tools"><button class="primary" data-a="ann-new">${ico('add')} 新しいお知らせ</button></div><table class="tbl"><thead><tr><th>種別</th><th>重要度</th><th>タイトル</th><th>表示期間</th><th>対象</th><th></th></tr></thead><tbody>` +
    (DATA.announcements.map(a => `<tr><td data-l="種別">${esc(a.kind)}</td><td data-l="重要度" class="severity-cell">${bd(ANN_L[a.level], a.level === 'danger' ? 'b-ng' : a.level === 'warn' ? 'b-warn' : '')}</td><td data-l="タイトル">${esc(a.title)}</td><td data-l="表示期間">${fmtRange(a.from, a.to)}</td><td data-l="対象">${ANN_A[a.audience]}</td><td class="adm-actions"><div class="adm-actions-in"><button data-a="ann-edit" data-id="${a.id}" aria-label="編集" title="編集">${ico('edit')}</button><button data-a="ann-del" data-id="${a.id}" aria-label="削除" title="削除">${ico('delete')}</button></div></td></tr>`).join('') || '<tr><td colspan="6">お知らせはありません</td></tr>') + '</tbody></table>';
}
let annEdit = null;
const annForm = () => ({ kind: $('#an-kind').value, level: $('#an-level').value, title: $('#an-title').value.trim(), body: $('#an-body').value.trim(), from: $('#an-from').value, to: $('#an-to').value, audience: $('#an-aud').value });
function annPreview() { const a = annForm(), err = !a.title ? 'タイトルを入力してください' : !a.from || !a.to ? '表示期間を入力してください' : a.from > a.to ? '終了日は開始日以降にしてください' : '';
  $('#an-err').textContent = err; $('#an-save').disabled = !!err; $('#an-pv').innerHTML = annCard(a.title ? a : { ...a, title: '（タイトル）' }); }
function openAnn(a) { annEdit = a || null; const d = a || { kind: 'お知らせ', level: 'info', title: '', body: '', from: today(), to: today(), audience: 'all' };
  $('#an-h').textContent = a ? 'お知らせを編集' : '新しいお知らせ'; $('#an-kind').innerHTML = ANN_K.map(k => `<option ${d.kind === k ? 'selected' : ''}>${k}</option>`).join(''); $('#an-level').innerHTML = Object.entries(ANN_L).map(([k, v]) => `<option value="${k}" ${d.level === k ? 'selected' : ''}>${v}</option>`).join('');
  $('#an-aud').innerHTML = Object.entries(ANN_A).map(([k, v]) => `<option value="${k}" ${d.audience === k ? 'selected' : ''}>${v}</option>`).join(''); ['title', 'body', 'from', 'to'].forEach(k => $('#an-' + k).value = d[k]); annPreview(); $('#d-ann').showModal(); }
$('#d-ann').addEventListener('input', annPreview); $('#d-ann').addEventListener('change', annPreview);
$('#an-save').onclick = () => {
  const f = annForm(), id = annEdit && annEdit.id;
  $('#d-ann').close();
  reauth(async () => {
    try {
      await Api.admin.announcementSave(id ? { id, ...f } : f);
      await loadAdminAnnouncements();
      redo(); refreshNotices(); showToast('お知らせを保存しました');
    } catch (e) { showApiError(e); }
  });
};

/* 共通アクション。管理の「更新」操作は、すべて reauth() を通す */
$('#bench').addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b || ['SELECT', 'INPUT'].includes(b.tagName)) return; const a = b.dataset.a, id = b.dataset.id, nm = b.dataset.n;
  if (a === 're-now') { if (reauthLeft() > 0) showToast('再認証はまだ有効です'); else { reauthCb = null; $('#re-t').textContent = '切れています'; $('#d-re').showModal(); } return; }
  if (a === 'mem-add') {
    editM = null;
    const idpOn = ((DATA.meta && DATA.meta.login_providers) || []).includes('idp');
    $('#mem-h').textContent = '部員を追加'; $('#mem-ok').textContent = '追加';
    $('#mem-id').value = ''; $('#mem-id').disabled = false;
    $('#mem-name-row').hidden = true; $('#mem-note').hidden = false;
    $('#mem-name').value = ''; $('#mem-mail').value = ''; $('#mem-pos').value = '部員';
    $('#mem-adm').checked = false; $('#mem-adm').disabled = false;
    if ($('#mem-idp-note')) $('#mem-idp-note').hidden = true;
    $('#mem-mail').required = !idpOn;
    $('#mem-mail').placeholder = idpOn ? 'メールアドレス（任意）' : 'メールアドレス';
    $('#d-mem').showModal();
  }
  if (a === 'mem-edit') {
    const m = DATA.members.find(x => x.id === id); editM = m;
    const linked = !!(m && m.idpLinked);
    $('#mem-h').textContent = '部員を編集'; $('#mem-ok').textContent = '保存';
    $('#mem-id').value = m.id; $('#mem-id').disabled = true;
    $('#mem-name-row').hidden = false; $('#mem-note').hidden = true;
    $('#mem-name').value = m.named === false ? '' : m.name; $('#mem-mail').value = m.mail; $('#mem-pos').value = m.position;
    $('#mem-adm').checked = m.isAdmin; $('#mem-adm').disabled = linked;
    if ($('#mem-idp-note')) $('#mem-idp-note').hidden = !linked;
    $('#mem-mail').required = true; $('#mem-mail').placeholder = 'メールアドレス';
    $('#d-mem').showModal();
  }
  if (a === 'csv') { $('#csv-in').value = CSV_SAMPLE; $('#csv-out').innerHTML = ''; $('#csv-ok').disabled = true; $('#d-csv').showModal(); }
  if (a === 'mem-tog') { const m = DATA.members.find(x => x.id === id); if (!m) return; reauth(async () => {
    try { await Api.admin.membersUpdate({ member: m.id, name: m.name, mail: m.mail, position: m.position, is_admin: m.isAdmin, active: !m.active }); await loadMembers(); redo(); showToast(m.active ? '部員を有効化しました' : '部員を無効化しました'); }
    catch (err) { showApiError(err); } }); }
  if (a === 'mem-del') {
    delM = DATA.members.find(x => x.id === id);
    const ps = memberProjects(delM), as = memberApps(delM);
    $('#md-imp').textContent = `削除対象：${delM.name}（${delM.id}）。プロジェクト ${ps.length}件 / アプリ ${as.length}件 / 使用量 ${fmtMB(delM.usedMB)}MB`;
    $('#md-impact').innerHTML = `<h4>プロジェクト</h4><ul>${ps.map(p => `<li>${esc(p.name)}</li>`).join('') || '<li>なし</li>'}</ul><h4>アプリ</h4><ul>${as.map(n => `<li>${esc(n)}</li>`).join('') || '<li>なし</li>'}</ul>`;
    mdStep(1); $('#d-md').showModal();
  }
  if (a === 'dev-rev') { const d = DATA.adminDevices[+b.dataset.i]; if (!d) return; reauth(async () => {
    try { if (!d.id) throw new ApiError('invalid'); await Api.admin.devicesRevoke(d.id); await loadAdminDevices(); loadNotices(); redo(); refreshNotices(); showToast('端末を失効しました'); }
    catch (err) { showApiError(err); } }); }
  if (a === 'lim-def') { const l = limitOf(b.dataset.k), input = $(`[data-lim=${l.key}]`); if (input) input.value = l.default; $('#le-' + l.key).textContent = ''; }
  if (a === 'lim-save') { const inp = l => $(`[data-lim=${l.key}]`), bad = DATA.limits.some(l => { const v = +inp(l).value; return inp(l).value === '' || v < l.min || v > l.max || !Number.isInteger(v); }); if (bad) return showToast('範囲外の値があります');
    const ch = DATA.limits.filter(l => +inp(l).value !== l.value); if (!ch.length) return showToast('変更はありません');
    const changes = ch.map(l => ({ l, v: +inp(l).value }));
    confirmHtml('変更内容の確認', '<ul class="exl">' + changes.map(({ l, v }) => `<li><b>${esc(l.name)}</b>：${l.value}${l.unit} → <b>${v}${l.unit}</b></li>`).join('') + '</ul>', () => reauth(async () => {
      try {
        for (const { l, v } of changes) await Api.admin.settingsSet(l.key, v);
        await loadAdminLimits(); afterLimits(); redo(); showToast('保存しました');
      } catch (err) { showApiError(err); try { await loadAdminLimits(); } catch { /* noop */ } redo(); }
    }), '保存する'); }
  if (a === 'app-del') confirmDlg('アプリを削除', '削除するとURLは無効になります。', () => reauth(async () => {
    try { await Api.apps.unpublish(nm); await Promise.allSettled([loadAdminApps(), loadApps(), loadAdminUsage()]); redo(); renderPub(); refreshNotices(); showToast('削除しました'); }
    catch (err) { showApiError(err); } }));
  if (a === 'app-mgr') reauth(() => openApp(nm));
  if (a === 'app-open') openPublishedApp(nm);
  if (a === 'app-copy') { if (!navigator.clipboard?.writeText) return showToast('この環境ではURLをコピーできません'); navigator.clipboard.writeText(APP_URL(nm)).then(() => showToast('URLをコピーしました'), () => showToast('URLをコピーできませんでした')); }
  if (a === 'app-view') { const x = DATA.adminApps.find(y => y.name === nm) || DATA.apps.find(y => y.name === nm); if (!x) return; x.state === '非公開' ? openViewers(x) : showToast('閲覧者の管理は「非公開」のアプリで使います'); }
  if (a === 'app-re') openAssign(nm);
  if (a === 'ox-go') { const m = DATA.members.find(x => x.id === $('#ox-m').value), pid = $('#ox-p').value; if (!pid) return showToast('このプロジェクトはありません');
    $('#ox-w').textContent = m && quotaLimit() > 0 && m.usedMB > quotaLimit() * .8 ? `${m.name} さんの使用量は上限の${Math.round(m.usedMB / quotaLimit() * 100)}%です。公開すると超過する可能性があります。` : ''; reauth(() => { pubOpen(); const sel = $('#pub-proj'); if (sel) { sel.value = pid; sel.dispatchEvent(new Event('change')); } }); }
  if (a === 'gc') reauth(async () => {
    try {
      const d = await Api.admin.gc(), freed = num(d.freed_mb ?? d.freedMB ?? (d.freed_bytes ? d.freed_bytes / 1048576 : 0), 0), est = num(d.estimate_mb ?? d.estimateMB, NaN);
      const el = $('#gc-est'); if (el) el.textContent = Number.isFinite(est) ? `約 ${fmtMB(est)}MB` : '実行済み';
      $('#gc-r').textContent = ` 実行しました：${freed ? fmtMB(freed) + 'MB を回収' : '回収できるものはありませんでした'}`;
      await Promise.allSettled([loadAdminUsage(maintMember || undefined), loadAudit()]);
      redo();
    } catch (e) { showApiError(e); } });
  if (a === 'ann-new') openAnn(); if (a === 'ann-edit') openAnn(DATA.announcements.find(x => x.id === id));
  if (a === 'ann-del') confirmDlg('お知らせを削除', '削除すると、ホームの表示から消えます。', () => reauth(async () => {
    try { await Api.admin.announcementDelete(id); await loadAdminAnnouncements(); redo(); refreshNotices(); showToast('削除しました'); }
    catch (err) { showApiError(err); } }));
});
/* 制限値を変えたとき、画面に反映するもの */
function afterLimits() { loginSecLeft = Math.min(loginSecLeft, limitVal('code_ttl_sec')); if (typeof renderUsage === 'function') renderUsage(); updateStatus(); refreshNotices(); }
$('#bench').addEventListener('change', e => { const t = e.target, a = t.dataset.a; if (!a) return;
  if (a === 'mem-pos' || a === 'mem-adm') { const m = DATA.members.find(x => x.id === t.dataset.id); if (!m) return; const next = a === 'mem-pos' ? t.value : t.checked; reauth(async () => {
    try {
      await Api.admin.membersUpdate({ member: m.id, name: m.name, mail: m.mail, position: a === 'mem-pos' ? next : m.position, is_admin: a === 'mem-adm' ? next : m.isAdmin, active: m.active });
      await loadMembers(); showToast(m.name + ' さんを更新しました'); redo();
    } catch (err) { showApiError(err); redo(); } }); }
  if (a === 'dev-f') { devF = t.value; redo(); }
  if (a === 'app-st') { const x = DATA.adminApps.find(y => y.name === t.dataset.n), next = t.value; if (!x) return; t.value = x.state; if (next === x.state) return; confirmHtml('公開状態の変更', `${esc(x.name)} の公開状態を「${next}」に変更します。変更中は一時的に閲覧できない場合があります。`, () => reauth(async () => {
    try { await Api.apps.setVisibility(x.name, visValue(next)); await Promise.allSettled([loadAdminApps(), loadApps(), loadAdminUsage()]); showToast('公開状態を「' + next + '」に変更しました'); redo(); renderPub(); }
    catch (err) { showApiError(err); redo(); } }), '変更する'); }
  if (a === 'app-filter-state') { window.admAppState = t.value; redo(); }
  if (a === 'app-filter-owner') { window.admAppOwner = t.value; redo(); }
});
let editM = null;
$('#mem-ok').onclick = () => {
  const n = $('#mem-name').value.trim(), mail = $('#mem-mail').value.trim(), position = $('#mem-pos').value, isAdmin = $('#mem-adm').checked;
  const mid = $('#mem-id').value.trim();
  const idpOn = ((DATA.meta && DATA.meta.login_providers) || []).includes('idp');
  if (!editM && (!mid || mid.length > 64 || !/^[A-Za-z0-9._@-]+$/.test(mid))) return showToast('部員IDは、半角の英数字と . _ @ - だけで入力してください');
  if (editM ? (!mail || !$('#mem-mail').checkValidity()) : (!idpOn && (!mail || !$('#mem-mail').checkValidity()))) return showToast('有効なメールアドレスを入力してください');
  if (!editM && idpOn && mail && !$('#mem-mail').checkValidity()) return showToast('メールアドレスの形式を確認してください');
  const current = editM;
  reauth(async () => {
    try {
      if (current) await Api.admin.membersUpdate({ member: current.id, name: n, mail, position, is_admin: isAdmin });
      else {
        const payload = { id: mid, name: n, position, is_admin: isAdmin };
        if (mail) payload.mail = mail; else if (!idpOn) payload.mail = mail;
        if (idpOn && !mail) { /* mail 任意 */ } else { payload.mail = mail; }
        await Api.admin.membersAdd(idpOn ? { id: mid, name: n, position, is_admin: isAdmin, ...(mail ? { mail } : {}) } : { id: mid, name: n, mail, position, is_admin: isAdmin });
      }
      $('#d-mem').close(); await loadMembers(); redo(); showToast(current ? '部員を更新しました' : '部員を追加しました');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'conflict' && !current) showToast('その部員ID、またはメールアドレスは、すでに登録されています');
      else showApiError(e);
    }
  });
};

/* 孤立アプリの再関連付け */
let asnApp = null;
function openAssign(nm) {
  asnApp = DATA.adminApps.find(x => x.name === nm) || DATA.apps.find(x => x.name === nm);
  if (!asnApp) return;
  const p = [...DATA.adminProjects, ...allProjects()].find(x => x.id === asnApp.proj);
  $('#as-app').textContent = nm;
  $('#as-proj-info').textContent = p ? `孤立プロジェクト「${p.name}」と、このプロジェクトに紐づくアプリも一緒に移動します。` : 'このアプリを移動します。';
  $('#as-sel').innerHTML = DATA.members.filter(m => m.active).map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join(''); $('#d-assign').showModal();
}
$('#as-ok').onclick = () => reauth(async () => {
  const m = DATA.members.find(x => x.id === $('#as-sel').value && x.active), app = asnApp;
  if (!m || !app) return showToast('有効な移動先を選んでください');
  try {
    await Api.admin.projectsAssign(app.proj, m.id);
    $('#d-assign').close(); await reloadAdminAll();
    showToast(`プロジェクトとアプリを ${m.name} さんに関連付けました`);
  } catch (e) { showApiError(e); }
});

/* CSV一括登録：プレビュー（エラー行つき）。列：部員ID,名前,メール,役職,管理者権限 */
const POS = ['顧問', '部長', '副部長', '部員'];
const CSV_SAMPLE = '部員ID,名前,メール,役職,管理者権限\nU101,新人 一郎,ichiro@example.invalid,部員,なし\nU102,新人 二郎,not-an-email,部員,なし\nU001,重複 太郎,dup@example.invalid,部員,なし\nU103,新人 三郎,saburo@example.invalid,副部長,あり\nU104,新人 四郎,shiro@example.invalid,会計,なし';
let csvOk = [];
$('#csv-pv').onclick = () => {
  const rows = $('#csv-in').value.trim().split('\n').slice(1).map(l => l.split(',').map(s => s.trim())), seen = new Set(DATA.members.map(m => m.id)); csvOk = [];
  const res = rows.map((r, i) => { const [id, name, mail, role, adm] = r; let err = '';
    if (r.length < 5 || !id || !name) err = '列が足りません'; else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) err = 'メールアドレスの形式が正しくありません';
    else if (!POS.includes(role)) err = '役職は 顧問/部長/副部長/部員 のいずれかです'; else if (!['あり', 'なし'].includes(adm)) err = '管理者権限は「あり」か「なし」です'; else if (seen.has(id)) err = '部員IDが重複しています';
    if (!err) { seen.add(id); csvOk.push({ id, name, mail, role, admin: adm === 'あり' }); } return `<tr style="${err ? 'color:var(--danger)' : ''}"><td>${i + 2}</td><td>${esc(id || '')}</td><td>${esc(name || '')}</td><td>${err ? bd('エラー', 'b-ng') + ' ' + err : bd('OK', 'b-ok')}</td></tr>`; });
  $('#csv-out').innerHTML = `<table class="tbl"><thead><tr><th>行</th><th>ID</th><th>名前</th><th>結果</th></tr></thead><tbody>${res.join('')}</tbody></table><p class="anote">登録できる行：${csvOk.length}件 / エラー行：${rows.length - csvOk.length}件</p>`;
  $('#csv-ok').disabled = !csvOk.length; };
$('#csv-ok').onclick = () => {
  const csv = '部員ID,名前,メール,役職,管理者権限\n' + csvOk.map(m => [m.id, m.name, m.mail, m.role, m.admin ? 'あり' : 'なし'].join(',')).join('\n');
  const count = csvOk.length;
  reauth(async () => {
    try {
      const res = await Api.admin.membersImportCsv(csv);
      $('#d-csv').close(); await loadMembers(); redo();
      let msg = count + '件を登録しました';
      if (res && Number(res.ignored_admin) > 0) msg += '（管理者権限の列は無視しました。認証システムで設定してください）';
      showToast(msg, 8000);
    }
    catch (e) { showApiError(e); }
  });
};
