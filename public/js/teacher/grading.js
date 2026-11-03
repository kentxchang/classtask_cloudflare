/* ============================================================
 * 9. 批改與總覽分頁
 * ============================================================ */
function renderGradingTab(body) {
  // 成績簿：上方是筆記本索引標籤，下方是成績簿紙頁
  body.innerHTML =
    '<div class="gradebook-tabs">' +
      '<button id="gt-overview-btn" onclick="switchGradingSub(\'overview\')" class="gb-tab">📊 全班進度總覽</button>' +
      '<button id="gt-task-btn" onclick="switchGradingSub(\'task\')" class="gb-tab">✍️ 依任務批改</button>' +
    '</div>' +
    '<div id="grading-sub-body"></div>';
  STATE.gradingSub = STATE.gradingSub || 'overview';
  switchGradingSub(STATE.gradingSub);
}

function switchGradingSub(sub) {
  STATE.gradingSub = sub;
  var ob = document.getElementById('gt-overview-btn'), tb = document.getElementById('gt-task-btn');
  if (ob && tb) { ob.className = 'gb-tab' + (sub === 'overview' ? ' active' : ''); tb.className = 'gb-tab' + (sub === 'task' ? ' active' : ''); }
  if (sub === 'overview') renderOverviewMatrix(); else renderTaskGradingPicker();
}

function buildOverviewTable(tasks, students, matrix) {
  return '<div class="card p-4 overflow-x-auto"><table class="text-sm border-collapse"><thead><tr>' +
      '<th class="sticky left-0 bg-white p-2 text-left border-b-2 border-slate-100">學生 ＼ 任務</th>' +
      tasks.map(function (t) {
        var canBatchGrade = t.type !== 'QUIZ' && t.type !== 'YOUTUBE';
        return '<th class="p-2 text-center border-b-2 border-slate-100 whitespace-nowrap font-bold text-slate-500">' + getTaskTypeMeta(t.type).icon + '<br>' + escapeHtml(t.title) +
          (canBatchGrade ? '<br><button onclick="openBatchGradeModal(\'' + t.id + '\')" class="mt-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 whitespace-nowrap">🗂 批次批改</button>' : '') +
        '</th>';
      }).join('') +
    '</tr></thead><tbody>' +
    students.map(function (s) {
      return '<tr>' + '<td class="sticky left-0 bg-white p-2 font-bold border-b border-slate-50">' + escapeHtml(s.name) + '</td>' +
        tasks.map(function (t) {
          var sub = matrix[s.id] && matrix[s.id][t.id];
          var status = sub ? sub.status : '未完成';
          var resultText = gradeResultText(sub);
          return '<td class="p-1.5 text-center border-b border-slate-50">' +
            '<button onclick="openGradeModalFor(\'' + t.id + '\',\'' + s.id + '\')" class="status-' + status + ' font-bold text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap">' + status + (resultText ? ' ' + resultText : '') + '</button>' +
          '</td>';
        }).join('') + '</tr>';
    }).join('') + '</tbody></table></div>';
}

// 全班進度總覽：依「分類 → 任務」分組呈現，而非把所有任務混在同一張表格裡
function renderOverviewMatrix() {
  var classId = STATE.currentClass.id;
  var el = document.getElementById('grading-sub-body');
  if (!GRADING_CACHE[classId]) el.innerHTML = '<div class="text-slate-400 text-center py-8">載入中…</div>';
  loadWithCache(GRADING_CACHE, classId, function () { return api('getClassOverview', classId); }, function (res) {
    if (!STATE.currentClass || STATE.currentClass.id !== classId || STATE.teacherClassTab !== 'grading' || STATE.gradingSub !== 'overview') return;
    var el = document.getElementById('grading-sub-body');
    if (!el) return;
    var d = res.data;
    if (d.students.length === 0 || d.tasks.length === 0) { el.innerHTML = '<div class="card p-8 text-center text-slate-400">尚無學生或任務資料</div>'; return; }

    var cats = STATE.categories.slice().sort(function (a, b) { return a.order - b.order; });
    var html = '';
    cats.forEach(function (c) {
      var catTasks = d.tasks.filter(function (t) { return t.categoryId === c.id; });
      if (catTasks.length === 0) return;
      html += '<div class="mb-6"><div class="font-black text-blue-800 mb-2">' + escapeHtml(c.name) + '</div>' + buildOverviewTable(catTasks, d.students, d.matrix) + '</div>';
    });
    var uncategorized = d.tasks.filter(function (t) { return !cats.some(function (c) { return c.id === t.categoryId; }); });
    if (uncategorized.length > 0) {
      html += '<div class="mb-6"><div class="font-black text-slate-500 mb-2">未分類任務</div>' + buildOverviewTable(uncategorized, d.students, d.matrix) + '</div>';
    }
    el.innerHTML = html || '<div class="card p-8 text-center text-slate-400">尚無任務資料</div>';
  }, function (msg) {
    var el = document.getElementById('grading-sub-body');
    if (el) el.innerHTML = '<div class="text-red-500">' + msg + '</div>';
  });
}

