import React, { useState, useEffect } from 'react';

const CFG = { totalUnits: 19, unitLength: 9, unitWidth: 7, areaSqm: 63 };

const CATEGORIES = [
  { key: 'face', label: 'العناية بالوجه', cls: 'cat-face' },
  { key: 'body', label: 'العناية بالجسم', cls: 'cat-body' },
  { key: 'hair', label: 'العناية بالشعر', cls: 'cat-hair' },
  { key: 'makeup', label: 'الميك أب', cls: 'cat-makeup' },
  { key: 'perfume', label: 'العطور والكريمات', cls: 'cat-perfume' },
  { key: 'sun', label: 'واقي الشمس', cls: 'cat-sun' },
  { key: 'baby', label: 'منتجات الأطفال', cls: 'cat-baby' },
  { key: 'mixed', label: 'مختلط', cls: 'cat-mixed' },
];

const STATUSES = [
  { key: 'empty', label: 'فارغة', cls: 'st-empty' },
  { key: 'partial', label: 'مشغّلة جزئياً', cls: 'st-partial' },
  { key: 'full', label: 'ممتلئة', cls: 'st-full' },
];

const ColdStoragePlan = () => {
  const [state, setState] = useState({
    units: Array.from({ length: 19 }, (_, i) => {
      const id = i + 1;
      let cat = 'mixed';
      if (id <= 3) cat = 'face';
      else if (id <= 6) cat = 'body';
      else if (id <= 9) cat = 'hair';
      else if (id <= 12) cat = 'makeup';
      else if (id <= 15) cat = 'perfume';
      else if (id <= 17) cat = 'sun';
      else if (id === 18) cat = 'baby';
      return { id, name: `الثلاجة ${id}`, category: cat, status: 'empty', note: '', fillPct: 0 };
    }),
    selected: 1,
    view: 'plan',
    cfg: { baysPerAisle: 6, levelsPerBay: 5, cartonsPerLevel: 8 },
  });

  const unit = state.units.find((u) => u.id === state.selected);
  const catObj = (k) => CATEGORIES.find((c) => c.key === k) || CATEGORIES[7];
  const statusObj = (k) => STATUSES.find((s) => s.key === k) || STATUSES[0];
  const fmt = (n) => n.toLocaleString('ar-EG');
  const pad = (n) => String(n).padStart(2, '0');

  const derivedStats = () => {
    const { baysPerAisle, levelsPerBay, cartonsPerLevel } = state.cfg;
    const baysPerUnit = baysPerAisle * 2;
    const levelsPerUnit = baysPerUnit * levelsPerBay;
    const cartonsPerUnit = levelsPerUnit * cartonsPerLevel;
    return {
      baysPerUnit,
      levelsPerUnit,
      cartonsPerUnit,
      totalBays: baysPerUnit * CFG.totalUnits,
      totalLevels: baysPerUnit * CFG.totalUnits * levelsPerBay,
      totalCartons: baysPerUnit * CFG.totalUnits * levelsPerBay * cartonsPerLevel,
    };
  };

  const s = derivedStats();

  const addrCode = (uid, aisle, bay, level) => `${pad(uid)}-${aisle}-${pad(bay)}-${pad(level)}`;

  const updateUnit = (upd) => {
    setState((prev) => ({
      ...prev,
      units: prev.units.map((u) => (u.id === prev.selected ? { ...u, ...upd } : u)),
    }));
  };

  const updateCfg = (p, val) => {
    setState((prev) => ({
      ...prev,
      cfg: { ...prev.cfg, [p]: +val },
    }));
  };

  const buildPlanSVG = () => {
    const { baysPerAisle } = state.cfg;
    const W = 880, H = 680, mg = 50, aisleW = 110;
    const rackD = (H - mg * 2 - aisleW) / 2 - 10;
    const bayW = (W - mg * 2) / baysPerAisle;
    let lr = [], rr = [];
    for (let b = 0; b < baysPerAisle; b++) {
      const x = mg + b * bayW;
      lr.push(
        <React.Fragment key={`l-${b}`}>
          <rect x={x + 2} y={mg} width={bayW - 6} height={rackD} fill="#1a1a2e" rx="4" stroke="#e8b830" strokeWidth="1.5" />
          <text x={x + bayW / 2} y={mg + rackD / 2 + 4} fill="#e8b830" fontSize="10" textAnchor="middle" fontFamily="monospace">L-{pad(b + 1)}</text>
        </React.Fragment>
      );
      rr.push(
        <React.Fragment key={`r-${b}`}>
          <rect x={x + 2} y={H - mg - rackD} width={bayW - 6} height={rackD} fill="#1a1a2e" rx="4" stroke="#e8b830" strokeWidth="1.5" />
          <text x={x + bayW / 2} y={H - mg - rackD / 2 + 4} fill="#e8b830" fontSize="10" textAnchor="middle" fontFamily="monospace">R-{pad(b + 1)}</text>
        </React.Fragment>
      );
    }
    const ay = mg + rackD + 5;
    return (
      <svg viewBox={`0 0 ${W + 60} ${H + 60}`} width="100%" style={{ maxHeight: '380px', background: '#fafbff', borderRadius: '10px', display: 'block' }}>
        <defs>
          <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#e8b830" />
          </marker>
        </defs>
        <rect x={mg} y={mg} width={W - mg * 2} height={H - mg * 2} fill="none" stroke="#333" strokeWidth="3" rx="4" />
        <rect x={mg} y={ay} width={W - mg * 2} height={aisleW} fill="#ecf0f1" stroke="#bdc3c7" />
        <text x={W / 2} y={ay + aisleW / 2 + 5} textAnchor="middle" fontSize="13" fill="#7f8c8d" fontFamily="Cairo,sans-serif">ممر التشغيل</text>
        {lr}
        {rr}
        <rect x={W / 2 - 50} y={H - mg - 6} width="100" height="8" fill="#c0392b" rx="2" />
        <text x={W / 2} y={H - mg + 22} textAnchor="middle" fontSize="11" fill="#c0392b" fontFamily="Cairo,sans-serif">▼ مدخل / Door</text>
        <text x={mg + 4} y={ay - 10} fontSize="10" fill="#2980b9" fontFamily="monospace">Aisle-L</text>
        <text x={mg + 4} y={H - mg - rackD - 10} fontSize="10" fill="#2980b9" fontFamily="monospace">Aisle-R</text>
        <line x1={mg} y1={H + 10} x2={W - mg} y2={H + 10} stroke="#e8b830" strokeWidth="1.5" markerEnd="url(#arr)" markerStart="url(#arr)" />
        <text x={W / 2} y={H + 30} textAnchor="middle" fontSize="12" fill="#333">9 م</text>
        <line x1={W + 10} y1={mg} x2={W + 10} y2={H - mg} stroke="#e8b830" strokeWidth="1.5" markerEnd="url(#arr)" markerStart="url(#arr)" />
        <text x={W + 45} y={H / 2} textAnchor="middle" fontSize="12" fill="#333" transform={`rotate(90,${W + 45},${H / 2})`}>7 م</text>
      </svg>
    );
  };

  const buildElevationSVG = () => {
    const { baysPerAisle, levelsPerBay, cartonsPerLevel } = state.cfg;
    const lH = 40, bW = 92, padX = 52, padY = 44;
    const svgW = baysPerAisle * bW + padX * 2;
    const svgH = levelsPerBay * lH + padY * 2 + 30;
    const COLORS = ['#d5e8d4', '#dae8fc', '#fff2cc', '#f8cecc', '#e1d5e7', '#d5e8d4'];
    let bays = [], lvlLabels = [];
    for (let b = 0; b < baysPerAisle; b++) {
      const x = padX + b * bW;
      let shelves = [];
      for (let lv = 0; lv < levelsPerBay; lv++) {
        const y = padY + lv * lH;
        const fill = COLORS[lv % COLORS.length];
        const lvNum = levelsPerBay - lv;
        shelves.push(
          <React.Fragment key={`s-${b}-${lv}`}>
            <rect x={x + 2} y={y + 2} width={bW - 8} height={lH - 4} fill={fill} stroke="#aaa" strokeWidth=".8" rx="2" />
            <text x={x + bW / 2 - 2} y={y + lH / 2 + 4} fontSize="9" textAnchor="middle" fill="#333" fontFamily="Cairo,sans-serif">م{lvNum}·{cartonsPerLevel}ص</text>
          </React.Fragment>
        );
      }
      bays.push(
        <g key={`b-${b}`}>
          <rect x={x} y={padY} width={bW - 4} height={levelsPerBay * lH} fill="none" stroke="#333" strokeWidth="1.5" rx="3" />
          {shelves}
          <text x={x + bW / 2 - 2} y={padY - 10} fontSize="10" textAnchor="middle" fill="#1a2b4c" fontWeight="bold" fontFamily="monospace">باي {pad(b + 1)}</text>
          <text x={x + bW / 2 - 2} y={padY + levelsPerBay * lH + 18} fontSize="9" textAnchor="middle" fill="#7f8c8d" fontFamily="monospace">L-{pad(b + 1)}</text>
        </g>
      );
    }
    for (let lv = 0; lv < levelsPerBay; lv++) {
      const y = padY + lv * lH;
      lvlLabels.push(
        <text key={`l-${lv}`} x={padX - 10} y={y + lH / 2 + 4} fontSize="10" textAnchor="end" fill="#2980b9" fontFamily="monospace">L{levelsPerBay - lv}</text>
      );
    }
    return (
      <div className="rack-container" style={{ overflowX: 'auto', paddingBottom: '10px' }}>
        <svg viewBox={`0 0 ${svgW} ${svgH}`} width={Math.max(svgW, 380)} height={svgH} style={{ background: '#fafbff', borderRadius: '8px', display: 'block' }}>
          {bays}
          {lvlLabels}
          <text x={padX} y={svgH - 6} fontSize="10" fill="#7f8c8d" fontFamily="Cairo,sans-serif">م=مستوى · ص=صندوق · يوضح جانب Aisle-L فقط (Aisle-R مطابق)</text>
        </svg>
      </div>
    );
  };

  const buildAddressTable = () => {
    const { baysPerAisle, levelsPerBay } = state.cfg;
    const uid = state.selected;
    let rows = [];
    for (const aisle of ['L', 'R']) {
      for (let b = 1; b <= baysPerAisle; b++) {
        for (let lv = levelsPerBay; lv >= 1; lv--) {
          const lvDesc = lv === 1 ? 'الأرضية' : lv === levelsPerBay ? 'القمة' : `مستوى ${lv}`;
          rows.push(
            <tr key={`${aisle}-${b}-${lv}`}>
              <td style={{ padding: '8px 10px', borderBottom: '1px solid #dde3ec' }}><span className="addr-code" style={{ fontFamily: 'monospace', background: '#1a2b4c', color: '#e8b830', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>{addrCode(uid, aisle, b, lv)}</span></td>
              <td style={{ padding: '8px 10px', borderBottom: '1px solid #dde3ec' }}>{aisle === 'L' ? 'يسار (L)' : 'يمين (R)'}</td>
              <td style={{ padding: '8px 10px', borderBottom: '1px solid #dde3ec' }}>{b}</td>
              <td style={{ padding: '8px 10px', borderBottom: '1px solid #dde3ec' }}>{lv} – {lvDesc}</td>
              <td style={{ padding: '8px 10px', borderBottom: '1px solid #dde3ec', color: '#27ae60' }}>✓ متاحة</td>
            </tr>
          );
        }
      }
    }
    return (
      <>
        <div style={{ overflowX: 'auto', maxHeight: '360px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#1a2b4c', color: 'white' }}>
                <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '12px' }}>كود الموقع</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '12px' }}>الممر</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '12px' }}>الباي</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '12px' }}>المستوى</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '12px' }}>الحالة</th>
              </tr>
            </thead>
            <tbody>{rows}</tbody>
          </table>
        </div>
        <div className="addr-legend" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '14px' }}>
          <div className="legend-item" style={{ background: '#f4f6f9', borderRadius: '8px', padding: '8px 14px', fontSize: '12px', border: '1px solid #dde3ec' }}><strong>UU</strong> رقم الوحدة (01-19)</div>
          <div className="legend-item" style={{ background: '#f4f6f9', borderRadius: '8px', padding: '8px 14px', fontSize: '12px', border: '1px solid #dde3ec' }}><strong>A</strong> الممر: L=يسار / R=يمين</div>
          <div className="legend-item" style={{ background: '#f4f6f9', borderRadius: '8px', padding: '8px 14px', fontSize: '12px', border: '1px solid #dde3ec' }}><strong>BB</strong> رقم الباي (01-{pad(baysPerAisle)})</div>
          <div className="legend-item" style={{ background: '#f4f6f9', borderRadius: '8px', padding: '8px 14px', fontSize: '12px', border: '1px solid #dde3ec' }}><strong>LL</strong> المستوى (01=أرضية)</div>
        </div>
      </>
    );
  };

  const cat = catObj(unit.category);
  const stu = statusObj(unit.status);

  const catSummary = CATEGORIES.map((c) => {
    const cnt = state.units.filter((u2) => u2.category === c.key).length;
    return cnt > 0 ? (
      <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #dde3ec' }}>
        <span className={`cat-tag ${c.cls}`}>{c.label}</span>
        <span style={{ fontWeight: 700 }}>{cnt} وحدة</span>
      </div>
    ) : null;
  });

  return (
    <div className="container" style={{ maxWidth: '1500px', margin: 'auto', padding: '20px', fontFamily: 'Cairo, sans-serif' }}>
      <style>{`
        .cat-tag { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
        .cat-face { background: #fde8f5; color: #9b59b6; }
        .cat-body { background: #e8f5fd; color: #2980b9; }
        .cat-hair { background: #fff3e0; color: #e67e22; }
        .cat-makeup { background: #fce4ec; color: #e91e63; }
        .cat-perfume { background: #e8f5e9; color: #27ae60; }
        .cat-sun { background: #fffde7; color: #f39c12; }
        .cat-baby { background: #e1f5fe; color: #03a9f4; }
        .cat-mixed { background: #eee; color: #555; }
        .unit-btn { padding: 10px 6px; border: 2px solid #dde3ec; border-radius: 10px; text-align: center; cursor: pointer; background: white; transition: all .2s; font-family: 'Cairo', sans-serif; font-size: 12px; }
        .unit-btn.active { background: #1a2b4c; color: white; border-color: #e8b830; }
        .st-empty { border-right: 4px solid #bdc3c7; }
        .st-partial { border-right: 4px solid #e8b830; }
        .st-full { border-right: 4px solid #27ae60; }
      `}</style>
      <div className="header" style={{ background: 'linear-gradient(135deg, #1a2b4c 0%, #243b6e 100%)', color: 'white', borderRadius: '14px', padding: '24px 30px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 900 }}>🏭 مجمع التبريد — الرحبة</h1>
          <p style={{ fontSize: '13px', opacity: 0.75, marginTop: '4px' }}>Cosmetics Cold Storage · نظام العنونة العالمي UU-A-BB-LL</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="badge" style={{ background: '#e8b830', color: '#1a2b4c', fontWeight: 700, padding: '4px 14px', borderRadius: '20px', fontSize: '12px' }}>19 وحدة تبريد</span>
          <span className="badge" style={{ background: '#e8b830', color: '#1a2b4c', fontWeight: 700, padding: '4px 14px', borderRadius: '20px', fontSize: '12px' }}>63 م² / وحدة</span>
          <button className="btn no-print" style={{ padding: '8px 20px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'Cairo', fontSize: '13px', fontWeight: 600, background: '#c0392b', color: 'white' }} onClick={() => window.print()}>🖨️ طباعة</button>
        </div>
      </div>

      <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
        {[
          { val: fmt(CFG.totalUnits * CFG.areaSqm), lbl: 'إجمالي المساحة (م²)' },
          { val: fmt(s.totalBays), lbl: 'إجمالي البايات' },
          { val: fmt(s.totalLevels), lbl: 'إجمالي مستويات الرفوف' },
          { val: fmt(s.totalCartons), lbl: 'الطاقة الاستيعابية (صندوق)' },
        ].map((k, i) => (
          <div key={i} className="kpi" style={{ background: '#1a2b4c', color: 'white', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
            <div className="val" style={{ fontSize: '26px', fontWeight: 900, color: '#e8b830' }}>{k.val}</div>
            <div className="lbl" style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>{k.lbl}</div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div className="card" style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,.07)', marginBottom: '20px' }}>
          <div className="card-title" style={{ fontSize: '15px', fontWeight: 700, color: '#1a2b4c', marginBottom: '14px', paddingBottom: '10px', borderBottom: '2px solid #e8b830', display: 'flex', alignItems: 'center', gap: '8px' }}>🗺️ شبكة الوحدات ({CFG.totalUnits} ثلاجة)</div>
          <div className="unit-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
            {state.units.map((u2) => (
              <button
                key={u2.id}
                className={`unit-btn ${u2.id === state.selected ? 'active' : ''} ${statusObj(u2.status).cls}`}
                onClick={() => setState((p) => ({ ...p, selected: u2.id }))}
              >
                <div className="u-id" style={{ fontWeight: 700, fontSize: '14px' }}>{pad(u2.id)}</div>
                <div className="u-st" style={{ fontSize: 10, marginTop: 2, opacity: 0.75 }}>{statusObj(u2.status).label}</div>
              </button>
            ))}
          </div>
          <div style={{ marginTop: '16px' }}>
            <div className="card-title" style={{ fontSize: '13px', fontWeight: 700, color: '#1a2b4c', marginBottom: '14px', paddingBottom: '10px', borderBottom: '2px solid #e8b830' }}>📊 توزيع الفئات</div>
            {catSummary}
          </div>
        </div>

        <div className="card" style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,.07)', marginBottom: '20px' }}>
          <div className="card-title" style={{ fontSize: '15px', fontWeight: 700, color: '#1a2b4c', marginBottom: '14px', paddingBottom: '10px', borderBottom: '2px solid #e8b830', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ❄️ تفاصيل الوحدة <span style={{ fontFamily: 'monospace', color: '#e8b830' }}>{pad(unit.id)}</span> — {unit.name}
          </div>
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', color: '#7f8c9b', fontWeight: 600 }}>اسم الوحدة</label>
              <input value={unit.name} onChange={(e) => updateUnit({ name: e.target.value })} style={{ padding: '7px 10px', border: '1px solid #dde3ec', borderRadius: '7px', fontSize: '13px' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', color: '#7f8c9b', fontWeight: 600 }}>فئة المنتج</label>
              <select value={unit.category} onChange={(e) => updateUnit({ category: e.target.value })} style={{ padding: '7px 10px', border: '1px solid #dde3ec', borderRadius: '7px', fontSize: '13px' }}>
                {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', color: '#7f8c9b', fontWeight: 600 }}>حالة الإشغال</label>
              <select value={unit.status} onChange={(e) => updateUnit({ status: e.target.value })} style={{ padding: '7px 10px', border: '1px solid #dde3ec', borderRadius: '7px', fontSize: '13px' }}>
                {STATUSES.map((s2) => <option key={s2.key} value={s2.key}>{s2.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', color: '#7f8c9b', fontWeight: 600 }}>نسبة الإشغال %</label>
              <input type="number" min="0" max="100" value={unit.fillPct} onChange={(e) => updateUnit({ fillPct: +e.target.value })} style={{ padding: '7px 10px', border: '1px solid #dde3ec', borderRadius: '7px', fontSize: '13px' }} />
            </div>
          </div>
          <div style={{ background: '#f4f6f9', borderRadius: '8px', padding: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#7f8c9b', marginBottom: '4px' }}>
              <span>فئة: <span className={`cat-tag ${cat.cls}`}>{cat.label}</span></span>
              <span>الحالة: <strong>{stu.label}</strong></span>
            </div>
            <div style={{ fontSize: '12px', color: '#7f8c9b', marginBottom: '4px' }}>درجة الحرارة: <strong>15-18°C</strong></div>
            <div style={{ fontSize: '12px', color: '#7f8c9b', marginBottom: '6px' }}>نسبة الإشغال: <strong>{unit.fillPct}%</strong></div>
            <div style={{ background: '#dde3ec', borderRadius: '8px', height: '10px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#e8b830', width: `${unit.fillPct}%` }}></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '12px', textAlign: 'center', fontSize: '12px' }}>
              <div style={{ background: 'white', borderRadius: '6px', padding: '8px' }}><div style={{ fontWeight: 700, color: '#1a2b4c', fontSize: '16px' }}>{s.baysPerUnit}</div><div style={{ color: '#7f8c9b' }}>باي</div></div>
              <div style={{ background: 'white', borderRadius: '6px', padding: '8px' }}><div style={{ fontWeight: 700, color: '#1a2b4c', fontSize: '16px' }}>{s.levelsPerUnit}</div><div style={{ color: '#7f8c9b' }}>مستوى</div></div>
              <div style={{ background: 'white', borderRadius: '6px', padding: '8px' }}><div style={{ fontWeight: 700, color: '#e8b830', fontSize: '16px' }}>{fmt(s.cartonsPerUnit)}</div><div style={{ color: '#7f8c9b' }}>صندوق</div></div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,.07)', marginBottom: '20px' }}>
        <div className="card-title" style={{ fontSize: '15px', fontWeight: 700, color: '#1a2b4c', marginBottom: '14px', paddingBottom: '10px', borderBottom: '2px solid #e8b830', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📐 مخطط الوحدة — {state.view === 'plan' ? 'مسقط أرضي' : state.view === 'elevation' ? 'منظر جانبي (راك)' : 'جدول العناوين'}</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className={`tab-btn ${state.view === 'plan' ? 'active' : ''}`} onClick={() => setState((p) => ({ ...p, view: 'plan' }))}>مسقط أرضي</button>
            <button className={`tab-btn ${state.view === 'elevation' ? 'active' : ''}`} onClick={() => setState((p) => ({ ...p, view: 'elevation' }))}>منظر جانبي</button>
            <button className={`tab-btn ${state.view === 'address' ? 'active' : ''}`} onClick={() => setState((p) => ({ ...p, view: 'address' }))}>جدول العناوين</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '14px', marginBottom: '14px', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><label style={{ fontSize: '12px', fontWeight: 600 }}>بايات / ممر</label><input type="number" min="1" max="20" value={state.cfg.baysPerAisle} style={{ width: '80px', padding: '7px', border: '1px solid #dde3ec' }} onChange={(e) => updateCfg('baysPerAisle', e.target.value)} /></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><label style={{ fontSize: '12px', fontWeight: 600 }}>مستويات / باي</label><input type="number" min="1" max="8" value={state.cfg.levelsPerBay} style={{ width: '80px', padding: '7px', border: '1px solid #dde3ec' }} onChange={(e) => updateCfg('levelsPerBay', e.target.value)} /></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><label style={{ fontSize: '12px', fontWeight: 600 }}>صناديق / مستوى</label><input type="number" min="1" max="20" value={state.cfg.cartonsPerLevel} style={{ width: '80px', padding: '7px', border: '1px solid #dde3ec' }} onChange={(e) => updateCfg('cartonsPerLevel', e.target.value)} /></div>
        </div>
        <div className="svg-wrap" style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #dde3ec' }}>
          {state.view === 'plan' ? buildPlanSVG() : state.view === 'elevation' ? buildElevationSVG() : buildAddressTable()}
        </div>
      </div>

      <div className="card" style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,.07)', marginBottom: '20px' }}>
        <div className="card-title" style={{ fontSize: '15px', fontWeight: 700, color: '#1a2b4c', marginBottom: '14px', paddingBottom: '10px', borderBottom: '2px solid #e8b830' }}>🔖 نظام العنونة العالمي — Global Location Number (GLN)</div>
        <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
          <div>
            <p style={{ fontSize: '13px', marginBottom: '10px', color: '#7f8c9b' }}>صيغة الكود الموحّد:</p>
            <div style={{ background: '#1a2b4c', color: 'white', fontFamily: 'monospace', fontSize: '20px', padding: '14px 20px', borderRadius: '10px', letterSpacing: '3px', textAlign: 'center' }}>{pad(state.selected)} – L – 03 – 02</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginTop: '8px', textAlign: 'center', fontSize: '11px', color: '#7f8c9b' }}>
              <div>وحدة</div><div>ممر</div><div>باي</div><div>مستوى</div>
            </div>
            <div style={{ marginTop: '14px', fontSize: '12px', lineHeight: 1.8, color: '#7f8c9b' }}>
              المستوى 01 = الأرضية (أسهل وصول، أثقل البضائع)<br />
              المستوى {pad(state.cfg.levelsPerBay)} = القمة (أخف البضائع)<br />
              L = Aisle Left (يسار) · R = Aisle Right (يمين)
            </div>
          </div>
          <div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <tbody>
                <tr style={{ background: '#f4f6f9' }}><th style={{ padding: '6px 10px', textAlign: 'right' }}>المقطع</th><th style={{ padding: '6px 10px', textAlign: 'right' }}>القيم</th><th style={{ padding: '6px 10px', textAlign: 'right' }}>الوصف</th></tr>
                <tr><td style={{ padding: '6px 10px', fontWeight: 700, fontFamily: 'monospace' }}>UU</td><td>01 – 19</td><td>رقم الثلاجة</td></tr>
                <tr style={{ background: '#f4f6f9' }}><td style={{ padding: '6px 10px', fontWeight: 700, fontFamily: 'monospace' }}>A</td><td>L أو R</td><td>الممر (يسار / يمين)</td></tr>
                <tr><td style={{ padding: '6px 10px', fontWeight: 700, fontFamily: 'monospace' }}>BB</td><td>01 – {pad(state.cfg.baysPerAisle)}</td><td>رقم الباي</td></tr>
                <tr style={{ background: '#f4f6f9' }}><td style={{ padding: '6px 10px', fontWeight: 700, fontFamily: 'monospace' }}>LL</td><td>01 – {pad(state.cfg.levelsPerBay)}</td><td>المستوى (01=أرضية)</td></tr>
              </tbody>
            </table>
          </div>
          <div>
            <p style={{ fontSize: '12px', color: '#7f8c9b', marginBottom: '10px' }}>أمثلة على الأكواد:</p>
            {[
              [`${pad(state.selected)}-L-01-01`, 'الوحدة الحالية · يسار · باي 1 · أرضية'],
              [`${pad(state.selected)}-R-03-${pad(state.cfg.levelsPerBay)}`, 'الوحدة الحالية · يمين · باي 3 · قمة'],
              ['05-L-02-02', 'الوحدة 5 · يسار · باي 2 · مستوى 2'],
              ['12-R-06-03', 'الوحدة 12 · يمين · باي 6 · مستوى 3'],
            ].map(([code, desc], idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontFamily: 'monospace', background: '#1a2b4c', color: '#e8b830', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>{code}</span>
                <span style={{ fontSize: '11px', color: '#7f8c9b' }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,.07)', marginBottom: '20px' }}>
        <div className="card-title" style={{ fontSize: '15px', fontWeight: 700, color: '#1a2b4c', marginBottom: '14px', paddingBottom: '10px', borderBottom: '2px solid #e8b830' }}>📘 دليل التخزين الحراري والتوزيع</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#1a2b4c', color: 'white' }}>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>الفئة</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>نطاق الحرارة</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>المستوى المفضل</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>ملاحظات التخزين</th>
              </tr>
            </thead>
            <tbody>
              {[
                { cat: 'العناية بالوجه', temp: '15-18°C', lvl: 'المتوسط (02-03)', notes: 'تجنب الإضاءة المباشرة' },
                { cat: 'العناية بالجسم', temp: '15-18°C', lvl: 'الأرضي (01)', notes: 'مناسب للعبوات الكبيرة والثقيلة' },
                { cat: 'العناية بالشعر', temp: '15-18°C', lvl: 'العلوي (04-05)', notes: 'عبوات متوسطة الوزن' },
                { cat: 'الميك أب', temp: '15-17°C', lvl: 'المتوسط (03)', notes: 'حساسية عالية للحرارة' },
                { cat: 'العطور والكريمات', temp: '15-18°C', lvl: 'المتوسط (02)', notes: 'ثبات الرائحة يتطلب استقرار حراري' },
                { cat: 'واقي الشمس', temp: '15-18°C', lvl: 'العلوي (05)', notes: 'خفيف الوزن، تخزين مكثف' },
                { cat: 'منتجات الأطفال', temp: '16-18°C', lvl: 'المتوسط (02-03)', notes: 'أعلى معايير الرقابة الصحية' },
              ].map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #dde3ec' }}>
                  <td style={{ padding: '8px 10px' }}>{r.cat}</td>
                  <td style={{ padding: '8px 10px' }}>{r.temp}</td>
                  <td style={{ padding: '8px 10px' }}>{r.lvl}</td>
                  <td style={{ padding: '8px 10px' }}>{r.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ColdStoragePlan;
