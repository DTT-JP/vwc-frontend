/* SPDX-License-Identifier: GPL-3.0-or-later */
const licenseList = document.querySelector('#license-list');

async function loadLicenseList() {
  try {
    const response = await fetch('vendor/MANIFEST.json');
    if (!response.ok) throw new Error(`MANIFEST.json: HTTP ${response.status}`);
    const manifest = await response.json();
    const entries = [...(manifest.packages || []), ...(manifest.local || [])];
    const fragment = document.createDocumentFragment();

    for (const entry of entries) {
      const item = document.createElement('li');
      const name = document.createElement('b');
      name.textContent = entry.name || '名称未記載';
      item.append(name, ` ${entry.version || ''} — ${entry.license || '記載なし'} (`);
      if (typeof entry.source === 'string') {
        let sourceUrl;
        try {
          sourceUrl = new URL(entry.source);
        } catch {
          sourceUrl = null;
        }
        if (sourceUrl?.protocol === 'https:') {
          const link = document.createElement('a');
          link.href = sourceUrl.href;
          link.rel = 'noopener noreferrer';
          link.textContent = sourceUrl.href;
          item.append(link);
        } else {
          item.append(document.createTextNode(entry.source));
        }
      } else {
        item.append(document.createTextNode('このリポジトリで作成'));
      }
      item.append(')');
      fragment.append(item);
    }

    licenseList.replaceChildren(fragment);
  } catch (error) {
    console.error('ライセンス一覧を読み込めませんでした。', error);
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = 'vendor/MANIFEST.md';
    link.textContent = 'vendor/MANIFEST.md を確認してください。';
    item.append(link);
    licenseList.replaceChildren(item);
  }
}

loadLicenseList();