// 依任務批改：先選分類，再選該分類內的任務
function renderTaskGradingPicker() {
  var el = document.getElementById('grading-sub-body');
  var cats = STATE.categories.slice().sort(function (a, b) { return a.order - b.order; });
  var catOptions = cats.map(function (c) { return '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>'; }).join('');
  el.innerHTML = '<div class="card p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">' +
      '<div><label class="text-xs font-bold text-slate-500">1. 選擇分類</label>' +
        '<select id="gt-cat-select" onchange="renderGradingTaskOptions(this.value)" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1"><option value="">請選擇分類</option>' + catOptions + '</select></div>' +
      '<div><label class="text-xs font-bold text-slate-500">2. 選擇任務</label>' +
        '<select id="gt-task-select" onchange="renderTaskSubmissionList(this.value)" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1"><option value="">請先選擇分類</option></select></div>' +
    '</div>' +
    '<div id="task-sub-list"></div>';
}

function renderGradingTaskOptions(categoryId) {
  var taskSelect = document.getElementById('gt-task-select');
  var listEl = document.getElementById('task-sub-list');
  if (listEl) listEl.innerHTML = '';
  if (!categoryId) { taskSelect.innerHTML = '<option value="">請先選擇分類</option>'; return; }
  var tasks = STATE.tasks.filter(function (t) { return t.categoryId === categoryId; }).sort(function (a, b) { return a.order - b.order; });
  if (tasks.length === 0) { taskSelect.innerHTML = '<option value="">此分類尚無任務</option>'; return; }
  taskSelect.innerHTML = '<option value="">請選擇任務</option>' + tasks.map(function (t) { return '<option value="' + t.id + '">' + getTaskTypeMeta(t.type).icon + ' ' + escapeHtml(t.title) + '</option>'; }).join('');
}

var TASK_SUB_CACHE = {};

function buildSubmissionListHtml(subs, task) {
  if (subs.length === 0) return '<div class="card p-8 text-center text-slate-400">尚無學生繳交</div>';
  return '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' + subs.map(function (s) {
    TASK_SUB_CACHE[s.id] = s;
    return '<div class="card p-4 flex justify-between items-center">' +
      '<div><div class="font-bold text-slate-700">' + escapeHtml(s.studentName) + '</div>' +
      '<div class="text-xs text-slate-400">提交於 ' + fmtDate(s.submittedAt) + '</div></div>' +
      '<button onclick="openGradeModal(TASK_SUB_CACHE[\'' + s.id + '\'],\'' + task.type + '\')" class="status-' + s.status + ' font-bold text-xs px-3 py-1.5 rounded-lg">' + s.status + (gradeResultText(s) ? ' ' + gradeResultText(s) : '') + '</button>' +
    '</div>';
  }).join('') + '</div>';
}

