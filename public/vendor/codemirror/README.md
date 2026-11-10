# CodeMirror 6 (vendored bundle)

This directory contains a custom IIFE bundle of CodeMirror 6 used by the VWC editor (FIX 13/14). It is **not** managed by `tools/dependencies.json` / `tools/complete.py`; rebuild this bundle when adding languages or extensions.

- Bundle: `cm6.bundle.js` (minified, IIFE)
- Global export: `window.CM`
- Exposed shape: `CM.state`, `CM.view`, `CM.commands`, `CM.language`, `CM.autocomplete`, `CM.search`, `CM.langs`, `CM.themes`, `CM.tags`

## Bundled packages (MIT)

All bundled packages below are distributed under the MIT License unless noted otherwise by upstream. Copyright (c) Marijn Haverbeke and contributors (and respective upstream contributors). See each package's `LICENSE` in its npm distribution / upstream repository. This bundled output incorporates these MIT-licensed works.

### Core / editor
- `codemirror` 6.0.2
- `@codemirror/state` 6.7.6
- `@codemirror/view` 6.43.15
- `@codemirror/commands` 6.11.1
- `@codemirror/language` 6.13.1
- `@codemirror/autocomplete` 6.20.4
- `@codemirror/search` 6.7.2
- `@codemirror/theme-one-dark` 6.1.3
- `@lezer/highlight` 1.2.5

### Official language packages (`@codemirror/lang-*`, all bundled)
- `@codemirror/lang-angular` 0.1.4
- `@codemirror/lang-cpp` 6.0.3
- `@codemirror/lang-css` 6.3.1
- `@codemirror/lang-go` 6.0.1
- `@codemirror/lang-html` 6.4.12
- `@codemirror/lang-java` 6.0.2
- `@codemirror/lang-javascript` 6.2.5
- `@codemirror/lang-jinja` 6.0.1
- `@codemirror/lang-json` 6.0.2
- `@codemirror/lang-liquid` 6.3.3
- `@codemirror/lang-markdown` 6.5.2
- `@codemirror/lang-php` 6.0.2
- `@codemirror/lang-python` 6.2.1
- `@codemirror/lang-rust` 6.0.2
- `@codemirror/lang-sass` 6.0.2
- `@codemirror/lang-sql` 6.10.0
- `@codemirror/lang-vue` 0.1.3
- `@codemirror/lang-wast` 6.0.2
- `@codemirror/lang-xml` 6.1.0
- `@codemirror/lang-yaml` 6.1.3

`CM.langs` exposes a factory per language id (same keys as package names above, e.g. `html`, `javascript`, `yaml`).

## Rebuild

Rebuild from npm with esbuild (Node/npm required). Example:

```bash
mkdir -p /tmp/opencode/cm6-build && cd /tmp/opencode/cm6-build
npm init -y
npm install --no-audit --no-fund esbuild codemirror \
  @codemirror/state @codemirror/view @codemirror/commands @codemirror/language \
  @codemirror/autocomplete @codemirror/search @codemirror/theme-one-dark @lezer/highlight \
  @codemirror/lang-angular @codemirror/lang-cpp @codemirror/lang-css @codemirror/lang-go \
  @codemirror/lang-html @codemirror/lang-java @codemirror/lang-javascript \
  @codemirror/lang-jinja @codemirror/lang-json @codemirror/lang-liquid \
  @codemirror/lang-markdown @codemirror/lang-php @codemirror/lang-python \
  @codemirror/lang-rust @codemirror/lang-sass @codemirror/lang-sql \
  @codemirror/lang-vue @codemirror/lang-wast @codemirror/lang-xml @codemirror/lang-yaml
# entry.mjs: import the packages above and assign globalThis.CM = { state, view, commands, language, autocomplete, search, langs, themes:{oneDark}, tags }
npx esbuild entry.mjs --bundle --minify --format=iife --outfile=cm6.bundle.js
# copy cm6.bundle.js here and update versions in this README
```

## Update info

- 2026-11-09: Rebuilt bundle to include all official `@codemirror/lang-*` packages (angular, cpp, css, go, html, java, javascript, jinja, json, liquid, markdown, php, python, rust, sass, sql, vue, wast, xml, yaml). Updated `public/js/editor.js` language/extension mappings and refreshed license/attribution text.
