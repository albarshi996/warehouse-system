import { useState, useEffect } from 'react';
import { DOCUMENT_STAGES } from './documentFlowData';

/**
 * Enhanced Document-cycle pipeline with Odoo integration layer.
 * Renders eight stages of warehouse document lifecycle with interactive
 * Odoo mapping cards showing implementation paths and activation steps.
 *
 * Layout:
 *   - md+: horizontal scroll-snap row, with arrows between cards.
 *   - sm: vertical stack (timeline rail with arrows pointing down).
 */

const ACCENT = {
  red: {
    border: 'border-brand-red',
    ring: 'ring-brand-red',
    text: 'text-brand-red',
    bg: 'bg-brand-red',
    softBg: 'bg-brand-red/10',
    softText: 'text-brand-red',
    glow: 'shadow-[0_0_24px_rgba(192,57,43,0.4)]',
  },
  yellow: {
    border: 'border-brand-yellow',
    ring: 'ring-brand-yellow',
    text: 'text-brand-yellow',
    bg: 'bg-brand-yellow',
    softBg: 'bg-brand-yellow/15',
    softText: 'text-amber-700',
    glow: 'shadow-[0_0_24px_rgba(232,184,48,0.5)]',
  },
  navy: {
    border: 'border-slate-400',
    ring: 'ring-slate-300',
    text: 'text-slate-200',
    bg: 'bg-slate-700',
    softBg: 'bg-slate-200',
    softText: 'text-slate-700',
    glow: 'shadow-[0_4px_18px_rgba(15,23,42,0.4)]',
  },
};

// Odoo mapping data for each document stage
const ODOO_MAPPING = {
  pr: {
    module: 'Purchase',
    path: 'Purchase > Requisitions',
    activation: 'Settings > Purchase > Purchase Requisitions ✓',
    description: 'إنشاء وإدارة طلبات الشراء الداخلية تلقائياً عند وصول المخزون لنقطة إعادة الطلب',
    setupSteps: [
      'تفعيل وحدة Purchase',
      'الذهاب إلى Settings > Purchase',
      'تفعيل Purchase Requisitions',
      'إعداد قواعد إعادة الطلب التلقائي'
    ]
  },
  po: {
    module: 'Purchase',
    path: 'Purchase > Orders',
    activation: 'تلقائي مع تفعيل Purchase',
    description: 'إنشاء أوامر الشراء الرسمية المرسلة للموردين مع التكامل المباشر مع المالية',
    setupSteps: [
      'تفعيل وحدة Purchase',
      'إعداد قوائم الموردين',
      'تهيئة شروط الدفع',
      'ربط بالحسابات الذاتية'
    ]
  },
  asn: {
    module: 'Inventory',
    path: 'Inventory > Receipts > Scheduled Date',
    activation: 'يدوي - إعداد من المورد',
    description: 'استلام إشعارات الشحن المسبقة من الموردين لجدولة عمليات الاستلام',
    setupSteps: [
      'تفعيل وحدة Inventory',
      'إعدادات الاستلام المتقدمة',
      'تهيئة Scheduled Date',
      'إعداد تكامل EDI مع الموردين'
    ]
  },
  grn: {
    module: 'Inventory',
    path: 'Inventory > Receipts',
    activation: 'Inventory > Configuration > Warehouses > 3-step',
    description: 'استلام البضائع مع فحص الجودة وإدخالها إلى المخزون الرسمي',
    setupSteps: [
      'تفعيل 3-step receiving',
      'Receive > Quality Check > Store',
      'إعداد نقاط فحص الجودة',
      'تهيئة Batch Management'
    ]
  },
  putaway: {
    module: 'Inventory',
    path: 'Inventory > Configuration > Putaway Rules',
    activation: 'Settings > Inventory > Storage Locations ✓',
    description: 'توجيه الأصناف من منطقة الاستلام إلى مواقع التخزين المثلى تلقائياً',
    setupSteps: [
      'تفعيل Storage Locations',
      'إنشاء هيكل المواقع الهرمي',
      'إعداد Putaway Rules',
      'تهيئة استراتيجيات FEFO'
    ]
  },
  picking: {
    module: 'Inventory',
    path: 'Inventory > Operations > Transfers (type: Pick)',
    activation: '3-step outgoing',
    description: 'سحب الأصناف من المواقع التخزينية بناءً على طلبات العملاء',
    setupSteps: [
      'تفعيل 3-step shipping',
      'Pick > Pack > Ship',
      'إعداد أنواع العمليات',
      'تهيئة قوائم السحب'
    ]
  },
  dispatch: {
    module: 'Inventory',
    path: 'Inventory > Operations > Delivery Orders',
    activation: 'ربط Fleet إن وُجد',
    description: 'إصدار أوامر التسليم وتحميل البضائع على شاحنات الأسطول',
    setupSteps: [
      'تفعيل Delivery Orders',
      'إعداد Fleet Management (اختياري)',
      'تهيئة Gate Pass',
      'ربط أنظمة التتبع'
    ]
  },
  returns: {
    module: 'Inventory',
    path: 'Inventory > Operations > Returns',
    activation: 'إنشاء Return من Delivery',
    description: 'استلام المرتجعات من الفروع وتصنيفها ومعالجة سندات التسوية',
    setupSteps: [
      'تفعيل Returns Management',
      'إعداد أسباب الإرجاع',
      'تهيئة Credit Notes',
      'ربط بالحسابات الدائنة'
    ]
  }
};

