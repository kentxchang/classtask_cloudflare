/* ============================================================
 * 11. 學生入口：先登入學生帳號，再選擇要進入的課堂
 * ============================================================ */
function viewStudentLogin() {
  // 上課簽到：板夾＋橫線簽到單
  return headerBar('學生登入', "goto('landing')") +
  '<div class="max-w-md mx-auto px-4 pt-10 pb-8">' +
    '<div class="clipboard">' +
      '<span class="clipboard-clip"></span>' +
      '<div class="clipboard-paper">' +
        '<div class="text-center">' +
          '<div class="text-xl font-bold text-slate-700 tracking-widest">📋 上課簽到單</div>' +
          '<div class="text-xs text-slate-400 mt-1">' + chalkboardDate() + '</div>' +
        '</div>' +
        '<label class="line-label" for="sl-name">我的姓名</label>' +
        '<select id="sl-name" class="line-input"><option>載入中…</option></select>' +
        '<div id="sl-pwd-box">' +
          '<label class="line-label" for="sl-pwd">我的密碼</label>' +
          '<input id="sl-pwd" type="password" class="line-input">' +
        '</div>' +
        '<div id="sl-no-pwd-hint" class="hidden text-xs mt-4 p-3 leading-relaxed text-slate-600" style="background:#fff3a8;transform:rotate(-1deg);box-shadow:0 2px 4px rgba(0,0,0,.15)">💡 老師已開啟免密碼登入：選好你的姓名，按「確認登入」就能直接進教室！</div>' +
        '<button id="sl-login-btn" onclick="submitStudentLogin()" class="cls-btn cls-btn-wood w-full py-3 text-lg mt-7">登入</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

var STUDENT_NO_PASSWORD_MODE = false;

function wireStudentLoginRoster() {
  api('getStudentRoster').then(function (res) {
    var sel = document.getElementById('sl-name');
    if (!sel) return;
    if (!res.success || !res.data || res.data.length === 0) {
      sel.innerHTML = '<option value="">尚無學生名單，請聯絡老師</option>';
      return;
    }
    sel.innerHTML = '<option value="">-- 請選擇你的姓名 --</option>' + res.data.map(function (s) {
      return '<option value="' + s.id + '">' + escapeHtml(s.name) + '</option>';
    }).join('');

    STUDENT_NO_PASSWORD_MODE = !!res.noPassword;
    var pwdBox = document.getElementById('sl-pwd-box');
    var hint = document.getElementById('sl-no-pwd-hint');
    var btn = document.getElementById('sl-login-btn');
    if (STUDENT_NO_PASSWORD_MODE) {
      if (pwdBox) pwdBox.style.display = 'none';
      if (hint) hint.classList.remove('hidden');
      if (btn) btn.textContent = '確認登入';
    } else {
      if (pwdBox) pwdBox.style.display = '';
      if (hint) hint.classList.add('hidden');
      if (btn) btn.textContent = '登入';
    }
  });
}

function submitStudentLogin() {
  var sel = document.getElementById('sl-name');
  var sid = sel ? sel.value : '';
  var pwdInput = document.getElementById('sl-pwd');
  var pwd = pwdInput ? pwdInput.value.trim() : '';
  if (!sid) return toast('請選擇姓名', 'error');
  if (!STUDENT_NO_PASSWORD_MODE && !pwd) return toast('請輸入密碼', 'error');
  setLoading(true);
  api('loginStudent', sid, pwd).then(function (res) {
    setLoading(false);
    if (!res.success) return toast(res.message, 'error');
    PREVIEW_MODE = false;
    STATE.student = { studentId: res.data.id, name: res.data.name, classId: null, className: '' };
    goto('studentClassPicker');
  });
}
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter') return;
  var p = document.getElementById('sl-pwd');
  var n = document.getElementById('sl-name');
  if ((p && document.activeElement === p) || (n && document.activeElement === n)) submitStudentLogin();
});

