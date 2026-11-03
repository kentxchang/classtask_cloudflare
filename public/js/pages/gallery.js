/* ============================================================
 * 14. 作品藝廊／展示牆（異步發表 + 同儕鼓勵）
 * ============================================================ */
var GALLERY_CACHE = {};
var GALLERY_GROUPS = [];
var GALLERY_PEER_ON = false;

// 依任務分組：先依「教師設定的公開名稱」呈現任務卡片矩陣，點入後才看到該任務全部學生的作品
function groupGalleryItemsByTask(items) {
  var map = {}; var order = [];
  items.forEach(function (it) {
    if (!map[it.taskId]) { map[it.taskId] = { taskId: it.taskId, taskTitle: it.taskTitle, taskType: it.taskType, items: [] }; order.push(it.taskId); }
    map[it.taskId].items.push(it);
  });
  return order.map(function (id) { return map[id]; });
}

function renderGalleryTaskCardHtml(g, onclickExpr) {
  var thumb = '';
  var first = g.items[0];
  if (g.taskType === 'DRAWING' && first.content.fileId) thumb = '/f/' + first.content.fileId;
  else if (g.taskType === 'PHOTO_TEXT' && first.content.photoFileIds && first.content.photoFileIds[0]) thumb = '/f/' + first.content.photoFileIds[0];
  return '<div class="cursor-pointer" onclick="' + onclickExpr + '">' +
    '<div class="relative border-2 border-orange-100 rounded-xl overflow-hidden bg-slate-50" style="aspect-ratio:1/1;">' +
      (thumb ? '<img src="' + thumb + '" class="w-full h-full object-cover">' : '<div class="w-full h-full flex items-center justify-center text-4xl">' + (g.taskType === 'DRAWING' ? '✏️' : '📷') + '</div>') +
      '<div class="absolute inset-x-0 bottom-0 bg-black/60 text-white text-xs font-bold px-2 py-1 text-center">' + g.items.length + ' 件作品</div>' +
    '</div>' +
    '<div class="text-sm font-black text-blue-800 text-center mt-1.5 truncate">' + escapeHtml(g.taskTitle) + '</div>' +
  '</div>';
}

function openGalleryView() {
  setLoading(true);
  api('getGalleryItems', STATE.student.classId).then(function (res) {
    setLoading(false);
    if (!res.success) return toast(res.message, 'error');
    if (!res.data) return;
    GALLERY_PEER_ON = res.peerInteractionEnabled;
    renderGalleryModal(res.data);
  });
}

function renderGalleryModal(items) {
  items.forEach(function (it) { GALLERY_CACHE[it.submissionId] = it; });
  GALLERY_GROUPS = groupGalleryItemsByTask(items);
  openModal(
    '<div class="text-2xl mb-1">🖼️</div>' +
    '<div class="text-lg font-black mb-4">班級作品藝廊</div>' +
    (GALLERY_GROUPS.length === 0 ? '<div class="text-slate-400 text-center py-10">目前尚無公開展示的作品，或老師尚未開啟展示牆。</div>' :
      '<div class="grid grid-cols-2 sm:grid-cols-3 gap-4">' + GALLERY_GROUPS.map(function (g, idx) { return renderGalleryTaskCardHtml(g, 'openGalleryTaskDrillDown(' + idx + ')'); }).join('') + '</div>'),
    { wide: true }
  );
}

function openGalleryTaskDrillDown(idx) {
  var g = GALLERY_GROUPS[idx];
  if (!g) return;
  openModal(
    '<div class="flex items-center gap-2 mb-4">' +
      '<button onclick="reopenGalleryTopLevel()" class="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 font-bold text-slate-500 shrink-0">←</button>' +
      '<div class="text-lg font-black truncate">🖼️ ' + escapeHtml(g.taskTitle) + '</div>' +
    '</div>' +
    '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' + g.items.map(function (it) { return renderGalleryCard(it, GALLERY_PEER_ON); }).join('') + '</div>',
    { wide: true }
  );
}

