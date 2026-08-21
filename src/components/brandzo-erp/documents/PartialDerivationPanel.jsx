/**
 * لوحة التنفيذ الجزئي (CC-204).
 *
 * تجيب عن السؤال الذي كان الزرّ الواحد يخفيه: **كم من هذا السطر أُنفّذ الآن؟**
 * أمر شراء بمئة وحدة يقبل استلامًا بستّين ثمّ آخر بأربعين، ولا يُغلق إلا عند
 * الصفر. لكلّ سطر: المطلوب · المنفَّذ · المفتوح · وكمية هذه المرّة.
 *
 * كل الحساب في `documentFlow.js` الخالص المُختبَر؛ هذه عرضٌ له فقط. والحَكَم
 * النهائيّ هو قفل التخصيص داخل المعاملة — فما يظهر هنا لقطةٌ قد تسبقها معاملة
 * أخرى، وعندها تردّ المعاملة بالخطأ الصحيح بدل أن تتجاوز.
 */
import { useEffect, useMemo, useState } from 'react';
import { partialDerivationPlan } from '../../../services/documents/documentFlow.js';
import { fetchCombinableSources } from '../../../services/documents/documentsService.js';

/** رقمٌ للعرض: بلا أصفار زائدة، وبالأرقام اللاتينية. */
function show(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return String(Math.round(number * 1e6) / 1e6);
}

