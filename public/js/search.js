/* SPDX-License-Identifier: GPL-3.0-or-later */
/* SM03 検索・置換 / ファイル名検索（Ctrl+P） */
const tg = { case: false, re: false };
let hits = [], hitSel = -1;
function textFiles(list = files(), path = '') {
  return list.flatMap(f => f.t === 'dir' ? textFiles(f.c, path + f.n + '/') : isText(f) ? [{ p: path + f.n, f }] : []);
}
const sMsg = m => $('#s-msg').textContent = m;
function mkRe(once) {
  const q = $('#sq').value; if (!q) { sMsg('検索する文字列を入力してください'); return null; }
  try { return new RegExp(tg.re ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), (tg.case ? '' : 'i') + (once ? '' : 'g')); }
  catch { sMsg('正規表現が正しくありません'); return null; }
}
async function runSearch() {
  const re = mkRe(true); if (!re) return; hits = []; hitSel = -1;
  if (!S.proj || !S.proj.id) return sMsg('プロジェクトを開いてください');
  sMsg('検索中…');
  try {
    const d = await Api.files.search(S.proj.id, $('#sq').value, tg.case, tg.re);
    const raw = Array.isArray(d) ? d : (d.hits || d.matches || d.results || d.items || []);
    hits = raw.map(x => ({
      p: x.path || x.file || x.name || x.p,
      ln: num(x.line ?? x.ln ?? x.line_number ?? 1, 1),
      l: x.text || x.line_text || x.preview || x.content || ''
    })).filter(h => h.p);
    if (!hits.length) { sMsg('見つかりませんでした'); $('#s-res').innerHTML = ''; return; }
    sMsg(`${hits.length}件（${new Set(hits.map(h => h.p)).size}ファイル）`);
    let last = '';
    $('#s-res').innerHTML = hits.map((h, i) => (h.p !== last ? (last = h.p, `<div class="row dim">${ico(fileIcon(h.p))}<span class="nm">${esc(h.p)}</span></div>`) : '') +
      `<div class="row" data-hit="${i}" style="padding-left:28px"><span class="nm">${h.ln}: ${esc(String(h.l).trim())}</span></div>`).join('');
  } catch (e) { sMsg(apiMessage(e)); }
}
async function gotoHit(h) {
  await openFile(h.p); const ta = $('textarea.in', $('#' + S.grp)); if (!ta) return;
  try { await ensureText(S.tabs.find(t=>t.path===h.p).f, h.p, S.proj.id); } catch { /* noop */ }
  const text = (S.tabs.find(t=>t.path===h.p) || {}).text || ta.value;
  const lines = text.split('\n'), pos = lines.slice(0, h.ln - 1).join('\n').length + (h.ln > 1 ? 1 : 0);
  ta.value = text; ta.focus(); ta.setSelectionRange(pos, pos + (lines[h.ln - 1] || '').length); ta.scrollTop = Math.max(0, (h.ln - 4) * parseFloat(getComputedStyle(ta).lineHeight)); syncScroll($('.pane', $('#' + S.grp)), ta);
}
async function applyText(p, fn) {
  const f = findFile(p); if (!f) return false;
  await ensureText(f, p, S.proj.id);
  const before = f.text; const after = fn(before);
  if (after === before) return false;
  f.text = after;
  let t = S.tabs.find(x => x.path === p);
  if (!t) { t = { path: p, name: p.split('/').pop(), g: S.grp, f, text: after, dirty: true }; S.tabs.push(t); }
  else { t.text = after; t.dirty = true; t.f.text = after; }
  f.saved = false;
  return true;
}
$('#s-res').onclick = e => { const r = e.target.closest('[data-hit]'); if (!r) return; hitSel = +r.dataset.hit; $$('#s-res .row').forEach(x => x.classList.toggle('sel', x === r)); gotoHit(hits[hitSel]); };
const canEdit = () => !(S.role === 'shared-view' || S.proj.perm === 'view') || (showToast('閲覧のみのため置換できません'), false);
$('#s-rep').onclick = async () => { if (!canEdit()) return; const h = hits[hitSel < 0 ? 0 : hitSel], re = mkRe(true); if (!h || !re) return sMsg('先に検索してください');
  await applyText(h.p, tx => tx.split('\n').map((l, i) => i === h.ln - 1 ? l.replace(re, $('#sr').value) : l).join('\n')); const t = S.tabs.find(x => x.path === h.p); if (t) t.dirty = true; runSearch(); renderTabs(); showToast('1件を置換しました'); };
