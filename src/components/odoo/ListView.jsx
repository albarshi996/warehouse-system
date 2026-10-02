/**
 * ListView — عرض القائمة الكثيف لأودو (D2 · النمط ٣).
 * رأس قابل للفرز (بصريًّا)، صفوف كثيفة، تلوين حالة عبر decoration-*،
 * وتذييل بمجاميع بخطّ عريض. أرقام الأعمدة الرقمية محاذاة للنهاية (R8).
 *
 * ═══ التحديدُ صار حقيقيًّا (طلب المالك ٥ · 2026-10-02) ═══
 *
 * ★★★ كان هذا المكوّنُ يرسم `<input type="checkbox">` **بلا `checked` ولا
 * `onChange` ولا حالةٍ تحفظ ما اختير**. فالموظّفُ يضغطها فتُعلَّم، ثمّ تصل
 * لقطةٌ من Firestore فيُعاد الرسمُ فتُمحى — ولا شيءَ يفعل بالمحدَّد شيئًا
 * على أيّ حال. وهو نمطُ «مبنيٌّ ومنشورٌ وبلا مستدعٍ» بعينه، إلّا أنّه
 * **يُرى**: المستخدمُ يرى المربّعَ فيستنتج أنّ ثمّة تحديدًا فيبحث عن زرٍّ
 * ولا يجد. والمربّعُ الذي لا يفعل أسوأ من غيابه لأنّه يَعِد.
 *
 * فالعقدُ الآن صريح: **لا خانةَ اختيارٍ تُرسَم إلّا إذا وُصِلت.** وُجود
 * `onToggle` هو الشرط؛ وبلا مستقبِلٍ للتحديد تختفي الخانةُ تمامًا. فما
 * يُرى يعمل، وما لا يعمل لا يُرى.
 *
 * props:
 *   columns: [{ key, label, numeric?, width? }]
 *   rows:    [{ id, decoration?, cells: { [key]: node } }]
 *   footer:  { label?, cells?: { [key]: node } }   // اختياري
 *   selectable:  boolean   // الإذنُ بعمود التحديد (الافتراض: نعم)
 *   selectedIds: Set|Array // المحدَّدُ حاليًّا — تملكه الشاشة
 *   onToggle:    (id) => void          // قلبُ صفٍّ — **وجودُه يُظهر العمود**
 *   onToggleAll: () => void            // قلبُ الكلّ (رأسُ العمود)
 *   onRowClick:  (row) => void
 *
 * والحالةُ **خارج** المكوّن عمدًا: الشاشةُ هي التي تقصّ التحديدَ عند
 * التصفية وتُجري الإجراءَ الجماعيّ، فلو سكنت الحالةُ هنا لَبقي محدَّدٌ خلف
 * التصفية يُعتمد غيابيًّا (انظر `pruneSelection` في `tableSelection.js`).
 */
export default function ListView({
  columns = [],
  rows = [],
  footer = null,
  selectable = true,
  selectedIds = null,
  onToggle = null,
  onToggleAll = null,
  onRowClick,
}) {
  /** الخانةُ تُرسَم حين تُوصَل فقط — لا وعدَ بلا وفاء. */
  const checks = selectable && typeof onToggle === 'function';
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  const ids = rows.map((r) => r.id).filter((id) => id != null);
  const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
  const someOn = ids.some((id) => selected.has(id)) && !allOn;

  return (
    <div className="o_list_scroll">
      <table className="o_list_view">
      <thead>
        <tr>
          {checks && (
            <th style={{ width: '34px' }}>
              <input
                type="checkbox"
                aria-label={allOn ? 'إلغاء تحديد الكلّ' : 'تحديد الكلّ'}
                checked={allOn}
                /* `indeterminate` خاصّيّةُ DOM لا سمةٌ في JSX — تُضبط بمرجعٍ.
                   وبلا هذا يبدو تحديدُ صفٍّ واحدٍ من عشرين كأنّه «لا شيء». */
                ref={(el) => { if (el) el.indeterminate = someOn; }}
                onChange={() => onToggleAll?.()}
                disabled={typeof onToggleAll !== 'function' || ids.length === 0}
              />
            </th>
          )}
          {columns.map((c) => (
            <th key={c.key} className={c.numeric ? 'o_list_number' : ''} style={c.width ? { width: c.width } : undefined}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const on = selected.has(row.id);
          return (
          <tr
            key={row.id}
            className={`${row.decoration ? `decoration-${row.decoration}` : ''}${on ? ' o_row_selected' : ''}`.trim()}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            role={onRowClick ? 'button' : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row); } } : undefined}
          >
            {checks && (
              /* إيقافُ الانتشار باقٍ: نقرةُ الخانة تحدّد ولا تفتح الصفَّ. */
              <td onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  aria-label={`تحديد ${row.id}`}
                  checked={on}
                  onChange={() => onToggle(row.id)}
                />
              </td>
            )}
            {columns.map((c) => (
              <td key={c.key} className={c.numeric ? 'o_list_number' : ''}>
                {row.cells[c.key]}
              </td>
            ))}
          </tr>
          );
        })}
      </tbody>
      {footer && (
        <tfoot>
          <tr>
            {checks && <td />}
            {columns.map((c, i) => {
              const val = footer.cells ? footer.cells[c.key] : undefined;
              // أوّل خلية غير رقمية تحمل نصّ التلخيص إن وُجد
              if (i === 0 && footer.label && val === undefined) {
                return (
                  <td key={c.key} colSpan={firstSpan(columns)}>
                    {footer.label}
                  </td>
                );
              }
              if (val === undefined && i < firstSpan(columns)) return null;
              return (
                <td key={c.key} className={c.numeric ? 'o_list_number' : ''}>
                  {val}
                </td>
              );
            })}
          </tr>
        </tfoot>
      )}
      </table>
    </div>
  );
}

/** مدى دمج خلية التلخيص = حتى أوّل عمود رقمي. */
function firstSpan(columns) {
  const idx = columns.findIndex((c) => c.numeric);
  return idx === -1 ? columns.length : idx;
}
