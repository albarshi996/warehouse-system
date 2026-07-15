/**
 * شريط الحالة — رقم المستند وحالته والإجراءات المتاحة **لهذا المستخدم**.
 *
 * الزرّ الذي لا يملكه المستخدم لا يُرسم أصلًا. وهذا تجميل لا حماية:
 * الرفض الحقيقي في الخدمة وفي قواعد أمان Firestore.
 */
import { useState } from 'react';
import { getState, availableTransitions } from '../../../services/documents/states.js';

export default function StateBar({ doc, schema, me, onTransition, onSave, onPrint, saving, dirty }) {
  const [note, setNote] = useState('');
  const [asking, setAsking] = useState(null);
  const state = getState(doc?.state);
  const transitions = availableTransitions(doc, { role: me?.role, uid: me?.uid }, schema);

  async function run(t) {
    if (t.needsNote && !asking) {
      setAsking(t);
      return;
    }
    await onTransition(t.to, note);
    setAsking(null);
    setNote('');
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3 no-print">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="px-3 py-1 rounded-full text-xs font-bold border"
            style={{ color: state.color, borderColor: `${state.color}66`, background: `${state.color}1a` }}
          >
            {state.emoji} {state.label}
          </span>
          {doc?.number ? (
            <span className="font-mono text-lg font-bold text-brand-gold tracking-wide">{doc.number}</span>
          ) : (
            <span className="text-xs text-gray-400">الرقم الرسمي يُمنح عند الإرسال</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {dirty && <span className="text-[11px] text-brand-gold">تغييرات غير محفوظة</span>}
          {onSave && (
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !dirty}
              className="px-4 py-2 rounded-lg text-sm font-bold bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 transition-colors"
            >
              {saving ? 'جارٍ الحفظ…' : '💾 حفظ المسودّة'}
            </button>
          )}
          {transitions.map((t) => (
            <button
              key={t.to}
              type="button"
              onClick={() => run(t)}
              disabled={saving}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40 ${
                t.to === 'rejected'
                  ? 'bg-brand-red/20 text-red-200 hover:bg-brand-red/30 border border-brand-red/40'
                  : 'bg-brand-gold text-brand-navy hover:bg-brand-gold/85'
              }`}
            >
              {t.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onPrint}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            🖨️ طباعة
          </button>
        </div>
      </div>

      {asking && (
        <div className="bg-brand-red/10 border border-brand-red/30 rounded-xl p-3 space-y-2">
          <label className="block text-xs font-bold text-red-200">
            سبب {asking.label} — إلزامي (يُحفظ في سجلّ التدقيق باسمك)
          </label>
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white min-h-[64px]"
            placeholder="مثال: حرارة المجمدات -12°م تتجاوز الحدّ الحرج."
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => run(asking)}
              disabled={!note.trim()}
              className="px-4 py-1.5 rounded-lg text-sm font-bold bg-brand-red text-white disabled:opacity-40"
            >
              تأكيد {asking.label}
            </button>
            <button
              type="button"
              onClick={() => {
                setAsking(null);
                setNote('');
              }}
              className="px-4 py-1.5 rounded-lg text-sm text-gray-300 hover:text-white"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
