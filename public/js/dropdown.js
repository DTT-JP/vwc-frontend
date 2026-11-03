/* SPDX-License-Identifier: GPL-3.0-or-later */
/* select ? datalist ????? */

(() => {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let cur = null; 

  
  function place(b, m) {
    const r = b.getBoundingClientRect(), vh = innerHeight, below = vh - r.bottom - 8, above = r.top - 8;
    m.style.minWidth = r.width + 'px'; m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px';
    const h = Math.min(m.scrollHeight, 320), up = below < Math.min(h, 200) && above > below;
    m.style.maxHeight = Math.max(120, Math.min(320, up ? above : below)) + 'px';
    m.style.top = up ? Math.max(8, r.top - Math.min(h, parseFloat(m.style.maxHeight)) - 4) + 'px' : (r.bottom + 4) + 'px';
  }
  function show(kind, b, labels, selected, pick) {
    closeMenu(); if (!labels.length) return;
    const m = document.createElement('div'); m.className = 'ddm'; m.setAttribute('role', 'listbox'); m.addEventListener('pointerdown', e => e.preventDefault()); 
    m.innerHTML = labels.map((l, i) => `<div class="ddi${i === selected ? ' ddon' : ''}${l.off ? ' off' : ''}" role="option" data-i="${i}" aria-selected="${i === selected}"><span>${esc(l.t)}</span>${i === selected ? '<span class="ms">check</span>' : ''}</div>`).join('');
    m.style.setProperty('--row', getComputedStyle(b).getPropertyValue('--row') || '36px'); 
    (b.closest('dialog') || document.body).appendChild(m); 
    cur = { kind, b, m, items: labels, act: selected, pick }; place(b, m); b.setAttribute('aria-expanded', 'true');
    m.addEventListener('click', e => { const it = e.target.closest('.ddi'); if (!it || it.classList.contains('off')) return; const i = +it.dataset.i, p = cur.pick; closeMenu(); p(i); });
    m.addEventListener('pointermove', e => { const it = e.target.closest('.ddi'); if (it && !it.classList.contains('off')) setAct(+it.dataset.i); });
    setAct(selected, true);
  }
  function setAct(i, center) { if (!cur) return; cur.act = i; [...cur.m.children].forEach((c, k) => c.classList.toggle('ddact', k === i)); const c = cur.m.children[i], m = cur.m; if (c) {  if (center) m.scrollTop = c.offsetTop - (m.clientHeight - c.offsetHeight) / 2; else if (c.offsetTop < m.scrollTop) m.scrollTop = c.offsetTop; else if (c.offsetTop + c.offsetHeight > m.scrollTop + m.clientHeight) m.scrollTop = c.offsetTop + c.offsetHeight - m.clientHeight; } }
  function closeMenu() { if (!cur) return; cur.m.remove(); cur.b.setAttribute('aria-expanded', 'false'); cur = null; }
  const move = d => { if (!cur) return; const n = cur.items.length; let i = cur.act; for (let k = 0; k < n; k++) { i = (i + d + n) % n; if (!cur.items[i].off) break; } setAct(i); };

  /* ---------- select ---------- */
  const label = s => (s.options[s.selectedIndex] ? s.options[s.selectedIndex].textContent.trim() : '');
  function sync(s) { const b = s._dd; if (!b) return; $('.ddl', b).textContent = label(s) || '\u00a0'; b.disabled = s.disabled; }
  function enhance(s) {
    if (s._dd || s.multiple || s.size > 1) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = ('dd ' + s.className).trim(); b.style.cssText = s.style.cssText; if (s.title) b.title = s.title;
    b.setAttribute('aria-haspopup', 'listbox'); b.setAttribute('aria-expanded', 'false'); b.innerHTML = '<span class="ddl"></span>';
    s.classList.add('dd-src'); s.tabIndex = -1; s.after(b); s._dd = b; b._sel = s; sync(s);
    b.addEventListener('click', () => { if (cur && cur.b === b) return closeMenu(); openSel(b); });
  }
  function openSel(b) {
    const s = b._sel; if (s.disabled) return;
    show('sel', b, [...s.options].map(o => ({ t: o.textContent.trim(), off: o.disabled })), s.selectedIndex, i => { s.selectedIndex = i; sync(s); s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); b.focus(); });
  }
  
  for (const k of ['value', 'selectedIndex']) { const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, k); Object.defineProperty(HTMLSelectElement.prototype, k, { ...d, set(v) { d.set.call(this, v); sync(this); } }); }

  
  const cbItems = i => { const dl = document.getElementById(i.dataset.list), q = i.value.trim().toLowerCase(); return dl ? [...dl.options].map(o => o.value).filter(v => !q || v.toLowerCase().includes(q)) : []; };
  function openCb(i, all) {
    const q = i.value.trim().toLowerCase(), vals = cbItems(i).filter(v => all || (q && v.toLowerCase() !== q)); if (!vals.length) return closeMenu();
    show('cb', i, vals.map(v => ({ t: v })), -1, k => { i.value = vals[k]; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); });
    if (cur) cur.act = -1;
  }
  function enhanceInput(i) {
    if (i._cb) return; const id = i.getAttribute('list'); if (!id) return; i._cb = true; i.dataset.list = id; i.removeAttribute('list'); i.autocomplete = 'off'; i.setAttribute('aria-autocomplete', 'list');
    i.addEventListener('input', () => { if (document.activeElement === i) openCb(i, false); });
    i.addEventListener('blur', () => { if (cur && cur.b === i) closeMenu(); });
  }

  
  document.addEventListener('keydown', e => {
    const t = e.target;
    if (cur) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); return; } 
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Home' || e.key === 'End') { if (cur.kind === 'sel') { e.preventDefault(); setAct(e.key === 'Home' ? 0 : cur.items.length - 1); } }
      else if (e.key === 'Enter' || (e.key === ' ' && cur.kind === 'sel')) { if (cur.act >= 0 && !cur.items[cur.act].off) { e.preventDefault(); const p = cur.pick, i = cur.act; closeMenu(); p(i); } else if (cur.kind === 'cb') closeMenu(); }
      else if (e.key === 'Tab') closeMenu();
      else if (cur.kind === 'sel' && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { const n = cur.items.length, c = e.key.toLowerCase(); for (let k = 1; k <= n; k++) { const i = (cur.act + k) % n; if (!cur.items[i].off && cur.items[i].t.toLowerCase().startsWith(c)) { setAct(i); break; } } }
      return;
    }
    if (t.classList && t.classList.contains('dd') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); openSel(t); }
    else if (t._cb && e.key === 'ArrowDown') { e.preventDefault(); openCb(t, true); }
  }, true);
  document.addEventListener('pointerdown', e => { if (cur && !cur.m.contains(e.target) && !(cur.b === e.target || cur.b.contains(e.target))) closeMenu(); }, true);
  document.addEventListener('scroll', e => { if (cur && !cur.m.contains(e.target)) closeMenu(); }, true);
  addEventListener('resize', closeMenu);
  document.addEventListener('close', closeMenu, true); document.addEventListener('cancel', closeMenu, true); 

  
  const scan = root => { if (root.nodeType !== 1) return; if (root.matches('select')) enhance(root); if (root.matches('input[list]')) enhanceInput(root); root.querySelectorAll('select').forEach(enhance); root.querySelectorAll('input[list]').forEach(enhanceInput); };
  scan(document.body);
  new MutationObserver(ms => ms.forEach(m => {
    m.addedNodes.forEach(scan);
    const s = m.target.nodeType === 1 ? m.target.closest('select') : (m.target.parentElement && m.target.parentElement.closest('select')); if (s) sync(s);
    if (m.type === 'attributes' && m.target.matches('select')) sync(m.target);
  })).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled'] });
})();
