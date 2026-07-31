import React, { useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import ListView from '../../odoo/ListView.jsx';
import Badge from '../../odoo/Badge.jsx';
import { int } from '../../odoo/format.js';

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
 *
 * المرحلة ٤ (2026-07-31): أُعيد كساء العرض بمكوّنات أودو داخل `.o_theme`
 * (ControlPanel + ListView + Badge + o_kpi/section + Icon بدل الإيموجي) —
 * **المنطق (الحالة والبيانات والمساعدات) لم يُمسّ**، غُيّر ما يُرسَم فقط.
 * الأرقام لاتينية (R2) عبر format.
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

/* ── كساء أودو (المرحلة ٤): خرائط عرض بدل الإيموجي — لا منطق. ─────────────── */
const ROLE_ICONS = {
  admin: 'shieldCheck',
  warehouse_user: 'package',
  purchase_manager: 'shoppingCart',
  qc_inspector: 'checkCircle',
  gate_officer: 'truck',
  return_manager: 'arrowLeftRight',
  inventory_auditor: 'clipboardList',
  finance_manager: 'dollarSign',
};
const FLOW_ICONS = { 1: 'shield', 2: 'users', 3: 'gauge' };
const STATUS_VARIANT = { 'التالي': 'progress', 'مخطّط': 'draft', 'مقترح': 'draft' };
const CAP_COLS = [
  { key: 'stage', label: 'المرحلة', width: '64px' },
  { key: 'label', label: 'الحارس الذهبي' },
  { key: 'roles', label: 'مَن يعتمد؟' },
];

export default function AccessControlHub() {
  const [sel, setSel] = useState('admin');
  const role = ROLES.find((r) => r.id === sel);
  const roleById = (id) => ROLES.find((r) => r.id === id);

  const capRows = CAPS.map((cap) => ({
    id: cap.label,
    decoration: cap.roles.includes(sel) ? 'bf' : undefined,
    cells: {
      stage: <span className="decoration-bf" style={{ fontFamily: 'monospace', color: 'var(--o-gray-500)' }}>{cap.stage}</span>,
      label: cap.label,
      roles: (
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '6px' }}>
          {cap.roles.map((rid) => {
            const r = roleById(rid);
            const isSel = rid === sel;
            return (
              <Badge key={rid} variant={isSel ? 'done' : 'progress'}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Icon name={ROLE_ICONS[rid]} size={11} /> {r.name}
                </span>
              </Badge>
            );
          })}
        </span>
      ),
    },
  }));

  return (
    <div className="o_theme" dir="rtl">
      <div className="o_control_panel">
        <div className="o_cp_start">
          <nav className="o_breadcrumb" aria-label="مسار التنقّل"><span className="o_active">الصلاحيات والأدوار</span></nav>
        </div>
        <div className="o_cp_end">
          <Badge variant="warn">البوابة مفتوحة — هذه خطة النظام</Badge>
        </div>
      </div>

      <div className="o_ds">
        <p style={{ fontSize: 'var(--o-font-size-sm)', color: 'var(--o-main-color-muted)', margin: '0 0 18px', lineHeight: 1.6, maxWidth: '52rem' }}>
          مركز تصميم نظام الوصول لبوابة العمليات — مَن يدخل، وبأي دور، وماذا يرى ويعتمد.
          الأدوار مبنية على مجموعات موديول <span style={{ fontFamily: 'monospace', color: 'var(--o-action)' }}>brandzo_warehouse</span> الحقيقية.
        </p>

        {/* كيفية الدخول */}
        <div className="o_dashboard_section">
          <h3 className="o_dashboard_section_title"><Icon name="workflows" size={16} /> كيفية الدخول إلى بوابة العمليات</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: '12px' }}>
            {FLOW.map((f, i) => (
              <React.Fragment key={f.n}>
                <div className="o_ds_card o_ds_pad" style={{ flex: '1', minWidth: '160px', textAlign: 'center' }}>
                  <span className="o_kpi_icon" style={{ margin: '0 auto 10px' }}><Icon name={FLOW_ICONS[f.n]} size={20} /></span>
                  <div style={{ fontWeight: 'var(--o-font-weight-bold)' }}>{f.t}</div>
                  <div style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', marginTop: '4px', lineHeight: 1.6 }}>{f.d}</div>
                </div>
                {i < FLOW.length - 1 && (
                  <div style={{ alignSelf: 'center', color: 'var(--o-gray-400)' }}><Icon name="arrowLeftRight" size={18} /></div>
                )}
              </React.Fragment>
            ))}
          </div>
          <p style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', marginTop: '10px', lineHeight: 1.6 }}>
            المبدأ: <b style={{ color: 'var(--o-main-text-color)' }}>الدور يأتي من أودو</b> (مصدر الحقيقة الواحد)، والبوابة تعرض فقط ما يخصّ ذلك الدور.
          </p>
        </div>

        {/* اختيار الدور */}
        <div className="o_dashboard_section">
          <h3 className="o_dashboard_section_title"><Icon name="users" size={16} /> اختر دورًا لاستعراض صلاحياته وما يراه</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
            {ROLES.map((r) => {
              const active = r.id === sel;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSel(r.id)}
                  className={active ? 'btn btn-primary' : 'btn btn-secondary'}
                  style={{ height: 'auto', textAlign: 'start', padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <Icon name={ROLE_ICONS[r.id]} size={18} />
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', flex: 'none', background: r.accent }} />
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 'var(--o-font-weight-bold)', lineHeight: 1.3 }}>{r.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* تفاصيل الدور: ماذا يفعل + ماذا يرى */}
        <div className="o_dashboard_grid2">
          <div className="o_dashboard_card">
            <div className="o_dashboard_card_head">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Icon name={ROLE_ICONS[role.id]} size={16} /> {role.name}
              </span>
              <span className="o_count" style={{ fontFamily: 'monospace' }}>{role.group}</span>
            </div>
            <div className="o_ds_pad">
              <div style={{ fontSize: 'var(--o-font-size-xs)', fontWeight: 'var(--o-font-weight-bold)', color: 'var(--o-action)', marginBottom: '10px' }}>ماذا يفعل هذا الدور؟</div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {role.can.map((c) => (
                  <li key={c} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: 'var(--o-font-size-sm)' }}>
                    <span style={{ color: 'var(--o-text-success)', flex: 'none', marginTop: '2px' }}><Icon name="checkCircle" size={14} /></span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="o_dashboard_card">
            <div className="o_dashboard_card_head">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}><Icon name="grid" size={16} /> ماذا يرى في البوابة؟</span>
            </div>
            <div className="o_ds_pad">
              <p style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', margin: '0 0 12px', lineHeight: 1.6 }}>الأقسام المُضاءة يراها هذا الدور؛ الباقي مخفيّ عنه.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {Object.entries(AREAS).map(([key, label]) => {
                  const on = role.sees.includes(key);
                  return on ? (
                    <Badge key={key} variant="done">{label}</Badge>
                  ) : (
                    <span key={key} className="o_badge o_badge-draft" style={{ opacity: 0.6 }}>{label}</span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* مصفوفة الصلاحيات: منطق الاعتماد */}
        <div className="o_dashboard_section" style={{ marginTop: '22px' }}>
          <h3 className="o_dashboard_section_title"><Icon name="shieldCheck" size={16} /> منطق الصلاحيات — مَن يعتمد ماذا؟</h3>
          <p style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', margin: '0 0 10px', lineHeight: 1.6 }}>
            كل حارس ذهبي يتطلّب اعتماد الدور المخوّل — والدور المختار حاليًا مُميّز.
          </p>
          <div className="o_ds_card">
            <ListView selectable={false} columns={CAP_COLS} rows={capRows} />
          </div>
        </div>

        {/* الحاوية: نقاط قادمة لاكتمال المشروع */}
        <div className="o_dashboard_section">
          <h3 className="o_dashboard_section_title"><Icon name="rocket" size={16} /> نقاط قادمة لاكتمال نظام الوصول</h3>
          <p style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', margin: '0 0 12px', lineHeight: 1.6 }}>
            هذه الصفحة مصمّمة لتنمو — نضيف كل نقطة هنا ونبنيها تباعًا حتى يكتمل النظام.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {ROADMAP.map((it, i) => (
              <div key={it.t} className="o_ds_card" style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 14px' }}>
                <span style={{ flex: 'none', width: '26px', height: '26px', borderRadius: 'var(--o-border-radius)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-badge-info-bg)', color: 'var(--o-action)', fontSize: '12px', fontWeight: 'var(--o-font-weight-bold)' }}>{int(i + 1)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 'var(--o-font-weight-bold)' }}>{it.t}</span>
                    <Badge variant={STATUS_VARIANT[it.s] || 'draft'}>{it.s}</Badge>
                  </div>
                  <div style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', marginTop: '4px', lineHeight: 1.6 }}>{it.d}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '12px', border: '1px dashed var(--o-gray-400)', borderRadius: 'var(--o-border-radius)', padding: '12px', textAlign: 'center', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-gray-500)' }}>
            نقطة جديدة تُضاف هنا عند طلبها
          </div>
        </div>
      </div>
    </div>
  );
}
