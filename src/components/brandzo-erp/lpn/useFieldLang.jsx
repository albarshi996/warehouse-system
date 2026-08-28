/**
 * لغةُ التطبيق الميدانيّ — خيارٌ يبقى على الجهاز، وأثرُه محصورٌ بشاشاته.
 *
 * ★ لماذا `localStorage` لا حقلٌ على المستخدم؟ لأنّ اللغة خيارُ **جهازٍ**
 * لا خيارُ حساب: الهاتفُ المشترك في المستودع يمرّ بين عمّالٍ، ولأنّ كتابة
 * حقلٍ على `users` تمسّ سجلًّا يعمل وتحتاج قاعدةً — وهذه إضافةٌ لا تمسّ
 * شيئًا.
 *
 * وقراءةُ التخزين محروسةٌ بـ`try`: متصفّحٌ يمنع تخزين الموقع يعيد الأصل
 * ولا يُسقط الشاشة.
 */
import { useCallback, useEffect, useState } from 'react';

import { DEFAULT_LANG, FIELD_LANGS, dirOf, isFieldLang, t } from '../../../services/lpn/fieldLexicon.js';

const KEY = 'bz.lpn.fieldLang';

function readStored() {
  try {
    const v = window.localStorage.getItem(KEY);
    return isFieldLang(v) ? v : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

/** @returns {{lang:string, dir:string, setLang:(l:string)=>void, tr:(k:string)=>string}} */
export function useFieldLang() {
  // يبدأ بالأصل دائمًا ثمّ يُقرأ المخزَّن بعد التركيب — فلا يفترق ما يُرسَم
  // على الخادم عمّا يُرسَم في المتصفّح.
  const [lang, setLangState] = useState(DEFAULT_LANG);

  useEffect(() => { setLangState(readStored()); }, []);

  const setLang = useCallback((next) => {
    const safe = isFieldLang(next) ? next : DEFAULT_LANG;
    setLangState(safe);
    try { window.localStorage.setItem(KEY, safe); } catch { /* تخزينٌ ممنوع — الخيارُ يعيش للجلسة */ }
  }, []);

  const tr = useCallback((key) => t(lang, key), [lang]);

  return { lang, dir: dirOf(lang), setLang, tr };
}

/** مبدّلُ اللغة — ثلاثةُ أزرارٍ صغيرة، ولا يظهر إلّا في شاشات الميدان. */
export function FieldLangSwitch({ lang, setLang }) {
  return (
    <div className="flex gap-1 mb-3" aria-label={t(lang, 'lang')}>
      {FIELD_LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={() => setLang(l.id)}
          aria-pressed={lang === l.id}
          className="btn btn-secondary"
          style={{
            fontSize: 'var(--o-font-size-xs)',
            padding: '2px 10px',
            ...(lang === l.id ? { fontWeight: 800, borderColor: 'var(--o-brand-primary)' } : null),
          }}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
