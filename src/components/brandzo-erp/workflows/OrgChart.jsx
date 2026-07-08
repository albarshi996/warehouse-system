import { useState } from 'react';
import { orgRoot, orgPillars, orgSubDepts, supportFunctions } from './orgChartData';

/**
 * Hierarchical org chart for the warehouse operations team, Brandzo Hub 2026.
 * Renders the 3 Operational Pillars and Support Functions.
 */
const ACCENT_CLASSES = {
  red: {
    border: 'border-brand-red',
    ring: 'ring-brand-red',
    text: 'text-brand-red',
    bg: 'bg-brand-red',
    glow: 'shadow-[0_0_24px_rgba(196, 30, 58,0.35)]',
    pillBg: 'bg-brand-red/15',
    pillText: 'text-brand-red',
  },
  yellow: {
    border: 'border-brand-yellow',
    ring: 'ring-brand-yellow',
    text: 'text-brand-yellow',
    bg: 'bg-brand-yellow',
    glow: 'shadow-[0_0_24px_rgba(218, 170, 60,0.35)]',
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
        <div className="relative">
          <span
            aria-hidden
            className={[
              'shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-lg flex items-center justify-center text-xl shadow-inner',
              colors.pillBg,
            ].join(' ')}
          >
            {node.emoji}
          </span>
          {node.isOccupied && (
            <span
              className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-[#1a1a2e] flex items-center justify-center"
              title="يوجد من يشغلها حالياً"
            >
              <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0 text-right">
          <div
            className={[
              'font-bold leading-tight',
              size === 'lg' ? 'text-base sm:text-lg' : 'text-sm sm:text-[15px]',
            ].join(' ')}
          >
            {node.titleAr}
            {node.isOccupied && (
              <span className="mr-2 text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded border border-green-500/30 font-medium">
                يشغلها موظف
              </span>
            )}
          </div>
          <div className="text-[11px] sm:text-xs text-slate-200 mt-0.5 leading-tight">
            {node.titleEn}
          </div>
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
      <div className="flex items-start gap-3 mb-4">
        <span
          className={[
            'shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl relative',
            colors.pillBg,
          ].join(' ')}
        >
          {node.emoji}
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white" title="دور أودو معرف" />
        </span>
        <div>
          <div className="font-bold text-gray-200 text-lg sm:text-xl">
            {node.titleAr}
            {node.isOccupied && (
              <span className="mr-3 text-xs bg-green-600 text-white px-2 py-0.5 rounded-full font-bold">
                يشاغرها موظف حالياً
              </span>
            )}
          </div>
          <div className="text-xs sm:text-sm text-gray-200">{node.titleEn}</div>
        </div>
      </div>
      
      <div className={['text-sm font-bold mb-2', colors.text].join(' ')}>{heading}</div>
      <ul className="space-y-1.5 text-sm text-gray-200 leading-relaxed mb-4">
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

      {node.odooRole && (
        <div className="bg-gradient-to-r from-green-900/20 to-blue-900/20 rounded-xl p-4 border border-green-500/30">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-green-400 text-xl">👤</span>
            <h3 className="font-bold text-green-400 text-lg">دور أودو</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-200 mb-1">الوظيفة في أودو</div>
              <div className="font-bold text-white">{node.odooRole}</div>
            </div>
            <div>
              <div className="text-xs text-gray-200 mb-1">الوحدات المسموح بها</div>
              <div className="font-bold text-blue-300">{node.odooAccess}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Connector({ count, color = '#c41e3a', height = 32 }) {
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
  const allNodes = [orgRoot, ...orgPillars, ...orgSubDepts, ...supportFunctions];
  const activeNode = allNodes.find((n) => n.id === activeId) || orgRoot;

  return (
    <section
      className="bg-white/5 rounded-2xl p-4 sm:p-6 lg:p-8 border border-white/10"
      dir="rtl"
    >
      <header className="mb-5 sm:mb-6 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-red text-white text-lg shadow-md">
            🏛️
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-white">
            الهيكل التنظيمي المطور — Brandzo Hub 2026
          </h2>
        </div>
        <p className="text-sm text-gray-200 leading-relaxed max-w-2xl mx-auto">
          تمت إعادة هيكلة النظام إلى 3 أعمدة تشغيلية أساسية مع فصل الوظائف المساندة لضمان الكفاءة والرقابة المستقلة.
        </p>
      </header>

      {/* Tier 1 — root */}
      <div className="flex justify-center mb-4">
        <div className="w-full max-w-md">
          <Card
            node={orgRoot}
            active={activeId === orgRoot.id}
            onClick={() => setActiveId(orgRoot.id)}
            size="lg"
          />
        </div>
      </div>

      <div className="hidden md:block">
        <Connector count={3} color="#c41e3a" height={32} />
      </div>

      {/* Tier 2 — 3 Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {orgPillars.map((pillar) => {
          const subDept = orgSubDepts.find(sd => sd.parentId === pillar.id);
          return (
            <div key={pillar.id} className="flex flex-col items-center">
              <Card
                node={pillar}
                active={activeId === pillar.id}
                onClick={() => setActiveId(pillar.id)}
              />
              {subDept && (
                <>
                  <div className="hidden md:block w-[2px] h-8 bg-slate-400/30"></div>
                  <Card
                    node={subDept}
                    active={activeId === subDept.id}
                    onClick={() => setActiveId(subDept.id)}
                    size="sm"
                  />
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Support Functions Section */}
      <div className="mt-12 pt-8 border-t border-white/10">
        <div className="text-center mb-6">
          <h3 className="text-lg font-bold text-brand-gold bg-brand-gold/10 inline-block px-4 py-1 rounded-full border border-brand-gold/20">
            الوظائف والخدمات المساندة (Support Functions)
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {supportFunctions.map((node) => (
            <Card
              key={node.id}
              node={node}
              active={activeId === node.id}
              onClick={() => setActiveId(node.id)}
              size="sm"
            />
          ))}
        </div>
      </div>

      <DetailPanel node={activeNode} />

      <div className="mt-8 bg-blue-900/20 border border-blue-500/30 p-4 rounded-xl text-right">
        <div className="font-bold text-blue-400 mb-2 flex items-center gap-2">
          <span>💡</span>
          <span>ملاحظة حول مقارنة الكادر الوظيفي:</span>
        </div>
        <p className="text-sm text-gray-200 leading-relaxed">
          مدراء الوظائف المساندة (الجودة، التجارية، المالية، التقنية، الموارد البشرية) هم
          <strong className="text-white mx-1">موظفون يعملون داخل المستودعات الفرعية</strong>،
          ويتبعون إدارياً للإدارات المركزية وتشغيلياً لإدارة العمليات في المستودع.
          هم أدوار مساندة لضمان الامتثال والرقابة — وليسوا أعمدة تشغيلية مستقلة في الميدان.
        </p>
      </div>
    </section>
  );
}
