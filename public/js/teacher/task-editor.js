/* ---- 建立任務：先選類型，再依類型顯示設定表單 ---- */
function openCreateTaskModal() {
  var typeCards = Object.keys(TASK_TYPE_META).map(function (key) {
    var m = TASK_TYPE_META[key];
    return '<button onclick="selectTaskType(\'' + key + '\')" class="card-hover border-2 border-blue-100 rounded-2xl p-4 text-center hover:border-blue-400">' +
      '<div class="text-3xl mb-1">' + m.icon + '</div><div class="text-xs font-bold text-slate-600">' + m.label + '</div>' +
    '</button>';
  }).join('');
  openModal('<div class="text-lg font-bold mb-4">選擇互動任務類型</div><div class="grid grid-cols-2 sm:grid-cols-3 gap-3">' + typeCards + '</div>', { wide: true });
}

function selectTaskType(type) {
  var meta = TASK_TYPE_META[type];
  var extra = '';
  if (type === 'LINK') {
    extra = '<label class="text-sm font-bold text-slate-500">連結網址</label>' +
      '<input id="cfg-url" placeholder="https://..." class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1 mb-3">';
  } else if (type === 'PDF') {
    extra = '<label class="text-sm font-bold text-slate-500">上傳 PDF 檔案</label>' +
      '<input id="cfg-pdf" type="file" accept="application/pdf" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1 mb-2">' +
      '<div class="text-xs text-slate-400 mb-3">系統會自動將 PDF 逐頁轉為圖片（最大寬度 900px）後存入資料庫，過程需要一些時間，請耐心等候。</div>' +
      '<div id="pdf-progress-wrap" class="hidden mb-3">' +
        '<div class="w-full bg-slate-100 rounded-full h-3 overflow-hidden"><div id="pdf-progress-bar" class="bg-blue-600 h-3 rounded-full transition-all" style="width:0%"></div></div>' +
        '<div id="pdf-progress-text" class="text-xs text-slate-500 mt-1 font-bold">準備中…</div>' +
      '</div>';
  } else if (type === 'FILE_SHARE') {
    extra = '<label class="text-sm font-bold text-slate-500">上傳檔案</label>' +
      '<input id="cfg-file" type="file" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1 mb-2">' +
      '<div class="text-xs text-slate-400 mb-3">學生端會以線上預覽模式直接開啟此檔案，並可另外下載（檔案大小上限 20MB）。</div>';
  } else if (type === 'YOUTUBE') {
    extra = '<label class="text-sm font-bold text-slate-500">YouTube 影片網址</label>' +
      '<input id="cfg-yturl" placeholder="https://www.youtube.com/watch?v=..." class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1 mb-3">' +
      '<label class="flex items-center gap-2 mb-1 font-bold text-slate-600 text-sm"><input type="checkbox" id="cfg-yt-hasquiz"> 包含隨堂考題目</label>' +
      '<div class="text-xs text-slate-400 mb-3">勾選後，學生觀看影片時會同時看到測驗作答區，可於「題庫管理」新增選擇題；不勾選的話，學生端只會看到影片，看完直接標記完成即可。</div>';
  } else if (type === 'PHOTO_TEXT') {
    extra = '<label class="text-sm font-bold text-slate-500">任務提示文字</label>' +
      '<textarea id="cfg-prompt" rows="2" placeholder="例如：請拍下你的實驗步驟並寫下觀察心得" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1 mb-3"></textarea>' +
      galleryConfigFieldsHtml(null, false);
  } else if (type === 'DRAWING') {
    DRAW_BG_PENDING = null; DRAW_BG_REMOVE = false;
    extra = drawingConfigFormHtml(null, false) + galleryConfigFieldsHtml(null, false);
  } else if (type === 'QUIZ') {
    extra = '<label class="text-sm font-bold text-slate-500">測驗說明（選填）</label>' +
      '<textarea id="cfg-prompt" rows="2" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1 mb-3"></textarea>' +
      '<div class="text-xs text-slate-400 mb-3">建立後可於「題庫管理」以逐題新增或 CSV 批次匯入選擇題。</div>';
  } else if (isTextContentType(type)) {
    extra = textContentConfigFormHtml(type, false);
  }
  openModal(
    '<div class="text-lg font-bold mb-1">' + meta.icon + ' ' + meta.label + '</div>' +
    '<label class="text-sm font-bold text-slate-500 mt-3 block">任務標題</label>' +
    '<input id="cfg-title" placeholder="請輸入任務標題" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1 mb-3">' +
    '<label class="text-sm font-bold text-slate-500">任務說明（顯示於學生端，選填）</label>' +
    '<textarea id="cfg-desc" rows="2" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1 mb-3"></textarea>' +
    extra +
    '<button id="submit-task-btn" onclick="submitCreateTask(\'' + type + '\')" class="w-full py-3 rounded-xl btn-primary text-lg mt-1">建立任務</button>'
  );
}

