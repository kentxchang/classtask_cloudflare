/* ---- 13.7 嵌入式 YouTube 影片與章節隨堂考 ---- */
var YT_STATE = null;
var YT_API_READY = null;

function loadYoutubeApi() {
  if (YT_API_READY) return YT_API_READY;
  YT_API_READY = new Promise(function (resolve) {
    if (window.YT && window.YT.Player) return resolve();
    window.onYouTubeIframeAPIReady = function () { resolve(); };
    var tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return YT_API_READY;
}

// 舊資料沒有 hasQuiz 欄位時，視為「已勾選」以維持原本一律顯示測驗區的行為
function youtubeTaskHasQuiz(t) { return t.config.hasQuiz !== false; }

// 影片與題目完全分開：全畫面左右兩欄，左側播放 YouTube 影片、右側為題目作答表單，
// 題目不需要（也不再支援）設定影片時間點，學生可依自己步調觀看影片、隨時作答後一次送出。
// 教師若未勾選「包含隨堂考題目」，則不進這個分支，改走 openYoutubeTaskSimple 的純影片播放畫面。
function openYoutubeTask(t) {
  if (!youtubeTaskHasQuiz(t)) return openYoutubeTaskSimple(t);
  setLoading(true);
  api('getQuizQuestionsForStudent', t.id).then(function (res) {
    setLoading(false);
    if (!res.success) return toast(res.message, 'error');
    var questions = res.data;
    YT_STATE = { taskId: t.id, player: null, watchedSeconds: 0, playStartTs: null };
    openModal(
      '<div class="h-full overflow-y-auto lg:overflow-hidden grid grid-cols-1 lg:grid-cols-2 lg:h-full">' +
        '<div class="bg-black flex items-center justify-center lg:h-full">' +
          '<div class="w-full max-w-3xl aspect-video"><div id="yt-player" class="w-full h-full"></div></div>' +
        '</div>' +
        '<div class="p-5 lg:p-8 lg:h-full lg:overflow-y-auto">' +
          (PREVIEW_MODE ? previewBannerHtml() : '') +
          '<div class="text-lg font-black mb-2">▶️ ' + escapeHtml(t.title) + '</div>' +
          (t.config.prompt ? '<p class="text-slate-500 text-sm mb-4 whitespace-pre-wrap">' + escapeHtml(t.config.prompt) + '</p>' : '') +
          (questions.length === 0 ?
            '<div class="text-slate-400 text-sm mb-5">此任務尚無隨堂考題目，看完影片後可直接標記完成。</div>' :
            '<form id="yt-quiz-form" class="space-y-5 mb-5">' +
              questions.map(function (q, i) {
                return '<div class="border border-slate-100 rounded-xl p-4">' +
                  '<div class="font-bold mb-2 text-sm">' + (i + 1) + '. ' + escapeHtml(q.text) + '</div>' +
                  ['A', 'B', 'C', 'D'].map(function (letter, idx) {
                    if (!q.options[idx]) return '';
                    return '<label class="flex items-center gap-2 mb-1.5 cursor-pointer text-sm"><input type="radio" name="q_' + q.id + '" value="' + letter + '" required> ' + letter + '. ' + escapeHtml(q.options[idx]) + '</label>';
                  }).join('') +
                '</div>';
              }).join('') +
            '</form>') +
          '<button onclick="submitYoutubeQuiz(\'' + t.id + '\')" class="w-full py-3 rounded-xl btn-primary text-lg">' + (questions.length === 0 ? '✅ 標記已完成觀看' : '送出測驗，立即批改') + '</button>' +
        '</div>' +
      '</div>',
      { fullscreen: true }
    );
    loadYoutubeApi().then(function () {
      YT_STATE.player = new YT.Player('yt-player', {
        host: 'https://www.youtube-nocookie.com',
        videoId: t.config.videoId, width: '100%', height: '100%',
        playerVars: { rel: 0 },
        events: {
          onStateChange: function (e) {
            // 累計實際「播放中」的時間（暫停時不計入），做為學生觀看影片長度的依據
            if (e.data === YT.PlayerState.PLAYING) {
              if (!YT_STATE.playStartTs) YT_STATE.playStartTs = Date.now();
            } else {
              flushYtWatchTime();
            }
          }
        }
      });
    });
  });
}

// 未勾選「包含隨堂考題目」時的簡化播放畫面：不需要 YouTube IFrame API 的播放狀態事件（沒有測驗、
// 不需要精算觀看時長），直接用一般 <iframe> 嵌入影片、置中呈現，下方就是標記完成按鈕。
function openYoutubeTaskSimple(t) {
  openModal(
    '<div class="h-full flex flex-col items-center justify-center bg-black p-4 sm:p-8">' +
      (PREVIEW_MODE ? '<div class="w-full max-w-3xl mb-3">' + previewBannerHtml() + '</div>' : '') +
      '<div class="w-full max-w-3xl aspect-video flex-shrink-0">' +
        '<iframe class="w-full h-full rounded-xl" src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(t.config.videoId || '') + '?rel=0" title="' + escapeHtml(t.title) + '" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>' +
      '</div>' +
      '<button onclick="markYoutubeSimpleComplete(\'' + t.id + '\')" class="w-full max-w-3xl py-3 rounded-xl btn-accent text-lg mt-4">✅ 標記已完成觀看</button>' +
    '</div>',
    { fullscreen: true }
  );
}

function markYoutubeSimpleComplete(taskId) {
  setLoading(true);
  doSubmitTask({ taskId: taskId, answers: [], watchedSeconds: 0 }).then(function (res) {
    setLoading(false);
    if (!res.success) return toast(res.message, 'error');
    closeModal();
    toast(PREVIEW_MODE ? '（預覽模式）已示範標記完成流程，未實際儲存' : '已標記完成！', 'success');
    refreshStudentTask();
  });
}

function fmtMinSec(totalSec) { totalSec = Math.round(totalSec || 0); var m = Math.floor(totalSec / 60), s = totalSec % 60; return m + '分' + s + '秒'; }

// 將目前這一段「播放中」的時間累加進總觀看秒數，並結束計時區段
function flushYtWatchTime() {
  if (YT_STATE && YT_STATE.playStartTs) {
    YT_STATE.watchedSeconds += (Date.now() - YT_STATE.playStartTs) / 1000;
    YT_STATE.playStartTs = null;
  }
}

function submitYoutubeQuiz(taskId) {
  var form = document.getElementById('yt-quiz-form');
  var answers = [];
  if (form) {
    var data = new FormData(form);
    var names = {};
    Array.prototype.forEach.call(form.elements, function (el) { if (el.name) names[el.name] = true; });
    var missing = false;
    Object.keys(names).forEach(function (name) {
      var val = data.get(name);
      if (!val) missing = true;
      answers.push({ questionId: name.replace('q_', ''), selected: val || '' });
    });
    if (missing) return toast('請完成所有題目再送出', 'error');
  }
  flushYtWatchTime();
  setLoading(true);
  doSubmitTask({ taskId: taskId, answers: answers, watchedSeconds: Math.round(YT_STATE.watchedSeconds) }).then(function (res) {
    setLoading(false);
    if (!res.success) return toast(res.message, 'error');
    if (answers.length > 0) { renderQuizResult(res.content); }
    else { closeModal(); toast(PREVIEW_MODE ? '（預覽模式）已示範標記完成流程' : '已標記完成！', 'success'); }
    refreshStudentTask();
  });
}
