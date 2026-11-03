/* ============================================================
 * 13. 任務執行器（依任務類型分派）
 * ============================================================ */
function openTaskPlayer(taskId) {
  PREVIEW_MODE = false;
  var t = STU_DATA.tasks.find(function (x) { return x.id === taskId; });
  if (!t) return;
  if (t.type === 'LINK') openLinkTask(t);
  else if (t.type === 'PDF') openPdfTask(t);
  else if (t.type === 'FILE_SHARE') openFileShareTask(t);
  else if (t.type === 'YOUTUBE') openYoutubeTask(t);
  else if (t.type === 'PHOTO_TEXT') openPhotoTextTask(t);
  else if (t.type === 'DRAWING') openDrawingTask(t);
  else if (t.type === 'QUIZ') openQuizTask(t);
  else if (t.type === 'MARKDOWN') openMarkdownTask(t);
  else if (t.type === 'HTML_SHARE') openHtmlShareTask(t);
  else toast('此任務類型已不再支援，請聯絡老師處理', 'warn');
}

function doSubmitTask(payload) {
  if (PREVIEW_MODE) return previewSubmitTask(payload);
  payload.classId = STATE.student.classId;
  payload.studentId = STATE.student.studentId;
  payload.studentName = STATE.student.name;
  return api('submitTask', payload);
}

// 教師預覽模式下的「送出」：不呼叫真正的 submitTask、不寫入任何資料。
// 若為測驗類型（含 answers），改用含正解的題庫（教師本來就能看到）在前端直接計算成績，
// 讓教師仍可看到與學生完全相同的「送出後立即批改結果」畫面。
function previewSubmitTask(payload) {
  if (payload.answers) {
    return api('getQuizQuestions', payload.taskId).then(function (qRes) {
      var questions = qRes.data || [];
      var correct = 0;
      var details = payload.answers.map(function (a) {
        var q = questions.find(function (x) { return x.id === a.questionId; });
        var isCorrect = !!q && String(q.answer).toUpperCase() === String(a.selected).toUpperCase();
        if (isCorrect) correct++;
        return { questionId: a.questionId, text: q ? q.text : '', options: q ? q.options : [], selected: a.selected, correctAnswer: q ? q.answer : '', explanation: q ? q.explanation : '', correct: isCorrect };
      });
      var total = questions.length;
      var score = total > 0 ? Math.round((correct / total) * 100) : 0;
      return { success: true, message: '（預覽模式）已模擬批改，未實際儲存', status: '已完成', score: score, content: { answers: details, correctCount: correct, total: total } };
    });
  }
  return Promise.resolve({ success: true, message: '（預覽模式）已模擬送出，未實際儲存任何資料', status: '待批改', score: null, content: {} });
}

// 學生任務畫面共用：顯示老師的批改評語（「已完成」與「退回」都會顯示，讓學生能看到回饋）
function teacherCommentHtml(t) {
  if (!t || !t.comment) return '';
  var isReturned = t.status === '退回';
  return '<div class="text-sm rounded-xl p-3 mt-3 ' + (isReturned ? 'bg-red-50 border border-red-100' : 'bg-green-50 border border-green-100') + '">' +
    '<div class="text-xs font-bold mb-1 ' + (isReturned ? 'text-red-600' : 'text-green-600') + '">' + (isReturned ? '📮 老師已退回，評語：' : ('📮 老師的評語' + (gradeResultText(t) ? '（' + gradeResultText(t) + '）' : '') + '：')) + '</div>' +
    '<div class="text-slate-700 whitespace-pre-wrap">' + escapeHtml(t.comment) + '</div>' +
  '</div>';
}
