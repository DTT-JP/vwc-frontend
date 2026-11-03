/* SPDX-License-Identifier: GPL-3.0-or-later */
/* QR の生成と読み取り。ログイン用QRは、このエディター自身の ?approve=<6桁> のURL（04 の URL契約）。 */
const QR = {
  svg(text) { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); },

  parse(text) {
    try {
      const u = new URL(String(text || ''), location.href);
      if (u.origin !== location.origin) return { ok: false };
      const code = (u.searchParams.get('approve') || '').match(/^\d{6}$/)?.[0];
      return code ? { ok: true, code } : { ok: false };
    } catch { return { ok: false }; }
  },
  async loadDecoder() { if (window.jsQR) return; await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/qr/jsQR.js'; s.onload = res; s.onerror = () => rej(new Error('decoder')); document.head.appendChild(s); }); },

  async decode(img) {
    if (window.BarcodeDetector && !QR.noBD) { try { const bd = QR.bd || (QR.bd = new BarcodeDetector({ formats: ['qr_code'] })), r = await bd.detect(img.canvas || img); return r.length ? r[0].rawValue : null; } catch (e) { QR.noBD = true; } }
    await QR.loadDecoder(); const d = img.data ? img : img.getContext('2d').getImageData(0, 0, img.width, img.height), r = window.jsQR(d.data, d.width, d.height, { inversionAttempts: 'dontInvert' }); return r ? r.data : null;
  },

  start(video, cb) {
    let stop = false, stream = null, timer = 0; const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
    const end = () => { stop = true; clearInterval(timer); if (stream) stream.getTracks().forEach(t => t.stop()); video.srcObject = null; };
    cb('pending');
    (async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return cb('none');
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); }
      catch (e) { return cb(e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError' || e.name === 'DevicesNotFoundError') ? 'none' : 'denied'); }
      if (stop) return end(); video.srcObject = stream; try { await video.play(); } catch (e) { /* 自動再生できない環境では、利用者が押して再生する */ } cb('scanning'); let busy = false, last = '';
      timer = setInterval(async () => {
        if (!video.isConnected) return end(); if (busy || stop || !video.videoWidth) return; busy = true;
        try { cv.width = video.videoWidth; cv.height = video.videoHeight; cx.drawImage(video, 0, 0); const text = await QR.decode(cv);
          if (text && !stop) { const p = QR.parse(text); if (p.ok) { end(); cb('found', p); } else if (text !== last) { last = text; cb('invalid'); } } } catch (e) { /* 次の周期で再試行 */ }
        busy = false; }, 200);
    })();
    return end;
  }
};