var STU_CLASS_CACHE = {};

function viewStudentClassPicker() {
  var s = STATE.student;
  return '<div class="max-w-5xl mx-auto px-4 pt-6 pb-16">' +
    '<div class="flex items-center justify-between flex-wrap gap-3 mb-6">' +
      '<div class="flex items-center gap-3">' +
        '<div class="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white flex-shrink-0" style="background:#7d6650">' + escapeHtml(String(s.name || '?').slice(-2)) + '</div>' +
        '<div>' +
          '<h1 class="text-xl font-bold text-slate-700">' + timeGreeting() + '，' + escapeHtml(s.name) + '</h1>' +
          '<div class="text-sm text-slate-400 mt-0.5">今天要走進哪一間教室呢？點一下教室門就能進入。</div>' +
        '</div>' +
      '</div>' +
      '<button onclick="studentLogout()" class="cls-btn cls-btn-paper px-4 py-2 text-sm text-slate-400">登出</button>' +
    '</div>' +
    '<div class="hallway"><div class="hallway-grid" id="stu-class-grid">' +
      '<div class="col-span-full text-slate-400 text-center py-16">載入中…</div>' +
    '</div></div>' +
  '</div>';
}

function wireStudentClassPicker() {
  // 一次回傳學生所有課堂＋各課堂的任務完成狀態，並預先寫入 STU_DATA_CACHE，
  // 讓學生點進任何一堂課都能立即顯示，不必再等伺服器。
  api('getAllClassesForStudentWithTasks', STATE.student.studentId).then(function (res) {
    var grid = document.getElementById('stu-class-grid');
    if (!grid) return;
    if (!res.success) { grid.innerHTML = '<div class="text-red-500 col-span-full text-center py-10">' + res.message + '</div>'; return; }
    var list = res.classes;
    STU_CLASS_CACHE = {};
    list.forEach(function (c) { STU_CLASS_CACHE[c.id] = c; });
    Object.keys(res.details || {}).forEach(function (cid) { STU_DATA_CACHE[cid] = res.details[cid]; });

    if (list.length === 0) {
      grid.innerHTML = '<div class="text-slate-400 col-span-full text-center py-16 px-6">🚪 你還沒有被加入任何教室，請洽老師協助將你加入課堂名單。</div>';
      return;
    }

    if (INIT_JOIN_CODE) {
      var matched = list.find(function (c) { return String(c.joinCode).toUpperCase() === String(INIT_JOIN_CODE).toUpperCase(); });
      if (matched) { enterStudentClass(matched); return; }
    }

    // 每間教室門上貼便利貼：需要訂正／未完成數量／全部完成
    grid.innerHTML = list.map(function (c, idx) {
      var tasks = (res.details && res.details[c.id] && res.details[c.id].tasks) || [];
      var n = function (st) { return tasks.filter(function (t) { return t.status === st; }).length; };
      var notes = [];
      if (n('退回')) notes.push({ text: '需訂正 ' + n('退回'), color: '#f6c6cf' });
      if (n('未完成')) notes.push({ text: '未完成 ' + n('未完成'), color: '#fff3a8' });
      if (tasks.length && n('已完成') === tasks.length) notes.push({ text: '全部完成', color: '#cfe8c2' });
      return classroomDoorHtml({
        name: c.name, subject: c.subject, colorIdx: idx, fnName: 'enterStudentClassById', arg: c.id, notes: notes,
        tag: tasks.length ? '完成 ' + n('已完成') + ' / ' + tasks.length : ''
      }, idx);
    }).join('');
  });
}

function enterStudentClassById(classId) {
  var c = STU_CLASS_CACHE[classId];
  if (c) enterStudentClass(c);
}

function enterStudentClass(c) {
  STATE.student.classId = c.id;
  STATE.student.className = c.name;
  goto('studentDashboard');
}

function switchStudentClass() {
  STATE.student.classId = null; STATE.student.className = '';
  goto('studentClassPicker');
}
