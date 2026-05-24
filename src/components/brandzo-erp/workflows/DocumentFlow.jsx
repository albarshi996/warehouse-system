import { useState, useEffect } from 'react';
import { DOCUMENT_STAGES } from './documentFlowData';

/**
 * Document-cycle pipeline visualisation. Renders the eight stages of
 * the warehouse document lifecycle as numbered cards connected by an
 * animated arrow gradient. Hovering or focusing a stage highlights it
 * and surfaces the description; clicking opens the linked forms in the
 * detail panel below.
 *
 * Layout:
 *   - md+: horizontal scroll-snap row, with arrows between cards.
 *   - sm:  vertical stack (timeline rail with the arrows pointing down).
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

function StageArrow({ direction = 'right', active = false }) {
  // Animated arrow connector between stages. A subtle scaleX animation
  // pulses the brand-red gradient when the neighbouring stage is hovered.
  const cls = active ? 'opacity-100 scale-x-110' : 'opacity-60';
  if (direction === 'down') {
    return (
      <div
        aria-hidden
        className={`hidden md:hidden flex justify-center items-center transition-all duration-300 ${cls}`}
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
  return (
    <button
      type="button"
      onClick={() => onSelect(stage.id)}
      onMouseEnter={() => onHover(stage.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(stage.id)}
      onBlur={() => onHover(null)}
      className={[
        'relative shrink-0 w-[260px] sm:w-[280px] text-right rounded-2xl border-2 p-4 transition-all duration-200',
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
      {/* Stage number ribbon */}
      <div className="flex items-start justify-between mb-3">
        <span
          className={[
            'inline-flex items-center justify-center w-11 h-11 rounded-xl text-xl shadow-inner',
            c.softBg,
          ].join(' ')}
        >
          {stage.icon}
        </span>
        <div className="flex flex-col items-start text-left">
          <span className={['text-[10px] font-bold tracking-widest uppercase', c.text].join(' ')}>
            STAGE
          </span>
          <span className="text-2xl font-black tracking-tight">{stage.num}</span>
        </div>
      </div>

      <div className="font-bold leading-tight text-base">{stage.titleAr}</div>
      <div className="text-[11px] text-slate-300 mt-0.5 leading-tight">{stage.titleEn}</div>
      <div
        className={[
          'inline-block mt-2 text-[10px] font-bold tracking-wide rounded-full px-2 py-0.5',
          c.softBg,
          c.softText,
        ].join(' ')}
      >
        {stage.phaseAr}
      </div>

      {/* Description appears on hover/focus on desktop, always visible
          on small screens where there is room to breathe. */}
      <p
        className={[
          'mt-3 text-[12px] leading-relaxed text-slate-200 transition-all duration-200',
          highlight ? 'opacity-100' : 'md:opacity-70',
        ].join(' ')}
      >
        {stage.descAr}
      </p>

      {/* Mobile-only down arrow between stages. */}
      {index < DOCUMENT_STAGES.length - 1 && (
        <div className="md:hidden flex justify-center items-center mt-3 -mb-1" aria-hidden>
          <div className="w-1 h-5 bg-gradient-to-b from-brand-red to-brand-yellow rounded-full" />
          <span className="text-brand-red text-base ms-1">▼</span>
        </div>
      )}
    </button>
  );
}

