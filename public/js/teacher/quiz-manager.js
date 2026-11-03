/* ---- 題庫管理（QUIZ / YOUTUBE 共用）---- */
function openQuestionManager(taskId, taskType) {
  setLoading(true);
  api('getQuizQuestions', taskId).then(function (res) {
    setLoading(false);
    renderQuestionManagerModal(taskId, taskType, res.data || []);
  });
}

var QUESTION_CACHE = {};

function renderQuestionManagerModal(taskId, taskType, questions) {
  QUESTION_CACHE = {};
  questions.forEach(function (q) { QUESTION_CACHE[q.id] = q; });
  var letters = ['A', 'B', 'C', 'D'];
  openModal(
    '<div class="text-lg font-bold mb-4">📋 題庫管理（共 ' + questions.length + ' 題）</div>' +
    '<div class="max-h-64 overflow-y-auto mb-4 space-y-2">' +
      (questions.length === 0 ? '<div class="text-slate-400 text-sm">尚無題目</div>' : questions.map(function (q, i) {
        var optsHtml = letters.map(function (letter, idx) {
          if (!q.options[idx]) return '';
          var isCorrect = String(q.answer).toUpperCase() === letter;
          return '<div class="' + (isCorrect ? 'text-green-600 font-bold' : 'text-slate-500') + '">' + (isCorrect ? '✅' : '⬜') + ' ' + letter + '. ' + escapeHtml(q.options[idx]) + '</div>';
        }).join('');
        return '<div class="border border-slate-100 rounded-xl p-3">' +
          '<div class="flex justify-between items-start gap-2 mb-1.5">' +
            '<div class="text-sm font-bold">' + (i + 1) + '. ' + escapeHtml(q.text) + '</div>' +
            '<div class="flex gap-2 shrink-0">' +
              '<button onclick="editQuestion(\'' + q.id + '\')" class="text-xs text-blue-600 font-bold hover:underline">編輯</button>' +
              '<button onclick="deleteQuestionAndRefresh(\'' + q.id + '\',\'' + taskId + '\',\'' + taskType + '\')" class="text-xs text-red-500 font-bold hover:underline">刪除</button>' +
            '</div>' +
          '</div>' +
          '<div class="text-xs space-y-0.5">' + optsHtml + '</div>' +
          (q.explanation ? '<div class="text-xs text-blue-500 mt-1.5">💡 ' + escapeHtml(q.explanation) + '</div>' : '') +
        '</div>';
      }).join('')) +
    '</div>' +

    '<div class="border-t pt-4 mb-4">' +
      '<div class="font-bold text-slate-600 mb-2 text-sm">🤖 AI 出題小幫手</div>' +
      '<div class="text-xs text-slate-400 mb-2">貼上影片字幕或逐字稿內容，一鍵產生範例提示詞；複製後貼到 ChatGPT／Gemini 等 AI 工具，即可請 AI 幫忙出題，再把 AI 回覆的結果貼到下方「CSV 批次匯入」欄位即可完成匯入。</div>' +
      '<textarea id="ai-subtitle" rows="3" placeholder="貼上影片字幕或逐字稿內容…" class="w-full border-2 border-blue-100 rounded-xl px-3 py-2 mb-2 text-sm"></textarea>' +
      '<div class="flex items-center gap-2 mb-2">' +
        '<label class="text-xs font-bold text-slate-500 whitespace-nowrap">生成題數</label>' +
        '<input id="ai-count" type="number" min="1" max="20" value="5" class="w-20 border-2 border-blue-100 rounded-xl px-2 py-1.5 text-sm">' +
        '<button onclick="generateAiPrompt()" class="flex-1 py-2 rounded-xl bg-blue-50 text-blue-600 font-bold text-sm hover:bg-blue-100">✨ 產生範例提示詞</button>' +
      '</div>' +
      '<div id="ai-prompt-wrap" class="hidden">' +
        '<textarea id="ai-prompt-output" rows="6" readonly class="w-full border-2 border-blue-100 rounded-xl px-3 py-2 mb-2 text-xs bg-slate-50"></textarea>' +
        '<button onclick="copyAiPrompt()" class="w-full py-2 rounded-xl btn-accent text-sm">📋 一鍵複製提示詞</button>' +
      '</div>' +
    '</div>' +

    '<div class="border-t pt-4">' +
      '<div class="font-bold text-slate-600 mb-2 text-sm" id="q-form-title">新增單題</div>' +
      '<input id="q-edit-id" type="hidden">' +
      '<input id="q-text" placeholder="題幹" class="w-full border-2 border-blue-100 rounded-xl px-3 py-2 mb-2 text-sm">' +
      '<div class="grid grid-cols-2 gap-2 mb-2">' +
        '<input id="q-a" placeholder="選項A" class="border-2 border-blue-100 rounded-xl px-3 py-2 text-sm">' +
        '<input id="q-b" placeholder="選項B" class="border-2 border-blue-100 rounded-xl px-3 py-2 text-sm">' +
        '<input id="q-c" placeholder="選項C" class="border-2 border-blue-100 rounded-xl px-3 py-2 text-sm">' +
        '<input id="q-d" placeholder="選項D" class="border-2 border-blue-100 rounded-xl px-3 py-2 text-sm">' +
      '</div>' +
      '<select id="q-ans" class="w-full border-2 border-blue-100 rounded-xl px-3 py-2 mb-2 text-sm"><option value="A">正解：A</option><option value="B">正解：B</option><option value="C">正解：C</option><option value="D">正解：D</option></select>' +
      '<input id="q-ts" type="hidden">' +
      '<input id="q-exp" placeholder="詳解（選填）" class="w-full border-2 border-blue-100 rounded-xl px-3 py-2 mb-3 text-sm">' +
      '<div class="flex gap-2 mb-4">' +
        '<button id="q-submit-btn" onclick="addSingleQuestion(\'' + taskId + '\',\'' + taskType + '\')" class="flex-1 py-2.5 rounded-xl btn-primary">＋ 新增這一題</button>' +
        '<button id="q-cancel-btn" onclick="cancelEditQuestion(\'' + taskId + '\',\'' + taskType + '\')" class="hidden px-4 py-2.5 rounded-xl bg-slate-100 text-slate-500 font-bold">取消編輯</button>' +
      '</div>' +
      '<div class="font-bold text-slate-600 mb-2 text-sm">CSV 批次匯入</div>' +
      '<div class="text-xs text-slate-400 mb-2">格式：題幹,選項A,選項B,選項C,選項D,正解(A/B/C/D),詳解(選填)　每行一題</div>' +
      '<textarea id="q-csv" rows="4" placeholder="題幹,選項A,選項B,選項C,選項D,A" class="w-full border-2 border-blue-100 rounded-xl px-3 py-2 mb-2 text-sm"></textarea>' +
      '<button onclick="importCsvQuestions(\'' + taskId + '\',\'' + taskType + '\')" class="w-full py-2.5 rounded-xl btn-accent">匯入 CSV</button>' +
    '</div>', { wide: true }
  );
}

