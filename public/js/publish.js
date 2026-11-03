/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 公開(SM05)・アプリ管理・履歴(SM11)。
   ・公開：公開名の検査（形式・予約語・重複）→ プロジェクトとコミットの選択 → 公開前の確認（範囲・除外ファイル・サイズ）→ 結果表示（M11）
   ・更新・ロールバック：変更の概要、app.json の preserve の実一覧、戻り先の情報（M11）
   ・アクセスコード：8桁の数字。再生成すると旧コードは無効（M02）
   ・履歴：差分の表示（並べて/まとめて・バイナリ）、復元の確認、未追跡ファイルの一覧、親コミットと分岐点の表示（M12）
   すべて 04_API.md の apps/* と history/* を使う。 */
const APP_URL = n => (window.VWC_APP_URL ? window.VWC_APP_URL(n) : 'app/' + encodeURIComponent(n) + '/');
const STB = { '公開': 'b-ok', '限定公開': 'b-warn', '非公開': '' };
const RANGE = { '公開': 'インターネット上の誰でも見られます', '限定公開': 'アクセスコード（8桁）を知っている人だけが見られます', '非公開': '閲覧者に追加した部員だけが見られます（ログインが必要）' };
const RESERVED = 'system file files app apps index api admin editor static assets www login logout help portal settings new null undefined root mail vendor config data tmp temp upload uploads download downloads public private auth gate preview docs web home dashboard console account user users member members project projects share history usage tool tools search status health error errors test dev staging prod backup cdn ftp ssh smtp favicon robots sitemap localhost true false none'.split(' ');
const idxOf = h => DATA.commits.findIndex(c => c.hash === h), commitOf = h => DATA.commits.find(c => c.hash === h);
const appsOfProj = () => DATA.apps.filter(a => a.proj === S.proj.id);
const appByName = name => (DATA.adminApps.find(a => a.name === name) || DATA.apps.find(a => a.name === name));
const projectRecords = () => [...DATA.projects.mine, ...DATA.projects.shared, ...DATA.adminProjects, ...DATA.members.flatMap(m => m.projects || [])];
const cachedCommits = projectId => DATA.commitsByProject[projectId] || (S.proj && projectId === S.proj.id ? DATA.commits : []);
async function loadCommits(projectId) {
  if (!projectId) return [];
  let list = cachedCommits(projectId);
  if (!list.length) {
    try { applyCommits(projectId, await Api.history.log(projectId)); list = cachedCommits(projectId); }
    catch (e) { if (!(e instanceof ApiError) || e.status !== 404) throw e; }
  }
  return list;
}
function commitsForProject(projectId, preferredHash) {
  const all = cachedCommits(projectId);
  if (!all.length) return preferredHash ? [preferredHash] : [];
  const project = projectRecords().find(p => p.id === projectId);
  const head = project && (project.headCommit || project.parentCommit) || DATA.apps.find(a => a.proj === projectId)?.commit || all[0].hash;
  const index = all.findIndex(c => c.hash === head);
  const commits = index < 0 ? [...all] : all.slice(index);
  if (preferredHash && !commits.some(c => c.hash === preferredHash)) {
    const preferred = all.find(c => c.hash === preferredHash);
    if (preferred) commits.push(preferred);
  }
  return commits;
}
async function loadTreeFor(projectId) {
  if (!projectId) return;
  if (DATA.files[projectId]) return;
  applyTree(projectId, await Api.files.tree(projectId));
}

/* 公開名の検査（形式・予約語はローカル、重複は apps/check_name） */
function checkName(v) {
  if (!v) return { ok: false, msg: '' };
  if (!/^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/.test(v)) return { ok: false, msg: '3〜30文字の英小文字・数字・ハイフン・アンダースコアのみ（先頭と末尾は英数字）' };
  if (RESERVED.includes(v)) return { ok: false, msg: '予約語のため使えません' };
  if (DATA.apps.some(a => a.name === v) || DATA.adminApps.some(a => a.name === v)) return { ok: false, msg: 'この公開名はすでに使われています' };
  return { ok: true, msg: '使えます' };
}
const NAME_REASON = {
  format: '3〜30文字の英小文字・数字・ハイフン・アンダースコアのみ（先頭と末尾は英数字）',
  reserved: '予約語のため使えません', taken: 'この公開名はすでに使われています',
  duplicate: 'この公開名はすでに使われています'
};
/* 公開するプロジェクトの候補：管理者は全員分、部員は自分のものと「公開権限」つきの共有プロジェクト */
function pubProjects() {
  if (S.role === 'admin') {
    const list = DATA.adminProjects.length ? DATA.adminProjects : DATA.members.flatMap(m => (m.projects || []).map(p => ({ id: p.id, name: p.name, owner: m.id, ownerLabel: m.name })));
    return list.filter(p => !p.orphan).map(p => ({ id: p.id, name: p.name, owner: p.owner, label: `${p.name}（${p.ownerLabel || ownerLabel(p.owner)}）` }));
  }
  return [...DATA.projects.mine.map(p => ({ id: p.id, name: p.name, owner: DATA.user.id, label: p.name })), ...DATA.projects.shared.filter(p => p.canPublish).map(p => ({ id: p.id, name: p.name, owner: p.owner, label: `${p.name}（共有）` }))];
}
/* 公開から外れるファイルと、公開されるサイズ。除外：ドットで始まるファイル・フォルダ（隠し）、履歴に入っていない（未追跡）ファイル */
function pubScan(projId) {
  const ex = [], inc = []; const w = (l, p) => l.forEach(f => { const path = p + f.n;
    if (f.n.startsWith('.')) ex.push([path + (f.t === 'dir' ? '/' : ''), '隠しファイル（. で始まる）']);
    else if (f.t !== 'dir' && /\.(php|phtml|phar|php[3-8]|pl|cgi|py|sh|asp|aspx|jsp)$/i.test(f.n)) ex.push([path, '実行系ファイル（Webへ公開しない）']);
    else if (f.t === 'dir') w(f.c, path + '/'); else inc.push([path, nodeBytes(f)]); });
  w(DATA.files[projId] || [], ''); return { ex, bytes: inc.reduce((a, x) => a + x[1], 0), n: inc.length };
}
const pjOf = id => pubProjects().find(p => p.id === id) || { id, name: id, owner: DATA.user.id, label: id };
const ownerLabel = id => (DATA.members.find(m => m.id === id) || {}).name || '（なし）';

