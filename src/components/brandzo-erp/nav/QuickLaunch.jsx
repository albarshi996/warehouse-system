/**
 * ‹ترتيب سهل› بحثٌ سريعٌ يقفز لأيّ شاشة — طلب المالك 2026-11-12.
 *
 * ١٢٥ شاشةً كثيرةٌ على عينٍ واحدة. فبدل التنقّل في القوائم: تكتب كلمةً
 * («عهد» · «استلام» · «جرد») فتظهر الشاشاتُ المطابقةُ **التي يفتحها دورُك**،
 * وتقفز إليها بضغطةٍ أو Enter.
 *
 * ★ مصدرٌ واحد: القائمةُ من `flatItems()` (navCatalog)، والترشيحُ بالدور من
 *   `canOpenPath` نفسِها التي تحرس الصفحات — فلا يظهر ما لا يُفتح، ولا منطقَ
 *   صلاحيّاتٍ جديد. **عرضٌ فقط: لا يكتب شيئًا ولا يمسّ قاعدة.**
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { flatItems } from '../../../services/auth/navCatalog.js';
import { canOpenPath } from '../../../services/auth/pageAccess.js';
import { screenMatchScore } from '../../../services/auth/navSearchAliases.js';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import Icon from '../../ui/Icon.jsx';

const BASE = String(import.meta.env.BASE_URL || '/').replace(/\/$/, '');

export default function QuickLaunch() {
  const [role, setRole] = useState(null);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      try {
        const p = user ? await fetchUserProfile(user) : null;
        setRole(p?.role || null);
      } catch {
        setRole(null);
      }
    });
    return () => (typeof unsub === 'function' ? unsub() : undefined);
  }, []);

  // كلُّ الشاشات التي يفتحها هذا الدور — فريدةٌ بالمسار، بالمصدر الواحد navCatalog.
  const screens = useMemo(() => {
    if (!role) return [];
    const seen = new Set();
    const out = [];
    for (const it of flatItems()) {
      const path = String(it?.path || '');
      if (!path || seen.has(path)) continue;
      if (!canOpenPath(role, path)) continue;
      seen.add(path);
      out.push({ path, label: String(it.label || path), icon: it.icon || 'grid' });
    }
    return out;
  }, [role]);

  // ‹إصلاح البحث› المطابقةُ بالتسمية **والمرادفات** بعد تطبيعٍ عربيّ، كلمةً كلمة —
  // فـ«دخول» تجد «مركز البوابة» و«تقرير العهدة» تجد «العهد النقديّة». ومطابقُ التسمية أوّلًا.
  const results = useMemo(() => {
    const term = q.trim();
    if (!term) return [];
    return screens
      .map((s) => ({ s, score: screenMatchScore(s, term) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.s);
  }, [q, screens]);

  useEffect(() => setActive(0), [q]);

  function go(item) {
    if (item?.path) window.location.href = `${BASE}${item.path}`;
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      setQ('');
      return;
    }
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[active]);
    }
  }

  return (
    <div style={{ position: 'relative' }} dir="rtl">
      <div className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-card focus-within:border-accent/50 transition-all">
        <Icon name="search" size={18} className="text-accent shrink-0" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder="ابحث عن أيّ شاشة واقفز إليها — اكتب «عهد» أو «استلام»…"
          className="flex-1 bg-transparent outline-none text-ink text-base placeholder:text-muted"
          autoComplete="off"
          aria-label="بحث سريع عن شاشة"
        />
        {q ? (
          <button
            type="button"
            onClick={() => {
              setQ('');
              inputRef.current?.focus();
            }}
            className="text-muted hover:text-ink text-sm"
            aria-label="مسح البحث"
          >
            ✕
          </button>
        ) : null}
      </div>

      {q.trim() ? (
        <div
          className="absolute z-50 mt-2 w-full rounded-card border border-line bg-surface shadow-card"
          style={{ maxHeight: '340px', overflowY: 'auto' }}
        >
          {results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted">لا شاشةَ باسم «{q.trim()}» ضمن صلاحيّتك.</div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.path}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r)}
                className={`group flex w-full items-center gap-3 px-4 py-3 text-right transition-colors ${
                  i === active ? 'bg-surface-2' : 'bg-surface hover:bg-surface-2'
                }`}
              >
                <span className="inline-grid place-items-center w-9 h-9 rounded-lg bg-accent/10 border border-accent/25 text-accent shrink-0">
                  <Icon name={r.icon} size={17} />
                </span>
                <span className="flex-1 font-bold text-ink truncate">{r.label}</span>
                <span className="text-muted group-hover:text-accent text-sm whitespace-nowrap">فتح ←</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
