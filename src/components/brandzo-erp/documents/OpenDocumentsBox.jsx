/**
 * صندوق المستندات المفتوحة — عملُ اليوم (SAP-12 · يسدّ ف‑٣٠ وف‑٤٥).
 *
 * غير صندوق الاعتماد: ذاك يعرض ما ينتظر توقيعك، وهذا **ما لم يكتمل**.
 * أمرُ شراءٍ وصل نصفه، وتسليمٌ لم يُؤكَّد — معتمَدةٌ وموقَّعة ولا تنتظر أحدًا،
 * وعملُها لم يتمّ. والمرجع ‹1976› يسمّيه «صندوق أعمال الموظّف اليوميّ».
 *
 * كلّ الحساب في `openBox.js` الخالص المُختبَر؛ هذا عرضٌ له.
 */
import { useEffect, useMemo, useState } from 'react';
import { getBasePath } from '../../../services/auth/authService.js';
import { listenDocumentsByTypes } from '../../../services/documents/documentsService.js';
import { getSchema, readyTypes } from '../../../services/documents/schemas/index.js';
import { buildOpenBox, ageInDays, tracksExecution } from '../../../services/documents/openBox.js';
import { fieldRouteFor } from '../../../services/tasks/fieldRoutes.js';

/** حدّ التأخّر — ظاهرٌ في الواجهة لا مخبوزٌ في الكود. */
const STALE_DAYS = 7;

function typeLabel(type) {
  return getSchema(type)?.titleAr || type;
}

