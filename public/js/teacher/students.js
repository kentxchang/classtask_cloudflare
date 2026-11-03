/* ============================================================
 * 8. 學生名單分頁（顯示課堂已指派的學生，從全校總名單勾選加入）
 * ============================================================ */
function renderStudentsTab(body) {
  var classId = STATE.currentClass.id;
  // 座位表：前方是黑板與講台，每位學生一張課桌（桌上名牌＋密碼）
  body.innerHTML = '<div class="flex justify-between items-center mb-4 flex-wrap gap-2">' +
      '<div class="text-sm text-slate-400 max-w-md">這是本課堂的座位表，學生來自「學生總名單」。點課桌右上角的 ✕ 可把學生移出此課堂。</div>' +
      '<button onclick="openEnrollmentPicker()" class="cls-btn cls-btn-persimmon px-4 py-2 text-sm">🗂 管理課堂名單</button>' +
    '</div>' +
    '<div class="classroom-floor">' +
      '<div class="podium"><div class="podium-board">黑　板</div><div class="podium-desk">講　台</div></div>' +
      '<div id="student-table"><div class="text-slate-400 text-center py-8">載入中…</div></div>' +
    '</div>';
  loadWithCache(STUDENTS_TAB_CACHE, classId, function () { return api('getEnrolledStudents', classId); }, function (res) {
    if (!STATE.currentClass || STATE.currentClass.id !== classId || STATE.teacherClassTab !== 'students') return;
    var el = document.getElementById('student-table');
    if (!el) return;
    if (res.data.length === 0) { el.innerHTML = '<div class="text-center py-8 font-bold" style="color:#7a5f3d">教室裡還沒有學生，點選「🗂 管理課堂名單」開始加入。</div>'; return; }
    el.innerHTML = '<div class="text-xs font-bold text-center mb-4" style="color:#7a5f3d">全班 ' + res.data.length + ' 位同學</div>' +
      '<div class="seat-grid">' + res.data.map(function (s) {
        return '<div class="desk">' +
          '<button onclick="unenrollStudent(\'' + s.id + '\')" class="desk-remove" title="將 ' + escapeHtml(s.name) + ' 移出此課堂">✕</button>' +
          '<div class="desk-top">' +
            '<div class="name-tent">' + escapeHtml(s.name) + '</div>' +
            '<div class="desk-pwd">密碼 ' + escapeHtml(s.password) + '</div>' +
          '</div>' +
          '<div class="chair"></div>' +
        '</div>';
      }).join('') + '</div>';
  }, function (msg) {
    var el = document.getElementById('student-table');
    if (el) el.innerHTML = '<div class="text-red-500">' + msg + '</div>';
  });
}

function unenrollStudent(studentId) {
  confirmDialog('確定要將此學生移出本課堂嗎？（不會刪除學生帳號本身，僅取消此課堂的指派）').then(function (ok) {
    if (!ok) return;
    setLoading(true);
    api('getEnrolledStudentIds', STATE.currentClass.id).then(function (idsRes) {
      var ids = (idsRes.data || []).filter(function (id) { return id !== studentId; });
      return api('setClassEnrollment', STATE.currentClass.id, ids);
    }).then(function (res) {
      setLoading(false);
      if (res.success) { delete STUDENTS_TAB_CACHE[STATE.currentClass.id]; toast('已移出課堂', 'success'); renderStudentsTab(document.getElementById('class-tab-body')); }
      else toast(res.message, 'error');
    });
  });
}

function openEnrollmentPicker() {
  setLoading(true);
  Promise.all([api('getStudentRoster'), api('getEnrolledStudentIds', STATE.currentClass.id)]).then(function (rs) {
    setLoading(false);
    var students = rs[0].success ? rs[0].data : [];
    var enrolledIds = rs[1].success ? rs[1].data : [];
    openModal(
      '<div class="text-lg font-bold mb-1">🗂 管理課堂名單</div>' +
      '<div class="text-xs text-slate-400 mb-3">勾選要加入「' + escapeHtml(STATE.currentClass.name) + '」的學生。找不到學生嗎？請先到「👥 學生總名單」新增帳號。</div>' +
      '<div class="flex justify-end mb-1"><button type="button" onclick="toggleAllEnrollChecks(\'ep-student-list\')" class="text-xs font-bold text-blue-600 hover:underline">全選／全不選</button></div>' +
      '<div id="ep-student-list" class="max-h-64 overflow-y-auto border-2 border-blue-100 rounded-xl p-2 mb-5 grid grid-cols-2 gap-1">' +
        (students.length === 0 ? '<div class="text-slate-400 text-sm col-span-2 py-4 text-center">學生總名單目前是空的</div>' : renderStudentCheckboxList(students, enrolledIds)) +
      '</div>' +
      '<button onclick="submitEnrollmentPicker()" class="w-full py-3 rounded-xl btn-primary text-lg">儲存課堂名單</button>',
      { wide: true }
    );
  });
}

