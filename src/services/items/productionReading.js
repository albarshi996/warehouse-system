/**
 * قراءة مستندات الإنتاج ‹FNB-502…504› — منطق خالص بين المستندات والحساب.
 *
 * ═══ لماذا وحدةٌ مستقلّة لا شرطٌ داخل الشاشة ═══
 * ثلاثةُ أحكامٍ هنا **قراراتٌ لا عرض**، وإن سكنت داخل مكوّنٍ انحرفت صامتةً
 * كما انحرف تصنيفُ أزرار بدء المستندات حين كان مصفوفةً محلّيّة:
 *   ① **أيُّ صرفٍ واستلامٍ يخصّان هذا الأمر؟** — بالمرجع المكتوب أو برابط
 *      الاشتقاق، لا بتقارب التاريخ ولا بتشابه الصنف.
 *   ② **أمرٌ بأكثر من مخرَج لا يُنسب له متوقَّع** — الموادّ صُرفت للاثنين،
 *      ونسبةُ الصرف كلِّه إلى كلٍّ منهما تُضخّم الرقم ضِعفَين وتقول للطاهي
 *      إنّه أهدر ما لم يُهدره.
 *   ③ **قرار الجودة يُبحث عنه ولا يُفترض** — يُقرأ من مستند فحصٍ يحمل الدفعة
 *      نفسها؛ وغيابُه غيابٌ يُعلَن، لا «مقبولة» ضمنيّة.
 *
 * والحساب نفسه يبقى حيث هو: `expectedFromIssued` و`yieldOf` و`yieldException`
 * تُستدعى من مصدرها ولا يُعاد بناؤها هنا.
 */
import { normalizeItemCode } from './itemIdentity.js';
import { expectedFromIssued, yieldException, yieldOf } from './productionBatch.js';

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * صرفُ الموادّ واستلامُ الإنتاج المرتبطان بأمرٍ — **بالمرجع لا بالتخمين**.
 *
 * المستند يُنسب للأمر إن حمل رقمَه في `header.productionRef` أو وُلد منه
 * (`links.sourceId`). ومستندٌ بلا أيّهما لا يُنسب ولو كان في اليوم نفسه —
 * فنسبةٌ بالحدس تخلط دفعتَي مطبخٍ واحد وتفسد قياسهما معًا.
 *
 * @returns {{issues:object[], receipts:object[]}}
 */
export function linkedProduction(order, docs = []) {
  if (!order) return { issues: [], receipts: [] };
  const number = str(order.number);
  const belongs = (d) => {
    const ref = str(d?.header?.productionRef);
    return (!!number && ref === number) || (!!order.id && d?.links?.sourceId === order.id);
  };
  const list = Array.isArray(docs) ? docs : [];
  return {
    issues: list.filter((d) => d?.type === 'MIS' && belongs(d)),
    receipts: list.filter((d) => d?.type === 'PRC' && belongs(d)),
  };
}

/** ما صُرف فعلًا مجموعًا بالصنف — مدخلُ `expectedFromIssued`. */
export function issuedBySku(issues = []) {
  const map = new Map();
  for (const doc of Array.isArray(issues) ? issues : []) {
    for (const line of doc?.lines || []) {
      const code = normalizeItemCode(line?.sku);
      if (!code) continue;
      const q = num(line?.qtyIssued ?? line?.qty);
      if (q > 0) map.set(code, num(map.get(code)) + q);
    }
  }
  return map;
}

/** ما أُنتج فعلًا مجموعًا بالصنف — من بنود استلام الإنتاج. */
export function producedBySku(receipts = []) {
  const map = new Map();
  for (const doc of Array.isArray(receipts) ? receipts : []) {
    for (const line of doc?.lines || []) {
      const code = normalizeItemCode(line?.sku);
      if (!code) continue;
      const q = num(line?.qtyProduced);
      if (q > 0) map.set(code, num(map.get(code)) + q);
    }
  }
  return map;
}

