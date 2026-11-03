/* ============================================================
 * 3. 首頁：教師 / 學生入口
 * ============================================================ */
function viewLanding() {
  // 首頁＝學校走廊：牆上掛著歡迎黑板，兩扇門分別是「教師辦公室」與「學生教室」；下方是公開作品佈告欄
  return '' +
  '<div class="min-h-screen px-4 py-6">' +
    '<div class="max-w-5xl mx-auto">' +
      '<div class="hallway">' +
        '<div class="px-4 pt-8 pb-2">' +
          '<div class="cb-frame welcome-board">' +
            '<div class="cb-board">' +
              '<div class="cb-date text-sm mb-2">' + chalkboardDate() + '</div>' +
              '<h1 class="cb-title" style="font-size:1.45rem"><span class="cb-underline">剛好系列-課堂任務通</span></h1>' +
              '<div class="cb-chalk-text text-sm mt-3">歡迎來到異步學習任務庫！老師請進辦公室，同學請進教室 👇</div>' +
            '</div>' +
            '<div class="cb-tray"><span class="cb-chalk" style="left:14%;background:#fbfaf3"></span><span class="cb-chalk" style="left:calc(14% + 50px);width:28px;background:#f3e08a"></span><span class="cb-eraser" style="right:12%"></span></div>' +
          '</div>' +
        '</div>' +
        '<div class="hallway-grid cols-2">' +
          classroomDoorHtml({ name: '教師辦公室', subject: '老師請由此進入', colorIdx: 0, fnName: 'enterTeacherPortal', arg: '', notes: [{ text: '🧑‍🏫 教師入口', color: '#fff3a8' }], title: '教師入口' }, 0) +
          classroomDoorHtml({ name: '學生教室', subject: '同學請由此進入', colorIdx: 1, fnName: 'goto', arg: 'studentLogin', notes: [{ text: '🎒 學生入口', color: '#f6c6cf' }], title: '學生入口' }, 1) +
        '</div>' +
      '</div>' +
      '<div class="corkboard mt-10">' +
        '<div class="text-center mb-5">' +
          '<span class="cork-heading"><span class="pin" style="--pin:#4f7cac"></span>📌 公開作品佈告欄</span>' +
          '<div class="text-xs mt-3 font-bold" style="color:#5b3b22">老師設定為「完全公開」的作品會貼在這裡，任何人都能直接瀏覽，不需要登入；僅供查看，無法按讚或留言。</div>' +
        '</div>' +
        '<div id="public-gallery-area"><div class="text-center py-10 font-bold" style="color:#5b3b22">載入中…</div></div>' +
      '</div>' +
    '</div>' +
    '<div class="text-center mt-10 text-xs text-slate-400 leading-relaxed">' +
      '<div>Made by <a href="https://kentxchang.blogspot.tw" target="_blank" rel="noopener" class="text-blue-500 font-bold hover:underline">阿剛老師</a></div>' +
      '<div class="mt-1 max-w-md mx-auto">本平台採用<a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh_TW" target="_blank" rel="noopener" class="underline hover:text-blue-500">創用CC 姓名標示－非商業性－相同方式分享 4.0</a>授權，歡迎教育用途自由使用、修改與分享，但請標明原作者出處，且不得作商業用途。</div>' +
    '</div>' +
  '</div>';
}

var PUBLIC_GALLERY_GROUPS = [];

