/* SPDX-License-Identifier: GPL-3.0-or-later */
/* SM10 アカウント：信頼端末の一覧 / QR読み取りでログイン / コード入力でログイン（承認側）。いずれも右エリアのタブ。
   QR は実際にカメラで読み取る（qr.js）。承認コードは6桁（auth/approve）。失敗回数とロックはサーバーが判定する。 */
function rMyDevices() {
  const rows = DATA.devices.map((d, i) => ({ d, i })).filter(x => x.d.member === DATA.user.id || !x.d.member);
  return `<h2>信頼端末</h2><div class="tools"><button class="o" data-acc="scanqr">${ico('qr_code_scanner')} QR読み取りでログイン</button><button class="o" data-acc="entercode">${ico('pin')} コード入力でログイン</button><button class="o" data-acc="revoke-current">${ico('block')} この端末の信頼を解除</button></div>
  <table class="tbl"><thead><tr><th>端末名</th><th>最終利用</th><th>有効期限</th><th></th></tr></thead><tbody>` +
    (rows.map(({ d, i }) => `<tr><td data-l="端末名">${esc(d.name)} ${d.current ? bd('この端末', 'b-ok') : ''}</td><td data-l="最終利用">${esc(d.last)}</td><td data-l="有効期限">${fmtDate(d.expires)}</td><td><button data-a="my-rev" data-i="${i}" aria-label="失効" title="失効">${ico('block')}</button></td></tr>`).join('') || '<tr><td colspan="4">信頼端末はありません</td></tr>') + '</tbody></table>';
}
const refreshDevices = async () => { try { await loadMyDevices(); } catch (e) { showApiError(e); } renderTabs(); refreshNotices(); };
async function revokeCurrentTrust() {
  const d = DATA.devices.find(x => x.current);
  if (!d || !d.id) { showToast('この端末の情報を確認できませんでした'); return false; }
  try {
    await Api.auth.deviceRevoke(d.id);
    await refreshDevices();
    notify('device', 'この端末の信頼を解除しました');
    return true;
  } catch (e) { showApiError(e); return false; }
}
let camStop = null;
const camStop_ = () => { if (camStop) { camStop(); camStop = null; } const c = $('#apq-cam'); if (c) c.hidden = true; };
const ACCT = {
  devices: async () => { try { await loadMyDevices(); } catch (e) { showApiError(e); } openTab('信頼端末', rMyDevices, 'devices'); },
  scanqr: () => { camStop_(); openTab('QR読み取りでログイン', () => $('#t-apq').innerHTML, 'qr_code_scanner'); },
  entercode: () => openTab('コード入力でログイン', () => $('#t-apc').innerHTML, 'pin'),
  'revoke-current': () => confirmDlg('この端末の信頼を解除', 'この端末の信頼を解除します。次回から再承認が必要です。', revokeCurrentTrust)
};
document.addEventListener('click', e => { const r = e.target.closest('[data-acc]'); if (r) ACCT[r.dataset.acc](); });