// 手繪任務：以所有回應的小圖矩陣呈現，點擊小圖查看完整內容並評分
function buildDrawingSubmissionGrid(subs, task) {
  if (subs.length === 0) return '<div class="card p-8 text-center text-slate-400">尚無學生繳交</div>';
  return '<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">' + subs.map(function (s) {
    TASK_SUB_CACHE[s.id] = s;
    var fileId = s.content && s.content.fileId;
    return '<div class="cursor-pointer" onclick="openGradeModal(TASK_SUB_CACHE[\'' + s.id + '\'],\'' + task.type + '\')">' +
      '<div class="relative border-2 border-blue-100 rounded-lg overflow-hidden bg-slate-50" style="aspect-ratio:1/1;">' +
        (fileId ? '<img src="/f/' + fileId + '" class="w-full h-full object-cover' + (task.type === 'HTML_SHARE' ? ' object-top' : '') + '">' : '<div class="w-full h-full flex items-center justify-center text-slate-300 text-3xl">' + getTaskTypeMeta(task.type).icon + '</div>') +
        '<span class="absolute top-1 right-1 status-' + s.status + ' text-[10px] font-black px-1.5 py-0.5 rounded">' + s.status + '</span>' +
      '</div>' +
      '<div class="text-xs font-bold text-slate-600 text-center mt-1 truncate">' + escapeHtml(s.studentName) + '</div>' +
    '</div>';
  }).join('') + '</div>';
}

// 圖文回應任務：直接列出所有人的文字內容，點擊查看完整內容（含照片）並評分
function buildPhotoTextSubmissionList(subs, task) {
  if (subs.length === 0) return '<div class="card p-8 text-center text-slate-400">尚無學生繳交</div>';
  return '<div class="space-y-3">' + subs.map(function (s) {
    TASK_SUB_CACHE[s.id] = s;
    var c = s.content || {};
    var photoCount = (c.photoFileIds || []).length;
    return '<div class="card p-4 cursor-pointer card-hover" onclick="openGradeModal(TASK_SUB_CACHE[\'' + s.id + '\'],\'' + task.type + '\')">' +
      '<div class="flex justify-between items-start mb-2 gap-2">' +
        '<div class="font-bold text-slate-700">' + escapeHtml(s.studentName) + '</div>' +
        '<span class="status-' + s.status + ' font-bold text-xs px-2.5 py-1 rounded-lg whitespace-nowrap">' + s.status + (gradeResultText(s) ? ' ' + gradeResultText(s) : '') + '</span>' +
      '</div>' +
      (c.text ? '<p class="text-sm text-slate-600 line-clamp-3 whitespace-pre-wrap">' + escapeHtml(c.text) + '</p>' : '<p class="text-sm text-slate-300 italic">（未填寫文字內容）</p>') +
      (photoCount > 0 ? '<div class="text-xs text-blue-500 font-bold mt-2">📷 ' + photoCount + ' 張照片</div>' : '') +
    '</div>';
  }).join('') + '</div>';
}

// YouTube 隨堂考：逐題正確率與答錯名單統計，並列出每位學生的觀看時長
// QUIZ 與 YOUTUBE 共用：逐題正確率與答錯名單統計；YOUTUBE 另外附上每位學生的觀看時長
function buildQuizSubmissionReport(subs, task, questions) {
  if (subs.length === 0) return '<div class="card p-8 text-center text-slate-400">尚無學生繳交</div>';

  var qStats = {};
  var qOrder = [];
  questions.forEach(function (q) { qStats[q.id] = { text: q.text, correctCount: 0, total: 0, wrongNames: [] }; qOrder.push(q.id); });
  subs.forEach(function (s) {
    var answers = (s.content && s.content.answers) || [];
    answers.forEach(function (a) {
      if (!qStats[a.questionId]) { qStats[a.questionId] = { text: a.text, correctCount: 0, total: 0, wrongNames: [] }; qOrder.push(a.questionId); }
      qStats[a.questionId].total++;
      if (a.correct) qStats[a.questionId].correctCount++;
      else qStats[a.questionId].wrongNames.push(s.studentName);
    });
  });

  var statsHtml = qOrder.length === 0 ? '' : ('<div class="space-y-2 mb-5">' + qOrder.map(function (qId, i) {
    var st = qStats[qId];
    var rate = st.total > 0 ? Math.round(st.correctCount / st.total * 100) : 0;
    return '<div class="border border-slate-100 rounded-xl p-3">' +
      '<div class="font-bold text-sm mb-1">第 ' + (i + 1) + ' 題　正確率 ' + rate + '%（' + st.correctCount + ' / ' + st.total + ' 人）</div>' +
      '<div class="text-xs text-slate-500 mb-1">' + escapeHtml(st.text) + '</div>' +
      (st.wrongNames.length > 0 ? '<div class="text-xs text-red-500 font-bold">❌ 答錯：' + st.wrongNames.map(escapeHtml).join('、') + '</div>' : '<div class="text-xs text-green-500 font-bold">✅ 全班答對</div>') +
    '</div>';
  }).join('') + '</div>');

  var listHtml = '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' + subs.map(function (s) {
    TASK_SUB_CACHE[s.id] = s;
    var watchedLine = task.type === 'YOUTUBE' ? ('<div class="text-xs text-slate-400">🎬 觀看時長 ' + fmtMinSec(s.content && s.content.watchedSeconds) + '</div>') : '';
    return '<div class="card p-4 flex justify-between items-center cursor-pointer" onclick="openGradeModal(TASK_SUB_CACHE[\'' + s.id + '\'],\'' + task.type + '\')">' +
      '<div><div class="font-bold text-slate-700">' + escapeHtml(s.studentName) + '</div>' + watchedLine + '</div>' +
      '<span class="status-' + s.status + ' font-bold text-xs px-3 py-1.5 rounded-lg">' + s.status + (gradeResultText(s) ? ' ' + gradeResultText(s) : '') + '</span>' +
    '</div>';
  }).join('') + '</div>';

  return statsHtml + listHtml;
}