/**
 * 將 PDF 逐頁轉為 JPEG 圖片並依序上傳（比照參考書櫃程式的作法）：
 * 先建立一次性資料夾，再逐頁呼叫 uploadPdfPage，並回報進度。
 */
function convertAndUploadPdf(file, title, onProgress, classId, categoryId) {
  return file.arrayBuffer().then(function (buf) {
    if (onProgress) onProgress(3, '正在解析 PDF 檔案…');
    return pdfjsLib.getDocument({ data: buf }).promise;
  }).then(function (pdfDoc) {
    var totalPages = pdfDoc.numPages;
    if (onProgress) onProgress(6, '正在初始化雲端資料夾…');
    return api('initPdfPageFolder', title, classId, categoryId).then(function (initRes) {
      if (!initRes.success) throw new Error(initRes.message);
      var folderId = initRes.folderId;
      var pageFileIds = [];

      function uploadNext(i) {
        if (i >= totalPages) return Promise.resolve();
        return pdfDoc.getPage(i + 1).then(function (page) {
          var unscaled = page.getViewport({ scale: 1 });
          var maxWidth = IMAGE_MAX_WIDTH;
          var scale = Math.min(1, maxWidth / unscaled.width);
          var viewport = page.getViewport({ scale: scale });
          var canvas = document.createElement('canvas');
          canvas.width = viewport.width; canvas.height = viewport.height;
          return page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise.then(function () {
            var base64Img = canvas.toDataURL('image/jpeg', IMAGE_QUALITY);
            var percent = Math.floor(6 + ((i + 1) / totalPages) * 90);
            if (onProgress) onProgress(percent, '正在上傳第 ' + (i + 1) + ' / ' + totalPages + ' 頁…');
            return api('uploadPdfPage', folderId, i, base64Img);
          });
        }).then(function (pageRes) {
          if (!pageRes.success) throw new Error(pageRes.message);
          pageFileIds.push(pageRes.fileId);
          return uploadNext(i + 1);
        });
      }

      return uploadNext(0).then(function () {
        if (onProgress) onProgress(100, '上傳完成！');
        return { pageFileIds: pageFileIds, totalPages: totalPages };
      });
    });
  });
}

