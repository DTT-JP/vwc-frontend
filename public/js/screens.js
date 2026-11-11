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
  VWC.set('screen', v ? 'editor' : 'out', 'app');
  const scr = $('#screens'); if (scr && !scr.classList.contains('loading-fade')) scr.hidden = true;
  renderHome();
  $$('#bnav button:not(#bn-home)').forEach(b => b.disabled = !v); updateStatus();
  if (window.maybeWelcome) { if (v) maybeWelcome(); else { $('#welcome').hidden = true; if (window.renderGuide) renderGuide(); } }
}
const show = id => {
  if (VWC.get('state') === 'version' && id !== 's20') id = 's20';
  const full = id === 's19' || id === 's20';
  const scr = $('#screens');
  if (scr) { if (typeof cancelBootLoadingFade === 'function') cancelBootLoadingFade(); if (!scr.dataset.loading || id !== 's20') scr.dataset.loading = ''; }
  if (scr) scr.hidden = !full;
  $$('.scr').forEach(s => s.hidden = s.id !== id);
  if (id === 'editor') setAuth(true); if (id === 'out') setAuth(false);
  VWC.set('screen', id, 'app');
};
VWC.on('screen', (id, src) => { if (src !== 'app') show(id); });
$$('[data-go]').forEach(a => a.onclick = e => {
  e.preventDefault();
  const id = a.dataset.go;
  if (id === 'editor' && !S.auth) { setAuth(false); return; }
  show(id);
});
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
function idpAdminUrl() {
  const cfg = window.EDITOR_CONFIG || {};
  const direct = cfg.idpAdminUrl != null ? String(cfg.idpAdminUrl).trim() : '';
  if (direct) {
    try { return new URL(direct, location.href).href; } catch { return direct; }
  }
  const base = idpBaseUrl();
  if (!base) return '';
  try {
    const u = new URL(base, location.href);
    u.pathname = u.pathname.replace(/\/?$/, '/') + 'index.php';
    u.search = '?p=admin';
    u.hash = '';
    return u.href;
  } catch {
    const b = String(base).replace(/\/?$/, '/');
    return b + 'index.php?p=admin';
  }
}
function hasIdpProvider() {
  const providers = loginProviders();
  return Array.isArray(providers) && providers.includes('idp');
}
function applyLoginProvidersUi() {
  const hasIdp = hasIdpProvider();
  $$('[data-login-provider="idp"]').forEach(el => el.hidden = !hasIdp);
  const a = $('#adm-idp-link');
  if (a) {
    a.hidden = !hasIdp;
    const url = idpAdminUrl();
    if (url) a.href = url; else a.removeAttribute('href');
  }
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
function loginDone() {
  setAuth(true);
  /* 信頼端末登録レーン: 未登録なら登録確認を優先し、return先への遷移でSKIPしない。
     QR/コードでログインしたセッションでは信頼端末登録を行えない。 */
  if (DATA.user && DATA.user.can_register_trusted === false) {
    showToast('ログインしました（QR/コードでのログインでは信頼端末を登録できません）');
    if (window.VWC_RETURN_TO) location.href = window.VWC_RETURN_TO;
  } else if ((DATA.user && DATA.user.trusted) || (typeof isTrusted === 'function' && isTrusted())) {
    showToast('ログインしました');
    if (window.VWC_RETURN_TO) location.href = window.VWC_RETURN_TO;
  } else {
    showToast('ログインしました');
    if (typeof openTrustTab === 'function' && !(S.tabs || []).some(t => t.path === '#端末の登録')) openTrustTab();
  }
}
document.addEventListener('click', e => { const r = e.target.closest('[data-login]'); if (r) { e.preventDefault(); openLogin(r.dataset.login); } });

$('#bench').addEventListener('click', e => {
  const t = e.target.closest('[data-seg=login] [data-t]');
  if (t) { loginMethod = t.dataset.t; applyLogin(); if ((loginMethod === 'qr' || loginMethod === 'code') && (!loginReq || loginReq.kind !== loginMethod || loginSecLeft <= 0)) startLogin(loginMethod); return; }
  if (e.target.closest('[data-renew]')) { if (!loginPending) startLogin((loginMethod === 'ms' || loginMethod === 'idp') ? 'qr' : loginMethod); return; }
  if (e.target.closest('#idp-login')) { location.href = Api.idpUrl('direct'); return; }
  if (e.target.closest('[data-lg]')) { acceptTrust(e.target.closest('[data-lg]').dataset.lg); }
});

function openTrustTab() {
  if (DATA.user && DATA.user.can_register_trusted === false) {
    showToast('QR/コードでのログインでは信頼端末を登録できません');
    return;
  }
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
  const box = document.querySelector('#s19 .box'), input = $('#gate-in'), ok = $('#gate-ok'), login = $('#gate-login'), msg = $('#gate-msg');
  const title = box.querySelector('h1');
  if (!name) title.textContent = '見つかりません';
  else if (need === 'login') title.textContent = 'ログインが必要です';
  else if (need === 'denied') title.textContent = 'アクセスできません';
  else if (need === 'code') title.textContent = 'アクセスコードを入力';
  else title.textContent = 'アクセスを確認できません';
  const showCode = !!name && need === 'code';
  const showLogin = !!name && need === 'login';
  input.hidden = !showCode;
  ok.hidden = !showCode;
  if (login) login.hidden = !showLogin;
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
if ($('#gate-login')) $('#gate-login').onclick = () => {
  const scr = $('#screens');
  if (scr) { scr.hidden = true; $$('.scr').forEach(s => s.hidden = true); }
  setAuth(false);
  openLogin(defaultLoginTab());
};
if ($('#gate-editor')) $('#gate-editor').onclick = e => {
  e.preventDefault();
  const scr = $('#screens');
  if (scr) { scr.hidden = true; $$('.scr').forEach(s => s.hidden = true); }
  if (S.auth) { show('editor'); } else { setAuth(false); }
};

/* ---- S20：共通状態 ---- */
function applyErrorTheme() {
  if (window.VWCCompat && VWCCompat.applyErrorTheme) return VWCCompat.applyErrorTheme();
  const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  const theme = (DATA && DATA.settings && DATA.settings.theme === 'light') ? 'light'
    : (DATA && DATA.settings && DATA.settings.theme === 'dark') ? 'dark'
    : (prefersLight ? 'light' : 'dark');
  document.documentElement.dataset.theme = theme;
  return theme;
}
let bootLoading = false, bootLoadingFade = 0, bootLoadingRetry = 0;
function setS20Action(text, action) {
  const a = document.getElementById('s20-a');
  if (!a) return;
  if (!text) {
    a.hidden = true; a.textContent = ''; a.onclick = null; a.removeAttribute('role'); a.removeAttribute('tabindex');
    return;
  }
  a.hidden = false;
  a.textContent = text;
  a.onclick = action || null;
  if (action) { a.setAttribute('role', 'button'); a.tabIndex = 0; a.style.cursor = 'pointer'; a.style.textDecoration = 'underline'; }
  else { a.removeAttribute('role'); a.removeAttribute('tabindex'); a.style.cursor = ''; a.style.textDecoration = ''; }
}
function cancelBootLoadingFade() {
  clearTimeout(bootLoadingFade); bootLoadingFade = 0;
  clearTimeout(bootLoadingRetry); bootLoadingRetry = 0;
  const scr = document.getElementById('screens'); if (scr) scr.classList.remove('loading-fade');
}
function showBootLoading() {
  applyErrorTheme();
  bootLoading = true; cancelBootLoadingFade();
  const scr = document.getElementById('screens');
  if (scr) { scr.dataset.error = ''; scr.dataset.loading = '1'; }
  const i = document.getElementById('s20-i'), t = document.getElementById('s20-t'), m = document.getElementById('s20-m');
  if (i) i.textContent = 'hourglass_top';
  if (t) t.textContent = '読み込み中';
  if (m) m.textContent = '時間がかかる場合はインターネット接続を確認してください。';
  setS20Action('', null);
  // ネットワーク不安定等で読み込みが進まない場合でも再読み込みできるようにする
  bootLoadingRetry = setTimeout(() => {
    if (!bootLoading) return;
    setS20Action('ページを再読み込み', () => { try { location.reload(); } catch (e) { location.href = location.href; } });
  }, 8000);
  show('s20');
}
function hideBootLoading() {
  const scr = document.getElementById('screens');
  if (!bootLoading) { if (scr) scr.dataset.loading = ''; clearTimeout(bootLoadingRetry); bootLoadingRetry = 0; return; }
  bootLoading = false;
  clearTimeout(bootLoadingRetry); bootLoadingRetry = 0;
  if (!scr || scr.hidden || scr.dataset.error || scr.dataset.loading !== '1') { if (scr) scr.dataset.loading = ''; return; }
  scr.classList.add('loading-fade');
  clearTimeout(bootLoadingFade);
  const done = () => {
    clearTimeout(bootLoadingFade); bootLoadingFade = 0;
    scr.removeEventListener('transitionend', te);
    scr.classList.remove('loading-fade');
    if (scr.dataset.error) { scr.dataset.loading = ''; return; }
    scr.dataset.loading = '';
    if (!scr.dataset.keep) { scr.hidden = true; $$('.scr').forEach(s => s.hidden = true); }
  };
  const te = e => { if (e.propertyName === 'opacity') done(); };
  scr.addEventListener('transitionend', te);
  bootLoadingFade = setTimeout(done, 340);
}
window.showBootLoading = showBootLoading;
window.hideBootLoading = hideBootLoading;
const ST = {
  session: ['lock_clock', 'セッションが切れました', '内容: ログイン状態を確認できませんでした。', '対処方法: もう一度ログインしてください。ログイン画面から操作をやり直してください。'],
  net: ['cloud_off', '通信エラー', '内容: サーバーと通信できませんでした。', '対処方法: ネットワーク接続（オフラインになっていないか）を確認し、ブラウザの再読み込みを行ってください。'],
  offline: ['cloud_off', 'オフラインです', '内容: インターネットまたはネットワークに接続されていません。', '対処方法: 接続を確認してから、ブラウザの再読み込みを行ってください。'],
  mnt: ['construction', 'メンテナンス中', '内容: メンテナンスのため、保存や公開などの操作はできません。', '対処方法: 終了まで待ってから、ブラウザの再読み込みを行ってください。終了予定はお知らせで確認してください。'],
  nf: ['search_off', '見つかりません（404）', '内容: 指定されたページや対象が見つかりませんでした。', '対処方法: URLを確認してください。必要ならトップページから開き直してください。'],
  deny: ['block', '権限がありません', '内容: この操作を行う権限がありません。', '対処方法: 権限が必要な場合は、管理者または権限のある部員に依頼してください。'],
  reauth: ['verified_user', '管理の再認証が切れました', '内容: 管理操作に必要な再認証の有効時間が切れました。', '対処方法: もう一度ログインしてから、管理操作をやり直してください。'],
  size: ['upload_file', 'ファイルが大きすぎます', '内容: ファイルが上限サイズを超えているため処理できません。', '対処方法: ファイルサイズを小さくするか、分割してから操作してください。'],
  zip: ['folder_zip', 'ZIPを作成できませんでした', '内容: ZIPの作成に失敗しました。', '対処方法: 対象を小さく分けるか、ファイルを個別にダウンロードしてください。必要なら時間をおいて再度試してください。'],
  version: ['sync_problem', '版の不一致', '内容: エディターとサーバーの版が合っていないため、利用できる機能を安全に確認できません。', '対処方法: ブラウザの再読み込みを行ってください。改善しない場合は、エディターとサーバーの更新状態を管理者に確認してください。'],
  boot: ['error', '起動エラー', '内容: エディターの起動に必要な情報を読み込めませんでした。', '対処方法: ネットワーク接続を確認し、ブラウザの再読み込みを行ってください。改善しない場合は管理者に連絡してください。']
};
const st20 = k => {
  applyErrorTheme();
  bootLoading = false;
  if (typeof cancelBootLoadingFade === 'function') cancelBootLoadingFade();
  let key = k;
  if ((key === 'net' || key === 'boot') && typeof navigator !== 'undefined' && navigator && navigator.onLine === false) key = 'offline';
  const u = ST[key] || ST.net;
  $('#s20-i').textContent = u[0];
  $('#s20-t').textContent = u[1];
  $('#s20-m').textContent = (u[2] || '') + (u[3] ? '\n' + u[3] : '');
  const retryable = ['net', 'offline', 'boot', 'maint', 'session'];
  if (retryable.includes(key) && typeof setS20Action === 'function') {
    setS20Action('ページを再読み込み', () => { try { location.reload(); } catch (e) { location.href = location.href; } });
  } else if (typeof setS20Action === 'function') {
    setS20Action('', null);
  }
  const scr = document.getElementById('screens'); if (scr) { scr.dataset.error = '1'; scr.dataset.loading = ''; }
};
st20('session');
let versionStateActive = false;
VWC.on('state', v => {
  if (v === 'version') { versionStateActive = true; st20('version'); show('s20'); }
  else if (versionStateActive) { versionStateActive = false; show('editor'); const scr = document.getElementById('screens'); if (scr) scr.dataset.error = ''; }
});

/* ---- 状態バー（読み込み・ロック・メンテナンス） ---- */
const STATE_UI = {
  error: ['error', '読み込みに失敗しました', '内容: 必要な情報を読み込めませんでした。', '対処方法: 通信状態を確認し、ブラウザの再読み込みを行ってください。'],
  lock: ['lock_clock', 'ロック中です', '内容: 他の操作が実行中のため保存できません。', '対処方法: しばらく待ってから、もう一度操作してください。'],
  maint: ['construction', 'メンテナンス中のお知らせ', '内容: メンテナンスのため、保存や公開ができません。', '対処方法: ホームのお知らせで状況を確認し、終了後にブラウザの再読み込みを行ってください。']
};
function showStatebar(v) {
  const b = $('#statebar'), u = STATE_UI[v]; b.hidden = !u; if (!u) { $('#home').style.top = ''; return; }
  applyErrorTheme();
  b.className = 'alert error-page' + (v === 'lock' || v === 'maint' ? ' lock' : '');
  $('.ms', b).textContent = u[0]; $('.sb-t', b).textContent = u[1]; $('.sb-m', b).textContent = (u[2] || '') + (u[3] ? '\n' + u[3] : '');
  const act = $('#sb-act'); if (act) { act.hidden = true; act.textContent = ''; }
  const cs = getComputedStyle(b); $('#home').style.top = (b.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom)) + 'px';
}

/* 読み込み中の骨組み：一覧ごとに決めた個数だけ、実データの数とは無関係に出す */
[['list-mine', 2], ['list-shared', 2], ['tree', 3, 'tree'], ['sh-list', 2], ['pub-list', 2], ['hi-list', 3], ['help-l', 3], ['u-rank', 3], ['acct', 1]].forEach(([id, n, cls]) => {
  const el = document.getElementById(id); if (!el) return; const f = document.createElement('div');
  f.className = 'sk-fix ' + (cls || '') + (el.classList.contains('body') ? ' fl' : ''); f.setAttribute('aria-hidden', 'true'); f.innerHTML = '<i></i>'.repeat(n); el.before(f);
});
