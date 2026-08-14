/**
 * حقل طرفٍ منبثق من قوائم النظام (SAP-20 · طلب المالك 2026-08-14).
 *
 * «عند إنشاء أيّ مستند يجب تحديد المورد/العميل/المندوب/الفرع من القائمة
 * التي في النظام» — التركيز على الحقل يفتح القائمة، والكتابة تبحث احتواءً
 * بالرمز والاسم، و`***` تعرض الكلّ، والاختيار يملأ **الرمز والاسم معًا**
 * (الشقّ الحيّ من ف‑٤٤). والكتابة الحرّة تبقى ممكنة توافقًا — طرفٌ قديم
 * لم يُسجَّل بعد لا يوقف العمل، لكنّ القائمة هي الطريق الأوّل.
 *
 * كلّ الحكم في `services/documents/partyFields.js` الخالص المُختبَر.
 */
import { useMemo, useRef, useState } from 'react';
import { filterPartyOptions } from '../../../services/documents/partyFields.js';

const BASE =
  'w-full bg-chip border border-line rounded-lg px-3 py-2 text-sm text-ink ' +
  'placeholder:text-gray-500 focus:outline-none focus:border-accent/60 disabled:opacity-60';

export default function PartyField({ value, options = [], disabled, violation, placeholder, onType, onSelect }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState(null); // null = لم يكتب بعد — يُعرض value
  const blurTimer = useRef(null);

  const shown = useMemo(
    () => filterPartyOptions(options, term ?? ''),
    [options, term]
  );

  function choose(option) {
    clearTimeout(blurTimer.current);
    setOpen(false);
    setTerm(null);
    onSelect?.(option);
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        className={`${BASE} ${violation ? 'border-brand-red ring-1 ring-brand-red/50' : ''}`}
        value={term ?? value ?? ''}
        placeholder={placeholder || 'اكتب للبحث أو *** لعرض القائمة…'}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
          onType?.(e.target.value);
        }}
        onBlur={() => {
          // مهلة قصيرة كي تسبق نقرةُ الخيار إغلاقَ القائمة.
          blurTimer.current = setTimeout(() => {
            setOpen(false);
            setTerm(null);
          }, 150);
        }}
      />
      {open && !disabled && shown.length > 0 && (
        <div
          role="listbox"
          style={{
            position: 'absolute', insetInline: 0, top: 'calc(100% + 4px)', zIndex: 40,
            maxHeight: '260px', overflowY: 'auto',
            background: 'var(--surface, #fff)',
            border: '1px solid var(--line, #e5e5ea)',
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(31, 41, 55, 0.16)',
          }}
        >
          {shown.map((o) => (
            <button
              key={`${o.code}|${o.name}`}
              type="button"
              role="option"
              onMouseDown={(e) => e.preventDefault() /* لا يسبق blur النقرةَ */}
              onClick={() => choose(o)}
              className="w-full text-right px-3 py-2 text-sm hover:bg-chip transition-colors"
              style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', border: 'none', background: 'none', cursor: 'pointer' }}
            >
              <span className="text-ink font-bold truncate">{o.name || o.code}</span>
              <span className="text-gray-500 text-xs" style={{ fontFamily: 'monospace', direction: 'ltr' }}>{o.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