function submitCreateTask(type) {
  var title = document.getElementById('cfg-title').value.trim();
  var desc = document.getElementById('cfg-desc').value.trim();
  if (!title) return toast('請輸入任務標題', 'error');
  var config = {};

  function doCreate() {
    setLoading(true);
    api('createTask', { classId: STATE.currentClass.id, categoryId: STATE.activeCategoryId, type: type, title: title, description: desc, config: config }).then(function (res) {
      setLoading(false);
      if (!res.success) return toast(res.message, 'error');
      closeModal(); toast('任務建立成功！', 'success');
      api('getTasks', STATE.currentClass.id).then(function (r2) {
        STATE.tasks = r2.data || [];
        goto('teacherDashboard');
        if (type === 'QUIZ' || type === 'YOUTUBE') openQuestionManager(res.taskId, type);
      });
    });
  }

  if (type === 'LINK') {
    var url = document.getElementById('cfg-url').value.trim();
    if (!url) return toast('請輸入連結網址', 'error');
    if (!isSafeHttpUrl(url)) return toast('連結網址必須以 http:// 或 https:// 開頭', 'error');
    config = { url: url }; doCreate();
  } else if (type === 'PDF') {
    var fileInput = document.getElementById('cfg-pdf');
    if (!fileInput.files[0]) return toast('請選擇 PDF 檔案', 'error');
    var submitBtn = document.getElementById('submit-task-btn');
    var wrap = document.getElementById('pdf-progress-wrap');
    var bar = document.getElementById('pdf-progress-bar');
    var text = document.getElementById('pdf-progress-text');
    if (submitBtn) submitBtn.disabled = true;
    if (wrap) wrap.classList.remove('hidden');
    convertAndUploadPdf(fileInput.files[0], title, function (percent, statusText) {
      if (bar) bar.style.width = percent + '%';
      if (text) text.textContent = statusText;
    }, STATE.currentClass.id, STATE.activeCategoryId).then(function (result) {
      config = { pageFileIds: result.pageFileIds, totalPages: result.totalPages };
      doCreate();
    }).catch(function (err) {
      if (submitBtn) submitBtn.disabled = false;
      toast('PDF 轉換上傳失敗：' + err, 'error');
    });
  } else if (type === 'FILE_SHARE') {
    var shareFileInput = document.getElementById('cfg-file');
    if (!shareFileInput.files[0]) return toast('請選擇要分享的檔案', 'error');
    var shareFile = shareFileInput.files[0];
    if (shareFile.size > FILE_SHARE_MAX_BYTES) return toast('檔案過大（上限 20MB），請改用較小的檔案', 'error');
    setLoading(true, '上傳檔案中…');
    readFileAsBase64(shareFile).then(function (base64) {
      return api('uploadFile', { base64Data: base64, mimeType: shareFile.type || 'application/octet-stream', fileName: shareFile.name, folderName: '分享檔案_' + title, classId: STATE.currentClass.id, categoryId: STATE.activeCategoryId });
    }).then(function (r) {
      setLoading(false);
      if (!r.success) return toast(r.message, 'error');
      config = { fileId: r.fileId, fileName: r.fileName, mimeType: shareFile.type || '' };
      doCreate();
    }).catch(function (err) {
      setLoading(false);
      toast('檔案上傳失敗：' + err, 'error');
    });
  } else if (type === 'YOUTUBE') {
    var yturl = document.getElementById('cfg-yturl').value.trim();
    if (!yturl) return toast('請輸入 YouTube 網址', 'error');
    var hasQuizChk = document.getElementById('cfg-yt-hasquiz');
    config = { videoUrl: yturl, videoId: extractYoutubeId(yturl), hasQuiz: !!(hasQuizChk && hasQuizChk.checked) }; doCreate();
  } else if (type === 'PHOTO_TEXT') {
    config = Object.assign({ prompt: document.getElementById('cfg-prompt').value.trim() }, readGalleryConfigFields(false)); doCreate();
  } else if (type === 'DRAWING') {
    config = Object.assign({ prompt: document.getElementById('cfg-prompt').value.trim() }, readGalleryConfigFields(false));
    if (DRAW_BG_PENDING) {
      setLoading(true, '上傳背景圖中…');
      api('uploadFile', { base64Data: DRAW_BG_PENDING.base64, mimeType: DRAW_BG_PENDING.mimeType, fileName: 'background.jpg', folderName: '手繪背景圖_' + title, classId: STATE.currentClass.id, categoryId: STATE.activeCategoryId }).then(function (r) {
        setLoading(false);
        if (r.success) config.backgroundImageFileId = r.fileId;
        doCreate();
      });
    } else {
      doCreate();
    }
  } else if (type === 'QUIZ') {
    config = { prompt: document.getElementById('cfg-prompt').value.trim() }; doCreate();
  } else if (isTextContentType(type)) {
    submitTextContentConfig(type, false, title, config, STATE.currentClass.id, STATE.activeCategoryId, doCreate);
  }
}

function extractYoutubeId(url) {
  var m = String(url).match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : '';
}

