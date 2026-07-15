/**
 * سجلّ التدقيق — قصّة المستند بالترتيب: من فعل ماذا ومتى.
 * سجلّ لا يُعدَّل ولا يُحذف (نفس نمط `scans`) — التاريخ لا يُزوَّر.
 */
import { getState } from '../../../services/documents/states.js';
import { getRole } from '../../../services/auth/roles.js';

const ACTION_LABELS = {
  create: { label: 'أنشأ المسودّة', emoji: '📝' },
  submitted: { label: 'أرسل للاعتماد', emoji: '📤' },
  approved: { label: 'اعتمد', emoji: '✅' },
  rejected: { label: 'رفض', emoji: '❌' },
  done: { label: 'أنهى المستند', emoji: '🏁' },
};

function fmt(ts) {
  const d = ts?.toDate?.();
  if (!d) return 'الآن';
  return d.toLocaleString('ar-LY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AuditTrail({ entries }) {
  if (!entries?.length) {
    return <p className="text-xs text-gray-500">لا قيود بعد.</p>;
  }

  return (
    <ol className="space-y-2">
      {entries.map((e) => {
        const action = ACTION_LABELS[e.action] || { label: e.action, emoji: '•' };
        const role = e.byRole ? getRole(e.byRole) : null;
        return (
          <li key={e.id} className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
            <span className="text-base leading-6">{action.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-200">
                <strong className="text-white">{e.byName}</strong>
                {role && (
                  <span className="text-[11px] mr-1.5" style={{ color: role.color }}>
                    ({role.label})
                  </span>
                )}
                <span className="text-gray-400"> — {action.label}</span>
                {e.from && e.to && (
                  <span className="text-[11px] text-gray-500 mr-1.5">
                    {getState(e.from).label} ← {getState(e.to).label}
                  </span>
                )}
              </p>
              {e.note && <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">«{e.note}»</p>}
            </div>
            <span className="text-[11px] text-gray-500 shrink-0">{fmt(e.at)}</span>
          </li>
        );
      })}
    </ol>
  );
}
