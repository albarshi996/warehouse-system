import React, { useState } from 'react';

/**
 * مركز الصلاحيات والأدوار — حاوية تفاعلية لتصميم نظام الوصول لبوابة العمليات.
 * ─────────────────────────────────────────────────────────────────────────
 * البوابة اليوم مفتوحة (بلا تسجيل دخول). هذه الصفحة تُوثّق وتُخطّط نظام الأدوار
 * القادم، مبنيةً على مجموعات الصلاحيات الحقيقية في موديول `brandzo_warehouse`:
 *   - الأدوار السبعة (+ مدير النظام)
 *   - منطق الصلاحيات: مَن يعتمد ماذا (الحرّاس الذهبية)
 *   - كيفية الدخول: تسجيل الدخول ← تحديد الدور من أودو ← عرض مخصّص
 *   - ماذا يرى كل دور في البوابة
 *
 * القاعدة الذهبية: لا حذف — صفحة ومكوّن جديدان بالكامل. الحاوية قابلة للتوسّع:
 * تُضاف «نقطة» جديدة بإضافة عنصر إلى مصفوفة `ROADMAP`.
 */

const GOLD = '#DAAA3C';

/* أقسام بوابة العمليات (عالية المستوى) التي قد يراها الدور. */
const AREAS = {
  daily: 'العمليات اليومية',
  inventory: 'المستودعات والجرد',
  purchase: 'دورة الشراء',
  quality: 'مراقبة الجودة',
  dispatch: 'الشحن والبوابة',
  returns: 'المرتجعات والتالف',
  audit: 'الجرد والتسويات',
  finance: 'المالية والمطابقة',
  reports: 'مركز التقارير',
  admin: 'إدارة النظام',
};

/* الأدوار — مبنية على مجموعات موديول brandzo_warehouse (+ مدير النظام). */
const ROLES = [
  {
    id: 'admin', name: 'مدير النظام', emoji: '👑', accent: GOLD,
    group: '— (Odoo admin)',
    can: ['كل الصلاحيات التشغيلية', 'إدارة المستخدمين والأدوار', 'الإعدادات والربط مع أودو'],
    sees: Object.keys(AREAS),
  },
  {
    id: 'warehouse_user', name: 'مستخدم المستودع', emoji: '📦', accent: '#3b82f6',
    group: 'group_bz_warehouse_user',
    can: ['الاستلام والتخزين', 'السحب والتسليم', 'إدخال بيانات المخزون والحركات'],
    sees: ['daily', 'inventory', 'reports'],
  },
  {
    id: 'purchase_manager', name: 'مدير المشتريات', emoji: '🛒', accent: '#8b5cf6',
    group: 'group_bz_purchase_manager',
    can: ['اعتماد طلبات الشراء (PR)', 'تأكيد أوامر الشراء (PO)'],
    sees: ['purchase', 'daily', 'reports'],
  },
  {
    id: 'qc_inspector', name: 'مفتش الجودة', emoji: '🔬', accent: '#14b8a6',
    group: 'group_bz_qc_inspector',
    can: ['اعتماد أو رفض فحص الاستلام (QC)', 'تحويل البضاعة للحجر الصحي'],
    sees: ['quality', 'daily'],
  },
  {
    id: 'gate_officer', name: 'ضابط البوابة', emoji: '🚧', accent: '#f59e0b',
    group: 'group_bz_gate_officer',
    can: ['اعتماد تصاريح خروج المركبات', 'تسجيل خروج الشحنات'],
    sees: ['dispatch'],
  },
  {
    id: 'return_manager', name: 'مسؤول المرتجعات والتالف', emoji: '↩️', accent: '#ec4899',
    group: 'group_bz_return_manager',
    can: ['اعتماد إشعارات الإرجاع', 'اعتماد الإتلاف والتصنيف'],
    sees: ['returns', 'inventory'],
  },
  {
    id: 'inventory_auditor', name: 'مدقق الجرد', emoji: '🔢', accent: '#10b981',
    group: 'group_bz_inventory_auditor',
    can: ['إدارة جلسات الجرد الدوري', 'مصادقة ورقة العدّ الفعلي'],
    sees: ['audit', 'inventory'],
  },
  {
    id: 'finance_manager', name: 'المدير المالي', emoji: '💰', accent: '#22c55e',
    group: 'group_bz_finance_manager',
    can: ['اعتماد سندات تسوية المخزون', 'المطابقة الثلاثية وترحيل الفواتير', 'الإغلاق المالي للفترة'],
    sees: ['finance', 'audit', 'reports'],
  },
];