/* ---- 編輯既有任務（標題／說明／內容設定皆可修改，任務類型不可變更） ---- */
function openEditTaskModal(taskId) {
  var t = STATE.tasks.find(function (x) { return x.id === taskId; });
  if (!t) return;
  var meta = getTaskTypeMeta(t.type);
  var extra = '';
  if (t.type === 'LINK') {
    extra = '<label class="text-sm font-bold text-slate-500">連結網址</label>' +
      '<input id="ecfg-url" value="' + escapeHtml(t.config.url || '') + '" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1 mb-3">';
  } else if (t.type === 'PDF') {
    extra = '<div class="text-xs text-slate-400 mb-2">目前共 ' + (t.config.totalPages || (t.config.pageFileIds || []).length || 0) + ' 頁</div>' +
      '<label class="text-sm font-bold text-slate-500">重新上傳 PDF（選填，若上傳將取代目前所有頁面）</label>' +
      '<input id="ecfg-pdf" type="file" accept="application/pdf" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1 mb-2">' +
      '<div id="epdf-progress-wrap" class="hidden mb-3">' +
        '<div class="w-full bg-slate-100 rounded-full h-3 overflow-hidden"><div id="epdf-progress-bar" class="bg-blue-600 h-3 rounded-full transition-all" style="width:0%"></div></div>' +
        '<div id="epdf-progress-text" class="text-xs text-slate-500 mt-1 font-bold">準備中…</div>' +
      '</div>';
  } else if (t.type === 'FILE_SHARE') {
    extra = '<div class="text-xs text-slate-400 mb-2">目前檔案：' + escapeHtml(t.config.fileName || '（尚未上傳）') + '</div>' +
      '<label class="text-sm font-bold text-slate-500">重新上傳檔案（選填，若上傳將取代目前檔案）</label>' +
      '<input id="ecfg-file" type="file" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1 mb-3">' +
      '<div class="text-xs text-slate-400 mb-3">檔案大小上限 20MB。</div>';
  } else if (t.type === 'YOUTUBE') {
    // 舊資料沒有這個欄位時（尚未有這個開關功能前建立的任務），預設視為「已勾選」以維持原本一律顯示測驗區的行為
    var ytHasQuizChecked = t.config.hasQuiz !== false;
    extra = '<label class="text-sm font-bold text-slate-500">YouTube 影片網址</label>' +
      '<input id="ecfg-yturl" value="' + escapeHtml(t.config.videoUrl || '') + '" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1 mb-3">' +
      '<label class="flex items-center gap-2 mb-1 font-bold text-slate-600 text-sm"><input type="checkbox" id="ecfg-yt-hasquiz" ' + (ytHasQuizChecked ? 'checked' : '') + '> 包含隨堂考題目</label>' +
      '<div class="text-xs text-slate-400 mb-3">不勾選時，學生端只會看到影片，看完直接標記完成即可。題庫請至「題庫管理」編輯。</div>';
  } else if (t.type === 'QUIZ') {
    extra = '<label class="text-sm font-bold text-slate-500">測驗說明（選填）</label>' +
      '<textarea id="ecfg-prompt" rows="2" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1 mb-3">' + escapeHtml(t.config.prompt || '') + '</textarea>';
  } else if (t.type === 'PHOTO_TEXT') {
    extra = '<label class="text-sm font-bold text-slate-500">任務提示文字（選填）</label>' +
      '<textarea id="ecfg-prompt" rows="2" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1 mb-3">' + escapeHtml(t.config.prompt || '') + '</textarea>' +
      galleryConfigFieldsHtml(t.config, true);
  } else if (t.type === 'DRAWING') {
    DRAW_BG_PENDING = null; DRAW_BG_REMOVE = false;
    extra = drawingConfigFormHtml(t.config, true) + galleryConfigFieldsHtml(t.config, true);
  } else if (isTextContentType(t.type)) {
    extra = textContentConfigFormHtml(t.type, true);
  } else {
    extra = '<div class="text-sm text-orange-500 font-bold bg-orange-50 rounded-xl p-3 mb-3">⚠️ 此任務的類型（' + escapeHtml(t.type) + '）已從平台移除，學生端將無法開啟。建議直接刪除此任務。</div>';
  }
  openModal(
    '<div class="text-lg font-bold mb-1">' + meta.icon + ' 編輯任務（' + meta.label + '）</div>' +
    '<label class="text-sm font-bold text-slate-500 mt-3 block">任務標題</label>' +
    '<input id="ecfg-title" value="' + escapeHtml(t.title) + '" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1 mb-3">' +
    '<label class="text-sm font-bold text-slate-500">任務說明（顯示於學生端，選填）</label>' +
    '<textarea id="ecfg-desc" rows="2" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1 mb-3">' + escapeHtml(t.description) + '</textarea>' +
    extra +
    '<button id="edit-task-submit-btn" onclick="submitEditTask(\'' + taskId + '\')" class="w-full py-3 rounded-xl btn-primary text-lg mt-1">儲存變更</button>',
    { wide: true }
  );
  if (isTextContentType(t.type)) prefillTextContent(t);
}

