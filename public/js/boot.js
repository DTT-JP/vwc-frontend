/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 起動時の初期化（全スクリプトの読み込み後に実行）。
   1. meta/version で API 版を確認  2. me でログイン状態と設定値  3. 一覧を読み込み
   4. URL契約（approve / auth / gate）を処理。読み込み中は画面を出さず、失敗時は S20 を出す。 */
const EDITOR_CONFIG = window.EDITOR_CONFIG || { apiBase: 'system/api/index.php' };
if (!String(EDITOR_CONFIG.apiBase || '').trim()) console.warn('EDITOR API configuration is incomplete');

const VWC_APP_ROOT = (() => { try { return new URL('app/', document.baseURI).pathname; } catch { return '/editor/app/'; } })();
window.VWC_APP_URL = name => { try { return new URL('app/' + encodeURIComponent(name) + '/', document.baseURI).href; } catch { return 'app/' + name + '/'; } };
function safeReturn(value) {
  try {
    const u = new URL(value || '', location.href);
    if (u.origin !== location.origin || !u.pathname.startsWith(VWC_APP_ROOT)) return '';
    const name = u.pathname.slice(VWC_APP_ROOT.length).split('/')[0];
    if (!/^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/.test(name)) return '';
    return u.href;
  } catch { return ''; }
}
function currentQuery() { return new URLSearchParams(location.search); }

function bootPlaceholderProject() {
  if (S.proj && S.proj.id) return;
  S.proj = null;
}

function roleForProject() {
  if (!DATA.user.id) return 'member';
  if (DATA.user.isAdmin) return 'admin';
  const p = S.proj;
  if (!p) return 'member';
  /* サーバーが「自分の」として返したプロジェクトは、perm の値にかかわらず所有者として扱う */
  if (DATA.projects.mine.some(x => x.id === p.id)) return 'member';
  if (p.owner && p.owner === DATA.user.id) return 'member';
  if (!p.perm || p.perm === 'owner') return 'member';
  return p.perm === 'view' ? 'shared-view' : 'shared-edit';
}
function applyRoleForProject() {
  const r = roleForProject();
  if (VWC.get('role') !== r) VWC.set('role', r);
  else { S.role = r; applyRole(); }
}

function renderAll() {
  if (typeof applyTrustUi === 'function') applyTrustUi();
  applySettings();
  renderProjects(); renderTree(); renderUsage(); renderHome(); renderTabs(); setPanel('sm02'); renderHome(); renderNotices();
}

async function afterLogin(mode) {
  try {
    const meData = await Api.me();
    applyMe(meData);
  } catch (e) {
    return showBootError(e);
  }
  /* ログイン後フローでも、IdPがログイン手段にあれば初回描画前からIdP管理モード相当に扱う */
  if (typeof hasIdpLoginProvider === 'function' && hasIdpLoginProvider() && DATA.membersManagedByIdp === undefined) DATA.membersManagedByIdp = true;
  reportLoadFailures(await loadInitial(), 'Initial data load failed');
  S.proj = null;
  initBase(); applyRoleForProject(); renderAll(); setAuth(true);
  completeLogin(mode, false);
}

/* ログイン後の信頼端末登録レーン: ログイン/初回の区別なく、未登録の端末は登録確認へ。登録済み(信頼端末)はSKIP。
   ただし QR/コードでログインしたセッションでは信頼端末登録を行えない。 */
function needsTrustLane() {
  if (DATA.user && DATA.user.can_register_trusted === false) return false;
  if (DATA.user && DATA.user.trusted) return false;
  if (typeof isTrusted === 'function' && isTrusted()) return false;
  return true;
}
function completeLogin(mode, notify = true) {
  if (mode === 'reauth') { showToast('再認証しました。元のウィンドウに戻ってください'); return; }
  /* direct/register/その他の通常ログインは同じレーン: 信頼端末未登録なら登録確認、登録済みならSKIP */
  if (needsTrustLane()) openTrustTab();
  else if (window.VWC_RETURN_TO) { location.href = window.VWC_RETURN_TO; return; }
  if (window.VWC_APPROVE_CODE) openApproval(window.VWC_APPROVE_CODE);
  if (notify) showToast('認証が完了しました');
}

function showBootError(e, kind) {
  try { if (window.VWCCompat && VWCCompat.applyErrorTheme) VWCCompat.applyErrorTheme(); } catch {}
  st20(kind || 'boot');
  show('s20');
  console.warn('boot failed', e);
}

function reportLoadFailures(failures, context) {
  if (!failures.length) return;
  VWC.set('state', 'error', 'app');
  showStatebar('error');
  failures.forEach(failure => {
    if (failure && failure.endpoint) console.warn(`${context}: ${failure.endpoint}`, failure.error);
    else console.warn(context, failure);
  });
}

