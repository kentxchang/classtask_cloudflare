/* ============================================================
 * 12. 學生儀表板（教室黑板風格）：整體進度＋依分類列出任務
 * 黑板樣式（cb-*）與粉筆色定義在 css/app.css 與 teacher/content.js（chalkColor、chalkboardDate、chalkTrayHtml）
 * ============================================================ */
var STU_DATA = { categories: [], tasks: [] };
var STU_ACTIVE_CAT = null;

function viewStudentDashboard() {
  var s = STATE.student;
  return '<div class="max-w-6xl mx-auto px-4 pt-6 pb-16">' +
    '<div class="flex items-center justify-between flex-wrap gap-3 mb-5">' +
      '<div class="flex items-center gap-3">' +
        '<div class="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white flex-shrink-0" style="background:#7d6650">' + escapeHtml(String(s.name || '?').slice(-2)) + '</div>' +
        '<div>' +
          '<h1 class="text-xl font-bold text-slate-700">' + escapeHtml(s.name) + ' 的學習任務</h1>' +
          '<div class="text-xs text-slate-400 mt-0.5">' + escapeHtml(s.className) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="flex gap-2 flex-wrap">' +
        '<button onclick="openGalleryView()" class="cls-btn cls-btn-paper px-4 py-2 text-sm">🖼️ 作品藝廊</button>' +
        '<button onclick="switchStudentClass()" class="cls-btn cls-btn-paper px-4 py-2 text-sm">🔀 切換課堂</button>' +
        '<button onclick="studentLogout()" class="cls-btn cls-btn-paper px-4 py-2 text-sm text-slate-400">登出</button>' +
      '</div>' +
    '</div>' +
    '<div class="cb-frame">' +
      '<div class="cb-board">' +
        '<div class="flex items-start justify-between flex-wrap gap-3 mb-6">' +
          '<h2 class="cb-title"><span class="cb-underline">我的學習任務</span></h2>' +
          '<div class="cb-date pt-2">' + chalkboardDate() + '</div>' +
        '</div>' +
        '<div id="stu-summary"></div>' +
        '<div class="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-7 items-start">' +
          '<nav id="stu-cat-tabs" class="cb-nav lg:sticky lg:top-4 mb-6 lg:mb-0"></nav>' +
          '<div id="stu-task-grid" class="space-y-7 pt-2"><div class="cb-section p-10 text-center cb-muted">載入中…</div></div>' +
        '</div>' +
      '</div>' +
      chalkTrayHtml() +
    '</div>' +
  '</div>';
}

function wireStudentDashboard() { loadStudentDashboardData(false); }

// 若已在「選課堂」畫面被預先快取，就直接秒開；forceRefresh=true（例如剛送出作業後）則一律重新向伺服器取得最新狀態
function loadStudentDashboardData(forceRefresh) {
  var classId = STATE.student.classId;
  var cached = !forceRefresh && STU_DATA_CACHE[classId];
  if (cached) {
    STU_DATA = cached;
    if (!STU_ACTIVE_CAT || !cached.categories.find(function (c) { return c.id === STU_ACTIVE_CAT; })) {
      STU_ACTIVE_CAT = cached.categories[0] ? cached.categories[0].id : null;
    }
    renderStuCatTabs(); renderStuTaskGrid();
    return;
  }
  setLoading(true);
  api('getTasksForStudent', classId, STATE.student.studentId).then(function (res) {
    setLoading(false);
    if (!res.success) return toast(res.message, 'error');
    STU_DATA = res;
    STU_DATA_CACHE[classId] = res;
    if (!STU_ACTIVE_CAT || !res.categories.find(function (c) { return c.id === STU_ACTIVE_CAT; })) {
      STU_ACTIVE_CAT = res.categories[0] ? res.categories[0].id : null;
    }
    renderStuCatTabs(); renderStuTaskGrid();
  });
}

function stuTasksOf(catId) {
  return STU_DATA.tasks.filter(function (t) { return t.categoryId === catId; }).sort(function (a, b) { return a.order - b.order; });
}

function stuCategoriesWithTasks() {
  return STU_DATA.categories.filter(function (c) { return stuTasksOf(c.id).length > 0; });
}

var STU_VIEW_ALL = false; // true：右側列出全部分類；false：只列出目前選取的分類

// 目前選取的分類若已不存在或沒有任務，改選第一個有任務的分類
function ensureStuActiveCat() {
  var cats = stuCategoriesWithTasks();
  if (cats.length && !cats.some(function (c) { return c.id === STU_ACTIVE_CAT; })) STU_ACTIVE_CAT = cats[0].id;
}