function submitEditTask(taskId) {
  var t = STATE.tasks.find(function (x) { return x.id === taskId; });
  if (!t) return;
  var title = document.getElementById('ecfg-title').value.trim();
  var desc = document.getElementById('ecfg-desc').value.trim();
  if (!title) return toast('請輸入任務標題', 'error');
  var config = Object.assign({}, t.config);

  function doUpdate() {
    setLoading(true);
    api('updateTask', taskId, { title: title, description: desc, config: config }).then(function (res) {
      setLoading(false);
      if (!res.success) return toast(res.message, 'error');
      t.title = title; t.description = desc; t.config = config;
      closeModal(); toast('任務已更新！', 'success');
      renderTaskGrid();
    });
  }

  if (t.type === 'LINK') {
    var url = document.getElementById('ecfg-url').value.trim();
    if (!url) return toast('請輸入連結網址', 'error');
    if (!isSafeHttpUrl(url)) return toast('連結網址必須以 http:// 或 https:// 開頭', 'error');
    config.url = url; doUpdate();
  } else if (t.type === 'PDF') {
    var fileInput = document.getElementById('ecfg-pdf');
    if (fileInput && fileInput.files[0]) {
      var btn = document.getElementById('edit-task-submit-btn');
      var wrap = document.getElementById('epdf-progress-wrap');
      var bar = document.getElementById('epdf-progress-bar');
      var text = document.getElementById('epdf-progress-text');
      if (btn) btn.disabled = true;
      if (wrap) wrap.classList.remove('hidden');
      convertAndUploadPdf(fileInput.files[0], title, function (percent, statusText) {
        if (bar) bar.style.width = percent + '%';
        if (text) text.textContent = statusText;
      }, t.classId, t.categoryId).then(function (result) {
        config.pageFileIds = result.pageFileIds; config.totalPages = result.totalPages;
        doUpdate();
      }).catch(function (err) {
        if (btn) btn.disabled = false;
        toast('PDF 轉換上傳失敗：' + err, 'error');
      });
    } else {
      doUpdate();
    }
  } else if (t.type === 'FILE_SHARE') {
    var shareFileInput = document.getElementById('ecfg-file');
    if (shareFileInput && shareFileInput.files[0]) {
      var eShareFile = shareFileInput.files[0];
      if (eShareFile.size > FILE_SHARE_MAX_BYTES) return toast('檔案過大（上限 20MB），請改用較小的檔案', 'error');
      setLoading(true, '上傳檔案中…');
      readFileAsBase64(eShareFile).then(function (base64) {
        return api('uploadFile', { base64Data: base64, mimeType: eShareFile.type || 'application/octet-stream', fileName: eShareFile.name, folderName: '分享檔案_' + title, classId: t.classId, categoryId: t.categoryId });
      }).then(function (r) {
        setLoading(false);
        if (!r.success) return toast(r.message, 'error');
        config.fileId = r.fileId; config.fileName = r.fileName; config.mimeType = eShareFile.type || '';
        doUpdate();
      }).catch(function (err) {
        setLoading(false);
        toast('檔案上傳失敗：' + err, 'error');
      });
    } else {
      doUpdate();
    }
  } else if (t.type === 'YOUTUBE') {
    var yturl = document.getElementById('ecfg-yturl').value.trim();
    if (!yturl) return toast('請輸入 YouTube 網址', 'error');
    var eHasQuizChk = document.getElementById('ecfg-yt-hasquiz');
    config.videoUrl = yturl; config.videoId = extractYoutubeId(yturl); config.hasQuiz = !!(eHasQuizChk && eHasQuizChk.checked); doUpdate();
  } else if (t.type === 'QUIZ') {
    config.prompt = document.getElementById('ecfg-prompt').value.trim(); doUpdate();
  } else if (t.type === 'PHOTO_TEXT') {
    config.prompt = document.getElementById('ecfg-prompt').value.trim();
    Object.assign(config, readGalleryConfigFields(true));
    doUpdate();
  } else if (t.type === 'DRAWING') {
    submitDrawingConfigEdit(config, doUpdate, t);
  } else if (isTextContentType(t.type)) {
    submitTextContentConfig(t.type, true, title, config, t.classId, t.categoryId, doUpdate);
  } else {
    doUpdate();
  }
}

