/* ---- 13.3 觸控手繪／心智圖繪圖板（Apple Pencil 最佳化，教師可設定背景圖） ---- */
var DRAW = { ctx: null, canvas: null, drawing: false, tool: 'pen', color: '#1e3a8a', size: 4, undoStack: [], lastPt: null, bgImage: null };
var DRAW_COLORS = ['#1e3a8a', '#2563eb', '#f97316', '#ef4444', '#16a34a', '#000000', '#ffffff'];

function openDrawingTask(t) {
  if (!PREVIEW_MODE && t.status === '已完成') return openReadOnlySubmissionTask(t, '✏️');
  var bgFileId = t.config.backgroundImageFileId;
  var launch = function (bgDataUrl) {
    openModal(
      '<div class="text-2xl mb-2">✏️</div>' +
      (PREVIEW_MODE ? previewBannerHtml() : '') +
      '<div class="text-lg font-black mb-1">' + escapeHtml(t.title) + '</div>' +
      (!PREVIEW_MODE ? teacherCommentHtml(t) : '') +
      (t.config.prompt ? '<p class="text-slate-500 text-sm mb-3 mt-2">' + escapeHtml(t.config.prompt) + '</p>' : '') +
      '<div class="flex flex-wrap items-center gap-2 mb-2">' +
        '<button onclick="setDrawTool(\'pen\')" id="dt-pen" class="px-3 py-1.5 rounded-lg font-bold text-sm bg-blue-600 text-white">🖊 畫筆</button>' +
        '<button onclick="setDrawTool(\'eraser\')" id="dt-eraser" class="px-3 py-1.5 rounded-lg font-bold text-sm bg-slate-100">🧽 橡皮擦</button>' +
        '<button onclick="setDrawTool(\'line\')" id="dt-line" class="px-3 py-1.5 rounded-lg font-bold text-sm bg-slate-100">📏 直線</button>' +
        '<button onclick="setDrawTool(\'rect\')" id="dt-rect" class="px-3 py-1.5 rounded-lg font-bold text-sm bg-slate-100">▭ 矩形</button>' +
        '<button onclick="setDrawTool(\'circle\')" id="dt-circle" class="px-3 py-1.5 rounded-lg font-bold text-sm bg-slate-100">◯ 圓形</button>' +
        '<button onclick="setDrawTool(\'text\')" id="dt-text" class="px-3 py-1.5 rounded-lg font-bold text-sm bg-slate-100">🔤 文字</button>' +
        '<button onclick="drawUndo()" class="px-3 py-1.5 rounded-lg font-bold text-sm bg-slate-100">↩ 復原</button>' +
        '<button onclick="drawClear()" class="px-3 py-1.5 rounded-lg font-bold text-sm bg-red-50 text-red-500">🗑 清除</button>' +
        '<button onclick="submitDrawing(\'' + t.id + '\')" class="ml-auto px-5 py-1.5 rounded-xl btn-primary font-bold text-sm whitespace-nowrap">✅ 完成並送出作品</button>' +
      '</div>' +
      '<div class="flex items-center gap-2 mb-3 flex-wrap">' +
        DRAW_COLORS.map(function (c) { return '<button onclick="setDrawColor(\'' + c + '\')" style="background:' + c + '" class="w-7 h-7 rounded-full border-2 border-slate-200"></button>'; }).join('') +
        '<input type="color" onchange="setDrawColor(this.value)" class="w-7 h-7 rounded-full border-0 p-0">' +
        '<input type="range" min="1" max="24" value="4" oninput="DRAW.size=Number(this.value)" class="ml-2 w-24">' +
      '</div>' +
      '<div class="drawing-canvas-wrap border-2 border-blue-100 rounded-xl overflow-hidden bg-white"><canvas id="draw-canvas" width="900" height="600" class="w-full touch-none"></canvas></div>',
      { wide: true }
    );
    setTimeout(function () { initDrawCanvas(bgDataUrl); }, 30);
  };
  if (bgFileId) {
    setLoading(true, '載入背景圖中…');
    api('getFileBase64', bgFileId).then(function (res) {
      setLoading(false);
      launch(res.success ? res.base64 : null);
    });
  } else {
    launch(null);
  }
}

