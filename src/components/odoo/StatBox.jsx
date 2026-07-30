/**
 * StatBox — صندوق أزرار الإحصاء لأودو (D2).
 * كل زرّ: قيمة كبيرة فوق تسمية صغيرة، ينقل إلى العرض المرتبط.
 *
 * props:
 *   stats: [{ value, text, onClick? }]
 */
export default function StatBox({ stats = [] }) {
  if (stats.length === 0) return null;
  return (
    <div className="o_button_box">
      {stats.map((s, i) => (
        <button key={i} type="button" className="o_stat_button" onClick={s.onClick}>
          <span className="o_stat_value">{s.value}</span>
          <span className="o_stat_text">{s.text}</span>
        </button>
      ))}
    </div>
  );
}
