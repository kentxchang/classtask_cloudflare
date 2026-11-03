/* ---- 13.6 PDF 電子書／講義閱讀器（頁面已於上傳時轉為圖片，比照參考書櫃程式的劃線筆記作法） ----
 * 預設為「唯讀閱讀模式」，不會攔截手指／觸控操作，避免翻頁滑動時誤畫線；
 * 需要畫記時，學生需先點「✏️ 開始畫記」手動開啟畫筆工具列。另提供「⛶ 全螢幕閱讀」，
 * 隱藏多餘留白、讓頁面盡可能佔滿螢幕，適合單純閱讀教材時使用。 */
var PDFR = { taskId: null, studentId: null, pageFileIds: [], page: 0, total: 0, tool: 'pen', color: '#f97316', strokes: {}, saveTimers: {}, drawing: false, curPath: null, annotateMode: false, fullscreen: false, locked: false, status: null, comment: '' };

function openPdfTask(t) {
  var pageFileIds = t.config.pageFileIds || [];
  if (pageFileIds.length === 0) return toast('此 PDF 教材尚無頁面資料', 'error');
  setLoading(true, '載入教材中…');
  var loadAnnotations = PREVIEW_MODE ? Promise.resolve({ success: true, data: {} }) : api('getAnnotations', t.id, STATE.student.studentId);
  loadAnnotations.then(function (res) {
    setLoading(false);
    PDFR = {
      taskId: t.id, title: t.title, studentId: STATE.student.studentId, pageFileIds: pageFileIds, page: 0, total: pageFileIds.length,
      tool: 'pen', color: '#f97316', strokes: {}, saveTimers: {}, drawing: false, curPath: null, annotateMode: false, fullscreen: false,
      locked: !PREVIEW_MODE && t.status === '已完成', status: t.status, comment: t.comment, score: t.score, level: t.level
    };
    var annoData = res.success ? res.data : {};
    Object.keys(annoData).forEach(function (p) { try { PDFR.strokes[p] = JSON.parse(annoData[p]); } catch (e) {} });
    renderPdfReaderModal();
    // 第一頁一開啟就顯示了，其餘頁面接著在背景依序預載進瀏覽器快取，
    // 之後翻頁時圖片幾乎都已經快取好，不用等到「點下一頁」才開始下載。
    preloadPdfPagesInBackground(t.id, pageFileIds, 1);
  });
}

// 背景預載 PDF 頁面圖片：用 Image() 物件觸發瀏覽器下載並快取，不影響畫面顯示。
// 同時最多開 3 個並行下載，依序把 startIdx 之後所有頁面都預先載入；
// 若使用者已離開這個任務（開了別的 PDF 或關閉閱讀器），PDFR.taskId 會改變，預載迴圈就會自動停止。
function preloadPdfPagesInBackground(taskId, pageFileIds, startIdx) {
  var idx = startIdx;
  var concurrency = 3;
  function loadNext() {
    if (PDFR.taskId !== taskId) return; // 使用者已切換到別的任務，停止預載
    if (idx >= pageFileIds.length) return;
    var myIdx = idx++;
    var img = new Image();
    img.onload = img.onerror = loadNext;
    img.src = '/f/' + pageFileIds[myIdx];
  }
  for (var i = 0; i < concurrency; i++) loadNext();
}

function pdfDrawingToolbarHtml(compact) {
  return '<div class="flex flex-wrap items-center gap-2' + (compact ? '' : ' mb-2') + '">' +
    '<button onclick="setPdfTool(\'pen\')" id="pt-pen" class="px-3 py-1.5 rounded-lg font-bold text-sm ' + (PDFR.tool === 'pen' ? 'bg-blue-600 text-white' : 'bg-slate-100') + '">🖊 畫筆</button>' +
    '<button onclick="setPdfTool(\'highlighter\')" id="pt-highlighter" class="px-3 py-1.5 rounded-lg font-bold text-sm ' + (PDFR.tool === 'highlighter' ? 'bg-blue-600 text-white' : 'bg-slate-100') + '">🖍 螢光筆</button>' +
    '<button onclick="setPdfTool(\'eraser\')" id="pt-eraser" class="px-3 py-1.5 rounded-lg font-bold text-sm ' + (PDFR.tool === 'eraser' ? 'bg-blue-600 text-white' : 'bg-slate-100') + '">🧽 擦除</button>' +
    ['#f97316', '#ef4444', '#2563eb', '#16a34a', '#000000'].map(function (c) { return '<button onclick="setPdfColor(\'' + c + '\')" style="background:' + c + '" class="w-7 h-7 rounded-full border-2 border-slate-200"></button>'; }).join('') +
    '<button onclick="pdfClearPage()" class="px-3 py-1.5 rounded-lg font-bold text-sm bg-red-50 text-red-500">清除本頁</button>' +
    '<span id="pdf-save-status" class="text-xs text-slate-400' + (compact ? '' : ' ml-auto') + '">已同步</span>' +
  '</div>';
}

