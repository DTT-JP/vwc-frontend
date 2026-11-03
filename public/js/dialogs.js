/* SPDX-License-Identifier: GPL-3.0-or-later */
/* ???????????????????????? */


(() => {
  const open = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function () {
    if (!this.hasAttribute('tabindex')) this.tabIndex = -1;
    open.call(this);
    const a = document.activeElement, touch = document.documentElement.dataset.input === 'touch' || matchMedia('(pointer:coarse)').matches;
    if (touch && a && a !== this && this.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName) && !a.hasAttribute('autofocus')) { a.blur(); this.focus({ preventScroll: true }); }
  };
})();