// 依任務類型分派至專屬呈現方式；QUIZ／YOUTUBE 需另外取得題庫（含正解）才能統計正確率
function buildSubmissionsViewHtml(subs, task, questions) {
  // HTML 截圖回傳與手繪作品相同，以縮圖牆呈現
  if (task.type === 'DRAWING' || task.type === 'HTML_SHARE') return buildDrawingSubmissionGrid(subs, task);
  if (task.type === 'PHOTO_TEXT') return buildPhotoTextSubmissionList(subs, task);
  if (task.type === 'QUIZ' || task.type === 'YOUTUBE') return buildQuizSubmissionReport(subs, task, questions || []);
  return buildSubmissionListHtml(subs, task);
}

function fetchSubmissionsView(task) {
  var extra = (task.type === 'QUIZ' || task.type === 'YOUTUBE') ? api('getQuizQuestions', task.id) : Promise.resolve({ success: true, data: [] });
  return Promise.all([api('getSubmissionsForTask', task.id), extra]).then(function (rs) {
    if (!rs[0].success) return { success: false, message: rs[0].message };
    var questions = (rs[1].data || []).slice().sort(function (a, b) { return a.order - b.order; });
    return { success: true, html: buildSubmissionsViewHtml(rs[0].data, task, questions) };
  });
}

function renderTaskSubmissionList(taskId) {
  var container = document.getElementById('task-sub-list');
  if (!container) return;
  if (!taskId) { container.innerHTML = ''; return; }
  container.innerHTML = '<div class="text-slate-400 text-center py-8">載入中…</div>';
  var task = STATE.tasks.find(function (t) { return t.id === taskId; });
  fetchSubmissionsView(task).then(function (res) {
    // 若使用者在資料載入完成前已切換分頁／任務，此容器可能已經不存在，此時不要再寫入畫面
    var stillThere = document.getElementById('task-sub-list');
    if (!stillThere) return;
    stillThere.innerHTML = res.success ? res.html : '<div class="text-red-500">' + res.message + '</div>';
  });
}

