import { useState } from 'react';
import { orgRoot, orgTier2, orgTier3 } from './orgChartData';

/**
 * Hierarchical org chart for the warehouse operations team. Renders the
 * three tiers of management as a top-down tree on desktop (with SVG
 * connectors between levels) and falls back to a vertically stacked
 * accordion on small screens. Clicking any node opens a detail panel
 * with the role's responsibilities or sub-team breakdown.
 */
const ACCENT_CLASSES = {
  red: {
    border: 'border-brand-red',
    ring: 'ring-brand-red',
    text: 'text-brand-red',
    bg: 'bg-brand-red',
    glow: 'shadow-[0_0_24px_rgba(192,57,43,0.35)]',
    pillBg: 'bg-brand-red/15',
    pillText: 'text-brand-red',
  },
  yellow: {
    border: 'border-brand-yellow',
    ring: 'ring-brand-yellow',
    text: 'text-brand-yellow',
    bg: 'bg-brand-yellow',
    glow: 'shadow-[0_0_24px_rgba(232,184,48,0.35)]',
    pillBg: 'bg-brand-yellow/20',
    pillText: 'text-brand-yellow',
  },
  navy: {
    border: 'border-slate-400/60',
    ring: 'ring-slate-300',
    text: 'text-slate-800',
    bg: 'bg-slate-700',
    glow: 'shadow-[0_4px_16px_rgba(15,23,42,0.4)]',
    pillBg: 'bg-slate-700/60',
    pillText: 'text-slate-800',
  },
};

