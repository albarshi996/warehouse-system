/**
 * ListView — عرض القائمة الكثيف لأودو (D2 · النمط ٣).
 * رأس قابل للفرز (بصريًّا)، صفوف كثيفة، تلوين حالة عبر decoration-*،
 * وتذييل بمجاميع بخطّ عريض. أرقام الأعمدة الرقمية محاذاة للنهاية (R8).
 *
 * props:
 *   columns: [{ key, label, numeric?, width? }]
 *   rows:    [{ id, decoration?, selectable?, cells: { [key]: node } }]
 *   footer:  { label?, cells?: { [key]: node } }   // اختياري
 *   selectable: boolean   // إظهار عمود خانات الاختيار
 *   onRowClick: (row) => void
 */
export default function ListView({ columns = [], rows = [], footer = null, selectable = true, onRowClick }) {
  return (
    <div className="o_list_scroll">
      <table className="o_list_view">
      <thead>
        <tr>
          {selectable && (
            <th style={{ width: '34px' }}>
              <input type="checkbox" aria-label="تحديد الكل" />
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
        {rows.map((row) => (
          <tr
            key={row.id}
            className={row.decoration ? `decoration-${row.decoration}` : ''}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            role={onRowClick ? 'button' : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row); } } : undefined}
          >
            {selectable && (
              <td onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" aria-label={`تحديد ${row.id}`} />
              </td>
            )}
            {columns.map((c) => (
              <td key={c.key} className={c.numeric ? 'o_list_number' : ''}>
                {row.cells[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {footer && (
        <tfoot>
          <tr>
            {selectable && <td />}
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
