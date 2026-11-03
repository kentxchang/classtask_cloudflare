/* ---- PDF 全班筆記檢視（教師端檢核） ---- */
// 全班筆記檢核：以小圖矩陣同時顯示所有學生在「同一頁」的畫記，翻頁時全部小圖一起切換；
// 點擊小圖才開啟該生的大圖唯讀檢視。
var TPDFV = { pageFileIds: [], page: 0, total: 0, students: [], annotations: {} };

function openTeacherPdfNotes(taskId) {
  var task = STATE.tasks.find(function (t) { return t.id === taskId; });
  if (!task) return;
  var pageFileIds = task.config.pageFileIds || [];
  setLoading(true);
  Promise.all([api('getAllAnnotationsForTask', taskId), api('getEnrolledStudents', STATE.currentClass.id)]).then(function (rs) {
    setLoading(false);
    if (!rs[0].success) return toast(rs[0].message, 'error');
    var students = rs[1].success ? rs[1].data : [];
    if (students.length === 0) {
      openModal('<div class="text-lg font-bold mb-4">👀 全班閱讀筆記檢核</div><div class="text-slate-400 text-sm text-center py-8">此課堂尚未指派任何學生。</div>');
      return;
    }
    TPDFV = { pageFileIds: pageFileIds, page: 0, total: pageFileIds.length, students: students, annotations: rs[0].data || {} };
    openModal(
      '<div class="h-full flex flex-col p-4 sm:p-6">' +
        '<div class="flex items-start justify-between gap-2 mb-3 flex-wrap pr-12 flex-shrink-0">' +
          '<div class="text-lg font-bold">👀 全班閱讀筆記檢核（唯讀）</div>' +
          '<div class="text-xs text-slate-400">點擊任一位學生的小圖可放大檢視該頁完整畫記。</div>' +
        '</div>' +
        '<div class="flex items-center justify-between mb-3 flex-shrink-0">' +
          '<button onclick="tpdfGridPrevPage()" class="px-4 py-2 rounded-xl bg-slate-100 font-bold">‹ 上一頁</button>' +
          '<div class="font-bold text-slate-500" id="tpv-page-indicator">頁 1 / ' + TPDFV.total + '</div>' +
          '<button onclick="tpdfGridNextPage()" class="px-4 py-2 rounded-xl bg-slate-100 font-bold">下一頁 ›</button>' +
        '</div>' +
        '<div id="tpv-grid" class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 flex-1 min-h-0 overflow-y-auto content-start"></div>' +
      '</div>',
      { fullscreen: true }
    );
    tpdfRenderGridPage(0);
  });
}

function tpdfRenderGridPage(idx) {
  TPDFV.page = idx;
  var indicator = document.getElementById('tpv-page-indicator');
  if (indicator) indicator.textContent = '頁 ' + (idx + 1) + ' / ' + TPDFV.total;
  var grid = document.getElementById('tpv-grid');
  if (!grid) return;
  grid.innerHTML = TPDFV.students.map(function (s) {
    return '<div class="cursor-pointer card-hover" onclick="openTpdfFullView(\'' + s.id + '\')">' +
      '<div class="relative border-2 border-blue-100 rounded-xl overflow-hidden bg-slate-50">' +
        '<img data-student-id="' + s.id + '" class="w-full block tpv-thumb-img">' +
        '<canvas class="absolute top-0 left-0 tpv-thumb-canvas"></canvas>' +
      '</div>' +
      '<div class="text-sm font-bold text-slate-600 text-center mt-1.5 truncate">' + escapeHtml(s.name) + '</div>' +
    '</div>';
  }).join('');

  Array.prototype.forEach.call(grid.querySelectorAll('.tpv-thumb-img'), function (img) {
    var sid = img.getAttribute('data-student-id');
    img.onload = function () {
      var canvas = img.nextElementSibling;
      canvas.width = img.offsetWidth || img.clientWidth || 200;
      canvas.height = img.offsetHeight || img.clientHeight || 260;
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var pagesRaw = (TPDFV.annotations[sid] || {}).pages || {};
      var raw = pagesRaw[idx];
      if (!raw) return;
      try {
        var paths = JSON.parse(raw);
        paths.forEach(function (p) { renderPdfPath(ctx, canvas.width, canvas.height, p); });
      } catch (e) {}
    };
    img.src = '/f/' + TPDFV.pageFileIds[idx];
  });
}

