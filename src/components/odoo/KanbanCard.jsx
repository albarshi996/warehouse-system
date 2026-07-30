/**
 * KanbanCard — بطاقة كانبان من ثلاثة أسطر لأودو (D2 · النمط ٤).
 * عنوان، سطر فرعي، تذييل بالأولوية (نجوم) والمسؤول (حرف في دائرة).
 *
 * props:
 *   title, sub: string
 *   priority:  number 0..3   // عدد النجوم الممتلئة
 *   assignee:  string        // حرف/حرفان للمسؤول
 *   current:   boolean       // إبراز البطاقة الحالية بحدّ ملوّن
 *   onClick:   () => void
 */
export default function KanbanCard({ title, sub, priority = 0, assignee = '', current = false, onClick }) {
  const stars = '★'.repeat(Math.min(3, priority)) + '☆'.repeat(Math.max(0, 3 - priority));
  return (
    <div
      className={`o_kanban_record${current ? ' o_current' : ''}`}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      role="button"
      tabIndex={0}
    >
      <div className="o_kanban_title">{title}</div>
      <div className="o_kanban_sub">{sub}</div>
      <div className="o_kanban_footer">
        <span className="o_priority" aria-label={`الأولوية ${priority} من 3`}>{stars}</span>
        {assignee && <span className="o_avatar" style={{ background: 'var(--o-gray-300)', color: 'var(--o-gray-700)' }}>{assignee}</span>}
      </div>
    </div>
  );
}
