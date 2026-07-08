<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Brandzo — نظام جرد الأصول</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<style>
:root {
  --brand-primary: #8B0000;
  --brand-secondary: #c41e3a;
  --bg:        #f7f8fa;
  --bg-2:      #eef0f4;
  --surface:   #ffffff;
  --surface-2: #fafbfc;
  --surface-3: #f2f4f7;
  --ink:       #1e2433;
  --ink-2:     #3d4a5c;
  --ink-3:     #5a6778;
  --muted:     #8a95a3;
  --border:    #e8eaee;
  --border-2:  #d5d9e0;
  --accent:    #8B0000;
  --green:     #16a34a;
  --red:       #dc2626;
  --radius:    8px;
  --radius-lg: 14px;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body { font-family: 'IBM Plex Sans Arabic', sans-serif; background: var(--bg); color: var(--ink); font-size: 14px; line-height: 1.6; min-height: 100vh; }
input, select, textarea, button { font-family: inherit; }
input, select {
  background: var(--surface); border: 1.5px solid var(--border-2);
  color: var(--ink); border-radius: var(--radius); padding: 9px 13px;
  font-size: 13px; outline: none; transition: border-color .15s, box-shadow .15s; width: 100%;
}
input:focus, select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(139,0,0,.1); }
select option { background: var(--surface); color: var(--ink); }
button { cursor: pointer; border: none; font-weight: 600; transition: all .15s; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 99px; }

/* HEADER */
#app-header {
  background: var(--surface); border-bottom: 2px solid var(--border);
  padding: 0 28px; height: 64px; display: flex; align-items: center;
  justify-content: space-between; position: sticky; top: 0; z-index: 90;
  box-shadow: 0 2px 10px rgba(0,0,0,.07);
}
.brand { display: flex; align-items: center; gap: 12px; }
.brand-logo {
  width: 44px; height: 44px;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-secondary));
  border-radius: 12px; display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 13px; color: #fff; letter-spacing: -1px;
  box-shadow: 0 4px 14px rgba(139,0,0,.3);
}
.brand-name { font-weight: 700; font-size: 17px; color: var(--ink); }
.brand-sub  { font-size: 11px; color: var(--brand-secondary); font-weight: 500; }
.hdr-deco { display: flex; gap: 4px; flex-direction: column; align-items: center; }
.bar { background: linear-gradient(180deg, var(--brand-secondary), var(--brand-primary)); border-radius: 2px; }
.bar-t { width: 5px; height: 16px; } .bar-k { width: 9px; height: 22px; }
.header-actions { display: flex; gap: 8px; align-items: center; }

.btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 15px; border-radius: var(--radius); font-size: 13px; font-weight: 600;
  border: 1.5px solid transparent; transition: all .2s ease;
}
.btn-ghost { background: var(--surface-2); border-color: var(--border-2); color: var(--ink-2); }
.btn-ghost:hover { border-color: var(--brand-secondary); color: var(--brand-primary); background: rgba(139,0,0,.05); }
.btn-primary {
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-secondary));
  color: #fff; border-color: var(--brand-secondary);
  box-shadow: 0 2px 8px rgba(139,0,0,.22);
}
.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(139,0,0,.3); }
.btn-success { background: #dcfce7; color: #15803d; border-color: #86efac; }
.btn-success:hover { background: #15803d; color: #fff; transform: translateY(-1px); }
.btn-success:disabled, .btn-primary:disabled { background: var(--border-2); color: var(--muted); cursor: not-allowed; box-shadow: none; transform: none; border-color: var(--border-2); }
.btn-danger { background: #fff1f1; border-color: #fca5a5; color: #dc2626; }
.btn-danger:hover { background: #fee2e2; }
.btn-sm { padding: 5px 10px; font-size: 12px; }

/* LAYOUT */
#main { max-width: 1300px; margin: 0 auto; padding: 24px 20px 60px; }

/* STATS */
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(155px, 1fr)); gap: 14px; margin-bottom: 24px; }
.stat-card {
  background: var(--surface); border: 1.5px solid var(--border);
  border-radius: var(--radius-lg); padding: 20px 22px;
  box-shadow: 0 1px 5px rgba(0,0,0,.04);
  animation: fadeInUp .4s ease-out both;
}
.stat-card:nth-child(1){animation-delay:.05s}.stat-card:nth-child(2){animation-delay:.1s}
.stat-card:nth-child(3){animation-delay:.15s}.stat-card:nth-child(4){animation-delay:.2s}
.stat-icon { width: 34px; height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 17px; margin-bottom: 10px; }
.stat-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; font-weight: 600; }
.stat-value { font-size: 32px; font-weight: 700; font-family: 'JetBrains Mono', monospace; color: var(--ink); line-height: 1; }

/* CHART */
#dept-chart {
  background: var(--surface); border: 1.5px solid var(--border);
  border-radius: var(--radius-lg); padding: 20px 24px; margin-bottom: 24px;
  display: none; box-shadow: 0 1px 5px rgba(0,0,0,.04);
}
#dept-chart.visible { display: block; }
.chart-title { font-size: 12px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 16px; }
.bar-row { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.bar-label { width: 120px; font-size: 12px; color: var(--ink-2); text-align: right; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bar-track { flex: 1; background: var(--bg); border-radius: 5px; height: 20px; overflow: hidden; border: 1px solid var(--border); }
.bar-fill { height: 100%; background: linear-gradient(90deg, var(--brand-primary), var(--brand-secondary)); border-radius: 5px; display: flex; align-items: center; justify-content: flex-end; padding-left: 8px; transition: width .7s cubic-bezier(.25,.46,.45,.94); }
.bar-count { font-size: 11px; font-weight: 700; color: #fff; }

/* CONTROLS */
.controls-row { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
.search-wrap { position: relative; flex: 1; min-width: 200px; }
.search-wrap svg { position: absolute; right: 11px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
#search-input { padding-right: 36px; }
.view-toggle { display: flex; gap: 3px; background: var(--bg-2); border-radius: var(--radius); padding: 3px; border: 1px solid var(--border); }
.view-btn { background: transparent; border: none; padding: 5px 10px; border-radius: 5px; color: var(--muted); font-size: 14px; }
.view-btn.active { background: var(--surface); color: var(--ink); box-shadow: 0 1px 4px rgba(0,0,0,.1); }

/* FORM PANEL */
#form-panel {
  background: var(--surface); border: 2px solid var(--brand-secondary);
  border-radius: var(--radius-lg); padding: 26px; margin-bottom: 20px;
  display: none; box-shadow: 0 6px 24px rgba(139,0,0,.12);
}
#form-panel.open { display: block; animation: slideDown .22s ease; }
@keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }

.form-title { font-size: 15px; font-weight: 700; color: var(--ink); margin-bottom: 20px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.id-badge { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--brand-secondary); background: rgba(139,0,0,.08); padding: 2px 10px; border-radius: 5px; border: 1px solid rgba(139,0,0,.18); }
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 15px; }
.field label { display: block; font-size: 11px; color: var(--muted); margin-bottom: 5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
.field label .req { color: var(--red); }
.field input.error, .field select.error { border-color: var(--red) !important; box-shadow: 0 0 0 3px rgba(220,38,38,.1) !important; }
.form-actions { display: flex; gap: 10px; margin-top: 22px; justify-content: flex-end; }

/* RECORD COUNT */
.record-count { font-size: 12px; color: var(--muted); margin-bottom: 10px; }
.record-count strong { color: var(--ink); }

/* TABLE */
.table-wrap { background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; box-shadow: 0 1px 6px rgba(0,0,0,.05); }
.table-scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
thead tr { background: var(--surface-3); border-bottom: 2px solid var(--border-2); }
th { padding: 12px 14px; text-align: right; font-size: 11px; font-weight: 700; color: var(--ink-3); text-transform: uppercase; letter-spacing: .05em; white-space: nowrap; }
td { padding: 12px 14px; border-bottom: 1px solid var(--border); vertical-align: middle; color: var(--ink-2); }
tr:last-child td { border-bottom: none; }
tr:hover td { background: var(--surface-2); }
.asset-id { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--brand-secondary); font-weight: 700; }
.asset-name { font-weight: 600; color: var(--ink); }
.asset-type { font-size: 11px; color: var(--muted); margin-top: 1px; }
.mono { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--muted); }

/* BADGE */
.badge { display: inline-block; padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; white-space: nowrap; border: 1px solid; }
.badge-excellent { background: #dcfce7; color: #15803d; border-color: #86efac; }
.badge-good      { background: #dbeafe; color: #1d4ed8; border-color: #93c5fd; }
.badge-medium    { background: #fef9c3; color: #a16207; border-color: #fde047; }
.badge-needs     { background: #ffedd5; color: #c2410c; border-color: #fdba74; }
.badge-broken    { background: #fee2e2; color: #b91c1c; border-color: #fca5a5; }

/* GRID */
#grid-view { display: none; grid-template-columns: repeat(auto-fill, minmax(265px, 1fr)); gap: 14px; }
#grid-view.active { display: grid; }
.asset-card {
  background: var(--surface); border: 1.5px solid var(--border);
  border-radius: var(--radius-lg); padding: 18px;
  transition: border-color .15s, transform .15s, box-shadow .15s;
  box-shadow: 0 1px 4px rgba(0,0,0,.04);
}
.asset-card:hover { border-color: var(--brand-secondary); transform: translateY(-2px); box-shadow: 0 8px 22px rgba(139,0,0,.1); }
.card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.card-name { font-weight: 700; font-size: 14px; color: var(--ink); }
.card-type { font-size: 11px; color: var(--muted); margin-top: 2px; }
.card-detail { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
.card-actions { display: flex; gap: 8px; margin-top: 14px; border-top: 1px solid var(--border); padding-top: 12px; }
.card-actions button { flex: 1; }

/* EMPTY STATE */
#empty-state { text-align: center; padding: 70px 20px; background: var(--surface); border: 2px dashed var(--border-2); border-radius: var(--radius-lg); display: none; }
#empty-state.visible { display: block; }
.empty-icon { font-size: 46px; margin-bottom: 14px; opacity: .35; }
.empty-title { font-size: 16px; font-weight: 700; color: var(--ink); margin-bottom: 6px; }
.empty-sub { font-size: 13px; color: var(--muted); }

/* MODAL */
.modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: none; align-items: center; justify-content: center; z-index: 200; }
.modal-bg.open { display: flex; }
.modal { background: var(--surface); border: 1.5px solid var(--border-2); border-radius: var(--radius-lg); padding: 28px; width: 400px; max-width: 92%; animation: fadeUp .2s ease; box-shadow: 0 24px 64px rgba(0,0,0,.18); }
@keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
.modal-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.modal-icon { width: 40px; height: 40px; border-radius: 10px; background: #fee2e2; display: flex; align-items: center; justify-content: center; font-size: 18px; }
.modal-title { font-size: 16px; font-weight: 700; color: var(--ink); }
.modal-body { font-size: 13px; color: var(--muted); margin-bottom: 22px; line-height: 1.8; }
.modal-body strong { color: var(--ink); }
.modal-actions { display: flex; gap: 10px; justify-content: flex-end; }

/* TOAST */
#toast { position: fixed; bottom: 26px; left: 50%; transform: translateX(-50%) translateY(16px); background: var(--surface); border: 1.5px solid var(--border-2); border-radius: var(--radius); padding: 12px 22px; font-size: 13px; font-weight: 500; z-index: 300; white-space: nowrap; opacity: 0; transition: all .25s; pointer-events: none; box-shadow: 0 10px 32px rgba(0,0,0,.13); color: var(--ink); }
#toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
#toast.t-success { border-color: #86efac; color: #15803d; background: #f0fdf4; }
#toast.t-error   { border-color: #fca5a5; color: #b91c1c; background: #fff5f5; }
#toast.t-warn    { border-color: #fde047; color: #a16207; background: #fefce8; }

/* ===== PRINT ===== */
@media print {
  @page { size: A4 landscape; margin: 8mm 10mm; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

  body > * { display: none !important; }
  #print-section { display: block !important; }

  #print-section {
    font-family: 'IBM Plex Sans Arabic', Arial, sans-serif;
    direction: rtl; color: #111; background: #fff;
    font-size: 10px; line-height: 1.5;
  }
  #ph { display: flex !important; align-items: center; justify-content: space-between; border-bottom: 2.5px solid #1a1f36; padding-bottom: 10px; margin-bottom: 12px; }
  .ph-brand { display: flex; align-items: center; gap: 10px; }
  .ph-logo { width: 40px; height: 40px; background: linear-gradient(135deg, #8B0000, #c41e3a) !important; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #fff !important; font-weight: 800; font-size: 13px; letter-spacing: -1px; }
  .ph-title { font-size: 16px; font-weight: 700; color: #1a1f36; }
  .ph-sub   { font-size: 10px; color: #666; }
  .ph-meta  { text-align: left; font-size: 10px; color: #555; line-height: 2; }
  #ps { display: grid !important; grid-template-columns: repeat(4,1fr); gap: 8px; margin-bottom: 12px; }
  .ps-c { border: 1.5px solid #ddd; border-radius: 7px; padding: 9px 12px; text-align: center; }
  .ps-l { font-size: 9px; color: #777; text-transform: uppercase; letter-spacing: .04em; }
  .ps-v { font-size: 22px; font-weight: 700; color: #1a1f36; margin-top: 2px; }
  #pt { width: 100%; border-collapse: collapse; font-size: 9.5px; }
  #pt thead tr { background: #1a1f36 !important; }
  #pt th { padding: 7px 8px; text-align: right; font-weight: 700; font-size: 9px; text-transform: uppercase; border: 1px solid #1a1f36; color: #fff !important; }
  #pt td { padding: 5px 7px; border: 1px solid #e0e0e0; vertical-align: middle; }
  #pt tr:nth-child(even) td { background: #f6f8fb !important; }
  .pid { font-family: monospace; font-size: 9px; color: #8B0000; font-weight: 700; }
  .badge { font-size: 8px; padding: 1px 5px; }
  .badge-excellent{background:#dcfce7!important;color:#15803d!important;border-color:#86efac!important}
  .badge-good{background:#dbeafe!important;color:#1d4ed8!important;border-color:#93c5fd!important}
  .badge-medium{background:#fef9c3!important;color:#a16207!important;border-color:#fde047!important}
  .badge-needs{background:#ffedd5!important;color:#c2410c!important;border-color:#fdba74!important}
  .badge-broken{background:#fee2e2!important;color:#b91c1c!important;border-color:#fca5a5!important}
  #pf { display: flex !important; justify-content: space-between; margin-top: 10px; padding-top: 7px; border-top: 1px solid #ccc; font-size: 9px; color: #888; }
}
#print-section { display: none; }
</style>
</head>
<body>

<!-- HEADER -->
<header id="app-header">
  <div class="hdr-deco">
    <span class="bar bar-t"></span><span class="bar bar-t"></span>
    <span class="bar bar-t"></span><span class="bar bar-k"></span>
  </div>
  <div class="brand">
    <div class="brand-logo">BFP</div>
    <div>
      <div class="brand-name">Brandzo</div>
      <div class="brand-sub">Franchise Partners</div>
    </div>
  </div>
  <div class="header-actions">
    <label class="btn btn-ghost" style="cursor:pointer" title="استيراد ملف Excel">
      ↑ استيراد Excel
      <input type="file" id="import-file" accept=".xlsx,.xls" style="display:none" />
    </label>
    <button class="btn btn-success" id="export-btn" disabled onclick="exportExcel()">↓ تصدير Excel</button>
    <button class="btn btn-ghost" id="print-btn" disabled onclick="printPDF()">⎙ طباعة PDF</button>
  </div>
  <div class="hdr-deco">
    <span class="bar bar-k"></span><span class="bar bar-t"></span>
    <span class="bar bar-t"></span><span class="bar bar-t"></span>
  </div>
</header>

<!-- MAIN -->
<main id="main">
  <!-- STATS -->
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-icon" style="background:rgba(31,111,235,.1)">📦</div>
      <div class="stat-label">إجمالي الأصول</div>
      <div class="stat-value" id="s-total">0</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:rgba(139,0,0,.09)">🔢</div>
      <div class="stat-label">إجمالي الكميات</div>
      <div class="stat-value" id="s-qty">0</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:rgba(22,163,74,.1)">✅</div>
      <div class="stat-label">ممتاز / جيد</div>
      <div class="stat-value" id="s-good">0</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:rgba(234,88,12,.1)">🔧</div>
      <div class="stat-label">يحتاج صيانة / معطل</div>
      <div class="stat-value" id="s-bad">0</div>
    </div>
  </div>

  <!-- CHART -->
  <div id="dept-chart">
    <div class="chart-title">توزيع الأصول حسب الإدارة</div>
    <div id="chart-bars"></div>
  </div>

  <!-- CONTROLS -->
  <div class="controls-row">
    <div class="search-wrap">
      <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input type="text" id="search-input" placeholder="بحث: الاسم، الماركة، السيريال، رقم الأصل..." oninput="renderTable()" />
    </div>
    <select id="filter-dept" onchange="renderTable()" style="min-width:145px">
      <option value="">كل الإدارات</option>
      <option>تقنية</option><option>مالية</option><option>موارد بشرية</option>
      <option>إدارة</option><option>مبيعات</option><option>تسويق</option>
      <option>مخازن</option><option>أمن</option>
      <option>شركة ركن المال</option><option>شركة انجاز المشرق</option>
      <option>شركة ايديل فرع بنغازي</option><option>شركة ايديل فرع طرابلس</option>
    </select>
    <select id="filter-cond" onchange="renderTable()" style="min-width:140px">
      <option value="">كل الحالات</option>
      <option>ممتاز</option><option>جيد</option><option>متوسط</option>
      <option>يحتاج صيانة</option><option>معطل</option>
    </select>
    <div class="view-toggle">
      <button class="view-btn active" id="vt-list" onclick="switchView('list')" title="قائمة">☰</button>
      <button class="view-btn" id="vt-grid" onclick="switchView('grid')" title="شبكة">⊞</button>
    </div>
    <button class="btn btn-primary" id="toggle-form-btn" onclick="toggleForm()">+ إضافة أصل</button>
  </div>

  <!-- FORM PANEL -->
  <div id="form-panel">
    <div class="form-title">
      <span id="form-title-text">إضافة أصل جديد</span>
      <span class="id-badge" id="form-id-badge"></span>
    </div>
    <div class="form-grid">
      <div class="field">
        <label>نوع الأصل <span class="req">*</span></label>
        <select id="f-type">
          <option value="">— اختر —</option>
          <option>جهاز حاسوب</option><option>لابتوب</option><option>طابعة</option>
          <option>شاشة</option><option>هاتف</option><option>راوتر</option>
          <option>سيرفر</option><option>ماسح ضوئي</option><option>UPS</option>
          <option>كاميرا مراقبة</option><option>أخرى</option>
        </select>
      </div>
      <div class="field">
        <label>اسم الأصل <span class="req">*</span></label>
        <input type="text" id="f-name" placeholder="مثال: حاسوب مكتبي" />
      </div>
      <div class="field">
        <label>الماركة</label>
        <input type="text" id="f-brand" placeholder="Dell, HP, Lenovo..." />
      </div>
      <div class="field">
        <label>الموديل / السيريال</label>
        <input type="text" id="f-serial" placeholder="رقم المسلسل أو الموديل" />
      </div>
      <div class="field">
        <label>الكمية</label>
        <input type="number" id="f-qty" value="1" min="1" max="9999" />
      </div>
      <div class="field">
        <label>الحالة</label>
        <select id="f-cond">
          <option>ممتاز</option><option selected>جيد</option><option>متوسط</option>
          <option>يحتاج صيانة</option><option>معطل</option>
        </select>
      </div>
      <div class="field">
        <label>المسؤول / المستلم</label>
        <input type="text" id="f-responsible" placeholder="اسم الموظف" />
      </div>
      <div class="field">
        <label>الإدارة <span class="req">*</span></label>
        <select id="f-dept">
          <option value="">— اختر —</option>
          <option>تقنية</option><option>مالية</option><option>موارد بشرية</option>
          <option>إدارة</option><option>مبيعات</option><option>تسويق</option>
          <option>مخازن</option><option>أمن</option>
          <option>شركة ركن المال</option><option>شركة انجاز المشرق</option>
          <option>شركة ايديل فرع بنغازي</option><option>شركة ايديل فرع طرابلس</option>
        </select>
      </div>
      <div class="field">
        <label>القسم</label>
        <input type="text" id="f-section" placeholder="القسم الفرعي" />
      </div>
      <div class="field">
        <label>الموقع</label>
        <select id="f-location">
          <option value="">— اختر —</option>
          <option>المقر الرئيسي</option><option>الفرع الأول</option>
          <option>الفرع الثاني</option><option>المستودع</option><option>خارج المبنى</option>
        </select>
      </div>
      <div class="field">
        <label>تاريخ الاستلام</label>
        <input type="date" id="f-date" />
      </div>
      <div class="field">
        <label>ملاحظات</label>
        <input type="text" id="f-notes" placeholder="أي ملاحظات إضافية" />
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost" onclick="cancelForm()">✕ إلغاء</button>
      <button class="btn btn-primary" onclick="submitForm()" id="submit-btn">إضافة الأصل</button>
    </div>
  </div>

  <!-- RECORD COUNT -->
  <div class="record-count" id="record-count" style="display:none"></div>

  <!-- EMPTY STATE -->
  <div id="empty-state">
    <div class="empty-icon">📭</div>
    <div class="empty-title">لا توجد أصول مسجلة</div>
    <div class="empty-sub">أضف أصلاً جديداً أو استورد ملف Excel للبدء</div>
  </div>

  <!-- TABLE -->
  <div id="table-view" class="table-wrap" style="display:none">
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>رقم الأصل</th><th>النوع / الاسم</th><th>الماركة / السيريال</th>
            <th>الكمية</th><th>الحالة</th><th>المسؤول</th>
            <th>الإدارة</th><th>الموقع</th><th>تاريخ الاستلام</th><th>إجراءات</th>
          </tr>
        </thead>
        <tbody id="table-body"></tbody>
      </table>
    </div>
  </div>

  <!-- GRID -->
  <div id="grid-view"></div>
</main>

<!-- PRINT SECTION -->
<div id="print-section">
  <div id="ph">
    <div class="ph-brand">
      <div class="ph-logo">BFP</div>
      <div>
        <div class="ph-title">Brandzo — كشف جرد الأصول</div>
        <div class="ph-sub">Brandzo Franchise Partners — نظام إدارة الأصول</div>
      </div>
    </div>
    <div class="ph-meta">
      <div>تاريخ الطباعة: <strong id="p-date"></strong></div>
      <div>إجمالي السجلات: <strong id="p-total"></strong></div>
      <div>إجمالي الكميات: <strong id="p-qty"></strong></div>
    </div>
  </div>
  <div id="ps">
    <div class="ps-c"><div class="ps-l">إجمالي الأصول</div><div class="ps-v" id="ps-total">0</div></div>
    <div class="ps-c"><div class="ps-l">ممتاز</div><div class="ps-v" id="ps-excellent">0</div></div>
    <div class="ps-c"><div class="ps-l">جيد</div><div class="ps-v" id="ps-good2">0</div></div>
    <div class="ps-c"><div class="ps-l">يحتاج صيانة / معطل</div><div class="ps-v" id="ps-bad">0</div></div>
  </div>
  <table id="pt">
    <thead>
      <tr>
        <th>رقم الأصل</th><th>نوع الأصل</th><th>اسم الأصل</th>
        <th>الماركة</th><th>السيريال/الموديل</th><th>الكمية</th>
        <th>الحالة</th><th>المسؤول</th><th>الإدارة</th>
        <th>القسم</th><th>الموقع</th><th>تاريخ الاستلام</th><th>ملاحظات</th>
      </tr>
    </thead>
    <tbody id="print-body"></tbody>
  </table>
  <div id="pf">
    <span>Brandzo Asset Management System</span>
    <span id="p-footer-date"></span>
  </div>
</div>

<!-- DELETE MODAL -->
<div class="modal-bg" id="del-modal">
  <div class="modal">
    <div class="modal-header">
      <div class="modal-icon">⚠️</div>
      <div class="modal-title">تأكيد الحذف</div>
    </div>
    <div class="modal-body">
      هل أنت متأكد من حذف الأصل <strong id="del-asset-id"></strong>؟<br/>
      لا يمكن التراجع عن هذا الإجراء.
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeDelModal()">إلغاء</button>
      <button class="btn btn-danger" style="background:#b91c1c;color:#fff;border-color:#b91c1c" onclick="confirmDelete()">حذف</button>
    </div>
  </div>
</div>

<div id="toast"></div>

<script>
// ============ STATE ============
let assets = [];
let editId = null;
let deleteId = null;
let currentView = 'list';
let nextIdNum = 1;

// ============ HELPERS ============
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const BADGE = {
  'ممتاز':'badge-excellent','جيد':'badge-good','متوسط':'badge-medium',
  'يحتاج صيانة':'badge-needs','معطل':'badge-broken'
};
function badge(c) { return `<span class="badge ${BADGE[c]||'badge-good'}">${escHtml(c||'—')}</span>`; }

function generateId() {
  const nums = assets.map(a => { const m=(a.id||'').match(/BRZ-(\d+)/); return m?parseInt(m[1]):0; });
  const max = nums.length ? Math.max(...nums) : 0;
  if (nextIdNum <= max) nextIdNum = max + 1;
  return 'BRZ-' + String(nextIdNum++).padStart(4,'0');
}

// ============ TOAST ============
let _tt;
function showToast(msg, type='success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show t-' + type;
  clearTimeout(_tt);
  _tt = setTimeout(() => el.className = '', 3500);
}

// ============ STATS ============
function updateStats() {
  const total = assets.length;
  const qty   = assets.reduce((s,a) => s + (parseInt(a.qty)||1), 0);
  const good  = assets.filter(a => a.condition==='ممتاز'||a.condition==='جيد').length;
  const bad   = assets.filter(a => a.condition==='يحتاج صيانة'||a.condition==='معطل').length;
  document.getElementById('s-total').textContent = total;
  document.getElementById('s-qty').textContent   = qty;
  document.getElementById('s-good').textContent  = good;
  document.getElementById('s-bad').textContent   = bad;

  const dMap = {};
  assets.forEach(a => { if(a.department) dMap[a.department] = (dMap[a.department]||0)+1; });
  const chart = document.getElementById('dept-chart');
  const bars  = document.getElementById('chart-bars');
  const entries = Object.entries(dMap).sort((a,b)=>b[1]-a[1]);
  if (entries.length) {
    chart.classList.add('visible');
    const mx = Math.max(...entries.map(e=>e[1]),1);
    bars.innerHTML = entries.map(([d,c])=>`
      <div class="bar-row">
        <div class="bar-label">${escHtml(d)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(c/mx)*100}%"><span class="bar-count">${c}</span></div></div>
      </div>`).join('');
  } else {
    chart.classList.remove('visible');
  }
  const has = total > 0;
  document.getElementById('export-btn').disabled = !has;
  document.getElementById('print-btn').disabled  = !has;
}

// ============ FILTER ============
function getFiltered() {
  const q    = (document.getElementById('search-input').value||'').toLowerCase();
  const dept = document.getElementById('filter-dept').value;
  const cond = document.getElementById('filter-cond').value;
  return assets.filter(a => {
    const mq = !q || [a.assetName,a.brand,a.serial,a.responsible,a.id,a.assetType,a.department,a.section,a.location,a.notes]
      .some(v => (v||'').toLowerCase().includes(q));
    return mq && (!dept||a.department===dept) && (!cond||a.condition===cond);
  });
}

// ============ RENDER ============
function renderTable() {
  const filtered = getFiltered();
  const count  = document.getElementById('record-count');
  const empty  = document.getElementById('empty-state');
  const tableV = document.getElementById('table-view');
  const gridV  = document.getElementById('grid-view');

  if (assets.length === 0) {
    empty.classList.add('visible');
    tableV.style.display = 'none';
    gridV.style.display  = 'none';
    count.style.display  = 'none';
    return;
  }
  empty.classList.remove('visible');
  count.style.display = 'block';
  count.innerHTML = `عرض <strong>${filtered.length}</strong> من <strong>${assets.length}</strong> أصل`;

  document.getElementById('table-body').innerHTML = filtered.map((a,i) => `
    <tr style="animation:fadeInUp .3s ease-out ${i*.03}s both">
      <td class="asset-id">${escHtml(a.id)}</td>
      <td>
        <div class="asset-name">${escHtml(a.assetName)}</div>
        <div class="asset-type">${escHtml(a.assetType)}</div>
      </td>
      <td>
        <div>${escHtml(a.brand||'—')}</div>
        <div class="mono">${escHtml(a.serial||'—')}</div>
      </td>
      <td style="text-align:center;font-weight:700">${a.qty||1}</td>
      <td>${badge(a.condition)}</td>
      <td>${escHtml(a.responsible||'—')}</td>
      <td style="color:var(--muted)">${escHtml(a.department||'—')}</td>
      <td style="color:var(--muted)">${escHtml(a.location||'—')}</td>
      <td class="mono">${escHtml(a.receivedDate||'—')}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="startEdit('${escHtml(a.id)}')">✎</button>
          <button class="btn btn-danger btn-sm" onclick="openDelModal('${escHtml(a.id)}')">✕</button>
        </div>
      </td>
    </tr>`).join('');

  gridV.innerHTML = filtered.map(a => `
    <div class="asset-card">
      <div class="card-header">
        <div>
          <div class="card-name">${escHtml(a.assetName)}</div>
          <div class="card-type">${escHtml(a.assetType)}</div>
        </div>
        ${badge(a.condition)}
      </div>
      <div class="card-detail">🔑 <span class="mono" style="color:var(--brand-secondary)">${escHtml(a.id)}</span></div>
      <div class="card-detail">🏷 ${escHtml(a.brand||'—')} · <span class="mono">${escHtml(a.serial||'—')}</span></div>
      <div class="card-detail">👤 ${escHtml(a.responsible||'—')}</div>
      <div class="card-detail">🏢 ${escHtml(a.department||'—')}${a.location?' · '+escHtml(a.location):''}</div>
      <div class="card-actions">
        <button class="btn btn-ghost btn-sm" onclick="startEdit('${escHtml(a.id)}')">✎ تعديل</button>
        <button class="btn btn-danger btn-sm" onclick="openDelModal('${escHtml(a.id)}')">✕ حذف</button>
      </div>
    </div>`).join('');

  if (currentView === 'list') {
    tableV.style.display = 'block'; gridV.style.display = 'none';
  } else {
    tableV.style.display = 'none'; gridV.style.display = 'grid';
  }
}

function switchView(v) {
  currentView = v;
  document.getElementById('vt-list').classList.toggle('active', v==='list');
  document.getElementById('vt-grid').classList.toggle('active', v==='grid');
  renderTable();
}

// ============ FORM — FIX #1: clear & populate correctly ============
function clearForm() {
  // Reset all selects to first option (empty / placeholder)
  ['f-type','f-dept','f-location'].forEach(id => {
    const el = document.getElementById(id);
    if(el){ el.selectedIndex = 0; el.classList.remove('error'); }
  });
  document.getElementById('f-cond').value = 'جيد';
  document.getElementById('f-cond').classList.remove('error');
  ['f-name','f-brand','f-serial','f-responsible','f-section','f-notes'].forEach(id => {
    const el = document.getElementById(id);
    if(el){ el.value = ''; el.classList.remove('error'); }
  });
  document.getElementById('f-qty').value = 1;
  document.getElementById('f-qty').classList.remove('error');
  document.getElementById('f-date').value = new Date().toISOString().split('T')[0];
}

// Populate form fields from an asset object (used in edit)
function populateForm(a) {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if(!el) return;
    el.value = (val == null) ? '' : String(val);
  };
  setVal('f-type',        a.assetType    || '');
  setVal('f-name',        a.assetName    || '');
  setVal('f-brand',       a.brand        || '');
  setVal('f-serial',      a.serial       || '');
  setVal('f-qty',         a.qty          || 1);
  setVal('f-cond',        a.condition    || 'جيد');
  setVal('f-responsible', a.responsible  || '');
  setVal('f-dept',        a.department   || '');
  setVal('f-section',     a.section      || '');
  setVal('f-location',    a.location     || '');
  setVal('f-date',        a.receivedDate || '');
  setVal('f-notes',       a.notes        || '');
}

function toggleForm() {
  editId = null;
  const panel = document.getElementById('form-panel');
  if (panel.classList.contains('open')) { cancelForm(); return; }
  clearForm();
  const newId = generateId();
  // Temporarily reserve this id
  document.getElementById('form-id-badge').textContent = newId;
  document.getElementById('form-id-badge').dataset.pendingId = newId;
  document.getElementById('form-title-text').textContent = 'إضافة أصل جديد';
  document.getElementById('submit-btn').textContent = 'إضافة الأصل';
  document.getElementById('toggle-form-btn').textContent = '✕ إلغاء';
  panel.classList.add('open');
  panel.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function cancelForm() {
  editId = null;
  document.getElementById('form-panel').classList.remove('open');
  document.getElementById('toggle-form-btn').textContent = '+ إضافة أصل';
  clearForm();
}

// ============ SUBMIT — FIX #4: safe, validated ============
function submitForm() {
  document.querySelectorAll('#form-panel .error').forEach(el => el.classList.remove('error'));

  const typeEl  = document.getElementById('f-type');
  const nameEl  = document.getElementById('f-name');
  const deptEl  = document.getElementById('f-dept');
  const qtyEl   = document.getElementById('f-qty');

  const assetType  = (typeEl.value||'').trim();
  const assetName  = (nameEl.value||'').trim();
  const department = (deptEl.value||'').trim();
  const qtyVal     = parseInt(qtyEl.value);

  let err = false;
  if (!assetType)              { typeEl.classList.add('error'); err = true; }
  if (!assetName)              { nameEl.classList.add('error'); err = true; }
  if (!department)             { deptEl.classList.add('error'); err = true; }
  if (isNaN(qtyVal)||qtyVal<1){ qtyEl.classList.add('error'); err = true; }
  if (err) { showToast('يرجى تعبئة الحقول الإلزامية ✱', 'error'); return; }

  const record = {
    id:           editId || document.getElementById('form-id-badge').dataset.pendingId || generateId(),
    assetType,
    assetName,
    brand:        (document.getElementById('f-brand').value||'').trim(),
    serial:       (document.getElementById('f-serial').value||'').trim(),
    qty:          qtyVal,
    condition:    document.getElementById('f-cond').value || 'جيد',
    responsible:  (document.getElementById('f-responsible').value||'').trim(),
    department,
    section:      (document.getElementById('f-section').value||'').trim(),
    location:     document.getElementById('f-location').value || '',
    receivedDate: document.getElementById('f-date').value || '',
    notes:        (document.getElementById('f-notes').value||'').trim(),
  };

  if (editId) {
    const idx = assets.findIndex(a => a.id === editId);
    if (idx < 0) { showToast('خطأ: الأصل غير موجود', 'error'); return; }
    assets[idx] = record;
    showToast('تم تعديل الأصل بنجاح ✓');
  } else {
    assets.push(record);
    showToast('تم إضافة الأصل بنجاح ✓');
  }

  cancelForm();
  updateStats();
  renderTable();
}

// ============ EDIT — FIX #1: correct field population ============
function startEdit(id) {
  const a = assets.find(x => x.id === id);
  if (!a) { showToast('الأصل غير موجود', 'error'); return; }
  editId = id;
  clearForm();
  populateForm(a);  // populate immediately after clear

  document.getElementById('form-id-badge').textContent = id;
  document.getElementById('form-id-badge').dataset.pendingId = id;
  document.getElementById('form-title-text').textContent = 'تعديل الأصل';
  document.getElementById('submit-btn').textContent = 'حفظ التعديلات';
  document.getElementById('toggle-form-btn').textContent = '✕ إلغاء';

  const panel = document.getElementById('form-panel');
  panel.classList.add('open');
  panel.scrollIntoView({ behavior:'smooth', block:'start' });
}

// ============ DELETE — FIX #4: safe ============
function openDelModal(id) {
  const a = assets.find(x => x.id === id);
  if (!a) { showToast('الأصل غير موجود', 'error'); return; }
  deleteId = id;
  document.getElementById('del-asset-id').textContent = id + (a.assetName ? ' — ' + a.assetName : '');
  document.getElementById('del-modal').classList.add('open');
}
function closeDelModal() {
  deleteId = null;
  document.getElementById('del-modal').classList.remove('open');
}
function confirmDelete() {
  if (!deleteId) { closeDelModal(); return; }
  const before = assets.length;
  assets = assets.filter(a => a.id !== deleteId);
  closeDelModal();
  if (assets.length < before) showToast('تم حذف الأصل بنجاح', 'warn');
  else showToast('لم يتم العثور على الأصل', 'error');
  updateStats();
  renderTable();
}

// ============ IMPORT — FIX #5: complete multi-sheet import ============
document.getElementById('import-file').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx','xls'].includes(ext)) {
    showToast('الملف غير صالح، يجب أن يكون xlsx أو xls', 'error');
    e.target.value = ''; return;
  }

  const reader = new FileReader();
  reader.onerror = () => showToast('فشل في قراءة الملف', 'error');
  reader.onload = ev => {
    try {
      const wb = XLSX.read(ev.target.result, { type:'binary', cellDates:true, raw:false });

      // ---- Helper to parse a data sheet ----
      // mainSheet=true: columns include "الإدارة" at index 8
      // mainSheet=false: dept sheets — "الإدارة" NOT present, inject from sheetName
      function parseSheet(ws, deptOverride) {
        const raw = XLSX.utils.sheet_to_json(ws, { header:1, defval:'', raw:false });
        if (raw.length < 2) return [];
        const header = raw[0].map(h => String(h||'').trim());
        const isMain = header.includes('الإدارة');

        // Build column index map
        const COL = {};
        const HDR = {
          'رقم الأصل':0,'نوع الأصل':1,'اسم الأصل':2,'الماركة':3,
          'الموديل/السيريال':4,'السيريال':4,'الموديل':4,
          'الكمية':5,'الحالة':6,'المسؤول':7,'الإدارة':8,
          'القسم':9,'الموقع':10,'تاريخ الاستلام':11,'ملاحظات':12
        };
        header.forEach((h,i) => { if(HDR.hasOwnProperty(h)) COL[HDR[h]] = i; });

        // For dept sheets (no الإدارة column), shift columns 9..12 down by 1
        // because col8 (الإدارة) is missing: القسم=8, الموقع=9, التاريخ=10, ملاحظات=11
        const DEPT_HDR = {
          'رقم الأصل':0,'نوع الأصل':1,'اسم الأصل':2,'الماركة':3,
          'السيريال':4,'الموديل':4,
          'الكمية':5,'الحالة':6,'المسؤول':7,
          'القسم':8,'الموقع':9,'تاريخ الاستلام':10,'ملاحظات':11
        };
        if (!isMain) {
          header.forEach((h,i) => { if(DEPT_HDR.hasOwnProperty(h)) COL[DEPT_HDR[h]] = i; });
        }

        const gc = (row, idx) => {
          if (COL[idx] !== undefined) return row[COL[idx]];
          return row[idx];
        };
        const safe   = v => (v == null) ? '' : String(v).trim();
        const safeN  = (v,d=1) => { const n=parseInt(v); return (!isNaN(n)&&n>0)?n:d; };
        const validC = ['ممتاز','جيد','متوسط','يحتاج صيانة','معطل'];

        const records = [];
        const dataRows = raw.slice(1).filter(r => r.some(c => c!==''&&c!==null&&c!==undefined));
        dataRows.forEach(r => {
          const name = safe(gc(r,2));
          if (!name) return;

          let rawDate = safe(gc(r,11));
          const dv = gc(r,11);
          if (dv instanceof Date) rawDate = dv.toISOString().split('T')[0];
          else if (rawDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
            try { const d=new Date(rawDate); if(!isNaN(d.getTime())) rawDate=d.toISOString().split('T')[0]; } catch(e){}
          }

          const rawCond = safe(gc(r,6));
          const dept = deptOverride || safe(gc(r,8));

          // Determine section: main sheet=col9, dept sheet=col8
          let section;
          if (isMain) section = safe(gc(r,9));
          else section = safe(gc(r,8));

          // Determine location: main sheet=col10, dept sheet=col9
          let location;
          if (isMain) location = safe(gc(r,10));
          else location = safe(gc(r,9));

          // Determine notes: main=col12, dept=col11
          let notes;
          if (isMain) notes = safe(gc(r,12));
          else notes = safe(gc(r,11));

          records.push({
            id:          safe(gc(r,0)) || '',
            assetType:   safe(gc(r,1)),
            assetName:   name,
            brand:       safe(gc(r,3)),
            serial:      safe(gc(r,4)),
            qty:         safeN(gc(r,5)),
            condition:   validC.includes(rawCond) ? rawCond : 'جيد',
            responsible: safe(gc(r,7)),
            department:  dept,
            section,
            location,
            receivedDate: rawDate,
            notes,
          });
        });
        return records;
      }

      // ---- Decide which sheets to read ----
      // Strategy: if "جرد الأصول" exists, use it as master (13 cols).
      // Then also parse dept sheets to fill in any missing rows.
      // Use a composite key (dept + assetName + brand + serial) to deduplicate.

      let allRecords = [];
      const SKIP_SHEETS = ['ملخص إحصائي'];

      if (wb.Sheets['جرد الأصول']) {
        // Main sheet has all 13 columns — use it as primary source
        const recs = parseSheet(wb.Sheets['جرد الأصول'], null);
        allRecords.push(...recs);
      } else {
        // No main sheet — parse every dept sheet, inject dept name
        wb.SheetNames.filter(s => !SKIP_SHEETS.includes(s)).forEach(sn => {
          const recs = parseSheet(wb.Sheets[sn], sn);
          allRecords.push(...recs);
        });
      }

      if (allRecords.length === 0) {
        showToast('الملف لا يحتوي على بيانات قابلة للاستيراد', 'error');
        e.target.value = ''; return;
      }

      // Assign IDs and deduplicate by id
      const existingIds = new Set(assets.map(a => a.id));
      let imported=0, updated=0, skipped=0;
      const seenIds = new Set(); // within this import batch

      allRecords.forEach(rec => {
        const name = rec.assetName;
        if (!name) { skipped++; return; }

        if (rec.id && existingIds.has(rec.id) && !seenIds.has(rec.id)) {
          // Update existing
          const idx = assets.findIndex(a => a.id === rec.id);
          if (idx >= 0) { assets[idx] = rec; updated++; seenIds.add(rec.id); }
          else { rec.id = generateId(); assets.push(rec); imported++; }
        } else if (rec.id && !existingIds.has(rec.id) && !seenIds.has(rec.id)) {
          seenIds.add(rec.id);
          existingIds.add(rec.id);
          assets.push(rec);
          imported++;
        } else if (!rec.id) {
          rec.id = generateId();
          existingIds.add(rec.id);
          assets.push(rec);
          imported++;
        } else {
          // duplicate id in same import — skip silently
          skipped++;
        }
      });

      // Recalculate nextIdNum
      const nums = assets.map(a=>{const m=(a.id||'').match(/BRZ-(\d+)/);return m?parseInt(m[1]):0;});
      nextIdNum = (nums.length ? Math.max(...nums) : 0) + 1;

      let msg = `✅ استيراد ناجح: ${imported} سجل جديد`;
      if (updated>0) msg += `، ${updated} محدَّث`;
      if (skipped>0) msg += `، ${skipped} مُهمَل`;
      showToast(msg);
      updateStats();
      renderTable();
    } catch(err) {
      console.error(err);
      showToast('خطأ في معالجة الملف: ' + (err.message||'تحقق من صحة الملف'), 'error');
    }
    e.target.value = '';
  };
  reader.readAsBinaryString(file);
});

// ============ EXPORT ============
function exportExcel() {
  if (!assets.length) return;
  const wb = XLSX.utils.book_new();

  // Summary
  const byC = {'ممتاز':0,'جيد':0,'متوسط':0,'يحتاج صيانة':0,'معطل':0};
  const byD = {};
  assets.forEach(a => {
    if(a.condition) byC[a.condition] = (byC[a.condition]||0)+1;
    if(a.department) byD[a.department] = (byD[a.department]||0)+1;
  });
  const sum = [
    ['شركة Brandzo — ملخص جرد الأصول'],
    ['تاريخ التصدير:', new Date().toLocaleDateString('ar-SA')],
    [],
    ['إجمالي الأصول', assets.length],
    ['إجمالي الكميات', assets.reduce((s,a)=>s+(parseInt(a.qty)||1),0)],
    [], ['الحالة','العدد'],
    ...Object.entries(byC).map(([c,n])=>[c,n]),
    [], ['الإدارة','العدد'],
    ...Object.entries(byD).map(([d,n])=>[d,n]),
  ];
  const wsSum = XLSX.utils.aoa_to_sheet(sum);
  wsSum['!cols'] = [{wch:30},{wch:16}];
  XLSX.utils.book_append_sheet(wb, wsSum, 'ملخص إحصائي');

  // Main sheet (13 cols)
  const H13 = ['رقم الأصل','نوع الأصل','اسم الأصل','الماركة','الموديل/السيريال','الكمية','الحالة','المسؤول','الإدارة','القسم','الموقع','تاريخ الاستلام','ملاحظات'];
  const rows = assets.map(a=>[a.id,a.assetType,a.assetName,a.brand,a.serial,a.qty,a.condition,a.responsible,a.department,a.section,a.location,a.receivedDate,a.notes]);
  const wsMain = XLSX.utils.aoa_to_sheet([H13,...rows]);
  wsMain['!cols'] = [14,16,22,16,22,8,14,20,16,16,18,16,24].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, wsMain, 'جرد الأصول');

  // Per-dept sheets (12 cols, no الإدارة col)
  const H12 = ['رقم الأصل','نوع الأصل','اسم الأصل','الماركة','السيريال','الكمية','الحالة','المسؤول','القسم','الموقع','تاريخ الاستلام','ملاحظات'];
  [...new Set(assets.map(a=>a.department).filter(Boolean))].forEach(dept => {
    const dRows = assets.filter(a=>a.department===dept)
      .map(a=>[a.id,a.assetType,a.assetName,a.brand,a.serial,a.qty,a.condition,a.responsible,a.section,a.location,a.receivedDate,a.notes]);
    const ws = XLSX.utils.aoa_to_sheet([H12,...dRows]);
    ws['!cols'] = H12.map(()=>({wch:18}));
    XLSX.utils.book_append_sheet(wb, ws, dept.slice(0,31));
  });

  XLSX.writeFile(wb, `Brandzo_Inventory_${new Date().toISOString().split('T')[0]}.xlsx`);
  showToast('تم تصدير ملف Excel بنجاح 📥');
}

// ============ PRINT — FIX #2: clean print section ============
function printPDF() {
  const filtered = getFiltered();
  if (!filtered.length) { showToast('لا توجد بيانات للطباعة', 'error'); return; }

  const dateStr = new Date().toLocaleDateString('ar-SA', {year:'numeric',month:'long',day:'numeric'});
  document.getElementById('p-date').textContent        = dateStr;
  document.getElementById('p-footer-date').textContent = dateStr;
  document.getElementById('p-total').textContent       = filtered.length;
  document.getElementById('p-qty').textContent         = filtered.reduce((s,a)=>s+(parseInt(a.qty)||1),0);

  const byC = {};
  filtered.forEach(a => byC[a.condition] = (byC[a.condition]||0)+1);
  document.getElementById('ps-total').textContent     = filtered.length;
  document.getElementById('ps-excellent').textContent = byC['ممتاز']||0;
  document.getElementById('ps-good2').textContent     = byC['جيد']||0;
  document.getElementById('ps-bad').textContent       = (byC['يحتاج صيانة']||0)+(byC['معطل']||0);

  document.getElementById('print-body').innerHTML = filtered.map(a => `
    <tr>
      <td class="pid">${escHtml(a.id)}</td>
      <td>${escHtml(a.assetType||'—')}</td>
      <td>${escHtml(a.assetName||'—')}</td>
      <td>${escHtml(a.brand||'—')}</td>
      <td>${escHtml(a.serial||'—')}</td>
      <td style="text-align:center;font-weight:700">${a.qty||1}</td>
      <td><span class="badge ${BADGE[a.condition]||'badge-good'}">${escHtml(a.condition||'—')}</span></td>
      <td>${escHtml(a.responsible||'—')}</td>
      <td>${escHtml(a.department||'—')}</td>
      <td>${escHtml(a.section||'—')}</td>
      <td>${escHtml(a.location||'—')}</td>
      <td>${escHtml(a.receivedDate||'—')}</td>
      <td>${escHtml(a.notes||'—')}</td>
    </tr>`).join('');

  setTimeout(() => window.print(), 150);
}

// INIT
updateStats();
renderTable();
</script>
</body>
</html>