// 任務卡片捷徑：直接彈出該任務所有學生的繳交狀況，可直接查看內容、評分並加評語
function openTaskSubmissionsModal(taskId) {
  var task = STATE.tasks.find(function (t) { return t.id === taskId; });
  if (!task) return;
  setLoading(true);
  fetchSubmissionsView(task).then(function (res) {
    setLoading(false);
    if (!res.success) return toast(res.message, 'error');
    var hint = (task.type === 'DRAWING' || task.type === 'HTML_SHARE') ? '點擊小圖查看完整內容並評分'
      : (task.type === 'QUIZ' || task.type === 'YOUTUBE') ? '各題正確率統計如下，點選學生可查看作答詳情（系統自動批改，無需人工評分）'
      : task.type === 'PHOTO_TEXT' ? '點選項目查看完整內容（含照片）並評分'
      : '點選學生右側狀態按鈕即可查看繳交內容、評分並加上評語';
    openModal(
      '<div class="text-lg font-bold mb-1">' + getTaskTypeMeta(task.type).icon + ' ' + escapeHtml(task.title) + ' — 學生繳交狀況</div>' +
      '<div class="text-xs text-slate-400 mb-4">' + hint + '</div>' +
      res.html,
      { wide: true }
    );
  });
}

function openGradeModalFor(taskId, studentId) {
  var task = STATE.tasks.find(function (t) { return t.id === taskId; });
  setLoading(true);
  api('getSubmission', taskId, studentId).then(function (res) {
    setLoading(false);
    if (!res.success) return toast(res.message, 'error');
    if (!res.data) return toast('此學生尚未提交此任務', 'warn');
    openGradeModal(JSON.stringify(res.data), task.type);
  });
}

function openGradeModal(subJson, taskType) {
  var s = typeof subJson === 'string' ? JSON.parse(subJson) : subJson;
  var previewHtml = renderSubmissionPreview(s, taskType);

  // 自動閱卷測驗與 YouTube 隨堂考由系統自動批改，教師端不再提供人工評分，僅供查看結果
  if (taskType === 'QUIZ' || taskType === 'YOUTUBE') {
    openModal(
      '<div class="text-lg font-bold mb-1">' + escapeHtml(s.studentName) + ' 的作答結果</div>' +
      '<div class="text-xs text-slate-400 mb-4">提交於 ' + fmtDate(s.submittedAt) + '（系統自動批改，無需人工評分）</div>' +
      previewHtml,
      { wide: true }
    );
    return;
  }

  // 依既有資料判斷上次是用哪種評分方式評的分，重新開啟批改視窗時要還原該模式與已填入的值，
  // 而不是每次都預設顯示「分數」模式（否則會讓人誤以為之前的評分「不見了」）
  var mode = detectGradeMode(s);
  openModal(
    '<div class="text-lg font-bold mb-1">批改：' + escapeHtml(s.studentName) + '</div>' +
    '<div class="text-xs text-slate-400 mb-4">提交於 ' + fmtDate(s.submittedAt) + '</div>' +
    '<div class="mb-4">' + previewHtml + '</div>' +
    '<div class="border-t pt-4">' +
      '<label class="text-sm font-bold text-slate-500">評分方式</label>' +
      '<select id="gr-mode" onchange="switchGradeMode()" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1 mb-3">' +
        '<option value="score"' + (mode === 'score' ? ' selected' : '') + '>分數（0~100）</option>' +
        '<option value="level"' + (mode === 'level' ? ' selected' : '') + '>等級（A/B/C）</option>' +
        '<option value="pass"' + (mode === 'pass' ? ' selected' : '') + '>通過／未通過</option>' +
      '</select>' +
      '<div id="gr-score-wrap" class="' + (mode === 'score' ? '' : 'hidden') + '"><input id="gr-score" type="number" min="0" max="100" value="' + (s.score !== null && s.score !== '' ? s.score : '') + '" placeholder="分數" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mb-3"></div>' +
      '<div id="gr-level-wrap" class="' + (mode === 'level' ? '' : 'hidden') + '">' +
        '<select id="gr-level" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mb-3">' +
          ['A', 'B', 'C'].map(function (l) { return '<option value="' + l + '"' + (s.level === l ? ' selected' : '') + '>' + l + '</option>'; }).join('') +
        '</select></div>' +
      '<div id="gr-pass-wrap" class="' + (mode === 'pass' ? '' : 'hidden') + '">' +
        '<select id="gr-pass" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mb-3">' +
          '<option value="通過"' + (s.level === '通過' ? ' selected' : '') + '>通過</option>' +
          '<option value="未通過"' + (s.level === '未通過' ? ' selected' : '') + '>未通過</option>' +
        '</select></div>' +
      '<label class="text-sm font-bold text-slate-500">回饋評語</label>' +
      '<textarea id="gr-comment" rows="2" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1 mb-4">' + escapeHtml(s.comment) + '</textarea>' +
      '<div class="flex gap-3">' +
        '<button onclick="submitGrade(\'' + s.id + '\',\'退回\')" class="flex-1 py-3 rounded-xl bg-red-100 text-red-600 font-bold hover:bg-red-200">退回重修</button>' +
        '<button onclick="submitGrade(\'' + s.id + '\',\'已完成\')" class="flex-1 py-3 rounded-xl btn-primary">完成批改</button>' +
      '</div>' +
    '</div>', { wide: true }
  );
}

