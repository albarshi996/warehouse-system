import ControlPanel from './ControlPanel.jsx';
import ListView from './ListView.jsx';
import FormSheet from './FormSheet.jsx';
import Notebook from './Notebook.jsx';
import Badge from './Badge.jsx';
import { int, delta } from './format.js';

/**
 * ReceiptsPilot — شاشة «أوامر الاستلام» التجريبية (D4).
 * قائمة + نموذج بأسلوب أودو الكامل، ببيانات تمثيلية (القسم ٣ يستثني تدفّق
 * البيانات، فلا ربط حيّ في هذه المرحلة). نموذج الاعتماد قبل التعميم.
 */

/* ── بيانات عيّنة: قائمة أوامر الاستلام ── */
const COLUMNS = [
  { key: 'ref', label: 'المرجع ⌄' },
  { key: 'supplier', label: 'المورّد' },
  { key: 'wh', label: 'المستودع' },
  { key: 'date', label: 'تاريخ الاستلام' },
  { key: 'items', label: 'عدد الأصناف', numeric: true },
  { key: 'value', label: 'القيمة (د.ل)', numeric: true },
  { key: 'status', label: 'الحالة' },
];

const ROWS = [
  {
    id: 'WH/IN/00042', current: true,
    cells: {
      ref: <span className="decoration-bf">WH/IN/00042</span>, supplier: 'شركة النور للتوريدات', wh: 'بنغازي المركزي',
      date: '2026/07/28', items: int(14), value: int(48250), status: <Badge variant="progress">قيد التنفيذ</Badge>,
    },
  },
  {
    id: 'WH/IN/00041',
    cells: {
      ref: 'WH/IN/00041', supplier: 'مؤسسة البحر للمواد', wh: 'بنغازي المركزي',
      date: '2026/07/27', items: int(6), value: int(12900), status: <Badge variant="done">مستلَم</Badge>,
    },
  },
  {
    id: 'WH/IN/00040', decoration: 'danger',
    cells: {
      ref: 'WH/IN/00040', supplier: 'الشركة الليبية للتغليف', wh: 'مستودع الفرع',
      date: '2026/07/25', items: int(22), value: int(76400), status: <Badge variant="danger">متأخر</Badge>,
    },
  },
  {
    id: 'WH/IN/00039', decoration: 'muted',
    cells: {
      ref: 'WH/IN/00039', supplier: 'مورّد داخلي — تحويل', wh: 'مستودع الفرع',
      date: '2026/07/24', items: int(3), value: int(4100), status: <Badge variant="draft">مسودة</Badge>,
    },
  },
];

/* ── سطور الاستلام داخل النموذج ── */
const LINE_COLUMNS = [
  { key: 'item', label: 'الصنف' },
  { key: 'desc', label: 'الوصف' },
  { key: 'req', label: 'المطلوب', numeric: true },
  { key: 'rec', label: 'المستلَم', numeric: true },
  { key: 'diff', label: 'الفرق', numeric: true },
  { key: 'unit', label: 'الوحدة' },
];
const LINE_ROWS = [
  { id: 'l1', cells: { item: <span className="decoration-bf">RM-0912</span>, desc: 'كرتون تغليف مقاس 40×30', req: int(500), rec: int(500), diff: int(0), unit: 'قطعة' } },
  { id: 'l2', cells: { item: <span className="decoration-bf">RM-0417</span>, desc: 'شريط لاصق شفاف 48مم', req: int(200), rec: int(194), diff: <span className="decoration-danger">{delta(-6)}</span>, unit: 'لفة' } },
  { id: 'l3', cells: { item: <span className="decoration-bf">RM-1130</span>, desc: 'ملصقات باركود حرارية', req: int(30), rec: int(30), diff: int(0), unit: 'رول' } },
];

function Field({ label, children, required, editable, link }) {
  const cls = `o_field${required ? ' required' : ''}${editable ? ' editable' : ''}`;
  return (
    <>
      <label className="o_form_label">{label}</label>
      <div className={cls}>{link ? <a href="#" className="o_field_link">{children}</a> : children}</div>
    </>
  );
}

