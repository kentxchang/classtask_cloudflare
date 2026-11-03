/* ============================================================
 * 2. 全域狀態 / 路由
 * ============================================================ */
var STATE = {
  view: 'landing',
  webAppUrl: '',
  teacher: { loggedIn: false },
  student: { classId: null, studentId: null, name: null, className: '' },
  currentClass: null,
  categories: [],
  tasks: [],
  activeCategoryId: null,
  teacherClassTab: 'content'
};

/* ============================================================
 * 2.5 前端載入加速：預先快取（點入課堂／切換分頁時優先秒開，背景仍會靜默更新最新資料）
 * ============================================================ */
var CLASS_CACHE = {};        // 教師端：課堂ID -> { classInfo, categories, tasks, activeCategoryId }
var STU_DATA_CACHE = {};     // 學生端：課堂ID -> getTasksForStudent() 回傳結果
var STUDENTS_TAB_CACHE = {}; // 教師端「學生名單」分頁：課堂ID -> 已加入學生陣列
var GRADING_CACHE = {};      // 教師端「批改總覽」分頁：課堂ID -> getClassOverview() 回傳結果
var GALLERY_MGMT_CACHE = {}; // 教師端「作品藝廊」管理分頁：課堂ID -> getGalleryManagementData() 回傳結果
var TEACHER_PWD_SET_CACHE = null; // 首頁預先得知是否已設定教師密碼，讓「教師入口」點下去不必再等一次來回

// 通用「先顯示快取、背景仍取得最新資料」工具：cache 命中時立即以舊資料回呼一次（fromCache=true），
// 稍後拿到最新資料後再回呼一次（fromCache=false）並更新快取；沒有快取時只會在資料到達後回呼一次。
function loadWithCache(cache, key, fetchFn, onData, onError) {
  var cached = cache[key];
  if (cached) onData(cached, true);
  fetchFn().then(function (res) {
    if (!res || !res.success) { if (!cached && onError) onError(res ? res.message : '載入失敗'); return; }
    cache[key] = res;
    onData(res, false);
  }).catch(function (e) { if (!cached && onError) onError('' + e); });
}

// 課堂內容（分類＋任務）目前存放在 STATE.categories / STATE.tasks 並會被許多操作直接就地修改，
// 每次重新渲染課堂詳細頁時同步寫回 CLASS_CACHE，確保快取內容與畫面上看到的資料一致。
function syncClassCache() {
  if (!STATE.currentClass) return;
  CLASS_CACHE[STATE.currentClass.id] = {
    classInfo: STATE.currentClass,
    categories: STATE.categories,
    tasks: STATE.tasks,
    activeCategoryId: STATE.activeCategoryId
  };
}

function goto(view) { STATE.view = view; render(); window.scrollTo(0, 0); }

function render() {
  var app = document.getElementById('app');
  switch (STATE.view) {
    case 'landing': app.innerHTML = viewLanding(); wireLanding(); break;
    case 'teacherSetup': app.innerHTML = viewTeacherSetup(); break;
    case 'teacherLogin': app.innerHTML = viewTeacherLogin(); break;
    case 'teacherDashboard': app.innerHTML = viewTeacherDashboard(); wireTeacherDashboard(); break;
    case 'studentLogin': app.innerHTML = viewStudentLogin(); wireStudentLoginRoster(); break;
    case 'studentClassPicker': app.innerHTML = viewStudentClassPicker(); wireStudentClassPicker(); break;
    case 'studentDashboard': app.innerHTML = viewStudentDashboard(); wireStudentDashboard(); break;
  }
}

function headerBar(title, onBack) {
  return '<div class="max-w-6xl mx-auto px-4 pt-6 pb-2 flex items-center gap-3">' +
    (onBack ? '<button onclick="' + onBack + '" title="返回" class="cls-btn cls-btn-paper cls-btn-round">←</button>' : '') +
    '<h1 class="text-xl md:text-2xl font-bold text-slate-700 tracking-wide">' + title + '</h1>' +
  '</div>';
}
