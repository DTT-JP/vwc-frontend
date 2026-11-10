/* SPDX-License-Identifier: GPL-3.0-or-later */
/* エディター（CodeMirror 6）。FIX 13/14: 独自エディタ/独自HTMLタグ補完を廃止し、CM6 を採用。
   補完は ON/OFF のみ（DATA.settings.htmlComplete: 'on'|'off'。旧 'tab'/'auto' は 'on' に移行）。
   対応言語は標準 CodeMirror 6 の状態。後から言語/拡張を追加できるよう、登録は EditorCore.langs/extenders に集約。 */
(function () {
  if (!window.CM) {
    console.error('CodeMirror 6 bundle (window.CM) が読み込まれていません');
    window.EditorCore = null; return;
  }
  const { EditorState, Compartment, StateField, StateEffect, RangeSetBuilder } = CM.state;
  const { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, Decoration } = CM.view;
  const { defaultKeymap, history, historyKeymap } = CM.commands;
  const { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit } = CM.language;
  const { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap, acceptCompletion, completionStatus } = CM.autocomplete;
  const { highlightSelectionMatches } = CM.search;
  const { oneDark } = CM.themes;

  // 拡張子→CM6言語ID。CM.langs（公式 @codemirror/lang-* を網羅）に存在するものだけ有効。後から EditorCore.EXT/EditorCore.langs で追加可。
  const EXT = {
    html: 'html', htm: 'html', xhtml: 'html', xml: 'xml', svg: 'xml',
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'javascript', tsx: 'javascript',
    css: 'css', less: 'css', sass: 'sass', scss: 'sass',
    json: 'json', jsonc: 'json', map: 'json',
    md: 'markdown', markdown: 'markdown', mdx: 'markdown',
    py: 'python', pyw: 'python', pyi: 'python',
    sql: 'sql', php: 'php', phtml: 'php', php3: 'php', php4: 'php', php5: 'php',
    java: 'java',
    c: 'cpp', h: 'cpp', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hxx: 'cpp', hh: 'cpp',
    rs: 'rust', go: 'go',
    yml: 'yaml', yaml: 'yaml',
    vue: 'vue', wast: 'wast', wat: 'wast',
    jinja: 'jinja', jinja2: 'jinja', j2: 'jinja', liquid: 'liquid', ng: 'angular'
  };

  // 言語拡張の登録点。後から追加する場合はここに関数を足す（または実行時に EditorCore.langs[name]=fn）。
  const langs = Object.assign({}, CM.langs || {});
  // javascript は JSX/TS も扱えるようオプションで呼べる形にする
  langs.javascript = (name) => {
    const e = (name || '').split('.').pop().toLowerCase();
    const jsx = /[x]$/.test(e) || e === 'jsx'; const ts = /^ts/.test(e) || e === 'tsx';
    return CM.langs.javascript({ jsx, typescript: ts });
  };

  function compEnabled() {
    const v = window.DATA && DATA.settings && DATA.settings.htmlComplete;
    return v !== 'off' && v !== false;
  }
  function tabSize() { return Math.max(1, Math.min(8, +(window.DATA && DATA.settings && DATA.settings.tab) || 2)); }
  function isWrap() { return document.getElementById('app') && document.getElementById('app').classList.contains('wrap'); }
  function isNogut() { return document.getElementById('app') && document.getElementById('app').classList.contains('nogut'); }
  function isDark() { return (document.documentElement.dataset.theme || 'dark') !== 'light'; }

  // 検索ハイライト（findbar 用）: 既存 UI/touchui から EditorCore.setFindMatches で更新
  const setFindFx = StateEffect.define();
  const findField = StateField.define({
    create() { return Decoration.none; },
    update(deco, tr) {
      for (const e of tr.effects) if (e.is(setFindFx)) return e.value;
      return deco.map(tr.changes);
    },
    provide: f => EditorView.decorations.from(f)
  });
  const markDeco = Decoration.mark({ class: 'cm-fm' });
  const curDeco = Decoration.mark({ class: 'cm-fm cm-fm-cur' });

  const appTheme = EditorView.theme({
    '&': { height: '100%', fontSize: 'var(--ed-font, 14px)', backgroundColor: 'var(--editor)' },
    '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: 'var(--ed-lh, 1.6)', overflow: 'auto' },
    '.cm-content': { caretColor: 'var(--fg)', padding: '8px 12px 8px 4px' },
    '.cm-gutters': { backgroundColor: 'var(--editor)', color: 'var(--fg-dim)', border: 'none', minWidth: '48px' },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 0' },
    '&.cm-focused': { outline: 'none' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'color-mix(in srgb, var(--accent) 38%, transparent) !important' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--fg)' },
    '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--fg) 5%, transparent)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent' },
    '.cm-fm': { backgroundColor: 'color-mix(in srgb, var(--mc-yellow) 42%, transparent)', borderRadius: '3px' },
    '.cm-fm.cm-fm-cur': { backgroundColor: 'color-mix(in srgb, var(--mc-orange) 75%, transparent)', boxShadow: '0 0 0 1px var(--mc-orange)' },
    '.cm-tooltip-autocomplete': { border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)' }
  }, { dark: false }); // 実色は CSS 変数で追従。oneDark は dark 時のみ追加。

  function langExt(name) {
    const e = String(name || '').split('.').pop().toLowerCase();
    const id = EXT[e] || EXT[String(name || '').toLowerCase().replace(/^\./, '')];
    const fn = id && langs[id]; if (!fn) return [];
    try { return fn(name); } catch (err) { console.warn('CM lang load failed', id, err); return []; }
  }

  const views = new Set();
  function makeState(doc, name, readOnly, tab) {
    const c = {
      lang: new Compartment(), comp: new Compartment(), wrap: new Compartment(), gut: new Compartment(),
      tab: new Compartment(), theme: new Compartment(), ro: new Compartment()
    };
    const ts = tabSize();
    const state = EditorState.create({
      doc: doc == null ? '' : String(doc),
      extensions: [
        highlightSpecialChars(), history(), drawSelection(), dropCursor(),
        EditorState.allowMultipleSelections.of(true), indentOnInput(),
        bracketMatching(), closeBrackets(), rectangularSelection(), crosshairCursor(),
        highlightActiveLine(), highlightSelectionMatches(),
        keymap.of([
          // 補完ONかつ候補表示中は Tab で確定。それ以外は従来どおりスペース挿入（既存挙動維持）
          { key: 'Tab', run: v => compEnabled() && completionStatus(v.state) ? acceptCompletion(v) : (v.dispatch(v.state.replaceSelection(' '.repeat(tabSize()))), true) },
          { key: 'Mod-s', run: () => { if (tab && window.save) window.save(tab); return true; } },
          ...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap
        ]),
        c.lang.of(langExt(name)), c.comp.of(compEnabled() ? autocompletion() : []),
        c.wrap.of(isWrap() ? EditorView.lineWrapping : []), c.gut.of(isNogut() ? [] : [lineNumbers(), highlightActiveLineGutter(), foldGutter()]),
        c.tab.of([indentUnit.of(' '.repeat(ts)), EditorState.tabSize.of(ts)]),
        c.theme.of(isDark() ? [oneDark, appTheme] : [appTheme]),
        c.ro.of([EditorState.readOnly.of(!!readOnly), EditorView.editable.of(!readOnly)]),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        findField,
        EditorView.updateListener.of(u => {
          if (!u.docChanged) return;
          if (tab) { tab.text = u.state.doc.toString(); if (window.markDirty) window.markDirty(tab); }
          if (window.updateEdPos) window.updateEdPos(u.view);
        }),
        EditorView.domEventHandlers({
          focus: () => { if (window.updateEdPos) window.updateEdPos(viewRef.view); return false; },
          click: () => { if (window.updateEdPos) window.updateEdPos(viewRef.view); return false; }
        })
      ]
    });
    const viewRef = { view: null };
    const view = new EditorView({ state, parent: document.createElement('div') });
    view.dom.classList.add('cm-host');
    viewRef.view = view; view._c = c; view._tab = tab; views.add(view);
    return view;
  }

  function create(parent, tab, readOnly) {
    const view = makeState(tab.text, tab.name, readOnly, tab);
    tab.cm = view;
    parent.innerHTML = '';
    parent.appendChild(view.dom);
    view.dom.style.height = '100%';
    // 初期カーソル位置表示
    if (window.updateEdPos) setTimeout(() => window.updateEdPos(view), 0);
    return view;
  }
  function destroy(view) {
    if (!view) return;
    views.delete(view); if (view._tab && view._tab.cm === view) view._tab.cm = null;
    try { view.destroy(); } catch {}
  }
  function mount(parent, view) {
    if (!parent || !view) return;
    parent.innerHTML = ''; parent.appendChild(view.dom);
  }
  function getText(view) { return view ? view.state.doc.toString() : ''; }
  function setText(view, text) {
    if (!view) return; const next = text == null ? '' : String(text);
    if (next === view.state.doc.toString()) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
  }
  function focus(view) { if (view) view.focus(); }
  function scrollToPos(view, from, to) {
    if (!view) return;
    view.dispatch({ selection: { anchor: from, head: to == null ? from : to }, effects: EditorView.scrollIntoView(from, { y: 'center' }) });
    view.focus();
  }
  function configureAll() {
    const ts = tabSize(), wrap = isWrap(), nogut = isNogut(), dark = isDark(), comp = compEnabled();
    views.forEach(v => {
      try {
        v.dispatch({ effects: [
          v._c.comp.reconfigure(comp ? autocompletion() : []),
          v._c.wrap.reconfigure(wrap ? EditorView.lineWrapping : []),
          v._c.gut.reconfigure(nogut ? [] : [lineNumbers(), highlightActiveLineGutter(), foldGutter()]),
          v._c.tab.reconfigure([indentUnit.of(' '.repeat(ts)), EditorState.tabSize.of(ts)]),
          v._c.theme.reconfigure(dark ? [oneDark, appTheme] : [appTheme])
        ] });
      } catch {}
    });
  }
  function setFindMatches(view, matches, cur) {
    if (!view) return;
    const b = new RangeSetBuilder();
    (matches || []).forEach((m, i) => { const from = m[0], to = m[1]; if (to > from) b.add(from, to, i === cur ? curDeco : markDeco); });
    view.dispatch({ effects: setFindFx.of(b.finish()) });
  }
  function clearFind(view) { if (view) view.dispatch({ effects: setFindFx.of(Decoration.none) }); }

  // 互換レイヤ（既存呼び出しが残っても落ちないように）
  window.langOf = name => { const e = String(name || '').split('.').pop().toLowerCase(); return EXT[e] || 'plaintext'; };
  window.paintEditor = function (pane, _ta, t) { // CM利用時は入力ごとの再ハイライト不要。外部更新用にテキスト同期だけ行う。
    if (pane) pane._tab = t;
    const v = (t && t.cm) || (pane && pane._cmView);
    if (v && t && t.text != null) setText(v, t.text);
  };
  window.syncScroll = function () { /* CM がスクロール管理 */ };
  window.edAcceptCompletion = function () { return false; }; // CM/autocompletion が処理
  window.edAutoComplete = function () { return false; };
  window.paintCompletion = function () {};

  window.EditorCore = { create, destroy, mount, getText, setText, focus, scrollToPos, configureAll, setFindMatches, clearFind, langExt, compEnabled, tabSize, views, langs, EXT };
})();