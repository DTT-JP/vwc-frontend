/* SPDX-License-Identifier: GPL-3.0-or-later */
/* ログイン状態 / ログイン（エディター内タブ）/ 承認 / 独立画面(S19,S20)。
   認証は 02・04 の契約（auth/start, auth/poll, auth/approve, auth/logout）を使う。 */
function closeTab(name) {
  if (name === 'ログイン') stopLoginPoll();
  S.tabs = S.tabs.filter(t => t.path !== '#' + name);
  renderTabs();
}
function setAuth(v) { // 未ログインでも常にエディター画面を出し、ホームにログイン方法を表示する
  S.auth = v; $('#app').classList.toggle('out', !v);
  if (!v) {
    stopLoginPoll();
    setLeftHidden(false); $('#g2').dataset.keep = ''; S.tabs = []; G.forEach(g => S.act[g] = null);
    renderTabs(); $('#home').hidden = false; setPanel('home-l'); $('#app').dataset.view = 'right';
  } else {
    S.tabs = S.tabs.filter(t => !['#ログイン', '#端末の登録'].includes(t.path));
    setPanel(prevPanel); renderTabs();
  }
  VWC.set('screen', v ? 'editor' : 'out', 'app'); $('#screens').hidden = true; renderHome();
  $$('#bnav button:not(#bn-home)').forEach(b => b.disabled = !v); updateStatus();
  if (window.maybeWelcome) { if (v) maybeWelcome(); else { $('#welcome').hidden = true; if (window.renderGuide) renderGuide(); } }
}
const show = id => {
  if (VWC.get('state') === 'version' && id !== 's20') id = 's20';
  const full = id === 's19' || id === 's20';
  $('#screens').hidden = !full; $$('.scr').forEach(s => s.hidden = s.id !== id);
  if (id === 'editor') setAuth(true); if (id === 'out') setAuth(false);
  VWC.set('screen', id, 'app');
};
VWC.on('screen', (id, src) => { if (src !== 'app') show(id); });
$$('[data-go]').forEach(a => a.onclick = e => { e.preventDefault(); show(a.dataset.go); });
$('#btn-logout').onclick = requestLogout;

/* ---- ログイン（タブ）：QR / 数字コード / 部活アカウント(IdP)。FE 2.0: MS廃止 ---- */
let loginMethod = 'qr', loginSecLeft = limitVal('code_ttl_sec') || 300, loginTimer = 0, loginPoll = 0, loginReq = null, loginPending = false;
const loginTabOpen = () => S.tabs.some(t => t.path === '#ログイン');
const loginMsg = (m, cls = 'msg') => { const e = $('#s01-msg'); if (e) { e.textContent = m; e.className = cls; } };
function loginProviders() {
  const p = (DATA.meta && DATA.meta.login_providers);
  return Array.isArray(p) && p.length ? p : ['idp'];
}
function defaultLoginTab() {
  const first = loginProviders()[0];
  if (first === 'idp') return 'idp';
  return 'qr';
}
function idpBaseUrl() {
  const cfg = window.EDITOR_CONFIG || {};
  const base = (cfg.idpBase != null && String(cfg.idpBase).trim() !== '') ? String(cfg.idpBase).trim() : '../auth/';
  try { return new URL(base, location.href).href; } catch { return base; }
}
function applyLoginProvidersUi() {
  const providers = loginProviders();
  const hasIdp = providers.includes('idp');
  $$('[data-login-provider="idp"]').forEach(el => el.hidden = !hasIdp);
  const a = $('#adm-idp-link'); if (a) { a.hidden = !hasIdp; a.href = idpBaseUrl(); }
}

