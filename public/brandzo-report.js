/* ============================================================
   BRANDZO — Shared Report Chrome (شريط علوي موحّد للتقارير)
   يحقن شريط «رجوع للوحة التحكم» + هوية Brandzo في كل تقرير مستقل.
   غير تدميري: لا يمس محتوى التقرير، فقط يضيف شريطاً علوياً.
   ذاتي الاكتفاء (ينسّق نفسه) — يكفي سطر <script> واحد في كل تقرير.
   ============================================================ */
(function () {
  // مسار لوحة التحكم من جذر public (التقارير في الجذر → dashboard/)
  var DASH = 'dashboard/';

  function injectStyle() {
    if (document.getElementById('brz-report-style')) return;
    var s = document.createElement('style');
    s.id = 'brz-report-style';
    s.textContent =
      '.brz-report-bar{position:sticky;top:0;z-index:99999;display:flex;align-items:center;' +
      'justify-content:space-between;gap:12px;padding:8px 16px;' +
      'background:var(--brz-navy,#0d1b2a);border-bottom:2px solid var(--brz-gold,#DAAA3C);' +
      "font-family:'Cairo','Segoe UI',sans-serif;direction:rtl;box-shadow:0 2px 10px rgba(0,0,0,.25)}" +
      '.brz-report-bar .brz-back{display:inline-flex;align-items:center;gap:8px;' +
      'background:var(--brz-red,#c41e3a);color:#fff;text-decoration:none;font-weight:700;' +
      'font-size:13px;padding:8px 16px;border-radius:8px;transition:background .18s}' +
      '.brz-report-bar .brz-back:hover{background:var(--brz-red-dark,#7e2b2a)}' +
      '.brz-report-bar .brz-brand{display:inline-flex;align-items:center;gap:8px;' +
      'color:var(--brz-gold,#DAAA3C);font-weight:800;font-size:14px}' +
      '.brz-report-bar .brz-logo{width:26px;height:26px;border-radius:50%;' +
      'background:var(--brz-red,#c41e3a);color:#fff;display:inline-flex;align-items:center;' +
      "justify-content:center;font-size:10px;font-weight:800;font-family:Arial}" +
      '@media print{.brz-report-bar{display:none !important}}';
    document.head.appendChild(s);
  }

  function build() {
    if (document.getElementById('brz-report-bar')) return;
    injectStyle();
    var bar = document.createElement('div');
    bar.id = 'brz-report-bar';
    bar.className = 'brz-report-bar no-print';
    bar.innerHTML =
      '<a class="brz-back" href="' + DASH + '">' +
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">' +
        '<path d="M12 4l1.4 1.4L7.8 11H20v2H7.8l5.6 5.6L12 20l-8-8z"/></svg>' +
        ' رجوع للوحة التحكم' +
      '</a>' +
      '<span class="brz-brand"><span class="brz-logo">BFP</span> Brandzo Hub</span>';
    document.body.insertBefore(bar, document.body.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