function tpdfGridPrevPage() { if (TPDFV.page > 0) tpdfRenderGridPage(TPDFV.page - 1); }
function tpdfGridNextPage() { if (TPDFV.page < TPDFV.total - 1) tpdfRenderGridPage(TPDFV.page + 1); }

var TPDFV_FULL = null;

// 放大檢視獨立於 modal-root 之外的圖層（比照作品藝廊小圖放大 openImageLightbox 的作法），
// 疊在「全班閱讀筆記檢核」全螢幕視窗之上，關閉時只移除這一層，不會連帶關掉底下的全班檢核畫面。
function openTpdfFullView(studentId) {
  var s = TPDFV.students.find(function (x) { return x.id === studentId; });
  var pagesRaw = (TPDFV.annotations[studentId] || {}).pages || {};
  var strokes = {};
  Object.keys(pagesRaw).forEach(function (p) { try { strokes[p] = JSON.parse(pagesRaw[p]); } catch (e) {} });
  TPDFV_FULL = { pageFileIds: TPDFV.pageFileIds, page: TPDFV.page, total: TPDFV.total, strokes: strokes, studentName: s ? s.name : '' };
  closeTpdfFullView();
  var el = document.createElement('div');
  el.id = 'tpvf-root';
  el.className = 'fixed inset-0 z-[950] bg-black/85 flex flex-col items-center p-4 fade-in';
  el.innerHTML =
    '<button onclick="closeTpdfFullView()" class="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 hover:bg-white font-bold text-slate-700 shadow-lg z-10">✕</button>' +
    '<div class="text-white font-bold text-lg mt-1 mb-3 flex-shrink-0">👀 ' + escapeHtml(TPDFV_FULL.studentName) + ' 的閱讀筆記（唯讀）</div>' +
    '<div class="flex-1 min-h-0 w-full flex items-center justify-center">' +
      '<div class="relative inline-block">' +
        '<img id="tpvf-page-img" class="block" style="max-width:85vw;max-height:70vh;width:auto;height:auto;">' +
        '<canvas id="tpvf-overlay" class="absolute top-0 left-0"></canvas>' +
      '</div>' +
    '</div>' +
    '<div class="flex items-center justify-between mt-3 w-full max-w-xl flex-shrink-0">' +
      '<button onclick="tpdfFullPrevPage()" class="px-4 py-2 rounded-xl bg-white/90 hover:bg-white font-bold">‹ 上一頁</button>' +
      '<div class="font-bold text-white" id="tpvf-page-indicator">頁 1 / ' + TPDFV_FULL.total + '</div>' +
      '<button onclick="tpdfFullNextPage()" class="px-4 py-2 rounded-xl bg-white/90 hover:bg-white font-bold">下一頁 ›</button>' +
    '</div>';
  el.addEventListener('click', function (e) { if (e.target === el) closeTpdfFullView(); });
  document.body.appendChild(el);
  tpdfFullRenderPage(TPDFV_FULL.page);
}

function closeTpdfFullView() {
  var el = document.getElementById('tpvf-root');
  if (el) el.remove();
}

function tpdfFullRenderPage(idx) {
  TPDFV_FULL.page = idx;
  var indicator = document.getElementById('tpvf-page-indicator');
  if (indicator) indicator.textContent = '頁 ' + (idx + 1) + ' / ' + TPDFV_FULL.total;
  var img = document.getElementById('tpvf-page-img');
  img.onload = function () {
    var canvas = document.getElementById('tpvf-overlay');
    canvas.width = img.offsetWidth || 800; canvas.height = img.offsetHeight || 1100;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var paths = TPDFV_FULL.strokes[idx] || [];
    paths.forEach(function (p) { renderPdfPath(ctx, canvas.width, canvas.height, p); });
  };
  img.src = '/f/' + TPDFV_FULL.pageFileIds[idx];
}

function tpdfFullPrevPage() { if (TPDFV_FULL.page > 0) tpdfFullRenderPage(TPDFV_FULL.page - 1); }
function tpdfFullNextPage() { if (TPDFV_FULL.page < TPDFV_FULL.total - 1) tpdfFullRenderPage(TPDFV_FULL.page + 1); }