function submitDrawingConfigEdit(config, doUpdate, t) {
  config.prompt = document.getElementById('ecfg-prompt').value.trim();
  Object.assign(config, readGalleryConfigFields(true));
  if (DRAW_BG_REMOVE) config.backgroundImageFileId = '';
  if (DRAW_BG_PENDING) {
    setLoading(true, '上傳背景圖中…');
    api('uploadFile', { base64Data: DRAW_BG_PENDING.base64, mimeType: DRAW_BG_PENDING.mimeType, fileName: 'background.jpg', folderName: '手繪背景圖_' + document.getElementById('ecfg-title').value.trim(), classId: t.classId, categoryId: t.categoryId }).then(function (r) {
      setLoading(false);
      if (r.success) config.backgroundImageFileId = r.fileId;
      doUpdate();
    });
  } else {
    doUpdate();
  }
}

/* ---- 手繪任務：教師設定背景圖（上傳檔案，或於畫面上按 Ctrl+V 貼上剪貼簿圖片）---- */
var DRAW_BG_PENDING = null;
var DRAW_BG_REMOVE = false;

/* ---- 圖文回應／手繪任務共用：作品藝廊公開程度（不公開／公開／完全公開）+ 自訂公開名稱 ---- */
function galleryConfigFieldsHtml(config, isEdit) {
  var modeId = isEdit ? 'ecfg-gallery-mode' : 'cfg-gallery-mode';
  var labelId = isEdit ? 'ecfg-gallery-label' : 'cfg-gallery-label';
  var wrapId = isEdit ? 'ecfg-gallery-label-wrap' : 'cfg-gallery-label-wrap';
  var mode = 'off';
  if (isEdit && config) mode = config.galleryFullyPublic ? 'public' : (config.galleryPublished ? 'class' : 'off');
  var label = isEdit && config ? (config.galleryLabel || '') : '';
  return '<div class="border-t border-slate-100 pt-3 mt-1">' +
    '<label class="text-sm font-bold text-slate-600 block mb-1">🖼️ 作品藝廊公開程度</label>' +
    '<select id="' + modeId + '" onchange="toggleGalleryLabelField(\'' + modeId + '\',\'' + wrapId + '\')" class="w-full border-2 border-blue-100 rounded-xl px-3 py-2 text-sm mb-1">' +
      '<option value="off"' + (mode === 'off' ? ' selected' : '') + '>不公開</option>' +
      '<option value="class"' + (mode === 'class' ? ' selected' : '') + '>公開（僅本班已登入學生可見）</option>' +
      '<option value="public"' + (mode === 'public' ? ' selected' : '') + '>完全公開（任何人免登入即可查看，可產生分享連結）</option>' +
    '</select>' +
    '<div id="' + wrapId + '" class="' + (mode === 'off' ? 'hidden' : '') + ' mb-3">' +
      '<input id="' + labelId + '" placeholder="作品公開名稱（例如：我的植物觀察日記）" value="' + escapeHtml(label) + '" class="w-full border-2 border-blue-100 rounded-xl px-3 py-2 mt-1 text-sm">' +
      '<div class="text-xs text-slate-400 mt-1">在作品藝廊看到的名稱，取代原本的任務標題；留空則直接沿用任務標題。</div>' +
    '</div>' +
  '</div>';
}

function toggleGalleryLabelField(modeId, wrapId) {
  var mode = document.getElementById(modeId).value;
  var wrap = document.getElementById(wrapId);
  if (wrap) wrap.className = (mode === 'off' ? 'hidden' : '') + ' mb-3';
}

