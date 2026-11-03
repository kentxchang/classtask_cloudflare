/* ============================================================
 * 15. 應用程式啟動
 * ============================================================ */
function bootstrapApp() {
  if (INIT_JOIN_CODE) STATE.view = 'studentLogin';
  render();
  if (INIT_GALLERY_TASK_ID) openSharedGalleryTask(INIT_GALLERY_TASK_ID);
  // landing 頁已透過 getLandingBundle 一併取得 webAppUrl，這裡只在非首頁進入時才需要單獨補抓
  if (STATE.view !== 'landing') {
    api('getWebAppUrl').then(function (url) { STATE.webAppUrl = url || ''; }).catch(function () {});
  }
}
bootstrapApp();
