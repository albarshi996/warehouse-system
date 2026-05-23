import React, { useState, useEffect, useRef } from 'react';

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
    searchTerm: '',
    showToast: false
  });

  useEffect(() => {
    const savedV3 = localStorage.getItem('csp_units_v3');
    if (savedV3) {
      try {
        const parsed = JSON.parse(savedV3);
        setState(prev => ({ ...prev, units: parsed }));
      } catch (e) {
        console.error("Failed to load from localStorage v3", e);
      }
    } else {
      // Migration from v2
      const savedV2 = localStorage.getItem('csp_units_v2');
      if (savedV2) {
        try {
          const parsed = JSON.parse(savedV2);
          setState(prev => ({ ...prev, units: parsed }));
          localStorage.setItem('csp_units_v3', savedV2); // Sync to v3
          console.log("Migrated data from csp_units_v2 to csp_units_v3");
        } catch (e) {
          console.error("Failed to migrate from localStorage v2", e);
        }
      }
    }
  }, []);

  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    localStorage.setItem('csp_units_v3', JSON.stringify(state.units));
    setState(prev => ({ ...prev, showToast: true }));
    const timer = setTimeout(() => {
      setState(prev => ({ ...prev, showToast: false }));
    }, 2000);
    return () => clearTimeout(timer);
  }, [state.units, state.cfg]);

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

  const copyTableToTSV = () => {
    const { baysPerAisle, levelsPerBay } = state.cfg;
    let tsv = "اسم الوحدة\tكود الموقع\tالممر\tالباي\tالمستوى\tالفئة\n";
    state.units.forEach(u => {
      for (const aisle of ['L', 'R']) {
        for (let b = 1; b <= baysPerAisle; b++) {
          for (let lv = levelsPerBay; lv >= 1; lv--) {
            const lvDesc = lv === 1 ? 'الأرضية' : lv === levelsPerBay ? 'القمة' : `مستوى ${lv}`;
            tsv += `${u.name}\t${addrCode(u.id, aisle, b, lv)}\t${aisle === 'L' ? 'يسار (L)' : 'يمين (R)'}\t${b}\t${lv} – ${lvDesc}\t${catObj(u.category).label}\n`;
          }
        }
      }
    });
    navigator.clipboard.writeText(tsv).then(() => {
      alert("📋 تم نسخ تقرير العناوين الكامل (لكافة الوحدات) بصيغة TSV");
    });
  };

  const exportToExcel = () => {
    const { baysPerAisle, levelsPerBay } = state.cfg;
    let csv = "Unit,Location_Code,Aisle,Bay,Level,Category,Status\n";
    state.units.forEach(u => {
      const cat = catObj(u.category).label;
      for (const aisle of ['L', 'R']) {
        for (let b = 1; b <= baysPerAisle; b++) {
          for (let lv = levelsPerBay; lv >= 1; lv--) {
            const lvDesc = lv === 1 ? 'Ground' : lv === levelsPerBay ? 'Top' : `Level ${lv}`;
            csv += `"${u.name}","${addrCode(u.id, aisle, b, lv)}","${aisle}","${b}","${lvDesc}","${cat}","Available"\n`;
          }
        }
      }
    });
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `brandzo_storage_report_full_${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
  };

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
    const W = 940, H = 740, mg = 60;
    const rackD = 180;
    const bayW = (W - mg * 2) / baysPerAisle;
    const uprightW = 10;
    const beamH = 6;
    const navy = "#1a2b4c";
    const gold = "#e8b830";

    const drawRack = (isTop) => {
      let elements = [];
      const yBase = isTop ? mg : H - mg - rackD;
      for (let b = 0; b <= baysPerAisle; b++) {
        const x = mg + b * bayW - uprightW / 2;
        elements.push(<rect key={`up-${isTop}-${b}`} x={x} y={yBase} width={uprightW} height={rackD} fill={navy} />);
        // Add footplates
        elements.push(<rect key={`fp-${isTop}-${b}`} x={x - 2} y={isTop ? yBase + rackD : yBase - 4} width={uprightW + 4} height={4} fill="#555" />);
      }
      for (let b = 0; b < baysPerAisle; b++) {
        const x = mg + b * bayW + uprightW / 2;
        const beamW = bayW - uprightW;
        const aisleLabel = isTop ? 'L' : 'R';
        elements.push(<rect key={`fb-${isTop}-${b}`} x={x} y={isTop ? yBase + rackD - beamH : yBase} width={beamW} height={beamH} fill={gold} />);
        elements.push(<rect key={`bb-${isTop}-${b}`} x={x} y={isTop ? yBase : yBase + rackD - beamH} width={beamW} height={beamH} fill={gold} />);
        elements.push(
          <text key={`lbl-${isTop}-${b}`} x={mg + b * bayW + bayW / 2} y={yBase + rackD / 2 + 5} fill={gold} fontSize="14" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
            {aisleLabel}-{pad(b + 1)}
          </text>
        );
        // Safety Bollards (Orange) at aisle ends
        if (b === 0 || b === baysPerAisle - 1) {
          const bx = b === 0 ? mg - 25 : mg + (b + 1) * bayW + 15;
          const by = isTop ? yBase + rackD : yBase;
          elements.push(<circle key={`bol-${isTop}-${b}`} cx={bx} cy={by} r="8" fill="#f39c12" stroke="#e67e22" strokeWidth="2" />);
          elements.push(<circle key={`bol-in-${isTop}-${b}`} cx={bx} cy={by} r="3" fill="white" />);
        }
      }
      return elements;
    };

    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: '420px', background: '#fafbff', borderRadius: '12px', display: 'block' }}>
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill={gold} />
          </marker>
          <pattern id="safety-stripe" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="10" height="20" fill="#f1c40f" />
            <rect x="10" width="10" height="20" fill="#333" />
          </pattern>
        </defs>
        <rect x={mg - 30} y={mg - 30} width={W - mg * 2 + 60} height={H - mg * 2 + 60} fill="none" stroke="#2c3e50" strokeWidth="6" />
        <rect x={mg} y={mg + rackD} width={W - mg * 2} height={H - mg * 2 - rackD * 2} fill="url(#safety-stripe)" opacity="0.1" />
        <line x1={mg} y1={mg + rackD + 15} x2={W - mg} y2={mg + rackD + 15} stroke="#f1c40f" strokeWidth="3" strokeDasharray="10,10" />
        <line x1={mg} y1={H - mg - rackD - 15} x2={W - mg} y2={H - mg - rackD - 15} stroke="#f1c40f" strokeWidth="3" strokeDasharray="10,10" />
        {drawRack(true)}
        {drawRack(false)}
        <text x={W / 2} y={H / 2 + 6} textAnchor="middle" fontSize="18" fontWeight="bold" fill="#34495e" fontFamily="Cairo,sans-serif">ممر التشغيل الآمن (Safety Transit Aisle)</text>

        {/* Refrigeration Units */}
        <g transform={`translate(${mg + 40}, ${mg - 25})`}>
          <rect width="100" height="20" fill="#2980b9" rx="4" />
          <text x="50" y="14" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">❄ REFRIGERATION UNIT A</text>
        </g>
        <g transform={`translate(${W - mg - 140}, ${mg - 25})`}>
          <rect width="100" height="20" fill="#2980b9" rx="4" />
          <text x="50" y="14" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">❄ REFRIGERATION UNIT B</text>
        </g>

        <g transform={`translate(${W / 2}, ${H - mg + 35})`}>
          <rect x="-60" y="-5" width="120" height="12" fill="#c0392b" rx="2" />
          <path d="M 0 7 L 0 25" stroke="#c0392b" strokeWidth="3" markerEnd="url(#arrowhead)" />
          <text x="0" y="45" textAnchor="middle" fontSize="14" fill="#c0392b" fontWeight="bold" fontFamily="Cairo,sans-serif">بوابة الدخول الرئيسية | MAIN LOADING BAY</text>
        </g>

        <g style={{ fontSize: '14px', fontWeight: 'bold' }}>
          <line x1={mg} y1={H - 25} x2={W - mg} y2={H - 25} stroke={gold} strokeWidth="2" markerStart="url(#arrowhead)" markerEnd="url(#arrowhead)" />
          <text x={W / 2} y={H - 8} textAnchor="middle">العرض الفني: 9 متر</text>
          <line x1={W - 25} y1={mg} x2={W - 25} y2={H - mg} stroke={gold} strokeWidth="2" markerStart="url(#arrowhead)" markerEnd="url(#arrowhead)" />
          <text x={W - 10} y={H / 2} textAnchor="middle" transform={`rotate(90, ${W - 10}, ${H / 2})`}>العمق الفني: 7 متر</text>
        </g>
      </svg>
    );
  };

  const buildIsometricSVG = () => {
    const { baysPerAisle, levelsPerBay } = state.cfg;
    const navy = "#1a2b4c";
    const gold = "#e8b830";
    const w = 600, h = 400;

    // Isometric projection helper
    const project = (x, y, z) => {
      const scale = 0.8;
      const isoX = (x - y) * Math.cos(Math.PI / 6) * scale + w / 2;
      const isoY = (x + y) * Math.sin(Math.PI / 6) * scale - z * scale + h / 2 + 50;
      return [isoX, isoY];
    };

    const rackWidth = 200;
    const rackDepth = 80;
    const rackHeight = 150;

    const drawBox = (x, y, z, dx, dy, dz, color, stroke = "#fff", opacity = 1) => {
      const p1 = project(x, y, z);
      const p2 = project(x + dx, y, z);
      const p3 = project(x + dx, y + dy, z);
      const p4 = project(x, y + dy, z);
      const p5 = project(x, y, z + dz);
      const p6 = project(x + dx, y, z + dz);
      const p7 = project(x + dx, y + dy, z + dz);
      const p8 = project(x, y + dy, z + dz);

      return (
        <g key={`${x}-${y}-${z}`} opacity={opacity}>
          {/* Bottom */}
          <polygon points={`${p1} ${p2} ${p3} ${p4}`} fill={color} stroke={stroke} strokeWidth="0.5" />
          {/* Back Left */}
          <polygon points={`${p1} ${p4} ${p8} ${p5}`} fill={color} stroke={stroke} strokeWidth="0.5" />
          {/* Back Right */}
          <polygon points={`${p2} ${p3} ${p7} ${p6}`} fill={color} stroke={stroke} strokeWidth="0.5" />
          {/* Front Left */}
          <polygon points={`${p1} ${p2} ${p6} ${p5}`} fill={color} stroke={stroke} strokeWidth="0.5" />
          {/* Front Right */}
          <polygon points={`${p4} ${p3} ${p7} ${p8}`} fill={color} stroke={stroke} strokeWidth="0.5" />
          {/* Top */}
          <polygon points={`${p5} ${p6} ${p7} ${p8}`} fill={color} stroke={stroke} strokeWidth="0.5" />
        </g>
      );
    };

    let elements = [];
    // Floor
    const fp1 = project(-50, -50, 0), fp2 = project(rackWidth + 50, -50, 0), fp3 = project(rackWidth + 50, rackDepth + 50, 0), fp4 = project(-50, rackDepth + 50, 0);
    elements.push(<polygon key="floor" points={`${fp1} ${fp2} ${fp3} ${fp4}`} fill="#ecf0f1" stroke="#bdc3c7" />);

    // Vertical Uprights (4 pillars)
    for (let i = 0; i <= 1; i++) {
      for (let j = 0; j <= 1; j++) {
        const ux = i * rackWidth, uy = j * rackDepth;
        const p1 = project(ux-3, uy-3, 0), p2 = project(ux+3, uy-3, 0), p3 = project(ux+3, uy+3, 0), p4 = project(ux-3, uy+3, 0);
        const p5 = project(ux-3, uy-3, rackHeight), p6 = project(ux+3, uy-3, rackHeight), p7 = project(ux+3, uy+3, rackHeight), p8 = project(ux-3, uy+3, rackHeight);

        elements.push(<polygon key={`u-${i}-${j}-f`} points={`${p1} ${p2} ${p6} ${p5}`} fill={navy} />);
        elements.push(<polygon key={`u-${i}-${j}-r`} points={`${p2} ${p3} ${p7} ${p6}`} fill="#111c31" />); // Shaded side
        elements.push(<polygon key={`u-${i}-${j}-t`} points={`${p5} ${p6} ${p7} ${p8}`} fill="#243b6e" />); // Top highlight

        // Footplates
        const fp1 = project(ux-6, uy-6, 0), fp2 = project(ux+6, uy-6, 0), fp3 = project(ux+6, uy+6, 0), fp4 = project(ux-6, uy+6, 0);
        elements.push(<polygon key={`fp-${i}-${j}`} points={`${fp1} ${fp2} ${fp3} ${fp4}`} fill="#333" />);
      }
    }

    // Horizontal Beams
    const stepH = rackHeight / levelsPerBay;
    for (let l = 1; l <= levelsPerBay; l++) {
      const z = l * stepH;
      // Front beam (Gold)
      const fb1 = project(0, -1, z-6), fb2 = project(rackWidth, -1, z-6), fb3 = project(rackWidth, -1, z), fb4 = project(0, -1, z);
      const fbt = project(0, -3, z), fbt2 = project(rackWidth, -3, z), fbt3 = project(rackWidth, -1, z), fbt4 = project(0, -1, z);
      elements.push(<polygon key={`fb-${l}`} points={`${fb1} ${fb2} ${fb3} ${fb4}`} fill={gold} stroke="#d4a017" strokeWidth="0.5" />);
      elements.push(<polygon key={`fbt-${l}`} points={`${fbt} ${fbt2} ${fbt3} ${fbt4}`} fill="#f1c40f" />); // Top of beam highlight

      // Back beam (Gold)
      const rb1 = project(0, rackDepth+1, z-6), rb2 = project(rackWidth, rackDepth+1, z-6), rb3 = project(rackWidth, rackDepth+1, z), rb4 = project(0, rackDepth+1, z);
      elements.push(<polygon key={`rb-${l}`} points={`${rb1} ${rb2} ${rb3} ${rb4}`} fill="#b88a1a" />); // Darker gold for back

      // Shelf surfaces (light gray)
      const s1 = project(0, 0, z), s2 = project(rackWidth, 0, z), s3 = project(rackWidth, rackDepth, z), s4 = project(0, rackDepth, z);
      elements.push(<polygon key={`shelf-${l}`} points={`${s1} ${s2} ${s3} ${s4}`} fill="#ecf0f1" opacity="0.6" />);

      // Representative labels
      const lp = project(rackWidth / 2, -2, z-3);
      elements.push(<text key={`tl-${l}`} x={lp[0]} y={lp[1]} textAnchor="middle" fontSize="8" fontWeight="bold" fill={navy}>L{pad(l)}</text>);
    }

    // Safety side bracing (X pattern)
    for (let i = 0; i <= 1; i++) {
        const ux = i * rackWidth;
        const b1 = project(ux, 0, 0), b2 = project(ux, rackDepth, stepH);
        const b3 = project(ux, 0, stepH), b4 = project(ux, rackDepth, 0);
        elements.push(<line key={`bx1-${i}`} x1={b1[0]} y1={b1[1]} x2={b2[0]} y2={b2[1]} stroke={navy} strokeWidth="1" opacity="0.5" />);
        elements.push(<line key={`bx2-${i}`} x1={b3[0]} y1={b3[1]} x2={b4[0]} y2={b4[1]} stroke={navy} strokeWidth="1" opacity="0.5" />);
    }

    return (
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxHeight: '420px', background: '#fafbff', borderRadius: '12px', display: 'block' }}>
        {elements}
        <text x={w/2} y="30" textAnchor="middle" fontSize="16" fontWeight="bold" fill={navy} fontFamily="Cairo,sans-serif">منظر مجسم لوحدة التخزين (Isometric View)</text>
        <text x={w/2} y={h-10} textAnchor="middle" fontSize="12" fill="#7f8c8d" fontFamily="Cairo,sans-serif">تمثيل تقريبي لنظام الأرفف ثلاثي الأبعاد</text>
      </svg>
    );
  };

  const buildElevationSVG = () => {
    const { baysPerAisle, levelsPerBay, cartonsPerLevel } = state.cfg;
    const lH = 70, bW = 140, padX = 80, padY = 60;
    const svgW = baysPerAisle * bW + padX * 2;
    const svgH = levelsPerBay * lH + padY * 2;
    const navy = "#1a2b4c";
    const gold = "#e8b830";
    const uprightW = 14;
    const beamH = 10;

    const occupancyColor = (pct) => {
      if (pct === 0) return "#f8f9fa";
      if (pct < 50) return "#e3f2fd";
      if (pct < 100) return "#fff3cd";
      return "#d4edda";
    };

    let bays = [], lvlLabels = [], structural = [];

    // Uprights with hole patterns
    for (let b = 0; b <= baysPerAisle; b++) {
      const x = padX + b * bW - uprightW / 2;
      structural.push(<rect key={`u-${b}`} x={x} y={padY} width={uprightW} height={levelsPerBay * lH} fill={navy} rx="2" />);
      for (let h = 0; h < levelsPerBay * lH / 10; h++) {
        structural.push(<rect key={`u-h-${b}-${h}`} x={x + 4} y={padY + h * 10 + 3} width={uprightW - 8} height={4} fill="white" opacity="0.3" />);
      }
    }

    for (let b = 0; b < baysPerAisle; b++) {
      const x = padX + b * bW + uprightW / 2;
      const beamW = bW - uprightW;
      for (let lv = 0; lv < levelsPerBay; lv++) {
        const y = padY + (levelsPerBay - 1 - lv) * lH + lH - beamH;
        // The beam itself
        structural.push(
          <g key={`beam-group-${b}-${lv}`}>
             <rect x={x} y={y} width={beamW} height={beamH} fill={gold} />
             <rect x={x} y={y + 2} width={beamW} height={2} fill="white" opacity="0.4" />
          </g>
        );

        const cellY = padY + (levelsPerBay - 1 - lv) * lH;
        const cellFill = occupancyColor(unit.fillPct);
        bays.push(
          <rect key={`cell-${b}-${lv}`} x={x} y={cellY} width={beamW} height={lH - beamH} fill={cellFill} opacity="0.7" />
        );

        // Visual indicator of boxes
        const boxSize = 12;
        const boxesRow = Math.min(cartonsPerLevel, 4);
        for(let i=0; i<boxesRow; i++) {
           bays.push(<rect key={`box-${b}-${lv}-${i}`} x={x + 10 + i*(boxSize+5)} y={cellY + lH - beamH - boxSize - 5} width={boxSize} height={boxSize} fill={navy} opacity="0.2" rx="2" />);
        }

        bays.push(
          <text key={`txt-${b}-${lv}`} x={x + beamW / 2} y={cellY + lH / 2} fontSize="12" textAnchor="middle" fill={navy} fontWeight="bold" fontFamily="Cairo,sans-serif">
            LVL{pad(lv + 1)} · {cartonsPerLevel} CTN
          </text>
        );
      }
      bays.push(
        <text key={`blbl-${b}`} x={padX + b * bW + bW / 2} y={padY - 25} fontSize="14" textAnchor="middle" fill={navy} fontWeight="black" fontFamily="monospace">
          BAY {pad(b + 1)}
        </text>
      );
    }

    for (let lv = 0; lv < levelsPerBay; lv++) {
      const y = padY + (levelsPerBay - 1 - lv) * lH + lH / 2;
      lvlLabels.push(
        <text key={`lvl-${lv}`} x={padX - 25} y={y} fontSize="14" textAnchor="end" fill={navy} fontWeight="black" fontFamily="monospace">
          L{pad(lv + 1)}
        </text>
      );
    }

    return (
      <div className="rack-container" style={{ overflowX: 'auto', paddingBottom: '15px' }}>
        <svg viewBox={`0 0 ${svgW} ${svgH + 50}`} width={Math.max(svgW, 800)} height={svgH + 50} style={{ background: '#fafbff', borderRadius: '12px', display: 'block' }}>
          <rect x="0" y={padY + levelsPerBay * lH} width={svgW} height="12" fill="#7f8c8d" />
          <text x={padX} y={padY + levelsPerBay * lH + 35} fontSize="13" fill="#34495e" fontWeight="bold" fontFamily="Cairo,sans-serif">
            ⚙️ مقطع رأسي لنظام الأرفف | يوضح التفاصيل الإنشائية لليسار (L) - اليمين (R) مطابق
          </text>
          <line x1={svgW - 50} y1={padY} x2={svgW - 50} y2={padY + levelsPerBay * lH} stroke={gold} strokeWidth="3" markerStart="url(#arrowhead)" markerEnd="url(#arrowhead)" />
          <text x={svgW - 15} y={padY + (levelsPerBay * lH) / 2} textAnchor="middle" fontSize="13" fontWeight="black" transform={`rotate(90, ${svgW - 15}, ${padY + (levelsPerBay * lH) / 2})`}>
            MAX HEIGHT: 5.2M
          </text>
          {bays}
          {structural}
          {lvlLabels}
        </svg>
      </div>
    );
  };

  const buildAddressTable = () => {
    const { baysPerAisle, levelsPerBay } = state.cfg;
    let rows = [];
    const term = state.searchTerm.toLowerCase();

    // Search across ALL units
    state.units.forEach(u => {
      const uName = u.name.toLowerCase();
      const uCat = catObj(u.category).label.toLowerCase();

      for (const aisle of ['L', 'R']) {
        for (let b = 1; b <= baysPerAisle; b++) {
          for (let lv = levelsPerBay; lv >= 1; lv--) {
            const code = addrCode(u.id, aisle, b, lv);
            const aisleText = aisle === 'L' ? 'يسار (L)' : 'يمين (R)';
            const lvDesc = lv === 1 ? 'الأرضية' : lv === levelsPerBay ? 'القمة' : `مستوى ${lv}`;

            const matches = !term ||
                           code.toLowerCase().includes(term) ||
                           aisleText.toLowerCase().includes(term) ||
                           String(b).includes(term) ||
                           lvDesc.toLowerCase().includes(term) ||
                           uName.includes(term) ||
                           uCat.includes(term);

            if (matches) {
              rows.push(
                <tr key={`${u.id}-${aisle}-${b}-${lv}`}>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #dde3ec' }}>
                    <span style={{ fontSize: '10px', color: '#7f8c8d', display: 'block' }}>{u.name}</span>
                    <span className="addr-code" style={{ fontFamily: 'monospace', background: '#1a2b4c', color: '#e8b830', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
                      {code}
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #dde3ec' }}>{aisleText}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #dde3ec' }}>{b}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #dde3ec' }}>{lv} – {lvDesc}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #dde3ec' }}>
                     <span className={`cat-tag ${catObj(u.category).cls}`} style={{ fontSize: '10px' }}>{catObj(u.category).label}</span>
                  </td>
                </tr>
              );
            }
            // Limit search results for performance
            if (rows.length >= 200) return;
          }
          if (rows.length >= 200) return;
        }
        if (rows.length >= 200) return;
      }
    });

    return (
      <>
        <div style={{ marginBottom: '10px', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type="text"
              placeholder="بحث شامل (وحدة، فئة، ممر، مستوى، كود)..."
              value={state.searchTerm}
              onChange={(e) => setState(p => ({...p, searchTerm: e.target.value}))}
              style={{ width: '100%', padding: '10px 12px', border: '2px solid #1a2b4c', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
            />
            {state.searchTerm && (
              <button
                onClick={() => setState(p => ({...p, searchTerm: ''}))}
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#999' }}
              >✕</button>
            )}
          </div>
          <span style={{ fontSize: '13px', color: '#1a2b4c', fontWeight: 'bold' }}>
            {term ? `تم العثور على ${rows.length} موقع` : `عرض أول 100 موقع من ${fmt(state.units.length * 2 * baysPerAisle * levelsPerBay)}`}
          </span>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: '450px', overflowY: 'auto', border: '1px solid #dde3ec', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#1a2b4c', color: 'white', position: 'sticky', top: 0, zIndex: 1 }}>
                <th style={{ padding: '12px 10px', textAlign: 'right', fontSize: '12px' }}>كود الموقع / الوحدة</th>
                <th style={{ padding: '12px 10px', textAlign: 'right', fontSize: '12px' }}>الممر</th>
                <th style={{ padding: '12px 10px', textAlign: 'right', fontSize: '12px' }}>الباي</th>
                <th style={{ padding: '12px 10px', textAlign: 'right', fontSize: '12px' }}>المستوى</th>
                <th style={{ padding: '12px 10px', textAlign: 'right', fontSize: '12px' }}>الفئة</th>
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? rows : (
                <tr>
                  <td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: '#999' }}>لا توجد نتائج تطابق البحث</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="addr-legend" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '14px' }}>
          <div className="legend-item" style={{ background: '#1a2b4c', color: 'white', borderRadius: '8px', padding: '8px 14px', fontSize: '12px' }}><strong>UU</strong> رقم الوحدة (01-19)</div>
          <div className="legend-item" style={{ background: '#1a2b4c', color: 'white', borderRadius: '8px', padding: '8px 14px', fontSize: '12px' }}><strong>A</strong> الممر: L=يسار / R=يمين</div>
          <div className="legend-item" style={{ background: '#1a2b4c', color: 'white', borderRadius: '8px', padding: '8px 14px', fontSize: '12px' }}><strong>BB</strong> رقم الباي</div>
          <div className="legend-item" style={{ background: '#1a2b4c', color: 'white', borderRadius: '8px', padding: '8px 14px', fontSize: '12px' }}><strong>LL</strong> المستوى</div>
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
    <div className="container" style={{ maxWidth: '1500px', margin: 'auto', padding: '20px', fontFamily: 'Cairo, sans-serif', position: 'relative' }}>
      {state.showToast && (
        <div style={{ position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: '#27ae60', color: 'white', padding: '10px 20px', borderRadius: '8px', zIndex: 1000, fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          💾 تم الحفظ
        </div>
      )}
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
        .tab-btn { padding: 6px 14px; border: 1px solid #dde3ec; border-radius: 8px; cursor: pointer; background: white; font-family: 'Cairo', sans-serif; font-size: 13px; font-weight: 600; transition: all .2s; }
        .tab-btn.active { background: #1a2b4c; color: white; border-color: #1a2b4c; }
        .unit-btn { position: relative; padding: 10px 6px; border: 1px solid #dde3ec; border-radius: 10px; text-align: center; cursor: pointer; background: white; transition: all .2s; font-family: 'Cairo', sans-serif; font-size: 12px; overflow: hidden; }
        .unit-btn.active { background: #f0f4f8; color: #1a2b4c; border-color: #1a2b4c; border-width: 2px; }
        .unit-btn:hover .tooltip { visibility: visible; opacity: 1; }
        .tooltip { visibility: hidden; width: 140px; background-color: #1a2b4c; color: #fff; text-align: center; border-radius: 6px; padding: 5px; position: absolute; z-index: 10; bottom: 125%; left: 50%; margin-left: -70px; opacity: 0; transition: opacity 0.3s; font-size: 10px; pointer-events: none; }
        .tooltip::after { content: ""; position: absolute; top: 100%; left: 50%; margin-left: -5px; border-width: 5px; border-style: solid; border-color: #1a2b4c transparent transparent transparent; }
        .fill-bar { position: absolute; bottom: 0; left: 0; height: 4px; background: #e8b830; transition: width 0.3s; }

        @media print {
          .no-print, .tab-btn, button, input, select, .header button { display: none !important; }
          body { background: white !important; color: black !important; }
          .container { width: 100% !important; max-width: none !important; padding: 0 !important; margin: 0 !important; }
          .card { box-shadow: none !important; border: 1px solid #eee !important; margin-bottom: 10px !important; break-inside: avoid; }
          .grid-2, .grid-4, .grid-3 { display: block !important; }
          .kpi { border: 1px solid #1a2b4c !important; color: black !important; background: white !important; margin-bottom: 10px !important; }
          .kpi .val { color: #1a2b4c !important; }
          .header { background: white !important; color: black !important; border: 2px solid #1a2b4c !important; }
          .header p { color: #555 !important; }
          .cat-tag { border: 1px solid #ccc !important; background: white !important; color: black !important; }
          svg { border: 1px solid #eee !important; background: white !important; }
          text { fill: black !important; }
          .addr-code { background: #eee !important; color: black !important; border: 1px solid #ccc !important; }
          th { background: #eee !important; color: black !important; }
          tr { break-inside: avoid; }
          .unit-grid { display: grid !important; grid-template-columns: repeat(5, 1fr) !important; }
          .unit-btn { border: 1px solid #ccc !important; color: black !important; }
        }
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
            {state.units.map((u2) => {
              const uCat = catObj(u2.category);
              const uStatus = statusObj(u2.status);
              return (
                <button
                  key={u2.id}
                  className={`unit-btn ${u2.id === state.selected ? 'active' : ''}`}
                  style={{ borderLeft: `4px solid ${uCat.cls === 'cat-face' ? '#9b59b6' : uCat.cls === 'cat-body' ? '#2980b9' : uCat.cls === 'cat-hair' ? '#e67e22' : uCat.cls === 'cat-makeup' ? '#e91e63' : uCat.cls === 'cat-perfume' ? '#27ae60' : uCat.cls === 'cat-sun' ? '#f39c12' : uCat.cls === 'cat-baby' ? '#03a9f4' : '#555'}` }}
                  onClick={() => setState((p) => ({ ...p, selected: u2.id }))}
                >
                  <div className="tooltip">
                    {u2.name}<br/>{uCat.label}<br/>إشغال: {u2.fillPct}%
                  </div>
                  <div className="u-id" style={{ fontWeight: 700, fontSize: '14px' }}>{pad(u2.id)}</div>
                  <div className="u-st" style={{ fontSize: 10, marginTop: 2, opacity: 0.75 }}>{uStatus.label}</div>
                  <div className="fill-bar" style={{ width: `${u2.fillPct}%` }}></div>
                </button>
              );
            })}
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
            <button className={`tab-btn ${state.view === 'iso' ? 'active' : ''}`} onClick={() => setState((p) => ({ ...p, view: 'iso' }))}>منظر مجسم</button>
            <button className={`tab-btn ${state.view === 'address' ? 'active' : ''}`} onClick={() => setState((p) => ({ ...p, view: 'address' }))}>جدول العناوين</button>
          </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="tab-btn" style={{ background: '#27ae60', color: 'white' }} onClick={copyTableToTSV}>📋 نسخ العناوين</button>
          <button className="tab-btn" style={{ background: '#2980b9', color: 'white' }} onClick={exportToExcel}>📊 تصدير Excel</button>
        </div>
        </div>
        <div style={{ display: 'flex', gap: '14px', marginBottom: '14px', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><label style={{ fontSize: '12px', fontWeight: 600 }}>بايات / ممر</label><input type="number" min="1" max="20" value={state.cfg.baysPerAisle} style={{ width: '80px', padding: '7px', border: '1px solid #dde3ec' }} onChange={(e) => updateCfg('baysPerAisle', e.target.value)} /></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><label style={{ fontSize: '12px', fontWeight: 600 }}>مستويات / باي</label><input type="number" min="1" max="8" value={state.cfg.levelsPerBay} style={{ width: '80px', padding: '7px', border: '1px solid #dde3ec' }} onChange={(e) => updateCfg('levelsPerBay', e.target.value)} /></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><label style={{ fontSize: '12px', fontWeight: 600 }}>صناديق / مستوى</label><input type="number" min="1" max="20" value={state.cfg.cartonsPerLevel} style={{ width: '80px', padding: '7px', border: '1px solid #dde3ec' }} onChange={(e) => updateCfg('cartonsPerLevel', e.target.value)} /></div>
        </div>
        <div className="svg-wrap" style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #dde3ec' }}>
          {state.view === 'plan' ? buildPlanSVG() : state.view === 'elevation' ? buildElevationSVG() : state.view === 'iso' ? buildIsometricSVG() : buildAddressTable()}
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
