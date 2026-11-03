/* ---- 13.9 分享 HTML：在沙盒中顯示老師提供的網頁，右下角「📸 截圖回傳」 ----
 * 安全性：iframe 使用 sandbox 且「不」給 allow-same-origin，老師貼上的程式碼無法讀取本平台的任何資料。
 * 因此截圖程式（htmlShotAgent）會注入到網頁內部執行，再透過 postMessage 把截圖傳回外層。
 * 回傳的截圖與手繪作品相同：存成圖片、狀態為「待批改」，教師端以縮圖牆呈現並評分。 */
var HTML_SHARE = { task: null, iframe: null, pending: null, seq: 0, lastShot: null };

/**
 * 注入到老師 HTML 內執行的截圖程式（會被轉成字串，因此不能引用外部變數）。
 * 沙盒中無法使用 html2canvas（它需要建立同源的隱藏 iframe），因此改用 html-to-image：
 * 把每個元素「此刻」的實際樣式複製下來，轉成 SVG 圖片後再畫到畫布上。
 * 針對「淡入淡出等動畫導致截不到文字」做了四層處理：
 *  1. 整頁截圖前先由上往下捲動一次，觸發「捲動到才出現」的效果（AOS、IntersectionObserver 等）
 *  2. 將所有進行中／尚未開始的 CSS 動畫與轉場直接快轉到結束狀態（無限循環的動畫保持目前樣子）
 *  3. 截圖用的 SVG 中關閉所有動畫與轉場（否則 SVG 圖片會從動畫第一格、透明度 0 開始重播）
 *  4. 仍然完全透明、且看起來是「淡入用」的元素（class 含 fade／reveal／aos…），在截圖中強制顯示
 */
