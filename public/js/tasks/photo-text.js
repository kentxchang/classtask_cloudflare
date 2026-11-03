/* ---- 13.2 圖文回應＋照片上傳 ---- */
function openPhotoTextTask(t) {
  if (!PREVIEW_MODE && t.status === '已完成') return openReadOnlySubmissionTask(t, '📷');
  openModal(
    '<div class="text-2xl mb-2">📷</div>' +
    (PREVIEW_MODE ? previewBannerHtml() : '') +
    '<div class="text-lg font-black mb-2">' + escapeHtml(t.title) + '</div>' +
    (!PREVIEW_MODE ? teacherCommentHtml(t) : '') +
    '<p class="text-slate-500 text-sm mb-4 mt-3 whitespace-pre-wrap">' + escapeHtml(t.config.prompt || t.description) + '</p>' +
    '<textarea id="pt-text" rows="4" placeholder="輸入你的文字回答…" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mb-4"></textarea>' +
    '<div class="flex gap-3 mb-3">' +
      '<label class="flex-1 text-center py-3 rounded-xl bg-blue-50 text-blue-600 font-bold cursor-pointer">📸 拍照上傳<input type="file" accept="image/*" capture="environment" class="hidden" onchange="handlePhotoPick(this)"></label>' +
      '<label class="flex-1 text-center py-3 rounded-xl bg-orange-50 text-orange-500 font-bold cursor-pointer">🖼️ 從相簿選擇<input type="file" accept="image/*" multiple class="hidden" onchange="handlePhotoPick(this)"></label>' +
    '</div>' +
    '<div id="pt-preview" class="flex flex-wrap gap-2 mb-4"></div>' +
    '<button onclick="submitPhotoText(\'' + t.id + '\')" class="w-full py-3 rounded-xl btn-primary text-lg">送出作業</button>'
  );
  PT_PHOTOS = [];
}

// 教師已完成批改的任務（PHOTO_TEXT／DRAWING）：唯讀顯示上次送出的內容與老師評語，
// 不提供重新編輯／送出，避免蓋掉教師已經給的評分；需要修改請請老師「退回重修」。
function openReadOnlySubmissionTask(t, icon) {
  setLoading(true);
  api('getSubmission', t.id, STATE.student.studentId).then(function (res) {
    setLoading(false);
    var sub = (res.success && res.data) ? res.data : { content: {}, comment: t.comment, score: t.score, level: t.level, status: t.status };
    openModal(
      '<div class="text-2xl mb-2">' + icon + '</div>' +
      '<div class="text-lg font-black mb-2">' + escapeHtml(t.title) + '</div>' +
      '<div class="text-xs font-bold text-green-600 bg-green-50 rounded-lg px-3 py-2 mb-4">🔒 此任務已完成批改，無法再修改送出。如需補交或修改，請洽老師將此任務「退回重修」。</div>' +
      renderSubmissionPreview(sub, t.type) +
      teacherCommentHtml(sub),
      { wide: true }
    );
  });
}

var PT_PHOTOS = [];
function handlePhotoPick(input) {
  var files = Array.prototype.slice.call(input.files);
  setLoading(true, '處理圖片中…');
  Promise.all(files.map(function (f) { return compressImageFile(f, IMAGE_MAX_WIDTH); })).then(function (results) {
    setLoading(false);
    results.forEach(function (r) { PT_PHOTOS.push(r); });
    document.getElementById('pt-preview').innerHTML = PT_PHOTOS.map(function (p, i) {
      return '<div class="relative"><img src="' + p.base64 + '" class="w-20 h-20 object-cover rounded-lg border"><button onclick="PT_PHOTOS.splice(' + i + ',1); document.getElementById(\'pt-preview\').children[' + i + '].remove();" class="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs font-bold">✕</button></div>';
    }).join('');
  });
}

function submitPhotoText(taskId) {
  var text = document.getElementById('pt-text').value.trim();
  if (!text && PT_PHOTOS.length === 0) return toast('請輸入文字或上傳至少一張照片', 'error');
  setLoading(true, '上傳中…');
  doSubmitTask({ taskId: taskId, text: text, photos: PT_PHOTOS.map(function (p) { return { base64: p.base64, mimeType: p.mimeType }; }) }).then(function (res) {
    setLoading(false);
    if (res.success) { closeModal(); toast(PREVIEW_MODE ? '（預覽模式）已示範送出流程，未實際上傳' : '提交成功，等待老師批改！', 'success'); refreshStudentTask(); }
    else toast(res.message, 'error');
  });
}