/* ---- AI 出題提示詞產生器（僅產生提示詞文字供複製，不呼叫任何 AI API） ---- */
function buildAiPromptText(subtitleText, count) {
  return '你是一位教學設計助教。請根據以下影片字幕／逐字稿內容，出 ' + count + ' 題「單選題」，用來檢測學生對這段內容的理解程度。\n\n' +
    '【格式要求，請務必嚴格遵守，輸出將直接用於系統批次匯入】\n' +
    '1. 每題各佔一行，欄位之間以半形逗號「,」分隔，順序如下：\n' +
    '   題幹,選項A,選項B,選項C,選項D,正解,詳解\n' +
    '2. 正解欄位只能填英文字母 A、B、C 或 D（對應選項A~D其中之一）。\n' +
    '3. 詳解請用一句話簡短說明正解依據（20字以內），若無法判斷可留空但仍需保留該欄逗號。\n' +
    '4. 四個選項都必須填寫，且只有一個是正確答案，其餘為合理的干擾選項。\n' +
    '5. 若題幹或選項內容本身包含逗號，請將該欄位以雙引號 " 包起來。\n' +
    '6. 不要輸出標題列，也不要加上任何說明文字、編號或 Markdown 符號，直接輸出 ' + count + ' 行資料即可。\n\n' +
    '【影片字幕／逐字稿內容】\n' + subtitleText;
}