$('#s-all').onclick = async () => { if (!canEdit()) return; const re = mkRe(false); if (!re || !hits.length) return sMsg('先に検索してください');
  confirmDlg('一括置換', `${hits.length}件の行を「${$('#sr').value}」に置換します。`, async () => {
    const paths = [...new Set(hits.map(h => h.p))]; let n = 0;
    for (const p of paths) { if (await applyText(p, tx => tx.replace(re, $('#sr').value))) n++; }
    runSearch(); renderTabs(); showToast(`${n}件のファイルを置換しました`); }); };
$('#s-run').onclick = runSearch; $('#sq').onkeydown = e => { if (e.key === 'Enter') runSearch(); };
[['case', '#tg-case'], ['re', '#tg-re']].forEach(([k, id]) => $(id).onclick = () => { tg[k] = !tg[k]; $(id).classList.toggle('sel', tg[k]); $(id).style.background = tg[k] ? 'var(--pill)' : ''; });

/* ファイル名検索 */
let palSel = 0;
function palList() {
  const q = $('#pal-in').value.toLowerCase(), all = []; (function w(l, p) { l.forEach(f => f.t === 'dir' ? w(f.c, p + f.n + '/') : all.push(p + f.n)); })(files(), '');
  const m = all.filter(x => x.toLowerCase().includes(q)); palSel = 0;
  $('#pal-l').innerHTML = m.map((x, i) => `<div class="row ${i === 0 ? 'sel' : ''}" data-pf="${x}">${fico(x.split('/').pop())}<span class="nm">${x}</span></div>`).join('') || '<div class="pnote">該当するファイルがありません</div>';
}
function openPalette() { $('#pal-in').value = ''; palList(); $('#d-pal').showModal(); $('#pal-in').focus(); }
$('#pal-open').onclick = openPalette; $('#pal-in').oninput = palList;
function palOpen(r) { if (!r) return; $('#d-pal').close(); openFile(r.dataset.pf); } // すでにタブがあればそのタブを、なければ新しく開く
$('#pal-l').onclick = e => palOpen(e.target.closest('[data-pf]'));
$('#pal-in').onkeydown = e => { const rows = $$('#pal-l [data-pf]'); if (e.key === 'Enter') { e.preventDefault(); palOpen(rows[palSel]); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!rows.length) return; palSel = (palSel + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length; rows.forEach((r, k) => r.classList.toggle('sel', k === palSel)); rows[palSel].scrollIntoView({ block: 'nearest' }); } };
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); openPalette(); }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p' || e.key === 'F1') { e.preventDefault(); openCommands(); }
});

const CMD_KEYS = {
  'ホーム': 'home homu main',
  'プロジェクト': 'project purojekuto',
  'ファイル': 'file fairu',
  '検索': 'search kensaku',
  '履歴': 'history rireki commit',
  '共有': 'share kyouyuu',
  '公開': 'publish koukai app',
  'ツール': 'tool tsuuru',
  'ヘルプ': 'help herupu',
  '利用状況': 'usage riyou joukyou',
  '設定': 'settings settei',
  'アカウント': 'account akaunto',
  '外観': 'theme theme gai kan',
  '文字サイズ': 'font moji size',
  'エディター': 'editor edita',
  '操作・余白': 'touch sousa yohaku',
  '通知': 'notify tsuuchi',
  '信頼端末': 'device shinrai tanmatsu',
  'QR読み取りでログイン': 'qr login rogoin',
  'コード入力でログイン': 'code login rogoin',
  'ログアウト': 'logout rogouto',
  'ファイル名を検索': 'file search kensaku ctrl+p',
  'プレビュー': 'preview purebyuu',
  'ファイル内検索': 'find in file kensaku',
  '全体検索': 'search all kensaku',
  'コミット': 'commit komitto',
  'ダークテーマ': 'dark theme daaku',
  'ライトテーマ': 'light theme raito',
  'サブ画面の開閉': 'sub screen sabu',
  '左エリアの表示・非表示': 'left panel hidari',
  '部員': 'member buin',
  '端末': 'device tanmatsu',
  '制限値': 'limit seigen chi',
  'アプリ': 'app apuri',
  'お知らせ': 'announcement oshirase',
  '使用状況・保守': 'usage maint seigen',
  '新しいプロジェクト': 'new project atarashii',
  'ZIPでダウンロード': 'zip download daunroodo',
  '新規ファイル': 'new file atarashii',
  '新規フォルダ': 'new folder atarashii',
  'アップロード': 'upload appuroodo',
  'フォルダをアップロード': 'upload folder appuroodo',
  '保存': 'save hozon',
  'すべて保存': 'save all hozon',
  'このファイルのパスをコピー': 'copy path kopii',
  '新しく公開': 'publish new koukai',
  'を管理': 'manage kanri',
  'を開く': 'open hiraku'
};
/* The palette uses stable English command names; Japanese remains in the
   description and search aliases so existing users can still find commands. */
