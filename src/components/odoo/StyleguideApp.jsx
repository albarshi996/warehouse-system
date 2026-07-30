import ControlPanel from './ControlPanel.jsx';
import ListView from './ListView.jsx';
import StatusBar from './StatusBar.jsx';
import StatBox from './StatBox.jsx';
import FormSheet from './FormSheet.jsx';
import Notebook from './Notebook.jsx';
import KanbanCard from './KanbanCard.jsx';
import Badge from './Badge.jsx';
import { int } from './format.js';

/**
 * StyleguideApp — صفحة الأنماط الداخلية (D3).
 * مرجع دائم للفريق: كل مكوّن مشترك بكل حالاته، مع سلّم الرموز.
 * كل شيء معزول داخل حاوية .o_theme فلا يتأثّر بثيم البوابة الداكن.
 */
const SWATCHES = [
  ['--o-brand-primary', 'الهوية'],
  ['--o-action', 'روابط/أزرار'],
  ['--o-success', 'نجاح'],
  ['--o-warning', 'تنبيه'],
  ['--o-danger', 'خطر'],
  ['--o-info', 'معلومة'],
  ['--o-gray-200', 'رمادي 200'],
  ['--o-gray-400', 'رمادي 400'],
  ['--o-gray-700', 'رمادي 700'],
  ['--o-gray-900', 'نصّ'],
];

