/* ============================================================
 * 6. 課堂詳細頁：分頁切換（內容 / 學生 / 批改總覽 / 設定與QR）
 * ============================================================ */
function viewClassDetail() {
  var c = STATE.currentClass;
  // 分頁：[代號, 圖示, 名稱]，以吊牌樣式呈現
  var tabs = [
    ['content', '📚', '單元內容'],
    ['students', '🪑', '學生名單'],
    ['grading', '📒', '批改與總覽'],
    ['gallery', '📌', '作品藝廊'],
    ['settings', '📋', '課堂設定']
  ];
  return (
  // 教室門口：返回鍵＋班級名牌；右側是掛在木條上的吊牌分頁
  '<div class="max-w-6xl mx-auto px-4 pt-6 pb-2 flex items-end justify-between gap-4 flex-wrap">' +
    '<div class="flex items-center gap-3 min-w-0">' +
      '<button onclick="backToClassList()" title="回到走廊" class="cls-btn cls-btn-paper cls-btn-round flex-shrink-0">←</button>' +
      '<div class="door-plate" style="--plate-h:auto;width:auto;height:auto;margin:0;padding:8px 18px;text-align:left">' +
        '<div class="door-plate-name" style="font-size:1.15rem">' + escapeHtml(c.name) + '</div>' +
        '<div class="door-plate-sub">' + escapeHtml(c.subject || '未設定科目') + '　・　加入代碼 ' + escapeHtml(c.joinCode) + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="tab-rail max-w-full">' +
      tabs.map(function (t) {
        var active = STATE.teacherClassTab === t[0];
        return '<button onclick="switchClassTab(\'' + t[0] + '\')" class="tab-sign' + (active ? ' active' : '') + '">' +
          '<span class="tab-sign-icon">' + t[1] + '</span>' +
          '<span class="whitespace-nowrap">' + t[2] + '</span>' +
        '</button>';
      }).join('') +
    '</div>' +
  '</div>' +
  '<div class="max-w-6xl mx-auto px-4 pb-16 pt-5" id="class-tab-body"></div>'
  );
}

function switchClassTab(tab) { STATE.teacherClassTab = tab; goto('teacherDashboard'); }

function wireClassDetail() {
  syncClassCache();
  var body = document.getElementById('class-tab-body');
  if (!body) return;
  body.classList.add('room-' + STATE.teacherClassTab); // 各分頁的教室主題樣式（見 css/app.css）
  if (STATE.teacherClassTab === 'content') renderContentTab(body);
  else if (STATE.teacherClassTab === 'students') renderStudentsTab(body);
  else if (STATE.teacherClassTab === 'grading') renderGradingTab(body);
  else if (STATE.teacherClassTab === 'gallery') renderTeacherGalleryTab(body);
  else if (STATE.teacherClassTab === 'settings') renderSettingsTab(body);
}

// 教師端「作品藝廊」：唯讀檢視目前會顯示在學生藝廊中的所有作品（不提供按讚／留言互動）
// 教師端「作品藝廊」管理：列出課堂內所有圖文回應／手繪任務，可逐一或一鍵切換公開程度，
// 「完全公開」的任務另可產生免登入的分享連結與 QR Code。
var TEACHER_GALLERY_TASKS = [];

