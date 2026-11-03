/* SPDX-License-Identifier: GPL-3.0-or-later */
/* SM09 設定：各項目の専用ページ。変更は即時反映（保存はメモリ上のみ） */
const ACC = { blue: '#0078d4', green: '#2ea043', purple: '#8957e5', orange: '#d9730d' };
const notify = (k, m) => { if (DATA.settings.notify[k]) showToast(m); }; // 通知設定に従ってトースト表示
/* 画面内の通知（トースト）の文言一覧（N08）。設定画面に表示し、実際の通知もこの文言に合わせる */
const NOTIFY_TEXT = { save: ['保存', '「○○ をプロジェクトに保存しました（サイズ）」'], share: ['共有', '権限を更新しました', '共有を解除しました', '○○ さんに所有者を移動しました'], publish: ['公開', '「○○」を公開しました', '更新しました（版）', 'ロールバックしました'], device: ['端末', '失効しました', 'この端末の信頼を解除しました'], usage: ['容量', '容量が上限に近づいています。'] };
let saveTimer = 0; const saveState = (k, s) => { const e = $('#set-st'); if (e) { e.className = 'set-st ' + s; e.textContent = s === 'run' ? '保存中…' : s === 'err' ? '保存に失敗しました。もう一度お試しください。' : '保存済み'; } };
function applySettings() {
  const s = DATA.settings, root = document.documentElement, app = $('#app');
  const th = s.theme === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : s.theme;
  root.dataset.theme = th; VWC.set('theme', th, 'app'); root.dataset.density = s.density; root.style.setProperty('--accent', ACC[s.accent]);
  document.body.style.fontSize = s.uiFont + 'px'; root.style.setProperty('--ed-font', s.edFont + 'px'); root.style.setProperty('--ed-lh', s.lineH); root.style.setProperty('--tab', s.tab);
  app.classList.toggle('wrap', s.wrap); app.classList.toggle('nogut', !s.lineNo);
}
const sel = (key, vals, cur) => `<select data-s="${key}">${vals.map(([v, l]) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
const chk = (key, on, sub = '') => `<input type="checkbox" data-s="${key}" ${on ? 'checked' : ''} style="width:22px;height:22px">`;
const row = (t, sub, ctl) => `<div class="setrow"><div>${t}<small>${sub}</small></div>${ctl}</div>`;
const SET = {
  theme: ['外観', () => { const s = DATA.settings; return `<h2>外観</h2>` + row('テーマ', '端末の設定に合わせることもできます', sel('theme', [['dark', 'ダーク'], ['light', 'ライト'], ['auto', '端末に合わせる']], s.theme)) +
    row('強調色', 'ボタンやステータスバーの色', sel('accent', [['blue', 'ブルー'], ['green', 'グリーン'], ['purple', 'パープル'], ['orange', 'オレンジ']], s.accent)); }],
  font: ['文字サイズ', () => { const s = DATA.settings; return `<h2>文字サイズ</h2>` + row('画面全体', '14〜20px（最小14px）', `<input type="number" data-s="uiFont" min="14" max="20" value="${s.uiFont}" style="width:80px">`) +
    row('エディター', '14〜24px', `<input type="number" data-s="edFont" min="14" max="24" value="${s.edFont}" style="width:80px">`) + row('行間', 'コードの行の高さ', sel('lineH', [[1.4, '狭い'], [1.6, '標準'], [1.8, '広い']], s.lineH)); }],
  editor: ['エディター', () => { const s = DATA.settings; return `<h2>エディター</h2>` + row('折り返し', 'ONの間は行番号を隠します', chk('wrap', s.wrap)) + row('行番号', 'エディター左の行番号', chk('lineNo', s.lineNo)) +
    row('タブ幅', 'Tabキーで入る幅（文字数）', sel('tab', [[2, '2'], [4, '4'], [8, '8']], s.tab)); }],
  touch: ['操作・余白', () => `<h2>操作・余白</h2>` + row('ボタンと行の余白', 'タッチ操作では「ゆったり」がおすすめです（タブレット・スマホは自動で44px以上）', sel('density', [['compact', 'コンパクト'], ['standard', '標準'], ['relaxed', 'ゆったり']], DATA.settings.density))],
  guide: ['ヘルプの案内', () => { const on = !store.get('help.dismissed', false); return `<h2>ヘルプの案内</h2><p class=\"dnote\">ログイン後に出る「ヘルプを読んでみませんか？」の案内を、あとから表示し直せます。</p>` +
    row('ログイン後に案内を表示する', 'オンにすると、ヘルプを一度開くまで、ログインのたびに案内を表示します（「今後表示しない」を取り消します）', `<input type=\"checkbox\" data-hw=\"on\" ${on ? 'checked' : ''} style=\"width:22px;height:22px\">`) +
    row('いま案内を表示する', '設定は変えず、案内をいちど表示します', `<button class=\"o\" data-hw=\"now\">${ico('school')}表示する</button>`); }],
  notify: ['通知', () => { const n = DATA.settings.notify; return `<h2>通知</h2><p class="dnote">ここで切り替えるのは、画面の中に出る通知（トースト）です。ブラウザのプッシュ通知は行いません。</p><div class="set-st ok" id="set-st" role="status">保存済み</div>` + [['save', '保存', '保存が完了したとき'], ['share', '共有', '共有・権限が変わったとき'], ['publish', '公開', '公開・更新・ロールバックしたとき'], ['device', '端末', '端末の失効など、端末が変わったとき'], ['usage', '容量', '容量が上限に近づいたとき']].map(([k, t, d]) => row(t, d, `<input type="checkbox" data-n="${k}" ${n[k] ? 'checked' : ''} style="width:22px;height:22px">`)).join('') +
    `<h3>通知の文言一覧</h3><table class="tbl"><thead><tr><th>種類</th><th>文言（○○ は名前や数値）</th></tr></thead><tbody>${Object.values(NOTIFY_TEXT).map(v => `<tr><td data-l="種類">${v[0]}</td><td data-l="文言">${v.slice(1).map(esc).join('<br>')}</td></tr>`).join('')}</tbody></table>`; }]
};
$('#sm09').onclick = e => {
  const r = e.target.closest('[data-set]'); if (!r) return;
  if (r.dataset.set === 'license') { openLicense(); return; } // 右エリアのタブ（license.js。バックエンド不要）
  const entry = SET[r.dataset.set]; if (!entry) return;
  const [n, f] = entry; openTab('設定: ' + n, f, 'settings');
};
$('#bench').addEventListener('change', e => { const t = e.target, k = t.dataset.s, nk = t.dataset.n; if (!k && !nk) return; const s = DATA.settings;
  if (nk) { s.notify[nk] = t.checked; saveSettings(); saveState(nk, 'run'); clearTimeout(saveTimer); saveTimer = setTimeout(() => saveState(nk, 'ok'), 300); return; }
  const v = t.type === 'checkbox' ? t.checked : t.type === 'number' ? +t.value : isNaN(+t.value) ? t.value : +t.value;
  s[k] = k === 'uiFont' ? Math.max(14, Math.min(20, v || 14)) : k === 'edFont' ? Math.max(14, Math.min(24, v || 14)) : v; applySettings(); saveSettings(); if (k === 'theme' || k === 'density') showToast('反映しました'); });
VWC.on('theme', (v, src) => { if (src !== 'app') DATA.settings.theme = v; }); /* 設定画面以外（モック・実データ側）からテーマが変わったとき */