function wireLanding() {
  api('getLandingBundle').then(function (res) {
    var area = document.getElementById('public-gallery-area');
    if (!res.success) { if (area) area.innerHTML = '<div class="text-red-500 text-center py-10">' + res.message + '</div>'; return; }
    STATE.webAppUrl = res.webAppUrl || STATE.webAppUrl;
    TEACHER_PWD_SET_CACHE = !!res.teacherPasswordSet;
    var galleryRes = res.gallery;
    if (!area) return;
    if (!galleryRes.success) { area.innerHTML = '<div class="text-red-500 text-center py-10">' + galleryRes.message + '</div>'; return; }
    PUBLIC_GALLERY_GROUPS = groupGalleryItemsByTask(galleryRes.data);
    area.innerHTML = PUBLIC_GALLERY_GROUPS.length === 0 ?
      '<div class="flex justify-center"><div class="paper-note px-8 py-6 text-center text-slate-500" style="transform:rotate(-1deg)"><span class="pin"></span>目前佈告欄上還沒有完全公開的作品。</div></div>' :
      '<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 px-1">' + PUBLIC_GALLERY_GROUPS.map(function (g, idx) { return pinnedPolaroidHtml(g, 'openPublicGalleryDrillDown(' + idx + ')', idx); }).join('') + '</div>';
  }).catch(function () {
    var area = document.getElementById('public-gallery-area');
    if (area) area.innerHTML = '<div class="text-red-500 text-center py-10">載入失敗，請重新整理頁面</div>';
  });
}

function openPublicGalleryDrillDown(idx) {
  var g = PUBLIC_GALLERY_GROUPS[idx];
  if (!g) return;
  openModal(
    '<div class="text-lg font-black mb-4">🖼️ ' + escapeHtml(g.taskTitle) + '（' + g.items.length + ' 件作品）</div>' +
    '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">' + g.items.map(renderPublicGalleryCard).join('') + '</div>',
    { wide: true }
  );
}

function renderPublicGalleryCard(it) {
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
  '</div>';
}

function openSharedGalleryTask(taskId) {
  setLoading(true);
  api('getPublicGalleryItemsForTask', taskId).then(function (res) {
    setLoading(false);
    if (!res.success) return toast(res.message, 'error');
    openModal(
      '<div class="text-lg font-black mb-4">🖼️ ' + escapeHtml(res.data.taskTitle) + '（' + res.data.items.length + ' 件作品）</div>' +
      (res.data.items.length === 0 ? '<div class="text-slate-400 text-center py-10">目前尚無作品</div>' :
        '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">' + res.data.items.map(renderPublicGalleryCard).join('') + '</div>'),
      { wide: true }
    );
  }).catch(function (e) { setLoading(false); toast('連線失敗：' + e, 'error'); });
}

function enterTeacherPortal() {
  if (TEACHER_PWD_SET_CACHE !== null) { goto(TEACHER_PWD_SET_CACHE ? 'teacherLogin' : 'teacherSetup'); return; }
  setLoading(true);
  api('isTeacherPasswordSet').then(function (res) {
    setLoading(false);
    if (res.success && res.isSet) goto('teacherLogin'); else goto('teacherSetup');
  }).catch(function (e) { setLoading(false); toast('連線失敗：' + e, 'error'); });
}

// 佈告欄上用圖釘釘住的拍立得照片（每張角度、圖釘顏色略有不同）
var PIN_COLORS = ['#c0504d', '#4f7cac', '#d9a640', '#5d9b6c', '#8a6aa8'];
function pinnedPolaroidHtml(g, onclickExpr, idx) {
  var thumb = '';
  var first = g.items[0];
  if (g.taskType === 'DRAWING' && first.content.fileId) thumb = '/f/' + first.content.fileId;
  else if (g.taskType === 'PHOTO_TEXT' && first.content.photoFileIds && first.content.photoFileIds[0]) thumb = '/f/' + first.content.photoFileIds[0];
  var tilt = [-3, 2, -1.5, 3, -2.5, 1.5][idx % 6];
  return '<button type="button" class="polaroid" style="transform:rotate(' + tilt + 'deg)" onclick="' + onclickExpr + '">' +
    '<span class="pin" style="--pin:' + PIN_COLORS[idx % PIN_COLORS.length] + '"></span>' +
    '<div class="polaroid-img">' + (thumb ? '<img src="' + thumb + '" alt="">' : (g.taskType === 'DRAWING' ? '✏️' : '📷')) + '</div>' +
    '<div class="polaroid-cap">' + escapeHtml(g.taskTitle) + '</div>' +
    '<div class="text-xs text-slate-400">' + g.items.length + ' 件作品</div>' +
  '</button>';
}