function detectGradeMode(s) {
  if (s.level === '通過' || s.level === '未通過') return 'pass';
  if (s.level === 'A' || s.level === 'B' || s.level === 'C') return 'level';
  return 'score';
}

function switchGradeMode() {
  var mode = document.getElementById('gr-mode').value;
  document.getElementById('gr-score-wrap').className = mode === 'score' ? '' : 'hidden';
  document.getElementById('gr-level-wrap').className = mode === 'level' ? '' : 'hidden';
  document.getElementById('gr-pass-wrap').className = mode === 'pass' ? '' : 'hidden';
}

function submitGrade(subId, status) {
  var mode = document.getElementById('gr-mode').value;
  var payload = { submissionId: subId, status: status, comment: document.getElementById('gr-comment').value.trim() };
  if (mode === 'score') payload.score = document.getElementById('gr-score').value === '' ? null : Number(document.getElementById('gr-score').value);
  else if (mode === 'level') payload.level = document.getElementById('gr-level').value;
  else payload.level = document.getElementById('gr-pass').value;
  setLoading(true);
  api('gradeSubmission', payload).then(function (res) {
    setLoading(false);
    if (res.success) {
      delete GRADING_CACHE[STATE.currentClass.id];
      closeModal(); toast(res.message, 'success');
      if (STATE.gradingSub === 'overview') renderOverviewMatrix();
      else { var sel = document.getElementById('gt-task-select'); if (sel && sel.value) renderTaskSubmissionList(sel.value); }
    } else toast(res.message, 'error');
  });
}

/* ============================================================
 * 9.5 批次批改：同一個介面依序批改全班，或一次把同一份評分套用給所有人
 * ============================================================ */
var BATCH_GRADE = null;

function openBatchGradeModal(taskId) {
  var task = STATE.tasks.find(function (t) { return t.id === taskId; });
  if (!task) return;
  if (task.type === 'QUIZ' || task.type === 'YOUTUBE') return toast('此任務類型由系統自動批改，不需要人工批次批改', 'warn');
  setLoading(true);
  api('getSubmissionsForTask', taskId).then(function (res) {
    setLoading(false);
    if (!res.success) return toast(res.message, 'error');
    if (res.data.length === 0) return toast('此任務目前尚無學生繳交，無法批次批改', 'warn');
    var subs = res.data.slice().sort(function (a, b) { return a.studentName.localeCompare(b.studentName, 'zh-Hant'); });
    BATCH_GRADE = { task: task, subs: subs, index: 0 };
    renderBatchGradeModal();
  });
}

