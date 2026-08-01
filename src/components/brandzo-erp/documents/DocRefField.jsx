/**
 * حقل مرجع مستنديّ (docref) — «العملية الجراحية» المحور ٦.
 *
 * يحوّل حقل الرقم المرجعيّ (poRef, grnRef…) من نصٍّ حرٍّ ميّت إلى **تعرّفٍ
 * تلقائيّ**: يكتب المستخدم رقم الأب (PO-…) فيُبحَث عنه بـ`lookupByNumber`،
 * وإن وُجد ونوعه صحيح يُربَط تراكميًّا (`onResolveParent`) — فيعمل شريط
 * السلسلة والمطابقة الثلاثية فورًا كأنّه اشتقاق. الأب غير المعتمَد يُربَط مع
 * تحذيرٍ أصفر (حارس «لا إنجاز قبل اعتماد الأب» يمنع الإغلاق لاحقًا).
 *
 * البحث عند مغادرة الحقل أو ضغط Enter — لا في كل ضغطة (توفير قراءات).
 */
import { useState } from 'react';
import { lookupByNumber } from '../../../services/documents/documentsService.js';

const STATE_AR = {
  draft: 'مسودّة',
  submitted: 'مُرسَل',
  approved: 'معتمَد',
  rejected: 'مرفوض',
  done: 'منجَز',
};
const APPROVED = ['approved', 'done'];

const BASE =
  'w-full bg-chip border border-line rounded-lg px-3 py-2 text-sm text-ink ' +
  'placeholder:text-gray-500 focus:outline-none focus:border-accent/60 disabled:opacity-60';

export default function DocRefField({ field, doc, value, onChange, disabled, onResolveParent }) {
  const [status, setStatus] = useState(null); // { kind, parent?, msg? }
  const parentType = field.docType;
  const linked = doc?.links?.[parentType]; // { id, number } إن رُبِط فعلًا

  async function lookup() {
    const num = String(value || '').trim();
    if (!num) {
      setStatus(null);
      return;
    }
    // مربوط فعلًا بنفس الرقم ⇒ لا داعي لإعادة البحث.
    if (linked?.number === num && status?.kind === 'found') return;
    setStatus({ kind: 'searching' });
    try {
      const parent = await lookupByNumber(num);
      if (!parent) {
        setStatus({ kind: 'notfound' });
        return;
      }
      if (parent.type !== parentType) {
        setStatus({
          kind: 'wrong',
          msg: `الرقم ${num} من نوع «${parent.type}» لا «${parentType}» — تحقّق من الرقم`,
        });
        return;
      }
      setStatus({ kind: 'found', parent });
      onResolveParent?.(field, parent);
    } catch {
      setStatus({ kind: 'error' });
    }
  }

  const onKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      lookup();
    }
  };

  // شريحة الحالة أسفل الحقل
  let chip = null;
  const found = status?.kind === 'found' ? status.parent : linked ? { number: linked.number } : null;
  if (status?.kind === 'searching') {
    chip = <span className="text-[11px] text-gray-400">…جارٍ التعرّف</span>;
  } else if (status?.kind === 'wrong') {
    chip = <span className="text-[11px] text-red-300">⚠️ {status.msg}</span>;
  } else if (status?.kind === 'notfound') {
    chip = (
      <span className="text-[11px] text-amber-300">
        ⚠️ لا مستند بهذا الرقم — تحقّق منه، أو أنشئ الأب أولًا ثم ارجع (الإنشاء المباشر لاحقًا).
      </span>
    );
  } else if (status?.kind === 'error') {
    chip = <span className="text-[11px] text-red-300">⚠️ تعذّر التعرّف — تحقّق من الاتصال</span>;
  } else if (found) {
    const st = status?.parent?.state;
    const notApproved = st && !APPROVED.includes(st);
    chip = (
      <span
        className={`inline-flex items-center gap-1.5 text-[11px] font-bold rounded px-2 py-0.5 ${
          notApproved ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'
        }`}
      >
        <span>✓ مربوط: {found.number}</span>
        {st && <span className="opacity-70">({STATE_AR[st] || st})</span>}
        {notApproved && <span>— سلسلة غير معتمَدة</span>}
      </span>
    );
  }

  return (
    <div>
      <label className="block text-xs font-bold text-ink-2 mb-1.5">
        {field.label}
        {field.required && <span className="text-brand-red mr-1">*</span>}
      </label>
      <input
        type="text"
        className={BASE}
        value={value}
        disabled={disabled}
        placeholder={`رقم ${parentType}-… ثم Enter`}
        onChange={(e) => {
          onChange(field.key, e.target.value);
          if (status) setStatus(null); // يتغيّر الرقم ⇒ تُلغى الحالة السابقة
        }}
        onBlur={lookup}
        onKeyDown={onKey}
      />
      <div className="mt-1 min-h-[16px]">{chip}</div>
    </div>
  );
}