// 粉筆畫的進度條
function chalkProgressHtml(done, total, color, widthCls) {
  return '<div class="cb-progress ' + (widthCls || '') + '"><div style="width:' + (total ? Math.round(done / total * 100) : 0) + '%;background:' + color + ';box-shadow:0 0 6px ' + color + '"></div></div>';
}

// 左側分類目錄：最上方「全部分類」，其下每個分類附完成進度（手機版為上方可左右滑動的標籤列）
function renderStuCatTabs() {
  var el = document.getElementById('stu-cat-tabs');
  if (!el) return;
  var cats = stuCategoriesWithTasks();
  if (!cats.length) { el.innerHTML = ''; return; }
  ensureStuActiveCat();
  var allDone = STU_DATA.tasks.filter(function (t) { return t.status === '已完成'; }).length;
  el.innerHTML =
    '<div class="hidden lg:block text-xs font-bold cb-muted tracking-widest mb-2 px-1">課程分類</div>' +
    '<div class="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">' +
      '<button onclick="showAllStuCategories()" class="cb-nav-item flex-shrink-0 px-3 py-2.5 text-left text-sm' + (STU_VIEW_ALL ? ' active' : '') + '">' +
        '<div class="flex items-center gap-2">' +
          '<span class="flex-shrink-0">📚</span>' +
          '<span class="flex-1 whitespace-nowrap">全部分類</span>' +
          '<span class="cb-count">' + allDone + '/' + STU_DATA.tasks.length + '</span>' +
        '</div>' +
      '</button>' +
      '<div class="hidden lg:block cb-rule my-1 mx-2"></div>' +
      cats.map(function (c) {
        var idx = STU_DATA.categories.indexOf(c);
        var chalk = chalkColor(idx);
        var list = stuTasksOf(c.id);
        var done = list.filter(function (t) { return t.status === '已完成'; }).length;
        var active = !STU_VIEW_ALL && STU_ACTIVE_CAT === c.id;
        return '<button onclick="setStuCategory(\'' + c.id + '\')" class="cb-nav-item flex-shrink-0 px-3 py-2.5 text-left text-sm' + (active ? ' active' : '') + '">' +
          '<div class="flex items-center gap-2">' +
            '<span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:' + chalk + ';box-shadow:0 0 6px ' + chalk + '"></span>' +
            '<span class="flex-1 truncate max-w-[9rem] lg:max-w-none">' + escapeHtml(c.name) + '</span>' +
            '<span class="cb-count">' + done + '/' + list.length + '</span>' +
          '</div>' +
          '<div class="hidden lg:block mt-2 ml-4">' + chalkProgressHtml(done, list.length, chalk) + '</div>' +
        '</button>';
      }).join('') +
    '</div>';
}

// 點選分類：右側只顯示該分類的任務
function setStuCategory(id) {
  STU_ACTIVE_CAT = id;
  STU_VIEW_ALL = false;
  renderStuCatTabs(); renderStuTaskGrid();
}

// 點選「全部分類」：右側列出所有分類與任務
function showAllStuCategories() {
  STU_VIEW_ALL = true;
  renderStuCatTabs(); renderStuTaskGrid();
}

// 上方提醒：只在有任務被老師退回時顯示（不顯示整體進度）
function renderStuSummary() {
  var el = document.getElementById('stu-summary');
  if (!el) return;
  var returnedTasks = STU_DATA.tasks.filter(function (t) { return t.status === '退回'; });
  el.innerHTML =
    (returnedTasks.length
      ? '<div class="cb-notice mb-7 px-4 py-3">' +
          '<div class="text-sm font-bold mb-2" style="color:#f2a7b5">📮 老師退回了 ' + returnedTasks.length + ' 個任務，請修改後重新繳交</div>' +
          '<div class="flex flex-wrap gap-2">' + returnedTasks.map(function (t) {
            return '<button onclick="openTaskPlayer(\'' + t.id + '\')" class="cb-btn px-3 py-1.5 text-sm" style="border-color:#f2a7b5;color:#f2a7b5">' + getTaskTypeMeta(t.type).icon + ' ' + escapeHtml(t.title) + '</button>';
          }).join('') + '</div>' +
        '</div>'
      : '');
}