function renderBatchGradeModal() {
  var bg = BATCH_GRADE;
  var s = bg.subs[bg.index];
  var mode = detectGradeMode(s);
  var meta = getTaskTypeMeta(bg.task.type);
  openModal(
    '<div class="text-lg font-bold mb-1">🗂 批次批改：' + meta.icon + ' ' + escapeHtml(bg.task.title) + '</div>' +
    '<div class="text-xs text-slate-400 mb-4">可逐一批改後點「儲存並前往下一位」依序完成全班；或是批改好一位之後，直接點下方「套用到全部學生」，把同一份分數／評語一次套用給所有已繳交的學生。</div>' +
    '<div class="flex items-center justify-between mb-3 gap-2">' +
      '<button onclick="batchGradeNav(-1)" ' + (bg.index === 0 ? 'disabled' : '') + ' class="px-4 py-2 rounded-xl bg-slate-100 font-bold ' + (bg.index === 0 ? 'opacity-40 cursor-not-allowed' : '') + '">‹ 上一位</button>' +
      '<div class="text-center">' +
        '<div class="font-black text-slate-700">' + escapeHtml(s.studentName) + '</div>' +
        '<div class="text-xs text-slate-400">第 ' + (bg.index + 1) + ' / ' + bg.subs.length + ' 位　<span class="status-' + s.status + ' font-bold px-2 py-0.5 rounded">' + s.status + (gradeResultText(s) ? ' ' + gradeResultText(s) : '') + '</span></div>' +
      '</div>' +
      '<button onclick="batchGradeNav(1)" ' + (bg.index === bg.subs.length - 1 ? 'disabled' : '') + ' class="px-4 py-2 rounded-xl bg-slate-100 font-bold ' + (bg.index === bg.subs.length - 1 ? 'opacity-40 cursor-not-allowed' : '') + '">下一位 ›</button>' +
    '</div>' +
    '<div class="mb-4">' + renderSubmissionPreview(s, bg.task.type) + '</div>' +
    '<div class="border-t pt-4">' +
      '<label class="text-sm font-bold text-slate-500">評分方式</label>' +
      '<select id="bg-mode" onchange="switchBatchGradeMode()" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1 mb-3">' +
        '<option value="score"' + (mode === 'score' ? ' selected' : '') + '>分數（0~100）</option>' +
        '<option value="level"' + (mode === 'level' ? ' selected' : '') + '>等級（A/B/C）</option>' +
        '<option value="pass"' + (mode === 'pass' ? ' selected' : '') + '>通過／未通過</option>' +
      '</select>' +
      '<div id="bg-score-wrap" class="' + (mode === 'score' ? '' : 'hidden') + '"><input id="bg-score" type="number" min="0" max="100" value="' + (s.score !== null && s.score !== '' ? s.score : '') + '" placeholder="分數" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mb-3"></div>' +
      '<div id="bg-level-wrap" class="' + (mode === 'level' ? '' : 'hidden') + '">' +
        '<select id="bg-level" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mb-3">' +
          ['A', 'B', 'C'].map(function (l) { return '<option value="' + l + '"' + (s.level === l ? ' selected' : '') + '>' + l + '</option>'; }).join('') +
        '</select></div>' +
      '<div id="bg-pass-wrap" class="' + (mode === 'pass' ? '' : 'hidden') + '">' +
        '<select id="bg-pass" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mb-3">' +
          '<option value="通過"' + (s.level === '通過' ? ' selected' : '') + '>通過</option>' +
          '<option value="未通過"' + (s.level === '未通過' ? ' selected' : '') + '>未通過</option>' +
        '</select></div>' +
      '<label class="text-sm font-bold text-slate-500">回饋評語</label>' +
      '<textarea id="bg-comment" rows="2" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1 mb-4">' + escapeHtml(s.comment) + '</textarea>' +
      '<div class="flex gap-3 mb-3">' +
        '<button onclick="submitBatchGrade(\'退回\')" class="flex-1 py-3 rounded-xl bg-red-100 text-red-600 font-bold hover:bg-red-200">退回重修（此人）</button>' +
        '<button onclick="submitBatchGrade(\'已完成\')" class="flex-1 py-3 rounded-xl btn-primary">' + (bg.index === bg.subs.length - 1 ? '儲存此人評分' : '儲存並前往下一位') + '</button>' +
      '</div>' +
      '<button onclick="confirmApplyBatchGradeToAll()" class="w-full py-3 rounded-xl btn-accent">📋 套用這份評分到全部 ' + bg.subs.length + ' 位學生</button>' +
    '</div>', { wide: true }
  );
}

function switchBatchGradeMode() {
  var mode = document.getElementById('bg-mode').value;
  document.getElementById('bg-score-wrap').className = mode === 'score' ? '' : 'hidden';
  document.getElementById('bg-level-wrap').className = mode === 'level' ? '' : 'hidden';
  document.getElementById('bg-pass-wrap').className = mode === 'pass' ? '' : 'hidden';
}