function htmlShotAgent(LIB_URL, MAX_W, QUALITY) {
  var REVEAL_HINT = /fade|reveal|aos|appear|animate|wow|inview|in-view|slide-?in|zoom-?in/i;
  var OUT_HINT = /out\b|-out|_out/i;
  var SVG_PREFIX = 'data:image/svg+xml;charset=utf-8,';
  var BLANK_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function frames() { return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); }); }
  function scroller() { return document.scrollingElement || document.documentElement; }

  function loadLib() {
    if (window.htmlToImage) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = LIB_URL;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('截圖元件載入失敗，請確認網路連線')); };
      document.head.appendChild(s);
    });
  }

  function revealByScrolling() {
    var se = scroller(), orig = se.scrollTop, y = 0;
    var step = Math.max(200, Math.floor(window.innerHeight * 0.7));
    function loop() {
      if (y >= se.scrollHeight) {
        se.scrollTop = se.scrollHeight;
        return wait(200).then(function () { se.scrollTop = orig; window.dispatchEvent(new Event('scroll')); return wait(120); });
      }
      se.scrollTop = y;
      window.dispatchEvent(new Event('scroll'));
      y += step;
      return wait(100).then(loop);
    }
    return loop();
  }

  function finishAnimations() {
    if (!document.getAnimations) return;
    document.getAnimations().forEach(function (a) {
      try {
        var timing = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
        if (timing && timing.endTime === Infinity) return;
        a.finish();
      } catch (e) { /* 部分動畫無法快轉，略過 */ }
    });
  }

  function hasVisibleContent(el) {
    return (el.textContent || '').trim().length > 0 || !!el.querySelector('img,svg,canvas,video') || /^(IMG|SVG|CANVAS|VIDEO)$/i.test(el.tagName);
  }

  function hintOf(el) {
    var cn = el.className;
    var h = String(cn && cn.baseVal !== undefined ? cn.baseVal : cn || '');
    for (var i = 0; i < el.attributes.length; i++) h += ' ' + el.attributes[i].name;
    return h;
  }

  // 為每個元素加上編號，並產生截圖專用的 CSS 規則
  function prepareRules(viewMode) {
    var els = document.querySelectorAll('body *');
    var body = document.body, bRect = body.getBoundingClientRect(), bcs = getComputedStyle(body);
    var rules = ['*,*::before,*::after{animation:none!important;transition:none!important}'];
    for (var i = 0; i < els.length; i++) {
      var el = els[i], cs = getComputedStyle(el), hint = hintOf(el);
      el.setAttribute('data-shot-i', String(i));
      var sel = '[data-shot-i="' + i + '"]';
      if (parseFloat(cs.opacity) < 0.1 && cs.visibility !== 'hidden' && cs.display !== 'none' && REVEAL_HINT.test(hint) && !OUT_HINT.test(hint) && hasVisibleContent(el)) {
        rules.push(sel + '{opacity:1!important;transform:none!important;filter:none!important;visibility:visible!important}');
      }
      // 「目前畫面」截圖：固定在畫面上的元素（例如頂端選單）改放到目前看到的位置
      if (viewMode && cs.position === 'fixed') {
        var r = el.getBoundingClientRect();
        rules.push(sel + '{position:absolute!important;top:' + (r.top - bRect.top - parseFloat(bcs.borderTopWidth || 0)) + 'px!important;left:' + (r.left - bRect.left - parseFloat(bcs.borderLeftWidth || 0)) +
          'px!important;right:auto!important;bottom:auto!important;margin:0!important;width:' + r.width + 'px!important;height:' + r.height + 'px!important;transform:none!important}');
      }
    }
    return rules.join('');
  }

  function cleanup() {
    var tagged = document.querySelectorAll('[data-shot-i]');
    for (var i = 0; i < tagged.length; i++) tagged[i].removeAttribute('data-shot-i');
  }

  function pageBackground() {
    var c = getComputedStyle(document.body).backgroundColor;
    if (!c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)') c = getComputedStyle(document.documentElement).backgroundColor;
    return (!c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)') ? '#ffffff' : c;
  }

  // 調整 SVG 尺寸並加入截圖規則後，畫到畫布上（最大寬度 MAX_W，輸出 JPEG）
  function rasterize(svgUrl, css, W, H, bg) {
    var svg = decodeURIComponent(svgUrl.slice(SVG_PREFIX.length));
    svg = svg.replace(/^<svg([^>]*)>/, function (m, attrs) {
      attrs = attrs.replace(/\s(width|height|viewBox)="[^"]*"/g, '');
      return '<svg' + attrs + ' width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '"><style><![CDATA[' + css + ']]></style>';
    });
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(window.devicePixelRatio || 1, MAX_W / W);
        if (W * H * scale * scale > 16000000) scale = Math.sqrt(16000000 / (W * H));
        if (H * scale > 30000) scale = 30000 / H;
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(W * scale));
        canvas.height = Math.max(1, Math.round(H * scale));
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', QUALITY));
      };
      img.onerror = function () { reject(new Error('截圖轉換失敗')); };
      img.src = SVG_PREFIX + encodeURIComponent(svg);
    });
  }

  function capture(mode) {
    var full = mode === 'full';
    var se = scroller();
    return loadLib().then(function () {
      return full ? revealByScrolling() : null;
    }).then(function () {
      finishAnimations();
      return document.fonts && document.fonts.ready ? document.fonts.ready : null;
    }).then(frames).then(function () {
      finishAnimations();
      var vw = document.documentElement.clientWidth || window.innerWidth;
      var vh = window.innerHeight;
      var sx = full ? 0 : (window.scrollX || se.scrollLeft);
      var sy = full ? 0 : (window.scrollY || se.scrollTop);
      var W = full ? Math.max(se.scrollWidth, vw) : vw;
      var H = full ? Math.max(se.scrollHeight, document.body.scrollHeight, vh) : vh;
      var css = prepareRules(!full);
      var bg = pageBackground();
      var opts = {
        backgroundColor: bg, imagePlaceholder: BLANK_PNG, cacheBust: false,
        style: full ? {} : { transform: 'translate(' + (-sx) + 'px,' + (-sy) + 'px)', transformOrigin: '0 0' }
      };
      return window.htmlToImage.toSvg(document.body, opts).catch(function () {
        opts.skipFonts = true; // 網路字型無法嵌入時改用系統字型再試一次
        return window.htmlToImage.toSvg(document.body, opts);
      }).then(function (svgUrl) { return rasterize(svgUrl, css, W, H, bg); });
    }).then(function (dataUrl) { cleanup(); return dataUrl; }, function (err) { cleanup(); throw err; });
  }

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (e.source !== window.parent || !d || d.__classroomShot !== 'capture') return;
    capture(d.mode).then(function (dataUrl) {
      window.parent.postMessage({ __classroomShot: 'result', id: d.id, dataUrl: dataUrl }, '*');
    }).catch(function (err) {
      window.parent.postMessage({ __classroomShot: 'result', id: d.id, error: String(err && err.message ? err.message : err) }, '*');
    });
  });
}