function applyLogin() {
  applyLoginProvidersUi();
  const providers = loginProviders();
  const hasIdp = providers.includes('idp');
  $$('[data-seg=login] [data-t="idp"]').forEach(b => b.hidden = !hasIdp);
  $$('[data-seg=login] button').forEach(b => { const on = b.dataset.t === loginMethod; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
  $$('.seg-p').forEach(p => p.hidden = p.dataset.p !== loginMethod);
  $$('.cd').forEach(e => e.textContent = Math.max(0, loginSecLeft));
  const q = $('#qr-login'); if (q) { q.innerHTML = DATA.login.approveUrl ? QR.svg(DATA.login.approveUrl) : ''; q.classList.toggle('exp', loginSecLeft <= 0); }
  const c = $('#login-code'); if (c) { c.textContent = DATA.login.code ? DATA.login.code.replace(/(\d{3})(\d{3})/, '$1 $2') : '－'; c.classList.toggle('exp', loginSecLeft <= 0); }
  const t = $('#trust-days'); if (t) t.textContent = limitVal('device_days');
}

function stopLoginPoll() {
  clearInterval(loginPoll); loginPoll = 0;
  clearInterval(loginTimer); loginTimer = 0;
}

function loginCountdown() {
  clearInterval(loginTimer);
  loginTimer = setInterval(() => {
    if (!loginTabOpen() || loginSecLeft <= 0) return;
    loginSecLeft--; $$('.cd').forEach(x => x.textContent = Math.max(0, loginSecLeft));
    if (loginSecLeft <= 0) { applyLogin(); loginMsg('期限切れです。新しく表示してください。', 'msg err'); stopLoginPoll(); }
  }, 1000);
}

function startPoll() {
  clearInterval(loginPoll);
  if (!loginReq) return;
  loginPoll = setInterval(async () => {
    if (!loginTabOpen()) return stopLoginPoll();
    try {
      const d = await Api.auth.poll(loginReq.id, loginReq.secret);
      const status = d.status || d.state;
      if (status === 'approved' || status === 'consumed') {
        stopLoginPoll();
        loginPending = true;
        loginMsg('承認されました。ログインしています…', 'msg ok');
        await afterLogin('direct');
        loginPending = false;
        loginDone();
      } else if (status === 'expired' || status === 'rejected') {
        stopLoginPoll(); loginMsg('期限切れ、または拒否されました。新しく表示してください。', 'msg err');
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'unauthorized') stopLoginPoll();
      /* 通信の一時的な失敗は、次の周期でやり直す */
    }
  }, 2000);
}

async function startLogin(kind) {
  loginMethod = kind;
  loginPending = true;
  DATA.login = { code: '', approveUrl: '', requester: '', id: '', pollSecret: '', expires: 0, kind };
  applyLogin();
  loginMsg('コードを発行しています…');
  try {
    const d = await Api.auth.start(kind);
    const code = String(d.code || ''), id = d.id, secret = d.poll_secret;
    if (!id || !secret || !code) throw new Error('invalid auth/start response');
    loginReq = { id, secret, code, kind };
    DATA.login = { code, approveUrl: new URL('./?approve=' + encodeURIComponent(code), location.href).href, requester: d.requester || '', id, pollSecret: secret, expires: Date.now() + num(d.ttl_sec, limitVal('code_ttl_sec')) * 1000, kind };
    loginSecLeft = num(d.ttl_sec, limitVal('code_ttl_sec'));
    loginMsg(''); // コード・QRを作れたら「コードを発行しています…」を消す（承認待ちの案内は出さない。残り秒数は画面に出ている）
    applyLogin(); loginCountdown(); startPoll();
  } catch (e) {
    loginMsg(apiMessage(e), 'msg err');
  } finally { loginPending = false; }
}

function openLogin(m) {
  loginMethod = m || defaultLoginTab();
  openTab('ログイン', () => $('#t-login').innerHTML, 'login', applyLogin);
  applyLogin();
  if (loginMethod === 'qr' || loginMethod === 'code') {
    if (!loginReq || loginReq.kind !== loginMethod || loginSecLeft <= 0) startLogin(loginMethod);
    else { loginCountdown(); startPoll(); }
  }
}
function loginDone() { setAuth(true); showToast('ログインしました'); if (window.VWC_RETURN_TO) location.href = window.VWC_RETURN_TO; }
document.addEventListener('click', e => { const r = e.target.closest('[data-login]'); if (r) { e.preventDefault(); openLogin(r.dataset.login); } });

$('#bench').addEventListener('click', e => {
  const t = e.target.closest('[data-seg=login] [data-t]');
  if (t) { loginMethod = t.dataset.t; applyLogin(); if ((loginMethod === 'qr' || loginMethod === 'code') && (!loginReq || loginReq.kind !== loginMethod || loginSecLeft <= 0)) startLogin(loginMethod); return; }
  if (e.target.closest('[data-renew]')) { if (!loginPending) startLogin((loginMethod === 'ms' || loginMethod === 'idp') ? 'qr' : loginMethod); return; }
  if (e.target.closest('#idp-login')) { location.href = Api.idpUrl('direct'); return; }
  if (e.target.closest('#idp-register')) { location.href = Api.idpUrl('register'); return; }
  if (e.target.closest('[data-lg]')) { acceptTrust(e.target.closest('[data-lg]').dataset.lg); }
});

function openTrustTab() {
  openTab('端末の登録', () => $('#t-trust').innerHTML, 'verified_user', () => {
    const i = $('#dev-name'); if (i) i.value = describeDevice();
    const d = $('#trust-days'); if (d) d.textContent = limitVal('device_days');
  });
}

async function acceptTrust(which) {
  const name = ($('#dev-name') || {}).value || 'この端末';
  const trust = which === 'trust';
  if (trust) {
    try { await Api.auth.trust(name); DATA.user.trusted = true; applyTrustUi(); }
    catch (e) { showToast(apiMessage(e)); return; }
  }
  closeTab('端末の登録'); setAuth(true); showPanel('home');
  showToast(trust ? 'この端末を信頼端末にしました' : '今回のみログインします');
}

/* 承認画面（?approve= / QRの読み取り後）。信頼端末でログインしている人だけが使える。 */
let approveCode = '';
function openApproval(code) {
  if (typeof isTrusted === 'function' && !isTrusted()) { window.VWC_APPROVE_CODE = ''; return showToast('この端末は信頼端末ではないため、承認できません。信頼端末でログインしてください'); }
  approveCode = String(code || '');
  window.VWC_APPROVE_CODE = '';
  openTab('コード入力でログイン', () => $('#t-apc').innerHTML, 'pin', () => {
    const input = $('#ap-in'); if (input) { input.value = approveCode; input.focus(); }
    if (/^\d{6}$/.test(approveCode)) lookupRequest(approveCode, 'c');
  });
  VWC.set('screen', 's02', 'app');
}

/* ---- S19：アクセスコード（8桁の数字） ---- */
let gateCtx = { name: '', return: '' }, gfail = 0;
$('#gate-in').oninput = e => { e.target.value = fmtCode(e.target.value); };
function showGate(name, need, ret) {
  gateCtx = { name: name || '', return: ret || '' };
  show('s19');
  const box = document.querySelector('#s19 .box'), input = $('#gate-in'), ok = $('#gate-ok'), msg = $('#gate-msg');
  const title = box.querySelector('h1');
  if (!name) title.textContent = '見つかりません';
  else if (need === 'login') title.textContent = 'ログインが必要です';
  else if (need === 'denied') title.textContent = 'アクセスできません';
  else if (need === 'code') title.textContent = 'アクセスコードを入力';
  else title.textContent = 'アクセスを確認できません';
  if (!name || need !== 'code') { input.hidden = true; ok.hidden = true; } else { input.hidden = false; ok.hidden = false; }
  msg.textContent = !name ? 'アプリが見つかりません。URLを確認してください。'
    : need === 'login' ? 'このアプリを見るにはログインしてください。' : need === 'denied' ? 'このアプリを閲覧する権限がありません。' : '';
  if (need === 'login' && DATA.user.id && ret) { location.href = ret; return; }
}
$('#gate-ok').onclick = async () => {
  const m = $('#gate-msg'), code = digits($('#gate-in').value);
  if (!gateCtx.name) return;
  if (code.length !== 8) { m.textContent = '8桁の数字を入力してください。'; m.className = 'msg err'; return; }
  m.textContent = '確認しています…'; m.className = 'msg';
  try {
    await Api.apps.gateVerify(gateCtx.name, code);
    m.textContent = `開きます…（一度入ると、${limitVal('gate_unlisted_hours')}時間は入力不要です）`; m.className = 'msg ok';
    location.href = gateCtx.return || window.VWC_APP_URL(gateCtx.name);
  } catch (e) {
    const d = e.data || {};
    if (e.code === 'bad_code') {
      gfail = num(d.remaining, Math.max(0, limitVal('app_code_max_fail') - gfail - 1));
      m.textContent = d.remaining !== undefined ? `コードが違います（残り${d.remaining}回）` : 'コードが違います。';
    } else if (e.code === 'rate') {
      m.textContent = d.retry_after ? `ロックされています。${Math.ceil(d.retry_after / 60)}分後に再試行してください。` : 'ロックされています。しばらくしてから再試行してください。';
    } else m.textContent = apiMessage(e);
    m.className = 'msg err';
  }
};

/* ---- S20：共通状態 ---- */
const ST = {
  session: ['lock_clock', 'セッションが切れました', 'もう一度ログインしてください。'],
  net: ['cloud_off', '通信エラー', 'ネットワークを確認して、再読み込みしてください。'],
  mnt: ['construction', 'メンテナンス中', '終了までしばらくお待ちください。保存・公開はできません。お知らせで終了予定をご確認ください。'],
  nf: ['search_off', '見つかりません（404）', 'URLを確認してください。'],
  deny: ['block', '権限がありません', '管理者に権限を依頼してください。'],
  reauth: ['verified_user', '管理の再認証が切れました', '管理の操作には、10分以内の再ログインが必要です。もう一度ログインしてください。'],
  size: ['upload_file', 'ファイルが大きすぎます', '最大アップロードサイズを超えているため、保存できません。ダウンロードには上限がありません。'],
  zip: ['folder_zip', 'ZIPを作成できませんでした', '大きすぎるか、サーバーで失敗しました。フォルダを分けるか、ファイルを個別にダウンロードしてください。'],
  version: ['sync_problem', 'サーバーとエディターの版が合いません', '利用できる機能を確認できません。エディターとサーバーの API 版を合わせてください。']
};
const st20 = k => { const u = ST[k] || ST.net; $('#s20-i').textContent = u[0]; $('#s20-t').textContent = u[1]; $('#s20-m').textContent = u[2]; };
st20('session');
let versionStateActive = false;
VWC.on('state', v => {
  if (v === 'version') { versionStateActive = true; st20('version'); show('s20'); }
  else if (versionStateActive) { versionStateActive = false; show('editor'); }
});

/* ---- 状態バー（読み込み・ロック・メンテナンス） ---- */
const STATE_UI = {
  error: ['error', '読み込みに失敗しました', '通信の状態を確認して、もう一度お試しください。', '再読み込み'],
  lock: ['lock_clock', 'ロック中です', '他の操作が終わるまで保存できません。しばらくお待ちください。', ''],
  maint: ['construction', 'メンテナンス中のお知らせ', 'メンテナンスのため、保存・公開ができません。ホームのお知らせをご確認ください。', '']
};
function showStatebar(v) {
  const b = $('#statebar'), u = STATE_UI[v]; b.hidden = !u; if (!u) { $('#home').style.top = ''; return; }
  b.className = 'alert' + (v === 'lock' || v === 'maint' ? ' lock' : '');
  $('.ms', b).textContent = u[0]; $('.sb-t', b).textContent = u[1]; $('.sb-m', b).textContent = u[2];
  $('#sb-act').hidden = !u[3]; $('#sb-act').textContent = u[3];
  const cs = getComputedStyle(b); $('#home').style.top = (b.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom)) + 'px';
}
$('#sb-act').onclick = () => location.reload();

/* 読み込み中の骨組み：一覧ごとに決めた個数だけ、実データの数とは無関係に出す */
[['list-mine', 2], ['list-shared', 2], ['tree', 3, 'tree'], ['sh-list', 2], ['pub-list', 2], ['hi-list', 3], ['help-l', 3], ['u-rank', 3], ['acct', 1]].forEach(([id, n, cls]) => {
  const el = document.getElementById(id); if (!el) return; const f = document.createElement('div');
  f.className = 'sk-fix ' + (cls || '') + (el.classList.contains('body') ? ' fl' : ''); f.setAttribute('aria-hidden', 'true'); f.innerHTML = '<i></i>'.repeat(n); el.before(f);
});