function batchGradeNav(delta) {
  var bg = BATCH_GRADE;
  var next = bg.index + delta;
  if (next < 0 || next >= bg.subs.length) return;
  bg.index = next;
  renderBatchGradeModal();
}

function readBatchGradeForm() {
  var mode = document.getElementById('bg-mode').value;
  var payload = { comment: document.getElementById('bg-comment').value.trim() };
  if (mode === 'score') payload.score = document.getElementById('bg-score').value === '' ? null : Number(document.getElementById('bg-score').value);
  else if (mode === 'level') { payload.level = document.getElementById('bg-level').value; payload.score = null; }
  else { payload.level = document.getElementById('bg-pass').value; payload.score = null; }
  return payload;
}

// 批改「目前這一位」學生，成功後自動跳到下一位尚未批改的畫面（若已是最後一位則留在原地並提示完成）
function submitBatchGrade(status) {
  var bg = BATCH_GRADE;
  var s = bg.subs[bg.index];
  var form = readBatchGradeForm();
  var payload = Object.assign({ submissionId: s.id, status: status }, form);
  setLoading(true);
  api('gradeSubmission', payload).then(function (res) {
    setLoading(false);
    if (!res.success) return toast(res.message, 'error');
    delete GRADING_CACHE[STATE.currentClass.id];
    s.status = status; s.score = form.score !== undefined ? form.score : null; s.level = form.level || ''; s.comment = form.comment;
    if (bg.index < bg.subs.length - 1) { bg.index++; toast('已儲存，前往下一位', 'success'); renderBatchGradeModal(); }
    else { toast('已儲存！這是最後一位了', 'success'); renderBatchGradeModal(); }
  });
}

// 把目前表單上的評分結果，一次套用給這個任務底下所有已繳交的學生（會覆蓋每個人原本的評分）
function confirmApplyBatchGradeToAll() {
  var bg = BATCH_GRADE;
  var form = readBatchGradeForm();
  confirmDialog('確定要把目前這份分數／評語，套用到「' + escapeHtml(bg.task.title) + '」全部 ' + bg.subs.length + ' 位學生的繳交紀錄嗎？這會覆蓋每個人原本個別的批改結果。', '全部套用').then(function (ok) {
    if (!ok) return;
    setLoading(true);
    api('bulkGradeSubmissions', bg.task.id, '已完成', form.score === undefined ? null : form.score, form.level || '', form.comment).then(function (res) {
      setLoading(false);
      if (!res.success) return toast(res.message, 'error');
      delete GRADING_CACHE[STATE.currentClass.id];
      toast(res.message, 'success');
      closeModal();
      if (STATE.gradingSub === 'overview') renderOverviewMatrix();
    });
  });
}

function renderSubmissionPreview(s, taskType) {
  var c = s.content || {};
  if (taskType === 'PHOTO_TEXT') {
    return '<div class="bg-slate-50 rounded-xl p-3">' +
      (c.text ? '<p class="text-sm mb-2 whitespace-pre-wrap">' + escapeHtml(c.text) + '</p>' : '') +
      '<div class="flex flex-wrap gap-2">' + (c.photoFileIds || []).map(function (id) { return '<img src="/f/' + id + '" class="w-28 h-28 object-cover rounded-lg border">'; }).join('') + '</div>' +
    '</div>';
  }
  if (taskType === 'DRAWING' || taskType === 'HTML_SHARE') {
    return c.fileId ? '<img src="/f/' + c.fileId + '" class="max-w-full rounded-xl border">' : '<div class="text-slate-400">無作品</div>';
  }
  if (taskType === 'QUIZ' || taskType === 'YOUTUBE') {
    return '<div class="text-sm font-bold text-blue-700">自動批改結果：答對 ' + c.correctCount + ' / ' + c.total + ' 題（' + s.score + ' 分）</div>' +
      (taskType === 'YOUTUBE' ? '<div class="text-xs text-slate-400 mt-1">🎬 觀看時長 ' + fmtMinSec(c.watchedSeconds) + '</div>' : '');
  }
  return '<div class="text-slate-400 text-sm">已於 ' + fmtDate(c.readAt) + ' 標記完成閱讀／瀏覽</div>';
}
