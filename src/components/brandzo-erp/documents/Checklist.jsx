/**
 * قائمة الفحص — بندٌ إمّا مطابق أو «لا ينطبق»، لا الاثنان معًا.
 * تُحفظ في `header._checklist` كـ { [key]: { checked, na } }.
 */
export default function Checklist({ section, state, onChange, disabled }) {
  const items = section.items || [];
  const checked = items.filter((i) => state?.[i.key]?.checked).length;

  function set(key, patch) {
    onChange({ ...state, [key]: { ...(state?.[key] || {}), ...patch } });
  }

  function selectAll(on) {
    const next = {};
    for (const i of items) next[i.key] = { checked: on, na: false };
    onChange(next);
  }

  return (
    <div>
      {!disabled && (
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300">
            <input
              type="checkbox"
              className="w-4 h-4 accent-brand-gold"
              checked={checked === items.length && items.length > 0}
              ref={(el) => {
                if (el) el.indeterminate = checked > 0 && checked < items.length;
              }}
              onChange={(e) => selectAll(e.target.checked)}
            />
            تحديد الكل (Select all)
          </label>
          <button
            type="button"
            onClick={() => selectAll(false)}
            className="text-xs text-gray-400 hover:text-white underline underline-offset-2"
          >
            مسح الاختيارات
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {items.map((item) => {
          const s = state?.[item.key] || {};
          return (
            <div
              key={item.key}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors ${
                s.checked
                  ? 'bg-green-500/10 border-green-500/30'
                  : s.na
                    ? 'bg-white/5 border-white/10 opacity-60'
                    : 'bg-white/5 border-white/10'
              }`}
            >
              <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-green-500 shrink-0"
                  checked={Boolean(s.checked)}
                  disabled={disabled}
                  onChange={(e) => set(item.key, { checked: e.target.checked, na: false })}
                />
                <span className="text-sm text-gray-200 truncate" title={item.label}>
                  {item.label}
                </span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer text-[11px] text-gray-500 shrink-0">
                <input
                  type="checkbox"
                  className="w-3 h-3 accent-gray-400"
                  checked={Boolean(s.na)}
                  disabled={disabled}
                  onChange={(e) => set(item.key, { na: e.target.checked, checked: false })}
                />
                لا ينطبق
              </label>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 mt-3" aria-live="polite">
        <strong className="text-brand-gold">
          {checked} / {items.length}
        </strong>{' '}
        بنود مطابقة.
      </p>
    </div>
  );
}
