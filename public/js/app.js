/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 画面ロジック。静的DOMは index.html、リスト/タブ/プレビューだけ動的に描画する */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const S = { role: 'member', proj: null, tabs: [], act: { g1: null, g2: null }, grp: 'g1', sel: null, closed: new Set(), fold: {}, msel: new Set(), mmode: false, hov: null, anchor: null, deletedPaths: {}, loading: 0 };

/* ---- 共通 ---- */
/* 表示時間は文章の長さに合わせる（短い通知は2.5秒、エラーの説明文は最長12秒）。 */
const showToast = (m, ms) => { const t = $('#toast'); if (!t) return; t.textContent = m; t.hidden = false; clearTimeout(showToast.t); showToast.t = setTimeout(() => t.hidden = true, ms || Math.min(12000, Math.max(2500, String(m).length * 130))); };
const ico = (ms, c) => `<span class="ms${c ? ' ' + c : ''}">${ms}</span>`;
const fico = n => { const i = fileIcon(n); return ico(i, 'ft-' + i); }; // 種類ごとに色を変えたファイルアイコン
/* 画面に出す文字列は、必ず esc を通す（ファイル名・プロジェクト名は部員が自由に付けられるため）。属性の中でも安全なよう、引用符も変換する */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* エラー表示：「何が原因か」「何をすればいいか」を短く、末尾に原因ごとに一意のコード（E-…）を付ける。
   コードは README の「エラーコード一覧」と対応する。サーバーのログにも同じ E-A…（認証）が残る。 */