/* منطق الصلاحيات: الحرّاس الذهبية — مَن يملك حقّ الاعتماد. */
const CAPS = [
  { label: 'اعتماد طلب الشراء', stage: '01', roles: ['admin', 'purchase_manager'] },
  { label: 'اعتماد فحص الجودة (QC)', stage: '04', roles: ['admin', 'qc_inspector'] },
  { label: 'اعتماد تصريح البوابة', stage: '07', roles: ['admin', 'gate_officer'] },
  { label: 'اعتماد المرتجعات والإتلاف', stage: '08', roles: ['admin', 'return_manager'] },
  { label: 'مصادقة الجرد الدوري', stage: '09', roles: ['admin', 'inventory_auditor'] },
  { label: 'اعتماد تسوية المخزون', stage: '10', roles: ['admin', 'finance_manager'] },
  { label: 'المطابقة الثلاثية (ترحيل الفاتورة)', stage: '11', roles: ['admin', 'finance_manager'] },
];

/* كيفية الدخول — خطوات التدفّق المستهدف. */
const FLOW = [
  { n: '1', t: 'تسجيل الدخول', d: 'بريد + كلمة مرور (Firebase Auth)', ic: '🔑' },
  { n: '2', t: 'تحديد الدور', d: 'يُجلب من مجموعة أودو تلقائيًا', ic: '🎭' },
  { n: '3', t: 'عرض مخصّص', d: 'تظهر فقط الأقسام المسموحة للدور', ic: '🖥️' },
];

/* حاوية النقاط القادمة لاكتمال المشروع — أضِف عنصرًا هنا لتوسيع الصفحة. */
const ROADMAP = [
  { t: 'تسجيل الدخول الفعلي', d: 'ربط Firebase Auth بشاشة دخول عربية للبوابة.', s: 'التالي' },
  { t: 'جلب الأدوار من أودو', d: 'قراءة مجموعات المستخدم عبر الوسيط وتخزين الدور في الجلسة.', s: 'مخطّط' },
  { t: 'قائمة جانبية حسب الدور', d: 'إخفاء/إظهار مجموعات القائمة تلقائيًا حسب صلاحية المستخدم.', s: 'مخطّط' },
  { t: 'صفحة إدارة المستخدمين', d: 'إسناد الأدوار وتعطيل الحسابات من داخل البوابة.', s: 'مقترح' },
  { t: 'سجلّ التدقيق (Audit Log)', d: 'من فعل ماذا ومتى — لكل اعتماد أو تعديل حسّاس.', s: 'مقترح' },
];

const card = 'rounded-2xl border border-white/10 bg-white/5 backdrop-blur';

