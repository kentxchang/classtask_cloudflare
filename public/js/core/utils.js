// 讀取網址參數：?code=課堂代碼（QR Code 直接進入學生登入）、?gallery=任務ID（公開作品分享連結）
var URL_PARAMS = new URLSearchParams(location.search);
var INIT_JOIN_CODE = String(URL_PARAMS.get('code') || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
var INIT_GALLERY_TASK_ID = String(URL_PARAMS.get('gallery') || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 60);
if (window.pdfjsLib) { pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; }

/* ============================================================
 * 0. 共用工具：API 包裝 / 訊息提示 / 自訂 Modal（禁止 alert/confirm）
 * ============================================================ */
// 教師登入後取得的憑證，呼叫教師專用 API 時一併送出（只存在記憶體，重新整理頁面需重新登入，與原版行為相同）
var TEACHER_TOKEN = '';

// 呼叫 Cloudflare Worker 後端：POST /api/<函式名稱>，body 為參數陣列，回傳值與原 GAS 函式相同
function api(fnName) {
  var args = Array.prototype.slice.call(arguments, 1);
  return fetch('/api/' + fnName, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Teacher-Token': TEACHER_TOKEN },
    body: JSON.stringify(args)
  }).then(function (r) {
    return r.json().catch(function () { throw new Error('伺服器回應錯誤（HTTP ' + r.status + '）'); });
  });
}

// 資料庫中檔案（base64）的讀取網址
function fileUrl(id) { return '/f/' + encodeURIComponent(id); }

function toast(msg, type) {
  type = type || 'info';
  var colors = { info: 'bg-blue-600', success: 'bg-green-600', error: 'bg-red-500', warn: 'bg-orange-500' };
  var el = document.createElement('div');
  el.className = 'fade-in text-white text-sm font-bold px-5 py-3 rounded-xl shadow-lg ' + (colors[type] || colors.info);
  el.style.maxWidth = '90vw';
  el.textContent = msg;
  document.getElementById('toast-root').appendChild(el);
  setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2200);
  setTimeout(function () { el.remove(); }, 2600);
}

function setLoading(on, text) {
  var el = document.getElementById('loading-mask');
  if (on) {
    if (!el) {
      el = document.createElement('div');
      el.id = 'loading-mask';
      el.className = 'fixed inset-0 z-[998] modal-mask flex items-center justify-center';
      el.innerHTML = '<div class="card px-8 py-6 flex flex-col items-center gap-3"><div class="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div><div class="font-bold text-blue-700">' + (text || '處理中，請稍候…') + '</div></div>';
      document.body.appendChild(el);
    }
  } else if (el) { el.remove(); }
}

function closeModal() {
  var root = document.getElementById('modal-root');
  root.innerHTML = '';
}

/* 作品藝廊小圖點擊放大：獨立於 modal-root 之外的圖層，疊在既有的藝廊視窗之上，
   關閉時不會連帶關掉底下的藝廊清單。 */
function openImageLightbox(fileId) {
  if (!fileId) return;
  closeImageLightbox();
  var el = document.createElement('div');
  el.id = 'lightbox-root';
  el.className = 'fixed inset-0 z-[950] bg-black/85 flex items-center justify-center p-4 fade-in';
  el.innerHTML =
    '<button onclick="closeImageLightbox()" class="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 hover:bg-white font-bold text-slate-700 shadow-lg">✕</button>' +
    '<img src="/f/' + fileId + '" class="max-w-full max-h-full rounded-xl object-contain shadow-2xl">';
  el.addEventListener('click', function (e) { if (e.target === el) closeImageLightbox(); });
  document.body.appendChild(el);
}

function closeImageLightbox() {
  var el = document.getElementById('lightbox-root');
  if (el) el.remove();
}