// 繪圖任務「插入文字」專用的輸入框：獨立於 #modal-root 之外的浮動圖層（比照作品藝廊小圖放大
// openImageLightbox 的作法），疊在繪圖任務視窗之上，輸入完成或取消都只會移除這一層，
// 不會動到底下的繪圖任務視窗與畫布內容。
function drawTextPromptOverlay() {
  return new Promise(function (resolve) {
    closeDrawTextPromptOverlay();
    var el = document.createElement('div');
    el.id = 'draw-text-prompt-root';
    el.className = 'fixed inset-0 z-[970] bg-black/40 flex items-center justify-center p-4 fade-in';
    el.innerHTML =
      '<div class="card w-full max-w-sm p-5">' +
        '<div class="text-lg font-bold mb-3">輸入文字內容</div>' +
        '<input id="draw-text-input" class="w-full border-2 border-blue-100 focus:border-blue-400 outline-none rounded-xl px-4 py-2.5 mb-4" placeholder="請輸入文字">' +
        '<div class="flex justify-end gap-3">' +
          '<button id="draw-text-cancel" class="px-5 py-2 rounded-xl bg-slate-100 font-bold hover:bg-slate-200">取消</button>' +
          '<button id="draw-text-ok" class="px-5 py-2 rounded-xl btn-primary">確定</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    var input = document.getElementById('draw-text-input');
    input.focus();
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') document.getElementById('draw-text-ok').click(); });
    document.getElementById('draw-text-cancel').onclick = function () { closeDrawTextPromptOverlay(); resolve(null); };
    document.getElementById('draw-text-ok').onclick = function () {
      var v = input.value.trim();
      closeDrawTextPromptOverlay();
      resolve(v || null);
    };
  });
}

function closeDrawTextPromptOverlay() {
  var el = document.getElementById('draw-text-prompt-root');
  if (el) el.remove();
}

// 若任務設有背景圖，將其等比例置中繪製於畫布上（教師上傳的學習單／待標註圖片），學生在其上作畫
function drawBackgroundFill() {
  DRAW.ctx.fillStyle = '#ffffff';
  DRAW.ctx.fillRect(0, 0, DRAW.canvas.width, DRAW.canvas.height);
  if (DRAW.bgImage) {
    var scale = Math.min(DRAW.canvas.width / DRAW.bgImage.width, DRAW.canvas.height / DRAW.bgImage.height);
    var w = DRAW.bgImage.width * scale, h = DRAW.bgImage.height * scale;
    var x = (DRAW.canvas.width - w) / 2, y = (DRAW.canvas.height - h) / 2;
    DRAW.ctx.drawImage(DRAW.bgImage, x, y, w, h);
  }
}

function initDrawCanvas(bgDataUrl) {
  var canvas = document.getElementById('draw-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  DRAW = { ctx: ctx, canvas: canvas, drawing: false, tool: 'pen', color: '#1e3a8a', size: 4, undoStack: [], lastPt: null, bgImage: null };

  function finishInit() {
    drawBackgroundFill();
    saveDrawSnapshot();
    attachCanvasEvents();
  }

  function attachCanvasEvents() {
    function getPos(e) {
      var rect = canvas.getBoundingClientRect();
      var scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
      return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY, pressure: e.pressure && e.pressure > 0 ? e.pressure : 0.5 };
    }

    canvas.addEventListener('pointerdown', function (e) {
      canvas.setPointerCapture(e.pointerId);
      var p = getPos(e);
      if (DRAW.tool === 'text') {
        // 注意：這裡不能用共用的 promptDialog()，因為它是透過 openModal() 整個覆蓋 #modal-root，
        // 會把目前這個繪圖任務視窗（本身也是渲染在 #modal-root 裡）一起蓋掉，畫布跟著從畫面上消失；
        // 關閉輸入框時又會把 #modal-root 清空，整個任務圖層就跟著關閉了。改用獨立浮動圖層即可修正。
        drawTextPromptOverlay().then(function (txt) {
          if (!txt) return;
          DRAW.ctx.globalCompositeOperation = 'source-over';
          DRAW.ctx.fillStyle = DRAW.color; DRAW.ctx.font = (DRAW.size * 6) + 'px "Noto Sans TC"';
          DRAW.ctx.fillText(txt, p.x, p.y);
          saveDrawSnapshot();
        });
        return;
      }
      DRAW.drawing = true; DRAW.startPt = p; DRAW.lastPt = p;
      if (DRAW.tool === 'pen' || DRAW.tool === 'eraser') { DRAW.ctx.beginPath(); DRAW.ctx.moveTo(p.x, p.y); }
      else { DRAW.ctx.globalCompositeOperation = 'source-over'; DRAW.snapshotBeforeShape = canvas.toDataURL(); }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!DRAW.drawing) return;
      var p = getPos(e);
      if (DRAW.tool === 'pen' || DRAW.tool === 'eraser') {
        // 橡皮擦使用 destination-out 挖除已畫內容（含背景圖），而非疊塗白色色塊
        DRAW.ctx.globalCompositeOperation = DRAW.tool === 'eraser' ? 'destination-out' : 'source-over';
        DRAW.ctx.strokeStyle = DRAW.color;
        DRAW.ctx.lineWidth = DRAW.size * (DRAW.tool === 'eraser' ? 3 : p.pressure * 1.6);
        DRAW.ctx.lineCap = 'round'; DRAW.ctx.lineJoin = 'round';
        DRAW.ctx.lineTo(p.x, p.y); DRAW.ctx.stroke();
        DRAW.lastPt = p;
      } else {
        restoreSnapshot(DRAW.snapshotBeforeShape, function () { drawShapePreview(DRAW.startPt, p); });
      }
    });
    canvas.addEventListener('pointerup', function () { if (DRAW.drawing) { DRAW.drawing = false; DRAW.ctx.globalCompositeOperation = 'source-over'; saveDrawSnapshot(); } });
    canvas.addEventListener('pointerleave', function () { if (DRAW.drawing) { DRAW.drawing = false; DRAW.ctx.globalCompositeOperation = 'source-over'; saveDrawSnapshot(); } });
  }

  if (bgDataUrl) {
    var img = new Image();
    img.onload = function () { DRAW.bgImage = img; finishInit(); };
    img.onerror = finishInit;
    img.src = bgDataUrl;
  } else {
    finishInit();
  }
}

