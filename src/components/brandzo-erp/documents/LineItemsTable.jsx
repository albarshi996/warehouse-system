/**
 * جدول البنود — يُرسم من أعمدة المخطّط.
 *
 * الفرق عن الورق: الورق فيه **8 صفوف فارغة مكتوبة في الكود** — لا تزيد ولا تنقص.
 * شحنة من 9 أصناف كانت تحتاج ورقة ثانية، وشحنة من صنفين تطبع 6 صفوف فارغة.
 * هنا: صفوف تُضاف وتُحذف بحسب الشحنة.
 */
import { emptyLine } from '../../../services/documents/schemaUtils.js';

const CELL =
  'w-full bg-transparent border-0 px-2 py-1.5 text-sm text-ink focus:outline-none ' +
  'focus:bg-surface-2 rounded disabled:opacity-60';

export default function LineItemsTable({
  schema,
  section,
  lines,
  onChange,
  onLookup,
  disabled,
  uomOptions,
  binOptions,
  binVerdict,
}) {
  const columns = section.columns || [];
  // معرّف قائمة الاقتراح — واحدٌ للجدول كلّه، فلا تتكرّر آلاف الخيارات لكل صفّ.
  const binListId = `bin-options-${schema?.type || 'doc'}`;

  function setCell(index, key, value) {
    const next = lines.map((line, i) => (i === index ? { ...line, [key]: value } : line));
    onChange(next);
  }

  /**
   * عمود عليه lookup: اكتمال القيمة (Enter/مغادرة الحقل) يستدعي الماستر.
   * وعمود `sku` مرجعيّ **دائمًا** بلا إعلانٍ في المخطّط (SAP-1 · ف‑٤٣):
   * الكود هو هويّة الصنف، فكتابته تسأل الماستر وتثبّته بصيغته القانونيّة —
   * في هذا المكان الواحد لا في ٣٨ مخطّطًا.
   */
  function triggerLookup(column, index, value) {
    const kind = column.lookup || (column.key === 'sku' ? 'item' : null);
    if (!kind || !onLookup) return;
    const v = String(value ?? '').trim();
    if (v) onLookup(kind, v, index, column.key);
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
      {section.note && <p className="text-[11px] text-muted mb-2 leading-relaxed">{section.note}</p>}

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[900px] text-right border-collapse">
          <thead>
            <tr className="bg-chip">
              <th className="px-2 py-2 text-xs font-bold text-ink-2 w-8">#</th>
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-2 text-xs font-bold text-ink-2" style={{ width: c.width }}>
                  {c.label}
                </th>
              ))}
              {!disabled && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="border-t border-line hover:bg-chip">
                <td className="px-2 py-1 text-xs text-gray-500 text-center">{i + 1}</td>
                {columns.map((c) => (
                  <td key={c.key} className="px-1 py-0.5">
                    <Cell
                      column={c}
                      value={line[c.key] ?? ''}
                      disabled={disabled}
                      onChange={(v) => setCell(i, c.key, v)}
                      onCommit={(v) => triggerLookup(c, i, v)}
                      // SAP-3 (ف‑٤٢): عمود الوحدة اختيارٌ من سيّد الوحدات لا نصٌّ
                      // حرّ — مركزيًّا هنا لا في ٣٨ مخطّطًا، والنصّ القديم يبقى خيارًا.
                      uomChoices={c.key === 'uom' && uomOptions ? uomOptions(line) : null}
                      // LOC-104: خانة الموقع مرجعيّة **مركزيًّا هنا** لا في كل
                      // مخطّط — اقتراحٌ يُعين من يكتب، وحكمٌ يُنبّه ولا يمنع.
                      listId={c.key === 'bin' && binOptions?.length ? binListId : null}
                      verdict={c.key === 'bin' && binVerdict ? binVerdict(line[c.key]) : null}
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

      {/* قائمة اقتراح المواقع — مرّةً واحدة للجدول كلّه */}
      {binOptions?.length > 0 && (
        <datalist id={binListId}>
          {binOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </datalist>
      )}

      {!disabled && (
        <button
          type="button"
          onClick={addRow}
          className="mt-3 text-sm font-bold text-accent hover:text-accent/80 transition-colors"
        >
          ＋ إضافة بند
        </button>
      )}
    </div>
  );
}

function Cell({ column, value, onChange, onCommit, disabled, uomChoices, listId, verdict }) {
  // وحدة السطر: اختيارٌ من قائمة الصنف (أو السيّد كلّه) — القيمة القديمة
  // غير المعروفة تظهر خيارًا كما كُتبت، فلا يُكسر مستندٌ قائم.
  if (uomChoices) {
    return (
      <select className={CELL} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {uomChoices.map((o) => (
          <option key={o.value} value={o.value} className="bg-surface">
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (column.kind === 'select') {
    return (
      <select className={CELL} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {(column.options || []).map((o) => (
          <option key={o} value={o} className="bg-surface">
            {o}
          </option>
        ))}
      </select>
    );
  }

  const type = column.kind === 'number' ? 'number' : column.kind === 'date' ? 'date' : 'text';
  // التنبيه لا يمنع الكتابة ولا الحفظ — يُعلَن ويبقى القرار للمستخدم.
  // (الأصفر تنبيه؛ والأحمر محجوزٌ للتحذير وحده في هذه البوابة.)
  const warn = verdict?.level === 'warn';

  return (
    <input
      type={type}
      className={`${CELL}${warn ? ' ring-1 ring-amber-400/70' : ''}`}
      style={column.ltr ? { direction: 'ltr', textAlign: 'right' } : undefined}
      value={value}
      disabled={disabled}
      list={listId || undefined}
      title={verdict?.message || undefined}
      aria-invalid={warn ? 'true' : undefined}
      placeholder={column.scannable ? 'امسح أو اكتب' : ''}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => onCommit?.(e.target.value)}
      onKeyDown={(e) => {
        // قارئ الباركود «يكتب» ثم يرسل Enter — هذه لحظة الاستدعاء.
        if (e.key === 'Enter') {
          e.preventDefault();
          onCommit?.(e.currentTarget.value);
        }
      }}
    />
  );
}
