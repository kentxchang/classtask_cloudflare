/* ============================================================
 * 2.6 課堂選擇畫面共用：「學校走廊＋教室門」外觀（教師課堂列表、學生選課堂共用）
 * 每個課堂是一扇教室門：門上方掛班級牌、門上可貼便利貼；滑過時門微開、點擊後開門進入。
 * ============================================================ */
var DOOR_COLORS = ['#8b5e3a', '#5f7f6e', '#a0613f', '#5c6f86', '#7d6650', '#8a6d76'];

// opts: { name, subject, colorIdx, fnName, arg, notes:[{text,color}], tag, title }
function classroomDoorHtml(opts, idx) {
  var notes = (opts.notes || []).slice(0, 2).map(function (n, i) {
    return '<span class="door-note" style="background:' + (n.color || '#fff3a8') + ';transform:rotate(' + (i ? 4 : -5) + 'deg)">' + escapeHtml(n.text) + '</span>';
  }).join('');
  return '<div class="door-unit anim-pop" style="animation-delay:' + (idx * 0.06) + 's">' +
    '<button type="button" class="door-btn" title="' + escapeHtml(opts.title || ('進入 ' + opts.name)) + '" onclick="doorGo(this, \'' + opts.fnName + '\', \'' + opts.arg + '\')">' +
      '<div class="door-plate">' +
        '<div class="door-plate-name">' + escapeHtml(opts.name) + '</div>' +
        (opts.subject ? '<div class="door-plate-sub">' + escapeHtml(opts.subject) + '</div>' : '') +
      '</div>' +
      '<div class="door-frame">' +
        '<div class="door-room"><span class="door-room-board"></span><span class="door-room-text">進入教室 →</span></div>' +
        '<div class="door-leaf" style="--door:' + DOOR_COLORS[(opts.colorIdx || 0) % DOOR_COLORS.length] + '">' +
          '<span class="door-window"></span>' +
          '<span class="door-panel"></span>' +
          '<span class="door-knob"></span>' +
          '<span class="door-notes">' + notes + '</span>' +
          (opts.tag ? '<span class="door-tag">' + escapeHtml(opts.tag) + '</span>' : '') +
        '</div>' +
      '</div>' +
    '</button>' +
  '</div>';
}

// 空的門口（例如「＋ 建立新課堂」）
function emptyDoorwayHtml(label, onclickJs, idx) {
  return '<div class="door-unit anim-pop" style="animation-delay:' + (idx * 0.06) + 's">' +
    '<button type="button" class="door-btn" onclick="' + onclickJs + '">' +
      '<div class="door-plate door-plate-empty"><div class="door-plate-name">新教室</div></div>' +
      '<div class="door-frame door-frame-empty"><span class="door-empty-plus">＋</span><span class="door-empty-label">' + escapeHtml(label) + '</span></div>' +
    '</button>' +
  '</div>';
}

// 點門：先播放開門動畫，再進入課堂
function doorGo(btn, fnName, arg) {
  if (btn.classList.contains('opening')) return;
  btn.classList.add('opening');
  setTimeout(function () { window[fnName](arg); }, 420);
}

// 依時段問候
function timeGreeting() {
  var h = new Date().getHours();
  return h < 11 ? '早安' : h < 18 ? '午安' : '晚安';
}
