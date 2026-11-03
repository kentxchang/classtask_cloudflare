/* ============================================================
 * 14.5 【新增】空間管理：各課程佔用空間可視化／備份／刪除／匯入
 * Cloudflare 免費資料庫以 1GB 為上限，所有圖片與檔案皆以 base64 存於資料庫，
 * 這裡讓教師看到每個課程佔用多少空間，並可在刪除前先下載備份檔，日後再匯入還原。
 * ============================================================ */
var STORAGE_COLORS = ['#7d6650', '#a0613f', '#74865f', '#677a70', '#8a6d76', '#ad977b', '#c98b63', '#8e9f78'];

function fmtBytes(b) {
  b = Number(b) || 0;
  if (b >= 1024 * 1024 * 1024) return (b / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + ' MB';
  if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
  return b + ' B';
}

// 更新讀取遮罩上的進度文字（備份／匯入大量檔案時使用）
function setLoadingText(text) {
  setLoading(true, text);
  var el = document.querySelector('#loading-mask .font-bold');
  if (el) el.textContent = text;
}

var STORAGE_STATS = null;

function openStorageManager() {
  setLoading(true, '計算空間使用量中…');
  api('getStorageStats').then(function (res) {
    setLoading(false);
    if (!res.success) return toast(res.message, 'error');
    STORAGE_STATS = res;
    renderStorageManager();
  }).catch(function (e) { setLoading(false); toast('連線失敗：' + e, 'error'); });
}

function renderStorageManager() {
  var st = STORAGE_STATS;
  var limit = st.limitBytes;
  var used = st.databaseBytes;
  var classSum = st.classes.reduce(function (s, c) { return s + c.totalBytes; }, 0);
  var other = Math.max(0, used - classSum);
  var usedPct = Math.min(100, used / limit * 100);
  var maxClass = Math.max.apply(null, st.classes.map(function (c) { return c.totalBytes; }).concat([1]));

  // 總覽長條：每個課程一段，依佔用比例排列在 1GB 的總長度上
  var segs = st.classes.filter(function (c) { return c.totalBytes > 0; }).map(function (c, i) {
    return '<div title="' + escapeHtml(c.name) + '：' + fmtBytes(c.totalBytes) + '" style="width:' + (c.totalBytes / limit * 100) + '%;background:' + STORAGE_COLORS[i % STORAGE_COLORS.length] + '" class="h-full"></div>';
  }).join('') + (other > 0 ? '<div title="其他：' + fmtBytes(other) + '" style="width:' + (other / limit * 100) + '%" class="h-full bg-slate-300"></div>' : '');

  var rows = st.classes.map(function (c, i) {
    var color = STORAGE_COLORS[i % STORAGE_COLORS.length];
    var fileW = c.fileBytes / maxClass * 100, dataW = c.dataBytes / maxClass * 100;
    var actions = c.exists
      ? '<button onclick="backupClassData(\'' + c.classId + '\')" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100">⬇ 備份</button>' +
        '<button onclick="confirmDeleteClassStorage(\'' + c.classId + '\')" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100">刪除</button>'
      : (c.classId ? '<button onclick="purgeClassLeftovers(\'' + c.classId + '\')" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100">清除殘留</button>' : '');
    return '<div class="py-4 border-b border-slate-100 last:border-0">' +
      '<div class="flex items-center gap-3 flex-wrap">' +
        '<span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:' + color + '"></span>' +
        '<div class="flex-1 min-w-0">' +
          '<div class="font-bold text-slate-700 truncate">' + escapeHtml(c.name) + (c.subject ? '<span class="text-xs text-slate-400 font-normal ml-2">' + escapeHtml(c.subject) + '</span>' : '') + '</div>' +
          '<div class="text-xs text-slate-400 mt-0.5">共 ' + fmtBytes(c.totalBytes) + '（佔 1GB 的 ' + (c.totalBytes / limit * 100).toFixed(2) + '%）・圖片與檔案 ' + c.fileCount + ' 個 ' + fmtBytes(c.fileBytes) + '・文字資料 ' + fmtBytes(c.dataBytes) + '</div>' +
        '</div>' +
        '<div class="flex gap-2">' + actions + '</div>' +
      '</div>' +
      '<div class="mt-2 ml-5 h-2 rounded-full bg-slate-100 overflow-hidden flex">' +
        '<div class="h-full" style="width:' + fileW + '%;background:' + color + '"></div>' +
        '<div class="h-full bg-orange-200" style="width:' + dataW + '%"></div>' +
      '</div>' +
    '</div>';
  }).join('');

  openModal(
    '<div class="text-lg font-bold mb-1">💾 資料庫空間管理</div>' +
    '<div class="text-xs text-slate-400 mb-5">所有上傳的圖片、PDF 頁面與分享檔案皆以 base64 文字存放於 Cloudflare 資料庫，免費方案以 1GB 為上限。刪除課程前可先下載備份檔，日後可再匯入還原。</div>' +
    '<div class="card p-5 mb-5">' +
      '<div class="flex items-end justify-between mb-2 flex-wrap gap-2">' +
        '<div><span class="text-2xl font-bold text-slate-700">' + fmtBytes(used) + '</span><span class="text-sm text-slate-400"> / 1 GB</span></div>' +
        '<div class="text-sm font-bold ' + (usedPct > 85 ? 'text-red-600' : 'text-slate-500') + '">已使用 ' + usedPct.toFixed(1) + '%</div>' +
      '</div>' +
      '<div class="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex">' + segs + '</div>' +
      '<div class="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-slate-400">' +
        '<span>課程合計 ' + fmtBytes(classSum) + '</span>' +
        '<span>其他（學生名單、索引與系統資料）' + fmtBytes(other) + '</span>' +
        '<span>剩餘 ' + fmtBytes(Math.max(0, limit - used)) + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="flex flex-wrap gap-2 mb-3">' +
      '<label class="px-4 py-2 rounded-xl btn-primary text-sm cursor-pointer">⬆ 匯入備份檔<input type="file" accept=".json,application/json" class="hidden" onchange="importClassBackup(this.files[0]); this.value=\'\';"></label>' +
      (st.orphanCount > 0 ? '<button onclick="cleanupOrphanFilesConfirm()" class="px-4 py-2 rounded-xl text-sm font-bold bg-white shadow text-slate-600 hover:bg-slate-50">🧹 清理未使用的檔案（' + st.orphanCount + ' 個，' + fmtBytes(st.orphanBytes) + '）</button>' : '') +
      '<button onclick="openStorageManager()" class="px-4 py-2 rounded-xl text-sm font-bold bg-white shadow text-slate-600 hover:bg-slate-50">↻ 重新計算</button>' +
    '</div>' +
    '<div class="flex items-center gap-4 text-xs text-slate-400 mb-1"><span class="flex items-center gap-1"><span class="w-3 h-2 rounded-sm bg-blue-600"></span>圖片與檔案</span><span class="flex items-center gap-1"><span class="w-3 h-2 rounded-sm bg-orange-200"></span>文字資料</span><span>（長條以佔用最多的課程為基準）</span></div>' +
    '<div class="card px-5">' + (rows || '<div class="text-slate-400 text-center py-8">目前尚無課程資料</div>') + '</div>',
    { wide: true }
  );
}

function refreshAfterStorageChange(classId) {
  if (classId) { delete CLASS_CACHE[classId]; delete STUDENTS_TAB_CACHE[classId]; delete GRADING_CACHE[classId]; delete GALLERY_MGMT_CACHE[classId]; }
  if (STATE.view === 'teacherDashboard' && !STATE.currentClass) render();
  openStorageManager();
}

// 下載課程備份檔：先取得文字資料，再逐一取得每個檔案的 base64，於瀏覽器組成單一 JSON 檔下載
function backupClassData(classId) {
  setLoadingText('正在讀取課程資料…');
  return api('exportClassMeta', classId).then(function (res) {
    if (!res.success) throw new Error(res.message);
    var meta = res.data;
    var list = meta.fileList || [];
    delete meta.fileList;
    var head = JSON.stringify(meta);
    var parts = [head.slice(0, -1) + ',"files":['];
    function next(i) {
      if (i >= list.length) return Promise.resolve();
      setLoadingText('正在備份檔案 ' + (i + 1) + ' / ' + list.length + '…');
      return api('exportFile', list[i].id).then(function (fr) {
        if (!fr.success) throw new Error(fr.message);
        parts.push((i > 0 ? ',' : '') + JSON.stringify(fr.data));
        return next(i + 1);
      });
    }
    return next(0).then(function () {
      parts.push(']}');
      var blob = new Blob(parts, { type: 'application/json' });
      var a = document.createElement('a');
      var d = new Date();
      var stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '_' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
      a.href = URL.createObjectURL(blob);
      a.download = '課程備份_' + String(meta.class.name || '').replace(/[\\/:*?"<>|]/g, '_') + '_' + stamp + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
      setLoading(false);
      toast('備份檔已下載（' + fmtBytes(blob.size) + '）', 'success');
      return true;
    });
  }).catch(function (e) {
    setLoading(false);
    toast('備份失敗：' + (e && e.message ? e.message : e), 'error');
    return false;
  });
}

function confirmDeleteClassStorage(classId) {
  var c = (STORAGE_STATS.classes || []).find(function (x) { return x.classId === classId; });
  if (!c) return;
  openModal(
    '<div class="text-lg font-bold mb-2 pr-8">刪除課程「' + escapeHtml(c.name) + '」</div>' +
    '<div class="text-sm text-slate-500 mb-5 leading-relaxed">將永久刪除此課程的分類、任務、題庫、學生繳交作品、畫記與所有圖片檔案，共釋放約 <b>' + fmtBytes(c.totalBytes) + '</b>。學生總名單本身不受影響。<br>建議先下載備份檔，日後可透過「匯入備份檔」還原。</div>' +
    '<div class="flex flex-col gap-2">' +
      '<button onclick="deleteClassStorage(\'' + classId + '\', true)" class="w-full py-3 rounded-xl btn-primary">⬇ 先備份，再刪除</button>' +
      '<button onclick="deleteClassStorage(\'' + classId + '\', false)" class="w-full py-3 rounded-xl bg-red-50 text-red-600 font-bold hover:bg-red-100">不備份，直接刪除</button>' +
      '<button onclick="renderStorageManager()" class="w-full py-3 rounded-xl bg-slate-100 font-bold hover:bg-slate-200">取消</button>' +
    '</div>',
    { closable: false }
  );
}

function deleteClassStorage(classId, withBackup) {
  var step = withBackup ? backupClassData(classId) : Promise.resolve(true);
  step.then(function (ok) {
    if (!ok) return renderStorageManager(); // 備份失敗時不刪除
    setLoadingText('刪除中…');
    return api('deleteClassWithFiles', classId).then(function (res) {
      setLoading(false);
      if (!res.success) return toast(res.message, 'error');
      toast(res.message, 'success');
      refreshAfterStorageChange(classId);
    });
  }).catch(function (e) { setLoading(false); toast('' + e, 'error'); });
}

function purgeClassLeftovers(classId) {
  confirmDialog('此課程已不存在，確定要清除它殘留的資料與檔案嗎？', '清除').then(function (ok) {
    if (!ok) return renderStorageManager();
    setLoading(true, '清除中…');
    api('deleteClassWithFiles', classId).then(function (res) {
      setLoading(false);
      toast(res.message, res.success ? 'success' : 'error');
      refreshAfterStorageChange(classId);
    });
  });
}

function cleanupOrphanFilesConfirm() {
  confirmDialog('將刪除所有「沒有被任何任務或繳交作品使用」的圖片與檔案（例如重新上傳 PDF 後被取代的舊頁面）。確定要清理嗎？', '開始清理').then(function (ok) {
    if (!ok) return renderStorageManager();
    setLoading(true, '清理中…');
    api('cleanupOrphanFiles').then(function (res) {
      setLoading(false);
      toast(res.message, res.success ? 'success' : 'error');
      refreshAfterStorageChange(null);
    });
  });
}

// 匯入備份檔：先還原文字資料，再逐一寫回檔案
function importClassBackup(file) {
  if (!file) return;
  setLoadingText('讀取備份檔中…');
  file.text().then(function (text) {
    var backup;
    try { backup = JSON.parse(text); } catch (e) { throw new Error('備份檔不是有效的 JSON 檔案'); }
    if (!backup || backup.format !== 'classroom-task-backup') throw new Error('這不是本平台的課程備份檔');
    var files = backup.files || [];
    delete backup.files;
    setLoadingText('正在還原課程資料…');
    return api('importClassMeta', backup).then(function (res) {
      if (!res.success) throw new Error(res.message);
      function next(i) {
        if (i >= files.length) return Promise.resolve();
        setLoadingText('正在還原檔案 ' + (i + 1) + ' / ' + files.length + '…');
        return api('importFile', files[i]).then(function (fr) {
          if (!fr.success) throw new Error('第 ' + (i + 1) + ' 個檔案還原失敗：' + fr.message);
          return next(i + 1);
        });
      }
      return next(0).then(function () {
        setLoading(false);
        toast(res.message + (files.length ? '（含 ' + files.length + ' 個檔案）' : ''), 'success');
        refreshAfterStorageChange(backup.class.id);
      });
    });
  }).catch(function (e) {
    setLoading(false);
    toast('匯入失敗：' + (e && e.message ? e.message : e), 'error');
  });
}
