/* ---- 13.1.5 分享檔案：瀏覽器可直接顯示的檔案（PDF／圖片／影音／純文字）嵌入預覽，並提供下載連結 ---- */
function isInlinePreviewable(mime, name) {
  var m = String(mime || '').toLowerCase();
  if (/^(image|video|audio|text)\//.test(m) || m === 'application/pdf') return true;
  return /\.(pdf|png|jpe?g|gif|webp|svg|mp4|webm|mp3|wav|txt)$/i.test(String(name || ''));
}
function openFileShareTask(t) {
  if (!t.config.fileId) {
    openModal('<div class="text-lg font-black mb-2">📁 ' + escapeHtml(t.title) + '</div><div class="text-slate-400 text-center py-8">此任務尚未上傳檔案</div>');
    return;
  }
  var locked = !PREVIEW_MODE && t.status === '已完成';
  openModal(
    '<div class="h-full flex flex-col p-4 sm:p-6">' +
      '<div class="text-lg font-black mb-1 pr-10 flex-shrink-0 truncate">📁 ' + escapeHtml(t.title) + '</div>' +
      (PREVIEW_MODE ? previewBannerHtml() : '') +
      (t.description ? '<p class="text-slate-500 text-sm mb-3 whitespace-pre-wrap flex-shrink-0">' + escapeHtml(t.description) + '</p>' : '') +
      '<div class="flex-1 min-h-0 border-2 border-blue-100 rounded-xl overflow-hidden bg-slate-50">' +
        (isInlinePreviewable(t.config.mimeType, t.config.fileName)
          ? '<iframe src="' + fileUrl(t.config.fileId) + '" class="w-full h-full" allow="autoplay"></iframe>'
          : '<div class="h-full flex flex-col items-center justify-center text-slate-400 text-sm gap-2 p-6 text-center"><div class="text-4xl">📄</div><div>' + escapeHtml(t.config.fileName || '') + '</div><div>此檔案類型無法在瀏覽器中直接預覽，請點下方「下載檔案」開啟。</div></div>') +
      '</div>' +
      '<div class="flex gap-3 mt-3 flex-shrink-0">' +
        '<a href="' + fileUrl(t.config.fileId) + '?download=1" target="_blank" rel="noopener" class="flex-1 text-center py-3 rounded-xl bg-blue-50 text-blue-600 font-bold hover:bg-blue-100">⬇️ 下載檔案</a>' +
        (locked
          ? '<div class="flex-1 text-center py-3 rounded-xl bg-green-50 text-green-600 font-bold text-lg">✅ 已標記完成</div>'
          : '<button onclick="markLinkOrPdfComplete(\'' + t.id + '\',\'FILE_SHARE\')" class="flex-1 py-3 rounded-xl btn-accent text-lg">✅ 標記已完成</button>') +
      '</div>' +
      teacherCommentHtml(t) +
    '</div>',
    { fullscreen: true }
  );
}