// 把截圖程式附加到老師的 HTML 最後面（</body> 之前）
function buildHtmlShareDoc(html) {
  var agent = '<script>(' + htmlShotAgent.toString() + ')(' + JSON.stringify(LIBS.htmlToImage) + ',' + IMAGE_MAX_WIDTH + ',' + IMAGE_QUALITY + ');<\/script>';
  var src = String(html || '');
  var idx = src.toLowerCase().lastIndexOf('</body>');
  return idx === -1 ? src + agent : src.slice(0, idx) + agent + src.slice(idx);
}

function openHtmlShareTask(t) {
  if (!t.config.fileId) {
    openModal('<div class="text-lg font-black mb-2">🌐 ' + escapeHtml(t.title) + '</div><div class="text-slate-400 text-center py-8">此任務尚未設定內容</div>');
    return;
  }
  setLoading(true, '載入網頁中…');
  fetchFileText(t.config.fileId).then(function (html) {
    setLoading(false);
    HTML_SHARE.task = t;
    HTML_SHARE.pending = null;
    var locked = !PREVIEW_MODE && t.status === '已完成';
    var submitted = !PREVIEW_MODE && t.status === '待批改';
    openModal(
      '<div class="h-full flex flex-col">' +
        '<div class="flex-shrink-0 px-4 sm:px-6 pt-4 pb-3 pr-14 border-b border-slate-100">' +
          '<div class="text-lg font-black truncate">🌐 ' + escapeHtml(t.title) + '</div>' +
          (PREVIEW_MODE ? '<div class="mt-2">' + previewBannerHtml() + '</div>' : '') +
          (t.description ? '<p class="text-slate-500 text-sm mt-1 whitespace-pre-wrap">' + escapeHtml(t.description) + '</p>' : '') +
          (submitted ? '<div class="text-xs font-bold text-orange-600 mt-1">已回傳截圖，等待老師批改；重新截圖回傳會取代上一次的截圖。</div>' : '') +
          teacherCommentHtml(t) +
        '</div>' +
        '<div class="flex-1 min-h-0 relative bg-white">' +
          '<iframe id="html-share-frame" class="w-full h-full border-0" sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"></iframe>' +
          '<div class="absolute right-4 bottom-4 z-10 flex flex-col items-end gap-2">' +
            (locked
              ? '<div class="card px-4 py-2 text-sm font-bold text-green-600">✅ 已完成批改</div>' +
                '<button onclick="openReadOnlySubmissionTask(HTML_SHARE.task, \'🌐\')" class="px-4 py-2 rounded-full bg-white shadow-lg text-sm font-bold text-slate-600">🔍 查看已回傳的截圖</button>'
              : '<div id="html-shot-menu" class="hidden card p-2 flex flex-col gap-1 shadow-lg">' +
                  '<button onclick="takeHtmlScreenshot(\'view\')" class="px-4 py-2.5 rounded-lg text-sm font-bold text-left hover:bg-slate-100">🖥 目前畫面截圖</button>' +
                  '<button onclick="takeHtmlScreenshot(\'full\')" class="px-4 py-2.5 rounded-lg text-sm font-bold text-left hover:bg-slate-100">📜 整頁截圖</button>' +
                '</div>' +
                '<button onclick="toggleHtmlShotMenu()" class="px-5 py-3 rounded-full btn-accent shadow-lg">📸 截圖回傳</button>') +
          '</div>' +
        '</div>' +
      '</div>',
      { fullscreen: true }
    );
    var frame = document.getElementById('html-share-frame');
    HTML_SHARE.iframe = frame;
    frame.srcdoc = buildHtmlShareDoc(html);
  }).catch(function (e) {
    setLoading(false);
    toast('載入失敗：' + (e && e.message ? e.message : e), 'error');
  });
}

