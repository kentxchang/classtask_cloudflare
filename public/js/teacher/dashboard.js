/* ============================================================
 * 5. 教師儀表板：課堂列表
 * ============================================================ */
function loadTeacherDashboard() {
  STATE.currentClass = null;
  goto('teacherDashboard');
}

function teacherLogout() {
  STATE.teacher = { loggedIn: false };
  TEACHER_TOKEN = '';
  STATE.currentClass = null;
  STATE.categories = []; STATE.tasks = []; STATE.activeCategoryId = null;
  TEACHER_CLASSES_CACHE = [];
  CLASS_CACHE = {}; STUDENTS_TAB_CACHE = {}; GRADING_CACHE = {}; GALLERY_MGMT_CACHE = {};
  goto('landing');
}

var TEACHER_CLASSES_CACHE = [];

function viewTeacherDashboard() {
  if (STATE.currentClass) return viewClassDetail();
  return headerBar('教師儀表板・課堂管理', null) +
  '<div class="max-w-6xl mx-auto px-4 pb-16">' +
    '<div class="flex justify-end gap-2 mb-4 flex-wrap">' +
      '<button onclick="openStudentLoginSettingsModal()" class="cls-btn cls-btn-paper px-4 py-2.5 text-sm">⚙️ 學生免密碼登入設定</button>' +
      '<button onclick="openGlobalRosterModal()" class="cls-btn cls-btn-paper px-4 py-2.5 text-sm">👥 學生總名單</button>' +
      '<button onclick="openStorageManager()" class="cls-btn cls-btn-paper px-4 py-2.5 text-sm">💾 空間管理</button>' +
      '<button onclick="openCreateClassModal()" class="cls-btn cls-btn-persimmon px-4 py-2.5 text-sm">＋ 建立新課堂</button>' +
      '<button onclick="teacherLogout()" class="cls-btn cls-btn-paper px-4 py-2.5 text-sm text-slate-400">🚪 登出</button>' +
    '</div>' +
    '<div class="text-sm text-slate-400 mb-3">點一下教室門就能進入課堂；門上便利貼是學生加入用的課堂代碼。</div>' +
    '<div class="hallway"><div id="class-list-grid" class="hallway-grid">' +
      '<div class="text-slate-400 col-span-full text-center py-16">載入中…</div>' +
    '</div></div>' +
  '</div>';
}

function wireTeacherDashboard() {
  if (STATE.currentClass) { wireClassDetail(); return; }
  // 一次回傳課堂列表＋每堂課的分類與任務，並全數預先寫入 CLASS_CACHE，
  // 之後點入任何一堂課都能直接從快取秒開，不必再等伺服器來回。
  api('getAllClassesWithDetails').then(function (res) {
    if (!res.success) return toast(res.message, 'error');
    TEACHER_CLASSES_CACHE = res.classes;
    Object.keys(res.details).forEach(function (cid) {
      var d = res.details[cid];
      var existing = CLASS_CACHE[cid];
      CLASS_CACHE[cid] = {
        classInfo: d.classInfo,
        categories: d.categories || [],
        tasks: d.tasks || [],
        activeCategoryId: (existing && (d.categories || []).some(function (c) { return c.id === existing.activeCategoryId; })) ? existing.activeCategoryId : ((d.categories && d.categories[0]) ? d.categories[0].id : null)
      };
    });
    var grid = document.getElementById('class-list-grid');
    if (!grid) return;
    if (res.classes.length === 0) {
      grid.innerHTML = '<div class="text-slate-400 col-span-full text-center pb-2 px-6">走廊上還沒有任何教室，點下方的空門口建立第一個課堂。</div>' +
        emptyDoorwayHtml('建立新課堂', 'openCreateClassModal()', 0);
      return;
    }
    // 每間教室一扇門：班級牌寫課堂名稱與科目，門上便利貼寫加入代碼，最後一扇是「建立新課堂」的空門口
    grid.innerHTML = res.classes.map(function (c, idx) {
      var taskCount = ((res.details[c.id] && res.details[c.id].tasks) || []).length;
      return classroomDoorHtml({
        name: c.name, subject: c.subject || '未設定科目', colorIdx: idx, fnName: 'openClass', arg: c.id,
        notes: [{ text: '代碼 ' + c.joinCode, color: '#fff3a8' }],
        tag: taskCount + ' 個任務', title: '進入 ' + c.name + '（建立於 ' + fmtDate(c.createdAt) + '）'
      }, idx);
    }).join('') + emptyDoorwayHtml('建立新課堂', 'openCreateClassModal()', res.classes.length);
  });
}

function repairFileSharing() {
  confirmDialog('此操作會將「上傳的資料」資料夾內所有已上傳的檔案（PDF頁面、照片、手繪作品等）權限修正為「知道連結的使用者皆可檢視」，讓學生在任何裝置都能正常看到圖片。檔案較多時可能需要一些時間，確定要執行嗎？', '開始修復').then(function (ok) {
    if (!ok) return;
    setLoading(true, '正在修復檔案權限，請稍候…');
    api('repairAllFileSharing').then(function (res) {
      setLoading(false);
      if (res.success) toast(res.message, 'success'); else toast(res.message, 'error');
    }).catch(function (err) { setLoading(false); toast('' + err, 'error'); });
  });
}