function renderTeacherGalleryTab(body) {
  var classId = STATE.currentClass.id;
  if (!GALLERY_MGMT_CACHE[classId]) body.innerHTML = '<div class="text-slate-400 text-center py-8">載入中…</div>';
  loadWithCache(GALLERY_MGMT_CACHE, classId, function () { return api('getGalleryManagementData', classId); }, function (res) {
    if (!STATE.currentClass || STATE.currentClass.id !== classId || STATE.teacherClassTab !== 'gallery') return;
    var body = document.getElementById('class-tab-body');
    if (!body) return;
    TEACHER_GALLERY_TASKS = res.data;
    // 作品佈告欄：每個任務是一張用圖釘釘在軟木板上的紙條
    if (TEACHER_GALLERY_TASKS.length === 0) {
      body.innerHTML = '<div class="corkboard"><div class="flex justify-center"><div class="paper-note px-8 py-6 text-center text-slate-500"><span class="pin"></span>此課堂目前沒有圖文回應或手繪任務，作品藝廊僅適用於這兩種任務類型。</div></div></div>';
      return;
    }
    body.innerHTML =
      '<div class="corkboard">' +
        '<div class="flex items-start justify-between flex-wrap gap-3 mb-6">' +
          '<div class="paper-note px-4 py-3 text-xs text-slate-600 max-w-2xl" style="background:#fff3a8;transform:rotate(-.6deg)"><span class="pin" style="--pin:#5d9b6c"></span>設定每個任務在作品藝廊的公開程度：「公開」僅本班已登入學生看得到；「完全公開」則任何人不需登入即可在首頁查看，並可產生專屬分享連結與 QR Code。只要學生已繳交即會顯示，不需要等教師完成批改。</div>' +
          '<div class="flex flex-wrap gap-2">' +
            '<button onclick="bulkSetGalleryMode(\'off\')" class="cls-btn cls-btn-paper px-4 py-2 text-sm">🚫 一鍵全關</button>' +
            '<button onclick="bulkSetGalleryMode(\'class\')" class="cls-btn cls-btn-wood px-4 py-2 text-sm">👥 一鍵全開（本班）</button>' +
          '</div>' +
        '</div>' +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">' + TEACHER_GALLERY_TASKS.map(renderGalleryManagementRow).join('') + '</div>' +
      '</div>';
  }, function (msg) {
    var body = document.getElementById('class-tab-body');
    if (body) body.innerHTML = '<div class="text-red-500">' + msg + '</div>';
  });
}

function renderGalleryManagementRow(t) {
  var mode = t.galleryFullyPublic ? 'public' : (t.galleryPublished ? 'class' : 'off');
  var pinColor = mode === 'public' ? '#8a6aa8' : mode === 'class' ? '#d9a640' : '#9a948c';
  var tilt = (t.taskId.charCodeAt(t.taskId.length - 1) % 3) - 1; // 每張紙條角度略有不同
  return '<div class="paper-note p-4 pt-5 flex flex-wrap items-center justify-between gap-3" style="transform:rotate(' + (tilt * 0.8) + 'deg)">' +
    '<span class="pin" style="--pin:' + pinColor + '"></span>' +
    '<div>' +
      '<div class="font-bold text-slate-700">' + escapeHtml(t.galleryLabel) + '</div>' +
      '<div class="text-xs text-slate-400">' + (t.type === 'DRAWING' ? '✏️ 手繪' : '📷 圖文回應') + '　已繳交 ' + t.completedCount + ' 件</div>' +
    '</div>' +
    '<div class="flex items-center gap-2 flex-wrap">' +
      (t.completedCount > 0 ? '<button onclick="previewGalleryTask(\'' + t.taskId + '\')" class="cls-btn cls-btn-paper px-3 py-1.5 text-sm">👁 預覽</button>' : '') +
      '<select onchange="setTaskGalleryModeAndRefresh(\'' + t.taskId + '\', this.value)" class="border-2 border-blue-100 rounded-xl px-3 py-2 text-sm">' +
        '<option value="off"' + (mode === 'off' ? ' selected' : '') + '>不公開</option>' +
        '<option value="class"' + (mode === 'class' ? ' selected' : '') + '>公開（本班）</option>' +
        '<option value="public"' + (mode === 'public' ? ' selected' : '') + '>完全公開（免登入）</option>' +
      '</select>' +
      (mode === 'public' ? '<button onclick="openGalleryShareModal(\'' + t.taskId + '\')" class="cls-btn cls-btn-persimmon px-3 py-1.5 text-sm">🔗 分享連結</button>' : '') +
    '</div>' +
  '</div>';
}