/* QR読み取りの画面表示（状態ごと） */
const CAM_UI = {
  pending: ['pending', 'カメラの許可を待っています。ブラウザの確認で「許可」を選んでください。', false],
  scanning: ['qr_code_scanner', 'QRを枠の中に入れてください。', true],
  denied: ['block', 'カメラが許可されていません。ブラウザのサイトの設定でカメラを許可するか、「コード入力でログイン」を使ってください。', false],
  none: ['videocam_off', 'この端末にはカメラが見つかりません。「コード入力でログイン」を使ってください。', false],
  invalid: ['error', 'ログイン用のQRではありません。ログインしたい端末に出ているQRを読み取ってください。', true]
};
function camUi(state) {
  const u = CAM_UI[state]; if (!u || !$('#apq-st')) return; const icon = $('#apq-ic'); icon.textContent = u[0]; icon.className = 'ms'; $('#apq-st').textContent = u[1]; $('#apq-st').className = state === 'denied' || state === 'none' || state === 'invalid' ? 'err' : '';
  $('#apq-cam').hidden = !u[2] || state === 'pending'; $('#apq-ic').hidden = u[2] && state !== 'invalid' ? true : false; $('#apq-go').hidden = state === 'pending' || state === 'scanning' || state === 'invalid'; $('#apq-stop').hidden = !(state === 'pending' || state === 'scanning' || state === 'invalid');
  $('#apq-cam').dataset.state = state;
}
let apCode = '', apcCode = '', apDevice = '';
const approveMsg = (sel, text, cls = 'msg') => { const m = $(sel); if (m) { m.textContent = text; m.className = cls; } };
const apSel = which => which === 'q' ? { one: '#apq-1', two: '#apq-2', req: '#apq-req', msg: '#apq-msg' } : { one: '#apc-1', two: '#apc-2', req: '#apc-req', msg: '#apc-msg' };
/* 承認の確認画面：「Windows PC (Edge) からのログイン要求です。承認しますか？」 */
function showApproveConfirm(which, device) {
  const s = apSel(which); apDevice = device || '不明な端末';
  $(s.one).hidden = true; $(s.two).hidden = false;
  $(s.req).innerHTML = `<b>${esc(apDevice)}</b> からのログイン要求です。<br>承認しますか？`;
  approveMsg(s.msg, '');
}
function resetApprove(which) {
  const s = apSel(which);
  if ($(s.one)) $(s.one).hidden = false; if ($(s.two)) $(s.two).hidden = true;
  if (which === 'q') apCode = ''; else { apcCode = ''; const i = $('#ap-in'); if (i) i.value = ''; }
}
/* コードの失敗は、原因と対処をコード付きで表示する。信頼端末でない場合は登録画面へ案内する。 */
function approveFail(e, which) {
  const s = apSel(which);
  approveMsg(s.msg, apiMessage(e), 'msg err');
  if (e instanceof ApiError && e.code === 'untrusted') { showToast(apiMessage(e)); openTrustTab(); }
}
/* 承認する前に、要求元の端末名を確認する（何も変更しない） */
async function lookupRequest(code, which) {
  const s = apSel(which), buttons = $$('[data-ap=check-c],[data-ap=scan]');
  buttons.forEach(b => b.disabled = true);
  approveMsg(s.msg, '確認しています…');
  try {
    const d = await Api.auth.lookup(code);
    if (which === 'q') apCode = code; else apcCode = code;
    showApproveConfirm(which, d.device);
  } catch (e) {
    approveFail(e, which);
    if (which === 'q') { $('#apq-1').hidden = false; $('#apq-2').hidden = true; $('#apq-st').textContent = 'ログインしたい端末に出ているQRを、もう一度読み取ってください。'; $('#apq-st').className = ''; $('#apq-go').hidden = false; $('#apq-stop').hidden = true; }
  } finally { buttons.forEach(b => b.disabled = false); }
}
function apFound(p) { camStop = null; $('#apq-cam').hidden = true; $('#apq-ic').hidden = false; lookupRequest(p.code, 'q'); }
async function approveRequest(code, which) {
  const s = apSel(which), buttons = $$('[data-ap=ok-c],[data-ap=ok-q]');
  buttons.forEach(b => b.disabled = true);
  approveMsg(s.msg, '承認しています…');
  try {
    await Api.auth.approve(code);
    const dev = apDevice;
    resetApprove(which);
    approveMsg(s.msg, `承認しました。${dev} がログインします。`, 'msg ok');
  } catch (e) {
    approveFail(e, which);
    if (e instanceof ApiError && ['bad_code', 'rate'].includes(e.code)) resetApprove(which);
  } finally { buttons.forEach(b => b.disabled = false); }
}
$('#bench').addEventListener('click', e => {
  const b = e.target.closest('[data-ap],[data-a=my-rev]'); if (!b) return;
  if (b.dataset.a === 'my-rev') {
    const d = DATA.devices[+b.dataset.i];
    if (!d) return;
    return confirmDlg('信頼端末を失効', d.current ? 'この端末の信頼を失効します。次回から再承認が必要です。' : d.name + ' の信頼を失効します。', async () => {
      if (!d.id) return showToast('端末の情報を確認できませんでした');
      try { await Api.auth.deviceRevoke(d.id); await refreshDevices(); notify('device', '失効しました'); } catch (err) { showApiError(err); }
    });
  }
  const a = b.dataset.ap;
  if (a === 'scan') { camStop_(); camStop = QR.start($('#apq-v'), (s, p) => { if (s === 'found') return apFound(p); camUi(s); }); }
  if (a === 'stop') { camStop_(); const icon = $('#apq-ic'); icon.hidden = false; icon.textContent = 'qr_code_scanner'; icon.className = 'ms'; $('#apq-st').textContent = 'ログインしたい端末に出ているQRを読み取ります。'; $('#apq-st').className = ''; $('#apq-go').hidden = false; $('#apq-stop').hidden = true; }
  if (a === 'ok-q') { if (!apCode) return approveMsg('#apq-msg', 'コードを読み取れませんでした。もう一度QRを読み取ってください。', 'msg err'); approveRequest(apCode, 'q'); }
  if (a === 'no-q') { camStop_(); resetApprove('q'); approveMsg('#apq-msg', '拒否しました。'); }
  if (a === 'no-c') { resetApprove('c'); approveMsg('#apc-msg', '拒否しました。'); }
  if (a === 'check-c') { const v = ($('#ap-in').value || '').replace(/\D/g, ''); if (v.length !== 6) return approveMsg('#apc-msg', '6桁のコードを入力してください。', 'msg err'); lookupRequest(v, 'c'); }
  if (a === 'ok-c') { if (!apcCode) return approveMsg('#apc-msg', 'コードを入力し直してください。', 'msg err'); approveRequest(apcCode, 'c'); }
});
$('#bench').addEventListener('input', e => { if (e.target.id === 'ap-in') e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
document.addEventListener('visibilitychange', () => { if (document.hidden) camStop_(); });
