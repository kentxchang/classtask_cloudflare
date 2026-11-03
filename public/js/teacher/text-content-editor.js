/* ---- 「分享 Markdown」「分享 HTML」共用的教師端設定表單：上傳檔案或直接貼上語法 ----
 * 內容以文字檔案（base64）存入資料庫，任務設定只記錄檔案 ID，避免任務清單載入時夾帶大量文字。 */
var TEXT_CONTENT_KINDS = {
  MARKDOWN: {
    label: 'Markdown', ext: '.md', mime: 'text/markdown; charset=utf-8', maxBytes: 2 * 1024 * 1024,
    accept: '.md,.markdown,.txt,text/markdown,text/plain',
    placeholder: '# 標題\n\n在這裡貼上 Markdown 語法，例如：\n\n- 重點一\n- **粗體**、*斜體*\n\n| 欄位 | 說明 |\n| --- | --- |\n| A | B |',
    hint: '學生端會看到排版後的內容，並可下載成圖片或 PDF。'
  },
  HTML_SHARE: {
    label: 'HTML', ext: '.html', mime: 'text/html; charset=utf-8', maxBytes: 5 * 1024 * 1024,
    accept: '.html,.htm,text/html',
    placeholder: '<!DOCTYPE html>\n<html>\n<head><meta charset="UTF-8"></head>\n<body>\n  在這裡貼上 HTML 語法…\n</body>\n</html>',
    hint: '學生端會在安全的沙盒中開啟此網頁，右下角有「📸 截圖回傳」按鈕，可選擇整頁或目前畫面截圖繳交。'
  }
};

// 編輯時原本的內容：用來判斷是否需要重新上傳；null 代表尚在載入
var TEXT_CONTENT_ORIGINAL = null;

function isTextContentType(type) {
  return !!TEXT_CONTENT_KINDS[type];
}

function textContentConfigFormHtml(type, isEdit) {
  var k = TEXT_CONTENT_KINDS[type];
  var p = isEdit ? 'ecfg' : 'cfg';
  return '<label class="text-sm font-bold text-slate-500">上傳 ' + k.label + ' 檔案（選填，選擇後內容會帶入下方文字框）</label>' +
    '<input type="file" accept="' + k.accept + '" onchange="loadTextContentFile(this, \'' + p + '-textcontent\')" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1 mb-3">' +
    '<label class="text-sm font-bold text-slate-500">或直接貼上 ' + k.label + ' 語法</label>' +
    '<textarea id="' + p + '-textcontent" rows="12" spellcheck="false" placeholder="' + escapeHtml(k.placeholder) + '" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1 mb-1 text-sm leading-relaxed"></textarea>' +
    '<div class="text-xs text-slate-400 mb-3">' + k.hint + '（內容上限 ' + (k.maxBytes / 1024 / 1024) + 'MB）</div>';
}

function loadTextContentFile(input, textareaId) {
  var file = input.files && input.files[0];
  if (!file) return;
  file.text().then(function (text) {
    var el = document.getElementById(textareaId);
    if (el) el.value = text;
    toast('已載入檔案內容：' + file.name, 'success');
  }).catch(function () { toast('讀取檔案失敗', 'error'); });
}

// 編輯任務時：把目前存在資料庫的內容載入文字框
function prefillTextContent(t) {
  TEXT_CONTENT_ORIGINAL = null;
  var el = document.getElementById('ecfg-textcontent');
  if (!t.config.fileId) { TEXT_CONTENT_ORIGINAL = ''; return; }
  if (el) { el.disabled = true; el.placeholder = '載入目前內容中…'; }
  fetchFileText(t.config.fileId).then(function (text) {
    TEXT_CONTENT_ORIGINAL = text;
    var cur = document.getElementById('ecfg-textcontent');
    if (cur) { cur.value = text; cur.disabled = false; }
  }).catch(function (e) {
    TEXT_CONTENT_ORIGINAL = '';
    var cur = document.getElementById('ecfg-textcontent');
    if (cur) cur.disabled = false;
    toast('目前內容載入失敗：' + e.message, 'error');
  });
}

// 建立／編輯送出：內容有變更才重新上傳，完成後寫入 config.fileId 再呼叫 done()
function submitTextContentConfig(type, isEdit, title, config, classId, categoryId, done) {
  var k = TEXT_CONTENT_KINDS[type];
  var el = document.getElementById((isEdit ? 'ecfg' : 'cfg') + '-textcontent');
  if (isEdit && TEXT_CONTENT_ORIGINAL === null) return toast('目前內容仍在載入中，請稍候', 'warn');
  var text = el ? el.value : '';
  if (!text.trim()) return toast('請上傳 ' + k.label + ' 檔案或貼上內容', 'error');
  if (isEdit && text === TEXT_CONTENT_ORIGINAL && config.fileId) return done();
  if (new Blob([text]).size > k.maxBytes) return toast('內容過大（上限 ' + (k.maxBytes / 1024 / 1024) + 'MB）', 'error');
  setLoading(true, '上傳內容中…');
  api('uploadFile', { base64Data: textToDataUrl(text, k.mime), mimeType: k.mime, fileName: safeFileName(title) + k.ext, classId: classId, categoryId: categoryId }).then(function (r) {
    setLoading(false);
    if (!r.success) return toast(r.message, 'error');
    config.fileId = r.fileId;
    config.fileName = r.fileName;
    done();
  }).catch(function (e) { setLoading(false); toast('上傳失敗：' + e, 'error'); });
}
