/* ============================================================
 * 4. 教師登入 / 密碼設定
 * ============================================================ */
function viewTeacherSetup() {
  // 教師辦公室：門牌＋線圈筆記本
  return headerBar('教師密碼設定', "goto('landing')") +
  '<div class="max-w-md mx-auto px-4 py-8">' +
    '<div class="text-center mb-8"><span class="wood-plate">🧑‍🏫 教師辦公室</span></div>' +
    '<div class="notepad">' +
      '<div class="text-lg font-bold text-slate-700">🔐 第一次來到辦公室</div>' +
      '<p class="text-slate-500 text-sm mt-1 mb-2">請先設定教師登入密碼，之後就用這組密碼進辦公室。</p>' +
      '<label class="line-label" for="setup-pwd">設定密碼</label>' +
      '<input id="setup-pwd" type="password" placeholder="請設定密碼" class="line-input">' +
      '<label class="line-label" for="setup-pwd2">再輸入一次</label>' +
      '<input id="setup-pwd2" type="password" placeholder="再次輸入密碼" class="line-input mb-7">' +
      '<button onclick="submitTeacherSetup()" class="cls-btn cls-btn-wood w-full py-3 text-lg">設定並進入辦公室</button>' +
    '</div>' +
  '</div>';
}

function submitTeacherSetup() {
  var p1 = document.getElementById('setup-pwd').value.trim();
  var p2 = document.getElementById('setup-pwd2').value.trim();
  if (!p1) return toast('密碼不可為空', 'error');
  if (p1 !== p2) return toast('兩次密碼輸入不一致', 'error');
  setLoading(true);
  api('setupTeacherPassword', p1).then(function (res) {
    setLoading(false);
    if (res.success) { toast('設定成功！', 'success'); TEACHER_TOKEN = res.token || ''; STATE.teacher.loggedIn = true; loadTeacherDashboard(); }
    else toast(res.message, 'error');
  });
}

function viewTeacherLogin() {
  // 教師辦公室：門牌＋線圈筆記本
  return headerBar('教師登入', "goto('landing')") +
  '<div class="max-w-md mx-auto px-4 py-8">' +
    '<div class="text-center mb-8"><span class="wood-plate">🧑‍🏫 教師辦公室</span></div>' +
    '<div class="notepad">' +
      '<div class="text-lg font-bold text-slate-700">老師好！</div>' +
      '<p class="text-slate-500 text-sm mt-1 mb-2">請輸入教師密碼進入辦公室。</p>' +
      '<label class="line-label" for="login-pwd">教師密碼</label>' +
      '<input id="login-pwd" type="password" placeholder="請輸入教師密碼" class="line-input mb-7">' +
      '<button onclick="submitTeacherLogin()" class="cls-btn cls-btn-wood w-full py-3 text-lg">進入辦公室</button>' +
    '</div>' +
  '</div>';
}

function submitTeacherLogin() {
  var pwd = document.getElementById('login-pwd').value.trim();
  setLoading(true);
  api('loginTeacher', pwd).then(function (res) {
    setLoading(false);
    if (res.success) { TEACHER_TOKEN = res.token || ''; STATE.teacher.loggedIn = true; loadTeacherDashboard(); }
    else toast(res.message, 'error');
  });
}
document.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    var a = document.getElementById('login-pwd'); if (a && document.activeElement === a) submitTeacherLogin();
    var b = document.getElementById('setup-pwd2'); if (b && document.activeElement === b) submitTeacherSetup();
  }
});