const ERROR_CATALOG = {
  /* API（E-P…） */
  unauthorized: ['E-P01', 'ログインの有効期限が切れました。もう一度ログインしてください。'],
  forbidden: ['E-P02', 'この操作をする権限がありません。権限のある部員に依頼してください。'],
  reauth_required: ['E-P03', '管理の再認証が切れています。「いま再認証する」を押して、もう一度操作してください。'],
  untrusted: ['E-P04', 'この端末は信頼端末ではないため、他の端末のログインを承認できません。「端末の登録」で信頼端末にしてください。'],
  not_found: ['E-P05', '対象が見つかりません。画面を更新して、もう一度確認してください。'],
  conflict: ['E-P06', '他の人が先に変更しました。画面を更新して、やり直してください。'],
  locked: ['E-P07', '別の操作が実行中です。少し待ってから、もう一度操作してください。'],
  too_large: ['E-P08', 'ファイルが大きすぎます。サイズを小さくしてください。'],
  quota: ['E-P09', '容量が上限に達しています。大きいファイルや不要なアプリを整理してください。'],
  limit: ['E-P10', '上限に達しています。不要なものを整理するか、管理者に上限の変更を依頼してください。'],
  has_apps: ['E-P11', 'このプロジェクトから公開したアプリが残っています。アプリも削除するか、先に整理してください。'],
  rate: ['E-P12', '操作の回数が多すぎます。しばらく待ってから、もう一度操作してください。'],
  bad_code: ['E-P13', 'コードが違うか、期限切れです。相手の画面に出ているコードを確認してください。'],
  bad_path: ['E-P14', 'ファイル名・フォルダ名に使えない文字が含まれています。名前を変えてください。'],
  bad_name: ['E-P15', '名前に使えない文字、または長さの問題があります。半角英数字と . _ @ - などで入力してください。'],
  invalid: ['E-P16', '入力内容に誤りがあります。入力欄をもう一度確認してください。'],
  csrf: ['E-P17', '安全確認に失敗しました。ページを再読み込みして、もう一度操作してください。'],
  origin: ['E-P18', '別のサイトからの操作は受け付けられません。このエディターの画面から操作してください。'],
  network: ['E-P19', '通信できませんでした。ネットワークを確認して、もう一度操作してください。'],
  internal: ['E-P20', 'サーバーでエラーが起きました。少し待って再実行し、直らなければ管理者にこのコードを伝えてください。'],
  not_admin: ['E-P21', 'この操作は管理者だけができます。管理者に依頼してください。'],
  managed_by_idp: ['E-P22', 'この部員の管理者の設定は、認証システム（IdP）の管理画面で行います。'],
  /* ログイン/再認証（E-A…）。サーバーが ?code= で渡す。FE 2.0: Microsoft固有 E-A03,04,05,10,12,14 削除 */
  'E-A01': ['E-A01', 'ログインが中止されました。もう一度ログインしてください。'],
  'E-A02': ['E-A02', 'ログインの手続きが無効になりました（10分以上経過、または別のタブで操作）。最初からやり直してください。'],
  'E-A06': ['E-A06', '不正なログインの開始です。トップ画面からやり直してください。'],
  'E-A11': ['E-A11', 'このアカウントは無効になっています。管理者に有効化を依頼してください。'],
  'E-A13': ['E-A13', '再認証は、いまログイン中のアカウントで行ってください。'],
  'E-A15': ['E-A15', 'ログインが切れています。いったんログインし直してから、再認証してください。'],
  'E-A20': ['E-A20', '認証システムとエディターの版が合いません。管理者に連絡してください。'],
  'E-A21': ['E-A21', '認証システムに接続できません。少し待ってやり直してください。続く場合は管理者へ。'],
  'E-A22': ['E-A22', '認証システムからの情報を確認できませんでした。もう一度ログインしてください。'],
  'E-A23': ['E-A23', 'この部員は、別のアカウントに結び付いています。管理者に連絡してください。'],
  'E-A24': ['E-A24', 'このアカウントは無効になっています。管理者に連絡してください。'],
  'E-A99': ['E-A99', 'ログインに失敗しました。もう一度試し、直らなければ管理者にこのコードを伝えてください。']
};
/* コード付きの文章にする。例：「…してください。（E-P02）」 */
function errorText(key, extra) {
  const e = ERROR_CATALOG[key];
  if (!e) return `想定外のエラーです。管理者にこのコードを伝えてください。（E-P99:${key || 'unknown'}）`;
  return `${extra || e[1]}（${e[0]}）`;
}
function apiMessage(e) {
  if (!(e instanceof ApiError)) return errorText('network');
  if (e.code === 'bad_code' && e.data && e.data.remaining !== undefined) return errorText('bad_code', `コードが違うか、期限切れです（残り${e.data.remaining}回）。相手の画面のコードを確認してください。`);
  if (e.code === 'rate' && e.data && e.data.retry_after) return errorText('rate', `操作の回数が多すぎます。${Math.max(1, Math.ceil(e.data.retry_after / 60))}分後に、もう一度操作してください。`);
  if (/^http_5\d\d$/.test(String(e.code))) return errorText('internal');
  if (e.code === 'http_404') return errorText('not_found');
  if (e.code === 'http_413') return errorText('too_large');
  if (ERROR_CATALOG[e.code]) return errorText(e.code);
  return `想定外のエラーです。管理者にこのコードを伝えてください。（E-P99:${e.code || e.status || 'unknown'}）`;
}
/* この端末を「Windows PC (Edge)」のような、人が見て分かる名前にする。 */
function describeDevice(ua = navigator.userAgent) {
  let os;
  if (/iPhone/.test(ua)) os = 'iPhone';
  else if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) os = 'iPad';
  else if (/Android/.test(ua)) os = /Mobile/.test(ua) ? 'Android スマホ' : 'Android タブレット';
  else if (/CrOS/.test(ua)) os = 'Chromebook';
  else if (/Windows/.test(ua)) os = 'Windows PC';
  else if (/Macintosh|Mac OS X/.test(ua)) os = 'Mac';
  else if (/Linux|X11/.test(ua)) os = 'Linux PC';
  else os = '不明な端末';
  let br;
  if (/Edg(e|A|iOS)?\//.test(ua)) br = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) br = 'Opera';
  else if (/SamsungBrowser\//.test(ua)) br = 'Samsung Internet';
  else if (/Firefox\/|FxiOS\//.test(ua)) br = 'Firefox';
  else if (/Chrome\/|CriOS\//.test(ua)) br = 'Chrome';
  else if (/Safari\//.test(ua)) br = 'Safari';
  else br = 'ブラウザ不明';
  return `${os} (${br})`;
}
function showApiError(e, opts = {}) {
  if (e instanceof ApiError && e.code === 'unauthorized' && typeof setAuth === 'function' && DATA.user.id) setAuth(false);
  if (e instanceof ApiError && e.code === 'locked' && typeof showStatebar === 'function') showStatebar('lock');
  if (!opts.silent) showToast(apiMessage(e));
  if (opts.where) { const el = $(opts.where); if (el) { el.textContent = apiMessage(e); el.className = 'msg err'; } }
  return e;
}
const dateParts = value => String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
const fmtDate = value => {
  const p = dateParts(value);
  if (!p) return esc(String(value || ''));
  return `<time class="v-date" datetime="${p[0]}"><span class="v-year">${p[1]}</span><span class="v-month">-${p[2]}</span><span class="v-day">-${p[3]}</span></time>`;
};
const fmtRange = (from, to) => `<span class="v-range"><span>${fmtDate(from)}</span><span class="v-range-sep">～</span><span>${fmtDate(to)}</span></span>`;
const ICONS = { html: 'html', css: 'css', js: 'javascript', php: 'php', sql: 'database', json: 'data_object', pdf: 'picture_as_pdf',
  md: 'description', txt: 'description', docx: 'description', png: 'image', jpg: 'image', gif: 'image', svg: 'image', webp: 'image',
  mp4: 'video_file', webm: 'video_file', mp3: 'audio_file', wav: 'audio_file', m4a: 'audio_file', flac: 'audio_file',
  conf: 'settings_applications', config: 'settings_applications', ini: 'settings_applications', env: 'settings_applications',
  py: 'code', c: 'code', rb: 'code', java: 'code', go: 'code', rs: 'code', ts: 'code', cpp: 'code', sh: 'code' };
const ext = n => (n.split('.').pop() || '').toLowerCase();
const fileIcon = n => ICONS[ext(n)] || 'article';
const isText = f => f.t !== 'dir' && (f.text !== undefined || (typeof textPath === 'function' && textPath(f.n)));

/* ---- 左サイドバー / 左領域 ---- */
let prevPanel = 'sm02', curPanel = 'sm02', leftHidden = false;
function setPanel(p) { // 左領域に出す内容。ホームは右エリアに出すので、左領域は直前の内容のまま
  curPanel = p; $$('.lp').forEach(e => e.classList.toggle('on', e.id === p)); $$('.abtn').forEach(b => b.classList.toggle('on', !leftHidden && b.dataset.p === p && p !== 'home')); /* ホームは選択状態を持たない。左エリアを隠している間は、どの左ボタンも押されていない状態 */
}
function setLeftHidden(v) { leftHidden = v; $('#app').classList.toggle('lh', v); setPanel(curPanel); }
function openLeft(p, stay) { /* 左エリアを必ず表示して p に切り替える（stay=スマホで画面を移らない） */
  setLeftHidden(false); prevPanel = p; setPanel(p); if (!stay) $('#app').dataset.view = 'left'; if (p === 'sm08' && window.renderUsage) renderUsage(); navPush();
}
function hideHome() { $('#home').hidden = true; }
function showPanel(p) {
  const hm = $('#home');
  if (p === 'home') { hm.hidden = !hm.hidden && S.tabs.length > 0; $('#app').dataset.view = 'right'; return navPush(); } // 右エリアに表示。もう一度押すとタブに戻る
  if (!isPhone() && p === curPanel && !leftHidden) { setLeftHidden(true); return navPush(); } /* 選ばれているボタンをもう一度押すと、左エリアを隠す */
  openLeft(p);
}
$$('.abtn').forEach(b => b.onclick = () => showPanel(b.dataset.p));

/* SM01 プロジェクト一覧 */
function renderProjects() {
  for (const k of ['mine', 'shared']) {
    $('#list-' + k).innerHTML = S.fold[k] ? '' : DATA.projects[k].map(p => { const ownerName = p.ownerLabel || (DATA.members.find(m => m.id === p.owner) || {}).name || (p.orphan ? '（なし）' : ''), permLabel = k === 'mine' ? '所有者' : ({ edit: '編集', view: '閲覧' }[p.perm] || p.perm); return `<div class="row" data-id="${p.id}"><span class="nm">${esc(p.name)}<small class="project-meta">${esc(ownerName)} ${k === 'mine' || p.perm ? `<span class="badge">${esc(permLabel)}</span>` : ''}${p.updatedAt ? ` <span>${fmtDate(p.updatedAt)}</span>` : ''}${p.sizeMB ? ` <span>${fmtMB(p.sizeMB)}MB</span>` : ''}${p.parent ? ` <span>（${esc(p.parent)} から分岐）</span>` : ''}</small></span>` +
      `<span class="acts"><button title="ZIPでダウンロード" data-zip="${p.id}">${ico('folder_zip')}</button>${k === 'mine' ? `<button title="名前変更" data-ren="${p.id}">${ico('edit')}</button><button title="削除" data-del="${p.id}">${ico('delete')}</button>` : ''}<button title="開く" data-open="${p.id}">${ico('open_in_new')}</button></span></div>`; }).join('');
    $(`[data-fold=${k}] .fi`).textContent = S.fold[k] ? 'keyboard_arrow_down' : 'keyboard_arrow_up';
  }
}
function renameProject(p) {
  if (!p || (p.owner && p.owner !== DATA.user.id) || p.perm && p.perm !== 'owner') return showToast('所有者のみ名前を変更できます');
  const ownerId = p.owner || DATA.user.id, member = DATA.members.find(m => m.id === ownerId), oldName = p.name;
  askName('プロジェクト名を変更', oldName, value => {
    if (!/^[^\/\\\u0000-\u001f]{1,50}$/.test(value)) return 'プロジェクト名は1〜50文字で入力してください';
    const duplicates = (member?.projects || []).some(x => x.id !== p.id && x.name.toLowerCase() === value.toLowerCase()) ||
      allProjects().some(x => x !== p && x.owner === ownerId && x.name.toLowerCase() === value.toLowerCase());
    if (duplicates) return '同じ所有者のプロジェクトに同じ名前があります';
    (async () => {
      try {
        await Api.projects.rename(p.id, value);
        await loadProjects();
        const next = allProjects().find(x => x.id === p.id);
        if (next) { S.proj = next; allProjects().forEach(project => { if (project.parent === oldName) project.parent = value; }); }
        renderProjects(); renderHome(); updateStatus(); renderShare(); renderPub(); renderHist(); renderUsage(); showToast('プロジェクト名を変更しました');
      } catch (e) { showApiError(e); }
    })();
    return '';
  });
}
$$('[data-fold]').forEach(r => r.onclick = () => { S.fold[r.dataset.fold] = !S.fold[r.dataset.fold]; renderProjects(); });
$('#left').addEventListener('click', e => {
  const o = e.target.closest('[data-open]'), d = e.target.closest('[data-del]'), z = e.target.closest('[data-zip]'), r = e.target.closest('[data-ren]');
  if (z) { const p = allProjects().find(x => x.id === z.dataset.zip); return Zip.download(p.name + '.zip', p.id, '', p.name); }
  if (o) openProject(o.dataset.open);
  if (r) {
    const p = DATA.projects.mine.find(x => x.id === r.dataset.ren);
    renameProject(p);
  }
  if (d) askDelProject(DATA.projects.mine.find(p => p.id === d.dataset.del));
});
async function openProject(id) {
  if (S.tabs.some(unsaved) && S.proj && S.proj.id !== id) return closeUnsavedSequential([...S.tabs], () => openProject(id));
  /* 「自分の」を先に探す（同じ id が両方にあっても、所有者として開く） */
  S.proj = DATA.projects.mine.find(p => p.id === id) || DATA.projects.shared.find(p => p.id === id);
  if (!S.proj) return showToast('プロジェクトが見つかりません');
  /* 読み込みを待つ間、前に開いていたプロジェクトの権限（共有・閲覧）が残らないよう、権限はいますぐ切り替える */
  if (window.applyRoleForProject) applyRoleForProject();
  S.tabs = []; S.msel = new Set(); S.mmode = false; S.hov = null; S.anchor = null;
  S.loading++;
  renderTabs(); renderTree(); updateStatus(); showPanel('sm02');
  try { await Task.run({ title: `「${S.proj.name}」を読み込み中`, icon: 'inbox' }, t => { t.set({ msg: 'ファイル・履歴を取得しています' }); return loadProject(id); }); }
  catch (e) { showApiError(e, { silent: true }); showToast('プロジェクトを読み込めませんでした'); }
  finally { S.loading--; }
  if (window.applyRoleForProject) applyRoleForProject();
  initBase(); renderTabs(); renderTree(); updateStatus(); renderShare(); renderPub(); renderHist(); renderUsage(); renderHome();
}
function closeUnsavedSequential(tabs, done) {
  const pending = tabs.find(t => S.tabs.includes(t) && unsaved(t));
  if (!pending) return done();
  askUnsaved(pending, () => closeUnsavedSequential(tabs, done));
}
function closeTabsSequential(tabs) {
  const closing = [...new Set(tabs)];
  closeUnsavedSequential(closing, () => {
    S.tabs = S.tabs.filter(t => !closing.includes(t));
    G.forEach(g => { if (!S.tabs.includes(S.act[g])) S.act[g] = S.tabs.filter(t => t.g === g).at(-1) || null; });
    renderTabs(); navPush();
  });
}

/* SM02 ファイルツリー */
const files = () => (S.proj && DATA.files[S.proj.id]) || [];
/* 追跡上限を超えるファイル（行の差分ではなく、ハッシュ・名前・サイズで追跡する） */
const isLargeNode = f => f.t !== 'dir' && (f.size ?? (f.blob ? f.blob.size : 0)) > limitVal('track_limit_mb') * 1048576;
/* ファイルの状態：青=システム未保存（ページを閉じると失われる）/ 灰=隠しファイル / 緑 / オレンジ。優先順位は 青 > 灰 > 緑 > オレンジ */
const unsaved = t => t.dirty || (t.f && t.f.saved === false); // 編集済み、または新規作成でまだ保存していないタブ
const isDirtyNode = f => S.tabs.some(t => t.f === f && t.dirty);
function nodeState(f) {
  const hid = f.n.startsWith('.');
  if (f.t === 'dir') { if (f.saved === false || f.c.some(c => nodeState(c).blue)) return { c: 'blue', blue: true }; if (hid) return { c: 'gray' }; if (f.renamed) return { c: 'green' }; if (f.inBase === false) return { c: 'orange' }; return {}; }
  if (f.saved === false || isDirtyNode(f)) return { c: 'blue', blue: true };
  if (hid) return { c: 'gray' }; if (f.inBase === false) return { c: 'green' };
  if (f.mod || (f.text !== undefined && f.bt !== undefined && f.text !== f.bt)) return { c: 'orange' }; return {};
}
const MARK = { blue: ['未', 'システムに未保存（ページを閉じると失われます）'], green: ['新', '前回のコミットから新規（フォルダは名前変更）'], orange: ['更', '前回のコミットから変更（フォルダは新規作成）'], gray: ['', '隠しファイル'] };
const walkNodes = (list, fn) => list.forEach(f => { fn(f); if (f.t === 'dir') walkNodes(f.c, fn); });
const anyBlue = () => files().some(f => nodeState(f).blue);
function getCommitStatus() {
  const server = S.proj && DATA.commitStatus[S.proj.id];
  if (server) return { add: num(server.add, 0), mod: num(server.mod, 0), del: num(server.del, 0) };
  const status = { add: 0, mod: 0, del: (S.proj && S.deletedPaths[S.proj.id]?.count) || 0 };
  walkNodes(files(), f => {
    if (f.t === 'dir' || f.saved === false || isDirtyNode(f)) return;
    if (f.inBase === false) status.add++;
    else if (f.mod || (f.text !== undefined && f.bt !== undefined && f.text !== f.bt)) status.mod++;
  });
  return status;
}
async function refreshStatus() {
  if (!S.proj || !S.proj.id) return;
  try { applyStatus(S.proj.id, await Api.history.status(S.proj.id)); if (typeof updateCommitControl === 'function') updateCommitControl(); }
  catch { /* 表示は現在の値のまま */ }
}
async function reloadTree(render = true) {
  if (!S.proj || !S.proj.id) return;
  try { applyTree(S.proj.id, await Api.files.tree(S.proj.id)); if (render) { initBase(); renderTree(); renderTabs(); } }
  catch (e) { showApiError(e); }
}
const initBase = () => Object.values(DATA.files).forEach(l => walkNodes(l, f => { if (f.text !== undefined && f.bt === undefined && f.inBase !== false) f.bt = f.text; }));
function commitBaseline() {
  walkNodes(files(), f => { if (f.saved === false || nodeState(f).blue) return; f.inBase = true; f.renamed = false; f.mod = false; if (f.text !== undefined) f.bt = f.text; });
  delete S.deletedPaths[S.proj.id]; renderTree();
}
/* ファイル一覧：名前変更・ダウンロード・削除のボタンは、いま開いている／選択している／ポインターを乗せている「1つの行」だけに出す（フォルダの開閉ボタンは常時表示） */
const openPath = () => { const t = S.act[S.grp]; return t && !t.render && !t.prev && t.path && t.path[0] !== '#' ? t.path : null; };
const actRow = () => (S.mmode || S.msel.size > 1) ? null : (S.hov || [...S.msel][0] || openPath()); /* 優先：ホバー ＞ 選択 ＞ 開いている。複数選択中は出さない */
function updActs() { const x = actRow(); $$('#tree .row').forEach(r => r.classList.toggle('ax', (r.dataset.file || r.dataset.dir) === x)); }
function renderTree() {
  if (!S.proj || !S.proj.id) { $('#proj-root').textContent = '-/'; $('#tree').innerHTML = ''; return; }
  $('#proj-root').textContent = S.proj.name + '/'; const ax = actRow();
  const walk = (list, path, depth) => list.map(f => {
    const p = path + f.n, pad = `style="padding-left:${12 + depth * 16}px"`, s = nodeState(f), m = MARK[s.c], on = S.msel.has(p), cls = [s.c ? 'st-' + s.c : '', on ? 'pk' : '', p === ax ? 'ax' : ''].join(' '), stm = m && m[0] ? `<span class="stm" title="${m[1]}">${m[0]}</span>` : '';
    const acts = `<span class="acts"><button title="名前変更" data-rn="${esc(p)}">${ico('edit')}</button><button title="${f.t === 'dir' ? 'ダウンロード(ZIP)' : 'ダウンロード'}" data-dl="${esc(f.n)}">${ico('download')}</button><button title="削除" data-df="${esc(f.n)}">${ico('delete')}</button></span>`;
    const ck = S.mmode ? ico(on ? 'check_circle' : 'radio_button_unchecked', 'ck') : ''; /* 複数選択モード：右端に選択マーク */
    if (f.t === 'dir') { const closed = S.closed.has(p);
      return `<div class="row ${cls} ${S.sel === p ? 'sel' : ''}" ${pad} data-dir="${esc(p)}">${ico('folder', 'ft-folder')}<span class="nm">${esc(f.n)}</span>${stm}${acts}<button class="tg" title="${closed ? '開く' : '閉じる'}">${ico(closed ? 'keyboard_arrow_down' : 'keyboard_arrow_up')}</button>${ck}</div>` + (closed ? '' : walk(f.c, p + '/', depth + 1)); }
    return `<div class="row ${cls}" ${pad} data-file="${esc(p)}">${fico(f.n)}<span class="nm">${esc(f.n)}</span>${isLargeNode(f) ? `<span class="stm lg" title="追跡上限（${limitVal('track_limit_mb')}MB）を超えるため、行の差分ではなく、ハッシュ・名前・サイズで追跡します">大</span>` : ''}${stm}${acts}${ck}</div>`;
  }).join('');
  $('#tree').innerHTML = walk(files(), '', 0);
  $('#sm02').classList.toggle('multi', S.mmode); $('#msb-n').textContent = S.msel.size + '件選択中';
  if (typeof updateCommitControl === 'function') updateCommitControl();
}
const findFile = (path, list = files()) => path.split('/').reduce((cur, seg) => (Array.isArray(cur) ? cur : cur.c).find(f => f.n === seg), list);
/* 選択：Ctrl/Cmd+クリック＝追加／解除、Shift+クリック＝範囲、Ctrl+Shift+クリック＝範囲を追加。タッチは、長押しで複数選択モードに入り、以降はタップで追加／解除。戻り値 true＝通常の動作（開く・折りたたむ）を続ける */
const treeOrder = () => $$('#tree .row').map(r => r.dataset.file || r.dataset.dir);
function pickNode(path, e) {
  const mod = e.ctrlKey || e.metaKey, sh = e.shiftKey, touch = document.documentElement.dataset.input === 'touch';
  if (sh) { const o = treeOrder(); let a = o.indexOf(S.anchor); if (a < 0) a = o.indexOf(path); const b = o.indexOf(path), r = o.slice(Math.min(a, b), Math.max(a, b) + 1); S.msel = mod ? new Set([...S.msel, ...r]) : new Set(r); S.mmode = true; return false; }
  if (mod || (S.mmode && touch)) { const n = new Set(S.msel); n.has(path) ? n.delete(path) : n.add(path); S.msel = n; S.anchor = path; S.mmode = n.size > 0; return false; }
  S.msel = new Set([path]); S.anchor = path; S.mmode = false; return true;
}
$('#tree').addEventListener('click', e => {
  const b = e.target.closest('button'), row = e.target.closest('.row'); if (!row) return; if (window.lpConsume && lpConsume()) return; const path = row.dataset.file || row.dataset.dir;
  if (b?.dataset.dl) return downloadNode(path);
  if (b?.dataset.df) return askDelFile(path);
  if (b?.dataset.rn) return renameNode(b.dataset.rn);
  if (b && b.classList.contains('tg') && (S.mmode || e.ctrlKey || e.metaKey || e.shiftKey)) { S.closed.has(path) ? S.closed.delete(path) : S.closed.add(path); return renderTree(); } /* 複数選択中の開閉ボタンは、開け閉めだけ */
  if (!pickNode(path, e)) return renderTree();
  if (row.dataset.dir) { S.sel = path; S.closed.has(path) ? S.closed.delete(path) : S.closed.add(path); renderTree(); }
  else openFile(path);
});
/* 新規・名前変更・アップロード（キーボード不要。入力はダイアログ） */
const newTarget = () => { const n = S.sel ? findFile(S.sel) : null; return n && n.t === 'dir' ? { list: n.c, dir: S.sel } : { list: files(), dir: '' }; };
const readOnly = () => (S.role === 'shared-view' || S.proj.perm === 'view') && (showToast('閲覧のみのため変更できません'), true);
function badName(v, list, self) {
  if (!v) return '名前を入力してください';
  if (v === '.' || v === '..' || /[\/\\]/.test(v)) return '/、\\、.、.. は使えません';
  if (/[\u0000-\u001f\u007f]/.test(v)) return '制御文字は使えません';
  if (v.length > 255) return '名前は255文字以内にしてください';
  if (v.toLowerCase() === '.htaccess' || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(v)) return 'この名前は使えません';
  return list.some(x => x !== self && x.n === v) ? '同じ名前があります' : '';
}
let inCb = null;
function askName(title, init, cb) { $('#in-t').textContent = title; $('#in-v').value = init; $('#in-e').textContent = ''; inCb = cb; $('#d-in').showModal(); $('#in-v').focus(); }
$('#in-ok').onclick = () => { const err = inCb($('#in-v').value.trim()); if (err) $('#in-e').textContent = err; else $('#d-in').close(); };
$('#in-v').onkeydown = e => { if (e.key === 'Enter') $('#in-ok').click(); }; // ※ falseを返すとBackSpace等が効かなくなるため式にしない
const dotHint = v => { if (v.startsWith('.') && !S.dotHint) { S.dotHint = true; showToast('ドットファイルは表示されますが、Webでは見えません'); } };
$$('[data-act]').forEach(b => b.onclick = () => { if (readOnly()) return; const k = b.dataset.act;
  if (k === 'mkdir') askName('新しいフォルダ', '', v => { const t = newTarget(); const e = badName(v, t.list); if (e) return e; const path = (t.dir ? t.dir + '/' : '') + v; must(async () => { await Api.files.mkdir(S.proj.id, path); if (t.dir) S.closed.delete(t.dir); dotHint(v); await reloadTree(); showToast('フォルダを作成しました'); }); return ''; });
  if (k === 'mkfile') askName('新しいファイル', '', v => { const t = newTarget(); const e = badName(v, t.list); if (e) return e; const path = (t.dir ? t.dir + '/' : '') + v; must(async () => { await Api.files.create(S.proj.id, path); if (t.dir) S.closed.delete(t.dir); dotHint(v); await reloadTree(); await openFile(path); }); return ''; });
  if (k === 'up') $('#up-files').click(); if (k === 'upd') $('#up-dir').click(); });
function must(fn) { fn().catch(e => showApiError(e)); }
function renameNode(path) {
  if (readOnly()) return; const node = findFile(path), dir = path.split('/').slice(0, -1).join('/'), parent = listOf(dir);
  askName('名前変更', node.n, v => { if (v === node.n) return ''; const e = badName(v, parent, node); if (e) return e; const np = (dir ? dir + '/' : '') + v;
    must(async () => { await busy(`${node.n} の名前を変更中`, 'drive_file_rename_outline', () => Api.files.rename(S.proj.id, path, np)); retarget(path, np); dotHint(v); await reloadTree(); renderTabs(); showToast('名前を変更しました'); }); return ''; });
}
const readText = f => f.text ? f.text() : new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsText(f); });
function uniqName(list, name) { const m = name.match(/^(.+?)(\.[^.]*)?$/); /* .env のようなドットファイルは、全体を名前として扱う（.env (1)） */ let n = name, i = 1; while (list.some(f => f.n === n)) n = `${m[1]} (${i++})${m[2] || ''}`; return n; }
/* アップロード：最大アップロードサイズを超えるものは保存しない。進捗とキャンセルは転送トレイ（transfer.js） */
async function uploadItems(items, dir) {
  const r = await Upl.start(items);
  if (r.done.length) { await reloadTree(); refreshStatus(); showToast(r.done.length + '件をアップロードしました' + (dir ? `（${dir}）` : '')); }
}
async function uploadFiles(fl) {
  if (readOnly()) return; const t = newTarget();
  await uploadItems(fl.map(f => ({ name: f.webkitRelativePath || f.name, size: f.size, file: f, dir: t.dir })), t.dir);
}
/* ダウンロード：ファイルは端末へ保存（上限なし）、フォルダは ZIP（サーバーで作る） */
async function downloadNode(path) {
  const node = findFile(path); if (!node) return;
  try {
    if (node.t === 'dir') return await Zip.download(node.n + '.zip', S.proj.id, path, node.n);
    await ensureBlob(node, path, S.proj.id);
    dl(node.blob, node.n); showToast(node.n + ' をダウンロードしました');
  } catch (e) { showApiError(e); }
}
$('#up-files').onchange = e => { uploadFiles([...e.target.files]); e.target.value = ''; }; $('#up-dir').onchange = e => { uploadFiles([...e.target.files]); e.target.value = ''; };

/* ---- ワークベンチ：タブ / 3グループ ---- */
const G = ['g1', 'g2']; // g1=メイン、g2=サブ
const isPhone = () => $('#app').classList.contains('w-phone');
async function openFile(path) {
  hideHome();
  let t = S.tabs.find(t => t.path === path);
  if (!t) {
    const f = findFile(path); if (!f) return showToast('ファイルが見つかりません');
    const node = f.t === 'dir' ? f : (isText(f) ? await ensureText(f, path, S.proj.id) : await ensureBlob(f, path, S.proj.id));
    t = { path, name: path.split('/').pop(), g: S.grp, f: node }; t.text = node.text;
    S.tabs.push(t);
  } else if (t.f && t.f.text === undefined && isText(t.f)) {
    try { await ensureText(t.f, path, S.proj.id); t.text = t.f.text; } catch (e) { return showApiError(e); }
  }
  if (!S.msel.has(path)) { S.msel = new Set([path]); S.anchor = path; S.mmode = false; } /* 開いたファイルは選択状態にもなる */
  S.grp = t.g; S.act[t.g] = t; renderTabs(); $('#app').dataset.view = 'right'; navPush();
}
function tabBar(g) {
  const el = $('#' + g), ts = S.tabs.filter(t => t.g === g), act = S.act[g], sl = $('.ts', el) ? $('.ts', el).scrollLeft : 0; /* 作り直しても、タブ欄の横スクロール位置は保つ */
  $('.tabs', el).innerHTML = '<div class="ts">' + ts.map(t => `<div class="tab ${t === act ? (g === S.grp ? 'on' : 'on dim') : ''}" data-p="${esc(t.path)}">${t.icon ? ico(t.icon) : fico(t.name)}<span>${esc(t.name)}</span>${unsaved(t) ? '<button class="dirty-btn" data-sv title="未保存：押すと保存します"><i class="dirty"></i></button>' : ''}<button class="x" title="閉じる">${ico('close')}</button></div>`).join('') + '</div>' +
    (g === toolHost() ? `<span class="tools"><button id="b-find" title="ファイル内を検索">${ico('find_in_page')}</button><button id="b-save" title="保存">${ico('save')}</button><button id="b-saveall" title="すべて保存">${ico('save_as')}</button><button id="b-sub" title="サブ画面を開く／閉じる">${ico(isPhone() ? 'dock_to_bottom' : 'dock_to_right')}</button></span>` : '');
  const bar = $('.ts', el); bar.scrollLeft = sl; revealTab(el, bar, ts, act);
  $('.crumb', el).textContent = act && !act.render && !act.prev ? (S.proj ? S.proj.name : '') + ' › ' + act.path.replace(/\//g, ' › ') : '';
}
/* タブ欄の表示領域の外に、開いているタブがあるときだけ、そのタブが見えるよう横にずらす。対象は、新しくタブが置かれた（開く・移動）とき、または表示領域外のタブをタブ以外の方法（ヘルプを選ぶ等）で開いたとき。タブ自身の操作（クリック・閉じる）や保存などの再描画では動かさない */
function revealTab(el, bar, ts, act) {
  const prev = el._tb || { act: null, set: new Set() }; el._tb = { act, set: new Set(ts) };
  if (!act || S.noReveal || (act === prev.act && ts.every(t => prev.set.has(t)))) return;
  if (!bar.clientWidth) { el._pend = true; return; } /* 非表示中（スマホで左の画面を見ているとき等）は、表示された時にやり直す */
  doReveal(el);
}
function doReveal(el) {
  const bar = $('.ts', el), tab = bar && $('.tab.on', bar); if (!tab || !bar.clientWidth) return; el._pend = false;
  const br = bar.getBoundingClientRect(), tr = tab.getBoundingClientRect(), pad = 8; let d = 0; /* offsetLeft は基準がずれることがあるので、画面上の位置の差で計算する */
  if (tr.width + pad * 2 > br.width || tr.left < br.left + pad) d = tr.left - br.left - pad; /* 幅が収まらないタブは、名前の先頭が見えるように左端へ */
  else if (tr.right > br.right - pad) d = tr.right - br.right + pad;
  bar.scrollLeft += d;
}
const flushReveal = () => ['g1', 'g2'].forEach(g => { const el = $('#' + g); if (el._pend) doReveal(el); });
new ResizeObserver(flushReveal).observe($('#g1')); new ResizeObserver(flushReveal).observe($('#g2')); /* 非表示から表示に変わったとき */
new MutationObserver(flushReveal).observe($('#app'), { attributes: true, attributeFilter: ['data-view', 'class'] }); /* 画面（左/右）の切替が、描画と同じ処理の中で終わる場合（サイズの変化を観測できない） */
$('#bench').addEventListener('click', e => { if (e.target.closest('.tab')) { S.noReveal = true; setTimeout(() => S.noReveal = false); } }, true); /* タブ自身の操作では動かさない（描画は同じクリック内で終わる） */
/* メイン(g1)・サブ(g2)の2画面。タブの移動などで片方が空になったら、空の画面は畳んで1画面にする
   （縦の区切り線も、保存・検索などのボタンも、1画面用の状態になる）。以前は、サブを開いたまま中身を移すと、空の画面と区切り線、
   ボタン類が2画面のまま残っていた。 */
const hasTabs = g => S.tabs.some(t => t.g === g);
const toolHost = () => ($('#g1').hidden ? 'g2' : 'g1'); /* 保存・検索・サブ画面ボタンを置く画面（いつも、見えている画面） */
function renderTabs() {
  const had2 = S.g2Had; S.g2Had = hasTabs('g2');
  if (had2 && !S.g2Had) $('#g2').dataset.keep = '';   // サブの最後のタブが出ていったら、サブを開いたままにはしない
  $('#g2').hidden = !hasTabs('g2') && !$('#g2').dataset.keep;
  $('#g1').hidden = !hasTabs('g1') && hasTabs('g2');   // メインが空で、サブにだけタブがあるときは、サブだけを広く使う
  if ($('#g1').hidden && S.grp === 'g1') S.grp = 'g2';
  G.forEach(g => {
    const el = $('#' + g), ts = S.tabs.filter(t => t.g === g);
    if (!ts.includes(S.act[g])) S.act[g] = ts[ts.length - 1] || null;
    tabBar(g); paneFor(el, S.act[g], g);
  });
  $('#split-g').hidden = $('#g1').hidden || $('#g2').hidden;
  if (!S.tabs.length) $('#home').hidden = false; // タブ全閉じのときはホーム
  renderTree(); updateStatus(); phoneDot(); if (window.fbRefresh && !$('#findbar').hidden) fbRefresh(); // 検索バーを開いたまま別のタブへ移ったら、そのタブで検索し直す
}
function markDirty(t) { if (!t.dirty) { t.dirty = true; G.forEach(g => { tabBar(g); if (S.act[g]?.prev?.srcPath === t.path) paneFor($('#' + g), S.act[g], g); }); renderTree(); updateStatus(); phoneDot(); } } // 入力中は表示を作り直さない
const phoneDot = () => { const r = $('#bn-ed .red'); if (r) r.hidden = !S.tabs.some(unsaved); };
function paneFor(el, t, g) {
  const pane = $('.pane', el);
  if (!t) return pane.innerHTML = '<div class="empty">開いているタブはありません</div>';
  if (t.render) { pane.innerHTML = `<div class="adm">${t.render()}</div>`; if (t.after) t.after(pane); if (typeof applyAdminLock === 'function') applyAdminLock(); return; } // 管理・設定・ヘルプなど
  if (t.prev) {
    const src = S.tabs.find(x => x.path === t.prev.srcPath), warning = src && unsaved(src);
    pane.innerHTML = (warning ? '<div class="pv-warning"><span>未保存の変更は反映されていません</span><button data-pv-save>保存して更新</button></div>' : '') +
      (t.prev.md ? `<div class="md mdx" data-ctx="project">${t.prev.html}</div>` : `<iframe sandbox="allow-scripts" referrerpolicy="no-referrer"${t.prev.url ? ` src="${esc(t.prev.url)}"` : ''}></iframe>`);
    if (t.prev.md) MD.post(pane); else if (!t.prev.url) $('iframe', pane).srcdoc = t.prev.html;
    const update = $('[data-pv-save]', pane);
    if (update) update.onclick = async () => {
      if (!src) return;
      if (await save(src)) { await preview(); }
    };
    return;
  }
  if (!isText(t.f)) return pane.innerHTML = mediaPane(t);
  const ro = S.role === 'shared-view' || S.proj.perm === 'view';
  pane.innerHTML = (ro ? '<div class="banner">閲覧のみ：編集できません</div>' : '') + '<div class="ed"><div class="gut"></div><div class="ov"><pre class="fm"></pre><pre class="hl"><code class="hljs"></code></pre><textarea class="in" spellcheck="false" wrap="off"></textarea></div></div>';
  const ta = $('textarea', pane); ta.value = t.text; ta.readOnly = ro;
  ta.oninput = () => { t.text = ta.value; markDirty(t); paintEditor(pane, ta, t); };
  ta.onscroll = () => syncScroll(pane, ta); paintEditor(pane, ta, t);
  ta.onkeyup = ta.onclick = () => { const l = ta.value.slice(0, ta.selectionStart).split('\n'); $('#s-pos').textContent = `行 ${l.length}, 列 ${l.at(-1).length + 1}`; };
  ta.onkeydown = e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(t); } else if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey && !ta.readOnly) { e.preventDefault(); insertText(ta, ' '.repeat(DATA.settings.tab)); } };
}
let conflictSave = null;
async function save(t, opts = {}) {
  if (!t || !t.f) return false;
  if (t.f.t === 'dir' || !isText(t.f)) return false;
  const projectId = S.proj.id, path = t.path;
  if (!projectId || !path) return false;
  try {
    let base = t.f.version;
    if (opts.force) { const latest = await Api.files.read(projectId, path); base = latest.version; }
    const d = await Task.run({ title: `${t.name} を保存中`, icon: 'save' }, () => Api.files.write(projectId, path, t.text ?? '', base));
    t.f.text = t.text; t.f.saved = true; t.f.version = d.version ?? t.f.version; t.dirty = false;
    refreshStatus();
    renderTabs(); notify('save', '保存しました'); return true;
  } catch (e) {
    if (e instanceof ApiError && e.code === 'conflict') { conflictSave = { t, opts }; $('#d-cf').showModal(); return false; }
    if (e instanceof ApiError && e.code === 'locked') { showStatebar('lock'); showApiError(e); return false; }
    if (e instanceof ApiError && e.code === 'quota') { $('#d-cap').showModal(); return false; }
    showApiError(e); return false;
  }
}
async function saveAll() {
  const pending = S.tabs.filter(unsaved);
  if (!pending.length) return showToast('保存する変更はありません');
  let saved = 0;
  for (const t of pending) if (await save(t)) saved++;
  showToast(saved ? `${saved}件を保存しました` : '保存できませんでした');
}
let svT = null; const askSave = t => { svT = t; $('#d-sv').showModal(); }; // ●（未保存）を押したときの確認
$('#sv-ok').onclick = () => { $('#d-sv').close(); save(svT); };
$('#s-save').onclick = saveAll;
$('#bench').addEventListener('click', e => {
  const tab = e.target.closest('.tab'), grp = e.target.closest('.group');
  const oldGrp = S.grp; if (grp) S.grp = grp.dataset.g; if (S.grp !== oldGrp) { G.forEach(tabBar); updateStatus(); } /* 青いタブは、フォーカスのある画面の1つだけ */
  if (e.target.closest('#b-find')) return toggleFind();
  if (e.target.closest('#b-save')) { const x = S.act[S.grp]; return x && unsaved(x) ? save(x) : showToast('保存する変更はありません'); }
  if (e.target.closest('#b-saveall')) return saveAll();
  if (e.target.closest('#s-save')) return saveAll();
  const sv = e.target.closest('[data-sv]'); if (sv) return askSave(S.tabs.find(x => x.path === sv.closest('.tab').dataset.p));
  if (e.target.closest('#b-sub')) { /* サブ画面の開閉。閉じるとサブのタブはメインへ移るが、開き直したら、サブにいたタブはサブへ戻す */
    const g2 = $('#g2'), opening = g2.hidden; g2.dataset.keep = opening ? 1 : '';
    if (!opening) { S.tabs.forEach(t => t.fromSub = false); S.subAct = S.act.g2; S.tabs.filter(t => t.g === 'g2').forEach(t => { t.fromSub = true; t.g = 'g1'; }); if (S.grp === 'g2') S.grp = 'g1'; }
    else { const back = S.tabs.filter(t => t.fromSub); back.forEach(t => { t.g = 'g2'; t.fromSub = false; }); if (back.length) { S.act.g2 = back.includes(S.subAct) ? S.subAct : back[back.length - 1]; S.grp = 'g2'; } S.subAct = null; }
    return renderTabs(); }
  if (!tab) return;
  const t = S.tabs.find(t => t.path === tab.dataset.p);
  if (e.target.closest('.x')) { if (unsaved(t)) return askUnsaved(t); S.tabs = S.tabs.filter(x => x !== t); }
  else { S.act[t.g] = t; S.grp = t.g; if (S.msel.size <= 1 && !S.mmode) S.msel = new Set(); }
  renderTabs(); navPush();
});
let menuTab = null, tabLongPress = null;
const tabMenu = $('#tab-menu');
function showTabMenu(tab, x, y) {
  const t = S.tabs.find(item => item.path === tab.dataset.p);
  if (!t) return;
  menuTab = t; tabMenu.hidden = false;
  const fileActions = ['save', 'copy', 'preview'];
  fileActions.forEach(action => { const b = $(`[data-tm="${action}"]`, tabMenu); b.disabled = action === 'save' ? !t.f : action === 'copy' ? !t.path || t.path[0] === '#' : !t.path || t.path[0] === '#' || !['html', 'md'].includes(ext(t.name)); });
  const move = $('[data-tm=move]', tabMenu); move.textContent = t.g === 'g1' ? 'サブへ移動' : 'メインへ移動';
  const rect = tabMenu.getBoundingClientRect();
  tabMenu.style.left = `${Math.max(4, Math.min(x, innerWidth - rect.width - 4))}px`;
  tabMenu.style.top = `${Math.max(4, Math.min(y, innerHeight - rect.height - 4))}px`;
}
$('#bench').addEventListener('contextmenu', e => {
  const tab = e.target.closest('.tab'); if (!tab) return;
  e.preventDefault(); showTabMenu(tab, e.clientX, e.clientY);
});
$('#bench').addEventListener('pointerdown', e => {
  const tab = e.target.closest('.tab'); if (!tab || e.pointerType !== 'touch') return;
  clearTimeout(tabLongPress);
  tabLongPress = setTimeout(() => showTabMenu(tab, e.clientX, e.clientY), 550);
});
['pointerup', 'pointercancel', 'pointermove'].forEach(type => document.addEventListener(type, () => clearTimeout(tabLongPress), { passive: true }));
tabMenu.addEventListener('click', e => {
  const action = e.target.closest('[data-tm]')?.dataset.tm, t = menuTab; if (!action || !t) return;
  tabMenu.hidden = true;
  if (action === 'close') return closeTabsSequential([t]);
  if (action === 'others') return closeTabsSequential(S.tabs.filter(x => x.g === t.g && x !== t));
  if (action === 'right') {
    const siblings = S.tabs.filter(x => x.g === t.g), index = siblings.indexOf(t);
    return closeTabsSequential(siblings.slice(index + 1));
  }
  if (action === 'all') return closeTabsSequential([...S.tabs]);
  if (action === 'save') return save(t);
  if (action === 'copy') {
    if (!navigator.clipboard?.writeText) return showToast('この環境ではパスをコピーできません');
    return navigator.clipboard.writeText(t.path).then(() => showToast('パスをコピーしました'), () => showToast('パスをコピーできませんでした'));
  }
  if (action === 'move') {
    const from = t.g, to = from === 'g1' ? 'g2' : 'g1';
    if (to === 'g2') $('#g2').dataset.keep = 1;
    if (S.act[from] === t) S.act[from] = S.tabs.filter(x => x !== t && x.g === from).at(-1) || null;
    t.g = to; S.act[to] = t; S.grp = to; renderTabs(); return;
  }
  if (action === 'preview') { S.act[t.g] = t; S.grp = t.g; return preview(); }
});
document.addEventListener('click', e => { if (!e.target.closest('#tab-menu')) tabMenu.hidden = true; });
document.addEventListener('scroll', () => { tabMenu.hidden = true; }, true);
/* ---- プレビュー（HTML: 相対パスをHTML基準で解決 / MD: 構造化表示） ---- */
function resolve(base, rel) {
  const parts = base.split('/').slice(0, -1);
  for (const s of rel.split('/')) s === '..' ? parts.pop() : s !== '.' && parts.push(s);
  try { return findFile(parts.join('/')); } catch { return null; }
}
const projResolver = base => src => { if (/^(https?:|data:|blob:|#)/i.test(src)) return src; const n = resolve(base, src); if (!n) return src; if (n.blob) return (n.url = n.url || URL.createObjectURL(n.blob)); return Api.files.rawUrl(S.proj.id, resolvePath(base, src)); };
function resolvePath(base, rel) { const parts = base.split('/').slice(0, -1); for (const s of rel.split('/')) s === '..' ? parts.pop() : s !== '.' && parts.push(s); return parts.join('/'); }
function buildPreview(t, source) {
  return ext(t.name) === 'md' ? MD.render(source || '', { resolve: projResolver(t.path) }) : (source || '') + FRAME_HELPER;
}
async function preview() {
  const t = S.act[S.grp]; if (!t || !['html', 'md'].includes(ext(t.name))) return;
  const path = t.path, isMd = ext(t.name) === 'md';
  let prev;
  try {
    if (!isMd) {
      const d = await Api.files.previewToken(S.proj.id, path);
      prev = { md: false, srcPath: path, url: Api.previewUrl(d.token || d.preview_token || d, path) };
    } else {
      prev = { md: true, srcPath: path, html: buildPreview(t, t.f.text || '') };
    }
  } catch (e) { return showApiError(e); }
  const pv = { name: t.name, icon: 'play_arrow', path: path + '#preview', g: 'g2', f: { text: '' }, prev };
  S.tabs = S.tabs.filter(x => x.path !== pv.path); S.tabs.push(pv); $('#g2').dataset.keep = 1; S.act[pv.g] = pv; S.grp = pv.g; renderTabs(); $('#app').dataset.view = 'right';
}
$('#s-prev').onclick = preview;

/* ---- ステータスバー ---- */
function updateStatus() {
  const t = S.act[S.grp], used = usedMB();
  if (!S.proj || !S.proj.id) { $('#s-proj').innerHTML = ''; }
  else { $('#s-proj').innerHTML = `${ico('inbox')} ${esc(S.proj.name)}` + (S.proj.parent ? ` (${esc(S.proj.parent)} から分岐)` : ''); }
  $('#s-lang').textContent = t && !t.render && !t.prev ? ext(t.name).toUpperCase() : '';
  $('#s-cap').textContent = `容量 ${fmtMB(used)}/${fmtMB(quotaLimit())}MB`;
  $('#s-prev').hidden = !(t && !t.prev && ['html', 'md'].includes(ext(t.name))); $('#bn-prev').disabled = $('#s-prev').hidden || S.auth === false;
  $('#s-save').textContent = S.tabs.some(unsaved) ? '未保存' : '保存済み';
}

/* ---- SM06 / SM08 / ホーム / アカウント ---- */
/* ツール一覧は toolkit.js の Tools.register() が作る */
function renderHome() {
  $('#h-recent').innerHTML = DATA.projects.mine.concat(DATA.projects.shared).map(p => `<div class="row" data-open="${p.id}">${ico('inbox')}<span class="nm">${esc(p.name)}</span></div>`).join('');
  $('#h-recent').onclick = e => { const r = e.target.closest('[data-open]'); if (r) openProject(r.dataset.open); };
  const roles = { member: '部員', 'shared-view': '共有先（閲覧）', 'shared-edit': '共有先（編集）', admin: '管理者権限あり' };
  $('#hl-recent').innerHTML = $('#h-recent').innerHTML;
  $('#acct').innerHTML = `<div class="ucard"><span class="avatar">${esc((DATA.user.name || '?')[0])}</span><div><b>${esc(DATA.user.name)}</b><small>${esc(DATA.user.id)} ・ ${roles[S.role]}</small></div></div>`; $('#home-name').textContent = (DATA.user.name || '').split(' ')[0] + 'さん';
  const quick = document.querySelector('#home .home-wrap.only-in .quick');
  if (quick) {
    let html = `<button class="o" id="q-new"><span class="ms">add_box</span>新しいプロジェクト</button><button class="o" id="q-openproj"><span class="ms">inbox</span>プロジェクトを開く</button>`;
    if (S.proj && S.proj.id) html += `<button class="o" id="q-files"><span class="ms">folder_open</span>ファイルを開く</button>`;
    html += `<button class="o" id="q-help"><span class="ms">help</span>使い方を見る</button>`;
    quick.innerHTML = html;
    const qn = $('#q-new'); if (qn) qn.onclick = () => $('#btn-new').click();
    const qo = $('#q-openproj'); if (qo) qo.onclick = () => showPanel('sm01');
    const qf = $('#q-files'); if (qf) qf.onclick = () => showPanel('sm02');
    const qh = $('#q-help'); if (qh) qh.onclick = () => openHelp('start');
  }
}

/* ---- ダイアログ ---- */
$$('dialog').forEach(d => { d.onclick = e => { if ((e.target === d && !d.dataset.lock) || e.target.closest('[data-close]')) d.close(); }; });
const cloneNodes = list => list.map(f => { const n = { ...f, saved: true, inBase: true, renamed: false, mod: false }; if (f.t === 'dir') n.c = cloneNodes(f.c); else if (f.text !== undefined) n.bt = f.text; return n; }); // 分岐元の内容をコピー
const cnpMode = () => $('[name=cnp-mode]:checked').value;
$('#btn-new').onclick = () => {
  $('#cnp-name').value = ''; $('#cnp-name').placeholder = new Date().toISOString().slice(0, 10) + 'のプロジェクト'; $$('[name=cnp-mode]')[0].checked = true; $('#cnp-br').hidden = true;
  $('#cnp-src').innerHTML = allProjects().map(p => `<option value="${esc(p.id)}">${esc(p.name)}${p.perm ? '（共有）' : ''} から分岐</option>`).join('');
  fillForkCommits(); $('#d-cnp').showModal();
};
function fillForkCommits() {
  const src = $('#cnp-src').value;
  const list = DATA.commitsByProject[src] || (src === S.proj?.id ? DATA.commits : []);
  $('#cnp-commit').innerHTML = '<option value="">最新の状態から</option>' + list.map(c => `<option value="${c.hash}">${esc(c.message)} (${String(c.hash).slice(0, 7)}) の時点から</option>`).join('');
  if (!list.length && src) Api.history.log(src).then(d => { applyCommits(src, d); if ($('#cnp-src').value === src) fillForkCommits(); }).catch(() => {});
}
$('#cnp-src').onchange = fillForkCommits;
$$('[name=cnp-mode]').forEach(r => r.onchange = () => $('#cnp-br').hidden = cnpMode() !== 'branch');
$('#cnp-ok').onclick = async () => {
  const max = limitVal('max_projects_per_member'); if (DATA.projects.mine.length >= max) { $('#d-cnp').close(); $('#err-t').textContent = 'プロジェクトの数が上限に達しています'; $('#err-m').textContent = `1人が持てるプロジェクトは ${max}個までです。使っていないプロジェクトを削除してから、もう一度お試しください。`; return $('#d-err').showModal(); }
  const n = $('#cnp-name').value.trim(); $('#cnp-ok').disabled = true;
  try {
    const params = n ? { name: n } : {};
    if (cnpMode() === 'branch') { params.from_project = $('#cnp-src').value; const commit = $('#cnp-commit').value; if (commit) params.from_commit = commit; }
    const d = await busy('プロジェクトを作成中', 'add_box', () => Api.projects.create(params));
    const p = fromApi({ projects: { mine: [d.project || d], shared: [] } }).projects.mine[0];
    await loadProjects(); await loadUsage();
    $('#d-cnp').close(); renderProjects(); renderUsage(); renderHome();
    const created = allProjects().find(x => x.id === p.id) || p;
    await openProject(created.id);
    showToast('プロジェクトを作成しました');
  } catch (e) { showApiError(e); }
  finally { $('#cnp-ok').disabled = false; }
};
let delTarget = null;
function updateDelProjectButton() {
  const appsRequired = DATA.apps.some(a => a.proj === delTarget?.id);
  $('#del-ok').disabled = !delTarget || $('#del-in').value !== delTarget.name || appsRequired && !$('#del-apps').checked;
}
function askDelProject(p) {
  delTarget = p; $('#del-n').textContent = p.name; $('#del-in').value = ''; $('#del-in').placeholder = p.name; $('#del-apps').checked = false;
  const apps = DATA.apps.filter(a => a.proj === p.id), shares = p.id === S.proj.id ? DATA.collab : p.sharedWith || [];
  $('#del-impact').innerHTML = `<p>所有者：${esc(p.ownerLabel || (DATA.members.find(m => m.id === p.owner) || {}).name || DATA.user.name)}</p><p>共有先：${shares.length}人${shares.length ? '（' + shares.map(s => esc(s.name || memName(s.id))).join('、') + '）' : ''}</p><p>アプリ：${apps.length}件${apps.length ? '（' + apps.map(a => esc(a.name)).join('、') + '）' : ''}</p>`;
  $('#del-apps-wrap').hidden = !apps.length; $('#del-apps-wrap').querySelector('small').textContent = apps.length ? `このプロジェクトに紐づく${apps.length}件のアプリと公開URLも削除します` : '';
  updateDelProjectButton(); $('#d-del').showModal();
}
$('#del-in').oninput = updateDelProjectButton; $('#del-apps').onchange = updateDelProjectButton;
$('#del-ok').onclick = () => {
  if ($('#del-ok').disabled) return;
  const p = delTarget;
  const remove = async () => {
    try {
      await busy(`「${p.name}」を削除中`, 'delete', () => Api.projects.remove(p.id, $('#del-apps').checked));
      await Promise.allSettled([loadProjects(), loadUsage(), loadApps()]);
      DATA.members.forEach(m => { m.projects = (m.projects || []).filter(x => x.id !== p.id); m.projectCount = m.projects.length; m.apps = (m.apps || []).filter(name => DATA.apps.some(a => a.name === name)); });
      if (S.proj && S.proj.id === p.id) {
        DATA.collab = [];
        const next = DATA.projects.mine[0] || DATA.projects.shared[0];
        if (next) await openProject(next.id); else { S.tabs = []; renderTabs(); showPanel('home'); }
      }
      renderProjects(); renderPub(); renderHist(); renderUsage(); $('#d-del').close(); showToast('プロジェクトを削除しました');
    } catch (e) { showApiError(e); }
  };
  $('#d-del').close();
  if (S.proj && S.proj.id === p.id) closeUnsavedSequential([...S.tabs], remove); else remove();
};
let delF = null, delDone = null;
function askDelFile(n) { delF = n; delDone = null; $('#delf-n').textContent = n; $('#d-delf').showModal(); }
async function deletePaths(paths) {
  if (readOnly()) return;
  try {
    await Task.run({ title: paths.length === 1 ? `${baseNameOf(paths[0])} を削除中` : `${paths.length}件を削除中`, icon: 'delete' }, async t => {
      let i = 0; for (const path of paths) { await Api.files.remove(S.proj.id, path); t.set({ pct: ++i / paths.length, msg: `${i}/${paths.length}件` }); }
    });
    S.tabs = S.tabs.filter(t => !paths.some(p => t.path === p || t.path.startsWith(p + '/')));
    S.msel = new Set(); S.mmode = false; S.anchor = null;
    await Promise.all([reloadTree(), refreshStatus()]);
    renderTabs(); showToast(`${paths.length}件を削除しました`);
  } catch (e) { showApiError(e); }
}
$('#delf-ok').onclick = () => { $('#d-delf').close(); if (delDone) { const done = delDone; delDone = null; done(); } else deletePaths([delF]); };
function requestLogout() { closeUnsavedSequential([...S.tabs], () => { $('#logout-untrust').checked = false; $('#d-logout').showModal(); }); }
$('#logout-ok').onclick = async () => {
  const untrust = $('#logout-untrust').checked;
  const linked = DATA.user && (DATA.user.idpLinked || DATA.user.idp_linked);
  $('#d-logout').close();
  try { await Api.auth.logout(untrust); }
  catch (e) { if (!(e instanceof ApiError) || e.code !== 'unauthorized') { showApiError(e); return; } }
  DATA.devices = []; DATA.collab = [];
  if (linked) { location.href = Api.idpUrl('logout'); return; }
  setAuth(false); showToast('ログアウトしました');
};
$('#btn-logout').onclick = requestLogout;

/* ---- 役割（管理者 / 所有者 / 共有先）の反映 ---- */
VWC.on('theme', t => document.documentElement.dataset.theme = t);
const applyRole = () => { S.role = VWC.get('role'); $$('[data-role=admin]').forEach(b => b.hidden = S.role !== 'admin'); renderHome(); renderTabs(); };
VWC.on('role', applyRole);
/* スマホ下ナビ：戻る/進む（画面遷移の履歴）、メニュー、エディター、プレビュー */
const NAV = { st: [], i: -1, lock: false };
function navPush() {
  if (NAV.lock) return; const s = { view: $('#app').dataset.view, panel: curPanel, tab: S.act[S.grp]?.path, home: !$('#home').hidden }, l = NAV.st[NAV.i];
  if (l && l.view === s.view && l.panel === s.panel && l.tab === s.tab && l.home === s.home) return;
  NAV.st = NAV.st.slice(0, NAV.i + 1); NAV.st.push(s); NAV.i = NAV.st.length - 1;
}
function navGo(d) {
  const n = NAV.i + d; if (n < 0 || n >= NAV.st.length) return showToast(d < 0 ? 'これ以上戻れません' : 'これ以上進めません');
  NAV.i = n; const s = NAV.st[n]; NAV.lock = true; $('#app').dataset.view = s.view; setPanel(s.panel);
  const t = S.tabs.find(x => x.path === s.tab); if (t) { S.act[t.g] = t; S.grp = t.g; renderTabs(); } $('#home').hidden = !(s.home || !S.tabs.length); NAV.lock = false;
}
$('#bn-back').onclick = () => navGo(-1); $('#bn-fwd').onclick = () => navGo(1);
$('#bn-home').onclick = () => showPanel('home'); $('#bn-menu').onclick = () => { $('#app').dataset.view = 'left'; navPush(); }; $('#bn-ed').onclick = () => { if (S.tabs.length) hideHome(); else showToast('開いているファイルがありません。メニューから開いてください'); $('#app').dataset.view = 'right'; navPush(); }; // ホームを開いていても、エディターで編集画面へ移れる
$('#bn-prev').onclick = () => $('#s-prev').hidden ? showToast('HTML / Markdown を開いているときに使えます') : preview();


addEventListener('beforeunload', e => { if (anyBlue()) { e.preventDefault(); e.returnValue = ''; } }); // 青（未保存）があるまま閉じようとしたら確認

/* ホームのクイック操作 */
$('#q-new').onclick = () => $('#btn-new').click(); $('#q-help').onclick = () => openHelp('start');

/* Markdownプレビューのチェックボックス：押すと元の .md の「- [ ] / - [x]」を書き換える（未保存＝青になるので保存する） */
window.mdTask = (n, on, ctx) => {
  if (ctx !== 'project') return; const pv = S.act[S.grp]; if (!pv || !pv.prev) return; const path = pv.path.split('#')[0], src = S.tabs.find(x => x.path === path), node = src ? src.f : findFile(path); if (!node || node.text === undefined) return;
  let k = 0; const txt = (src ? src.text : node.text).replace(/^(\s*(?:[-*+]|\d+[.)])\s+\[)( |x|X)(\]\s)/gm, (m, a, b, c) => k++ === n ? a + (on ? 'x' : ' ') + c : m);
  if (src) { src.text = txt; markDirty(src); const ta = $('textarea.in', $('#' + src.g)); if (ta && S.act[src.g] === src) { ta.value = txt; paintEditor($('.pane', $('#' + src.g)), ta, src); } } else { node.text = txt; renderTree(); }
  showToast('チェックを反映しました（未保存）');
};

/* フォーカスのある画面（青いタブの画面）を追従させる：エディターへのフォーカス、iframe（HTMLプレビュー）内のクリック */
const focusGroup = g => { if (g && g !== S.grp) { S.grp = g; G.forEach(tabBar); updateStatus(); } };
document.addEventListener('focusin', e => { if (!e.target.matches || !e.target.matches('textarea,input,select')) return; /* ボタンを押した瞬間に作り直すと、クリックが成立しなくなる */ const gr = e.target.closest('.group'); if (gr) focusGroup(gr.dataset.g); });
addEventListener('blur', () => setTimeout(() => { const f = document.activeElement; if (f && f.tagName === 'IFRAME') { const gr = f.closest('.group'); if (gr) focusGroup(gr.dataset.g); } }, 0));
/* ホーム：使用量を押すと左に利用状況、「詳細を見る」で詳細タブ */
$('#h-usage-card').onclick = e => { if (!e.target.closest('button')) openLeft('sm08'); };
$('#h-usage-detail').onclick = () => openTab('使用状況の詳細', rUsage, 'data_usage');
