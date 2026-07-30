/**
 * StatusBar — شريط المراحل السهمي + أزرار الإجراء لأودو (D2).
 * المراحل قبل الحالية «done»، والحالية «active»، وما بعدها عاديّة.
 * الأسهم تنقلب تلقائيًّا في RTL (تُبنى بـclip-path لا باتجاه فيزيائي).
 *
 * props:
 *   buttons: [{ label, variant='secondary', onClick? }]
 *   stages:  [string]        // أسماء المراحل بالترتيب
 *   current: number          // فهرس المرحلة الحالية (0-based)
 */
export default function StatusBar({ buttons = [], stages = [], current = 0 }) {
  return (
    <div className="o_form_statusbar">
      <div className="o_statusbar_buttons">
        {buttons.map((b, i) => (
          <button key={i} type="button" className={`btn btn-${b.variant || 'secondary'}`} onClick={b.onClick}>
            {b.label}
          </button>
        ))}
      </div>
      <div className="o_statusbar_status" role="list" aria-label="مراحل المستند">
        {stages.map((s, i) => {
          const cls = i < current ? 'done' : i === current ? 'active' : '';
          return (
            <span key={i} className={`o_arrow ${cls}`} role="listitem" aria-current={i === current ? 'step' : undefined}>
              {s}
            </span>
          );
        })}
      </div>
    </div>
  );
}
