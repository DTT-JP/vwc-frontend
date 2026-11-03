/* SPDX-License-Identifier: GPL-3.0-or-later */
/* ?????????????????????? */

(() => {
  const SKIP = '.ts,#keybar,.ddm,[data-no-vsb]', SC = /auto|scroll/, items = new Map(); /* el -> { v, h, ys, xs } */
  let raf = 0, scanT = 0, hideT = new WeakMap();
  const mk = cls => { const d = document.createElement('div'); d.className = cls; return d; };
  const bodyLayer = mk('vsb-layer'); document.body.appendChild(bodyLayer);
  const layerOf = el => { const d = el.closest('dialog'); if (!d) return bodyLayer; if (!d._vsbl || !d._vsbl.isConnected) { d._vsbl = mk('vsb-layer'); d.appendChild(d._vsbl); } return d._vsbl; };
  const ro = new ResizeObserver(() => schedule());

  function thumb(el, h) {
    const t = mk('vsb' + (h ? ' h' : '')); t.hidden = true; layerOf(el).appendChild(t);
    t.addEventListener('wheel', e => { e.preventDefault(); el.scrollBy(e.deltaX, e.deltaY); }, { passive: false }); 
    t.addEventListener('pointerdown', e => {
      e.preventDefault(); t.setPointerCapture(e.pointerId); t.classList.add('drag');
      const st = h ? el.scrollLeft : el.scrollTop, p0 = h ? e.clientX : e.clientY, k = t._k; 
      const mv = ev => { const d = ((h ? ev.clientX : ev.clientY) - p0) * k; if (h) el.scrollLeft = st + d; else el.scrollTop = st + d; };
      const up = () => { t.classList.remove('drag'); t.removeEventListener('pointermove', mv); t.removeEventListener('pointerup', up); t.removeEventListener('pointercancel', up); };
      t.addEventListener('pointermove', mv); t.addEventListener('pointerup', up); t.addEventListener('pointercancel', up);
    });
    return t;
  }
  function track(el, yOnly) {
    if (items.has(el)) return; const it = { v: thumb(el, false), h: yOnly ? null : thumb(el, true) }; items.set(el, it); ro.observe(el);
  }
  function untrack(el) { const it = items.get(el); if (!it) return; it.v.remove(); if (it.h) it.h.remove(); items.delete(el); ro.unobserve(el); }

  
  function scan() {
    scanT = 0; const now = new Set();
    document.querySelectorAll('body *').forEach(el => {
      if (el.closest && el.matches(SKIP) || el.classList.contains('vsb') || el.classList.contains('vsb-layer')) return;
      if (!(el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) || !el.clientHeight) return;
      const cs = getComputedStyle(el); if (!SC.test(cs.overflowY) && !SC.test(cs.overflowX)) return;
      now.add(el); track(el, el.matches('.ed textarea.in')); 
    });
    [...items.keys()].forEach(el => { if (!now.has(el) && (!el.isConnected || !(el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1))) untrack(el); });
    update();
  }
  function place(t, show, x, y, len, thick) { t.hidden = !show; if (!show) return; t.style.left = x + 'px'; t.style.top = y + 'px'; if (thick === 'v') { t.style.height = len + 'px'; t.style.width = ''; } else { t.style.width = len + 'px'; t.style.height = ''; } }
  function update() {
    raf = 0;
    items.forEach((it, el) => {
      if (!el.isConnected) return untrack(el);
      const r = el.getBoundingClientRect(), vis = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
      const ch = el.clientHeight, sh = el.scrollHeight, cw = el.clientWidth, sw = el.scrollWidth, M = 3, B = 8;
      const cs = vis ? getComputedStyle(el) : null, vy = vis && sh > ch + 1 && SC.test(cs.overflowY), vx = vis && it.h && sw > cw + 1 && SC.test(cs.overflowX);
      if (it.v) { const tl = ch - M * 2 - (vx ? B + M : 0), len = Math.max(28, tl * ch / sh), k = (sh - ch) / Math.max(1, tl - len); it.v._k = k; place(it.v, vy, r.left + el.clientLeft + cw - B - M, r.top + el.clientTop + M + (tl - len) * (el.scrollTop / Math.max(1, sh - ch)), len, 'v'); }
      if (it.h) { const tl = cw - M * 2 - (vy ? B + M : 0), len = Math.max(28, tl * cw / sw), k = (sw - cw) / Math.max(1, tl - len); it.h._k = k; place(it.h, vx, r.left + el.clientLeft + M + (tl - len) * (el.scrollLeft / Math.max(1, sw - cw)), r.top + el.clientTop + ch - B - M, len, 'h'); }
    });
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(update); }
  function scheduleScan() { if (!scanT) scanT = setTimeout(scan, 200); }

  
  document.addEventListener('scroll', e => { const it = items.get(e.target); schedule(); if (!it) return; [it.v, it.h].forEach(t => { if (!t) return; t.classList.add('vsb-on'); clearTimeout(hideT.get(t)); hideT.set(t, setTimeout(() => t.classList.remove('vsb-on'), 900)); }); }, true);
  addEventListener('resize', () => { schedule(); scheduleScan(); });
  document.addEventListener('input', () => { schedule(); scheduleScan(); }, true); 
  new MutationObserver(ms => { if (ms.every(m => m.target.closest && m.target.closest('.vsb-layer'))) return; scheduleScan(); schedule(); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'style', 'open', 'data-view'] });
  scan();
})();
