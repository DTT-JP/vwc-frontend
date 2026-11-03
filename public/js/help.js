/* SPDX-License-Identifier: GPL-3.0-or-later */
/* ヘルプ：help/ フォルダの Markdown ファイルを読み込んで表示する。
   help/_index.md に並べた .md が項目になる（増減・並べ替えは _index.md を編集）。
   .md を読み込めない環境（file:// 直開き）では help/bundle.js（tools/complete.py で生成）を使う。 */
const store = { get(k, d) { try { const v = localStorage.getItem('portal.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('portal.' + k, JSON.stringify(v)); } catch { /* 保存できない環境 */ } } };
const HELP = { dir: 'help/', items: [], ok: false, cur: null, err: '', read: new Set(store.get('help.read', [])) };
const helpKey = f => f.replace(/^\d+-/, '').replace(/\.md$/i, '');
const FILE_PROTO = location.protocol === 'file:'; // ファイル直開きではブラウザが .md の読み込みを禁止するため、最初から bundle.js を使う
const helpGet = async name => {
  if (FILE_PROTO && window.HELP_BUNDLE && window.HELP_BUNDLE[name] !== undefined) return window.HELP_BUNDLE[name];
  try { const r = await fetch(HELP.dir + name + '?t=' + Date.now()); if (!r.ok) throw new Error(name + ' ' + r.status); return await r.text(); }
  catch (e) { const b = window.HELP_BUNDLE && window.HELP_BUNDLE[name]; if (b !== undefined) return b; throw e; }
};
async function loadHelp() {
  try {
    const items = []; for (const line of (await helpGet('_index.md')).split('\n')) { const g = line.match(/^##\s+(.+)$/), f = line.match(/^\s*[-*]\s+(\S+\.md)\s*$/i); if (g) items.push({ group: g[1].trim() }); else if (f) items.push({ file: f[1] }); }
    await Promise.all(items.filter(x => x.file).map(async it => { try { const { meta, body } = MD.parseMeta(await helpGet(it.file)); Object.assign(it, { title: meta.title || (body.match(/^#\s+(.+)$/m) || [])[1] || it.file, icon: meta.icon || 'article', body }); }
      catch { Object.assign(it, { title: it.file + '（読み込めません）', icon: 'error', body: '', missing: true }); } }));
    HELP.items = items; HELP.ok = true; HELP.err = '';
  } catch (e) { HELP.items = []; HELP.ok = false; HELP.err = String(e.message || e); }
  renderHelpList(); renderGuide();
}
function renderHelpList() {
  $('#help-l').innerHTML = `<div class="row" data-help-reload>${ico('refresh')}<span class="nm">ヘルプを再読み込み</span></div>` + (HELP.ok ? HELP.items.map(x => x.group ? `<div class="grp">${MD.esc(x.group)}</div>`
    : `<div class="row ${x.file === HELP.cur ? 'sel' : ''} ${x.missing ? 'dim' : ''}" data-help="${x.file}">${ico(x.icon)}<span class="nm">${MD.esc(x.title)}</span>${HELP.read.has(x.file) ? ico('check_circle', 'rd') : ''}</div>`).join('') : '<div class="pnote">ヘルプを読み込めませんでした。</div>');
}
const helpFiles = () => HELP.items.filter(x => x.file && !x.missing);
function rHelp() {
  if (!HELP.ok) return `<article class="mdx" data-ctx="help"><h1>ヘルプを読み込めませんでした</h1><div class="callout callout-warning"><div class="callout-t">読み込みエラー</div><p>${MD.esc(HELP.err)}</p></div>
    <p>ヘルプの本文は <code>help/</code> フォルダの <code>.md</code> ファイルです。ファイルとして直接開いている場合は、リポジトリで <code>python3 tools/complete.py</code> を実行して <code>help/bundle.js</code> を作ってください。</p></article>`;
  const fs = helpFiles(), i = fs.findIndex(x => x.file === HELP.cur), it = fs[i < 0 ? 0 : i], k = fs.indexOf(it), prev = fs[k - 1], next = fs[k + 1];
  if (!it) return '<article class="mdx"><h1>ヘルプの項目がありません</h1><p><code>help/_index.md</code> に <code>- ファイル名.md</code> の行を追加してください。</p></article>';
  const nav = a => a ? `<a href="${a.file}" data-md="${a.file}" class="${a === prev ? 'prev' : 'next'}"><small>${a === prev ? '<span class="ms">arrow_back</span>前へ' : '次へ<span class="ms">arrow_forward</span>'}</small><span>${MD.esc(a.title)}</span></a>` : '<span></span>';
  return `<article class="mdx" data-ctx="help">${MD.render(it.body, { tasks: store.get('help.tasks.' + it.file, {}), resolve: u => /^(https?:|data:|blob:|#)/i.test(u) ? u : HELP.dir + u })}
    <nav class="help-nav">${nav(prev)}${nav(next)}</nav></article>`;
}
async function openHelp(key, cached) {
  if (!cached || !HELP.ok) await loadHelp(); const fs = helpFiles(); const it = fs.find(x => x.file === key || helpKey(x.file) === key) || fs[0]; if (it) { HELP.cur = it.file; HELP.read.add(it.file); store.set('help.read', [...HELP.read]); renderGuide(); }
  openLeft('sm12', true); /* 左エリアもヘルプの一覧に切り替える（スマホでは画面は移らない） */
  openTab('ヘルプ', rHelp, 'help', pane => { MD.post(pane); const a = $('.adm', pane); if (a) a.scrollTop = 0; }); renderHelpList();
}
window.mdOpen = (file, ctx) => { if (ctx === 'help') openHelp(file.replace(/#.*$/, ''), true); };
$('#sm12').onclick = e => { if (e.target.closest('[data-help-reload]')) { loadHelp().then(() => showToast('ヘルプを再読み込みしました')); return; } const r = e.target.closest('[data-help]'); if (r) openHelp(r.dataset.help); };

/* ヘルプのチェックボックス：押した状態をこのブラウザに保存（プロジェクトのMarkdownは app.js が元ファイルを書き換える） */
const _mdTask = window.mdTask;
window.mdTask = (n, on, ctx) => { if (ctx === 'help') { const k = 'help.tasks.' + HELP.cur, m = store.get(k, {}); m[n] = on; store.set(k, m); } else if (_mdTask) _mdTask(n, on, ctx); };

/* 学習の案内（VSCodeの「はじめに」のように）：ホームのガイドカード、初回の通知、左バーの赤い点 */
function renderGuide() {
  const fs = helpFiles(), read = fs.filter(f => HELP.read.has(f.file)).length, total = fs.length, next = fs.find(f => !HELP.read.has(f.file)), never = store.get('help.dismissed', false);
  $('#h-guide-b').innerHTML = `<div><b>${read}/${total}</b> 読了</div><div class="meter"><i style="width:${total ? read / total * 100 : 0}%"></i></div>` +
    (next ? `<span class="gd-next">次のおすすめ：${MD.esc(next.title)}</span><button class="primary" id="gd-open">${read ? 'つづきを読む' : 'ヘルプを読む'}</button>` : `<span class="gd-next">すべて読みました。</span><button class="o" id="gd-open">ヘルプを開く</button>`);
  $('#gd-open').onclick = () => openHelp(next ? next.file : 'start');
  $('#dot-help').hidden = !(read === 0 && !never && S.auth === true);
}
/* 案内カード「ヘルプを読んでみませんか？」：ヘルプをまだ読んでいない人に、読むことをすすめる。
   設定＞ヘルプの案内で「表示する」に戻すと（help.again）、ヘルプを一度開くまで、読了済みでもログインのたびに表示する。 */
const welcomeWanted = () => S.auth === true && HELP.ok && !store.get('help.dismissed', false) && !HELP.later && (!HELP.read.size || store.get('help.again', false));
function maybeWelcome() {
  if (!welcomeWanted()) return;
  clearTimeout(maybeWelcome.t); maybeWelcome.t = setTimeout(() => { if (welcomeWanted()) $('#welcome').hidden = false; }, 1200);
}
$('#w-open').onclick = () => { $('#welcome').hidden = true; store.set('help.again', false); openHelp('start'); };
$('#w-later').onclick = () => { $('#welcome').hidden = true; HELP.later = true; };
$('#w-never').onclick = () => { $('#welcome').hidden = true; store.set('help.dismissed', true); store.set('help.again', false); renderGuide(); };
/* 設定＞ヘルプの案内：表示のオン・オフと、いま表示 */
$('#bench').addEventListener('change', e => {
  if (e.target.dataset.hw !== 'on') return;
  if (e.target.checked) { store.set('help.dismissed', false); store.set('help.again', true); HELP.later = false; renderGuide(); if (S.auth === true) { $('#welcome').hidden = false; showToast('ヘルプの案内を表示します'); } else showToast('ログイン後に表示します'); }
  else { store.set('help.dismissed', true); store.set('help.again', false); $('#welcome').hidden = true; renderGuide(); showToast('案内を表示しない設定にしました'); }
});
$('#bench').addEventListener('click', e => {
  if (!e.target.closest('[data-hw=now]')) return;
  if (S.auth !== true) return showToast('ログイン後に表示できます');
  HELP.later = false; $('#welcome').hidden = false;
});
loadHelp().then(maybeWelcome);
