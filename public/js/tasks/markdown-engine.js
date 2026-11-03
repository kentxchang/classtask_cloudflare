/* ---- 13.8.0 Markdown 轉 HTML 引擎（分享 Markdown 任務使用） ----
 * 以 marked（GFM：表格、刪除線、待辦清單、自動連結）為基礎，另外補上：
 *  1. 中文粗體／斜體修正：標準規則下「**「水」**」這種粗體符號緊貼全形標點的寫法不會生效，這裡改用寬鬆規則
 *  2. 數學公式（KaTeX）：$行內$、$$區塊$$、\( \)、\[ \]
 *  3. 註腳 [^1]、==螢光標記==、上標 ^2^、下標 H~2~O
 *  4. Mermaid 流程圖（```mermaid 程式碼區塊，僅在用到時才載入）
 * 輸出一律經 DOMPurify 過濾，避免夾帶惡意程式碼。 */
var MD_ENGINE_READY = null;

function ensureMarkdownEngine() {
  if (!MD_ENGINE_READY) {
    MD_ENGINE_READY = Promise.all([
      loadLibs(['marked', 'purify', 'katex', 'markedFootnote']),
      loadStylesheet(LIBS.katexCss)
    ]).then(setupMarkdownEngine).catch(function (e) { MD_ENGINE_READY = null; throw e; });
  }
  return MD_ENGINE_READY;
}

function renderTex(tex, displayMode) {
  return katex.renderToString(tex, { throwOnError: false, displayMode: displayMode, output: 'html', strict: false });
}

// 行內語法：規則簡單、以「開頭符號 + 非空白內容 + 結尾符號」判斷，不受中文標點影響
function inlineRule(name, startRe, re, build) {
  return {
    name: name,
    level: 'inline',
    start: function (src) { var m = src.match(startRe); return m ? m.index : undefined; },
    tokenizer: function (src) {
      var m = re.exec(src);
      return m ? build.call(this, m) : undefined;
    }
  };
}

function setupMarkdownEngine() {
  var mathBlock = {
    name: 'mathBlock',
    level: 'block',
    start: function (src) { var m = src.match(/\$\$|\\\[/); return m ? m.index : undefined; },
    tokenizer: function (src) {
      var m = /^\$\$([\s\S]+?)\$\$[^\S\n]*(?:\n|$)/.exec(src) || /^\\\[([\s\S]+?)\\\][^\S\n]*(?:\n|$)/.exec(src);
      if (m) return { type: 'mathBlock', raw: m[0], text: m[1].trim() };
    },
    renderer: function (token) { return '<div class="md-math-block">' + renderTex(token.text, true) + '</div>\n'; }
  };

  var mathInline = {
    name: 'mathInline',
    level: 'inline',
    start: function (src) { var m = src.match(/\$|\\\(/); return m ? m.index : undefined; },
    tokenizer: function (src) {
      var m = /^\$\$([\s\S]+?)\$\$/.exec(src);
      if (m) return { type: 'mathInline', raw: m[0], text: m[1].trim(), display: true };
      // $...$：開頭後與結尾前不可為空白、結尾後不可緊接數字，避免把「$100 和 $200」誤判為公式
      m = /^\$(?=[^\s$])((?:\\\$|[^$\n])*?[^\s\\])\$(?!\d)/.exec(src) || /^\\\(([\s\S]+?)\\\)/.exec(src);
      if (m) return { type: 'mathInline', raw: m[0], text: m[1], display: false };
    },
    renderer: function (token) { return renderTex(token.text, token.display); }
  };

  var strongEm = inlineRule('cjkStrongEm', /\*\*\*/, /^\*\*\*(?=\S)([\s\S]*?\S)\*\*\*(?!\*)/, function (m) {
    return { type: 'strong', raw: m[0], text: m[1], tokens: [{ type: 'em', raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) }] };
  });
  var strong = inlineRule('cjkStrong', /\*\*/, /^\*\*(?=\S)([\s\S]*?\S)\*\*(?!\*)/, function (m) {
    return { type: 'strong', raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) };
  });
  var em = inlineRule('cjkEm', /\*/, /^\*(?=[^\s*])([\s\S]*?[^\s*])\*(?!\*)/, function (m) {
    return { type: 'em', raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) };
  });
  var del = inlineRule('cjkDel', /~~/, /^~~(?=[^\s~])([\s\S]*?[^\s~])~~(?!~)/, function (m) {
    return { type: 'del', raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) };
  });
  var mark = inlineRule('mark', /==/, /^==(?=[^\s=])([\s\S]*?[^\s=])==(?!=)/, function (m) {
    return { type: 'mark', raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) };
  });
  mark.renderer = function (token) { return '<mark>' + this.parser.parseInline(token.tokens) + '</mark>'; };
  var sup = inlineRule('sup', /\^/, /^\^([^\^\s]{1,30})\^/, function (m) {
    return { type: 'sup', raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) };
  });
  sup.renderer = function (token) { return '<sup>' + this.parser.parseInline(token.tokens) + '</sup>'; };
  // 單一波浪號且內容無空白才視為下標（H~2~O）；~~雙波浪號~~ 仍為刪除線
  var sub = inlineRule('sub', /~(?!~)/, /^~(?!~)([^~\s]{1,30})~(?!~)/, function (m) {
    return { type: 'sub', raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) };
  });
  sub.renderer = function (token) { return '<sub>' + this.parser.parseInline(token.tokens) + '</sub>'; };

  marked.use({ gfm: true, breaks: true });
  marked.use(markedFootnote({ description: '註解' }));
  marked.use({ extensions: [mathBlock, mathInline, strongEm, strong, em, del, mark, sup, sub] });
}

// Markdown 文字 → 安全的 HTML 字串（需先呼叫 ensureMarkdownEngine）
function renderMarkdownHtml(md) {
  var html = marked.parse(String(md || '').replace(/\r\n?/g, '\n'));
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
}

// 畫面插入後的處理：連結另開新分頁、Mermaid 圖表轉成圖形
function enhanceMarkdownDom(root) {
  Array.prototype.forEach.call(root.querySelectorAll('a[href]'), function (a) {
    if (a.getAttribute('href').charAt(0) === '#') return; // 註腳等頁內連結
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
  });
  var blocks = root.querySelectorAll('pre > code.language-mermaid');
  if (!blocks.length) return Promise.resolve();
  return loadLibs(['mermaid']).then(function () {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' });
    var seq = 0;
    return Array.prototype.reduce.call(blocks, function (p, code) {
      return p.then(function () {
        return mermaid.render('md-mermaid-' + Date.now() + '-' + (seq++), code.textContent).then(function (out) {
          var box = document.createElement('div');
          box.className = 'md-mermaid';
          box.innerHTML = out.svg;
          code.parentNode.replaceWith(box);
        }).catch(function () {
          code.parentNode.insertAdjacentHTML('afterend', '<div class="text-xs text-red-500">（此流程圖語法有誤，無法繪製）</div>');
        });
      });
    }, Promise.resolve());
  }).catch(function () { /* 流程圖元件載入失敗時保留原始程式碼 */ });
}