// pdf-page-img／pdf-overlay 這一對元素共用同一個「緊貼圖片大小」的 relative 容器（inline-block，
// 寬高由圖片本身撐開），canvas 的 absolute top-0 left-0 才能精準疊在圖片正上方，不受外層置中影響。
function pdfImageWithOverlayHtml(imgStyle) {
  return '<div class="relative inline-block">' +
    '<img id="pdf-page-img" class="block select-none" draggable="false" style="' + imgStyle + '">' +
    '<canvas id="pdf-overlay" class="absolute top-0 left-0" style="pointer-events:' + (PDFR.annotateMode ? 'auto' : 'none') + '"></canvas>' +
  '</div>';
}

// 獨立成可重複呼叫的函式：確認視窗（confirmDialog）、切換畫記／全螢幕模式都會整個
// 重新產生 modal 內容，因此每次狀態改變後都要重新呼叫本函式，才能回到閱讀器畫面。
function renderPdfReaderModal() {
  if (PDFR.fullscreen) renderPdfReaderFullscreen(); else renderPdfReaderWindowed();
  initPdfOverlayEvents();
  renderPdfPage(PDFR.page);
}

function renderPdfReaderWindowed() {
  var toolbarHtml =
    '<div class="flex items-center justify-between gap-2 mb-2 flex-wrap">' +
      '<div class="text-lg font-black truncate pr-2">' + escapeHtml(PDFR.title) + '</div>' +
      '<div class="flex items-center gap-2 flex-wrap flex-shrink-0">' +
        '<button onclick="togglePdfAnnotate()" id="pdf-annotate-toggle" class="px-3 py-1.5 rounded-lg font-bold text-sm ' + (PDFR.annotateMode ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600') + '">' + (PDFR.annotateMode ? '🔒 結束畫記' : '✏️ 開始畫記') + '</button>' +
        '<button onclick="togglePdfFullscreen()" class="px-3 py-1.5 rounded-lg font-bold text-sm bg-slate-100 text-slate-600">⛶ 全螢幕閱讀</button>' +
      '</div>' +
    '</div>' +
    (PREVIEW_MODE ? previewBannerHtml() : '') +
    (PDFR.annotateMode ? pdfDrawingToolbarHtml(false) : '<div class="text-xs text-slate-400 mb-2">🔒 目前為唯讀閱讀模式，不會誤觸畫線；需要畫記或劃重點時請點「✏️ 開始畫記」。</div>');

  var pageAreaHtml =
    '<div class="relative border-2 border-blue-100 rounded-xl overflow-hidden bg-slate-50 flex justify-center items-center" style="touch-action:none;">' +
      pdfImageWithOverlayHtml('max-width:100%;') +
    '</div>';

  var navHtml =
    '<div class="flex items-center justify-between mt-3 mb-1">' +
      '<button onclick="pdfPrevPage()" class="px-4 py-2 rounded-xl bg-slate-100 font-bold">‹ 上一頁</button>' +
      '<div class="font-bold text-slate-500" id="pdf-page-indicator">頁 ' + (PDFR.page + 1) + ' / ' + PDFR.total + '</div>' +
      '<button onclick="pdfNextPage()" class="px-4 py-2 rounded-xl bg-slate-100 font-bold">下一頁 ›</button>' +
    '</div>';

  var completeBtnHtml = PDFR.locked
    ? '<div class="text-center text-sm font-bold text-green-600 bg-green-50 rounded-xl py-3 mt-2">✅ 已標記完成（教師已批改，無法再修改送出）</div>'
    : '<button onclick="markLinkOrPdfComplete(\'' + PDFR.taskId + '\',\'PDF\')" class="w-full py-3 rounded-xl btn-accent text-lg mt-2">✅ 標記已完成閱讀</button>';

  openModal('<div class="text-2xl mb-1">📄</div>' + toolbarHtml + pageAreaHtml + navHtml + completeBtnHtml + teacherCommentHtml(PDFR), { wide: true });
}

// 全螢幕閱讀：不顯示標題，所有控制項改為浮動在頁面上／下方的懸浮工具列（不佔版面），
// 讓 PDF 頁面本身能盡可能放到最大。
function renderPdfReaderFullscreen() {
  var topBarHtml =
    '<div class="absolute top-3 left-3 z-20 flex flex-wrap items-center gap-2 bg-white/90 backdrop-blur rounded-xl shadow-lg px-3 py-2" style="max-width:calc(100% - 4rem);">' +
      '<button onclick="togglePdfFullscreen()" class="px-3 py-1.5 rounded-lg font-bold text-sm bg-slate-100 text-slate-600 whitespace-nowrap">↙ 退出全螢幕</button>' +
      '<button onclick="togglePdfAnnotate()" id="pdf-annotate-toggle" class="px-3 py-1.5 rounded-lg font-bold text-sm whitespace-nowrap ' + (PDFR.annotateMode ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600') + '">' + (PDFR.annotateMode ? '🔒 結束畫記' : '✏️ 開始畫記') + '</button>' +
      (PDFR.annotateMode ? pdfDrawingToolbarHtml(true) : '') +
    '</div>';

  var bottomBarHtml =
    '<div class="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center justify-center gap-2 bg-white/90 backdrop-blur rounded-xl shadow-lg px-3 py-2" style="max-width:95vw;">' +
      '<button onclick="pdfPrevPage()" class="px-4 py-2 rounded-xl bg-slate-100 font-bold">‹ 上一頁</button>' +
      '<div class="font-bold text-slate-500 px-1 whitespace-nowrap" id="pdf-page-indicator">頁 ' + (PDFR.page + 1) + ' / ' + PDFR.total + '</div>' +
      '<button onclick="pdfNextPage()" class="px-4 py-2 rounded-xl bg-slate-100 font-bold">下一頁 ›</button>' +
      (PDFR.locked
        ? '<span class="px-4 py-2 rounded-xl bg-green-50 text-green-600 font-bold whitespace-nowrap">✅ 已完成</span>'
        : '<button onclick="markLinkOrPdfComplete(\'' + PDFR.taskId + '\',\'PDF\')" class="px-4 py-2 rounded-xl btn-accent font-bold whitespace-nowrap">✅ 標記已完成閱讀</button>') +
    '</div>';

  openModal(
    '<div class="relative h-full w-full bg-slate-900 flex items-center justify-center overflow-hidden">' +
      (PREVIEW_MODE ? '<div class="absolute top-3 left-1/2 -translate-x-1/2 z-20 max-w-[80vw]">' + previewBannerHtml() + '</div>' : '') +
      pdfImageWithOverlayHtml('max-width:100vw;max-height:100vh;width:auto;height:auto;') +
      topBarHtml + bottomBarHtml +
    '</div>',
    { fullscreen: true }
  );
}

function togglePdfAnnotate() {
  PDFR.annotateMode = !PDFR.annotateMode;
  renderPdfReaderModal();
}

function togglePdfFullscreen() {
  PDFR.fullscreen = !PDFR.fullscreen;
  renderPdfReaderModal();
}

function renderPdfPage(idx) {
  flushPdfSave(PDFR.page);
  PDFR.page = idx;
  document.getElementById('pdf-page-indicator').textContent = '頁 ' + (idx + 1) + ' / ' + PDFR.total;
  var img = document.getElementById('pdf-page-img');
  img.onload = function () { syncPdfOverlaySize(); redrawPdfOverlay(); };
  img.src = '/f/' + PDFR.pageFileIds[idx];
}

function syncPdfOverlaySize() {
  var img = document.getElementById('pdf-page-img');
  var canvas = document.getElementById('pdf-overlay');
  if (!img || !canvas) return;
  canvas.width = img.offsetWidth || img.clientWidth || 800;
  canvas.height = img.offsetHeight || img.clientHeight || 1100;
}

function redrawPdfOverlay() {
  var canvas = document.getElementById('pdf-overlay');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  var paths = PDFR.strokes[PDFR.page] || [];
  paths.forEach(function (p) { renderPdfPath(ctx, canvas.width, canvas.height, p); });
}

function renderPdfPath(ctx, width, height, path) {
  if (!path.points || path.points.length < 1) return;
  ctx.save();
  if (path.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = path.relWidth * width;
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = path.color;
    ctx.globalAlpha = path.tool === 'highlighter' ? 0.4 : 1;
    ctx.lineWidth = Math.max(2, path.relWidth * width);
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  path.points.forEach(function (p, i) {
    var x = p.x * width, y = p.y * height;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.restore();
}

function pdfRelWidthForTool(tool) {
  if (tool === 'highlighter') return 0.02;
  if (tool === 'eraser') return 0.035;
  return 0.006;
}

function initPdfOverlayEvents() {
  var canvas = document.getElementById('pdf-overlay');
  if (!canvas) return;
  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId);
    PDFR.drawing = true;
    var rect = canvas.getBoundingClientRect();
    var relWidth = pdfRelWidthForTool(PDFR.tool);
    PDFR.curPath = { tool: PDFR.tool, color: PDFR.color, relWidth: relWidth, points: [{ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }] };
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!PDFR.drawing || !PDFR.curPath) return;
    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left, y = e.clientY - rect.top;
    PDFR.curPath.points.push({ x: x / rect.width, y: y / rect.height });
    // 即時預覽：先重繪已存的畫記，再把「目前這一筆」以單一完整路徑整條畫上去（與
    // redrawPdfOverlay 最終呈現用的是同一個 renderPdfPath 函式），確保畫記過程中看到的
    // 透明度與畫完儲存後重新顯示的透明度完全一致，不會因逐段疊加而越畫越不透明。
    redrawPdfOverlay();
    renderPdfPath(canvas.getContext('2d'), canvas.width, canvas.height, PDFR.curPath);
  });
  function finishStroke() {
    if (!PDFR.drawing || !PDFR.curPath) return;
    PDFR.drawing = false;
    if (PDFR.curPath.points.length > 1) {
      var pageIdx = PDFR.page;
      if (!PDFR.strokes[pageIdx]) PDFR.strokes[pageIdx] = [];
      PDFR.strokes[pageIdx].push(PDFR.curPath);
      triggerPdfAutoSave(pageIdx);
    }
    PDFR.curPath = null;
    redrawPdfOverlay();
  }
  canvas.addEventListener('pointerup', finishStroke);
  canvas.addEventListener('pointerleave', finishStroke);
}

function setPdfTool(tool) {
  PDFR.tool = tool;
  ['pen', 'highlighter', 'eraser'].forEach(function (t) {
    var el = document.getElementById('pt-' + t);
    if (el) el.className = 'px-3 py-1.5 rounded-lg font-bold text-sm ' + (t === tool ? 'bg-blue-600 text-white' : 'bg-slate-100');
  });
}
function setPdfColor(c) { PDFR.color = c; }

function pdfClearPage() {
  confirmDialog('確定要清除本頁所有畫記嗎？').then(function (ok) {
    if (ok) {
      var pageIdx = PDFR.page;
      PDFR.strokes[pageIdx] = [];
      triggerPdfAutoSave(pageIdx, true);
    }
    // confirmDialog 會整個取代 modal 內容，因此無論確認或取消，都要重新畫出閱讀器
    // 才能回到原本頁面，而不是讓確認框關閉後整層直接消失
    renderPdfReaderModal();
  });
}

// 防抖自動儲存（每個頁碼各自獨立計時，避免切頁時互相覆蓋或遺失尚未儲存的畫記）
function triggerPdfAutoSave(pageIdx, immediate) {
  var status = document.getElementById('pdf-save-status');
  if (status) status.textContent = PREVIEW_MODE ? '預覽模式（不會儲存）' : '儲存中…';
  if (PREVIEW_MODE) return;
  if (PDFR.saveTimers[pageIdx]) clearTimeout(PDFR.saveTimers[pageIdx]);
  var doSave = function () {
    delete PDFR.saveTimers[pageIdx];
    var dataJson = JSON.stringify(PDFR.strokes[pageIdx] || []);
    api('saveAnnotation', { taskId: PDFR.taskId, studentId: PDFR.studentId, page: pageIdx, dataJson: dataJson }).then(function () {
      var st = document.getElementById('pdf-save-status'); if (st) st.textContent = '已同步';
    });
  };
  if (immediate) doSave(); else PDFR.saveTimers[pageIdx] = setTimeout(doSave, 1200);
}

// 離開頁面前，強制立即送出該頁尚未儲存的變更
function flushPdfSave(pageIdx) {
  if (PREVIEW_MODE) return;
  if (PDFR.saveTimers[pageIdx]) {
    clearTimeout(PDFR.saveTimers[pageIdx]);
    delete PDFR.saveTimers[pageIdx];
    var dataJson = JSON.stringify(PDFR.strokes[pageIdx] || []);
    api('saveAnnotation', { taskId: PDFR.taskId, studentId: PDFR.studentId, page: pageIdx, dataJson: dataJson });
  }
}

function pdfPrevPage() { if (PDFR.page > 0) renderPdfPage(PDFR.page - 1); }
function pdfNextPage() { if (PDFR.page < PDFR.total - 1) renderPdfPage(PDFR.page + 1); }
