/**
 * لوحة العروض داخل محرّك المستندات — التطبيق الآليّ لحظة إدخال الطلب.
 *
 * هذه هي النقطة التي يُمنع عندها تسريب الترويجات فعلًا: لا يمنح المندوب العرض
 * من ذاكرته، بل يحسبه النظام أمامه ويُظهره، ويُدخله بضغطةٍ واحدة.
 *
 * ═══ ضمانتان تصميميّتان ═══
 * ① **التقييم على البنود المدفوعة وحدها.** المجّانيّ لا يُحتسب في عتبة استحقاق
 *    مجّانيٍّ آخر — وإلّا لتوالدت الهدايا: عشرون تُنتج اثنين، والاثنان يقتربان
 *    من عتبةٍ جديدة… وهو عطبٌ صامتٌ يظهر في الميزانيّة بعد شهر.
 * ② **التطبيق إيديمبوتنت.** كلّ ضغطةٍ تُزيل ما أضافه العرض سابقًا ثمّ تُعيد
 *    الحساب من الأصل. فالضغط مرّتين كالضغط مرّة — والمندوب يضغط مرّتين.
 */
import { useEffect, useMemo, useState } from 'react';
import { listenPromotions } from '../../../services/promotions/promotionsService.js';
import { evaluateOrder } from '../../../services/promotions/promotionEngine.js';
import { paidLines, applyPromoResult, isInSync } from '../../../services/promotions/invoiceApply.js';

/** الأنواع التي تُطبَّق عليها العروض. */
const PROMO_DOC_TYPES = new Set(['VSI', 'SO']);

const btn = 'rounded-lg px-4 py-2.5 text-sm bg-accent text-white disabled:opacity-50';

export default function PromotionsPanel({ schema, doc, disabled, onApplyLines }) {
  const [promos, setPromos] = useState([]);
  const [err, setErr] = useState('');

  const active = PROMO_DOC_TYPES.has(schema?.type);

  useEffect(() => {
    if (!active) return undefined;
    return listenPromotions(setPromos, (e) => setErr(e?.message || 'تعذّر قراءة العروض'));
  }, [active]);

  // ① التقييم على المدفوع وحده — المجّانيّ لا يُنتج مجّانيًّا.
  const base = useMemo(() => paidLines(doc?.lines), [doc]);

  const result = useMemo(
    () =>
      evaluateOrder({
        lines: base,
        promotions: promos,
        customer: { code: doc?.header?.customerCode, outletType: doc?.header?.outletType },
        day: String(doc?.header?.saleDate || doc?.header?.orderDate || '').slice(0, 10),
      }),
    [base, promos, doc]
  );

  const currentFree = (doc?.lines || []).filter((l) => l?.isFree);
  const inSync = isInSync(doc?.lines, result);

  if (!active) return null;

  return (
    <section className="bg-chip border border-line rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 className="text-ink text-base">العروض الترويجية</h3>
        {!disabled ? (
          <button
            type="button"
            className={btn}
            disabled={inSync && !result.applied.length}
            onClick={() => onApplyLines(applyPromoResult(doc?.lines, result))}
          >
            {inSync ? 'إعادة تطبيق العروض' : 'طبّق العروض على الفاتورة'}
          </button>
        ) : null}
      </div>

      {err ? <p className="text-sm text-red-600 mb-3">{err}</p> : null}

      {!promos.length ? (
        <p className="text-sm text-ink-2">لا عروض معرّفة — يضعها المشرف في شاشة العروض الترويجية.</p>
      ) : null}

      {result.applied.length ? (
        <ul className="space-y-1 text-sm text-ink-2 mb-3">
          {result.applied.map((a) => (
            <li key={a.promoId}>
              <span className="text-ink">{a.nameAr}</span> ({a.code}) — {a.description}
              {a.freeUnits ? ` · ${a.freeUnits} وحدة مجّانيّة` : ''}
              {a.discount ? ` · خصم ${a.discount}` : ''}
            </li>
          ))}
        </ul>
      ) : promos.length ? (
        <p className="text-sm text-ink-2 mb-3">لا عرض ينطبق على هذه الفاتورة.</p>
      ) : null}

      {!inSync && (result.applied.length || currentFree.length) ? (
        <p className="text-sm text-red-600 mb-3">
          بنود الفاتورة لا تطابق العروض المستحقّة — اضغط «طبّق العروض» قبل الحفظ.
        </p>
      ) : null}

      {result.nudges.length ? (
        <div className="border border-line rounded-lg p-3 mb-3">
          <div className="text-sm text-ink mb-1">فرص بيعٍ إضافيّ</div>
          <ul className="text-sm text-ink-2 space-y-1">
            {result.nudges.map((n, i) => <li key={i}>{n.message}</li>)}
          </ul>
        </div>
      ) : null}

      {result.skipped.length ? (
        <details>
          <summary className="text-sm text-ink-2 cursor-pointer">
            لماذا لم تنطبق بقيّة العروض؟ ({result.skipped.length})
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-ink-2">
            {result.skipped.map((s, i) => <li key={i}>{s.code || s.promoId}: {s.reason}</li>)}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
