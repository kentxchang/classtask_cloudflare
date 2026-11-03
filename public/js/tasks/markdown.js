/* ---- 13.8 分享 Markdown：顯示排版後的內容，可下載成圖片或 PDF ----
 * Markdown 轉換規則見 markdown-engine.js。 */
var MD_VIEW = { task: null, html: '' };

function openMarkdownTask(t) {
  if (!t.config.fileId) {
    openModal('<div class="text-lg font-black mb-2">📝 ' + escapeHtml(t.title) + '</div><div class="text-slate-400 text-center py-8">此任務尚未設定內容</div>');
    return;
  }
  setLoading(true, '載入內容中…');
  Promise.all([ensureMarkdownEngine(), fetchFileText(t.config.fileId)]).then(function (rs) {
    setLoading(false);
    MD_VIEW = { task: t, html: renderMarkdownHtml(rs[1]) };
    var locked = !PREVIEW_MODE && t.status === '已完成';
    openModal(
      '<div class="h-full flex flex-col">' +
        '<div class="flex-shrink-0 px-4 sm:px-8 pt-5 pb-3 pr-14 border-b border-slate-100">' +
          '<div class="text-lg font-black truncate">📝 ' + escapeHtml(t.title) + '</div>' +
          (PREVIEW_MODE ? '<div class="mt-2">' + previewBannerHtml() + '</div>' : '') +
          (t.description ? '<p class="text-slate-500 text-sm mt-1 whitespace-pre-wrap">' + escapeHtml(t.description) + '</p>' : '') +
        '</div>' +
        '<div class="flex-1 min-h-0 overflow-y-auto bg-slate-50">' +
          '<article id="md-view-body" class="md-body max-w-3xl mx-auto bg-white my-6 px-6 sm:px-10 py-8 rounded-2xl border border-slate-100">' + MD_VIEW.html + '</article>' +
          '<div class="max-w-3xl mx-auto px-2 pb-6">' + teacherCommentHtml(t) + '</div>' +
        '</div>' +
        '<div class="flex-shrink-0 flex flex-wrap gap-2 px-4 sm:px-8 py-3 border-t border-slate-100 bg-white">' +
          '<button onclick="downloadMarkdownAs(\'image\')" class="flex-1 min-w-[8rem] py-3 rounded-xl bg-blue-50 text-blue-700 font-bold hover:bg-blue-100">🖼 下載圖片</button>' +
          '<button onclick="downloadMarkdownAs(\'pdf\')" class="flex-1 min-w-[8rem] py-3 rounded-xl bg-blue-50 text-blue-700 font-bold hover:bg-blue-100">📄 下載 PDF</button>' +
          (locked
            ? '<div class="flex-1 min-w-[8rem] text-center py-3 rounded-xl bg-green-50 text-green-600 font-bold">✅ 已標記完成</div>'
            : '<button onclick="markLinkOrPdfComplete(\'' + t.id + '\',\'MARKDOWN\')" class="flex-1 min-w-[8rem] py-3 rounded-xl btn-accent">✅ 標記已完成</button>') +
        '</div>' +
      '</div>',
      { fullscreen: true }
    );
    var body = document.getElementById('md-view-body');
    // 流程圖繪製完成後，下載用的內容也要一併更新
    enhanceMarkdownDom(body).then(function () { if (MD_VIEW.task === t) MD_VIEW.html = body.innerHTML; });
  }).catch(function (e) {
    setLoading(false);
    toast('載入失敗：' + (e && e.message ? e.message : e), 'error');
  });
}

// 下載時另外在畫面外排一份固定寬度的版面再截圖，不受視窗大小與捲動位置影響
function downloadMarkdownAs(kind) {
  if (!MD_VIEW.task) return;
  var title = safeFileName(MD_VIEW.task.title);
  var wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:0;top:0;width:820px;z-index:-1;pointer-events:none;';
  wrap.innerHTML = '<article class="md-body bg-white" style="padding:48px 56px;">' + MD_VIEW.html + '</article>';
  document.body.appendChild(wrap);
  var node = wrap.firstChild;
  setLoading(true, kind === 'pdf' ? '產生 PDF 中…' : '產生圖片中…');

  // 解析度：預設 2 倍，過長的文件自動降低，避免超過瀏覽器畫布尺寸上限
  var rect = node.getBoundingClientRect();
  var scale = Math.min(2, 30000 / rect.height, Math.sqrt(16000000 / (rect.width * rect.height)));
  // 依每個區塊的上下緣計算建議換頁位置（PDF 用）
  var top = rect.top;
  var breaks = [];
  Array.prototype.forEach.call(node.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,tr,pre,blockquote,img,hr,table'), function (el) {
    var r = el.getBoundingClientRect();
    breaks.push(Math.round((r.top - top) * scale), Math.round((r.bottom - top) * scale));
  });
  breaks.sort(function (a, b) { return a - b; });

  var waitImages = Promise.all(Array.prototype.map.call(node.querySelectorAll('img'), function (img) {
    return img.complete ? null : new Promise(function (r) { img.onload = img.onerror = r; });
  }));
  waitImages.then(function () {
    return nodeToCanvas(node, scale);
  }).then(function (canvas) {
    if (kind === 'pdf') return canvasToPdf(canvas, breaks, title + '.pdf');
    downloadHref(canvas.toDataURL('image/png'), title + '.png');
  }).then(function () {
    setLoading(false);
    toast('已下載', 'success');
  }).catch(function (e) {
    setLoading(false);
    toast('下載失敗：' + (e && e.message ? e.message : e), 'error');
  }).then(function () { wrap.remove(); });
}