function toggleHtmlShotMenu() {
  var m = document.getElementById('html-shot-menu');
  if (m) m.classList.toggle('hidden');
}

function takeHtmlScreenshot(mode) {
  var frame = HTML_SHARE.iframe;
  if (!frame || !frame.contentWindow) return;
  toggleHtmlShotMenu();
  var id = ++HTML_SHARE.seq;
  setLoading(true, mode === 'full' ? '整頁截圖中，請稍候…' : '截圖中…');
  var timer = setTimeout(function () {
    if (HTML_SHARE.pending && HTML_SHARE.pending.id === id) {
      HTML_SHARE.pending = null;
      setLoading(false);
      toast('截圖逾時，請再試一次', 'error');
    }
  }, 60000);
  HTML_SHARE.pending = { id: id, mode: mode, timer: timer };
  frame.contentWindow.postMessage({ __classroomShot: 'capture', id: id, mode: mode }, '*');
}

window.addEventListener('message', function (e) {
  var d = e.data;
  if (!d || d.__classroomShot !== 'result') return;
  if (!HTML_SHARE.iframe || e.source !== HTML_SHARE.iframe.contentWindow) return;
  var p = HTML_SHARE.pending;
  if (!p || p.id !== d.id) return;
  clearTimeout(p.timer);
  HTML_SHARE.pending = null;
  setLoading(false);
  if (d.error || !d.dataUrl) return toast('截圖失敗：' + (d.error || '未知錯誤'), 'error');
  HTML_SHARE.lastShot = d.dataUrl;
  openHtmlShotPreview(d.dataUrl, p.mode);
});

// 截圖預覽：獨立圖層（不覆蓋底下的網頁視窗），確認後才回傳
function openHtmlShotPreview(dataUrl, mode) {
  closeHtmlShotPreview();
  var el = document.createElement('div');
  el.id = 'html-shot-preview-root';
  el.className = 'fixed inset-0 z-[970] modal-mask flex items-center justify-center p-4 fade-in';
  el.innerHTML =
    '<div class="card w-full max-w-3xl max-h-[92vh] flex flex-col p-5">' +
      '<div class="text-lg font-bold mb-1">確認截圖（' + (mode === 'full' ? '整頁' : '目前畫面') + '）</div>' +
      '<div class="text-xs text-slate-400 mb-3">確認內容無誤後按「回傳給老師」；若文字或圖片不完整，可重新截圖。</div>' +
      '<div class="flex-1 min-h-0 overflow-auto rounded-xl border border-slate-200 bg-slate-50"><img src="' + dataUrl + '" class="w-full block"></div>' +
      '<div class="flex flex-wrap justify-end gap-2 mt-4">' +
        '<button onclick="closeHtmlShotPreview()" class="px-5 py-2.5 rounded-xl bg-slate-100 font-bold hover:bg-slate-200">取消</button>' +
        '<button onclick="closeHtmlShotPreview(); toggleHtmlShotMenu();" class="px-5 py-2.5 rounded-xl bg-blue-50 text-blue-700 font-bold hover:bg-blue-100">重新截圖</button>' +
        '<button onclick="submitHtmlShot()" class="px-5 py-2.5 rounded-xl btn-primary">✅ 回傳給老師</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(el);
}

function closeHtmlShotPreview() {
  var el = document.getElementById('html-shot-preview-root');
  if (el) el.remove();
}

function submitHtmlShot() {
  var t = HTML_SHARE.task;
  if (!t || !HTML_SHARE.lastShot) return;
  setLoading(true, '回傳截圖中…');
  doSubmitTask({ taskId: t.id, base64: HTML_SHARE.lastShot, mimeType: 'image/jpeg' }).then(function (res) {
    setLoading(false);
    if (!res.success) return toast(res.message, 'error');
    closeHtmlShotPreview();
    closeModal();
    toast(PREVIEW_MODE ? '（預覽模式）已示範回傳流程，未實際儲存' : '截圖已回傳，等待老師批改！', 'success');
    refreshStudentTask();
  }).catch(function (e) { setLoading(false); toast('回傳失敗：' + e, 'error'); });
}