export default function AccessControlHub() {
  const [sel, setSel] = useState('admin');
  const role = ROLES.find((r) => r.id === sel);
  const roleById = (id) => ROLES.find((r) => r.id === id);

  return (
    <div dir="rtl" className="space-y-6 text-gray-100">
      {/* مقدّمة + حالة النظام */}
      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-white">🛡️ الصلاحيات والأدوار</h2>
            <p className="text-sm text-gray-300 mt-1 max-w-2xl leading-relaxed">
              مركز تصميم نظام الوصول لبوابة العمليات — مَن يدخل، وبأي دور، وماذا يرى ويعتمد.
              الأدوار مبنية على مجموعات موديول <span className="font-mono text-brand-gold">brandzo_warehouse</span> الحقيقية.
            </p>
          </div>
          <span className="shrink-0 text-xs font-bold rounded-full px-3 py-1.5 border"
            style={{ color: GOLD, borderColor: 'rgba(218,170,60,.4)', background: 'rgba(218,170,60,.08)' }}>
            الحالة: البوابة مفتوحة — هذه خطة النظام
          </span>
        </div>
      </div>

      {/* كيفية الدخول */}
      <div className={`${card} p-5`}>
        <h3 className="text-sm font-bold text-brand-gold mb-4">كيفية الدخول إلى بوابة العمليات</h3>
        <div className="flex flex-wrap items-stretch gap-3">
          {FLOW.map((f, i) => (
            <React.Fragment key={f.n}>
              <div className="flex-1 min-w-[150px] rounded-xl border border-white/10 bg-black/20 p-4 text-center">
                <div className="text-2xl mb-1">{f.ic}</div>
                <div className="text-sm font-bold text-white">{f.t}</div>
                <div className="text-xs text-gray-400 mt-1 leading-relaxed">{f.d}</div>
              </div>
              {i < FLOW.length - 1 && <div className="self-center text-gray-500 font-bold">◄</div>}
            </React.Fragment>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3 leading-relaxed">
          المبدأ: <b className="text-gray-200">الدور يأتي من أودو</b> (مصدر الحقيقة الواحد)، والبوابة تعرض فقط ما يخصّ ذلك الدور.
        </p>
      </div>

      {/* اختيار الدور */}
      <div className={`${card} p-5`}>
        <h3 className="text-sm font-bold text-brand-gold mb-4">اختر دورًا لاستعراض صلاحياته وما يراه</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {ROLES.map((r) => {
            const active = r.id === sel;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSel(r.id)}
                className="rounded-xl border p-3 text-right transition-colors"
                style={active
                  ? { borderColor: r.accent, background: 'rgba(255,255,255,.08)', boxShadow: `0 0 0 1px ${r.accent} inset` }
                  : { borderColor: 'rgba(255,255,255,.1)', background: 'rgba(0,0,0,.2)' }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg leading-none">{r.emoji}</span>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.accent }} />
                </div>
                <div className="text-[13px] font-bold text-white mt-2 leading-tight">{r.name}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* تفاصيل الدور: ماذا يفعل + ماذا يرى */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${card} p-5`}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">{role.emoji}</span>
            <h3 className="text-base font-bold text-white">{role.name}</h3>
          </div>
          <div className="text-[11px] font-mono text-gray-400 mb-4">{role.group}</div>
          <div className="text-xs font-bold text-brand-gold mb-2">ماذا يفعل هذا الدور؟</div>
          <ul className="space-y-2">
            {role.can.map((c) => (
              <li key={c} className="flex items-start gap-2 text-sm text-gray-200">
                <span className="mt-0.5 shrink-0" style={{ color: role.accent }}>✓</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={`${card} p-5`}>
          <div className="text-xs font-bold text-brand-gold mb-1">ماذا يرى في البوابة؟</div>
          <p className="text-[11px] text-gray-400 mb-4 leading-relaxed">الأقسام المُضاءة يراها هذا الدور؛ الباقي مخفيّ عنه.</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(AREAS).map(([key, label]) => {
              const on = role.sees.includes(key);
              return (
                <span
                  key={key}
                  className="text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition-colors"
                  style={on
                    ? { color: '#fff', borderColor: role.accent, background: 'rgba(255,255,255,.08)' }
                    : { color: '#6b7280', borderColor: 'rgba(255,255,255,.06)', background: 'transparent', opacity: .55 }}
                >
                  {on ? '● ' : '○ '}{label}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* مصفوفة الصلاحيات: منطق الاعتماد */}
      <div className={`${card} p-5`}>
        <h3 className="text-sm font-bold text-brand-gold mb-1">منطق الصلاحيات — مَن يعتمد ماذا؟</h3>
        <p className="text-[11px] text-gray-400 mb-4 leading-relaxed">
          كل حارس ذهبي يتطلّب اعتماد الدور المخوّل — والدور المختار حاليًا مُميّز.
        </p>
        <div className="space-y-2">
          {CAPS.map((cap) => {
            const selHas = cap.roles.includes(sel);
            return (
              <div
                key={cap.label}
                className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5"
                style={selHas
                  ? { borderColor: role.accent, background: 'rgba(255,255,255,.05)' }
                  : { borderColor: 'rgba(255,255,255,.08)', background: 'rgba(0,0,0,.15)' }}
              >
                <span className="text-[10px] font-mono text-gray-500 w-6 shrink-0">{cap.stage}</span>
                <span className="text-sm font-semibold text-gray-100 flex-1 min-w-[160px]">{cap.label}</span>
                <span className="flex flex-wrap gap-1.5">
                  {cap.roles.map((rid) => {
                    const r = roleById(rid);
                    const isSel = rid === sel;
                    return (
                      <span
                        key={rid}
                        className="text-[11px] font-bold rounded-full px-2 py-0.5 border"
                        style={{
                          color: isSel ? '#fff' : r.accent,
                          borderColor: r.accent,
                          background: isSel ? r.accent : 'transparent',
                        }}
                      >
                        {r.emoji} {r.name}
                      </span>
                    );
                  })}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* الحاوية: نقاط قادمة لاكتمال المشروع */}
      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between gap-3 mb-1">
          <h3 className="text-sm font-bold text-brand-gold">نقاط قادمة لاكتمال نظام الوصول</h3>
          <span className="text-[11px] text-gray-400">حاوية قابلة للتوسّع</span>
        </div>
        <p className="text-[11px] text-gray-400 mb-4 leading-relaxed">
          هذه الصفحة مصمّمة لتنمو — نضيف كل نقطة هنا ونبنيها تباعًا حتى يكتمل النظام.
        </p>
        <div className="space-y-2.5">
          {ROADMAP.map((it, i) => (
            <div key={it.t} className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <span className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold"
                style={{ background: 'rgba(218,170,60,.12)', color: GOLD }}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-white">{it.t}</span>
                  <span className="text-[10px] font-bold rounded-full px-2 py-0.5 border"
                    style={{ color: '#e5b7bf', borderColor: 'rgba(196,30,58,.5)', background: 'rgba(196,30,58,.12)' }}>
                    {it.s}
                  </span>
                </div>
                <div className="text-xs text-gray-400 mt-1 leading-relaxed">{it.d}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-dashed border-white/15 p-3 text-center text-xs text-gray-500">
          ＋ نقطة جديدة تُضاف هنا عند طلبها
        </div>
      </div>
    </div>
  );
}
