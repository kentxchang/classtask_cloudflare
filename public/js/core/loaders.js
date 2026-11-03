/* ============================================================
 * 1.5 外部函式庫按需載入／文字檔案讀寫／截圖與下載共用工具
 * 只有用到「分享 Markdown」「分享 HTML」時才載入對應函式庫，平常不會拖慢頁面。
 * ============================================================ */
var LIBS = {
  marked: 'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js',
  purify: 'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js',
  markedFootnote: 'https://cdn.jsdelivr.net/npm/marked-footnote@1.2.4/dist/index.umd.js',
  katex: 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js',
  katexCss: 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css',
  mermaid: 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js',
  jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  // 畫面轉圖片：使用瀏覽器本身的排版引擎繪製（Markdown 下載、分享 HTML 截圖共用）
  htmlToImage: 'https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.11/html-to-image.min.js'
};
var LOADED_SCRIPTS = {};

function loadScript(url) {
  if (!LOADED_SCRIPTS[url]) {
    LOADED_SCRIPTS[url] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.onload = resolve;
      s.onerror = function () { delete LOADED_SCRIPTS[url]; reject(new Error('外部元件載入失敗，請確認網路連線')); };
      document.head.appendChild(s);
    });
  }
  return LOADED_SCRIPTS[url];
}

// 樣式表加上 crossorigin，截圖下載時才能讀取其中的字型（例如數學公式字型）並嵌入圖片
function loadStylesheet(url) {
  if (!LOADED_SCRIPTS[url]) {
    LOADED_SCRIPTS[url] = new Promise(function (resolve, reject) {
      var l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = url; l.crossOrigin = 'anonymous';
      l.onload = resolve;
      l.onerror = function () { delete LOADED_SCRIPTS[url]; reject(new Error('樣式載入失敗，請確認網路連線')); };
      document.head.appendChild(l);
    });
  }
  return LOADED_SCRIPTS[url];
}

function loadLibs(names) {
  return Promise.all(names.map(function (n) { return loadScript(LIBS[n]); }));
}

// 純文字（UTF-8）→ base64 data URL，供 uploadFile 存入資料庫
function textToDataUrl(text, mime) {
  var bytes = new TextEncoder().encode(text);
  var bin = '';
  for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return 'data:' + mime + ';base64,' + btoa(bin);
}

// 讀取資料庫中的文字檔案（Markdown／HTML）
function fetchFileText(fileId) {
  return fetch(fileUrl(fileId)).then(function (r) {
    if (!r.ok) throw new Error('讀取內容失敗（HTTP ' + r.status + '）');
    return r.text();
  });
}

function safeFileName(s) {
  return String(s || 'download').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
}

function downloadHref(href, filename) {
  var a = document.createElement('a');
  a.href = href; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}

// 把畫面元素轉成畫布（html-to-image 以 SVG 交給瀏覽器繪製，文字、清單、表格位置與畫面上完全一致）
function nodeToCanvas(node, pixelRatio) {
  return loadLibs(['htmlToImage']).then(function () {
    var opts = { pixelRatio: pixelRatio, backgroundColor: '#ffffff', cacheBust: false };
    return htmlToImage.toCanvas(node, opts).catch(function () {
      opts.skipFonts = true; // 網路字型無法嵌入時改用系統字型再試一次
      return htmlToImage.toCanvas(node, opts);
    });
  });
}

// 把長畫布切成多頁 A4 PDF；breakPoints（畫布像素）為建議換頁位置，盡量不把一行字切成兩半
function canvasToPdf(canvas, breakPoints, filename) {
  return loadLibs(['jspdf']).then(function () {
    var pdf = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    var margin = 32;
    var pageW = pdf.internal.pageSize.getWidth(), pageH = pdf.internal.pageSize.getHeight();
    var ratio = (pageW - margin * 2) / canvas.width;
    var sliceMax = Math.floor((pageH - margin * 2) / ratio);
    var y = 0, first = true;
    while (y < canvas.height) {
      var end = Math.min(y + sliceMax, canvas.height);
      if (end < canvas.height) {
        var best = (breakPoints || []).filter(function (b) { return b > y + sliceMax * 0.5 && b <= end; }).pop();
        if (best) end = best;
      }
      var slice = document.createElement('canvas');
      slice.width = canvas.width; slice.height = end - y;
      var ctx = slice.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, y, canvas.width, end - y, 0, 0, canvas.width, end - y);
      if (!first) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, canvas.width * ratio, (end - y) * ratio);
      first = false;
      y = end;
    }
    pdf.save(filename);
  });
}