/* ---- 公開の一覧（SM05） ---- */
function renderPub() {
  if (!$('#pub-list') || !S.proj) return;
  const l = appsOfProj();
  $('#pub-list').innerHTML = l.length ? l.map(a => `<div class="app-row"><span class="ms app-row-icon">public</span><div class="app-row-main"><b>${esc(a.name)}</b><small title="${esc(a.commit + ' ・ 更新 ' + fmtDate(a.updatedAt) + ' ・ サイズ ' + a.sizeMB + 'MB ・ ' + APP_URL(a.name))}">${a.commit} ・ 更新 ${fmtDate(a.updatedAt)} ・ サイズ ${a.sizeMB}MB ・ ${APP_URL(a.name)}</small></div><span class="app-row-actions"><button class="o" data-copy="${APP_URL(a.name)}" title="URLをコピー" aria-label="URLをコピー">${ico('content_copy')}</button><button class="o" data-open-app="${esc(a.name)}" title="アプリを開く">開く</button>${a.stale ? '<span class="badge b-ng" title="しばらく更新していません">放置</span>' : ''}<span class="badge ${STB[a.state]}">${a.state}</span><button class="o" title="管理" data-ad="${esc(a.name)}">${ico('tune')}</button></span></div>`).join('') : '<div class="pnote">公開しているアプリはありません</div>';
}
async function openPublishedApp(name) {
  const app = appByName(name);
  if (!app) return showToast('アプリが見つかりません');
  try {
    const d = await Api.apps.open(name);
    const url = (d && (d.url || d.redirect || d.location)) || APP_URL(name);
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (e) { showApiError(e); }
}
$('#pub-list').onclick = e => { const open = e.target.closest('[data-open-app]'); if (open) return openPublishedApp(open.dataset.openApp); const b = e.target.closest('[data-ad]'); if (!b) return; openApp(b.dataset.ad); };

/* ---- 新しく公開（3ステップ：入力 → 確認 → 結果） ---- */
const pubStep = n => $$('#d-pub [data-pstep]').forEach(s => s.hidden = s.dataset.pstep !== String(n));
function pubOpen() {
  const ps = pubProjects(); $('#pub-name').value = ''; $('#pub-chk').textContent = ''; $('#pub-chk').className = 'dnote';
  $('#pub-proj').innerHTML = ps.map(p => `<option value="${p.id}">${esc(p.label)}</option>`).join(''); if (ps.some(p => p.id === S.proj.id)) $('#pub-proj').value = S.proj.id;
  fillPubCommits(); $('input[name=ps][value=公開]').checked = true;
  $('#pub-next').disabled = true; pubStep(1); $('#d-pub').showModal();
}
function fillPubCommits(preferredHash) {
  const projectId = $('#pub-proj').value;
  const select = $('#pub-commit');
  select.innerHTML = '<option value="">読み込み中…</option>'; $('#pub-next').disabled = true;
  loadCommits(projectId).then(() => {
    if ($('#pub-proj').value !== projectId) return;
    const commits = commitsForProject(projectId, preferredHash);
    select.innerHTML = commits.length ? commits.map(c => `<option value="${c.hash}">${esc(c.message)} (${String(c.hash).slice(0, 7)})</option>`).join('') : '<option value="">コミットがありません</option>';
    if (preferredHash && commits.some(c => c.hash === preferredHash)) select.value = preferredHash;
    $('#pub-next').disabled = !checkName($('#pub-name').value).ok || !select.value;
  }).catch(e => { select.innerHTML = '<option value="">読み込めませんでした</option>'; showApiError(e); });
}
$('#pub-proj').onchange = () => fillPubCommits();
$('#pub-new').onclick = pubOpen; $('#pub-upd').onclick = () => openApp();
let nameCheckTimer = 0, nameCheckSeq = 0;
function checkNameUi(v) {
  const local = checkName(v), out = $('#pub-chk');
  out.textContent = local.msg; out.className = 'dnote ' + (v ? (local.ok ? 'ok' : 'ng') : '');
  $('#pub-next').disabled = !local.ok || !$('#pub-commit').value;
  clearTimeout(nameCheckTimer);
  const seq = ++nameCheckSeq;
  if (!local.ok) return;
  nameCheckTimer = setTimeout(async () => {
    try {
      const d = await Api.apps.checkName(v);
      if (seq !== nameCheckSeq || $('#pub-name').value !== v) return;
      const ok = d.ok !== false && !d.error;
      out.textContent = ok ? '使えます' : (NAME_REASON[d.reason] || d.message || 'この公開名は使えません');
      out.className = 'dnote ' + (ok ? 'ok' : 'ng');
      $('#pub-next').disabled = !ok || !$('#pub-commit').value;
    } catch (e) {
      if (seq !== nameCheckSeq) return;
      if (e instanceof ApiError && e.code === 'invalid') {
        out.textContent = NAME_REASON.format; out.className = 'dnote ng'; $('#pub-next').disabled = true;
      }
      /* 通信できないときは、ローカルの形式・予約語・既知の重複だけで続行する */
    }
  }, 250);
}
$('#pub-name').oninput = e => checkNameUi(e.target.value);
$('#pub-next').onclick = async () => {
  const name = $('#pub-name').value, st = $('input[name=ps]:checked').value, p = pjOf($('#pub-proj').value), hash = $('#pub-commit').value;
  try { await loadTreeFor(p.id); } catch (e) { return showApiError(e); }
  const c = commitsForProject(p.id).find(x => x.hash === hash), sc = pubScan(p.id), max = limitVal('max_publish_mb') * MB, over = sc.bytes > max;
  if (!c) return showToast('このプロジェクトにコミットがありません');
  $('#pub-sum').innerHTML = `<dl class="kv"><dt>公開名・URL</dt><dd><b>${esc(name)}</b><br>${APP_URL(name)}</dd><dt>もとになるもの</dt><dd>${esc(p.label)} ／ ${c.hash} ${esc(c.message)}</dd>` +
    `<dt>公開状態</dt><dd>${st}${st === '限定公開' ? '（アクセスコードを自動で作ります）' : ''}</dd><dt>公開範囲</dt><dd>${RANGE[st]}</dd>` +
    `<dt>公開するもの</dt><dd>${sc.n}個のファイル（${kb(sc.bytes)}）</dd>` +
    `<dt>公開されないもの</dt><dd>${sc.ex.length ? '<ul class="exl">' + sc.ex.map(x => `<li><code>${esc(x[0])}</code> <small>${x[1]}</small></li>`).join('') + '</ul>' : 'なし'}</dd></dl>` +
    (over ? `<p class="err">サイズ超過：公開できるのは ${limitVal('max_publish_mb')}MB までです（${kb(sc.bytes)}）。不要なファイルを減らしてください。</p>` : '');
  $('#pub-go').disabled = over; $('#pub-go').dataset.k = JSON.stringify({ name, st, proj: p.id, commit: c.hash, bytes: sc.bytes, ex: sc.ex }); pubStep(2);
};
$('#pub-back').onclick = () => pubStep(1);
$('#pub-go').onclick = async () => {
  const k = JSON.parse($('#pub-go').dataset.k), p = pjOf(k.proj), btn = $('#pub-go');
  btn.disabled = true;
  try {
    const d = await Api.apps.publish(k.name, k.proj, k.commit, visValue(k.st));
    const app = (d && (d.app || d.application)) || {};
    let code = (d && (d.code || d.access_code)) || app.code || '';
    if (k.st === '限定公開' && !code) { try { const c = await Api.apps.codeGet(k.name); code = c.code || c.access_code || ''; } catch { /* 表示だけ続行 */ } }
    await Promise.allSettled([loadApps(), DATA.user.isAdmin ? loadAdminApps() : Promise.resolve()]);
    const excluded = (d && (d.excluded || d.exclude)) || k.ex;
    $('#pub-res').innerHTML = `<p class="okline">${ico('check_circle')}<b>公開しました</b></p><dl class="kv"><dt>URL</dt><dd><a href="#" onclick="return false">${APP_URL(k.name)}</a> <button class="o" data-copy="${APP_URL(k.name)}">${ico('content_copy')}コピー</button></dd><dt>公開状態</dt><dd>${k.st}（${RANGE[k.st]}）</dd>` +
      (code ? `<dt>アクセスコード</dt><dd><b class="code8">${fmtCode(code)}</b> <button class="o" data-copy="${digits(code)}">${ico('content_copy')}コピー</button><br><small>このコードを、見せたい人に伝えてください。</small></dd>` : '') +
      `<dt>公開されなかったもの</dt><dd>${excluded.length ? '<ul class="exl">' + excluded.map(x => Array.isArray(x) ? `<li><code>${esc(x[0])}</code> <small>${esc(x[1] || '')}</small></li>` : `<li><code>${esc(x)}</code></li>`).join('') + '</ul>' : 'なし'}</dd></dl>`; pubStep(3);
    notify('publish', `「${k.name}」を公開しました`); renderPub();
  } catch (e) {
    showApiError(e);
    if (e instanceof ApiError && e.code === 'invalid') { $('#pub-chk').textContent = '公開名を確認してください'; $('#pub-chk').className = 'dnote ng'; pubStep(1); }
  } finally { btn.disabled = false; }
};
document.addEventListener('click', e => { const c = e.target.closest('[data-copy]'); if (c) { navigator.clipboard && navigator.clipboard.writeText(c.dataset.copy).catch(() => {}); showToast('コピーしました'); } });

/* ---- アプリ管理（更新・ロールバック・状態・アクセスコード・削除） ---- */
const curApp = () => appByName($('#ap-sel').value);
async function appJson(projId) {
  try { await loadTreeFor(projId); } catch { return { err: 'app.json を読み取れません' }; }
  const f = (DATA.files[projId] || []).find(x => x.n === 'app.json');
  if (!f) return { err: 'app.json がありません（引き継ぐファイルの指定なし）' };
  try { await ensureText(f, 'app.json', projId); const j = JSON.parse(f.text || ''); return { list: Array.isArray(j.preserve) ? j.preserve : [] }; }
  catch { return { err: 'app.json を読み取れません（JSONの書式エラー）' }; }
}
function changeSummary(projectId, from, to) {
  const list = cachedCommits(projectId), i = list.findIndex(c => c.hash === from), j = list.findIndex(c => c.hash === to);
  if (i < 0 || j < 0 || i === j) return null; const newer = j < i, lo = Math.min(i, j), hi = Math.max(i, j), t = { add: 0, mod: 0, del: 0 };
  for (let k = lo; k < hi; k++) { const s = list[k].stat || {}; t.add += s.add || 0; t.mod += s.mod || 0; t.del += s.del || 0; }
  return { newer, n: hi - lo, ...t };
}
async function openApp(name) {
  if (DATA.user.isAdmin) { try { await loadAdminApps(); } catch (e) { showApiError(e); } }
  const l = S.role === 'admin' ? DATA.adminApps : DATA.apps.filter(a => a.owner === DATA.user.id || a.proj === S.proj.id); if (!l.length) return showToast('公開しているアプリはありません');
  $('#ap-sel').innerHTML = l.map(a => `<option value="${esc(a.name)}">${esc(a.name)}</option>`).join(''); $('#ap-sel').value = name || l[0].name;
  await fillApp(); $('#d-app').showModal();
}
async function fillApp() {
  const a = curApp(); if (!a) return;
  try { await loadCommits(a.proj); } catch (e) { showApiError(e); }
  const commits = commitsForProject(a.proj, a.commit);
  $('#ap-commit').innerHTML = commits.map(c => `<option value="${c.hash}">${esc(c.message)} (${String(c.hash).slice(0, 7)})</option>`).join('');
  $$('input[name=as]').forEach(r => r.checked = r.value === a.state); $('#ap-codebox').hidden = a.state !== '限定公開';
  $('#ap-code').value = ''; $('#ap-code').type = 'password'; $('#ap-codemsg').textContent = '';
  if (a.state === '限定公開') {
    try { const d = await Api.apps.codeGet(a.name); a.code = d.code || d.access_code || a.code || ''; } catch (e) { if (!(e instanceof ApiError) || e.status !== 404) showApiError(e); }
    $('#ap-code').value = fmtCode(a.code);
  }
  $('#ap-commit').value = commits[0]?.hash || ''; await fillUpdInfo();
}
async function fillUpdInfo() {
  const a = curApp(); if (!a) return;
  const to = $('#ap-commit').value, target = commitsForProject(a.proj).find(c => c.hash === to), s = target && changeSummary(a.proj, a.commit, to), pr = await appJson(a.proj);
  $('#ap-sum').innerHTML = (s ? `現在 <code>${a.commit}</code> → <code>${to}</code>：${s.newer ? '新しい版へ' : '古い版へ'}（${s.n}件のコミット分。追加 ${s.add}・変更 ${s.mod}・削除 ${s.del} ファイル）` : `現在と同じ版です（<code>${a.commit}</code>）`);
  $('#ap-pres').innerHTML = '更新で引き継ぐファイル（app.json の preserve）：' + (pr.err ? `<span class="err">${pr.err}</span>` : pr.list.length ? pr.list.map(x => `<code>${esc(x)}</code>`).join(' ') : 'なし');
  $('#ap-upd').disabled = !s || !s.newer; $('#ap-rb').disabled = !s || s.newer;
}
$('#ap-sel').onchange = () => fillApp(); $('#ap-commit').onchange = () => fillUpdInfo();
$$('input[name=as]').forEach(r => r.onchange = async () => {
  const a = curApp(), next = r.value;
  if (!a || next === a.state) return;
  confirmDlg('公開状態の変更', `${a.name} の公開状態を「${next}」に変更します。変更中は一時的に閲覧できない場合があります。`, async () => {
    try {
      await Api.apps.setVisibility(a.name, visValue(next));
      await Promise.allSettled([loadApps(), DATA.user.isAdmin ? loadAdminApps() : Promise.resolve()]);
      const fresh = appByName(a.name); if (fresh) Object.assign(a, fresh);
      await fillApp(); renderPub(); showToast('公開状態を「' + next + '」に変更しました');
    } catch (e) { showApiError(e); fillApp(); }
  });
  fillApp();
});
$('#ap-show').onclick = () => $('#ap-code').type = $('#ap-code').type === 'password' ? 'text' : 'password';
$('#ap-copy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(digits(curApp().code)).catch(() => {}); showToast('コピーしました（数字8桁）'); };
$('#ap-regen').onclick = () => confirmDlg('アクセスコードを再生成', '再生成すると、現在のコードでは入れなくなります。新しいコードを、見せたい人に伝え直してください。', async () => {
  const a = curApp(), old = a.code;
  try {
    const d = await Api.apps.codeRegen(a.name); a.code = d.code || d.access_code || '';
    $('#ap-code').value = fmtCode(a.code); $('#ap-codemsg').textContent = `新しいコードを発行しました。旧コード（${fmtCode(old)}）は無効になりました。`; $('#ap-code').type = 'text';
  } catch (e) { showApiError(e); }
});
$('#ap-upd').onclick = async () => {
  const a = curApp(), to = $('#ap-commit').value, c = commitsForProject(a.proj).find(x => x.hash === to), s = c && changeSummary(a.proj, a.commit, to), pr = await appJson(a.proj); if (!c || !s) return;
  confirmHtml('アプリを更新', `<b>${esc(a.name)}</b> を <code>${to}</code>（${esc(c.message)}）に更新します。<br>${s.n}件のコミット分：追加 ${s.add}・変更 ${s.mod}・削除 ${s.del} ファイル。<br>引き継ぐファイル：${pr.err ? pr.err : pr.list.length ? pr.list.join('、') : 'なし'}`, async () => {
    const was = a.commit;
    try {
      await Api.apps.update(a.name, to);
      await Promise.allSettled([loadApps(), DATA.user.isAdmin ? loadAdminApps() : Promise.resolve()]);
      const fresh = appByName(a.name); if (fresh) Object.assign(a, fresh); await fillApp();
      resultDlg('更新しました', `<dl class="kv"><dt>アプリ</dt><dd>${esc(a.name)}</dd><dt>版</dt><dd><code>${was}</code> → <code>${to}</code></dd><dt>URL</dt><dd>${APP_URL(a.name)}</dd><dt>引き継いだファイル</dt><dd>${pr.list ? pr.list.map(x => `<code>${esc(x)}</code>`).join(' ') || 'なし' : pr.err}</dd></dl>`);
    } catch (e) { showApiError(e); }
  }, '更新する');
};
$('#ap-rb').onclick = async () => {
  const a = curApp(), to = $('#ap-commit').value, c = commitsForProject(a.proj).find(x => x.hash === to); if (!c) return;
  confirmHtml('ロールバック', `<b>${esc(a.name)}</b> を、次の版に戻します。<dl class="kv"><dt>戻り先</dt><dd><code>${c.hash}</code> ${esc(c.message)}</dd><dt>作った人・日時</dt><dd>${esc(c.by)}・${c.at}</dd><dt>いまの版</dt><dd><code>${a.commit}</code></dd></dl>公開中のアプリが、すぐにこの版に変わります。`, async () => {
    const was = a.commit;
    try {
      await Api.apps.update(a.name, to);
      await Promise.allSettled([loadApps(), DATA.user.isAdmin ? loadAdminApps() : Promise.resolve()]);
      const fresh = appByName(a.name); if (fresh) Object.assign(a, fresh); await fillApp();
      resultDlg('ロールバックしました', `<dl class="kv"><dt>アプリ</dt><dd>${esc(a.name)}</dd><dt>版</dt><dd><code>${was}</code> → <code>${to}</code>（${esc(c.message)}）</dd></dl>`);
    } catch (e) { showApiError(e); }
  }, '戻す');
};
$('#ap-del').onclick = () => confirmDlg('アプリを削除', `${curApp().name} を削除します。URLは無効になります。`, async () => {
  const a = curApp();
  try {
    await Api.apps.unpublish(a.name);
    await Promise.allSettled([loadApps(), DATA.user.isAdmin ? loadAdminApps() : Promise.resolve()]);
    $('#d-app').close(); renderPub(); refreshNotices(); showToast('削除しました');
  } catch (e) { showApiError(e); }
});

/* ---- 履歴（SM11） ---- */
const laneCls = c => c.rel && c.rel.dir ? 'cm-' + c.rel.dir : '', headHash = () => DATA.commits[0]?.hash || '';
function renderHist() {
  if (!$('#hi-list')) return;
  $('#hi-list').innerHTML = DATA.commits.map(c => `<div class="cm ${laneCls(c)}" data-h="${c.hash}"><div class="cm-g"><i class="hdot"></i>${c.rel ? '<i class="hbr"></i>' : ''}</div><div class="cm-b"><div class="cm-t">${esc(c.message)}</div><div class="cm-m">${c.short || c.hash} ・ ${esc(c.by)} ・ ${c.at}</div>` +
    `<div class="cm-m">${c.parent ? '親: ' + c.parent : '最初のコミット（親なし）'}</div>` + (c.rel ? `<div class="cm-r ${c.rel.dir}">${ico(c.rel.dir === 'in' ? 'call_merge' : c.rel.kind === 'publish' ? 'public' : 'call_split')}${esc(c.rel.t)}</div>` : '') + `</div><button title="ここに戻す" data-rs="${c.hash}">${ico('restore')}</button><button title="コミットの操作" data-hmenu="${c.hash}">${ico('more_vert')}</button></div>`).join('');
  const un = []; (function w(l, p) { l.forEach(f => f.t === 'dir' ? w(f.c, p + f.n + '/') : f.untracked && un.push([p + f.n, nodeBytes(f)])); })(files(), '');
  $('#hi-un').innerHTML = un.length ? `<div class="un-h">${ico('visibility_off')}<b>未追跡のファイル</b></div><div class="pnote">${limitVal('track_limit_mb')}MB を超えるため、履歴に入りません（戻したり、差分を見たりできません）。</div>` + un.map(x => `<div class="un-r">${fico(x[0].split('/').pop())}<span class="nm">${esc(x[0])}</span><span class="dnote">${kb(x[1])}</span></div>`).join('') : '';
  updateCommitControl();
}
function updateCommitControl() {
  const status = getCommitStatus(), n = status.add + status.mod + status.del;
  const count = $('#hi-count'), button = $('#hi-save'), message = $('#hi-msg');
  if (!count || !button || !message) return;
  count.textContent = `追加 ${status.add}・変更 ${status.mod}・削除 ${status.del}`;
  const length = message.value.trim().length;
  button.disabled = n === 0 || length < 1 || length > 200 || S.role === 'shared-view' || S.proj?.perm === 'view';
}
$('#hi-msg').addEventListener('input', updateCommitControl);
VWC.on('role', updateCommitControl);
let historyMenuHash = '';
const historyMenu = $('#history-menu');
$('#hi-list').onclick = async e => {
  const menuButton = e.target.closest('[data-hmenu]');
  if (menuButton) {
    historyMenuHash = menuButton.dataset.hmenu;
    const owner = S.proj.owner === DATA.user.id || S.proj.perm === 'owner' || !S.proj.perm;
    $('[data-hm=prune]', historyMenu).hidden = !owner;
    $('[data-hm=prune]', historyMenu).disabled = !owner || historyMenuHash === headHash() || DATA.commits.findIndex(c => c.hash === historyMenuHash) >= DATA.commits.length - 1;
    historyMenu.hidden = false;
    const rect = historyMenu.getBoundingClientRect(), box = menuButton.getBoundingClientRect();
    historyMenu.style.left = `${Math.max(4, Math.min(box.left, innerWidth - rect.width - 4))}px`;
    historyMenu.style.top = `${Math.max(4, Math.min(box.bottom, innerHeight - rect.height - 4))}px`;
    return;
  }
  const r = e.target.closest('[data-rs]'), row = e.target.closest('[data-h]');
  if (!row) return;
  if (r) return restoreCommit(r.dataset.rs);
  openInfo('差分 ' + row.dataset.h, await diffHtml(row.dataset.h));
};
historyMenu.addEventListener('click', async e => {
  const action = e.target.closest('[data-hm]')?.dataset.hm, hash = historyMenuHash;
  if (!action || !hash) return;
  historyMenu.hidden = true;
  if (action === 'diff') return openInfo('差分 ' + hash, await diffHtml(hash));
  if (action === 'restore') return restoreCommit(hash);
  if (action === 'branch') {
    $('#btn-new').click();
    const mode = $('[name=cnp-mode][value=branch]'); mode.checked = true; mode.onchange();
    $('#cnp-src').value = S.proj.id; $('#cnp-commit').value = hash; return;
  }
  if (action === 'publish') {
    pubOpen(); $('#pub-proj').value = S.proj.id; fillPubCommits(hash); return;
  }
  if (action === 'prune') pruneHistory(hash);
});
document.addEventListener('click', e => { if (!e.target.closest('#history-menu') && !e.target.closest('[data-hmenu]')) historyMenu.hidden = true; });
async function restoreCommit(hash) {
  const commit = commitOf(hash);
  if (!commit) return showToast('復元するコミットの内容を確認できません');
  confirmHtml('このコミットに復元', `<code>${hash}</code>（${esc(commit.message)}）の状態に戻します。<br><br>復元前の状態を「復元前の自動保存」として自動コミットに残します。`, async () => {
    try {
      await Api.history.restore(S.proj.id, hash);
      await reloadProjectHistory();
      showToast('復元しました');
    } catch (e) { showApiError(e); }
  }, '復元する');
}
async function pruneHistory(hash) {
  const i = DATA.commits.findIndex(c => c.hash === hash), count = DATA.commits.length - i - 1;
  if (i <= 0 || count <= 0 || !(S.proj.owner === DATA.user.id || S.proj.perm === 'owner' || !S.proj.perm)) return;
  const history = DATA.usage.categories.find(c => c.name === '履歴'), estimate = history ? Math.round(history.mb * count / Math.max(1, DATA.commits.length)) : 0;
  confirmHtml('これより古い履歴を削除', `選んだコミット <code>${hash}</code> は残ります。<br>削除するコミット数：${count}件<br>回収の見込み（GC後）：約${estimate}MB`, async () => {
    try {
      await Api.history.remove(S.proj.id, hash);
      await reloadProjectHistory();
      await loadUsage().catch(() => {});
      renderUsage(); showToast(`${count}件の古い履歴を削除しました`);
    } catch (e) { showApiError(e); }
  }, '削除する');
}
async function reloadProjectHistory() {
  const pid = S.proj.id;
  const [log, status] = await Promise.allSettled([Api.history.log(pid), Api.history.status(pid)]);
  if (log.status === 'fulfilled') applyCommits(pid, log.value);
  if (status.status === 'fulfilled') applyStatus(pid, status.value);
  await reloadTree(false).catch(() => {});
  initBase(); renderHist(); renderTree(); renderUsage();
}
const dline = (cls, t) => `<div class="dl ${cls}"><span class="dg">${cls === 'del' ? '−' : cls === 'add' ? '＋' : ' '}</span><span class="dt">${esc(t)}</span></div>`;
/* 連続する変更行（del/add）を1つの塊（hunk）にまとめる。変更のない行（eq）は塊の区切りになる。 */
function diffHunks(ops) {
  const hunks = []; let cur = null;
  (ops || []).forEach(o => {
    if (o.op === 'eq') { cur = null; return; }
    if (!cur) { cur = { old: [], neu: [] }; hunks.push(cur); }
    (o.op === 'del' ? cur.old : cur.neu).push(o.line);
  });
  return hunks.map(h => ({ old: h.old.join('\n'), neu: h.neu.join('\n'), hasOld: h.old.length > 0, hasNew: h.neu.length > 0 }));
}
function diffList(d) {
  if (Array.isArray(d)) return d;
  if (!d) return [];
  if (Array.isArray(d.files)) return d.files;
  if (Array.isArray(d.diff)) return d.diff;
  const diffs = d.diffs && typeof d.diffs === 'object' ? d.diffs : {};
  const out = Object.keys(diffs).map(path => {
    const x = diffs[path] || {};
    if (x.type === 'bin' || x.binary) return { path, type: 'bin', before: x.before, after: x.after };
    return { path, hunks: diffHunks(x.diff) };
  });
  (d.renamed || []).forEach(r => out.push({ path: `${r.from} → ${r.to}`, hunks: [] }));
  return out;
}
async function diffHtml(hash) {
  const c = commitOf(hash);
  let d;
  try { d = await Api.history.diff(S.proj.id, hash); }
  catch (e) { showApiError(e); return '<p class="pnote">差分を取得できませんでした</p>'; }
  const list = diffList(d);
  if (!list.length) return '<p class="pnote">差分はありません</p>';
  const files = list.map(f => {
    if (f.type === 'bin' || f.binary) return `<section class="df"><h4>${fico(f.path)} ${esc(f.path)}</h4><p class="bin">バイナリ（画像・音声など）：変更あり。サイズ ${kb(f.before || 0)} → ${kb(f.after || 0)}</p></section>`;
    const hunks = Array.isArray(f.hunks) ? f.hunks : [];
    const uni = hunks.map(h => (h.old ? h.old.split('\n').map(t => dline('del', t)).join('') : '') + ((h.neu ?? h.new ?? '') !== '' || h.hasNew ? (h.neu ?? h.new ?? '').split('\n').map(t => dline('add', t)).join('') : '')).join('<div class="dl sep">⋯</div>');
    const side = hunks.map(h => { const o = h.old ? h.old.split('\n') : [], n = ((h.neu ?? h.new ?? '') !== '' || h.hasNew) ? (h.neu ?? h.new ?? '').split('\n') : [], k = Math.max(o.length, n.length); return Array.from({ length: k }, (_, i) => `<div class="sr"><div class="dl ${o[i] !== undefined ? 'del' : 'emp'}"><span class="dt">${esc(o[i] || '')}</span></div><div class="dl ${n[i] !== undefined ? 'add' : 'emp'}"><span class="dt">${esc(n[i] || '')}</span></div></div>`).join(''); }).join('');
    return `<section class="df"><h4>${fico(f.path)} ${esc(f.path)}</h4><div class="dv-u">${uni}</div><div class="dv-s"><div class="sr sh"><b>変更前</b><b>変更後</b></div>${side}</div></section>`;
  }).join('');
  return `<div class="diffv" data-view="u"><div class="dtools"><b>${esc(c ? c.message : '')} (${String(hash).slice(0, 7)})</b><span class="sp"></span><button class="o on" data-dv="u">まとめて</button><button class="o" data-dv="s">並べて</button></div>${files}</div>`;
}
document.addEventListener('click', e => { const b = e.target.closest('[data-dv]'); if (!b) return; const w = b.closest('.diffv'); w.dataset.view = b.dataset.dv; w.querySelectorAll('[data-dv]').forEach(x => x.classList.toggle('on', x === b)); });
$('#hi-save').onclick = async () => {
  const message = $('#hi-msg').value.trim(), status = getCommitStatus();
  if (message.length < 1 || message.length > 200) return showToast('コミットメッセージは1〜200文字で入力してください');
  if (!(status.add + status.mod + status.del)) return showToast('変更がないためコミットできません');
  if (S.role === 'shared-view' || S.proj.perm === 'view') return showToast('閲覧のみのためコミットできません');
  try {
    await Api.history.commit(S.proj.id, message);
    $('#hi-msg').value = ''; await reloadProjectHistory(); showToast(anyBlue() ? 'コミットしました（未保存のファイルは含まれません）' : 'コミットしました');
  } catch (e) { showApiError(e); }
};

/* プロジェクト切替・役割切替で再描画 */
const _openProjectPub = openProject; openProject = async id => { await _openProjectPub(id); renderShare(); renderPub(); renderHist(); };
VWC.on('role', () => { renderShare(); renderPub(); });
renderPub(); renderHist();

/* 閲覧者管理（非公開アプリ）：公開パネルと管理(S17)の両方から使う */
let vwApp = null, vwCandidates = [], vwTimer = 0;
async function openViewers(a) {
  vwApp = a; $('#vw-app').textContent = a.name + '（' + a.state + '）';
  try { const d = await Api.apps.viewersList(a.name); a.viewers = arr(d, 'viewers').map(v => typeof v === 'string' ? v : (v.id || v.member || v.member_id)); }
  catch (e) { showApiError(e); }
  $('#vw-dl').innerHTML = ''; vwCandidates = []; renderViewers(); $('#d-view').showModal();
}
function renderViewers() {
  $('#vw-list').innerHTML = (vwApp.viewers || []).map(id => { const m = DATA.members.find(x => x.id === id) || vwCandidates.find(x => x.id === id); return `<div class="row"><span class="nm">${esc(m ? m.name : id)}</span><button data-vr="${id}" title="解除">${ico('person_remove')}</button></div>`; }).join('') || '<div class="pnote">閲覧者はいません。追加するまで、所有者以外は開けません。</div>';
}
$('#vw-in').addEventListener('input', e => {
  const q = e.target.value.trim(); clearTimeout(vwTimer);
  vwTimer = setTimeout(async () => {
    try { vwCandidates = await Api.searchMembers(q); } catch { vwCandidates = []; }
    $('#vw-dl').innerHTML = vwCandidates.map(m => `<option value="${esc(m.name)}（${m.id}）">`).join('');
  }, 200);
});
const viewerMember = v => vwCandidates.find(m => v === `${m.name}（${m.id}）` || v === m.id || v === m.name) || DATA.members.find(m => v === `${m.name}（${m.id}）` || v === m.id || v === m.name);
$('#vw-add').onclick = async () => {
  const m = viewerMember($('#vw-in').value.trim());
  if (!m) return showToast('該当する部員がいません');
  if ((vwApp.viewers || []).includes(m.id)) return showToast('すでに追加されています');
  try { await Api.apps.viewerAdd(vwApp.name, m.id); vwApp.viewers = [...(vwApp.viewers || []), m.id]; $('#vw-in').value = ''; renderViewers(); }
  catch (e) { showApiError(e); }
};
$('#vw-list').onclick = async e => {
  const b = e.target.closest('[data-vr]'); if (!b) return;
  try { await Api.apps.viewerRemove(vwApp.name, b.dataset.vr); vwApp.viewers = (vwApp.viewers || []).filter(x => x !== b.dataset.vr); renderViewers(); }
  catch (e) { showApiError(e); }
};
$('#ap-view').onclick = () => curApp().state === '非公開' ? openViewers(curApp()) : showToast('閲覧者の管理は「非公開」のときに使います');