// 主畫面：每個分類一個粉筆方框，框內列出該分類的任務
function renderStuTaskGrid() {
  var el = document.getElementById('stu-task-grid');
  if (!el) return;
  renderStuSummary();
  var cats = stuCategoriesWithTasks();
  if (!cats.length) { el.innerHTML = '<div class="cb-section p-10 text-center cb-muted">老師目前還沒有上架任務</div>'; return; }
  ensureStuActiveCat();
  if (!STU_VIEW_ALL) cats = cats.filter(function (c) { return c.id === STU_ACTIVE_CAT; });
  el.innerHTML = cats.map(function (c) {
    var idx = STU_DATA.categories.indexOf(c);
    var chalk = chalkColor(idx);
    var list = stuTasksOf(c.id);
    var done = list.filter(function (t) { return t.status === '已完成'; }).length;
    return '<section id="stu-sec-' + c.id + '" class="cat-section cb-section">' +
      '<span class="cb-magnet" style="--mag:' + chalk + '"></span>' +
      '<div class="cb-section-head flex items-center gap-3 px-4 sm:px-5 pt-5 pb-3">' +
        '<span class="order-badge cb-num w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0" style="color:' + chalk + '">' + (idx + 1) + '</span>' +
        '<div class="flex-1 min-w-0">' +
          '<div class="cb-cat-name truncate" style="color:' + chalk + '">' + escapeHtml(c.name) + '</div>' +
          '<div class="flex items-center gap-2 mt-1.5">' +
            chalkProgressHtml(done, list.length, chalk, 'w-24 sm:w-40') +
            '<span class="text-xs cb-muted">完成 ' + done + ' / ' + list.length + '</span>' +
          '</div>' +
        '</div>' +
        (done === list.length ? '<span class="cb-tag whitespace-nowrap" style="color:#b5e0a6">🎉 全部完成</span>' : '') +
      '</div>' +
      '<div class="pb-2">' + list.map(function (t, i) { return stuTaskRowHtml(t, i); }).join('') + '</div>' +
    '</section>';
  }).join('');
}

// 任務狀態的粉筆顏色：未完成白、待批改橘、已完成綠、退回粉紅
var STU_STATUS_CHALK = { '未完成': '#f4f4ec', '待批改': '#f5c08a', '已完成': '#b5e0a6', '退回': '#f2a7b5' };

function stuTaskRowHtml(t, i) {
  var meta = getTaskTypeMeta(t.type);
  var chalk = STU_STATUS_CHALK[t.status] || '#f4f4ec';
  // 分數／等第僅在教師正式完成批改（狀態＝已完成）後才顯示；一律透過 gradeResultText 判斷分數、等第或通過／未通過
  var scoreLabel = t.status === '已完成' && gradeResultText(t) ? ' ' + gradeResultText(t) : '';
  var hint = t.status === '未完成' ? '開始' : t.status === '退回' ? '去訂正' : '查看';
  return '<button onclick="openTaskPlayer(\'' + t.id + '\')" class="cb-row w-full text-left flex items-center gap-3 px-4 sm:px-5 py-3.5 group" style="box-shadow:inset 3px 0 0 ' + chalk + '">' +
    '<span class="text-xs font-bold cb-muted w-4 text-right flex-shrink-0">' + (i + 1) + '</span>' +
    '<div class="cb-icon w-11 h-11 flex items-center justify-center text-xl flex-shrink-0">' + meta.icon + '</div>' +
    '<div class="flex-1 min-w-0">' +
      '<div class="cb-task-title truncate">' + escapeHtml(t.title) + '</div>' +
      '<div class="text-xs cb-muted truncate mt-0.5">' + escapeHtml(t.description || meta.label) + '</div>' +
      ((t.status === '退回' || t.status === '已完成') && t.comment ? '<div class="text-xs mt-1 truncate" style="color:' + chalk + '">📮 老師評語：' + escapeHtml(t.comment) + '</div>' : '') +
    '</div>' +
    '<span class="cb-tag whitespace-nowrap flex-shrink-0" style="color:' + chalk + '">' + t.status + scoreLabel + '</span>' +
    '<span class="hidden sm:inline text-xs font-bold cb-muted group-hover:text-white whitespace-nowrap flex-shrink-0">' + hint + ' →</span>' +
  '</button>';
}

function studentLogout() {
  STATE.student = { classId: null, studentId: null, name: null, className: '' };
  STU_DATA = { categories: [], tasks: [] }; STU_ACTIVE_CAT = null; STU_VIEW_ALL = false;
  goto('landing');
}

function refreshStudentTask() { if (PREVIEW_MODE) return; loadStudentDashboardData(true); }