function drawShapePreview(start, end) {
  var ctx = DRAW.ctx;
  ctx.strokeStyle = DRAW.color; ctx.lineWidth = DRAW.size; ctx.lineCap = 'round';
  ctx.beginPath();
  if (DRAW.tool === 'line') { ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); }
  else if (DRAW.tool === 'rect') { ctx.rect(Math.min(start.x, end.x), Math.min(start.y, end.y), Math.abs(end.x - start.x), Math.abs(end.y - start.y)); }
  else if (DRAW.tool === 'circle') { var r = Math.hypot(end.x - start.x, end.y - start.y); ctx.arc(start.x, start.y, r, 0, Math.PI * 2); }
  ctx.stroke();
}

function restoreSnapshot(dataUrl, after) {
  var img = new Image();
  img.onload = function () { DRAW.ctx.clearRect(0, 0, DRAW.canvas.width, DRAW.canvas.height); DRAW.ctx.drawImage(img, 0, 0); if (after) after(); };
  img.src = dataUrl;
}

function saveDrawSnapshot() {
  DRAW.undoStack.push(DRAW.canvas.toDataURL());
  if (DRAW.undoStack.length > 25) DRAW.undoStack.shift();
}

function drawUndo() {
  if (DRAW.undoStack.length <= 1) return;
  DRAW.undoStack.pop();
  restoreSnapshot(DRAW.undoStack[DRAW.undoStack.length - 1]);
}

function drawClear() {
  drawBackgroundFill();
  saveDrawSnapshot();
}

function setDrawTool(tool) {
  DRAW.tool = tool;
  ['pen', 'eraser', 'line', 'rect', 'circle', 'text'].forEach(function (t) {
    var el = document.getElementById('dt-' + t);
    if (el) el.className = 'px-3 py-1.5 rounded-lg font-bold text-sm ' + (t === tool ? 'bg-blue-600 text-white' : 'bg-slate-100');
  });
}
function setDrawColor(c) { DRAW.color = c; }

function submitDrawing(taskId) {
  // 轉為 JPEG（最大寬度 900px、品質 85%）；橡皮擦挖空的透明區域補上白底
  var scale = Math.min(1, IMAGE_MAX_WIDTH / DRAW.canvas.width);
  var out = document.createElement('canvas');
  out.width = Math.round(DRAW.canvas.width * scale); out.height = Math.round(DRAW.canvas.height * scale);
  var octx = out.getContext('2d');
  octx.fillStyle = '#ffffff'; octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(DRAW.canvas, 0, 0, out.width, out.height);
  var base64 = out.toDataURL('image/jpeg', IMAGE_QUALITY);
  setLoading(true, '上傳作品中…');
  doSubmitTask({ taskId: taskId, base64: base64, mimeType: 'image/jpeg' }).then(function (res) {
    setLoading(false);
    if (res.success) { closeModal(); toast(PREVIEW_MODE ? '（預覽模式）已示範送出流程，未實際上傳' : '作品已送出，等待老師批改！', 'success'); refreshStudentTask(); }
    else toast(res.message, 'error');
  });
}
