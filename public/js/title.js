/* SPDX-License-Identifier: GPL-3.0-or-later */
/* ブラウザのタブに出る <title> を「VWC | 今開いているもの」にする（アプリ名は Visual Web Code）。
   例：VWC | portfolio/index.html　／　VWC | 音声カットツール　／　VWC | 設定: 文字サイズ　／　VWC | ホーム
   ファイルは「プロジェクト名/パス」、ツール・設定・管理・ヘルプなどのタブは、タブの名前。スマホで左の画面を見ているときは、その画面の名前。
   画面の切替・タブの切替・プロジェクトの切替は、DOMの変化を見て、まとめて1回だけ更新する。 */
(() => {
  const APP = 'VWC'; let raf = 0;
  const part = () => {
    const app = $('#app'), home = $('#home');
    if (isPhone() && app.dataset.view === 'left') { const h = $('.lp.on h2'); return h ? h.textContent.trim() : 'ホーム'; } /* スマホで左の画面（ファイル・検索・履歴など） */
    if (home && !home.hidden) return 'ホーム';
    const t = S.act && S.act[S.grp]; if (!t) return S.proj ? S.proj.name : 'ホーム';
    if (t.prev) return S.proj.name + '/' + t.path.split('#')[0] + '（プレビュー）';
    if (t.render || t.path[0] === '#' || !t.f) { /* ツール・設定・管理・ヘルプなど */
      if (t.name === 'ヘルプ') { const h = $('.pane .mdx h1'); if (h && h.textContent.trim()) return 'ヘルプ: ' + h.textContent.trim(); }
      return t.name;
    }
    return S.proj.name + '/' + t.path;
  };
  const update = () => { raf = 0; let p; try { p = part(); } catch (e) { p = 'ホーム'; } const t = APP + ' | ' + p; if (document.title !== t) document.title = t; };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'data-view'] });
  update();
})();