function DetailPanel({ stage, base }) {
  if (!stage) return null;
  const c = ACCENT[stage.accent] || ACCENT.navy;
  return (
    <div
      className={['mt-6 rounded-2xl border-2 bg-white/5 p-5 sm:p-6 shadow-lg', c.border].join(' ')}
      dir="rtl"
    >
      <div className="flex items-start gap-3 mb-3">
        <span
          className={[
            'shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl',
            c.softBg,
          ].join(' ')}
        >
          {stage.icon}
        </span>
        <div>
          <div className="font-bold text-gray-200 text-lg sm:text-xl">
            {stage.num} · {stage.titleAr}
          </div>
          <div className="text-xs sm:text-sm text-gray-200">{stage.titleEn}</div>
        </div>
      </div>
      <p className="text-sm text-gray-200 leading-relaxed mb-4">{stage.descAr}</p>

      {stage.forms.length > 0 ? (
        <div>
          <div
            className={[
              'text-sm font-bold mb-2',
              c.text === 'text-slate-200' ? 'text-brand-navy' : c.text,
            ].join(' ')}
          >
            النماذج المرتبطة بهذه المرحلة
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {stage.forms.map((f) => (
              <li key={f.file}>
                <a
                  href={`${base}/forms/${encodeURI(f.file)}`}
                  target="_blank"
                  rel="noreferrer"
                  className={[
                    'flex items-center justify-between gap-2 px-3 py-2 rounded-lg border transition-colors',
                    'border-white/10 hover:border-brand-red hover:bg-brand-red/5',
                    'text-sm text-gray-200 hover:text-brand-red font-medium',
                  ].join(' ')}
                >
                  <span>{f.titleAr}</span>
                  <span className="text-[11px] text-gray-200 group-hover:text-brand-red">↗</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-gray-200 italic">
          هذه المرحلة لا يوجد لها نموذج مطبوع داخل المنظومة (يتم تبادلها إلكترونياً مع المورد).
        </p>
      )}
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

export default function DocumentFlow({ base = '' }) {
  const [activeId, setActiveId] = useState(DOCUMENT_STAGES[3].id); // start on GRN — the heart of the cycle
  const [hoveredId, setHoveredId] = useState(null);
  const [activeRole, setActiveRole] = useState('all');

  // Handle Hash Routing
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && DOCUMENT_STAGES.some((s) => s.id === hash)) {
        setActiveId(hash);
        // Scroll the active stage into view if needed
        const el = document.getElementById(`stage-${hash}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    };

    window.addEventListener('hashchange', handleHash);
    handleHash(); // Initial check
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const handleSelect = (id) => {
    window.location.hash = id;
    setActiveId(id);
  };

  const activeStage = DOCUMENT_STAGES.find((s) => s.id === activeId) || DOCUMENT_STAGES[0];
  const roleData = ROLES.find((r) => r.id === activeRole);

  return (
    <section
      className="bg-white/5 rounded-2xl p-4 sm:p-6 lg:p-8 border border-white/10"
      dir="rtl"
    >
      <header className="mb-5 sm:mb-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-red text-white text-lg shadow-md">
              🔄
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              الدورة المستندية الكاملة
            </h2>
          </div>
          <p className="text-sm text-gray-200 leading-relaxed">
            مراحل دورة المستودع الثماني — من طلب الشراء حتى المرتجعات. مرّر أو اضغط على أي مرحلة لعرض
            وصفها والنماذج التشغيلية المرتبطة بها.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 bg-white/5 p-2 rounded-xl border border-white/10 w-full lg:w-auto justify-center lg:justify-start">
          <span className="text-xs font-bold text-gray-200 px-2 w-full lg:w-auto text-center lg:text-right mb-1 lg:mb-0">عرض حسب الدور:</span>
          {ROLES.map((role) => (
            <button
              key={role.id}
              onClick={() => setActiveRole(role.id)}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                activeRole === role.id
                  ? 'bg-brand-navy text-white shadow-md'
                  : 'text-gray-200 hover:bg-white/10',
              ].join(' ')}
            >
              <span>{role.icon}</span>
              <span>{role.label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Pipeline. Horizontal scroll on md+, vertical stack on smaller. */}
      <div
        className="flex flex-col md:flex-row md:items-stretch md:flex-row-reverse gap-3 md:gap-0 md:overflow-x-auto md:pb-2 -mx-1 px-1"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {DOCUMENT_STAGES.map((stage, i) => (
          <div
            key={stage.id}
            id={`stage-${stage.id}`}
            className="md:flex md:items-center"
            style={{ scrollSnapAlign: 'start' }}
          >
            <StageCard
              stage={stage}
              index={i}
              active={activeId === stage.id}
              hovered={hoveredId === stage.id}
              dimmed={!roleData.stages.includes(stage.id)}
              onSelect={handleSelect}
              onHover={setHoveredId}
            />
            {i < DOCUMENT_STAGES.length - 1 && (
              <StageArrow
                active={hoveredId === stage.id || hoveredId === DOCUMENT_STAGES[i + 1].id}
              />
            )}
          </div>
        ))}
      </div>

      <DetailPanel stage={activeStage} base={base} />
    </section>
  );
}