export default function OpenDocumentsBox() {
  const [docs, setDocs] = useState([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [nowMs] = useState(() => Date.now());
  /** جذرُ النشر عارٍ — لأنّ الشاشةَ الميدانيّة ليست تحت `/dashboard/document`. */
  const root = getBasePath();
  const base = `${root}/dashboard/document`;

  /** الأنواع التي لها مسار تنفيذٍ كمّيّ وحدها — ما لا يُفتح لا يُعرض. */
  const trackedTypes = useMemo(() => readyTypes().filter(tracksExecution), []);

  useEffect(() => {
    if (!trackedTypes.length) return undefined;
    return listenDocumentsByTypes(trackedTypes, setDocs, 300);
  }, [trackedTypes]);

  /**
   * الصندوق يُحسب من بيانات المستند ولقطة روابطه القديمة، بلا جلبٍ لكلّ
   * مستندٍ على حدة. ولذلك الرقم هنا **تقريبٌ صادق**: يُفتح المستند فيُقرأ
   * الدقيق. وقولُ ذلك خيرٌ من عرض رقمٍ يُظنّ نهائيًّا.
   */
  const box = useMemo(() => buildOpenBox(docs), [docs]);

  const rows = useMemo(
    () => (typeFilter === 'all' ? box.rows : box.rows.filter((r) => r.document.type === typeFilter)),
    [box, typeFilter]
  );

  if (!box.count) {
    return (
      <div className="rounded-xl border border-line p-6 text-center" style={{ background: 'var(--surface, #fff)' }}>
        <p className="text-sm font-bold text-ink">لا عملَ مفتوحًا</p>
        <p className="text-xs text-ink-2 mt-1">كلّ المستندات المعتمَدة نُفِّذت أو أُغلقت.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* شريط التجميع بالنوع — كلّ نوعٍ بعدده ومتبقّيه */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTypeFilter('all')}
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors"
          style={
            typeFilter === 'all'
              ? { background: 'var(--accent, #714B67)', color: '#fff', borderColor: 'transparent' }
              : { background: 'var(--chip, #f4f4f6)', color: 'var(--ink, #1c1620)', borderColor: 'var(--line, #e5e5ea)' }
          }
        >
          الكلّ
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{box.count}</span>
        </button>
        {Object.values(box.byType)
          .sort((a, b) => b.count - a.count)
          .map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => setTypeFilter(t.type)}
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors"
              style={
                typeFilter === t.type
                  ? { background: 'var(--accent, #714B67)', color: '#fff', borderColor: 'transparent' }
                  : { background: 'var(--chip, #f4f4f6)', color: 'var(--ink, #1c1620)', borderColor: 'var(--line, #e5e5ea)' }
              }
            >
              {typeLabel(t.type)}
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{t.count}</span>
            </button>
          ))}
      </div>

      {/* الجدول — الأقدم أوّلًا */}
      <div className="overflow-x-auto rounded-lg border border-line" style={{ background: 'var(--surface, #fff)' }}>
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse', minWidth: 620 }}>
          <thead>
            <tr className="text-ink-2 border-b border-line" style={{ background: 'var(--chip, #f4f4f6)' }}>
              <th className="text-right py-2 px-3 font-bold">المستند</th>
              <th className="text-right py-2 px-3 font-bold">النوع</th>
              <th className="text-right py-2 px-3 font-bold">الطرف</th>
              <th className="py-2 px-2 font-bold whitespace-nowrap">مطلوب</th>
              <th className="py-2 px-2 font-bold whitespace-nowrap">منفَّذ</th>
              <th className="py-2 px-2 font-bold whitespace-nowrap">المتبقّي</th>
              <th className="py-2 px-2 font-bold whitespace-nowrap">معلّق منذ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const d = row.document;
              const age = ageInDays(d, nowMs);
              const stale = (age ?? 0) >= STALE_DAYS;
              const party = d.header?.supplier || d.header?.customer || d.header?.beneficiary || '—';
              /**
               * الشاشةُ الميدانيّة لهذا الصفّ — أو `null` فلا رابطَ أصلًا.
               *
               * ★★ ولمَ داخل خانة المستند لا عمودًا أخيرًا؟ لأنّ الصندوق يعرض
               * خمسةَ عشر نوعًا مُتتبَّعًا ولخمسةٍ منها شاشةٌ ميدانيّة — فعمودٌ
               * مستقلٌّ يحجز عرضَه لعشرة صفوفٍ فارغة. وهنا الرابطُ في مجرى
               * النصّ: يظهر لمن له مسارٌ ويختفي بلا أثرٍ لمن لا مسارَ له.
               *
               * ⚠️ ولا حكمَ هنا: النوعُ والحالةُ يُقاسان في `fieldRoutes.js` وحدَه.
               */
              const route = fieldRouteFor(d);
              return (
                <tr key={d.id} className="border-b border-line hover:bg-chip transition-colors">
                  <td className="py-2 px-3">
                    <div className="flex flex-col items-start gap-1">
                      <a
                        href={`${base}?type=${d.type}&id=${d.id}`}
                        className="font-bold underline decoration-dotted underline-offset-4"
                        style={{ color: 'var(--accent, #714B67)' }}
                      >
                        {d.number || d.id}
                      </a>
                      {route && (
                        <a
                          href={`${root}${route.path}`}
                          title={route.reason}
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap"
                          style={{ background: 'var(--accent, #714B67)', color: '#fff' }}
                        >
                          {route.label}
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-ink-2">{typeLabel(d.type)}</td>
                  <td className="py-2 px-3 text-ink">{party}</td>
                  <td className="py-2 px-2 text-center text-ink-2" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {row.totals.requested}
                  </td>
                  <td className="py-2 px-2 text-center text-ink-2" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {row.totals.executed}
                  </td>
                  <td className="py-2 px-2 text-center font-bold text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {row.status.open}
                  </td>
                  <td className="py-2 px-2 text-center whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {age === null ? (
                      <span className="text-ink-2">—</span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 border"
                        style={
                          stale
                            ? { color: '#8a6d1b', background: '#fdf6e3', borderColor: '#e6d08a' }
                            : { color: 'var(--ink-2, #5f5668)', background: 'transparent', borderColor: 'transparent' }
                        }
                        title={stale ? `تجاوز ${STALE_DAYS} أيّام` : ''}
                      >
                        {stale && <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />}
                        {age === 0 ? 'اليوم' : age === 1 ? 'يوم' : age === 2 ? 'يومان' : `${age} يومًا`}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-ink-2">
        المتبقّي محسوبٌ من روابط الأسطر المعروفة للمستند. افتح المستند لترى الرقم الدقيق بعد قراءة علاقاته كلّها.
      </p>
    </div>
  );
}
