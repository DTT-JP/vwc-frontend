/* SPDX-License-Identifier: GPL-3.0-or-later */
/* ライセンス表示。右エリアのタブとして開き、ヘルプやプレビューと同じ Markdown 描画（markdown.js）で表示する。
   ・文書の実体は license/ フォルダの .md ファイル（tools/complete.py が生成。手で編集しない）。
   ・バックエンド（API）には一切アクセスしない。ログアウト状態でも、バックエンドが停止・未配置でも開ける。
   ・読み込みの順序：license/bundle.js（1ファイルにまとめたもの）→ 各 .md を直接取得 → 最小限の内蔵文。
   ・設定＞ライセンス、ログアウト時のホーム（左・右）の「ライセンス」から開く。 */
const LIC = { dir: 'license/', items: [], ok: false, cur: null, err: '', top: true };

/* どの文書も読み込めないときに最低限出す内蔵文（配布物が壊れていても、ライセンスの所在だけは示す） */
const LIC_FALLBACK = {
  '_index.md': '## ライセンス\n- 01-overview.md\n',
  '01-overview.md': '# このアプリのライセンス\n\n' +
    'Visual Web Code フロントエンドは **GNU General Public License version 3 or later（GPL-3.0-or-later）** で提供されます。\n\n' +
    '> [!WARNING] ライセンス文書を読み込めませんでした\n> この配布物の `license/` フォルダ（`license/bundle.js` または `license/*.md`）が見つかりません。' +
    '配布元で `python3 tools/complete.py` を実行して生成してください。\n\n' +
    'GPL-3.0 の全文は [https://www.gnu.org/licenses/gpl-3.0.html](https://www.gnu.org/licenses/gpl-3.0.html) で確認できます。\n' +
    'このプログラムには保証がありません。'
};

/* license/bundle.js を必要になったときだけ読み込む（ファイル直開きでも .md を fetch できないため） */
let licBundleP = null;
const licLoadBundle = () => window.LICENSE_BUNDLE ? Promise.resolve(true) : (licBundleP = licBundleP || new Promise(resolve => {
  const s = document.createElement('script');
  s.src = LIC.dir + 'bundle.js';
  s.onload = () => resolve(!!window.LICENSE_BUNDLE);
  s.onerror = () => { licBundleP = null; resolve(false); };
  document.head.appendChild(s);
}));

async function licText(name) {
  const b = window.LICENSE_BUNDLE;
  if (b && b[name] !== undefined) return b[name];
  try {
    const r = await fetch(LIC.dir + name);
    if (!r.ok) throw new Error(name + ' ' + r.status);
    return await r.text();
  } catch (e) {
    if (LIC_FALLBACK[name] !== undefined) return LIC_FALLBACK[name];
    throw e;
  }
}

async function loadLicense() {
  try {
    await licLoadBundle();
    const items = [];
    for (const line of (await licText('_index.md')).split('\n')) {
      const g = line.match(/^##\s+(.+)$/), f = line.match(/^\s*[-*]\s+(\S+\.md)\s*$/i);
      if (g) items.push({ group: g[1].trim() }); else if (f) items.push({ file: f[1] });
    }
    await Promise.all(items.filter(x => x.file).map(async it => {
      try {
        const { meta, body } = MD.parseMeta(await licText(it.file));
        Object.assign(it, { title: meta.title || (body.match(/^#\s+(.+)$/m) || [])[1] || it.file, body });
      } catch { Object.assign(it, { title: it.file + '（読み込めません）', body: '', missing: true }); }
    }));
    LIC.items = items; LIC.ok = items.some(x => x.file && !x.missing); LIC.err = LIC.ok ? '' : 'ライセンス文書が見つかりません';
  } catch (e) { LIC.items = []; LIC.ok = false; LIC.err = String(e.message || e); }
}

const licFiles = () => LIC.items.filter(x => x.file && !x.missing);

function rLicense() {
  if (!LIC.ok) {
    return `<article class="mdx" data-ctx="license"><h1>ライセンスを読み込めませんでした</h1><div class="callout callout-warning"><div class="callout-t">読み込みエラー</div><p>${MD.esc(LIC.err)}</p></div>
      <p>このアプリは GNU GPL version 3 or later（GPL-3.0-or-later）で提供されます。全文は <a href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noopener">https://www.gnu.org/licenses/gpl-3.0.html</a> で確認できます。</p></article>`;
  }
  const fs = licFiles(), i = fs.findIndex(x => x.file === LIC.cur), it = fs[i < 0 ? 0 : i], k = fs.indexOf(it), prev = fs[k - 1], next = fs[k + 1];
  /* 上の切り替えは、ログイン画面の上のタブと同じ部品（.seg.login-tabs）。選ばれているタブは青い背景＋白い文字 */
  const ICONS_LIC = ['gavel', 'description', 'inventory_2', 'verified', 'info'];
  const chip = (x, j) => `<button type="button" role="tab" data-lic-tab="${MD.esc(x.file)}" class="${x === it ? 'on' : ''}" aria-selected="${x === it}"><span class="ms">${ICONS_LIC[j % ICONS_LIC.length]}</span><span>${MD.esc(x.title)}</span></button>`;
  const nav = a => a ? `<a href="${MD.esc(a.file)}" data-md="${MD.esc(a.file)}" class="${a === prev ? 'prev' : 'next'}"><small>${a === prev ? '<span class="ms">arrow_back</span>前へ' : '次へ<span class="ms">arrow_forward</span>'}</small><span>${MD.esc(a.title)}</span></a>` : '<span></span>';
  return `<article class="mdx" data-ctx="license"><div class="seg login-tabs lic-tabbar" role="tablist" aria-label="ライセンス文書">${fs.map(chip).join('')}</div>${MD.render(it.body, { resolve: u => u })}
    <nav class="help-nav">${nav(prev)}${nav(next)}</nav></article>`;
}

async function openLicense(file) {
  if (!LIC.ok) await loadLicense();
  const fs = licFiles(), it = fs.find(x => x.file === file) || fs.find(x => x.file === LIC.cur) || fs[0];
  LIC.cur = it ? it.file : null; LIC.top = true;
  openTab('ライセンス', rLicense, 'description', pane => {
    MD.post(pane);
    const a = $('.adm', pane);
    if (a && LIC.top) { a.scrollTop = 0; LIC.top = false; } // 文書を切り替えたときだけ先頭へ（他の再描画では位置を保つ）
  });
}

/* ライセンス文書どうしのリンク（[…](03-third-party.md)）と上部の切替 */
const licPrevMdOpen = window.mdOpen;
window.mdOpen = (file, ctx) => { if (ctx === 'license') openLicense(file.replace(/#.*$/, '')); else if (licPrevMdOpen) licPrevMdOpen(file, ctx); };

document.addEventListener('click', e => { const b = e.target.closest('[data-lic-tab]'); if (b) { e.preventDefault(); openLicense(b.dataset.licTab); } });

/* 入口：[data-license]（設定、ログアウト時のホーム左・右） */
document.addEventListener('click', e => { const r = e.target.closest('[data-license]'); if (r) { e.preventDefault(); openLicense(); } });
document.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const r = e.target.closest && e.target.closest('[data-license]'); if (r && r === e.target) { e.preventDefault(); openLicense(); } });
