/* ============================================================
 * 10. 課堂設定分頁（含加入代碼 QR Code）
 * ============================================================ */
function renderSettingsTab(body) {
  var c = STATE.currentClass;
  // 教室公告欄：左邊是用膠帶貼上的「加入代碼」海報，右邊是用圖釘釘住的課堂設定表
  body.innerHTML =
    '<div class="corkboard grid grid-cols-1 md:grid-cols-2 gap-8">' +
      '<div class="paper-note code-poster" style="transform:rotate(-1deg)">' +
        '<span class="tape"></span>' +
        '<div class="font-bold text-lg text-slate-700 mb-1">📶 本班加入代碼</div>' +
        '<div class="text-xs text-slate-500 mb-4">貼在教室門口，同學掃描 QR Code 就能進來</div>' +
        '<div class="flex items-center justify-center gap-2 mb-2">' +
          '<input id="st-joincode" value="' + escapeHtml(c.joinCode) + '" maxlength="4" style="text-transform:uppercase;color:#a0613f;background:transparent" class="text-4xl font-black tracking-[.3em] text-center border-b-2 border-dashed border-orange-300 focus:border-orange-500 outline-none px-2 py-1 w-44">' +
          '<button onclick="saveJoinCode()" class="cls-btn cls-btn-persimmon px-3 py-2 text-sm">儲存代碼</button>' +
        '</div>' +
        '<div class="text-xs text-slate-500 mb-4">預設為隨機 4 位數字，也可手動改成 4 碼英數字組合（例如 A1B2）。</div>' +
        '<div id="qr-box" class="bg-white p-3 inline-block" style="box-shadow:0 2px 6px rgba(0,0,0,.12)"></div>' +
        '<div class="text-xs text-slate-500 mt-3">請學生使用 iPad 相機掃描此 QR Code：登入學生帳號後，若已被加入本課堂名單，會自動直接進入本課堂。</div>' +
      '</div>' +
      '<div class="paper-note notice-form" style="transform:rotate(.8deg)">' +
        '<span class="pin" style="--pin:#4f7cac"></span>' +
        '<div class="font-bold text-lg text-slate-700 mb-4">📋 課堂資訊與功能開關</div>' +
        '<label class="text-sm font-bold text-slate-500">課堂名稱</label>' +
        '<input id="st-name" value="' + escapeHtml(c.name) + '" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1 mb-3">' +
        '<label class="text-sm font-bold text-slate-500">科目 / 說明</label>' +
        '<input id="st-subject" value="' + escapeHtml(c.subject) + '" class="w-full border-2 border-blue-100 rounded-xl px-4 py-2.5 mt-1 mb-4">' +
        '<label class="flex items-center gap-2 mb-1 font-bold text-slate-600"><input type="checkbox" id="st-gallery" ' + (c.galleryEnabled ? 'checked' : '') + '> 開啟「作品展示牆」（藝廊）</label>' +
        '<div class="text-xs text-slate-400 mb-2 ml-6">課堂的總開關。實際會出現在藝廊的作品，還需在各個圖文回應／手繪任務的「✏️ 編輯」中個別勾選「公開到作品藝廊」並設定公開名稱；只要學生已繳交即會顯示，不需要等教師完成批改。</div>' +
        '<label class="flex items-center gap-2 mb-4 font-bold text-slate-600"><input type="checkbox" id="st-peer" ' + (c.peerInteractionEnabled ? 'checked' : '') + '> 開啟同儕按讚與留言鼓勵</label>' +
        '<button onclick="saveClassSettings()" class="cls-btn cls-btn-wood w-full py-3 mb-3">儲存設定</button>' +
        '<button onclick="deleteClassConfirm()" class="cls-btn cls-btn-danger w-full py-3">刪除此課堂</button>' +
      '</div>' +
    '</div>';
  var qrTarget = STATE.webAppUrl ? (STATE.webAppUrl + (STATE.webAppUrl.indexOf('?') === -1 ? '?' : '&') + 'code=' + c.joinCode) : c.joinCode;
  new QRCode(document.getElementById('qr-box'), { text: qrTarget, width: 160, height: 160, colorDark: '#43372e', colorLight: '#ffffff' });
}

function saveJoinCode() {
  var code = document.getElementById('st-joincode').value.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) return toast('課堂代碼須為 4 碼英數字組合', 'error');
  setLoading(true);
  api('updateClassJoinCode', STATE.currentClass.id, code).then(function (res) {
    setLoading(false);
    if (res.success) {
      STATE.currentClass.joinCode = res.joinCode;
      toast('課堂代碼已更新！', 'success');
      goto('teacherDashboard');
    } else toast(res.message, 'error');
  });
}

function saveClassSettings() {
  var payload = {
    name: document.getElementById('st-name').value.trim(),
    subject: document.getElementById('st-subject').value.trim(),
    galleryEnabled: document.getElementById('st-gallery').checked,
    peerInteractionEnabled: document.getElementById('st-peer').checked
  };
  if (!payload.name) return toast('課堂名稱不可為空', 'error');
  setLoading(true);
  api('updateClass', STATE.currentClass.id, payload).then(function (res) {
    setLoading(false);
    if (res.success) {
      STATE.currentClass.name = payload.name; STATE.currentClass.subject = payload.subject;
      STATE.currentClass.galleryEnabled = payload.galleryEnabled; STATE.currentClass.peerInteractionEnabled = payload.peerInteractionEnabled;
      toast('設定已儲存！', 'success'); goto('teacherDashboard');
    } else toast(res.message, 'error');
  });
}

function deleteClassConfirm() {
  confirmDialog('確定要刪除整個課堂嗎？此操作將一併刪除所有分類、任務、學生帳號與繳交紀錄，無法復原。', '確定刪除').then(function (ok) {
    if (!ok) return;
    setLoading(true);
    var classId = STATE.currentClass.id;
    api('deleteClass', classId).then(function (res) {
      setLoading(false);
      if (res.success) {
        delete CLASS_CACHE[classId]; delete STUDENTS_TAB_CACHE[classId]; delete GRADING_CACHE[classId]; delete GALLERY_MGMT_CACHE[classId];
        toast(res.message, 'success'); backToClassList();
      } else toast(res.message, 'error');
    });
  });
}