/**
 * صفوفُ قياس الـYield لأمر إنتاج — رقمان لكلّ مخرَج ومعهما قراءتهما.
 *
 * ★ `attributable` هو الحكم ②: بمخرَجٍ واحدٍ يُحسب المتوقَّع من الموادّ
 * المصروفة، وبأكثرَ **يُسكَت عنه** ويبقى القياس بالمخطَّط وحده. والسكوت
 * صفةٌ في الصفّ تُعرَض، لا رقمٌ يُخترع.
 *
 * @returns {object[]} `{sku, description, exp, result, exception, attributable}`
 */
export function yieldRows(order, docs = [], index, itemsBySku) {
  if (!order) return [];
  const linked = linkedProduction(order, docs);
  const issued = issuedBySku(linked.issues);
  const made = producedBySku(linked.receipts);

  const outputs = (order.lines || []).filter((l) => num(l?.qtyPlanned) > 0);
  const attributable = outputs.length === 1;

  return outputs.map((line) => {
    const sku = normalizeItemCode(line?.sku);
    const exp = attributable
      ? expectedFromIssued(index, itemsBySku, sku, issued, { onDate: str(order?.header?.productionDate) })
      : { expected: 0, limitedBy: '', problems: [] };
    const result = yieldOf({
      produced: num(made.get(sku)),
      planned: num(line?.qtyPlanned),
      expected: exp.expected,
    });
    const exception = yieldException({ sku, batch: line?.batch, warehouse: order?.header?.warehouse }, result);
    return {
      sku,
      description: str(line?.description) || str(itemsBySku?.get?.(sku)?.nameAr),
      exp,
      result,
      exception,
      attributable,
    };
  });
}

/**
 * الدفعات المنتَجة — **تُقرأ من استلام الإنتاج لا تُكتب بيد**.
 * فمن أثبت الدفعة في PRC أثبت كمّيّتها وصلاحيّتها ومخزنها؛ وإعادةُ كتابتها
 * في شاشة التخصيص تفتح بابَ رقمَين لدفعةٍ واحدة.
 *
 * @returns {object[]} `{key, sku, qty, batch, expiry, warehouse, qcRef, docNumber, description}`
 */
export function producedBatches(docs = [], itemsBySku) {
  const out = [];
  for (const doc of (Array.isArray(docs) ? docs : []).filter((d) => d?.type === 'PRC')) {
    (doc.lines || []).forEach((line, i) => {
      const sku = normalizeItemCode(line?.sku);
      const qty = num(line?.qtyProduced);
      if (!sku || qty <= 0) return;
      out.push({
        key: `${doc.id}:${i}`,
        sku,
        qty,
        batch: up(line?.batch),
        expiry: str(line?.expiry),
        warehouse: up(doc?.header?.warehouse),
        qcRef: str(doc?.header?.qcRef),
        docNumber: str(doc.number) || 'مسودّة',
        description: str(line?.description) || str(itemsBySku?.get?.(sku)?.nameAr),
      });
    });
  }
  return out;
}

/**
 * قرار الجودة لدفعةٍ — **يُبحث عنه بالدفعة نفسها ولا يُفترض** ‹الحكم ③›.
 *
 * `finalDecision` على رأس مستند الفحص هو الحكم؛ و«قبول» وحدها تُنتج `passed`.
 * وما عداها — رفضٌ أو قرارٌ لم يُكتب — لا يمرّ: فدفعةٌ فُحصت ولم يُختم قرارها
 * ليست مقبولة، وتخصيصُها يُخرجها من يد الجودة.
 *
 * @returns {{number:string, decision:string, status:'passed'|'rejected'|'pending'}|null}
 *   `null` حين لا مستندَ فحصٍ يحمل هذه الدفعة — وهو غيابٌ يُعلَن لا حكمٌ ضمنيّ.
 */
export function qcVerdictFor(batch, docs = []) {
  const wanted = up(batch);
  if (!wanted) return null;
  for (const doc of (Array.isArray(docs) ? docs : []).filter((d) => d?.type === 'QC')) {
    const hit = (doc.lines || []).some((l) => up(l?.batch) === wanted);
    if (!hit) continue;
    const decision = str(doc?.header?.finalDecision);
    return {
      number: str(doc.number) || 'مسودّة',
      decision,
      status: decision === 'قبول' ? 'passed' : decision === 'رفض' ? 'rejected' : 'pending',
    };
  }
  return null;
}
