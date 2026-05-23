<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>مخطط مجمع التبريد – الرحبة | Cosmetics Cold Storage</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
    :root {
      --navy:#1a2b4c;--gold:#e8b830;--red:#c0392b;--blue:#2980b9;
      --green:#27ae60;--gray:#f4f6f9;--white:#fff;--border:#dde3ec;
      --text:#2c3e50;--muted:#7f8c9b;
    }
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Cairo',sans-serif;background:var(--gray);color:var(--text);padding:20px;font-size:14px;}
    .container{max-width:1500px;margin:auto;}
    .header{background:linear-gradient(135deg,var(--navy) 0%,#243b6e 100%);color:white;border-radius:14px;padding:24px 30px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;}
    .header h1{font-size:22px;font-weight:900;}
    .header p{font-size:13px;opacity:.75;margin-top:4px;}
    .badge{background:var(--gold);color:var(--navy);font-weight:700;padding:4px 14px;border-radius:20px;font-size:12px;}
    .card{background:white;border-radius:12px;padding:20px;box-shadow:0 2px 10px rgba(0,0,0,.07);margin-bottom:20px;}
    .card-title{font-size:15px;font-weight:700;color:var(--navy);margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid var(--gold);display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
    .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:20px;}
    .grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;}
    .grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;}
    .kpi{background:var(--navy);color:white;border-radius:10px;padding:16px;text-align:center;}
    .kpi .val{font-size:26px;font-weight:900;color:var(--gold);}
    .kpi .lbl{font-size:12px;opacity:.8;margin-top:4px;}
    .unit-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;}
    .unit-btn{padding:10px 6px;border:2px solid var(--border);border-radius:10px;text-align:center;cursor:pointer;background:white;transition:all .2s;font-family:'Cairo',sans-serif;font-size:12px;}
    .unit-btn:hover{border-color:var(--gold);}
    .unit-btn.active{background:var(--navy);color:white;border-color:var(--gold);}
    .unit-btn .u-id{font-weight:700;font-size:14px;}
    .unit-btn .u-st{font-size:10px;margin-top:2px;opacity:.75;}
    .unit-btn.active .u-st{opacity:1;}
    .st-empty{border-right:4px solid #bdc3c7;}
    .st-partial{border-right:4px solid var(--gold);}
    .st-full{border-right:4px solid var(--green);}
    .addr-table{width:100%;border-collapse:collapse;}
    .addr-table th{background:var(--navy);color:white;padding:8px 10px;text-align:right;font-size:12px;}
    .addr-table td{padding:8px 10px;border-bottom:1px solid var(--border);font-size:13px;}
    .addr-table tr:hover td{background:#f8f9fc;}
    .addr-code{font-family:monospace;background:var(--navy);color:var(--gold);padding:2px 8px;border-radius:4px;font-size:12px;letter-spacing:1px;}
    .addr-legend{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;}
    .legend-item{background:var(--gray);border-radius:8px;padding:8px 14px;font-size:12px;border:1px solid var(--border);}
    .legend-item strong{color:var(--navy);}
    .svg-wrap{border-radius:8px;overflow:hidden;border:1px solid var(--border);}
    .rack-container{overflow-x:auto;padding-bottom:10px;}
    .form-row{display:flex;flex-wrap:wrap;gap:14px;margin-top:14px;align-items:flex-end;}
    .form-group{display:flex;flex-direction:column;gap:4px;}
    .form-group label{font-size:12px;color:var(--muted);font-weight:600;}
    .form-group input,.form-group select,.form-group textarea{padding:7px 10px;border:1px solid var(--border);border-radius:7px;font-family:'Cairo',sans-serif;font-size:13px;color:var(--text);width:100%;}
    .form-group input:focus,.form-group select:focus{outline:none;border-color:var(--navy);}
    .btn{padding:8px 20px;border:none;border-radius:8px;cursor:pointer;font-family:'Cairo',sans-serif;font-size:13px;font-weight:600;transition:opacity .2s;}
    .btn:hover{opacity:.85;}
    .btn-primary{background:var(--navy);color:white;}
    .btn-gold{background:var(--gold);color:var(--navy);}
    .btn-red{background:var(--red);color:white;}
    .btn-group{display:flex;gap:8px;}
    .tab-btn{padding:6px 14px;border:1px solid var(--border);border-radius:6px;background:white;cursor:pointer;font-family:'Cairo',sans-serif;font-size:12px;font-weight:600;color:var(--navy);transition:all .2s;}
    .tab-btn.active{background:var(--gold);border-color:var(--gold);}
    .cat-tag{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;}
    .cat-face{background:#fde8f5;color:#9b59b6;}
    .cat-body{background:#e8f5fd;color:#2980b9;}
    .cat-hair{background:#fff3e0;color:#e67e22;}
    .cat-makeup{background:#fce4ec;color:#e91e63;}
    .cat-perfume{background:#e8f5e9;color:#27ae60;}
    .cat-mixed{background:#eee;color:#555;}
    .cap-bar-bg{background:var(--border);border-radius:8px;height:10px;overflow:hidden;margin-top:5px;}
    .cap-bar-fill{height:100%;background:var(--gold);border-radius:8px;}
    @media(max-width:900px){.grid-2,.grid-3{grid-template-columns:1fr;}.grid-4{grid-template-columns:1fr 1fr;}.unit-grid{grid-template-columns:repeat(4,1fr);}}
    @media(max-width:600px){.unit-grid{grid-template-columns:repeat(3,1fr);}}
    @media print{body{padding:0;background:white;}.no-print{display:none!important;}.card{box-shadow:none;border:1px solid #ddd;}}
  </style>
</head>
<body>
<div class="container" id="app"></div>
<script>
const CFG={totalUnits:19,unitLength:9,unitWidth:7,areaSqm:63};
const CATEGORIES=[
  {key:'face',label:'العناية بالوجه',cls:'cat-face'},
  {key:'body',label:'العناية بالجسم',cls:'cat-body'},
  {key:'hair',label:'العناية بالشعر',cls:'cat-hair'},
  {key:'makeup',label:'الميك أب',cls:'cat-makeup'},
  {key:'perfume',label:'العطور',cls:'cat-perfume'},
  {key:'mixed',label:'مختلط',cls:'cat-mixed'},
];
const STATUSES=[
  {key:'empty',label:'فارغة',cls:'st-empty'},
  {key:'partial',label:'مشغّلة جزئياً',cls:'st-partial'},
  {key:'full',label:'ممتلئة',cls:'st-full'},
];
const state={
  units:Array.from({length:19},(_,i)=>({id:i+1,name:`الثلاجة ${i+1}`,category:'mixed',status:'empty',note:'',fillPct:0})),
  selected:1,view:'plan',
  cfg:{baysPerAisle:6,levelsPerBay:4,cartonsPerLevel:6},
};
const unit=()=>state.units.find(u=>u.id===state.selected);
const catObj=k=>CATEGORIES.find(c=>c.key===k)||CATEGORIES[5];
const statusObj=k=>STATUSES.find(s=>s.key===k)||STATUSES[0];
const fmt=n=>n.toLocaleString('ar-EG');
const pad=n=>String(n).padStart(2,'0');
function derivedStats(){
  const{baysPerAisle,levelsPerBay,cartonsPerLevel}=state.cfg;
  const baysPerUnit=baysPerAisle*2;
  const levelsPerUnit=baysPerUnit*levelsPerBay;
  const cartonsPerUnit=levelsPerUnit*cartonsPerLevel;
  return{baysPerUnit,levelsPerUnit,cartonsPerUnit,
    totalBays:baysPerUnit*CFG.totalUnits,
    totalLevels:baysPerUnit*CFG.totalUnits*levelsPerBay,
    totalCartons:baysPerUnit*CFG.totalUnits*levelsPerBay*cartonsPerLevel};
}
function addrCode(uid,aisle,bay,level){return`${pad(uid)}-${aisle}-${pad(bay)}-${pad(level)}`;}
function selectUnit(id){state.selected=id;render();}
function setView(v){state.view=v;render();}
function updateCfg(p,val){state.cfg[p]=+val;render();}
function updateUnit(upd){state.units=state.units.map(u=>u.id===state.selected?{...u,...upd}:u);render();}

function buildPlanSVG(){
  const{baysPerAisle}=state.cfg;
  const W=880,H=680,mg=50,aisleW=110;
  const rackD=(H-mg*2-aisleW)/2-10;
  const bayW=(W-mg*2)/baysPerAisle;
  let lr='',rr='';
  for(let b=0;b<baysPerAisle;b++){
    const x=mg+b*bayW;
    lr+=`<rect x="${x+2}" y="${mg}" width="${bayW-6}" height="${rackD}" fill="#1a1a2e" rx="4" stroke="#e8b830" stroke-width="1.5"/>
         <text x="${x+bayW/2}" y="${mg+rackD/2+4}" fill="#e8b830" font-size="10" text-anchor="middle" font-family="monospace">L-${pad(b+1)}</text>`;
    rr+=`<rect x="${x+2}" y="${H-mg-rackD}" width="${bayW-6}" height="${rackD}" fill="#1a1a2e" rx="4" stroke="#e8b830" stroke-width="1.5"/>
         <text x="${x+bayW/2}" y="${H-mg-rackD/2+4}" fill="#e8b830" font-size="10" text-anchor="middle" font-family="monospace">R-${pad(b+1)}</text>`;
  }
  const ay=mg+rackD+5;
  return`<svg viewBox="0 0 ${W+60} ${H+60}" width="100%" style="max-height:380px;background:#fafbff;border-radius:10px;display:block;">
    <defs><marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#e8b830"/></marker></defs>
    <rect x="${mg}" y="${mg}" width="${W-mg*2}" height="${H-mg*2}" fill="none" stroke="#333" stroke-width="3" rx="4"/>
    <rect x="${mg}" y="${ay}" width="${W-mg*2}" height="${aisleW}" fill="#ecf0f1" stroke="#bdc3c7"/>
    <text x="${W/2}" y="${ay+aisleW/2+5}" text-anchor="middle" font-size="13" fill="#7f8c8d" font-family="Cairo,sans-serif">ممر التشغيل</text>
    ${lr}${rr}
    <rect x="${W/2-50}" y="${H-mg-6}" width="100" height="8" fill="#c0392b" rx="2"/>
    <text x="${W/2}" y="${H-mg+22}" text-anchor="middle" font-size="11" fill="#c0392b" font-family="Cairo,sans-serif">▼ مدخل / Door</text>
    <text x="${mg+4}" y="${ay-10}" font-size="10" fill="#2980b9" font-family="monospace">Aisle-L</text>
    <text x="${mg+4}" y="${H-mg-rackD-10}" font-size="10" fill="#2980b9" font-family="monospace">Aisle-R</text>
    <line x1="${mg}" y1="${H+10}" x2="${W-mg}" y2="${H+10}" stroke="#e8b830" stroke-width="1.5" marker-end="url(#arr)" marker-start="url(#arr)"/>
    <text x="${W/2}" y="${H+30}" text-anchor="middle" font-size="12" fill="#333">9 م</text>
    <line x1="${W+10}" y1="${mg}" x2="${W+10}" y2="${H-mg}" stroke="#e8b830" stroke-width="1.5" marker-end="url(#arr)" marker-start="url(#arr)"/>
    <text x="${W+45}" y="${H/2}" text-anchor="middle" font-size="12" fill="#333" transform="rotate(90,${W+45},${H/2})">7 م</text>
  </svg>`;
}

function buildElevationSVG(){
  const{baysPerAisle,levelsPerBay,cartonsPerLevel}=state.cfg;
  const lH=40,bW=92,padX=52,padY=44;
  const svgW=baysPerAisle*bW+padX*2;
  const svgH=levelsPerBay*lH+padY*2+30;
  const COLORS=['#d5e8d4','#dae8fc','#fff2cc','#f8cecc','#e1d5e7','#d5e8d4'];
  let bays='',lvlLabels='';
  for(let b=0;b<baysPerAisle;b++){
    const x=padX+b*bW;
    let shelves='';
    for(let lv=0;lv<levelsPerBay;lv++){
      const y=padY+lv*lH;
      const fill=COLORS[lv%COLORS.length];
      const lvNum=levelsPerBay-lv;
      shelves+=`<rect x="${x+2}" y="${y+2}" width="${bW-8}" height="${lH-4}" fill="${fill}" stroke="#aaa" stroke-width=".8" rx="2"/>
                <text x="${x+bW/2-2}" y="${y+lH/2+4}" font-size="9" text-anchor="middle" fill="#333" font-family="Cairo,sans-serif">م${lvNum}·${cartonsPerLevel}ص</text>`;
    }
    bays+=`<g>
      <rect x="${x}" y="${padY}" width="${bW-4}" height="${levelsPerBay*lH}" fill="none" stroke="#333" stroke-width="1.5" rx="3"/>
      ${shelves}
      <text x="${x+bW/2-2}" y="${padY-10}" font-size="10" text-anchor="middle" fill="#1a2b4c" font-weight="bold" font-family="monospace">باي ${pad(b+1)}</text>
      <text x="${x+bW/2-2}" y="${padY+levelsPerBay*lH+18}" font-size="9" text-anchor="middle" fill="#7f8c8d" font-family="monospace">L-${pad(b+1)}</text>
    </g>`;
  }
  for(let lv=0;lv<levelsPerBay;lv++){
    const y=padY+lv*lH;
    lvlLabels+=`<text x="${padX-10}" y="${y+lH/2+4}" font-size="10" text-anchor="end" fill="#2980b9" font-family="monospace">L${levelsPerBay-lv}</text>`;
  }
  return`<div class="rack-container">
    <svg viewBox="0 0 ${svgW} ${svgH}" width="${Math.max(svgW,380)}" height="${svgH}" style="background:#fafbff;border-radius:8px;display:block;">
      ${bays}${lvlLabels}
      <text x="${padX}" y="${svgH-6}" font-size="10" fill="#7f8c8d" font-family="Cairo,sans-serif">م=مستوى · ص=صندوق · يوضح جانب Aisle-L فقط (Aisle-R مطابق)</text>
    </svg></div>`;
}

function buildAddressTable(){
  const{baysPerAisle,levelsPerBay}=state.cfg;
  const uid=state.selected;
  let rows='';
  for(const aisle of['L','R']){
    for(let b=1;b<=baysPerAisle;b++){
      for(let lv=levelsPerBay;lv>=1;lv--){
        const lvDesc=lv===1?'الأرضية':lv===levelsPerBay?'القمة':`مستوى ${lv}`;
        rows+=`<tr>
          <td><span class="addr-code">${addrCode(uid,aisle,b,lv)}</span></td>
          <td>${aisle==='L'?'يسار (L)':'يمين (R)'}</td>
          <td>${b}</td>
          <td>${lv} – ${lvDesc}</td>
          <td style="color:#27ae60;">✓ متاحة</td>
        </tr>`;
      }
    }
  }
  return`<div style="overflow-x:auto;max-height:360px;overflow-y:auto;">
    <table class="addr-table">
      <thead><tr><th>كود الموقع</th><th>الممر</th><th>الباي</th><th>المستوى</th><th>الحالة</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div class="addr-legend">
      <div class="legend-item"><strong>UU</strong> رقم الوحدة (01-19)</div>
      <div class="legend-item"><strong>A</strong> الممر: L=يسار / R=يمين</div>
      <div class="legend-item"><strong>BB</strong> رقم الباي (01-${pad(baysPerAisle)})</div>
      <div class="legend-item"><strong>LL</strong> المستوى (01=أرضية)</div>
    </div>`;
}

function render(){
  const u=unit();
  const s=derivedStats();
  const cat=catObj(u.category);
  const stu=statusObj(u.status);
  const{baysPerAisle,levelsPerBay,cartonsPerLevel}=state.cfg;
  const catSummary=CATEGORIES.map(c=>{
    const cnt=state.units.filter(u2=>u2.category===c.key).length;
    return cnt>0?`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);">
      <span class="cat-tag ${c.cls}">${c.label}</span><span style="font-weight:700;">${cnt} وحدة</span></div>`:'';
  }).join('');

  document.getElementById('app').innerHTML=`
  <div class="header">
    <div><h1>🏭 مجمع التبريد — الرحبة</h1><p>Cosmetics Cold Storage · نظام العنونة العالمي UU-A-BB-LL</p></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <span class="badge">19 وحدة تبريد</span>
      <span class="badge">63 م² / وحدة</span>
      <button class="btn btn-red no-print" onclick="window.print()">🖨️ طباعة</button>
    </div>
  </div>

  <div class="grid-4" style="margin-bottom:20px;">
    <div class="kpi"><div class="val">${fmt(CFG.totalUnits*CFG.areaSqm)}</div><div class="lbl">إجمالي المساحة (م²)</div></div>
    <div class="kpi"><div class="val">${fmt(s.totalBays)}</div><div class="lbl">إجمالي البايات</div></div>
    <div class="kpi"><div class="val">${fmt(s.totalLevels)}</div><div class="lbl">إجمالي مستويات الرفوف</div></div>
    <div class="kpi"><div class="val">${fmt(s.totalCartons)}</div><div class="lbl">الطاقة الاستيعابية (صندوق)</div></div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-title">🗺️ شبكة الوحدات (${CFG.totalUnits} ثلاجة)</div>
      <div class="unit-grid">
        ${state.units.map(u2=>{const s2=statusObj(u2.status);return`<button class="unit-btn ${u2.id===state.selected?'active':''} ${s2.cls}" onclick="selectUnit(${u2.id})"><div class="u-id">${pad(u2.id)}</div><div class="u-st">${s2.label}</div></button>`;}).join('')}
      </div>
      <div style="margin-top:16px;">
        <div class="card-title" style="font-size:13px;">📊 توزيع الفئات</div>
        ${catSummary||'<p style="color:var(--muted);font-size:12px;">جميع الوحدات مصنّفة كـ «مختلط»</p>'}
      </div>
    </div>

    <div class="card">
      <div class="card-title">❄️ تفاصيل الوحدة <span style="font-family:monospace;color:var(--gold);">${pad(u.id)}</span> — ${u.name}</div>
      <div class="grid-2" style="margin-bottom:14px;">
        <div class="form-group"><label>اسم الوحدة</label><input value="${u.name}" oninput="updateUnit({name:this.value})"></div>
        <div class="form-group"><label>فئة المنتج</label>
          <select onchange="updateUnit({category:this.value})">${CATEGORIES.map(c=>`<option value="${c.key}" ${c.key===u.category?'selected':''}>${c.label}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>حالة الإشغال</label>
          <select onchange="updateUnit({status:this.value})">${STATUSES.map(s2=>`<option value="${s2.key}" ${s2.key===u.status?'selected':''}>${s2.label}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>نسبة الإشغال %</label>
          <input type="number" min="0" max="100" value="${u.fillPct}" oninput="updateUnit({fillPct:+this.value})">
        </div>
      </div>
      <div class="form-group" style="margin-bottom:14px;"><label>ملاحظات</label>
        <textarea rows="2" oninput="updateUnit({note:this.value})">${u.note}</textarea>
      </div>
      <div style="background:var(--gray);border-radius:8px;padding:12px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-bottom:4px;">
          <span>فئة: <span class="cat-tag ${cat.cls}">${cat.label}</span></span>
          <span>الحالة: <strong>${stu.label}</strong></span>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">نسبة الإشغال: <strong>${u.fillPct}%</strong></div>
        <div class="cap-bar-bg"><div class="cap-bar-fill" style="width:${u.fillPct}%;"></div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:12px;text-align:center;font-size:12px;">
          <div style="background:white;border-radius:6px;padding:8px;"><div style="font-weight:700;color:var(--navy);font-size:16px;">${s.baysPerUnit}</div><div style="color:var(--muted);">باي</div></div>
          <div style="background:white;border-radius:6px;padding:8px;"><div style="font-weight:700;color:var(--navy);font-size:16px;">${s.levelsPerUnit}</div><div style="color:var(--muted);">مستوى</div></div>
          <div style="background:white;border-radius:6px;padding:8px;"><div style="font-weight:700;color:var(--gold);font-size:16px;">${fmt(s.cartonsPerUnit)}</div><div style="color:var(--muted);">صندوق</div></div>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-title" style="justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <span>📐 مخطط الوحدة — ${state.view==='plan'?'مسقط أرضي':state.view==='elevation'?'منظر جانبي (راك)':'جدول العناوين'}</span>
      <div class="btn-group no-print">
        <button class="tab-btn ${state.view==='plan'?'active':''}" onclick="setView('plan')">مسقط أرضي</button>
        <button class="tab-btn ${state.view==='elevation'?'active':''}" onclick="setView('elevation')">منظر جانبي</button>
        <button class="tab-btn ${state.view==='address'?'active':''}" onclick="setView('address')">جدول العناوين</button>
      </div>
    </div>
    <div class="form-row no-print" style="margin-bottom:14px;">
      <div class="form-group"><label>بايات / ممر</label><input type="number" min="1" max="20" value="${baysPerAisle}" style="width:80px;" onchange="updateCfg('baysPerAisle',this.value)"></div>
      <div class="form-group"><label>مستويات / باي</label><input type="number" min="1" max="8" value="${levelsPerBay}" style="width:80px;" onchange="updateCfg('levelsPerBay',this.value)"></div>
      <div class="form-group"><label>صناديق / مستوى</label><input type="number" min="1" max="20" value="${cartonsPerLevel}" style="width:80px;" onchange="updateCfg('cartonsPerLevel',this.value)"></div>
    </div>
    <div class="svg-wrap">
      ${state.view==='plan'?buildPlanSVG():state.view==='elevation'?buildElevationSVG():buildAddressTable()}
    </div>
  </div>

  <div class="card">
    <div class="card-title">🔖 نظام العنونة العالمي — Global Location Number (GLN)</div>
    <div class="grid-3">
      <div>
        <p style="font-size:13px;margin-bottom:10px;color:var(--muted);">صيغة الكود الموحّد:</p>
        <div style="background:var(--navy);color:white;font-family:monospace;font-size:20px;padding:14px 20px;border-radius:10px;letter-spacing:3px;text-align:center;">${pad(state.selected)} – L – 03 – 02</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:8px;text-align:center;font-size:11px;color:var(--muted);">
          <div>وحدة</div><div>ممر</div><div>باي</div><div>مستوى</div>
        </div>
        <div style="margin-top:14px;font-size:12px;line-height:1.8;color:var(--muted);">
          المستوى 01 = الأرضية (أسهل وصول، أثقل البضائع)<br>
          المستوى ${pad(levelsPerBay)} = القمة (أخف البضائع)<br>
          L = Aisle Left (يسار) · R = Aisle Right (يمين)
        </div>
      </div>
      <div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <tr style="background:var(--gray);"><th style="padding:6px 10px;text-align:right;">المقطع</th><th style="padding:6px 10px;text-align:right;">القيم</th><th style="padding:6px 10px;text-align:right;">الوصف</th></tr>
          <tr><td style="padding:6px 10px;font-weight:700;font-family:monospace;">UU</td><td>01 – 19</td><td>رقم الثلاجة</td></tr>
          <tr style="background:var(--gray);"><td style="padding:6px 10px;font-weight:700;font-family:monospace;">A</td><td>L أو R</td><td>الممر (يسار / يمين)</td></tr>
          <tr><td style="padding:6px 10px;font-weight:700;font-family:monospace;">BB</td><td>01 – ${pad(baysPerAisle)}</td><td>رقم الباي</td></tr>
          <tr style="background:var(--gray);"><td style="padding:6px 10px;font-weight:700;font-family:monospace;">LL</td><td>01 – ${pad(levelsPerBay)}</td><td>المستوى (01=أرضية)</td></tr>
        </table>
      </div>
      <div>
        <p style="font-size:12px;color:var(--muted);margin-bottom:10px;">أمثلة على الأكواد:</p>
        ${[[`${pad(state.selected)}-L-01-01`,'الوحدة الحالية · يسار · باي 1 · أرضية'],[`${pad(state.selected)}-R-03-${pad(levelsPerBay)}`,'الوحدة الحالية · يمين · باي 3 · قمة'],['05-L-02-02','الوحدة 5 · يسار · باي 2 · مستوى 2'],['12-R-06-03','الوحدة 12 · يمين · باي 6 · مستوى 3']].map(([code,desc])=>`
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span class="addr-code">${code}</span>
            <span style="font-size:11px;color:var(--muted);">${desc}</span>
          </div>`).join('')}
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">📋 ملخص الطاقة الاستيعابية</div>
    <div class="grid-2">
      <table class="addr-table">
        <thead><tr><th>البند</th><th>للوحدة الواحدة</th><th>للمجمع كله (19 وحدة)</th></tr></thead>
        <tbody>
          <tr><td>المساحة</td><td>${CFG.areaSqm} م²</td><td>${fmt(CFG.totalUnits*CFG.areaSqm)} م²</td></tr>
          <tr><td>الممرات</td><td>2 (L + R)</td><td>${CFG.totalUnits*2}</td></tr>
          <tr><td>البايات</td><td>${s.baysPerUnit}</td><td>${fmt(s.totalBays)}</td></tr>
          <tr><td>مستويات الرفوف</td><td>${s.levelsPerUnit}</td><td>${fmt(s.totalLevels)}</td></tr>
          <tr><td>الصناديق</td><td><strong>${fmt(s.cartonsPerUnit)}</strong></td><td><strong style="color:var(--gold);font-size:16px;">${fmt(s.totalCartons)}</strong></td></tr>
        </tbody>
      </table>
      <div>
        <p style="font-size:13px;margin-bottom:10px;color:var(--muted);">توزيع الوحدات حسب الفئة:</p>
        ${CATEGORIES.map(c=>{const cnt=state.units.filter(u2=>u2.category===c.key).length;const pct=Math.round(cnt/CFG.totalUnits*100);return`<div style="margin-bottom:8px;"><div style="display:flex;justify-content:space-between;font-size:12px;"><span class="cat-tag ${c.cls}">${c.label}</span><span>${cnt} وحدة (${pct}%)</span></div><div class="cap-bar-bg"><div class="cap-bar-fill" style="width:${pct}%;background:var(--navy);"></div></div></div>`;}).join('')}
      </div>
    </div>
  </div>

  <div class="btn-group no-print" style="margin-bottom:30px;">
    <button class="btn btn-red" onclick="window.print()">🖨️ طباعة / PDF</button>
    <button class="btn btn-primary" onclick="alert('يمكن ربطه بـ Firebase لحفظ دائم')">💾 حفظ</button>
    <button class="btn btn-gold" onclick="exportCSV()">📥 تصدير CSV</button>
  </div>`;
}

function exportCSV(){
  const{baysPerAisle,levelsPerBay,cartonsPerLevel}=state.cfg;
  const rows=[['كود الموقع','الوحدة','الممر','الباي','المستوى','الفئة','الحالة']];
  state.units.forEach(u2=>{
    const cat=catObj(u2.category).label;
    const stu=statusObj(u2.status).label;
    ['L','R'].forEach(aisle=>{
      for(let b=1;b<=baysPerAisle;b++){
        for(let lv=1;lv<=levelsPerBay;lv++){
          rows.push([addrCode(u2.id,aisle,b,lv),u2.name,aisle==='L'?'يسار':'يمين',b,lv,cat,stu]);
        }
      }
    });
  });
  const csv=rows.map(r=>r.join(',')).join('\n');
  const a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);
  a.download='cold_storage_locations.csv';
  a.click();
}

window.selectUnit=selectUnit;window.setView=setView;window.updateUnit=updateUnit;window.updateCfg=updateCfg;window.exportCSV=exportCSV;
render();
</script>
</body>
</html>