function generateAiPrompt() {
  var subtitle = document.getElementById('ai-subtitle').value.trim();
  if (!subtitle) return toast('請先貼上影片字幕或逐字稿內容', 'error');
  var count = Math.max(1, Math.min(20, Number(document.getElementById('ai-count').value) || 5));
  document.getElementById('ai-prompt-output').value = buildAiPromptText(subtitle, count);
  document.getElementById('ai-prompt-wrap').classList.remove('hidden');
}

function copyAiPrompt() {
  var ta = document.getElementById('ai-prompt-output');
  if (!ta || !ta.value) return;
  ta.focus();
  ta.select();
  var done = function () { toast('已複製提示詞，快去貼給 AI 工具吧！', 'success'); };
  var fallback = function () {
    try { document.execCommand('copy'); done(); } catch (e) { toast('複製失敗，請手動選取後複製', 'error'); }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(ta.value).then(done).catch(fallback);
  } else {
    fallback();
  }
}

/* ---- 單題新增／編輯 ---- */
function editQuestion(qid) {
  var q = QUESTION_CACHE[qid];
  if (!q) return;
  document.getElementById('q-edit-id').value = q.id;
  document.getElementById('q-text').value = q.text;
  document.getElementById('q-a').value = q.options[0] || '';
  document.getElementById('q-b').value = q.options[1] || '';
  document.getElementById('q-c').value = q.options[2] || '';
  document.getElementById('q-d').value = q.options[3] || '';
  document.getElementById('q-ans').value = q.answer;
  document.getElementById('q-exp').value = q.explanation || '';
  var tsInput = document.getElementById('q-ts');
  if (tsInput && tsInput.type === 'number') tsInput.value = q.timestamp === null ? '' : q.timestamp;
  document.getElementById('q-form-title').textContent = '✏️ 編輯題目';
  document.getElementById('q-submit-btn').textContent = '💾 更新這一題';
  document.getElementById('q-cancel-btn').classList.remove('hidden');
  document.getElementById('q-text').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelEditQuestion(taskId, taskType) {
  openQuestionManager(taskId, taskType);
}

function addSingleQuestion(taskId, taskType) {
  var editId = document.getElementById('q-edit-id').value;
  var text = document.getElementById('q-text').value.trim();
  var a = document.getElementById('q-a').value.trim(), b = document.getElementById('q-b').value.trim(), c = document.getElementById('q-c').value.trim(), d = document.getElementById('q-d').value.trim();
  if (!text || !a || !b) return toast('請至少填寫題幹與選項A、B', 'error');
  var ans = document.getElementById('q-ans').value;
  var ts = document.getElementById('q-ts').value;
  var exp = document.getElementById('q-exp').value.trim();
  setLoading(true);
  api('saveQuizQuestion', { id: editId || '', taskId: taskId, text: text, options: [a, b, c, d], answer: ans, explanation: exp, timestamp: ts === '' ? null : Number(ts) }).then(function (res) {
    setLoading(false);
    if (res.success) openQuestionManager(taskId, taskType); else toast(res.message, 'error');
  });
}

function importCsvQuestions(taskId, taskType) {
  var csv = document.getElementById('q-csv').value.trim();
  if (!csv) return toast('請貼上 CSV 內容', 'error');
  setLoading(true);
  api('batchImportQuizQuestions', taskId, csv).then(function (res) {
    setLoading(false);
    if (res.success) { toast(res.message, 'success'); openQuestionManager(taskId, taskType); }
    else toast(res.message, 'error');
  });
}

function deleteQuestionAndRefresh(qid, taskId, taskType) {
  api('deleteQuizQuestion', qid).then(function (res) {
    if (res.success) openQuestionManager(taskId, taskType); else toast(res.message, 'error');
  });
}
