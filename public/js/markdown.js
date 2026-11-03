/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Markdown → HTML（自作・外部ライブラリ不要）。HTMLは常にエスケープして出力する。ヘルプとMarkdownプレビューで共通。
   対応：見出し / 区切り線 / 表 / リスト（入れ子・タスク）/ 引用・注釈（> [!TIP] など）/ コードブロック（色付け=highlight.js）/ Mermaid / 画像・動画・音声 /
        文字の色 {red}…{/}・背景 {bg:yellow}…{/}・大きさ {size:150%}…{/} / 太字・斜体・取り消し線・インラインコード・リンク */
const MD = (() => {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const VID = /\.(mp4|webm|mov|m4v|ogv)([?#].*)?$/i, AUD = /\.(mp3|wav|m4a|aac|ogg|oga|flac|opus)([?#].*)?$/i;
  const bad = u => /^\s*(javascript|vbscript|file):/i.test(u) || (/^\s*data:/i.test(u) && !/^\s*data:image\//i.test(u));
  const CNAME = 'red|orange|yellow|green|blue|purple|pink|cyan|gray', CVAL = c => c[0] === '#' ? c : `var(--mc-${c})`;
  const CALL = { NOTE: ['note', 'メモ'], INFO: ['note', '情報'], TIP: ['tip', 'ヒント'], WARNING: ['warning', '注意'], DANGER: ['danger', '危険'] };
  function media(alt, src, title, o, hold) {
    const [a, w] = alt.split('|'), raw = src.replace(/&amp;/g, '&'); if (bad(raw)) return '';
    const u = esc(o.resolve ? o.resolve(raw) : raw), st = /^\d{2,4}$/.test((w || '').trim()) ? ` style="max-width:min(100%,${w.trim()}px)"` : '', t = title ? ` title="${title}"` : '';
    const h = VID.test(raw) ? `<video controls preload="metadata" playsinline${st}${t} src="${u}"></video>` : AUD.test(raw) ? `<audio controls preload="metadata"${t} src="${u}"></audio>` : `<img loading="lazy" alt="${a}"${st}${t} src="${u}">`;
    hold.push(h); return '\u0001' + (hold.length - 1) + '\u0001';
  }
  function link(t, u, hold) {
    const raw = u.replace(/&amp;/g, '&'); if (bad(raw)) return t;
    const ext = /^https?:/i.test(raw), md = !ext && /\.md(#.*)?$/i.test(raw) && !/^[a-z]+:/i.test(raw);
    hold.push(`<a href="${esc(raw)}"${ext ? ' target="_blank" rel="noopener"' : ''}${md ? ` data-md="${esc(raw)}"` : ''}>${t}</a>`); return '\u0001' + (hold.length - 1) + '\u0001';
  }
  function inline(s, o) {
    const codes = [], hold = []; s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; }); s = esc(s);
    s = s.replace(/\{icon:([a-z0-9_]+)(?:\|(\d{2,3})%)?\}/g, (_, n, z) => { hold.push(`<span class="ms md-ic"${z ? ` style="font-size:${Math.max(50, Math.min(300, +z))}%"` : ''} aria-hidden="true">${n}</span>`); return '\u0001' + (hold.length - 1) + '\u0001'; }); // Material Symbols
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\)/g, (_, a, src, t) => media(a, src, t, o, hold));
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => link(t, u, hold));
    s = s.replace(new RegExp(`\\{(bg:)?(${CNAME}|#[0-9a-fA-F]{3,8})\\}([\\s\\S]+?)\\{\\/\\}`, 'g'), (_, bg, c, t) => bg ? `<span class="mk" style="background:color-mix(in srgb,${CVAL(c)} 32%,transparent)">${t}</span>` : `<span style="color:${CVAL(c)}">${t}</span>`);
    s = s.replace(/\{size:(\d{2,3})%\}([\s\S]+?)\{\/\}/g, (_, n, t) => `<span style="font-size:${Math.max(50, Math.min(300, +n))}%">${t}</span>`);
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/__(.+?)__/g, '<strong>$1</strong>').replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>').replace(/(^|[^_\w])_([^_\s][^_]*?)_(?![_\w])/g, '$1<em>$2</em>').replace(/~~(.+?)~~/g, '<del>$1</del>');
    return s.replace(/\u0001(\d+)\u0001/g, (_, n) => hold[n]).replace(/\u0000(\d+)\u0000/g, (_, n) => `<code>${esc(codes[n])}</code>`);
  }
  function parseMeta(t) {
    t = String(t).replace(/\r\n?/g, '\n'); const m = t.match(/^---\n([\s\S]*?)\n---[ \t]*(\n|$)/), meta = {}; if (!m) return { meta, body: t };
    m[1].split('\n').forEach(l => { const k = l.match(/^\s*([\w-]+)\s*:\s*(.*)$/); if (k) meta[k[1]] = k[2].trim(); }); return { meta, body: t.slice(m[0].length) };
  }
  function codeBlock(code, lang) {
    if (lang === 'mermaid') return `<pre class="mermaid">${esc(code)}</pre>`;
    let h; try { h = window.hljs && lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value : esc(code); } catch { h = esc(code); }
    return `<div class="code"><div class="code-h"><span>${esc(lang || 'text')}</span><button class="copy" data-copy type="button">コピー</button></div><pre><code class="hljs">${h}</code></pre></div>`;
  }
  const cells = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(s => s.trim().replace(/\\\|/g, '|'));
  function buildList(items, o) {
    let p = 0; const tc = o._tc || (o._tc = { n: 0 }); const go = ind => { const tag = items[p].ord ? 'ol' : 'ul'; let h = `<${tag}>`;
      while (p < items.length && items[p].ind === ind) { const it = items[p++]; h += `<li${it.task !== null ? ' class="task"' : ''}>${it.task !== null ? (() => { const k = tc.n++, on = o.tasks && o.tasks[k] !== undefined ? o.tasks[k] : it.task; return `<input type="checkbox" data-task="${k}" ${on ? 'checked' : ''}> `; })() : ''}${inline(it.t, o)}`; if (p < items.length && items[p].ind > ind) h += go(items[p].ind); h += '</li>'; }
      return h + `</${tag}>`; };
    let h = ''; while (p < items.length) h += go(items[p].ind); return h;
  }
  function render(md, o = {}) {
    if (!o._tc) o._tc = { n: 0 };
    const L = (o.sub ? String(md) : parseMeta(md).body).split('\n'), out = [], ids = new Set(); let i = 0;
    const slug = s => { const b = s.replace(/<[^>]+>/g, '').trim().toLowerCase().replace(/[^\w\u0080-\uffff\s-]/g, '').replace(/\s+/g, '-') || 'sec'; let id = b, n = 2; while (ids.has(id)) id = b + '-' + n++; ids.add(id); return id; };
    const blank = l => !l.trim(), isFence = l => /^\s*(```|~~~)/.test(l), isHr = l => /^\s*([-*_])(\s*\1){2,}\s*$/.test(l), isHead = l => /^#{1,6}\s+\S/.test(l), isQuote = l => /^\s*>/.test(l), isList = l => /^\s*([-*+]|\d+[.)])\s+/.test(l);
    const isTable = k => L[k] && L[k].includes('|') && L[k + 1] && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(L[k + 1]);
    while (i < L.length) {
      const l = L[i]; let m; if (blank(l)) { i++; continue; }
      if ((m = l.match(/^\s*(```|~~~)\s*([\w+#.-]*)/))) { const buf = []; i++; while (i < L.length && !new RegExp('^\\s*' + m[1]).test(L[i])) buf.push(L[i++]); i++; out.push(codeBlock(buf.join('\n'), (m[2] || '').toLowerCase())); continue; }
      if ((m = l.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) { out.push(`<h${m[1].length} id="${esc(slug(m[2]))}">${inline(m[2], o)}</h${m[1].length}>`); i++; continue; }
      if (isHr(l)) { out.push('<hr>'); i++; continue; }
      if (isQuote(l)) { const q = []; while (i < L.length && isQuote(L[i])) q.push(L[i++].replace(/^\s*>\s?/, '')); const c = q[0].match(/^\[!(NOTE|INFO|TIP|WARNING|DANGER)\]\s*(.*)$/i);
        if (c) { const [k, def] = CALL[c[1].toUpperCase()]; q[0] = ''; out.push(`<div class="callout callout-${k}"><div class="callout-t">${inline(c[2] || def, o)}</div>${render(q.join('\n'), { ...o, sub: true })}</div>`); }
        else out.push(`<blockquote>${render(q.join('\n'), { ...o, sub: true })}</blockquote>`); continue; }
      if (isTable(i)) { const head = cells(l), al = cells(L[i + 1]).map(c => /^:-+:$/.test(c) ? 'center' : /-+:$/.test(c) ? 'right' : /^:-+/.test(c) ? 'left' : ''), rows = []; i += 2; while (i < L.length && !blank(L[i]) && L[i].includes('|')) rows.push(cells(L[i++]));
        const td = (t, k, tag) => `<${tag}${al[k] ? ` style="text-align:${al[k]}"` : ''}>${inline(t || '', o)}</${tag}>`;
        out.push(`<div class="tbl-wrap"><table class="mdt"><thead><tr>${head.map((c, k) => td(c, k, 'th')).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${head.map((_, k) => td(r[k], k, 'td')).join('')}</tr>`).join('')}</tbody></table></div>`); continue; }
      if (isList(l)) { const items = [];
        const sameKind = s => { const n = s.match(/^(\s*)([-*+]|\d+[.)])\s+/); return !items.length || n[1].length > 0 || /\d/.test(n[2]) === items[0].ord; }; // 番号付きと番号なしは別のリストにする
        while (i < L.length) { if (blank(L[i])) { if (i + 1 < L.length && isList(L[i + 1]) && sameKind(L[i + 1])) { i++; continue; } break; }
          if (isList(L[i]) && !sameKind(L[i])) break;
          if (isList(L[i])) { const mm = L[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/), tk = mm[3].match(/^\[( |x|X)\]\s+(.*)$/); items.push({ ind: mm[1].replace(/\t/g, '  ').length, ord: /\d/.test(mm[2]), t: tk ? tk[2] : mm[3], task: tk ? tk[1] !== ' ' : null }); }
          else if (/^\s{2,}\S/.test(L[i]) && items.length) items[items.length - 1].t += ' ' + L[i].trim(); else break; i++; }
        out.push(buildList(items, o)); continue; }
      const buf = [l]; i++; while (i < L.length && !blank(L[i]) && !isFence(L[i]) && !isHead(L[i]) && !isHr(L[i]) && !isQuote(L[i]) && !isList(L[i]) && !isTable(i)) buf.push(L[i++]);
      let txt = '', prevBr = false; buf.forEach((x, k) => { const br = / {2,}$/.test(x) || /\\$/.test(x); x = x.trim().replace(/\\$/, ''); if (k) txt += prevBr ? '\u0002' : (/[^\x00-\x7f]$/.test(txt) && /^[^\x00-\x7f]/.test(x) ? '' : ' '); txt += x; prevBr = br; });
      const only = txt.trim().match(/^!\[([^\]|]*)(?:\|[^\]]*)?\]\([^)]*\)$/), html = inline(txt, o).replace(/\u0002/g, '<br>');
      out.push(only ? `<figure class="md-fig">${html}${only[1] ? `<figcaption>${esc(only[1])}</figcaption>` : ''}</figure>` : `<p>${html}</p>`);
    }
    return out.join('\n');
  }
  /* 表示後の処理：Mermaid の描画（初めて必要になったときだけ vendor/ から読み込む） */
  const MERMAID = 'vendor/mermaid/mermaid.min.js'; let mmP = null;
  const loadMermaid = () => window.mermaid ? Promise.resolve() : (mmP = mmP || new Promise((res, rej) => { const s = document.createElement('script'); s.src = MERMAID; s.onload = res; s.onerror = () => { mmP = null; rej(new Error('mermaid')); }; document.head.appendChild(s); }));
  const fail = (n, why) => { const src = n.dataset.src || ''; n.outerHTML = `<div class="callout callout-warning"><div class="callout-t">図を表示できません</div>${why}<pre><code>${esc(src)}</code></pre></div>`; };
  async function post(root) {
    const nodes = [...root.querySelectorAll('pre.mermaid:not([data-done])')]; if (!nodes.length) return; nodes.forEach(n => n.dataset.src = n.textContent);
    try { await loadMermaid(); } catch { return nodes.forEach(n => fail(n, 'Mermaid を読み込めませんでした（vendor/mermaid/ の同梱ファイルを確認してください）。')); }
    mermaid.initialize({ startOnLoad: false, theme: document.documentElement.dataset.theme === 'light' ? 'default' : 'dark', securityLevel: 'strict', fontFamily: 'inherit' });
    for (const n of nodes) { try { await mermaid.run({ nodes: [n] }); n.dataset.done = 1; } catch (e) { fail(n, '書き方に誤りがあります。'); } }
  }
  if (typeof document !== 'undefined') document.addEventListener('click', e => {
    const c = e.target.closest && e.target.closest('[data-copy]'), codeBlock = c && c.closest('.code');
    if (codeBlock) { const code = codeBlock.querySelector('code'); if (code) { const t = code.textContent; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => c.textContent = 'コピーしました', () => c.textContent = 'コピーできません'); setTimeout(() => c.textContent = 'コピー', 1600); return; } }
    const tk = e.target.matches && e.target.matches('.mdx input[data-task]') ? e.target : null; if (tk) { window.mdTask && window.mdTask(+tk.dataset.task, tk.checked, tk.closest('.mdx').dataset.ctx); return; }
    const a = e.target.closest && e.target.closest('.mdx a'); if (!a) return;
    if (a.dataset.md) { e.preventDefault(); window.mdOpen && window.mdOpen(a.dataset.md, a.closest('.mdx').dataset.ctx); }
    else if ((a.getAttribute('href') || '').startsWith('#')) { e.preventDefault(); const t = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))); if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth' }); }
  });
  return { render, parseMeta, post, esc };
})();
if (typeof module !== 'undefined') module.exports = { MD };