const CMD_EN = {
  'ホーム': 'Home', 'プロジェクト': 'Projects', 'ファイル': 'Files', '検索': 'Search',
  '履歴': 'History', '共有': 'Sharing', '公開': 'Publish', 'ツール': 'Tools',
  'ヘルプ': 'Help', '利用状況': 'Usage', '設定': 'Settings', 'アカウント': 'Account',
  '外観': 'Appearance', '文字サイズ': 'Font size', 'エディター': 'Editor',
  '操作・余白': 'Touch and spacing', '通知': 'Notifications', '信頼端末': 'Trusted devices',
  'QR読み取りでログイン': 'Sign in with QR', 'コード入力でログイン': 'Sign in with code',
  'ログアウト': 'Sign out', 'ファイル名を検索': 'Find files', 'プレビュー': 'Preview',
  'ファイル内検索': 'Find in file', '全体検索': 'Search project', 'コミット': 'Commit',
  'ダークテーマ': 'Dark theme', 'ライトテーマ': 'Light theme',
  'サブ画面の開閉': 'Toggle secondary pane', '左エリアの表示・非表示': 'Toggle sidebar',
  '新しいプロジェクト': 'New project', 'ZIPでダウンロード': 'Download ZIP',
  '新規ファイル': 'New file', '新規フォルダ': 'New folder', 'アップロード': 'Upload',
  'フォルダをアップロード': 'Upload folder', '保存': 'Save', 'すべて保存': 'Save all',
  'このファイルのパスをコピー': 'Copy file path', '新しく公開': 'Publish app',
  '部員': 'Admin: Members', '端末': 'Admin: Devices', '制限値': 'Admin: Limits', 'アプリ': 'Admin: Apps',
  'お知らせ': 'Admin: Announcements', '使用状況・保守': 'Admin: Usage and maintenance', '共有の一括設定': 'Bulk sharing'
};
/* 画面に出すコマンド名は、英語（またはローマ字）。説明は日本語のまま。日本語でも探せるよう、元の名前は検索のキーに入っている。 */
const commandHistory = [];
function commandItems() {
  const canEdit = S.role !== 'shared-view' && !(S.proj && S.proj.perm === 'view');
  const openSetting = key => { showPanel('sm09'); document.querySelector(`[data-set="${key}"]`)?.click(); };
  const items = [
    ['画面', 'ホーム', 'ホームへ戻る', () => showPanel('home')],
    ['画面', 'プロジェクト', 'プロジェクト一覧を開く', () => showPanel('sm01')],
    ['画面', 'ファイル', 'ファイル一覧を開く', () => showPanel('sm02')],
    ['画面', '検索', '検索・置換を開く', () => showPanel('sm03')],
    ['画面', '履歴', 'コミット履歴を開く', () => showPanel('sm11')],
    ['画面', '共有', '共有設定を開く', () => showPanel('sm04')],
    ['画面', '公開', 'アプリを公開する', () => showPanel('sm05')],
    ['画面', 'ツール', 'ツール一覧を開く', () => showPanel('sm06')],
    ['画面', 'ヘルプ', 'ヘルプを開く', () => showPanel('sm12')],
    ['画面', '利用状況', '使用量を確認する', () => showPanel('sm08')],
    ['画面', '設定', '設定を開く', () => showPanel('sm09')],
    ['画面', 'アカウント', 'アカウントを開く', () => showPanel('sm10')],
    ['設定', '外観', 'テーマ・色を変更', () => openSetting('theme')],
    ['設定', '文字サイズ', '画面・エディターの文字サイズ', () => openSetting('font')],
    ['設定', 'エディター', '折り返し・行番号・タブ幅', () => openSetting('editor')],
    ['設定', '操作・余白', 'タッチ操作・行の余白', () => openSetting('touch')],
    ['設定', '通知', '画面内通知の設定', () => openSetting('notify')],
    ...(isTrusted() ? [
      ['アカウント', '信頼端末', '端末の確認・信頼解除', () => ACCT.devices()],
      ['アカウント', 'QR読み取りでログイン', 'カメラでQRを読み取る', () => ACCT.scanqr()],
      ['アカウント', 'コード入力でログイン', '6桁のコードで承認', () => ACCT.entercode()]] : []),
    ['アカウント', 'ログアウト', 'この端末からログアウト', () => $('#btn-logout').click()],
    ['ファイル・編集', 'ファイル名を検索', 'Ctrl+P', openPalette],
    ['ファイル・編集', 'プレビュー', 'HTML / Markdown のプレビューを開く', preview],
    ['ファイル・編集', 'ファイル内検索', 'Ctrl+F', toggleFind],
    ['ファイル・編集', '全体検索', 'プロジェクト内を検索・置換', () => showPanel('sm03')],
    ['ファイル・編集', 'コミット', '履歴画面を開く', () => showPanel('sm11')],
    ['表示', 'ダークテーマ', '外観を変更', () => VWC.set('theme', 'dark', 'command')],
    ['表示', 'ライトテーマ', '外観を変更', () => VWC.set('theme', 'light', 'command')],
    ['表示', 'サブ画面の開閉', 'メイン / サブ', () => $('#b-sub').click()],
    ['表示', '左エリアの表示・非表示', '左メニューを切り替える', () => setLeftHidden(!$('#app').classList.contains('lh'))]
  ];
  if (S.role === 'admin') for (const [name, key] of [['部員', 'members'], ['端末', 'devices'], ['制限値', 'limits'], ['アプリ', 'apps'], ['お知らせ', 'ann'], ['使用状況・保守', 'maint']]) {
    items.push(['管理', name, '管理画面を開く', () => { showPanel('sm07'); document.querySelector(`[data-adm="${key}"]`)?.click(); }]);
  }
  allProjects().forEach(project => items.push(['プロジェクト', project.name, 'このプロジェクトに切り替える', () => openProject(project.id), '', 'Open ' + project.name]));
  items.push(['プロジェクト', '新しいプロジェクト', 'プロジェクトを作成', () => $('#btn-new').click()]);
  if (S.proj) items.push(['プロジェクト', 'ZIPでダウンロード', '現在のプロジェクト', () => { showPanel('sm01'); document.querySelector(`[data-zip="${S.proj.id}"]`)?.click(); }]);
  if (S.proj && (!S.proj.perm || S.proj.perm === 'owner') && DATA.projects.mine.length) items.push(['共有', '共有の一括設定', '部員への共有を、プロジェクトごとにまとめて ON / OFF', () => { showPanel('sm04'); openBulkShare(); }]);
  if (canEdit) {
    items.push(['ファイル・編集', '新規ファイル', 'ファイルを追加', () => { showPanel('sm02'); $('[data-act=mkfile]').click(); }],
      ['ファイル・編集', '新規フォルダ', 'フォルダを追加', () => { showPanel('sm02'); $('[data-act=mkdir]').click(); }],
      ['ファイル・編集', 'アップロード', 'ファイルをプロジェクトに追加', () => { showPanel('sm02'); $('[data-act=up]').click(); }],
      ['ファイル・編集', 'フォルダをアップロード', 'フォルダをプロジェクトに追加', () => { showPanel('sm02'); $('[data-act=upd]').click(); }],
      ['ファイル・編集', '保存', '現在のタブを保存', () => { const t = S.act[S.grp]; if (t && unsaved(t)) save(t); else showToast('保存する変更はありません'); }],
      ['ファイル・編集', 'すべて保存', '開いている変更を保存', saveAll],
      ['ファイル・編集', 'このファイルのパスをコピー', '現在のタブのパス', () => { const t = S.act[S.grp]; if (!t) return showToast('開いているファイルがありません'); if (!navigator.clipboard?.writeText) return showToast('この環境ではパスをコピーできません'); return navigator.clipboard.writeText(t.path).then(() => showToast('パスをコピーしました'), () => showToast('パスをコピーできませんでした')); }],
      ['アプリ', '新しく公開', '現在のプロジェクト', () => { showPanel('sm05'); $('#pub-new').click(); }]);
  }
  DATA.apps.forEach(app => {
    const project = allProjects().find(p => p.id === app.proj), owner = app.owner === DATA.user.id || project && project.owner === DATA.user.id;
    if (S.role === 'admin' || canEdit && owner) items.push(['アプリ', app.name + 'を管理', 'アプリの公開状態・設定を管理', () => openApp(app.name), '', 'Manage ' + app.name]);
    if (app.state !== '非公開' || owner || (app.viewers || []).includes(DATA.user.id)) items.push(['アプリ', app.name + 'を開く', 'アプリを別タブで開く', () => window.open(APP_URL(app.name), '_blank', 'noopener,noreferrer'), '', 'Open ' + app.name]);
  });
  (DATA.tools || []).forEach(t => items.push(['ツール', t.name, (t.name || '') + '：' + (Array.isArray(t.accepts) ? t.accepts.join('・') : t.accepts || 'ツールを開く'), () => Tools.open(t.id), t.name, 'Tool: ' + t.id]));
  if (typeof helpFiles === 'function') helpFiles().forEach(h => items.push(['ヘルプ', h.title, h.title + '（ヘルプ記事を開く）', () => openHelp(h.file), h.title, 'Help: ' + String(h.file).replace(/\.md$/, '').replace(/^\d+[-_]?/, '')]));
  return items.map((item, id) => {
    const original = item[1], o = { id, category: item[0], name: item[5] || CMD_EN[original] || original, detail: item[2], run: item[3] };
    o.keys = (item[4] || '') + ' ' + original + ' ' + (CMD_KEYS[original] || original) + ' ' + (CMD_KEYS[o.category] || o.category);
    return o;
  });
}
let cmdRows = [], cmdSel = 0;
function renderCommands() {
  const q = $('#cmd-in').value.trim().toLocaleLowerCase();
  const all = commandItems();
  const matched = all.filter(x => !q || q.split(/\s+/).every(term => `${x.category} ${x.name} ${x.detail} ${x.keys || ''}`.toLocaleLowerCase().includes(term)));
  const recent = matched.filter(x => commandHistory.includes(x.id)).sort((a, b) => commandHistory.indexOf(a.id) - commandHistory.indexOf(b.id));
  cmdRows = q ? matched : [...recent, ...matched.filter(x => !recent.includes(x))];
  cmdSel = 0;
  $('#cmd-list').innerHTML = cmdRows.map((x, i) => `<button class="cmd-item${i === 0 ? ' sel' : ''}" data-cmd="${i}"><span class="cmd-cat">${esc(x.category)}</span><span class="cmd-name">${esc(x.name)}</span><span class="cmd-detail">${esc(x.detail)}</span></button>`).join('') || '<div class="pnote">該当するコマンドがありません</div>';
}
function openCommands() {
  $('#cmd-in').value = ''; renderCommands(); $('#d-cmd').showModal(); $('#cmd-in').focus();
}
function runCommand(i) {
  const item = cmdRows[i]; if (!item) return;
  commandHistory.unshift(item.id); commandHistory.splice(20);
  $('#d-cmd').close(); item.run();
}
$('#cmd-open').onclick = openCommands;
$('#cmd-in').oninput = renderCommands;
$('#cmd-list').onclick = e => { const row = e.target.closest('[data-cmd]'); if (row) runCommand(+row.dataset.cmd); };
$('#cmd-in').onkeydown = e => {
  if (e.key === 'Enter') { e.preventDefault(); runCommand(cmdSel); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); if (!cmdRows.length) return;
    cmdSel = (cmdSel + (e.key === 'ArrowDown' ? 1 : -1) + cmdRows.length) % cmdRows.length;
    $$('#cmd-list .cmd-item').forEach((row, i) => row.classList.toggle('sel', i === cmdSel));
    $$('#cmd-list .cmd-item')[cmdSel].scrollIntoView({ block: 'nearest' });
  }
};