function openCreateClassModal() {
  setLoading(true);
  api('getStudentRoster').then(function (res) {
    setLoading(false);
    var students = res.success ? res.data : [];
    openModal(
      '<div class="text-lg font-bold mb-4">建立新課堂</div>' +
      '<label class="text-sm font-bold text-slate-500">課堂名稱</label>' +
      '<input id="nc-name" placeholder="例如：5年2班 自然科" class="w-full border-2 border-blue-100 focus:border-blue-400 outline-none rounded-xl px-4 py-2.5 mt-1 mb-3">' +
      '<label class="text-sm font-bold text-slate-500">科目 / 說明（選填）</label>' +
      '<input id="nc-subject" placeholder="例如：自然科" class="w-full border-2 border-blue-100 focus:border-blue-400 outline-none rounded-xl px-4 py-2.5 mt-1 mb-3">' +
      '<div class="flex items-center justify-between mb-1">' +
        '<label class="text-sm font-bold text-slate-500">選擇加入此課堂的學生（可不選，之後再到「學生名單」分頁指派）</label>' +
        '<button type="button" onclick="toggleAllEnrollChecks(\'nc-student-list\')" class="text-xs font-bold text-blue-600 hover:underline whitespace-nowrap ml-2">全選／全不選</button>' +
      '</div>' +
      '<div id="nc-student-list" class="max-h-48 overflow-y-auto border-2 border-blue-100 rounded-xl p-2 mb-5 grid grid-cols-2 gap-1">' +
        (students.length === 0 ? '<div class="text-slate-400 text-sm col-span-2 py-4 text-center">尚無學生，請先於「👥 學生總名單」新增</div>' : renderStudentCheckboxList(students, [])) +
      '</div>' +
      '<button onclick="submitCreateClass()" class="w-full py-3 rounded-xl btn-primary text-lg">建立課堂</button>',
      { wide: true }
    );
  });
}

function renderStudentCheckboxList(students, checkedIds) {
  return students.map(function (s) {
    var checked = checkedIds.indexOf(s.id) !== -1;
    return '<label class="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-blue-50 cursor-pointer text-sm">' +
      '<input type="checkbox" class="enroll-chk" value="' + s.id + '" ' + (checked ? 'checked' : '') + '> ' + escapeHtml(s.name) +
    '</label>';
  }).join('');
}

function toggleAllEnrollChecks(containerId) {
  var boxes = document.querySelectorAll('#' + containerId + ' .enroll-chk');
  var allChecked = true;
  Array.prototype.forEach.call(boxes, function (b) { if (!b.checked) allChecked = false; });
  Array.prototype.forEach.call(boxes, function (b) { b.checked = !allChecked; });
}

function getCheckedEnrollIds(containerId) {
  var boxes = document.querySelectorAll('#' + containerId + ' .enroll-chk:checked');
  return Array.prototype.map.call(boxes, function (b) { return b.value; });
}

function submitCreateClass() {
  var name = document.getElementById('nc-name').value.trim();
  var subject = document.getElementById('nc-subject').value.trim();
  if (!name) return toast('請輸入課堂名稱', 'error');
  var studentIds = getCheckedEnrollIds('nc-student-list');
  setLoading(true);
  api('createClass', { name: name, subject: subject }).then(function (res) {
    if (!res.success) { setLoading(false); toast(res.message, 'error'); return null; }
    if (studentIds.length === 0) return res;
    return api('setClassEnrollment', res.classId, studentIds).then(function () { return res; });
  }).then(function (res) {
    setLoading(false);
    if (res && res.success) { closeModal(); toast('課堂建立成功！', 'success'); wireTeacherDashboard(); }
  }).catch(function (e) { setLoading(false); toast('' + e, 'error'); });
}

function openClass(classId) {
  var cached = CLASS_CACHE[classId];
  if (cached) {
    STATE.currentClass = cached.classInfo;
    STATE.categories = cached.categories;
    STATE.tasks = cached.tasks;
    STATE.activeCategoryId = cached.activeCategoryId && cached.categories.some(function (c) { return c.id === cached.activeCategoryId; }) ? cached.activeCategoryId : (cached.categories[0] ? cached.categories[0].id : null);
    STATE.teacherClassTab = 'content';
    goto('teacherDashboard');
    return;
  }
  // 快取還沒準備好時（例如課堂列表尚未載入完成就被點擊）才 fallback 呼叫伺服器
  setLoading(true);
  api('getClassDetailBundle', classId).then(function (res) {
    setLoading(false);
    if (!res.success) return toast(res.message, 'error');
    STATE.currentClass = res.data.classInfo;
    STATE.categories = res.data.categories || [];
    STATE.tasks = res.data.tasks || [];
    STATE.activeCategoryId = STATE.categories[0] ? STATE.categories[0].id : null;
    STATE.teacherClassTab = 'content';
    syncClassCache();
    goto('teacherDashboard');
  }).catch(function (e) { setLoading(false); toast('' + e, 'error'); });
}

function backToClassList() { STATE.currentClass = null; goto('teacherDashboard'); }

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function isSafeHttpUrl(url) {
  return /^https?:\/\//i.test(String(url || '').trim());
}