export default function PartialDerivationPanel({
  source,
  targetType,
  title,
  relations = [],
  documents = [],
  busy = false,
  onConfirm,
  onCancel,
}) {
  const plan = useMemo(() => {
    try {
      return partialDerivationPlan(source, targetType, relations, documents);
    } catch (error) {
      return { failed: true, message: error?.message || 'تعذّر حساب الرصيد المفتوح.' };
    }
  }, [source, targetType, relations, documents]);

  /** الافتراضيّ: كامل المفتوح — فالمسار الشائع يبقى نقرةً واحدة. */
  const [chosen, setChosen] = useState(() => {
    if (!plan?.supported) return {};
    return Object.fromEntries(plan.lines.map((line) => [line.lineId, String(line.open)]));
  });

  /**
   * مصادر أخرى يصحّ دمجها في هذا الابن. تُجلب بمحاولة دمجٍ حقيقيّة لا بتشابه
   * حقول، فما يظهر هنا هو ما ستقبله المعاملة فعلًا. المصدر الإضافيّ يدخل
   * **بكامل رصيده المفتوح** — والتجزئة تبقى للمصدر الحاليّ وحده في هذه الدفعة.
   */
  const [extras, setExtras] = useState([]);
  const [picked, setPicked] = useState([]);
  useEffect(() => {
    let alive = true;
    if (!plan?.supported) return undefined;
    (async () => {
      try {
        const found = await fetchCombinableSources(source, targetType);
        if (alive) setExtras(found);
      } catch {
        if (alive) setExtras([]);
      }
    })();
    return () => { alive = false; };
  }, [source?.id, targetType, plan?.supported]);

  const rows = useMemo(() => {
    if (!plan?.supported) return [];
    return plan.lines.map((line) => {
      const raw = chosen[line.lineId] ?? '';
      const value = raw === '' ? 0 : Number(raw);
      let error = null;
      if (raw !== '' && !Number.isFinite(value)) error = 'رقم غير صالح';
      else if (value < 0) error = 'لا كمية سالبة';
      else if (value > line.open) error = `يتجاوز المتبقّي (${show(line.open)})`;
      return { ...line, raw, value: error ? 0 : value, error };
    });
  }, [plan, chosen]);

  const totalChosen = useMemo(
    () => Math.round(rows.reduce((sum, row) => sum + row.value, 0) * 1e6) / 1e6,
    [rows]
  );
  const hasError = rows.some((row) => row.error);
  const blocked = hasError || totalChosen <= 0 || busy;

  if (plan?.failed) {
    return (
      <div className="rounded-xl border border-line bg-surface p-3 space-y-2">
        <p className="text-xs text-danger">{plan.message}</p>
        <button type="button" onClick={onCancel} className="text-[11px] text-muted underline">إغلاق</button>
      </div>
    );
  }

  /** اشتقاقٌ لا تُعرف خريطة كمياته: يبقى نقرةً واحدة بلا اختيار كاذب. */
  if (!plan?.supported) {
    return (
      <div className="rounded-xl border border-line bg-surface p-3 space-y-3">
        <p className="text-xs text-muted">
          هذا الاشتقاق لا تُعرف له خريطة كميات، فيُنشأ «{title}» كاملًا بلا تجزئة.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm?.(null)}
            className="rounded-xl bg-accent hover:opacity-90 disabled:opacity-50 px-4 py-2 text-xs font-bold text-white transition-colors"
          >
            {busy ? 'جارٍ الإنشاء…' : `أنشئ ${title}`}
          </button>
          <button type="button" onClick={onCancel} className="px-3 py-2 text-xs text-muted hover:underline">إلغاء</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold">كميات «{title}» — هذه المرّة</p>
        <p className="text-[11px] text-muted">المفتوح الكلّيّ: {show(plan.totalOpen)}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="text-muted">
            <tr className="text-right">
              <th className="py-1 pe-2 font-normal">#</th>
              <th className="py-1 pe-2 font-normal">الصنف</th>
              <th className="py-1 pe-2 font-normal">المطلوب</th>
              <th className="py-1 pe-2 font-normal">المنفَّذ</th>
              <th className="py-1 pe-2 font-normal">المفتوح</th>
              <th className="py-1 pe-2 font-normal">هذه المرّة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.lineId} className="border-t border-line align-top">
                <td className="py-1 pe-2 text-muted">{row.lineNumber}</td>
                <td className="py-1 pe-2">
                  {row.sku || '—'}
                  {row.description ? <span className="block text-muted">{row.description}</span> : null}
                </td>
                <td className="py-1 pe-2">{show(row.capacity)}</td>
                <td className="py-1 pe-2">{show(row.executed)}</td>
                <td className="py-1 pe-2 font-bold">{show(row.open)}</td>
                <td className="py-1 pe-2">
                  {row.open <= 0 ? (
                    <span className="text-muted">مغلق</span>
                  ) : (
                    <>
                      <input
                        type="number"
                        min="0"
                        max={row.open}
                        step="any"
                        value={row.raw}
                        disabled={busy}
                        onChange={(event) => setChosen((prev) => ({ ...prev, [row.lineId]: event.target.value }))}
                        className="w-20 rounded-lg border border-line bg-chip px-2 py-1 text-[11px]"
                        aria-label={`كمية السطر ${row.lineNumber}`}
                      />
                      {row.error ? <span className="block text-danger">{row.error}</span> : null}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {extras.length > 0 && (
        <div className="rounded-lg border border-line p-2 space-y-1">
          <p className="text-[11px] text-muted">
            مصادر أخرى يصحّ ضمّها إلى «{title}» نفسه (بكامل رصيدها المفتوح):
          </p>
          {extras.map((item) => (
            <label key={item.document.id} className="flex items-center gap-2 text-[11px]">
              <input
                type="checkbox"
                disabled={busy}
                checked={picked.includes(item.document.id)}
                onChange={(event) => setPicked((prev) => (
                  event.target.checked
                    ? [...prev, item.document.id]
                    : prev.filter((id) => id !== item.document.id)
                ))}
              />
              <span>{item.document.number || item.document.id}</span>
              <span className="text-muted">— مفتوح {show(item.totalOpen)}</span>
            </label>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={blocked}
          onClick={() => onConfirm?.(
            Object.fromEntries(rows.filter((row) => row.value > 0).map((row) => [row.lineId, row.value])),
            extras.filter((item) => picked.includes(item.document.id)).map((item) => item.document),
          )}
          className="rounded-xl bg-accent hover:opacity-90 disabled:opacity-50 px-4 py-2 text-xs font-bold text-white transition-colors"
        >
          {busy ? 'جارٍ الإنشاء…' : `أنشئ ${title} بـ ${show(totalChosen)}${picked.length ? ` + ${picked.length} مصدرًا` : ''}`}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setChosen(Object.fromEntries(plan.lines.map((line) => [line.lineId, String(line.open)])))}
          className="px-3 py-2 text-xs text-muted hover:underline"
        >
          كامل المتبقّي
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className="px-3 py-2 text-xs text-muted hover:underline">إلغاء</button>
        {totalChosen <= 0 && !hasError ? (
          <span className="text-[11px] text-muted">اختر كميةً موجبةً واحدةً على الأقل.</span>
        ) : null}
      </div>
    </div>
  );
}
