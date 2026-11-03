/* ============================================================
 * 7. 內容管理分頁：分類區塊 + 任務列表
 * ============================================================ */
var TASK_TYPE_META = {
  LINK: { icon: '🔗', label: '外部連結／教材網站', tone: 'bg-teal-50' },
  PDF: { icon: '📄', label: 'PDF 電子書／講義閱讀', tone: 'bg-orange-50' },
  FILE_SHARE: { icon: '📁', label: '分享檔案', tone: 'bg-amber-50' },
  YOUTUBE: { icon: '▶️', label: 'YouTube 影片＋隨堂考', tone: 'bg-red-50' },
  PHOTO_TEXT: { icon: '📷', label: '圖文回應＋照片上傳', tone: 'bg-green-50' },
  DRAWING: { icon: '✏️', label: '手繪繪圖板', tone: 'bg-purple-50' },
  QUIZ: { icon: '✅', label: '自動閱卷測驗', tone: 'bg-blue-50' },
  MARKDOWN: { icon: '📝', label: '分享 Markdown 文件', tone: 'bg-slate-100' },
  HTML_SHARE: { icon: '🌐', label: '分享 HTML 網頁＋截圖回傳', tone: 'bg-teal-50' }
};

// 若任務的類型已不存在於平台（例如功能被停用後留下的舊資料），回傳安全的預設值以避免畫面崩潰
function getTaskTypeMeta(type) {
  return TASK_TYPE_META[type] || { icon: '⚠️', label: '此任務類型已停用，請聯絡老師刪除', tone: 'bg-slate-100' };
}

// 教師評分時可能用「分數」「等第」「通過／未通過」三種方式其中之一，凡是要在畫面上顯示
// 批改結果的地方都必須共用這個函式，才不會只認分數、漏掉老師實際填寫的等第或通過／未通過。
function gradeResultText(s) {
  if (!s) return '';
  if (s.score !== null && s.score !== '' && s.score !== undefined) return s.score + ' 分';
  if (s.level) return s.level;
  return '';
}

/* ---- 教師端任務預覽：直接以學生端的任務執行器開啟，但送出動作全部攔截、不寫入任何資料 ---- */
var PREVIEW_MODE = false;

function previewBannerHtml() {
  return '<div class="text-xs font-bold text-orange-600 bg-orange-50 rounded-lg px-3 py-2 mb-3">🔍 教師預覽模式：畫面與互動皆與學生端完全相同，僅送出／儲存動作會被攔截，不會寫入任何資料。</div>';
}

function previewTask(taskId) {
  var t = STATE.tasks.find(function (x) { return x.id === taskId; });
  if (!t) return;
  PREVIEW_MODE = true;
  var pt = { id: t.id, categoryId: t.categoryId, type: t.type, title: t.title, description: t.description, config: t.config };
  if (t.type === 'LINK') openLinkTask(pt);
  else if (t.type === 'PDF') openPdfTask(pt);
  else if (t.type === 'FILE_SHARE') openFileShareTask(pt);
  else if (t.type === 'YOUTUBE') openYoutubeTask(pt);
  else if (t.type === 'PHOTO_TEXT') openPhotoTextTask(pt);
  else if (t.type === 'DRAWING') openDrawingTask(pt);
  else if (t.type === 'QUIZ') openQuizTask(pt);
  else if (t.type === 'MARKDOWN') openMarkdownTask(pt);
  else if (t.type === 'HTML_SHARE') openHtmlShareTask(pt);
  else toast('此任務類型尚未支援預覽', 'warn');
}

/* ---- 單元內容看板（教室黑板風格）：左側分類目錄（可排序）+ 右側顯示所選分類的任務，或「全部分類」一次列出 ---- */
var CAT_ACCENTS = ['#7d6650', '#a0613f', '#74865f', '#677a70', '#8a6d76', '#ad977b'];
var CONTENT_COLLAPSED = {};      // 分類ID -> true：該分類區塊已收合
var CONTENT_SCROLL_PENDING = false; // 下次畫面更新後捲動到目前分類（新增分類／任務後使用）