function submitEnrollmentPicker() {
  var ids = getCheckedEnrollIds('ep-student-list');
  setLoading(true);
  api('setClassEnrollment', STATE.currentClass.id, ids).then(function (res) {
    setLoading(false);
    if (res.success) { delete STUDENTS_TAB_CACHE[STATE.currentClass.id]; closeModal(); toast(res.message, 'success'); renderStudentsTab(document.getElementById('class-tab-body')); }
    else toast(res.message, 'error');
  });
}

/* ============================================================
 * 8.5 學生總名單（全校通用，教師後台獨立管理）
 * ============================================================ */
var GLOBAL_STUDENTS_CACHE = {};

function openGlobalRosterModal() {
  setLoading(true);
  api('getAllStudents').then(function (res) {
    setLoading(false);
    if (!res.success) return toast(res.message, 'error');
    renderGlobalRosterModal(res.data);
  });
}

function renderGlobalRosterModal(list) {
  GLOBAL_STUDENTS_CACHE = {};
  list.forEach(function (s) { GLOBAL_STUDENTS_CACHE[s.id] = s; });
  openModal(
    '<div class="text-lg font-bold mb-1">👥 學生總名單</div>' +
    '<div class="text-xs text-slate-400 mb-4">此名單為全校（全平台）共用，建立後即可在各課堂的「學生名單」分頁勾選指派。</div>' +
    '<div class="flex gap-2 mb-4 flex-wrap justify-between items-center">' +
      '<div class="flex gap-2 flex-wrap">' +
        '<button onclick="openAddStudentModal()" class="px-4 py-2 rounded-xl btn-primary text-sm">＋ 新增單一學生</button>' +
        '<button onclick="openBatchStudentModal()" class="px-4 py-2 rounded-xl btn-accent text-sm">＋ 批次新增學生</button>' +
      '</div>' +
      '<button onclick="openStudentLoginSettingsModal()" class="px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-sm">⚙️ 學生免密碼登入設定</button>' +
    '</div>' +
    '<div class="overflow-x-auto max-h-96 overflow-y-auto">' +
    (list.length === 0 ? '<div class="text-slate-400 text-center py-8">尚未建立任何學生帳號</div>' :
      '<table class="w-full text-sm"><thead><tr class="text-left text-slate-400 border-b"><th class="py-2">姓名</th><th>密碼</th><th>建立時間</th><th class="text-right">操作</th></tr></thead><tbody>' +
      list.map(function (s) {
        return '<tr class="border-b border-slate-50">' +
          '<td class="py-2.5 font-bold text-slate-700">' + escapeHtml(s.name) + '</td>' +
          '<td class="text-slate-500">' + escapeHtml(s.password) + '</td>' +
          '<td class="text-slate-400">' + fmtDate(s.createdAt) + '</td>' +
          '<td class="text-right space-x-3">' +
            '<button onclick="resetPwdPrompt(\'' + s.id + '\')" class="text-blue-600 font-bold hover:underline">重設密碼</button>' +
            '<button onclick="deleteStudentConfirm(\'' + s.id + '\')" class="text-red-500 font-bold hover:underline">刪除</button>' +
          '</td>' +
        '</tr>';
      }).join('') + '</tbody></table>') +
    '</div>',
    { wide: true }
  );
}

function openAddStudentModal() {
  openModal(
    '<div class="text-lg font-bold mb-4">新增單一學生</div>' +
    '<input id="as-name" placeholder="學生姓名" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mb-3">' +
    '<input id="as-pwd" placeholder="登入密碼" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mb-5">' +
    '<button onclick="submitAddStudent()" class="w-full py-3 rounded-xl btn-primary text-lg">新增</button>'
  );
}

function submitAddStudent() {
  var name = document.getElementById('as-name').value.trim();
  var pwd = document.getElementById('as-pwd').value.trim();
  if (!name || !pwd) return toast('姓名與密碼皆為必填', 'error');
  setLoading(true);
  api('createStudent', name, pwd).then(function (res) {
    setLoading(false);
    if (res.success) { toast(res.message, 'success'); openGlobalRosterModal(); }
    else toast(res.message, 'error');
  });
}

function openBatchStudentModal() {
  openModal(
    '<div class="text-lg font-bold mb-2">批次新增學生</div>' +
    '<div class="text-xs text-slate-400 mb-3">每行一位學生，格式：姓名,密碼</div>' +
    '<textarea id="bs-text" rows="8" placeholder="小明,1234\n小華,5678" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mb-4 text-sm"></textarea>' +
    '<button onclick="submitBatchStudent()" class="w-full py-3 rounded-xl btn-accent text-lg">批次新增</button>'
  );
}

