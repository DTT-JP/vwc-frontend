/* SPDX-License-Identifier: GPL-3.0-or-later */
/* FE 版・build 表示と整合性確認（rules/03 §7.4, §9 / FE指示書 A6,A7）。 */
(function () {
  const TEXT_EXT = new Set(['.php','.js','.css','.html','.json','.md','.txt','.svg','.xml','.yml','.yaml','.sh','.py']);
  const TEXT_NAMES = new Set(['VERSION','.htaccess','.gitattributes']);
  function isText(name) { if (TEXT_NAMES.has(name)) return true; const i = name.lastIndexOf('.'); return i >= 0 && TEXT_EXT.has(name.slice(i).toLowerCase()); }
  function normalizeCrlf(buf, name) {
    if (!isText(name)) return new Uint8Array(buf);
    const bytes = new Uint8Array(buf);
    const out = [];
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0x0d && bytes[i + 1] === 0x0a) { out.push(0x0a); i++; }
      else out.push(bytes[i]);
    }
    return new Uint8Array(out);
  }
  /* SHA-256: crypto.subtle が使える環境では WebCrypto、非セキュアコンテキスト(HTTP等)ではJSフォールバック。 */
  function sha256HexFallback(bytes) {
    const u8 = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
    function rotr(n, x) { return (x >>> n) | (x << (32 - n)); }
    const K = new Uint32Array([
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ]);
    let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
    const bitLen = u8.length * 8;
    const withOne = u8.length + 1;
    const padLen = (withOne % 64 <= 56 ? 56 - (withOne % 64) : 120 - (withOne % 64));
    const total = withOne + padLen + 8;
    const m = new Uint8Array(total);
    m.set(u8, 0); m[u8.length] = 0x80;
    const hi = Math.floor(bitLen / 0x100000000), lo = bitLen >>> 0;
    m[total-8]=(hi>>>24)&255; m[total-7]=(hi>>>16)&255; m[total-6]=(hi>>>8)&255; m[total-5]=hi&255;
    m[total-4]=(lo>>>24)&255; m[total-3]=(lo>>>16)&255; m[total-2]=(lo>>>8)&255; m[total-1]=lo&255;
    const w = new Uint32Array(64);
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) { const j = off + i*4; w[i] = ((m[j]<<24)|(m[j+1]<<16)|(m[j+2]<<8)|m[j+3])>>>0; }
      for (let i = 16; i < 64; i++) {
        const s0 = (rotr(7,w[i-15]) ^ rotr(18,w[i-15]) ^ (w[i-15]>>>3))>>>0;
        const s1 = (rotr(17,w[i-2]) ^ rotr(19,w[i-2]) ^ (w[i-2]>>>10))>>>0;
        w[i] = (w[i-16] + s0 + w[i-7] + s1)>>>0;
      }
      let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
      for (let i = 0; i < 64; i++) {
        const S1 = (rotr(6,e)^rotr(11,e)^rotr(25,e))>>>0;
        const ch = ((e&f)^(~e&g))>>>0;
        const t1 = (h + S1 + ch + K[i] + w[i])>>>0;
        const S0 = (rotr(2,a)^rotr(13,a)^rotr(22,a))>>>0;
        const maj = ((a&b)^(a&c)^(b&c))>>>0;
        const t2 = (S0 + maj)>>>0;
        h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
      }
      h0=(h0+a)>>>0; h1=(h1+b)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0; h4=(h4+e)>>>0; h5=(h5+f)>>>0; h6=(h6+g)>>>0; h7=(h7+h)>>>0;
    }
    function hex32(x){return (x>>>0).toString(16).padStart(8,'0');}
    return hex32(h0)+hex32(h1)+hex32(h2)+hex32(h3)+hex32(h4)+hex32(h5)+hex32(h6)+hex32(h7);
  }
  async function sha256Hex(bytes) {
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
      try {
        const d = await crypto.subtle.digest('SHA-256', ab);
        return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (e) { /* フォールバックへ */ }
    }
    return sha256HexFallback(new Uint8Array(ab));
  }
  async function fetchTextNoStore(url) {
    const r = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
    if (!r.ok) throw new Error('http_' + r.status);
    return r.text();
  }
  async function fetchJsonNoStore(url) {
    const r = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
    if (!r.ok) throw new Error('http_' + r.status);
    return r.json();
  }
  async function loadFeInfo() {
    let version = '取得できません', manifest = null;
    try { version = (await fetchTextNoStore('VERSION')).trim() || version; } catch {}
    try { manifest = await fetchJsonNoStore('build-manifest.json'); } catch {}
    return { version, manifest };
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  window.renderAboutVersion = async function renderAboutVersion() {
    const fe = await loadFeInfo();
    const meta = (window.DATA && DATA.meta) ? DATA.meta : {};
    const be = meta.backend || null;
    const feBuild = fe.manifest && fe.manifest.build ? fe.manifest.build : '—';
    const feVer = (fe.manifest && fe.manifest.version) || fe.version || '—';
    const beVerRaw = be ? (be.version || '') : (meta.server_version || '');
    const beVer = beVerRaw ? beVerRaw : '取得できません';
    const beBuild = be ? (be.build || '—') : '—';
    const feOk = feVer !== '取得できません' && feVer !== '—';
    const beOk = beVer !== '取得できません';
    const verRow = (side, label, ver, build, ok, icon) => {
      const st = ok ? 'ok' : 'na';
      const stText = ok ? '取得済み' : '取得できません';
      return `<div class="ver-card ${st}" data-side="${side}">
        <div class="ver-main">
          <div class="ver-head">
            <span class="ver-icon ms" aria-hidden="true">${icon}</span>
            <span class="ver-label">${label}</span>
          </div>
          <div class="ver-meta">
            <span class="ver-kv"><span class="k">version</span><span class="v" id="ver-${side}-ver">${esc(ver)}</span></span>
            <span class="ver-kv"><span class="k">build</span><span class="v mono" id="ver-${side}-build">${esc(build)}</span></span>
          </div>
        </div>
        <div class="ver-state" id="ver-${side}-state">${stText}</div>
      </div>`;
    };
    return `<h2>バージョン情報</h2>
      <div class="ver-cards" id="ver-lines" aria-label="バージョン情報">
        ${verRow('fe', 'Frontend', feVer, feBuild, feOk, 'web')}
        ${verRow('be', 'Backend', beVer, beBuild, beOk, 'dns')}
      </div>
      <div class="row" style="margin-top:12px"><div>FE側変更の確認<small>配備されたFEファイルに変更があるかどうかを確認します（config.js・vendor・fonts・help/media・.htaccess は対象外。追加ファイルや manifest 自体の差し替えは検出できません）</small></div>
      <button class="o" id="ver-check">${window.ico ? ico('verified') : ''}変更を確認</button></div>
      <div id="ver-result" class="dnote" style="margin-top:8px"></div>
      <div id="ver-diff" style="margin-top:8px"></div>`;
  };

  window.runIntegrityCheck = async function runIntegrityCheck(statusEl, diffEl, linesEl) {
    let manifest;
    try { manifest = await fetchJsonNoStore('build-manifest.json'); } catch { statusEl.textContent = '確認できません'; diffEl.textContent = ''; return; }
    const files = manifest && manifest.files ? Object.keys(manifest.files) : [];
    if (!files.length) { statusEl.textContent = '確認できません'; diffEl.textContent = ''; return; }
    statusEl.textContent = '確認中…';
    diffEl.textContent = '';
    let changed = false;
    let done = 0;
    const concurrency = 4;
    let idx = 0;
    async function worker() {
      while (idx < files.length && !changed) {
        const i = idx++; const rel = files[i];
        const name = rel.split('/').pop();
        try {
          const r = await fetch(rel, { cache: 'no-store', credentials: 'same-origin' });
          if (!r.ok) { changed = true; }
          else {
            const buf = await r.arrayBuffer();
            const norm = normalizeCrlf(buf, name);
            const h = await sha256Hex(norm);
            if (h !== manifest.files[rel]) changed = true;
          }
        } catch (e) { changed = true; }
        done++; statusEl.textContent = '確認中…';
      }
    }
    await Promise.all(Array.from({length: Math.min(concurrency, files.length)}, worker));
    diffEl.textContent = '';
    if (changed) {
      statusEl.textContent = '変更がある';
      if (linesEl) {
        const feBuildEl = linesEl.querySelector('#ver-fe-build') || document.getElementById('ver-fe-build');
        if (feBuildEl && !/\*$/.test(feBuildEl.textContent)) feBuildEl.textContent += ' *';
      }
    } else {
      statusEl.textContent = '変更がない';
    }
  };

  /* 適合テストベクタ（rules/03 §8）。dev/vector-test.html と自動確認用。 */
  window.VWCBuildVector = {
    isText, normalizeCrlf, sha256Hex,
    async check() {
      const files = [
        ['.htaccess','Require all denied\r\n'],
        ['VERSION','1.2.1\r\n'],
        ['img/dot.bin', new Uint8Array([0x00,0x01,0x02,0x0d,0x0a,0xff])],
        ['index.php','<?php\r\necho "ok";\r\n'],
        ['lib/a.js','var a=1;\n'],
        ['日本語/と.txt', new TextEncoder().encode('テスト\r\n')],
      ].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
      const enc = new TextEncoder();
      const concat = [];
      for (const [p,c] of files) {
        const name = p.split('/').pop();
        const raw = (c instanceof Uint8Array) ? c : enc.encode(c);
        const norm = normalizeCrlf(raw.buffer ? raw.buffer.slice(raw.byteOffset, raw.byteOffset+raw.byteLength) : raw, name);
        concat.push(enc.encode(p), new Uint8Array([0]), norm, new Uint8Array([0]));
      }
      let total=0; concat.forEach(x=>total+=x.length); const all=new Uint8Array(total); let o=0; concat.forEach(x=>{all.set(x,o);o+=x.length;});
      const full = await sha256Hex(all);
      const hashOk = full === 'c6e66df436462b6024f6e0c40d6a36b5e1b035db5acef5b14b4d12991275af37';
      return { ok: hashOk, build_full: full, build: full.slice(0,7) };
    }
  };
})();