function openModal(innerHtml, opts) {
  opts = opts || {};
  var root = document.getElementById('modal-root');

  if (opts.fullscreen) {
    root.innerHTML =
      '<div class="fixed inset-0 z-[900] bg-white flex flex-col fade-in" id="modal-mask-el">' +
        (opts.closable === false ? '' : '<button onclick="closeModal()" class="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-white shadow-lg font-bold text-slate-500 hover:bg-slate-100">✕</button>') +
        '<div class="flex-1 min-h-0">' + innerHtml + '</div>' +
      '</div>';
    return;
  }

  var wide = opts.wide ? 'max-w-4xl' : 'max-w-lg';
  root.innerHTML =
    '<div class="fixed inset-0 z-[900] modal-mask flex items-center justify-center p-3" id="modal-mask-el">' +
      '<div class="card fade-in w-full ' + wide + ' max-h-[92vh] overflow-y-auto p-6 relative">' +
        (opts.closable === false ? '' : '<button onclick="closeModal()" class="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 font-bold text-slate-500">✕</button>') +
        innerHtml +
      '</div>' +
    '</div>';
  if (opts.closable !== false) {
    document.getElementById('modal-mask-el').addEventListener('click', function (e) {
      if (e.target.id === 'modal-mask-el') closeModal();
    });
  }
}

function confirmDialog(msg, okText) {
  return new Promise(function (resolve) {
    openModal(
      '<div class="text-lg font-bold mb-4 pr-8">' + msg + '</div>' +
      '<div class="flex justify-end gap-3">' +
        '<button id="cf-no" class="px-5 py-2 rounded-xl bg-slate-100 font-bold hover:bg-slate-200">取消</button>' +
        '<button id="cf-yes" class="px-5 py-2 rounded-xl btn-accent">' + (okText || '確定') + '</button>' +
      '</div>', { closable: false });
    document.getElementById('cf-no').onclick = function () { closeModal(); resolve(false); };
    document.getElementById('cf-yes').onclick = function () { closeModal(); resolve(true); };
  });
}

function promptDialog(title, placeholder, defVal) {
  return new Promise(function (resolve) {
    openModal(
      '<div class="text-lg font-bold mb-3 pr-8">' + title + '</div>' +
      '<input id="pd-input" class="w-full border-2 border-blue-100 focus:border-blue-400 outline-none rounded-xl px-4 py-2.5 mb-4" placeholder="' + (placeholder || '') + '" value="' + (defVal || '') + '">' +
      '<div class="flex justify-end gap-3">' +
        '<button id="pd-no" class="px-5 py-2 rounded-xl bg-slate-100 font-bold hover:bg-slate-200">取消</button>' +
        '<button id="pd-yes" class="px-5 py-2 rounded-xl btn-primary">確定</button>' +
      '</div>', { closable: false });
    var input = document.getElementById('pd-input');
    input.focus();
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') document.getElementById('pd-yes').click(); });
    document.getElementById('pd-no').onclick = function () { closeModal(); resolve(null); };
    document.getElementById('pd-yes').onclick = function () { closeModal(); resolve(input.value.trim()); };
  });
}

/* ============================================================
 * 1. 影像壓縮 / 檔案轉 Base64
 * ============================================================ */
// 所有上傳圖片統一壓縮：最大寬度 900px、JPEG 品質 85%（透明背景補白底）
var IMAGE_MAX_WIDTH = 900;
var IMAGE_QUALITY = 0.85;
function compressImageFile(file, maxWidth) {
  maxWidth = maxWidth || IMAGE_MAX_WIDTH;
  return new Promise(function (resolve, reject) {
    var img = new Image();
    var reader = new FileReader();
    reader.onload = function (e) {
      img.onload = function () {
        var scale = Math.min(1, maxWidth / img.width);
        var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        var cctx = canvas.getContext('2d');
        cctx.fillStyle = '#ffffff'; cctx.fillRect(0, 0, w, h);
        cctx.drawImage(img, 0, 0, w, h);
        resolve({ base64: canvas.toDataURL('image/jpeg', IMAGE_QUALITY), mimeType: 'image/jpeg' });
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 「分享檔案」任務用：不壓縮、不限檔案類型，單純讀成 Base64 供 uploadFile 上傳
function readFileAsBase64(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function (e) { resolve(e.target.result); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

var FILE_SHARE_MAX_BYTES = 20 * 1024 * 1024; // 分享檔案以 base64 存入資料庫，限制 20MB 以節省空間

function fmtDate(s) { return s || '—'; }