export default function StyleguideApp() {
  const listColumns = [
    { key: 'ref', label: 'المرجع' },
    { key: 'party', label: 'الجهة' },
    { key: 'qty', label: 'الكمية', numeric: true },
    { key: 'status', label: 'الحالة' },
  ];
  const listRows = [
    { id: 'r1', cells: { ref: <span className="decoration-bf">DOC-001</span>, party: 'شركة النور', qty: int(14), status: <Badge variant="progress">قيد التنفيذ</Badge> } },
    { id: 'r2', cells: { ref: 'DOC-002', party: 'مؤسسة البحر', qty: int(6), status: <Badge variant="done">منجَز</Badge> } },
    { id: 'r3', decoration: 'danger', cells: { ref: 'DOC-003', party: 'الليبية للتغليف', qty: int(22), status: <Badge variant="danger">متأخر</Badge> } },
    { id: 'r4', decoration: 'muted', cells: { ref: 'DOC-004', party: 'تحويل داخلي', qty: int(3), status: <Badge variant="draft">مسودة</Badge> } },
  ];

  return (
    <div className="o_theme" dir="rtl">
      {/* الرموز */}
      <div className="o_sg_label">سلّم الرموز — كل الألوان من tokens.css (R3)</div>
      <div className="o_sg_swatches">
        {SWATCHES.map(([varName, label]) => (
          <span className="o_sg_swatch" key={varName}>
            <span className="o_sg_chip" style={{ background: `var(${varName})` }} />
            <span>
              {label} <code style={{ direction: 'ltr', color: 'var(--o-gray-600)' }}>{varName}</code>
            </span>
          </span>
        ))}
      </div>

      {/* الأزرار */}
      <div className="o_sg_label">الأزرار</div>
      <div className="o_sg_note" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" type="button">أساسي</button>
        <button className="btn btn-secondary" type="button">ثانوي</button>
        <button className="btn btn-link" type="button">رابط</button>
        <button className="btn btn-secondary" type="button" disabled>معطّل</button>
      </div>

      {/* الشارات */}
      <div className="o_sg_label">شارات الحالة</div>
      <div className="o_sg_note" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <Badge variant="draft">مسودة</Badge>
        <Badge variant="progress">قيد التنفيذ</Badge>
        <Badge variant="done">منجَز</Badge>
        <Badge variant="warn">بانتظار</Badge>
        <Badge variant="danger">متأخر</Badge>
      </div>

      {/* لوحة التحكم */}
      <div className="o_sg_label">لوحة التحكم — النمط 1</div>
      <ControlPanel
        breadcrumb={[{ label: 'السجلّات', href: '#' }, { label: 'REC-042', active: true }]}
        actions={[{ label: 'جديد', variant: 'primary' }, { label: 'إجراء ⌄', variant: 'secondary' }]}
        facets={[{ key: 'المستودع', val: 'بنغازي المركزي' }, { key: 'الحالة', val: 'قيد التنفيذ' }]}
        pager={{ current: int(42), total: int(186) }}
        views={[{ id: 'list', glyph: '☰', label: 'قائمة', active: true }, { id: 'kanban', glyph: '▦', label: 'كانبان' }, { id: 'form', glyph: '▤', label: 'نموذج' }]}
      />

      {/* عرض القائمة */}
      <div className="o_sg_label">عرض القائمة — النمط 3 (كثافة عالية، أرقام للنهاية)</div>
      <ListView columns={listColumns} rows={listRows} footer={{ label: `${int(4)} سجلات`, cells: { qty: int(45) } }} />

      {/* شريط المراحل */}
      <div className="o_sg_label">شريط المراحل + أزرار الإجراء</div>
      <div style={{ padding: '0 16px' }}>
        <StatusBar
          buttons={[{ label: 'تأكيد', variant: 'primary' }, { label: 'إلغاء', variant: 'secondary' }]}
          stages={['مسودة', 'مؤكد', 'قيد التنفيذ', 'منجَز', 'مقفل']}
          current={2}
        />
      </div>

      {/* أزرار الإحصاء */}
      <div className="o_sg_label">أزرار الإحصاء</div>
      <StatBox stats={[{ value: int(3), text: 'مستندات مرتبطة' }, { value: int(14), text: 'سطر حركة' }, { value: int(1), text: 'تصريح خروج' }]} />

      {/* ورقة النموذج — النمط 2 (تعرض غلاف الورقة o_form_view/o_form_sheet) */}
      <div className="o_sg_label">ورقة النموذج — النمط 2</div>
      <FormSheet
        statusBar={{
          buttons: [{ label: 'تأكيد', variant: 'primary' }, { label: 'إلغاء', variant: 'secondary' }],
          stages: ['مسودة', 'مؤكد', 'قيد التنفيذ', 'منجَز', 'مقفل'],
          current: 2,
        }}
        stats={[{ value: int(3), text: 'مستندات مرتبطة' }, { value: int(14), text: 'سطر حركة' }]}
      >
        <h1 className="o_form_title">REC-042</h1>
        <p className="o_form_subtitle">مثال ورقة نموذج — بطاقة بيضاء بعرض أقصى 1140px فوق خلفية رمادية</p>
        <div className="o_group">
          <div className="o_inner_group">
            <label className="o_form_label">الجهة</label>
            <div className="o_field required"><a href="#" className="o_field_link">شركة النور</a></div>
            <label className="o_form_label">المستودع</label>
            <div className="o_field editable">بنغازي المركزي</div>
          </div>
          <div className="o_inner_group">
            <label className="o_form_label">التاريخ</label>
            <div className="o_field editable">2026/07/28</div>
            <label className="o_form_label">الحالة</label>
            <div className="o_field">قيد التنفيذ</div>
          </div>
        </div>
      </FormSheet>

      {/* الدفتر */}
      <div className="o_sg_label">دفتر التبويبات</div>
      <div style={{ padding: '0 16px 16px' }}>
        <Notebook
          tabs={[
            { id: 't1', label: 'التبويب الأول', content: <p style={{ fontSize: 'var(--o-font-size-sm)' }}>محتوى التبويب الأول.</p> },
            { id: 't2', label: 'التبويب الثاني', content: <p style={{ fontSize: 'var(--o-font-size-sm)' }}>محتوى التبويب الثاني.</p> },
            { id: 't3', label: 'التبويب الثالث', content: <p style={{ fontSize: 'var(--o-font-size-sm)' }}>محتوى التبويب الثالث.</p> },
          ]}
        />
      </div>

      {/* كانبان */}
      <div className="o_sg_label">عرض كانبان — النمط 4</div>
      <div className="o_kanban_view">
        <div className="o_kanban_group">
          <div className="o_kanban_header"><span>مسودة</span><span className="o_kanban_count">{int(2)}</span></div>
          <KanbanCard title="REC-039" sub={`تحويل داخلي — ${int(3)} أصناف`} priority={0} assignee="س" />
          <KanbanCard title="REC-038" sub={`مؤسسة الواحة — ${int(9)} أصناف`} priority={1} assignee="ن" />
        </div>
        <div className="o_kanban_group">
          <div className="o_kanban_header"><span>قيد التنفيذ</span><span className="o_kanban_count">{int(1)}</span></div>
          <KanbanCard title="REC-042" sub={`شركة النور — ${int(14)} صنفًا`} priority={2} assignee="خ" current />
        </div>
        <div className="o_kanban_group">
          <div className="o_kanban_header"><span>مقفل</span><span className="o_kanban_count">{int(0)}</span></div>
          <div className="o_kanban_empty">لا سجلات في هذه المرحلة</div>
        </div>
      </div>

      <div style={{ height: '24px' }} />
    </div>
  );
}