function Card({ node, active, onClick, size = 'md' }) {
  const colors = ACCENT_CLASSES[node.accent] || ACCENT_CLASSES.navy;
  const sizeCls =
    size === 'lg'
      ? 'min-w-[220px] sm:min-w-[280px] px-5 py-4'
      : size === 'sm'
        ? 'min-w-[170px] sm:min-w-[200px] px-3 py-3'
        : 'min-w-[200px] sm:min-w-[240px] px-4 py-3.5';

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group relative w-full text-right rounded-xl border-2 transition-all duration-200',
        'bg-gradient-to-br from-brand-navy to-[#0f0f1f] text-white',
        sizeCls,
        colors.border,
        active
          ? `ring-2 ring-offset-2 ring-offset-slate-100 ${colors.ring} ${colors.glow} -translate-y-0.5`
          : `hover:-translate-y-0.5 hover:${colors.glow.replace('shadow-', 'shadow-')}`,
        'cursor-pointer',
      ].join(' ')}
      aria-pressed={active}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={[
            'shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-lg flex items-center justify-center text-xl shadow-inner',
            colors.pillBg,
          ].join(' ')}
        >
          {node.emoji}
        </span>
        <div className="flex-1 min-w-0 text-right">
          <div
            className={[
              'font-bold leading-tight',
              size === 'lg' ? 'text-base sm:text-lg' : 'text-sm sm:text-[15px]',
            ].join(' ')}
          >
            {node.titleAr}
          </div>
          <div className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-tight">
            {node.titleEn}
          </div>
          {node.headcount && (
            <span
              className={[
                'inline-block mt-2 text-[10px] sm:text-[11px] font-bold tracking-wide rounded-full px-2 py-0.5',
                colors.pillBg,
                colors.pillText,
              ].join(' ')}
            >
              {node.headcount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function DetailPanel({ node }) {
  if (!node) return null;
  const colors = ACCENT_CLASSES[node.accent] || ACCENT_CLASSES.navy;
  const items = node.teams || node.responsibilities || [];
  const heading = node.teams ? 'الفرق والوحدات داخل الإدارة' : 'المسؤوليات الرئيسية';
  return (
    <div
      className={['mt-6 rounded-2xl border-2 bg-white/5 p-5 sm:p-6 shadow-lg', colors.border].join(
        ' '
      )}
      dir="rtl"
    >
      <div className="flex items-start gap-3 mb-3">
        <span
          className={[
            'shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl',
            colors.pillBg,
          ].join(' ')}
        >
          {node.emoji}
        </span>
        <div>
          <div className="font-bold text-gray-200 text-lg sm:text-xl">{node.titleAr}</div>
          <div className="text-xs sm:text-sm text-gray-400">{node.titleEn}</div>
        </div>
      </div>
      <div className={['text-sm font-bold mb-2', colors.text].join(' ')}>{heading}</div>
      <ul className="space-y-1.5 text-sm text-gray-200 leading-relaxed">
        {items.map((line, i) => (
          <li key={i} className="flex items-start gap-2">
            <span
              className={['mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0', colors.bg].join(
                ' '
              )}
            />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * SVG connector lines between tiers. Renders as a thin vertical bar
 * from the parent down to a horizontal manifold, then short verticals
 * down to each child. Hidden on mobile in favour of vertical stacking.
 */
function Connector({ count, color = '#c0392b', height = 32 }) {
  if (!count) return null;
  return (
    <div className="hidden md:flex justify-center" aria-hidden>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        className="block"
      >
        <line x1="50" y1="0" x2="50" y2={height / 2} stroke={color} strokeWidth="2" />
        {count > 1 && (
          <line
            x1={count === 1 ? 50 : 8}
            y1={height / 2}
            x2={count === 1 ? 50 : 92}
            y2={height / 2}
            stroke={color}
            strokeWidth="2"
          />
        )}
        {Array.from({ length: count }).map((_, i) => {
          const x = count === 1 ? 50 : 8 + (i * 84) / (count - 1);
          return (
            <line
              key={i}
              x1={x}
              y1={height / 2}
              x2={x}
              y2={height}
              stroke={color}
              strokeWidth="2"
            />
          );
        })}
      </svg>
    </div>
  );
}

export default function OrgChart() {
  const [activeId, setActiveId] = useState(orgRoot.id);
  const allNodes = [orgRoot, ...orgTier2, ...orgTier3];
  const activeNode = allNodes.find((n) => n.id === activeId) || orgRoot;

  return (
    <section
      className="bg-white/5 rounded-2xl p-4 sm:p-6 lg:p-8 border border-white/10"
      dir="rtl"
    >
      <header className="mb-5 sm:mb-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-red text-white text-lg shadow-md">
            🏛️
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-white">
            الهيكل التنظيمي للمستودع الرئيسي
          </h2>
        </div>
        <p className="text-sm text-gray-400 leading-relaxed">
          الخريطة الكاملة للأدوار والمسؤوليات في مستودع Brandzo Franchise Partners الرئيسي. اضغط أي
          بطاقة لعرض المسؤوليات أو الفرق التابعة للإدارة.
        </p>
      </header>

      {/* Tier 1 — root */}
      <div className="flex justify-center">
        <div className="w-full max-w-md">
          <Card
            node={orgRoot}
            active={activeId === orgRoot.id}
            onClick={() => setActiveId(orgRoot.id)}
            size="lg"
          />
        </div>
      </div>

      <Connector count={orgTier2.length} color="#c0392b" />

      {/* Tier 2 — senior management. Single horizontal row on desktop;
          stacks vertically on mobile. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {orgTier2.map((node) => (
          <Card
            key={node.id}
            node={node}
            active={activeId === node.id}
            onClick={() => setActiveId(node.id)}
          />
        ))}
      </div>

      {/* Connector that fans out only from the Executive Manager (the
          first tier-2 node) into the operational departments. */}
      <div className="hidden lg:block">
        <Connector count={orgTier3.length} color="#e8b830" height={36} />
      </div>
      <div className="block lg:hidden mt-4 mb-2 text-center text-xs font-bold text-brand-navy/70">
        ⤓ الإدارات التشغيلية تحت إشراف المدير التنفيذي
      </div>

      {/* Tier 3 — operational departments. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        {orgTier3.map((node) => (
          <Card
            key={node.id}
            node={node}
            active={activeId === node.id}
            onClick={() => setActiveId(node.id)}
            size="sm"
          />
        ))}
      </div>

      <DetailPanel node={activeNode} />
    </section>
  );
}