function readGalleryConfigFields(isEdit) {
  var modeEl = document.getElementById(isEdit ? 'ecfg-gallery-mode' : 'cfg-gallery-mode');
  var labelEl = document.getElementById(isEdit ? 'ecfg-gallery-label' : 'cfg-gallery-label');
  var mode = modeEl ? modeEl.value : 'off';
  return {
    galleryPublished: mode === 'class' || mode === 'public',
    galleryFullyPublic: mode === 'public',
    galleryLabel: labelEl ? labelEl.value.trim() : ''
  };
}

function drawingConfigFormHtml(config, isEdit) {
  var promptId = isEdit ? 'ecfg-prompt' : 'cfg-prompt';
  var promptVal = isEdit && config ? escapeHtml(config.prompt || '') : '';
  var existingBgId = isEdit && config ? config.backgroundImageFileId : '';
  return '<label class="text-sm font-bold text-slate-500">繪圖任務提示（選填）</label>' +
    '<textarea id="' + promptId + '" rows="2" placeholder="例如：畫出光合作用的心智圖" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1 mb-2">' + promptVal + '</textarea>' +
    '<label class="text-sm font-bold text-slate-500">背景圖（選填，例如學習單或待標註圖片，學生會直接在圖上作畫）</label>' +
    (existingBgId ? (
      '<div id="draw-bg-current" class="flex items-center gap-2 mt-1 mb-2">' +
        '<img src="/f/' + existingBgId + '" class="h-20 rounded-lg border">' +
        '<button type="button" onclick="markDrawBgRemove()" class="text-xs font-bold text-red-500 hover:underline">移除目前背景圖</button>' +
      '</div>'
    ) : '') +
    '<div id="draw-bg-dropzone" tabindex="0" class="w-full border-2 border-dashed border-blue-200 rounded-xl p-4 text-center text-xs text-slate-400 mt-1 mb-2 cursor-pointer hover:border-blue-400" onclick="document.getElementById(\'draw-bg-file\').click()">📎 點此選擇圖片，或點擊此區域後按 Ctrl+V 貼上剪貼簿圖片</div>' +
    '<input id="draw-bg-file" type="file" accept="image/*" class="hidden" onchange="handleDrawBgFile(this.files[0])">' +
    '<div id="draw-bg-preview" class="mb-3"></div>';
}

function handleDrawBgFile(file) {
  if (!file) return;
  compressImageFile(file, IMAGE_MAX_WIDTH).then(function (r) {
    DRAW_BG_PENDING = r;
    DRAW_BG_REMOVE = false;
    var cur = document.getElementById('draw-bg-current');
    if (cur) cur.remove();
    renderDrawBgPreview();
  });
}

function renderDrawBgPreview() {
  var el = document.getElementById('draw-bg-preview');
  if (!el) return;
  if (!DRAW_BG_PENDING) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="relative inline-block"><img src="' + DRAW_BG_PENDING.base64 + '" class="h-20 rounded-lg border"><button type="button" onclick="clearDrawBgPending()" class="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs font-bold">✕</button></div>';
}

function clearDrawBgPending() { DRAW_BG_PENDING = null; renderDrawBgPreview(); }

function markDrawBgRemove() {
  DRAW_BG_REMOVE = true;
  var cur = document.getElementById('draw-bg-current');
  if (cur) cur.innerHTML = '<span class="text-xs text-orange-500 font-bold">將於儲存後移除背景圖</span>';
}

// 只要「背景圖」拖放區存在於目前畫面上，就允許直接按 Ctrl+V 貼上剪貼簿圖片
document.addEventListener('paste', function (e) {
  var zone = document.getElementById('draw-bg-dropzone');
  if (!zone) return;
  var clipboardData = e.clipboardData || window.clipboardData;
  if (!clipboardData || !clipboardData.items) return;
  for (var i = 0; i < clipboardData.items.length; i++) {
    if (clipboardData.items[i].type && clipboardData.items[i].type.indexOf('image') !== -1) {
      var blob = clipboardData.items[i].getAsFile();
      if (blob) { handleDrawBgFile(blob); e.preventDefault(); }
      break;
    }
  }
});
