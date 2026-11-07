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
  async function sha256Hex(bytes) {
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const d = await crypto.subtle.digest('SHA-256', ab);
    return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('');
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
    const be = (window.DATA && DATA.meta && DATA.meta.backend) ? DATA.meta.backend : null;
    const feBuild = fe.manifest && fe.manifest.build ? fe.manifest.build : '—';
    const feVer = (fe.manifest && fe.manifest.version) || fe.version || '—';
    const beVer = be ? (be.version || '—') : (DATA.meta && DATA.meta.server_version ? DATA.meta.server_version + '（旧形式）' : '取得できません');
    const beBuild = be ? (be.build || '—') : '—';
    const feLine = `Frontend | ver ${esc(feVer)} (build ${esc(feBuild)})`;
    const beLine = `Backend  | ver ${esc(beVer)} (build ${esc(beBuild)})`;
    return `<h2>バージョン情報</h2>
      <pre class="verbox" id="ver-lines" style="white-space:pre-wrap;font-family:var(--mono,monospace);padding:12px;border:1px solid var(--border,#333);border-radius:8px">${feLine}\n${beLine}</pre>
      <div class="row" style="margin-top:12px"><div>ファイルの整合性<small>配備されたファイルが build-manifest.json と一致するか確認します（config.js・vendor・fonts・help/media・.htaccess は対象外。追加ファイルや manifest 自体の差し替えは検出できません）</small></div>
      <button class="o" id="ver-check">${window.ico ? ico('verified') : ''}整合性を確認</button></div>
      <div id="ver-result" class="dnote" style="margin-top:8px"></div>
      <div id="ver-diff" style="margin-top:8px"></div>`;
  };

  window.runIntegrityCheck = async function runIntegrityCheck(statusEl, diffEl, linesEl) {
    if (!crypto || !crypto.subtle) { statusEl.textContent = '確認できません（この環境ではハッシュ計算を利用できません）'; return; }
    let manifest;
    try { manifest = await fetchJsonNoStore('build-manifest.json'); } catch { statusEl.textContent = '確認できません（build-manifest.json を取得できませんでした）'; return; }
    const files = manifest && manifest.files ? Object.keys(manifest.files) : [];
    if (!files.length) { statusEl.textContent = '確認できません（検査対象がありません）'; return; }
    statusEl.textContent = `確認中… (0/${files.length})`;
    diffEl.textContent = '';
    const diffs = [];
    let done = 0;
    const concurrency = 4;
    let idx = 0;
    async function worker() {
      while (idx < files.length) {
        const i = idx++; const rel = files[i];
        const name = rel.split('/').pop();
        try {
          const r = await fetch(rel, { cache: 'no-store', credentials: 'same-origin' });
          if (!r.ok) { diffs.push(`${rel} (取得失敗 ${r.status})`); }
          else {
            const buf = await r.arrayBuffer();
            const norm = normalizeCrlf(buf, name);
            const h = await sha256Hex(norm);
            if (h !== manifest.files[rel]) diffs.push(rel);
          }
        } catch (e) { diffs.push(`${rel} (エラー)`); }
        done++; statusEl.textContent = `確認中… (${done}/${files.length})`;
      }
    }
    await Promise.all(Array.from({length: Math.min(concurrency, files.length)}, worker));
    if (diffs.length) {
      statusEl.textContent = `不一致・欠落が ${diffs.length} 件あります（build ${manifest.build || ''} *）`;
      if (linesEl) linesEl.textContent = linesEl.textContent.replace(/\(build ([0-9a-f]{7})\)/, '(build $1 *)');
      diffEl.innerHTML = '<ul style="margin:4px 0 0 16px">' + diffs.map(d=>'<li><code>'+esc(d)+'</code></li>').join('') + '</ul>';
    } else {
      statusEl.textContent = `一致しました（${files.length} ファイル）`;
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
