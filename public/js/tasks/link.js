/* ---- 13.1 外部連結／教材網站 ---- */
function openLinkTask(t) {
  var locked = !PREVIEW_MODE && t.status === '已完成';
  openModal(
    '<div class="text-2xl mb-2">🔗</div>' +
    (PREVIEW_MODE ? previewBannerHtml() : '') +
    '<div class="text-lg font-black mb-2">' + escapeHtml(t.title) + '</div>' +
    '<p class="text-slate-500 text-sm mb-5 whitespace-pre-wrap">' + escapeHtml(t.description) + '</p>' +
    '<a href="' + escapeHtml(t.config.url) + '" target="_blank" rel="noopener" class="block text-center w-full py-3 rounded-xl btn-primary mb-3">🔗 開啟連結／教材</a>' +
    (locked
      ? '<div class="text-center text-sm font-bold text-green-600 bg-green-50 rounded-xl py-3">✅ 已標記完成（教師已批改，無法再修改送出）</div>'
      : '<button onclick="markLinkOrPdfComplete(\'' + t.id + '\',\'LINK\')" class="w-full py-3 rounded-xl btn-accent">✅ 標記為已完成</button>') +
    teacherCommentHtml(t)
  );
}

function markLinkOrPdfComplete(taskId, type) {
  setLoading(true);
  doSubmitTask({ taskId: taskId, type: type }).then(function (res) {
    setLoading(false);
    if (res.success) { closeModal(); toast(PREVIEW_MODE ? '（預覽模式）已示範標記完成流程，未實際儲存' : '已標記完成！', 'success'); refreshStudentTask(); }
    else toast(res.message, 'error');
  });
}
