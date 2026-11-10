/* SPDX-License-Identifier: GPL-3.0-or-later */
/* お知らせ（N05〜N07）と「忘れていませんか？」（N06）。ホームに表示する。
   ・お知らせ（announcements）：管理者が作る。表示期間・対象（全員／管理者のみ）・重要度（通常／注意／重要）。
   ・忘れていませんか？（notices）：API（notices/list）が条件から作る。放置アプリ・容量80%超・信頼端末の期限7日前・（管理者のみ）孤立アプリ。
     「あとで」＝一定時間（24時間）隠す、「もう通知しない」＝閉じる。状態はこのブラウザに保存する（localStorage）。
   API は通知を作り直すので、表示のたびに最新を読み、端末側の状態を重ねて表示する。 */
const SNOOZE_MS = 24 * 3600 * 1000, NKEY = 'vwc.notices.v1';
const Nst = { m: {}, load() { try { this.m = JSON.parse(localStorage.getItem(NKEY) || '{}'); } catch (e) { this.m = {}; } }, save() { try { localStorage.setItem(NKEY, JSON.stringify(this.m)); } catch (e) { /* 保存できなくても、この画面の間は有効 */ } } };
Nst.load();
const nStateOf = key => { const s = Nst.m[key]; if (!s) return 'active'; if (s.s === 'closed') return 'closed'; return s.until > Date.now() ? 'later' : 'active'; };
const isoToday = () => new Date().toISOString().slice(0, 10);
const isLocalAction = d => d === 'later' || d === 'close';
function noticeWithState(n) {
  const actions = (n.actions || []).filter(a => a && a.do && !isLocalAction(a.do));
  return {
    ...n,
    actions: [...actions, { label: 'あとで', do: 'later' }, { label: 'もう通知しない', do: 'close' }],
    state: nStateOf(n.key)
  };
}
const lvIcon = { info: 'info', warn: 'warning', danger: 'error' };
const linkifyAnn = text => {
  const s = String(text ?? ''), re = /https?:\/\/[^\s<>"']+/g;
  let out = '', i = 0, m;
  while ((m = re.exec(s))) {
    let url = m[0], trail = '';
    while (/[)\].,!?;:]+$/.test(url)) { trail = url.slice(-1) + trail; url = url.slice(0, -1); }
    out += esc(s.slice(i, m.index));
    if (url) out += `<a class="ann-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>`;
    out += esc(trail);
    i = m.index + m[0].length;
  }
  out += esc(s.slice(i));
  return out.replace(/\n/g, '<br>');
};
const annCard = a => `<div class="an ${a.level}"><span class="ms">${lvIcon[a.level] || 'info'}</span><div><b>${esc(a.kind)}</b>${a.audience === 'admin' ? ' ' + bd('管理者のみ') : ''}<div class="an-t">${esc(a.title)}</div>${a.body ? `<p>${linkifyAnn(a.body)}</p>` : ''}</div></div>`; /* 表示期間（from〜to）は、表示するかどうかの判定にだけ使う。画面には出さない */
const annActive = () => { const t = isoToday(); return DATA.announcements.filter(a => a.from <= t && t <= a.to && (a.audience === 'all' || S.role === 'admin')).sort((a, b) => ['danger', 'warn', 'info'].indexOf(a.level) - ['danger', 'warn', 'info'].indexOf(b.level)); };
function renderNotices() {
  const n = $('#h-news'), w = $('#h-notice'); if (!n) return; const an = annActive();
  n.innerHTML = '<h3><span class="ms">campaign</span>お知らせ</h3>' + (an.length ? an.map(annCard).join('') : '<p class="dnote">いまのお知らせはありません。</p>');
  const act = DATA.notices.map(noticeWithState).filter(x => x.state === 'active');
  w.hidden = !act.length;
  w.innerHTML = '<h3><span class="ms">lightbulb</span>忘れていませんか？</h3>' + act.map(x => `<div class="nt" data-key="${esc(x.key)}"><div><b>${esc(x.title)}</b><p>${esc(x.body)}</p></div><div class="nt-a">${x.actions.map(a => `<button class="${isLocalAction(a.do) ? '' : 'o'}" data-na="${esc(x.key)}" data-do="${esc(a.do)}" data-arg="${esc(a.arg || '')}">${esc(a.label)}</button>`).join('')}</div></div>`).join('');
}
function refreshNotices() { void reloadNotices(); }
async function reloadNotices() { try { await loadNotices(); } catch (e) { if (!(e instanceof ApiError) || ![403, 404].includes(e.status)) console.warn('notices load failed', e); } renderNotices(); }
document.addEventListener('click', e => { const b = e.target.closest('[data-na]'); if (!b) return; const key = b.dataset.na, d = b.dataset.do, arg = b.dataset.arg;
  if (d === 'later') { Nst.m[key] = { s: 'later', until: Date.now() + SNOOZE_MS }; Nst.save(); renderNotices(); showToast('あとでお知らせします（24時間後）'); }
  else if (d === 'close') { Nst.m[key] = { s: 'closed' }; Nst.save(); renderNotices(); showToast('今後は通知しません'); }
  else if (d === 'open-app') { if (arg) openApp(arg); else showToast('アプリを選べませんでした'); }
  else if (d === 'open-usage') $('#h-usage-detail').click();
  else if (d === 'open-devices') ACCT.devices();
  else if (d === 'open-adm-apps') openTab('管理: アプリ(管理)', rApps, undefined, renderAdmReauth);
  else if (arg) showToast(arg); });
const NOTICE_RESET = () => { Nst.m = {}; Nst.save(); renderNotices(); };
VWC.on('role', () => { reloadNotices(); });
renderNotices();