function submitBatchStudent() {
  var text = document.getElementById('bs-text').value.trim();
  if (!text) return toast('請輸入學生名單', 'error');
  setLoading(true);
  api('batchCreateStudents', text).then(function (res) {
    setLoading(false);
    if (res.success) { toast(res.message, 'success'); openGlobalRosterModal(); }
    else toast(res.message, 'error');
  });
}

function resetPwdPrompt(id) {
  var s = GLOBAL_STUDENTS_CACHE[id];
  var name = s ? s.name : '';
  promptDialog('重設「' + escapeHtml(name) + '」的密碼', '新密碼').then(function (pwd) {
    if (!pwd) return;
    setLoading(true);
    api('resetStudentPassword', id, pwd).then(function (res) {
      setLoading(false);
      if (res.success) { toast('密碼已重設', 'success'); openGlobalRosterModal(); }
      else toast(res.message, 'error');
    });
  });
}

function deleteStudentConfirm(id) {
  confirmDialog('確定要刪除此學生帳號嗎？將同時從所有課堂名單中移除（歷史繳交紀錄仍會保留）。').then(function (ok) {
    if (!ok) return;
    setLoading(true);
    api('deleteStudent', id).then(function (res) {
      setLoading(false);
      if (res.success) { toast('已刪除', 'success'); openGlobalRosterModal(); }
      else toast(res.message, 'error');
    });
  });
}

/* ============================================================
 * 8.6 學生登入方式設定（免密碼登入開關）
 * ============================================================ */
function openStudentLoginSettingsModal() {
  setLoading(true);
  api('getStudentLoginSettings').then(function (res) {
    setLoading(false);
    if (!res.success) return toast(res.message, 'error');
    renderStudentLoginSettingsModal(!!res.noPassword);
  });
}

function renderStudentLoginSettingsModal(isNoPwd) {
  openModal(
    '<div class="text-xl font-black text-blue-800 mb-2">⚙️ 學生免密碼登入設定</div>' +
    '<div class="text-xs text-slate-500 mb-5">設定學生進入系統時的驗證方式。</div>' +
    '<div class="space-y-4 mb-6">' +
      '<label class="flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ' + (isNoPwd ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-indigo-200') + '">' +
        '<input type="radio" name="stu-login-mode" value="nopwd" ' + (isNoPwd ? 'checked' : '') + ' class="mt-1 w-4 h-4 text-indigo-600 focus:ring-indigo-500">' +
        '<div>' +
          '<div class="font-bold text-slate-800 flex items-center gap-2"><span>🔓 啟用免密碼登入（僅選姓名即可登入）</span><span class="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">推薦</span></div>' +
          '<div class="text-xs text-slate-500 mt-1.5 leading-relaxed">啟用後，學生在登入頁面只要選擇自己的姓名，確認後即可直接登入，無須輸入密碼。非常適合國小學生或課堂快速操作。</div>' +
        '</div>' +
      '</label>' +
      '<label class="flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ' + (!isNoPwd ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-indigo-200') + '">' +
        '<input type="radio" name="stu-login-mode" value="pwd" ' + (!isNoPwd ? 'checked' : '') + ' class="mt-1 w-4 h-4 text-indigo-600 focus:ring-indigo-500">' +
        '<div>' +
          '<div class="font-bold text-slate-800 flex items-center gap-2"><span>🔒 需輸入密碼登入</span><span class="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">安全驗證</span></div>' +
          '<div class="text-xs text-slate-500 mt-1.5 leading-relaxed">學生需先選擇自己的姓名，並輸入正確的密碼才能登入。</div>' +
        '</div>' +
      '</label>' +
    '</div>' +
    '<div class="flex gap-3 justify-end">' +
      '<button onclick="closeModal()" class="px-5 py-2.5 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600">取消</button>' +
      '<button onclick="saveStudentLoginSettings()" class="px-5 py-2.5 rounded-xl btn-primary font-bold">儲存設定</button>' +
    '</div>'
  );
}

function saveStudentLoginSettings() {
  var radios = document.getElementsByName('stu-login-mode');
  var noPwd = false;
  for (var i = 0; i < radios.length; i++) {
    if (radios[i].checked && radios[i].value === 'nopwd') {
      noPwd = true;
      break;
    }
  }
  setLoading(true);
  api('setStudentLoginSettings', noPwd).then(function (res) {
    setLoading(false);
    if (res.success) {
      toast(res.message, 'success');
      closeModal();
    } else {
      toast(res.message, 'error');
    }
  });
}
