/* SPDX-License-Identifier: GPL-3.0-or-later */
/* ?????????????????? */

(() => {
  const mk = (tag, cls) => { const d = document.createElement(tag); d.className = cls; return d; };
  const fire = (el, t) => el.dispatchEvent(new Event(t, { bubbles: true }));
  const num = (v, d) => { const n = parseFloat(v); return isNaN(n) ? d : n; };

  
  const stepOf = i => { const s = parseFloat(i.getAttribute('step')); return s > 0 ? s : 1; };
  function stepBy(i, dir) {
    const st = stepOf(i), min = i.getAttribute('min'), max = i.getAttribute('max'), dec = (String(st).split('.')[1] || '').length;
    let v = parseFloat(i.value); v = isNaN(v) ? (min !== null ? +min : 0) : v + dir * st; v = +v.toFixed(dec);
    if (min !== null && v < +min) v = +min; if (max !== null && v > +max) v = +max;
    i.value = dec ? v.toFixed(dec) : String(v); fire(i, 'input'); fire(i, 'change');
  }
  const ASCII = s => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[．。]/g, '.').replace(/[－−ー]/g, '-');
  function enhanceNum(i) {
    if (i._num) return; i._num = true; const w = mk('span', 'num'); i.before(w); i.type = 'text'; i.setAttribute('inputmode', stepOf(i) % 1 ? 'decimal' : 'numeric'); i.autocomplete = 'off'; w.appendChild(i);
    ['up', 'dn'].forEach(k => {
      const b = mk('span', 'nb ' + k); b.setAttribute('aria-hidden', 'true'); b.innerHTML = '<span class="ms">' + (k === 'up' ? 'keyboard_arrow_up' : 'keyboard_arrow_down') + '</span>'; w.appendChild(b);
      b.addEventListener('pointerdown', e => { if (i.disabled) return; e.preventDefault(); stepBy(i, k === 'up' ? 1 : -1); let t = setTimeout(function r() { stepBy(i, k === 'up' ? 1 : -1); t = setTimeout(r, 60); }, 420); const stop = () => { clearTimeout(t); removeEventListener('pointerup', stop); removeEventListener('pointercancel', stop); }; addEventListener('pointerup', stop); addEventListener('pointercancel', stop); });
    });
    i.addEventListener('keydown', e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); stepBy(i, e.key === 'ArrowUp' ? 1 : -1); } });
    i.addEventListener('beforeinput', e => { if (e.data && !e.isComposing && /[^0-9.\-]/.test(e.data)) e.preventDefault(); });
    i.addEventListener('input', e => { if (e.isComposing) return; const v = ASCII(i.value).replace(/[^0-9.\-]/g, ''); if (v !== i.value) i.value = v; });
    i.addEventListener('compositionend', () => { const v = ASCII(i.value).replace(/[^0-9.\-]/g, ''); if (v !== i.value) { i.value = v; fire(i, 'input'); } });
    w.classList.toggle('dis', i.disabled);
  }

  
  function syncRange(i) {
    const d = i._rg; if (!d) return; const min = num(i.min, 0), max = num(i.max, 100), v = Math.min(max, Math.max(min, num(i.value, min)));
    d.style.setProperty('--p', max > min ? (v - min) / (max - min) : 0); d.setAttribute('aria-valuemin', min); d.setAttribute('aria-valuemax', max); d.setAttribute('aria-valuenow', v);
    d.classList.toggle('dis', i.disabled); d.setAttribute('aria-disabled', i.disabled); d.tabIndex = i.disabled ? -1 : 0;
  }
  function enhanceRange(i) {
    if (i._rg) return; const d = mk('div', 'rg'); d.setAttribute('role', 'slider'); d.innerHTML = '<i class="rg-f"></i><i class="rg-t"></i>'; d.style.cssText = i.style.cssText;
    i.classList.add('rg-src'); i.after(d); i._rg = d;
    const set = v => { const min = num(i.min, 0), max = num(i.max, 100), st = num(i.step, 1) || 1; v = Math.round((v - min) / st) * st + min; v = Math.min(max, Math.max(min, +v.toFixed(6))); if (String(v) !== i.value) { i.value = String(v); fire(i, 'input'); } };
    const fromX = x => { const r = d.getBoundingClientRect(), min = num(i.min, 0), max = num(i.max, 100); set(min + Math.min(1, Math.max(0, (x - r.left - 9) / Math.max(1, r.width - 18))) * (max - min)); };
    d.addEventListener('pointerdown', e => { if (i.disabled) return; e.preventDefault(); d.focus(); d.setPointerCapture(e.pointerId); fromX(e.clientX); const mv = ev => fromX(ev.clientX), up = () => { d.removeEventListener('pointermove', mv); d.removeEventListener('pointerup', up); d.removeEventListener('pointercancel', up); fire(i, 'change'); }; d.addEventListener('pointermove', mv); d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up); });
    d.addEventListener('keydown', e => { if (i.disabled) return; const st = num(i.step, 1) || 1, v = num(i.value, 0), min = num(i.min, 0), max = num(i.max, 100); const m = { ArrowLeft: v - st, ArrowDown: v - st, ArrowRight: v + st, ArrowUp: v + st, PageDown: v - st * 10, PageUp: v + st * 10, Home: min, End: max }[e.key]; if (m === undefined) return; e.preventDefault(); set(m); fire(i, 'change'); });
    syncRange(i);
  }

  
  function syncProg(p) { const d = p._pg; if (!d) return; const v = num(p.value, 0), m = num(p.max, 100); d.firstChild.style.width = Math.max(0, Math.min(100, m > 0 ? v / m * 100 : 0)) + '%'; d.setAttribute('aria-valuenow', v); d.setAttribute('aria-valuemax', m); }
  function enhanceProg(p) { if (p._pg) return; const d = mk('div', 'pgb'); d.setAttribute('role', 'progressbar'); d.innerHTML = '<i></i>'; d.style.cssText = p.style.cssText; p.classList.add('pg-src'); p.after(d); p._pg = d; syncProg(p); }

  
  const hook = (proto, key, fn) => { const d = Object.getOwnPropertyDescriptor(proto, key); Object.defineProperty(proto, key, { ...d, set(v) { d.set.call(this, v); fn(this); } }); };
  hook(HTMLInputElement.prototype, 'value', i => { if (i._rg) syncRange(i); }); hook(HTMLInputElement.prototype, 'disabled', i => { if (i._rg) syncRange(i); if (i._num) i.parentNode.classList.toggle('dis', i.disabled); });
  hook(HTMLProgressElement.prototype, 'value', syncProg); hook(HTMLProgressElement.prototype, 'max', syncProg);

  
  document.addEventListener('click', e => { const h = e.target.closest('.dsc-h'); if (!h) return; const open = h.getAttribute('aria-expanded') === 'true'; h.setAttribute('aria-expanded', String(!open)); h.nextElementSibling.hidden = open; });

  const scan = r => { if (r.nodeType !== 1) return; const q = s => [...(r.matches(s) ? [r] : []), ...r.querySelectorAll(s)]; q('input[type=number]').forEach(enhanceNum); q('input[type=range]').forEach(enhanceRange); q('progress').forEach(enhanceProg); };
  scan(document.body);
  new MutationObserver(ms => ms.forEach(m => { m.addedNodes.forEach(scan); if (m.type === 'attributes') { const t = m.target; if (t._rg) syncRange(t); if (t._pg) syncProg(t); if (t._num) t.parentNode.classList.toggle('dis', t.disabled); } })).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['min', 'max', 'disabled', 'value'] });
})();