export default function ReceiptsPilot() {
  const linesTable = (
    <ListView
      selectable={false}
      columns={LINE_COLUMNS}
      rows={LINE_ROWS}
      footer={{ label: `${int(3)} سطور`, cells: { req: int(730), rec: int(724), diff: delta(-6) } }}
    />
  );

  const chatter = (
    <div className="o_chatter">
      <div className="o_chatter_topbar">
        <button className="btn btn-link" type="button">إرسال رسالة</button>
        <button className="btn btn-link" type="button">تسجيل ملاحظة</button>
        <button className="btn btn-link" type="button">جدولة نشاط</button>
        <span style={{ marginInlineStart: 'auto', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>{int(4)} متابعين</span>
      </div>
      <div className="o_message">
        <div className="o_message_avatar">خ</div>
        <div>
          <div><span className="o_message_author">م. خالد الورفلي</span><span className="o_message_date">اليوم 09:42</span></div>
          <div className="o_message_body">دخلت المركبة والأختام سليمة. جارٍ العدّ الفعلي مع مدقق الجرد.</div>
        </div>
      </div>
      <div className="o_message">
        <div className="o_message_avatar">ن</div>
        <div>
          <div><span className="o_message_author">النظام</span><span className="o_message_date">اليوم 09:40</span></div>
          <div className="o_tracking">الحالة: <span>مؤكد</span> ← <span>بوابة الدخول</span></div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="o_theme" dir="rtl">
      {/* لوحة التحكم */}
      <ControlPanel
        breadcrumb={[{ label: 'أوامر الاستلام', href: '#' }, { label: 'WH/IN/00042', active: true }]}
        actions={[{ label: 'جديد', variant: 'primary' }, { label: 'إجراء ⌄', variant: 'secondary' }]}
        facets={[{ key: 'المستودع', val: 'بنغازي المركزي' }, { key: 'الحالة', val: 'قيد التنفيذ' }]}
        pager={{ current: int(42), total: int(186) }}
        views={[{ id: 'list', glyph: '☰', label: 'قائمة', active: true }, { id: 'kanban', glyph: '▦', label: 'كانبان' }, { id: 'form', glyph: '▤', label: 'نموذج' }]}
      />

      {/* عرض القائمة */}
      <div className="o_sg_label">عرض القائمة — أوامر الاستلام</div>
      <ListView
        columns={COLUMNS}
        rows={ROWS}
        footer={{ label: `${int(4)} سجلات`, cells: { items: int(45), value: int(141650) } }}
      />

      {/* عرض النموذج */}
      <div className="o_sg_label">عرض النموذج — أمر الاستلام WH/IN/00042</div>
      <FormSheet
        statusBar={{
          buttons: [
            { label: 'تأكيد', variant: 'primary' },
            { label: 'طباعة أمر الاستلام', variant: 'secondary' },
            { label: 'إلغاء', variant: 'secondary' },
          ],
          stages: ['مسودة', 'مؤكد', 'بوابة الدخول', 'مستلَم', 'مُدقَّق', 'مقفل'],
          current: 2,
        }}
        stats={[
          { value: int(3), text: 'مستندات مرتبطة' },
          { value: int(14), text: 'سطر حركة' },
          { value: int(1), text: 'تصريح خروج' },
        ]}
        chatter={chatter}
      >
        <h1 className="o_form_title">WH/IN/00042</h1>
        <p className="o_form_subtitle">أمر استلام — دورة المستندات، المرحلة 07: بوابة الدخول</p>

        <div className="o_group">
          <div className="o_inner_group">
            <Field label="المورّد" required link>شركة النور للتوريدات</Field>
            <Field label="أمر الشراء" link>PO/2026/00311</Field>
            <Field label="المستودع" editable>بنغازي المركزي</Field>
            <Field label="ضابط البوابة" editable>م. خالد الورفلي</Field>
          </div>
          <div className="o_inner_group">
            <Field label="تاريخ الوصول" editable>2026/07/28 — 09:40</Field>
            <Field label="رقم المركبة" editable>بنغازي 442-71</Field>
            <Field label="مفتش الجودة" editable>أ. سالم بن عيسى</Field>
            <Field label="الفترة المحاسبية">2026/07 — مفتوحة</Field>
          </div>
        </div>

        <Notebook
          tabs={[
            { id: 'lines', label: 'سطور الاستلام', content: linesTable },
            {
              id: 'gate', label: 'بيانات البوابة',
              content: (
                <div className="o_inner_group" style={{ maxWidth: '520px' }}>
                  <Field label="وقت الدخول">09:40</Field>
                  <Field label="وقت الخروج" editable>—</Field>
                  <Field label="حالة الأختام">سليمة</Field>
                  <Field label="ملاحظات البوابة" editable>تم فحص المركبة ومطابقة رقم الشاحنة مع بيان الشحن.</Field>
                </div>
              ),
            },
            {
              id: 'other', label: 'معلومات إضافية',
              content: (
                <div className="o_inner_group" style={{ maxWidth: '520px' }}>
                  <Field label="مرجع المورّد" editable>INV-2026-8841</Field>
                  <Field label="شروط التسليم" editable>تسليم المستودع</Field>
                  <Field label="أنشئ بواسطة">نظام براندزو — تلقائي</Field>
                </div>
              ),
            },
          ]}
        />
      </FormSheet>

      <div style={{ height: '24px' }} />
    </div>
  );
}