function setTaskGalleryModeAndRefresh(taskId, mode) {
  setLoading(true);
  api('setTaskGalleryMode', taskId, mode).then(function (res) {
    setLoading(false);
    if (!res.success) return toast(res.message, 'error');
    toast(res.message, 'success');
    var localTask = STATE.tasks.find(function (x) { return x.id === taskId; });
    if (localTask) {
      localTask.config.galleryPublished = (mode === 'class' || mode === 'public');
      localTask.config.galleryFullyPublic = (mode === 'public');
    }
    syncClassCache();
    delete GALLERY_MGMT_CACHE[STATE.currentClass.id];
    renderTeacherGalleryTab(document.getElementById('class-tab-body'));
  });
}

function bulkSetGalleryMode(mode) {
  var msg = mode === 'off' ? '確定要將本課堂所有圖文回應／手繪任務全部設為「不公開」嗎？' : '確定要將本課堂所有圖文回應／手繪任務全部設為「公開（本班）」嗎？';
  confirmDialog(msg).then(function (ok) {
    if (!ok) return;
    setLoading(true);
    api('setAllTasksGalleryMode', STATE.currentClass.id, mode).then(function (res) {
      if (!res.success) { setLoading(false); return toast(res.message, 'error'); }
      api('getTasks', STATE.currentClass.id).then(function (r2) {
        setLoading(false);
        STATE.tasks = r2.data || [];
        syncClassCache();
        delete GALLERY_MGMT_CACHE[STATE.currentClass.id];
        toast(res.message, 'success');
        renderTeacherGalleryTab(document.getElementById('class-tab-body'));
      });
    });
  });
}

function previewGalleryTask(taskId) {
  var t = TEACHER_GALLERY_TASKS.find(function (x) { return x.taskId === taskId; });
  if (!t || !t.galleryPublished) return toast('此任務尚未公開，請先設定公開程度', 'warn');
  setLoading(true);
  api('getGalleryItems', STATE.currentClass.id).then(function (res) {
    setLoading(false);
    if (!res.success) return toast(res.message, 'error');
    var groups = groupGalleryItemsByTask(res.data);
    TEACHER_GALLERY_GROUPS = groups;
    var idx = -1;
    for (var i = 0; i < groups.length; i++) { if (groups[i].taskId === taskId) { idx = i; break; } }
    if (idx === -1) return toast('此任務目前尚無學生繳交的作品', 'warn');
    openTeacherGalleryDrillDown(idx);
  });
}

function openGalleryShareModal(taskId) {
  var t = TEACHER_GALLERY_TASKS.find(function (x) { return x.taskId === taskId; });
  var label = t ? t.galleryLabel : '';
  var url = STATE.webAppUrl ? (STATE.webAppUrl + (STATE.webAppUrl.indexOf('?') === -1 ? '?' : '&') + 'gallery=' + taskId) : '';
  openModal(
    '<div class="text-lg font-bold mb-1">🔗 分享連結</div>' +
    '<div class="text-xs text-slate-400 mb-4">「' + escapeHtml(label) + '」的專屬公開連結，任何人（不需登入）掃描或開啟即可查看此作品。</div>' +
    '<input id="gallery-share-url" readonly value="' + escapeHtml(url) + '" class="w-full border-2 border-blue-100 rounded-xl px-3 py-2 mb-3 text-xs">' +
    '<button onclick="copyGalleryShareUrl()" class="w-full py-2.5 rounded-xl bg-blue-50 text-blue-600 font-bold mb-4">📋 複製連結</button>' +
    '<div id="gallery-share-qr" class="bg-white p-3 rounded-xl inline-block border"></div>'
  );
  setTimeout(function () {
    var qrBox = document.getElementById('gallery-share-qr');
    if (qrBox && url) new QRCode(qrBox, { text: url, width: 160, height: 160, colorDark: '#43372e', colorLight: '#ffffff' });
  }, 30);
}