function catAccent(idx) { return CAT_ACCENTS[idx % CAT_ACCENTS.length]; }

function tasksOfCategory(catId) {
  return STATE.tasks.filter(function (t) { return t.categoryId === catId; }).sort(function (a, b) { return a.order - b.order; });
}

var CONTENT_VIEW_ALL = false;    // true：右側列出全部分類；false：只列出目前選取的分類

// 黑板粉筆色：分類名稱、磁鐵、編號依序使用
var CHALK_COLORS = ['#f3e08a', '#f2a7b5', '#9fd0ea', '#b5e0a6', '#f5c08a', '#c9b6e8'];
function chalkColor(idx) { return CHALK_COLORS[idx % CHALK_COLORS.length]; }

// 黑板右上角的日期（像教室黑板一樣寫上今天日期）
function chalkboardDate() {
  var d = new Date();
  return (d.getMonth() + 1) + '月' + d.getDate() + '日　星期' + '日一二三四五六'.charAt(d.getDay());
}

// 黑板下方的粉筆槽：粉筆與板擦（裝飾，教師端與學生端共用）
function chalkTrayHtml() {
  return '<div class="cb-tray">' +
    '<span class="cb-chalk" style="left:12%;background:#fbfaf3"></span>' +
    '<span class="cb-chalk" style="left:calc(12% + 52px);width:30px;background:#f3e08a"></span>' +
    '<span class="cb-chalk" style="left:calc(12% + 94px);width:24px;background:#f2a7b5;transform:rotate(-4deg)"></span>' +
    '<span class="cb-eraser" style="right:14%"></span>' +
  '</div>';
}

