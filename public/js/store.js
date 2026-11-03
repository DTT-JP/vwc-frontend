/* SPDX-License-Identifier: GPL-3.0-or-later */
/* ??????????????? */

const VWC = (() => {
  const v = { theme: 'dark', role: 'member', screen: 'editor', state: 'normal', width: 'auto' }, h = {};
  return {
    get: k => v[k],
    set(k, x, src) { if (v[k] === x && src !== 'force') return; v[k] = x; (h[k] || []).forEach(f => f(x, src)); (h['*'] || []).forEach(f => f(k, x, src)); },
    on(k, f) { (h[k] = h[k] || []).push(f); },
  };
})();
