/* ---- 13.4 自動閱卷測驗（批次匯入題庫） ---- */
function openQuizTask(t) {
  setLoading(true);
  api('getQuizQuestionsForStudent', t.id).then(function (res) {
    setLoading(false);
    if (!res.success) return toast(res.message, 'error');
    if (res.data.length === 0) return toast('此測驗尚無題目', 'warn');
    renderQuizForm(t, res.data);
  });
}

function renderQuizForm(t, questions) {
  openModal(
    '<div class="text-2xl mb-2">✅</div>' +
    (PREVIEW_MODE ? previewBannerHtml() : '') +
    '<div class="text-lg font-black mb-1">' + escapeHtml(t.title) + '</div>' +
    (t.config.prompt ? '<p class="text-slate-500 text-sm mb-4">' + escapeHtml(t.config.prompt) + '</p>' : '') +
    '<form id="quiz-form" class="space-y-5">' +
      questions.map(function (q, i) {
        return '<div class="border border-slate-100 rounded-xl p-4">' +
          '<div class="font-bold mb-2">' + (i + 1) + '. ' + escapeHtml(q.text) + '</div>' +
          ['A', 'B', 'C', 'D'].map(function (letter, idx) {
            if (!q.options[idx]) return '';
            return '<label class="flex items-center gap-2 mb-1.5 cursor-pointer">' +
              '<input type="radio" name="q_' + q.id + '" value="' + letter + '" required> ' +
              '<span>' + letter + '. ' + escapeHtml(q.options[idx]) + '</span></label>';
          }).join('') +
        '</div>';
      }).join('') +
    '</form>' +
    '<button onclick="submitQuizForm(\'' + t.id + '\')" class="w-full py-3 rounded-xl btn-primary text-lg mt-5">送出測驗，立即批改</button>',
    { wide: true }
  );
}

function submitQuizForm(taskId) {
  var form = document.getElementById('quiz-form');
  var data = new FormData(form);
  var answers = [];
  var missing = false;
  var names = {};
  Array.prototype.forEach.call(form.elements, function (el) { if (el.name) names[el.name] = true; });
  Object.keys(names).forEach(function (name) {
    var val = data.get(name);
    if (!val) missing = true;
    answers.push({ questionId: name.replace('q_', ''), selected: val || '' });
  });
  if (missing) return toast('請完成所有題目再送出', 'error');
  setLoading(true);
  doSubmitTask({ taskId: taskId, answers: answers }).then(function (res) {
    setLoading(false);
    if (!res.success) return toast(res.message, 'error');
    renderQuizResult(res.content);
    refreshStudentTask();
  });
}

function renderQuizResult(content) {
  openModal(
    (PREVIEW_MODE ? previewBannerHtml() : '') +
    '<div class="text-center mb-4">' +
      '<div class="text-4xl mb-2">🎉</div>' +
      '<div class="text-3xl font-black text-blue-700">' + content.correctCount + ' / ' + content.total + '</div>' +
      '<div class="text-slate-400 text-sm">答對題數</div>' +
    '</div>' +
    '<div class="space-y-3">' +
      content.answers.map(function (a, i) {
        return '<div class="rounded-xl p-3 ' + (a.correct ? 'bg-green-50' : 'bg-red-50') + '">' +
          '<div class="font-bold text-sm mb-1">' + (i + 1) + '. ' + escapeHtml(a.text) + ' ' + (a.correct ? '✅' : '❌') + '</div>' +
          '<div class="text-xs text-slate-500">你的答案：' + a.selected + (a.correct ? '' : '　正確答案：' + a.correctAnswer) + '</div>' +
          (a.explanation ? '<div class="text-xs text-blue-500 mt-1">💡 ' + escapeHtml(a.explanation) + '</div>' : '') +
        '</div>';
      }).join('') +
    '</div>' +
    '<button onclick="closeModal()" class="w-full py-3 rounded-xl btn-primary text-lg mt-5">完成</button>',
    { wide: true }
  );
}