function renderContentTab(body) {
  var cats = STATE.categories;
  var total = STATE.tasks.length;
  var hidden = STATE.tasks.filter(function (t) { return !t.published; }).length;
  if (cats.length && !cats.some(function (c) { return c.id === STATE.activeCategoryId; })) STATE.activeCategoryId = cats[0].id;
  body.innerHTML =
    '<div class="cb-frame">' +
      '<div class="cb-board">' +
        '<div class="flex items-start justify-between flex-wrap gap-3 mb-6">' +
          '<div>' +
            '<h2 class="cb-title"><span class="cb-underline">單元內容</span></h2>' +
            '<div class="text-xs cb-muted mt-2">共 ' + cats.length + ' 個分類・' + total + ' 個任務' + (hidden ? '（' + hidden + ' 個未上架）' : '') + '　拖曳分類目錄的 ⠿ 可調整分類順序（電腦版也可按 ▲▼）</div>' +
          '</div>' +
          '<div class="w-full sm:w-auto flex sm:flex-col items-center sm:items-end justify-between gap-3">' +
            '<div class="cb-date">' + chalkboardDate() + '</div>' +
            '<div class="flex gap-2">' +
              (cats.length && CONTENT_VIEW_ALL ? '<button onclick="toggleAllCategories()" class="cb-btn px-4 py-2 text-sm">' + (allCategoriesCollapsed() ? '全部展開' : '全部收合') + '</button>' : '') +
              '<button onclick="addCategoryPrompt()" class="cb-btn cb-btn-yellow px-4 py-2 text-sm">＋ 新增分類</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        (cats.length === 0
          ? '<div class="cb-section p-10 text-center">' +
              '<div class="text-4xl mb-3">🗂️</div>' +
              '<div class="font-bold cb-chalk-text mb-1">黑板上還沒有任何分類</div>' +
              '<div class="text-sm cb-muted mb-5">先建立分類（例如：單元一、課前預習、課後評量），再把互動任務放進分類裡。</div>' +
              '<button onclick="addCategoryPrompt()" class="cb-btn-solid px-5 py-2.5">＋ 建立第一個分類</button>' +
            '</div>'
          : '<div class="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-7 items-start">' +
              '<nav id="cat-nav" class="cb-nav lg:sticky lg:top-4 mb-6 lg:mb-0"></nav>' +
              '<div id="cat-sections" class="space-y-7 pt-2"></div>' +
            '</div>') +
      '</div>' +
      chalkTrayHtml() +
    '</div>';
  if (!cats.length) return;
  renderTaskGrid();
  initSortableList(document.getElementById('cat-sections'), '.cat-section', '.cat-drag-handle', onCategoryReordered);
  if (CONTENT_SCROLL_PENDING) {
    CONTENT_SCROLL_PENDING = false;
    var sec = document.getElementById('cat-sec-' + STATE.activeCategoryId);
    if (sec && CONTENT_VIEW_ALL) setTimeout(function () { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
  }
}

// 左側分類目錄：最上方「全部分類」，其下各分類可拖曳 ⠿ 或按 ▲▼ 調整順序（手機版為上方可左右滑動的標籤列）
function renderCategoryNav() {
  var nav = document.getElementById('cat-nav');
  if (!nav) return;
  var cats = STATE.categories;
  nav.innerHTML =
    '<div class="hidden lg:block text-xs font-bold cb-muted tracking-widest mb-2 px-1">分類目錄</div>' +
    '<div class="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">' +
      '<button onclick="showAllCategories()" class="cb-nav-item flex-shrink-0 flex items-center gap-2.5 px-3 py-2.5 text-left text-sm' + (CONTENT_VIEW_ALL ? ' active' : '') + '">' +
        '<span class="w-5 text-center flex-shrink-0">📚</span>' +
        '<span class="flex-1 whitespace-nowrap">全部分類</span>' +
        '<span class="cb-count">' + STATE.tasks.length + '</span>' +
      '</button>' +
      '<div class="hidden lg:block cb-rule my-1 mx-2"></div>' +
      '<div id="cat-nav-list" class="flex lg:flex-col gap-1.5">' +
        cats.map(function (c, idx) {
          var active = !CONTENT_VIEW_ALL && STATE.activeCategoryId === c.id;
          return '<div class="cat-nav-item cb-nav-item flex-shrink-0 flex items-center text-sm' + (active ? ' active' : '') + '" data-sort-id="' + c.id + '">' +
            '<span class="cat-nav-drag drag-handle cb-handle pl-2 pr-1 py-2.5 select-none" title="拖曳調整順序">⠿</span>' +
            '<button onclick="jumpToCategory(\'' + c.id + '\')" class="flex-1 min-w-0 flex items-center gap-2 pr-2 py-2.5 text-left">' +
              '<span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:' + chalkColor(idx) + ';box-shadow:0 0 6px ' + chalkColor(idx) + '"></span>' +
              '<span class="flex-1 truncate max-w-[9rem] lg:max-w-none">' + escapeHtml(c.name) + '</span>' +
              '<span class="cb-count">' + tasksOfCategory(c.id).length + '</span>' +
            '</button>' +
            '<span class="hidden lg:flex flex-col pr-1.5">' +
              '<button onclick="moveCategory(\'' + c.id + '\',-1)" title="往上移" class="cb-arrow"' + (idx === 0 ? ' disabled' : '') + '>▲</button>' +
              '<button onclick="moveCategory(\'' + c.id + '\',1)" title="往下移" class="cb-arrow"' + (idx === cats.length - 1 ? ' disabled' : '') + '>▼</button>' +
            '</span>' +
          '</div>';
        }).join('') +
      '</div>' +
      '<button onclick="addCategoryPrompt()" class="cb-nav-add flex-shrink-0 px-3 py-2.5 text-sm text-left whitespace-nowrap">＋ 新增分類</button>' +
    '</div>';
  initSortableList(document.getElementById('cat-nav-list'), '.cat-nav-item', '.cat-nav-drag', onCategoryReordered);
}

// 點選分類：右側只顯示該分類的任務
function jumpToCategory(id) {
  STATE.activeCategoryId = id;
  CONTENT_VIEW_ALL = false;
  delete CONTENT_COLLAPSED[id];
  syncClassCache();
  goto('teacherDashboard');
}

// 點選「全部分類」：右側列出所有分類與任務
function showAllCategories() {
  CONTENT_VIEW_ALL = true;
  goto('teacherDashboard');
}

// ▲▼ 按鈕：將分類往上／往下移一格
function moveCategory(id, delta) {
  var ids = STATE.categories.map(function (c) { return c.id; });
  var i = ids.indexOf(id), j = i + delta;
  if (i === -1 || j < 0 || j >= ids.length) return;
  ids.splice(j, 0, ids.splice(i, 1)[0]);
  onCategoryReordered(ids);
}

// 保留舊名稱：其他模組在任務變動後會呼叫此函式重新整理任務畫面
function renderTaskGrid() {
  var wrap = document.getElementById('cat-sections');
  if (!wrap) return;
  renderCategoryNav();
  var shown = CONTENT_VIEW_ALL ? STATE.categories : STATE.categories.filter(function (c) { return c.id === STATE.activeCategoryId; });
  wrap.innerHTML = shown.map(function (c) { return categorySectionHtml(c, STATE.categories.indexOf(c)); }).join('');
  shown.forEach(function (c) {
    initSortableList(document.getElementById('task-list-' + c.id), '.task-row', '.task-drag-handle', onTaskReordered);
  });
}

function categorySectionHtml(c, idx) {
  var list = tasksOfCategory(c.id);
  var collapsed = CONTENT_VIEW_ALL && !!CONTENT_COLLAPSED[c.id]; // 收合只在「全部分類」檢視時使用
  var chalk = chalkColor(idx);
  var active = CONTENT_VIEW_ALL && STATE.activeCategoryId === c.id;
  return '<section id="cat-sec-' + c.id + '" class="cat-section cb-section' + (active ? ' active' : '') + '" data-sort-id="' + c.id + '">' +
    '<span class="cb-magnet" style="--mag:' + chalk + '"></span>' +
    '<div class="cb-section-head flex items-center gap-3 px-4 sm:px-5 pt-5 pb-3">' +
      (CONTENT_VIEW_ALL ? '<span class="cat-drag-handle drag-handle cb-handle select-none" title="拖曳排序分類">⠿</span>' : '') +
      '<span class="order-badge cb-num w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0" style="color:' + chalk + '">' + (idx + 1) + '</span>' +
      '<button' + (CONTENT_VIEW_ALL ? ' onclick="toggleCategoryCollapse(\'' + c.id + '\')"' : '') + ' class="flex-1 min-w-0 text-left' + (CONTENT_VIEW_ALL ? '' : ' cursor-default') + '">' +
        '<div class="cb-cat-name truncate" style="color:' + chalk + '">' + escapeHtml(c.name) + '</div>' +
        '<div class="text-xs cb-muted">' + list.length + ' 個任務' + (collapsed ? '・已收合' : '') + '</div>' +
      '</button>' +
      '<button onclick="openCreateTaskFor(\'' + c.id + '\')" class="hidden sm:inline-flex cb-btn-solid px-3 py-1.5 text-xs whitespace-nowrap">＋ 新增任務</button>' +
      '<button onclick="renameCategoryPrompt(\'' + c.id + '\')" title="重新命名" class="cb-icon-btn">✎</button>' +
      '<button onclick="deleteCategoryConfirm(\'' + c.id + '\')" title="刪除分類" class="cb-icon-btn cb-danger">🗑</button>' +
      (CONTENT_VIEW_ALL ? '<button onclick="toggleCategoryCollapse(\'' + c.id + '\')" title="' + (collapsed ? '展開' : '收合') + '" class="cb-icon-btn transition-transform' + (collapsed ? ' -rotate-90' : '') + '">▾</button>' : '') +
    '</div>' +
    (collapsed ? '' :
      '<div id="task-list-' + c.id + '" class="pb-2">' +
        (list.length === 0
          ? '<button onclick="openCreateTaskFor(\'' + c.id + '\')" class="cb-empty mx-4 sm:mx-5 mb-3">此分類尚無任務，點這裡＋ 新增第一個任務</button>'
          : list.map(function (t, i) { return taskRowHtml(t, i); }).join('')) +
      '</div>' +
      (list.length ? '<button onclick="openCreateTaskFor(\'' + c.id + '\')" class="sm:hidden w-full py-3 text-sm font-bold cb-yellow cb-row-top">＋ 新增任務</button>' : '')) +
  '</section>';
}

function taskActionBtn(label, onclick, tone) {
  return '<button onclick="' + onclick + '" class="cb-act ' + tone + '">' + label + '</button>';
}

function taskRowHtml(t, i) {
  var meta = getTaskTypeMeta(t.type);
  var gallery = t.config && t.config.galleryFullyPublic ? '<span class="cb-tag" style="color:#c9b6e8">🌐 完全公開</span>'
    : t.config && t.config.galleryPublished ? '<span class="cb-tag" style="color:#f5c08a">🖼️ 藝廊公開</span>' : '';
  var actions =
    (TASK_TYPE_META[t.type] ? taskActionBtn('預覽', 'previewTask(\'' + t.id + '\')', '') : '') +
    taskActionBtn('編輯', 'openEditTaskModal(\'' + t.id + '\')', '') +
    (['PHOTO_TEXT', 'DRAWING', 'HTML_SHARE', 'QUIZ', 'YOUTUBE'].indexOf(t.type) !== -1 ? taskActionBtn('查看繳交', 'openTaskSubmissionsModal(\'' + t.id + '\')', 'cb-act-green') : '') +
    (t.type === 'QUIZ' || t.type === 'YOUTUBE' ? taskActionBtn('題庫', 'openQuestionManager(\'' + t.id + '\',\'' + t.type + '\')', 'cb-act-blue') : '') +
    (t.type === 'PDF' ? taskActionBtn('全班筆記', 'openTeacherPdfNotes(\'' + t.id + '\')', 'cb-act-blue') : '') +
    taskActionBtn('刪除', 'deleteTaskConfirm(\'' + t.id + '\')', 'cb-act-red');
  return '<div class="task-row cb-row flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-2 px-4 sm:px-5 py-3' + (t.published ? '' : ' cb-unpublished') + '" data-sort-id="' + t.id + '">' +
    '<span class="task-drag-handle drag-handle cb-handle select-none" title="拖曳排序任務">⠿</span>' +
    '<div class="cb-icon w-11 h-11 flex items-center justify-center text-xl flex-shrink-0">' + meta.icon + '</div>' +
    '<div class="flex-1 min-w-0">' +
      '<div class="cb-task-title truncate">' + escapeHtml(t.title) + '</div>' +
      '<div class="flex items-center gap-2 flex-wrap mt-0.5">' +
        '<span class="text-xs cb-muted">' + meta.label + '</span>' + gallery +
        (t.published ? '' : '<span class="cb-tag cb-muted">未上架</span>') +
      '</div>' +
    '</div>' +
    '<button onclick="togglePublish(\'' + t.id + '\',' + (!t.published) + ')" title="' + (t.published ? '學生看得到，點一下下架' : '學生看不到，點一下上架') + '" class="flex items-center gap-2 text-xs font-bold cb-muted flex-shrink-0 md:order-last md:w-[6.5rem] md:justify-end whitespace-nowrap">' +
      '<span class="pub-switch' + (t.published ? ' on' : '') + '"></span>' + (t.published ? '上架中' : '已下架') +
    '</button>' +
    '<div class="flex gap-1 flex-wrap w-full md:w-auto md:flex-nowrap pl-8 md:pl-0">' + actions + '</div>' +
  '</div>';
}

function openCreateTaskFor(catId) {
  STATE.activeCategoryId = catId;
  CONTENT_SCROLL_PENDING = true;
  openCreateTaskModal();
}

function toggleCategoryCollapse(id) {
  if (CONTENT_COLLAPSED[id]) delete CONTENT_COLLAPSED[id]; else CONTENT_COLLAPSED[id] = true;
  renderTaskGrid();
}

function allCategoriesCollapsed() {
  return STATE.categories.length > 0 && STATE.categories.every(function (c) { return CONTENT_COLLAPSED[c.id]; });
}

function toggleAllCategories() {
  var collapse = !allCategoriesCollapsed();
  CONTENT_COLLAPSED = {};
  if (collapse) STATE.categories.forEach(function (c) { CONTENT_COLLAPSED[c.id] = true; });
  goto('teacherDashboard');
}

function onCategoryReordered(orderedIds) {
  orderedIds.forEach(function (id, idx) {
    var c = STATE.categories.find(function (x) { return x.id === id; });
    if (c) c.order = idx;
  });
  STATE.categories.sort(function (a, b) { return a.order - b.order; });
  renderTaskGrid(); // 更新編號、顏色與左側目錄
  api('reorderCategories', orderedIds).then(function (res) {
    if (!res.success) toast(res.message, 'error');
  });
}

function addCategoryPrompt() {
  promptDialog('新增分類頁籤名稱', '例如：單元一 / 課前預習').then(function (name) {
    if (!name) return;
    setLoading(true);
    api('createCategory', STATE.currentClass.id, name).then(function (res) {
      setLoading(false);
      if (res.success) { STATE.categories.push(res.data); STATE.activeCategoryId = res.data.id; CONTENT_SCROLL_PENDING = true; toast('新增成功', 'success'); goto('teacherDashboard'); }
      else toast(res.message, 'error');
    });
  });
}

function renameCategoryPrompt(id) {
  var c = STATE.categories.find(function (x) { return x.id === id; });
  promptDialog('分類重新命名', '', c ? c.name : '').then(function (name) {
    if (!name) return;
    setLoading(true);
    api('renameCategory', id, name).then(function (res) {
      setLoading(false);
      if (res.success) { c.name = name; toast('已更新', 'success'); goto('teacherDashboard'); }
      else toast(res.message, 'error');
    });
  });
}

function deleteCategoryConfirm(id) {
  confirmDialog('確定要刪除此分類嗎？分類內所有任務也會一併刪除。').then(function (ok) {
    if (!ok) return;
    setLoading(true);
    api('deleteCategory', id).then(function (res) {
      setLoading(false);
      if (res.success) {
        STATE.categories = STATE.categories.filter(function (c) { return c.id !== id; });
        STATE.tasks = STATE.tasks.filter(function (t) { return t.categoryId !== id; });
        STATE.activeCategoryId = STATE.categories[0] ? STATE.categories[0].id : null;
        toast('已刪除', 'success'); goto('teacherDashboard');
      } else toast(res.message, 'error');
    });
  });
}

function onTaskReordered(orderedIds) {
  orderedIds.forEach(function (id, idx) {
    var t = STATE.tasks.find(function (x) { return x.id === id; });
    if (t) t.order = idx;
  });
  api('reorderTasks', orderedIds).then(function (res) {
    if (!res.success) toast(res.message, 'error');
  });
}

function togglePublish(taskId, val) {
  api('toggleTaskPublish', taskId, val).then(function (res) {
    if (res.success) { STATE.tasks.find(function (t) { return t.id === taskId; }).published = val; syncClassCache(); renderTaskGrid(); toast(res.message, 'success'); }
    else toast(res.message, 'error');
  });
}

function deleteTaskConfirm(taskId) {
  confirmDialog('確定要刪除此任務嗎？相關的繳交紀錄與題庫也會一併刪除。').then(function (ok) {
    if (!ok) return;
    setLoading(true);
    api('deleteTask', taskId).then(function (res) {
      setLoading(false);
      if (res.success) { STATE.tasks = STATE.tasks.filter(function (t) { return t.id !== taskId; }); syncClassCache(); toast('已刪除', 'success'); renderTaskGrid(); }
      else toast(res.message, 'error');
    });
  });
}