async function boot() {
  if (window.__vwcBooted) return;
  window.__vwcBooted = true;
  let bootOk = false;
  const q = currentQuery();
  /* 管理の再認証のポップアップ：結果は元のウィンドウが確認するので、ここでは閉じるだけ。 */
  if (q.get('auth') === 'done' && q.get('mode') === 'reauth' && window.opener) { try { window.close(); } catch { /* 閉じられなければ、そのまま表示する */ } }
  window.VWC_RETURN_TO = safeReturn(q.get('return'));
  const app = $('#app');
  if (app) app.classList.add('skel');
  if (typeof showBootLoading === 'function') showBootLoading();

  try {
    let version;
    try { version = await Api.version(); }
    catch (e) { showBootError(e); return; }
    DATA.meta = Object.assign({ backend: null, login_providers: [] }, version || {});
    /* IdP連携あり判定の早期化: ログイン手段にIdPがあれば、初回のメンバー同期完了前でも
       ユーザー管理をIdP管理モード相当に扱う（誤ってローカル追加できる状態を防ぐ）。
       BEが members_list で managedByIdp を明示した場合は applyMembers が上書きする（BE確定を反映）。 */
    if (typeof hasIdpLoginProvider === 'function' && hasIdpLoginProvider() && DATA.membersManagedByIdp === undefined) DATA.membersManagedByIdp = true;
    if (typeof applyLoginProvidersUi === 'function') applyLoginProvidersUi();
    /* FE指示書 B1: BE MAJOR は backend.version 優先、なければ api_version。MAJOR不一致は全体停止。 */
    let feVer = '';
    try { feVer = (await (await fetch('VERSION', { cache: 'no-store' })).text()).trim(); } catch {}
    const feMaj = window.VWCCompat ? VWCCompat.feMajor(feVer) : null;
    const beMaj = window.VWCCompat ? VWCCompat.beMajor(version) : Number(version.api_version);
    if (feMaj != null && beMaj != null && feMaj !== beMaj) {
      VWC.set('state', 'version', 'app');
      st20('version'); show('s20');
      return;
    }
    /* 部分互換: 使うAPIが無ければ該当機能を無効化して警告。取得失敗時は止めない（B1-6）。 */
    if (window.VWCCompat && version && version.backend && version.backend.apis) {
      const miss = VWCCompat.missingApis(version);
      const dep = VWCCompat.deprecatedUsed(version);
      if (miss.length) { window.VWC_MISSING_APIS = miss; console.warn('missing APIs', miss); showToast('一部の機能はこのサーバーでは使えません（' + miss.map(m=>m.feature).slice(0,3).join('・') + (miss.length>3?'…':'') + '）', 8000); }
      if (dep.length) console.warn('deprecated APIs in use', dep);
    }

    let loggedIn = false;
    try {
      const meData = await Api.me();
      applyMe(meData);
      loggedIn = !!DATA.user.id;
    } catch (e) {
      if (!(e instanceof ApiError) || !['unauthorized', 'http_401', 'forbidden', 'http_403'].includes(e.code)) {
        showBootError(e); return;
      }
    }

    if (loggedIn) {
      reportLoadFailures(await loadInitial(), 'Initial data load failed');
      S.proj = null;
    } else {
      DATA.settings = JSON.parse(JSON.stringify(SETTINGS_DEFAULT));
      bootPlaceholderProject();
    }

    try {
      initBase(); applyRoleForProject(); renderAll(); setAuth(loggedIn);
      bootOk = true;
    } catch (e) {
      console.error('boot render failed', e);
      showBootError(e);
      return;
    }

    const approve = (q.get('approve') || '').match(/^\d{6}$/)?.[0];
    if (approve) {
      try {
        if (loggedIn) openApproval(approve);
        else { window.VWC_APPROVE_CODE = approve; openLogin('qr'); showToast('承認するにはログインしてください'); }
      } catch (e) { console.warn('approve flow failed', e); }
    }

    if (q.has('auth')) {
      try {
        const auth = q.get('auth'), reason = q.get('reason') || '';
        if (auth === 'done' && loggedIn) completeLogin(q.get('mode'));
        else if (auth === 'done') {
          openLogin(); showToast('ログインを確認できませんでした。もう一度お試しください');
        } else if (auth === 'error') {
          /* サーバーが付けたエラーコード（E-A…）で、原因と対処を示す。古い形式（reason / detail）にも対応。FE 2.0: MS固有コード削除 */
          const KEY = { denied: 'E-A01', state: 'E-A02', invalid: 'E-A06', unauthorized: 'E-A15',
            inactive: 'E-A11', other_account: 'E-A13',
            contract: 'E-A20', connect: 'E-A21', verify: 'E-A22', sub_mismatch: 'E-A23', inactive_idp: 'E-A24' };
          const code = q.get('code') || KEY[q.get('detail') || ''] || KEY[reason] || 'E-A99';
          showToast(errorText(ERROR_CATALOG[code] ? code : 'E-A99'), 12000);
        }
      } catch (e) { console.warn('auth callback flow failed', e); }
    }

    if (q.has('gate')) {
      try { showGate(q.get('gate'), q.get('need'), window.VWC_RETURN_TO); } catch (e) { console.warn('gate flow failed', e); }
    }
  } catch (e) {
    console.error('boot failed', e);
    showBootError(e);
  } finally {
    const appEl = $('#app'); if (appEl) appEl.classList.remove('skel');
    if (bootOk && typeof hideBootLoading === 'function') hideBootLoading();
  }
}

document.addEventListener('DOMContentLoaded', () => { boot(); });
if (document.readyState !== 'loading') boot();