function StageArrow({ direction = 'right', active = false }) {
  const cls = active ? 'opacity-100 scale-x-110' : 'opacity-60';
  if (direction === 'down') {
    return (
      <div
        aria-hidden
        className={`hidden md:flex justify-center items-center transition-all duration-300 ${cls}`}
      >
        <div className="w-1 h-6 bg-gradient-to-b from-brand-red via-brand-red/70 to-brand-yellow rounded-full" />
        <span className="text-brand-red text-xl">▾</span>
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className={`shrink-0 hidden md:flex items-center justify-center transition-all duration-300 ${cls}`}
      style={{ width: 48 }}
    >
      <div className="relative w-full h-1 bg-gradient-to-l from-brand-red via-brand-red/70 to-brand-yellow rounded-full">
        <span className="absolute inset-y-0 -left-1 flex items-center text-brand-red text-lg">
          ◀
        </span>
      </div>
    </div>
  );
}

function StageCard({ stage, index, active, hovered, dimmed, onSelect, onHover }) {
  const c = ACCENT[stage.accent] || ACCENT.navy;
  const highlight = active || hovered;
  const odooData = ODOO_MAPPING[stage.id];
  
  return (
    <button
      type="button"
      onClick={() => onSelect(stage.id)}
      onMouseEnter={() => onHover(stage.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(stage.id)}
      onBlur={() => onHover(null)}
      className={[
        'relative shrink-0 w-[280px] sm:w-[300px] text-right rounded-2xl border-2 p-4 transition-all duration-200',
        'bg-gradient-to-br from-brand-navy to-[#0f0f1f] text-white',
        c.border,
        highlight
          ? `${c.glow} -translate-y-1 ring-2 ring-offset-2 ring-offset-slate-100 ${c.ring}`
          : 'hover:-translate-y-0.5',
        dimmed ? 'opacity-40 grayscale-[0.5] scale-[0.95]' : 'opacity-100',
        'cursor-pointer',
      ].join(' ')}
      aria-pressed={active}
      aria-label={`${stage.titleAr} — ${stage.titleEn}`}
    >
      {/* Stage number ribbon with Odoo indicator */}
      <div className="flex items-start justify-between mb-3">
        <span
          className={[
            'inline-flex items-center justify-center w-12 h-12 rounded-xl text-xl shadow-inner relative',
            c.softBg,
          ].join(' ')}
        >
          {stage.icon}
          {/* Odoo indicator dot */}
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white" title="متوفر في أودو" />
        </span>
        <div className="flex flex-col items-start text-left">
          <span className={`text-[9px] font-bold tracking-widest uppercase ${c.text}`}>
            STAGE
          </span>
          <span className="text-2xl font-black tracking-tight">{stage.num}</span>
        </div>
      </div>

      <div className="font-bold leading-tight text-base">{stage.titleAr}</div>
      <div className="text-[10px] text-slate-300 mt-0.5 leading-tight">{stage.titleEn}</div>
      <div
        className={[
          'inline-block mt-2 text-[10px] font-bold tracking-wide rounded-full px-2 py-0.5',
          c.softBg,
          c.softText,
        ].join(' ')}
      >
        {stage.phaseAr}
      </div>

      {/* Enhanced description with Odoo hint */}
      <p
        className={[
          'mt-3 text-[11px] leading-relaxed text-slate-200 transition-all duration-200',
          highlight ? 'opacity-100' : 'md:opacity-70',
        ].join(' ')}
      >
        {stage.descAr}
      </p>

      {/* Odoo module indicator */}
      <div className="absolute top-2 left-2 bg-green-600 text-white text-[8px] px-2 py-1 rounded-full font-bold">
        ODOO
      </div>

      {/* Mobile-only down arrow between stages */}
      {index < DOCUMENT_STAGES.length - 1 && (
        <div className="md:hidden flex justify-center items-center mt-3 -mb-1" aria-hidden>
          <div className="w-1 h-5 bg-gradient-to-b via-brand-red/70 to-brand-yellow rounded-full" />
          <span className="text-brand-red text-base ms-1">▼</span>
        </div>
      )}
    </button>
  );
}

function DetailPanel({ stage, base }) {
  if (!stage) return null;
  const c = ACCENT[stage.accent] || ACCENT.navy;
  const odooData = ODOO_MAPPING[stage.id];
  
  return (
    <div
      className={`mt-6 rounded-2xl border-2 bg-white/5 p-5 sm:p-6 shadow-lg ${c.border}`}
      dir="rtl"
    >
      <div className="flex items-start gap-3 mb-4">
        <span
          className={[
            'shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl relative',
            c.softBg,
          ].join(' ')}
        >
          {stage.icon}
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
        </span>
        <div>
          <div className="font-bold text-gray-200 text-lg sm:text-xl">
            {stage.num} · {stage.titleAr}
          </div>
          <div className="text-xs sm:text-sm text-gray-400">{stage.titleEn}</div>
        </div>
      </div>
      
      <p className="text-sm text-gray-200 leading-relaxed mb-4">{stage.descAr}</p>

      {/* Odoo Integration Section */}
      <div className="bg-gradient-to-r from-green-900/20 to-blue-900/20 to-green-900/20 rounded-xl p-4 mb-4 border border-green-500/30">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-green-400 text-xl">✦</span>
          <h3 className="font-bold text-green-400 text-lg">في أودو</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-gray-400 mb-1">الوحدة المقابلة</div>
            <div className="font-bold text-white">{odooData.module}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">المسار للوصول</div>
            <div className="font-bold text-blue-300">{odooData.path}</div>
          </div>
        </div>
        
        <div className="mt-3">
          <div className="text-xs text-gray-400 mb-1">مسار التفعيل</div>
          <div className="font-mono text-sm text-yellow-300 bg-black/30 rounded px-2 py-1">
            {odooData.activation}
          </div>
        </div>
        
        <div className="mt-3">
          <div className="text-xs text-gray-400 mb-2">الوصف</div>
          <p className="text-sm text-gray-300 leading-relaxed">{odooData.description}</p>
        </div>
      </div>

      {/* Setup Steps */}
      <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-500/30">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-blue-400 text-xl">⚙️</span>
          <h3 className="font-bold text-blue-400 text-lg">خطوات الإعداد</h3>
        </div>
        <ol className="space-y-2">
          {odooData.setupSteps.map((step, index) => (
            <li key={index} className="flex items-start gap-2 text-sm text-gray-300">
              <span className="shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold mt-0.5">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Original Forms Section */}
      {stage.forms.length > 0 && (
        <div className="mt-4">
          <div className={`text-sm font-bold mb-2 ${c.text === 'text-slate-200' ? 'text-brand-navy' : c.text}`}>
            النماذج المرتبطة بهذه المرحلة
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {stage.forms.map((f) => (
              <li key={f.file}>
                <a
                  href={`${base}/forms/${encodeURI(f.file)}`}
                  target="_blank"
                  rel="noreferrer"
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border transition-colors border-white/10 hover:border-brand-red hover:bg-brand-red/5 text-sm text-gray-200 hover:text-brand-red font-medium`}
                >
                  <span>{f.titleAr}</span>
                  <span className="text-[11px] text-gray-400 group-hover:text-brand-red">↗</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {stage.forms.length === 0 && (
        <p className="text-sm text-gray-400 italic">
          هذه المرحلة لا يوجد لها نموذج مطبوع داخل التوثيق (يتم تبادلها إلكترونياً مع المورد).
        </p>
      )}
      
      {/* Learn More Button */}
      <div className="mt-4 text-center">
        <button
          className="bg-brand-red hover:bg-brand-red/80 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors"
          onClick={() => {
            // This would open detailed setup modal in real implementation
            alert(`سيتم فتح قسم الإعداد التفصيلي لـ ${stage.titleAr}`);
          }}
        >
          اعرف أكثر
        </button>
      </div>
    </div>
  );
}

const ROLES = [
  { id: 'all', label: 'الكل', icon: '👥', stages: ['pr', 'po', 'asn', 'grn', 'putaway', 'picking', 'dispatch', 'returns'] },
  { id: 'procurement', label: 'المشتريات', icon: '💰', stages: ['pr', 'po', 'asn', 'grn', 'returns'] },
  { id: 'warehouse', label: 'أمين المستودع', icon: '🔑', stages: ['grn', 'putaway', 'picking', 'dispatch', 'returns'] },
  { id: 'qc', label: 'مراقب الجودة', icon: '🔬', stages: ['grn', 'returns'] },
  { id: 'finance', label: 'المالية', icon: '📊', stages: ['po', 'grn', 'returns'] },
];

export default function DocumentCycleOdoo({ base = '' }) {
  const [activeId, setActiveId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [selectedRole, setSelectedRole] = useState('all');

  // Filter stages based on selected role
  const filteredStages = DOCUMENT_STAGES.filter(stage => 
    selectedRole === 'all' || ROLES.find(r => r.id === selectedRole)?.stages.includes(stage.id)
  );

  const activeStage = DOCUMENT_STAGES.find(s => s.id === activeId);

  // Close detail panel on Escape key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') setActiveId(null);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, []);

  return (
    <section className="w-full" aria-label="الدورة المستندية مع أودو">
      {/* Role Filter */}
      <div className="mb-8">
        <h2 className="text-xl sm:text-2xl font-bold text-brand-yellow mb-4 text-center">
          الدورة المستندية + أودو
        </h2>
        <div className="flex flex-wrap justify-center gap-2">
          {ROLES.map((role) => (
            <button
              key={role.id}
              onClick={() => setSelectedRole(role.id)}
              className={[
                'flex items-center gap-2 px-4 py-2 rounded-lg border transition-all duration-200',
                selectedRole === role.id
                  ? 'bg-brand-red border-brand-red text-white shadow-lg scale-105'
                  : 'border-white/20 text-gray-300 hover:border-brand-red hover:text-brand-red',
              ].join(' ')}
            >
              <span className="text-lg">{role.icon}</span>
              <span className="font-medium">{role.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Pipeline - Desktop: horizontal scroll-snap row */}
      <div className="hidden md:flex items-center justify-center gap-0 overflow-x-auto pb-4 px-4">
        {filteredStages.map((stage, index) => (
          <div key={stage.id} className="flex items-center gap-0 shrink-0">
            <StageCard
              stage={stage}
              index={index}
              active={activeId === stage.id}
              hovered={hoveredId === stage.id}
              dimmed={selectedRole !== 'all' && !ROLES.find(r => r.id === selectedRole)?.stages.includes(stage.id)}
              onSelect={setActiveId}
              onHover={setHoveredId}
            />
            {index < filteredStages.length - 1 && (
              <StageArrow active={hoveredId === stage.id || activeId === stage.id} />
            )}
          </div>
        ))}
      </div>

      {/* Pipeline - Mobile: vertical timeline */}
      <div className="md:hidden space-y-4 px-4">
        {filteredStages.map((stage, index) => (
          <div key={stage.id} className="flex flex-col items-center">
            <StageCard
              stage={stage}
              index={index}
              active={activeId === stage.id}
              hovered={hoveredId === stage.id}
              dimmed={selectedRole !== 'all' && !ROLES.find(r => r.id === selectedRole)?.stages.includes(stage.id)}
              onSelect={setActiveId}
              onHover={setHoveredId}
            />
            {index < filteredStages.length - 1 && (
              <StageArrow direction="down" active={hoveredId === stage.id || activeId === stage.id} />
            )}
          </div>
        ))}
      </div>

      {/* Detail Panel - appears below the pipeline on desktop, replaces it on mobile */}
      <div className="mt-8 px-4">
        <DetailPanel stage={activeStage} base={base} />
      </div>
    </section>
  );
}