function reopenGalleryTopLevel() {
  var items = [];
  GALLERY_GROUPS.forEach(function (g) { items = items.concat(g.items); });
  renderGalleryModal(items);
}

function reopenGalleryDrillDownFor(taskId) {
  for (var i = 0; i < GALLERY_GROUPS.length; i++) {
    if (GALLERY_GROUPS[i].taskId === taskId) { openGalleryTaskDrillDown(i); return; }
  }
}

function renderGalleryCard(it, peerOn) {
  var liked = it.likedBy.indexOf(STATE.student.studentId) !== -1;
  var media = '';
  if (it.taskType === 'PHOTO_TEXT') {
    media = (it.content.text ? '<p class="text-sm mb-2 whitespace-pre-wrap">' + escapeHtml(it.content.text) + '</p>' : '') +
      '<div class="flex flex-wrap gap-1.5">' + (it.content.photoFileIds || []).map(function (id) { return '<img src="/f/' + id + '" onclick="openImageLightbox(\'' + id + '\')" class="w-20 h-20 object-cover rounded-lg border cursor-pointer">'; }).join('') + '</div>';
  } else if (it.taskType === 'DRAWING') {
    media = it.content.fileId ? '<img src="/f/' + it.content.fileId + '" onclick="openImageLightbox(\'' + it.content.fileId + '\')" class="w-full rounded-lg border cursor-pointer">' : '';
  }
  return '<div class="card p-4 border-t-4 border-orange-300">' +
    '<div class="font-black text-blue-800 text-sm mb-2">' + escapeHtml(it.studentName) + '</div>' +
    media +
    (peerOn ? (
      '<div class="flex items-center gap-3 mt-3">' +
        '<button onclick="toggleGalleryLike(\'' + it.submissionId + '\')" class="text-sm font-bold ' + (liked ? 'text-orange-500' : 'text-slate-400') + '">' + (liked ? '❤️' : '🤍') + ' ' + it.likeCount + '</button>' +
      '</div>' +
      '<div class="mt-2 space-y-1 max-h-24 overflow-y-auto" id="cm-list-' + it.submissionId + '">' +
        it.comments.map(function (c) { return '<div class="text-xs text-slate-500"><b>' + escapeHtml(c.studentName) + '：</b>' + escapeHtml(c.text) + '</div>'; }).join('') +
      '</div>' +
      '<div class="flex gap-1 mt-2">' +
        '<input id="cm-input-' + it.submissionId + '" placeholder="留言鼓勵…" class="flex-1 border-2 border-blue-100 rounded-lg px-2 py-1.5 text-xs">' +
        '<button onclick="submitGalleryComment(\'' + it.submissionId + '\')" class="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold">送出</button>' +
      '</div>'
    ) : '') +
  '</div>';
}

function toggleGalleryLike(subId) {
  api('toggleLike', { submissionId: subId, studentId: STATE.student.studentId, studentName: STATE.student.name }).then(function (res) {
    if (!res.success) return toast(res.message, 'error');
    var it = GALLERY_CACHE[subId];
    if (res.liked) { it.likeCount++; it.likedBy.push(STATE.student.studentId); }
    else { it.likeCount--; it.likedBy = it.likedBy.filter(function (id) { return id !== STATE.student.studentId; }); }
    reopenGalleryDrillDownFor(it.taskId);
  });
}

function submitGalleryComment(subId) {
  var input = document.getElementById('cm-input-' + subId);
  var text = input.value.trim();
  if (!text) return;
  api('addComment', { submissionId: subId, studentId: STATE.student.studentId, studentName: STATE.student.name, text: text }).then(function (res) {
    if (!res.success) return toast(res.message, 'error');
    var it = GALLERY_CACHE[subId];
    it.comments.push({ studentName: STATE.student.name, text: text, time: '' });
    reopenGalleryDrillDownFor(it.taskId);
  });
}
