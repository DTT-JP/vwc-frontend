/* SPDX-License-Identifier: GPL-3.0-or-later */
const LAYOUT_BP = { phone: 600, pc: 1024 };
const layoutOf = w => w < LAYOUT_BP.phone ? 'phone' : w < LAYOUT_BP.pc ? 'tablet' : 'pc';
(() => {
  let cur = null, raf = 0;
  function apply(first) {
    raf = 0;
    const override = VWC.get('width');
    const mode = override && override !== 'auto' ? override : layoutOf(document.documentElement.clientWidth || innerWidth);
    if (mode === cur) return;
    const was = cur;
    cur = mode;
    const app = $('#app');
    app.classList.remove('w-pc', 'w-tablet', 'w-phone');
    app.classList.add('w-' + mode);
    document.documentElement.dataset.layout = mode;
    if (first) return;
    if (mode === 'phone') app.dataset.view = 'right';
    if (window.renderTabs) renderTabs();
    if (window.showStatebar) showStatebar(VWC.get('state'));
    dispatchEvent(new CustomEvent('vwc:layout', { detail: { layout: mode, from: was } }));
  }
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(() => apply(false));
  };
  addEventListener('resize', schedule);
  addEventListener('orientationchange', schedule);
  new ResizeObserver(schedule).observe(document.documentElement);
  apply(true);
  VWC.on('width', schedule);
})();

/* ホームのカード幅（お知らせ・忘れていませんか？）。1要素＝カード1枚ぶんの幅。いまの横の要素数を N として：
   N=1 → 1要素（縦に1列）／N=2 → 2要素（行いっぱい）／N=3 → 1.5要素ずつ／N=4 → 2要素ずつ／N=5 → 2.5要素ずつ… （つまり N が3以上なら N/2、2なら2）。
   列は「半要素」を単位にした 2N 列のグリッドで作り、先頭の3枚は N が3以上なら行を分け合い（--s1〜--s3）、お知らせと提案は --wide 列ぶんを使う。 */
(function () {
  const MINW = 250;
  const apply = el => {
    const cs = getComputedStyle(el), gap = parseFloat(cs.columnGap) || 0, w = el.clientWidth;
    if (!w) return;
    const n = Math.max(1, Math.floor((w + gap) / (MINW + gap))), wide = n === 1 ? 2 : n === 2 ? 4 : n;
    const base = Math.floor(2 * n / 3), extra = 2 * n % 3;
    const spans = n >= 3 ? [base + (extra > 0 ? 1 : 0), base + (extra > 1 ? 1 : 0), base] : [2, 2, 2];
    const key = n + '|' + spans.join(',');
    if (el.dataset.k !== key) {
      el.dataset.k = key;
      el.dataset.n = n;
      el.style.setProperty('--n2', n * 2);
      el.style.setProperty('--wide', wide);
      spans.forEach((value, i) => el.style.setProperty('--s' + (i + 1), value));
    }
  };
  const start = () => {
    const el = document.querySelector('#home .home-wrap.only-in .cards');
    if (!el) return;
    apply(el);
    new ResizeObserver(() => apply(el)).observe(el);
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
})();

/* 画面下のバー（PC・タブレットは青いステータスバー、スマホは下のナビ、タッチ時はキーバー）の高さを --bar-h に入れる。
   下に出す通知（トースト・ヘルプの案内・変換の進行・転送トレイ）は、このバーの上に置いてバーを隠さない。 */
(() => {
  const bars = ['#status', '#bnav', '#keybar'].map(s => document.querySelector(s)).filter(Boolean);
  let raf = 0;
  const apply = () => { raf = 0; document.documentElement.style.setProperty('--bar-h', bars.reduce((s, el) => s + (el.offsetHeight || 0), 0) + 'px'); };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(apply); };
  const ro = new ResizeObserver(schedule); bars.forEach(el => ro.observe(el));
  new MutationObserver(schedule).observe(document.querySelector('#app'), { attributes: true, attributeFilter: ['class', 'data-view'] });
  addEventListener('resize', schedule);
  apply();
})();
/* 右下に出す枠の置き場（互いに重ならないよう縦に積む） */
window.floatStack = () => { let el = document.getElementById('float-stack'); if (!el) { el = document.createElement('div'); el.id = 'float-stack'; document.body.appendChild(el); } return el; };
