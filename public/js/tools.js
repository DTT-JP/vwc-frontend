/* SPDX-License-Identifier: GPL-3.0-or-later */
/* メディアプレビューと未保存・保存競合・容量超過のダイアログ */
function mediaPane(t) {
  const e = ext(t.name), u = t.f.blob ? (t.f.url = t.f.url || URL.createObjectURL(t.f.blob)) : '';
  const meta = `<div class="media-meta">${esc(t.name)}${t.f.blob ? ' · ' + kb(t.f.blob.size) : ''}</div>`;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(e)) {
    return u
      ? `<div class="media-preview"><div class="media-fit-wrap"><img class="media-fit" src="${u}" alt="${esc(t.name)}"></div>${meta}</div>`
      : `<div class="media-preview"><div class="media-fit-wrap"><div class="empty">${ico('image')}<br>${esc(t.name)}<br>1920×1080 / 240KB（サンプル）</div></div></div>`;
  }
  if (['mp3', 'wav', 'm4a', 'flac', 'ogg'].includes(e)) return `<div class="media-preview audio"><div class="media-fit-wrap"><audio controls ${u ? `src="${u}"` : ''}></audio></div>${meta}</div>`;
  if (['mp4', 'webm'].includes(e)) {
    return `<div class="media-preview"><div class="media-fit-wrap"><video controls class="media-fit" ${u ? `src="${u}"` : ''}></video></div>${meta}</div>`;
  }
  return `<div class="empty">${ico(fileIcon(t.name))}<br>${esc(t.name)}<br>この形式はダウンロードのみできます</div>`;
}

let unsT = null, unsNext = null;
function askUnsaved(t, next) { unsT = t; unsNext = next || null; $('#d-uns').showModal(); }
$('#d-uns').addEventListener('cancel', e => e.preventDefault());
$('#uns-yes').onclick = () => { $('#d-uns').close(); const t = unsT, next = unsNext; unsNext = null; save(t); if (!t.dirty) { S.tabs = S.tabs.filter(x => x !== t); renderTabs(); } if (next) next(); };
$('#uns-no').onclick = () => { $('#d-uns').close(); const next = unsNext; unsNext = null; if (unsT) { unsT.f.text = unsT.text; unsT.dirty = false; S.tabs = S.tabs.filter(x => x !== unsT); } renderTabs(); if (next) next(); };
/* 保存競合（T11）：上書き / 再読み込み（自分の変更は退避）/ 差分を見る */
$('#cf-over').onclick = async () => {
  const c = conflictSave; $('#d-cf').close(); conflictSave = null; if (!c) return;
  try {
    const latest = await Api.files.read(S.proj.id, c.t.path);
    const d = await Api.files.write(S.proj.id, c.t.path, c.t.text ?? '', latest.version);
    c.t.f.text = c.t.text; c.t.f.saved = true; c.t.f.version = d.version ?? c.t.f.version; c.t.dirty = false;
    refreshStatus(); renderTabs(); if (typeof scheduleUsageRefresh === 'function') scheduleUsageRefresh(); notify('save', '保存しました'); showToast('上書きしました');
  } catch (e) { showApiError(e); }
};
$('#cf-reload').onclick = async () => {
  const c = conflictSave; $('#d-cf').close(); conflictSave = null; if (!c) return;
  try {
    const latest = await Api.files.read(S.proj.id, c.t.path);
    c.t.text = latest.content ?? latest.text ?? c.t.text;
    c.t.f.text = c.t.text; c.t.f.version = latest.version ?? c.t.f.version; c.t.f.bt = c.t.text; c.t.dirty = false;
    renderTabs(); showToast('自分の変更を退避して再読み込みしました');
  } catch (e) { showApiError(e); }
};
$('#cf-diff').onclick = () => { $('#d-cf').close(); showToast('差分は、相手の変更との比較画面で確認してください'); };

