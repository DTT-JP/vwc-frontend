/* SPDX-License-Identifier: GPL-3.0-or-later */
/* エディターの色付け（highlight.js を利用。vendor/ から読み込む。読み込めない場合は無色で動作） */
const HL_LANG = { html: 'xml', htm: 'xml', svg: 'xml', xml: 'xml', vue: 'xml', js: 'javascript', mjs: 'javascript', ts: 'typescript', py: 'python', rb: 'ruby', php: 'php',
  sql: 'sql', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp', java: 'java', kt: 'kotlin', go: 'go', rs: 'rust', swift: 'swift',
  sh: 'bash', bash: 'bash', ps1: 'powershell', json: 'json', yml: 'yaml', yaml: 'yaml', md: 'markdown', css: 'css', scss: 'scss', less: 'less', lua: 'lua',
  pl: 'perl', r: 'r', toml: 'ini', ini: 'ini', conf: 'ini', config: 'ini', env: 'ini', dockerfile: 'dockerfile', dart: 'dart', scala: 'scala', hs: 'haskell',
  ex: 'elixir', exs: 'elixir', groovy: 'groovy', htaccess: 'apache', diff: 'diff', graphql: 'graphql', m: 'objectivec', vb: 'vbnet', txt: 'plaintext' };
function langOf(name) { const e = ext(name); return HL_LANG[e] || HL_LANG[name.toLowerCase().replace(/^\./, '')] || 'plaintext'; }
function paintEditor(pane, ta, t) {
  const code = $('code', pane), lang = langOf(t.name), src = ta.value + '\n'; // 末尾の改行で最終行の高さを確保
  let out;
  try { out = window.hljs && hljs.getLanguage(lang) ? hljs.highlight(src, { language: lang, ignoreIllegals: true }).value : esc(src); } catch { out = esc(src); }
  code.innerHTML = out;
  $('.gut', pane).textContent = Array.from({ length: src.split('\n').length - 1 }, (_, i) => i + 1).join('\n');
  if (window.paintMarks) paintMarks(pane, ta);
  syncScroll(pane, ta);
}
function syncScroll(pane, ta) { const p = $('pre.hl', pane), f = $('pre.fm', pane); p.scrollTop = ta.scrollTop; p.scrollLeft = ta.scrollLeft; if (f) { f.scrollTop = ta.scrollTop; f.scrollLeft = ta.scrollLeft; } $('.gut', pane).scrollTop = ta.scrollTop; }
