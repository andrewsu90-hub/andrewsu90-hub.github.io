/* =========================================================
   Anzû Design Studio — 共用「匯出 PDF 報告」模組
   用法：在工具頁 </body> 前加上  <script src="pdf-report.js" defer></script>
   做法：把目前畫面（輸入值＋已顯示的結果）整理成報告版面，
         呼叫瀏覽器列印 →「另存為 PDF」，文字與 SVG 皆為向量。
   注意：只搬運畫面上已顯示的內容，不含任何計算公式。
   ========================================================= */
(function () {
  'use strict';
  if (window.AnzuPdf) return;

  // 頂層不放進報告的元素
  var SKIP_TOP = 'header, footer, script, style, noscript, link, .api-status, .pdf-toolbar, #pdfReport, [data-pdf-skip]';
  // 報告內要移除的互動元件
  var STRIP = 'button, .tabs, .tab-bar, .source-tabs-wrap, .src-tabs, .api-status, script, style, iframe, video, .back-link, [data-pdf-skip]';
  // 目前選取的頁籤（用來標示報告對應的方法）
  var ACTIVE_TABS = '.tab.active, .tab-btn.active, .src-tab.active, .source-tab.active, [role="tab"][aria-selected="true"]';

  var CSS = '' +
    '.pdf-toolbar{max-width:1000px;margin:0 auto;padding:0 5%;display:flex;justify-content:flex-end}' +
    '.pdf-btn{display:inline-flex;align-items:center;gap:8px;padding:9px 18px;border:.5px solid var(--primary-color,#000);border-radius:var(--radius-sm,6px);background:var(--primary-color,#000);color:var(--bg-white,#fff);font:inherit;font-size:13px;font-weight:600;letter-spacing:.3px;cursor:pointer;transition:opacity .15s}' +
    '.pdf-btn:hover{opacity:.8}' +
    '#pdfReport{display:none}' +
    '@media print{' +
    '@page{size:A4;margin:0}' + // 邊界 0：瀏覽器不會印日期、網址、頁碼；留白由 .rp-sp 墊高提供
    'html,body{background:#fff!important}' +
    'body>*:not(#pdfReport){display:none!important}' +
    '#pdfReport{display:block;background:#fff!important;color:#111!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:10.5pt;line-height:1.55}' +
    '#pdfReport *{animation:none!important;transition:none!important;backdrop-filter:none!important}' +
    '#pdfReport table.rp-wrap{width:100%;border-collapse:collapse;border:0;margin:0}' +
    '#pdfReport table.rp-wrap>thead{display:table-header-group}#pdfReport table.rp-wrap>tfoot{display:table-footer-group}' +
    '#pdfReport table.rp-wrap>thead>tr>td,#pdfReport table.rp-wrap>tfoot>tr>td,#pdfReport table.rp-wrap>tbody>tr>td{border:0!important;background:none!important;padding:0 14mm!important}' +
    '#pdfReport .rp-sp{height:14mm}' +
    '#pdfReport .rp-head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.5pt solid #1a1a2e;padding-bottom:6pt;margin-bottom:10pt}' +
    '#pdfReport .rp-brand{font-family:"Montserrat",sans-serif;font-weight:800;font-size:15pt;letter-spacing:1pt}' +
    '#pdfReport .rp-meta{font-size:8.5pt;color:#555;text-align:right}' +
    '#pdfReport .rp-title{font-size:16pt;font-weight:700;margin:0 0 3pt;line-height:1.3}' +
    '#pdfReport .rp-sub{font-size:9pt;color:#555;margin-bottom:8pt}' +
    '#pdfReport .rp-foot{margin-top:14pt;padding-top:5pt;border-top:.5pt solid #999;font-size:8pt;color:#666;display:flex;justify-content:space-between}' +
    '#pdfReport .rp-body .hero,#pdfReport .rp-body section,#pdfReport .rp-body .calc-section,#pdfReport .rp-body .main-section{max-width:none!important;margin-left:0!important;margin-right:0!important;padding-left:0!important;padding-right:0!important;padding-top:0!important;padding-bottom:4pt!important}' +
    '#pdfReport .rp-body .hero{margin-bottom:6pt!important}' +
    '#pdfReport .rp-body .hero p{font-size:9.5pt;line-height:1.6;margin:0 0 4pt}' +
    '#pdfReport .rp-body .result-item,#pdfReport .rp-body .stat,#pdfReport .rp-body svg{break-inside:avoid}' +
    '#pdfReport .rp-body h2,#pdfReport .rp-body h3,#pdfReport .rp-body h4{break-after:avoid}' +
    '#pdfReport .rp-body tr{break-inside:avoid}' +
    '#pdfReport .rp-body thead{display:table-header-group}' +
    '#pdfReport .rp-body input,#pdfReport .rp-body select,#pdfReport .rp-body textarea{-webkit-appearance:none;appearance:none}' +
    '}';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function txt(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var EMOJI = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}️‍]/gu;

  // 取得頁面 :root 的淺色變數（避免使用者系統為深色模式時，PDF 變成深底）
  function lightVars() {
    var out = [];
    for (var i = 0; i < document.styleSheets.length; i++) {
      var rules;
      try { rules = document.styleSheets[i].cssRules; } catch (e) { continue; }
      for (var j = 0; j < rules.length; j++) {
        var r = rules[j];
        if (r.type === 1 && /^(:root|html)$/.test(r.selectorText)) {
          for (var k = 0; k < r.style.length; k++) {
            var n = r.style[k];
            if (n.indexOf('--') === 0) out.push(n + ':' + r.style.getPropertyValue(n));
          }
        }
      }
    }
    return out.join(';');
  }

  // 把目前的輸入狀態寫回 HTML 屬性，clone 後才會保留
  function syncControls() {
    document.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (el.tagName === 'SELECT') {
        Array.prototype.forEach.call(el.options, function (o) { o.toggleAttribute('selected', o.selected); });
      } else if (el.tagName === 'TEXTAREA') {
        el.textContent = el.value;
      } else if (el.type === 'checkbox' || el.type === 'radio') {
        el.toggleAttribute('checked', el.checked);
      } else {
        el.setAttribute('value', el.value);
      }
    });
  }

  // API 計算進行中時等待（最多 20 秒）
  function waitIdle() {
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function poll() {
        var st = $('.api-status');
        var busy = st && st.classList.contains('loading') && st.style.display !== 'none';
        if (!busy || Date.now() - t0 > 20000) return resolve();
        setTimeout(poll, 200);
      })();
    });
  }

  function pageTitle() {
    var h1 = $('h1');
    var t = h1 ? txt(h1) : document.title.split('|')[0];
    return t.replace(EMOJI, '').trim();
  }

  function build() {
    syncControls();
    var title = pageTitle();
    var now = new Date().toLocaleString('zh-TW', { hour12: false });
    var tabs = Array.prototype.map.call(document.querySelectorAll(ACTIVE_TABS), txt).filter(Boolean);

    var body = document.createElement('div');
    body.className = 'rp-body';
    Array.prototype.forEach.call(document.body.children, function (n) {
      if (n.matches(SKIP_TOP) || n.matches(STRIP)) return;
      var c = n.cloneNode(true);
      c.querySelectorAll(STRIP).forEach(function (x) { x.remove(); });
      c.querySelectorAll('.hero-label, .hero h1').forEach(function (x) { x.remove(); });
      body.appendChild(c);
    });

    var html =
      '<table class="rp-wrap"><thead><tr><td><div class="rp-sp"></div></td></tr></thead>' +
      '<tfoot><tr><td><div class="rp-sp"></div></td></tr></tfoot><tbody><tr><td>' +
      '<div class="rp-head"><div class="rp-brand">Anzû Design Studio</div><div class="rp-meta">ANZU 製作<br>' + esc(now) + '</div></div>' +
      '<h1 class="rp-title">' + esc(title) + '</h1>' +
      (tabs.length ? '<div class="rp-sub">目前項目：' + esc(tabs.join(' ／ ')) + '</div>' : '') +
      '<div class="rp-body-slot"></div>' +
      '<div class="rp-foot"><span>僅供參考，實際應用請依規範驗證</span><span>ANZU</span></div>' +
      '</td></tr></tbody></table>';

    var box = $('#pdfReport');
    if (!box) {
      box = document.createElement('div');
      box.id = 'pdfReport';
      box.setAttribute('aria-hidden', 'true');
      document.body.appendChild(box);
    }
    box.setAttribute('style', lightVars());
    box.innerHTML = html;
    box.querySelector('.rp-body-slot').replaceWith(body);
    return title;
  }

  function exportPdf() {
    return waitIdle().then(function () {
      var title = build();
      var old = document.title;
      var d = new Date();
      var ds = '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
      document.title = (title || 'report').replace(/[\\/:*?"<>|\s]+/g, '_') + '_' + ds;
      window.addEventListener('afterprint', function () {
        document.title = old;
        var box = $('#pdfReport');
        if (box) box.innerHTML = '';
      }, { once: true });
      window.print();
    });
  }

  function init() {
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    var bar = document.createElement('div');
    bar.className = 'pdf-toolbar';
    bar.innerHTML = '<button type="button" class="pdf-btn">⬇ 匯出 PDF 報告</button>';
    bar.firstChild.addEventListener('click', exportPdf);
    var anchor = $('.hero') || $('header');
    if (anchor) anchor.insertAdjacentElement('afterend', bar);
    else document.body.insertBefore(bar, document.body.firstChild);
  }

  window.AnzuPdf = { export: exportPdf };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
