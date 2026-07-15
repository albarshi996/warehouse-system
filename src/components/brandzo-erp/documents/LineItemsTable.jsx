/**
 * جدول البنود — يُرسم من أعمدة المخطّط.
 *
 * الفرق عن الورق: الورق فيه **8 صفوف فارغة مكتوبة في الكود** — لا تزيد ولا تنقص.
 * شحنة من 9 أصناف كانت تحتاج ورقة ثانية، وشحنة من صنفين تطبع 6 صفوف فارغة.
 * هنا: صفوف تُضاف وتُحذف بحسب الشحنة.
 */
import { emptyLine } from '../../../services/documents/schemaUtils.js';

const CELL =
  'w-full bg-transparent border-0 px-2 py-1.5 text-sm text-white focus:outline-none ' +
  'focus:bg-white/10 rounded disabled:opacity-60';

export default function LineItemsTable({ schema, section, lines, onChange, disabled }) {
  const columns = section.columns || [];

  function setCell(index, key, value) {
    const next = lines.map((line, i) => (i === index ? { ...line, [key]: value } : line));
    onChange(next);
  }

  function addRow() {
    onChange([...lines, emptyLine(schema)]);
  }

  function removeRow(index) {
    const next = lines.filter((_, i) => i !== index);
    onChange(next.length ? next : [emptyLine(schema)]);
  }

  return (
    <div>
      {section.note && <p className="text-[11px] text-gray-400 mb-2 leading-relaxed">{section.note}</p>}

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[900px] text-right border-collapse">
          <thead>
            <tr className="bg-white/10">
              <th className="px-2 py-2 text-xs font-bold text-gray-300 w-8">#</th>
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-2 text-xs font-bold text-gray-300" style={{ width: c.width }}>
                  {c.label}
                </th>
              ))}
              {!disabled && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="border-t border-white/5 hover:bg-white/5">
                <td className="px-2 py-1 text-xs text-gray-500 text-center">{i + 1}</td>
                {columns.map((c) => (
                  <td key={c.key} className="px-1 py-0.5">
                    <Cell
                      column={c}
                      value={line[c.key] ?? ''}
                      disabled={disabled}
                      onChange={(v) => setCell(i, c.key, v)}
                    />
                  </td>
                ))}
                {!disabled && (
                  <td className="px-1 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      title="حذف البند"
                      className="text-gray-500 hover:text-brand-red text-lg leading-none px-1"
                    >
                      ×
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!disabled && (
        <button
          type="button"
          onClick={addRow}
          className="mt-3 text-sm font-bold text-brand-gold hover:text-brand-gold/80 transition-colors"
        >
          ＋ إضافة بند
        </button>
      )}
    </div>
  );
}

function Cell({ column, value, onChange, disabled }) {
  if (column.kind === 'select') {
    return (
      <select className={CELL} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {(column.options || []).map((o) => (
          <option key={o} value={o} className="bg-brand-navy">
            {o}
          </option>
        ))}
      </select>
    );
  }

  const type = column.kind === 'number' ? 'number' : column.kind === 'date' ? 'date' : 'text';

  return (
    <input
      type={type}
      className={CELL}
      style={column.ltr ? { direction: 'ltr', textAlign: 'right' } : undefined}
      value={value}
      disabled={disabled}
      placeholder={column.scannable ? 'امسح أو اكتب' : ''}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
