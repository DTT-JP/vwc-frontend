/* SPDX-License-Identifier: GPL-3.0-or-later */
(function(){
  var ok=false;
  try{ok=!!(window.CSS&&CSS.supports&&CSS.supports('color','color-mix(in srgb,red,blue)')&&CSS.supports('selector(:has(a))')&&CSS.supports('height','1dvh')&&window.ResizeObserver&&window.MutationObserver&&window.HTMLDialogElement&&[].at);}catch(e){}
  if(!ok)document.documentElement.className+=' unsupported';

  /* rules/04 C6, FE指示書 B1: FE が使う API 名（名前→機能）。check-api-usage.py と互換判定が参照する。 */
  var USED_APIS = {
    'meta/version':'起動・版確認','me':'ログイン状態・設定',
    'auth/start':'端末ログイン開始','auth/poll':'端末ログイン確認','auth/lookup':'承認コード確認','auth/approve':'端末承認',
    'auth/logout':'ログアウト','auth/devices':'信頼端末一覧','auth/device_revoke':'信頼端末失効','auth/trust':'信頼端末登録',
    'projects/list':'プロジェクト一覧','projects/create':'プロジェクト作成','projects/rename':'プロジェクト名変更',
    'projects/delete':'プロジェクト削除','projects/reorder':'並び順','projects/transfer':'所有者移動',
    'share/list':'共有一覧','share/set':'共有設定','share/remove':'共有解除',
    'files/tree':'ファイル一覧','files/read':'ファイル読込','files/write':'ファイル保存','files/create':'ファイル作成',
    'files/mkdir':'フォルダ作成','files/rename':'名前変更','files/delete':'ファイル削除',
    'files/upload_init':'アップロード開始','files/upload_chunk':'アップロード送信','files/upload_done':'アップロード完了',
    'files/raw':'ファイル配信','files/preview_token':'プレビュー','files/zip_prepare':'ZIP準備','files/zip':'ZIP取得','files/search':'検索',
    'history/status':'変更状態','history/commit':'コミット','history/log':'履歴','history/diff':'差分','history/restore':'復元','history/delete':'履歴削除',
    'apps/check_name':'アプリ名確認','apps/list':'アプリ一覧','apps/publish':'公開','apps/update':'公開更新',
    'apps/set_visibility':'公開状態','apps/code_get':'コード表示','apps/code_regen':'コード再生成',
    'apps/viewers_list':'閲覧権一覧','apps/viewers_add':'閲覧権追加','apps/viewers_remove':'閲覧権削除',
    'apps/open':'アプリを開く','apps/gate_verify':'ゲート認証','apps/unpublish':'非公開化',
    'admin/members_list':'部員一覧','admin/members_add':'部員追加','admin/members_update':'部員更新',
    'admin/members_import_csv':'CSV取込','admin/members_delete':'部員削除',
    'admin/devices_list':'端末一覧(管理)','admin/devices_revoke':'端末失効(管理)',
    'admin/settings_get':'設定取得','admin/settings_set':'設定変更',
    'admin/usage':'使用量','admin/projects_list':'プロジェクト一覧(管理)','admin/projects_assign':'孤立割当',
    'admin/apps_list':'アプリ一覧(管理)',
    'admin/announcements_list':'お知らせ一覧','admin/announcements_save':'お知らせ保存','admin/announcements_delete':'お知らせ削除',
    'admin/gc':'GC','admin/audit_list':'監査ログ',
    'members/search':'部員検索',
    'usage/me':'自分の使用量','notices/list':'通知','announcements/list':'お知らせ'
  };

  function feMajor(verStr){
    var s=String(verStr||'').trim();
    var m=s.match(/^(\d+)/); return m?parseInt(m[1],10):null;
  }
  function beMajor(versionData){
    if(!versionData) return null;
    var b=versionData.backend;
    if(b && typeof b.version==='string'){ var m=feMajor(b.version); if(m!=null) return m; }
    if(versionData.api_version!=null) return parseInt(versionData.api_version,10);
    return null;
  }
  function missingApis(versionData){
    var b=versionData&&versionData.backend, apis=b&&b.apis;
    if(!apis || typeof apis!=='object') return [];
    var miss=[];
    Object.keys(USED_APIS).forEach(function(name){ if(!apis[name]) miss.push({name:name, feature:USED_APIS[name]}); });
    return miss;
  }
  function deprecatedUsed(versionData){
    var b=versionData&&versionData.backend, apis=b&&b.apis;
    if(!apis) return [];
    var out=[];
    Object.keys(USED_APIS).forEach(function(name){ var a=apis[name]; if(a&&a.deprecated) out.push({name:name, remove_in:a.remove_in||'', replaced_by:a.replaced_by||''}); });
    return out;
  }
  window.VWCCompat = { USED_APIS:USED_APIS, feMajor:feMajor, beMajor:beMajor, missingApis:missingApis, deprecatedUsed:deprecatedUsed };
})();