function copyGalleryShareUrl() {
  var input = document.getElementById('gallery-share-url');
  if (!input || !input.value) return;
  input.focus();
  input.select();
  var done = function () { toast('已複製連結！', 'success'); };
  var fallback = function () {
    try { document.execCommand('copy'); done(); } catch (e) { toast('複製失敗，請手動選取後複製', 'error'); }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(input.value).then(done).catch(fallback);
  } else {
    fallback();
  }
}

var TEACHER_GALLERY_GROUPS = [];

function openTeacherGalleryDrillDown(idx) {
  var g = TEACHER_GALLERY_GROUPS[idx];
  if (!g) return;
  openModal(
    '<div class="text-lg font-black mb-4">🖼️ ' + escapeHtml(g.taskTitle) + '（' + g.items.length + ' 件作品）</div>' +
    '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">' + g.items.map(renderTeacherGalleryCard).join('') + '</div>',
    { wide: true }
  );
}

function renderTeacherGalleryCard(it) {
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
    '<div class="flex items-center gap-3 mt-3 text-xs text-slate-400">' +
      '<span>❤️ ' + it.likeCount + '</span>' +
      '<span>💬 ' + it.comments.length + ' 則留言</span>' +
    '</div>' +
    (it.comments.length > 0 ? '<div class="mt-2 space-y-1 max-h-24 overflow-y-auto border-t border-slate-50 pt-2">' +
      it.comments.map(function (c) { return '<div class="text-xs text-slate-500"><b>' + escapeHtml(c.studentName) + '：</b>' + escapeHtml(c.text) + '</div>'; }).join('') +
    '</div>' : '') +
  '</div>';
}

/* ============================================================
 * 6.5 通用拖曳排序（Pointer Events，滑鼠／觸控／Apple Pencil 皆適用）
 * ============================================================ */
function initSortableList(container, itemSelector, handleSelector, onReorder) {
  if (!container || container.getAttribute('data-sortable-bound') === '1') return;
  container.setAttribute('data-sortable-bound', '1');
  var draggingEl = null;
  var moveHandler = null, upHandler = null;

  container.addEventListener('pointerdown', function (e) {
    var handle = e.target.closest(handleSelector);
    if (!handle || !container.contains(handle)) return;
    var item = handle.closest(itemSelector);
    if (!item) return;
    e.preventDefault();
    draggingEl = item;
    item.classList.add('dragging-item');

    moveHandler = function (ev) {
      if (!draggingEl) return;
      var elAtPoint = document.elementFromPoint(ev.clientX, ev.clientY);
      if (!elAtPoint) return;
      var target = elAtPoint.closest(itemSelector);
      if (!target || target === draggingEl || target.parentElement !== container) return;
      var items = Array.prototype.slice.call(container.querySelectorAll(itemSelector));
      var dragIdx = items.indexOf(draggingEl);
      var targetIdx = items.indexOf(target);
      if (dragIdx === -1 || targetIdx === -1) return;
      if (dragIdx < targetIdx) container.insertBefore(draggingEl, target.nextSibling);
      else container.insertBefore(draggingEl, target);
      updateOrderBadges(container, itemSelector);
    };
    upHandler = function () {
      if (!draggingEl) return;
      draggingEl.classList.remove('dragging-item');
      document.removeEventListener('pointermove', moveHandler);
      document.removeEventListener('pointerup', upHandler);
      var items = Array.prototype.slice.call(container.querySelectorAll(itemSelector));
      var orderedIds = items.map(function (el) { return el.getAttribute('data-sort-id'); });
      draggingEl = null;
      onReorder(orderedIds);
    };
    document.addEventListener('pointermove', moveHandler);
    document.addEventListener('pointerup', upHandler);
  });
}

function updateOrderBadges(container, itemSelector) {
  var items = container.querySelectorAll(itemSelector);
  Array.prototype.forEach.call(items, function (el, idx) {
    var badge = el.querySelector('.order-badge');
    if (badge) badge.textContent = idx + 1;
  });
}
