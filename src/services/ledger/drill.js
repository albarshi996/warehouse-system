/**
 * الحفر التحليليّ — كلّ رقمٍ يصل إلى مصدره (SAP-13 · يسدّ ف‑٢٩).
 *
 * ═══ القاعدة الحاكمة (§18 ‹921-922›) ═══
 * «الضغط على رقم في بطاقة لا ينتهي إلى صفحة عامة؛ يفتح القائمة المفلترة
 * التي تكوّن الرقم» و«مجموع التفاصيل يطابق المؤشر». فكلّ دالّةٍ هنا تُعيد
 * **قائمةً ومجموعها معًا** — والاختبار الحارس يفرض أنّ المجموع يساوي رقم
 * البطاقة حرفيًّا: قائمةٌ لا تُفسّر رقمها كذبٌ مهذَّب.
 *
 * ═══ المسار الكامل (§18 ‹891-903› · §21-١٢) ═══
 *   الرقم ← القائمة المكوِّنة ← المستند (رابطه) ← السطر ← الحركة ← الدفعة/الموقع
 * الموجود يتفكّك أرصدةً (مخزن × تشغيلة × موقع)، والمطلوب والمحجوز-العابر
 * يتفكّكان مستنداتٍ مفتوحة بأرقامها، وكشف الحركة (SAP-7) يكمل النزول
 * إلى المستند والبند والدفعة.
 *
 * ولا بيانات تجريبيّة (§7 ‹150›): كلّ صفٍّ من الأرصدة الحيّة أو مستندٍ قائم.
 *
 * منطق خالص: بلا Firestore وبلا DOM (§22 ‹995›).
 */
import { poOrderedEntries, transferImpactEntries } from './openDemand.js';

const round6 = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;

/** يجمع قيودًا (من openDemand) بالمستند — صفٌّ لكلّ مستندٍ بمجموع كمّيّاته. */
function groupByDocument(entries, keySet) {
  const byDoc = new Map();
  let total = 0;
  for (const e of entries) {
    if (!e.keys.some((k) => keySet.has(k))) continue;
    total = round6(total + e.qty);
    const key = e.docId || `${e.docType}:${e.docNumber}`;
    const prev = byDoc.get(key);
    if (prev) {
      prev.qty = round6(prev.qty + e.qty);
    } else {
      byDoc.set(key, {
        docId: e.docId,
        docType: e.docType,
        docNumber: e.docNumber,
        warehouse: e.warehouse,
        qty: e.qty,
      });
    }
  }
  return { rows: [...byDoc.values()], total };
}

const toKeySet = (keys) => (keys instanceof Set ? keys : new Set(keys || []));

/**
 * تفكيك «المطلوب»: المستندات المفتوحة التي تكوّنه (أوامر شراء + وجهات نقل)
 * — كلٌّ برقمه وكمّيّته، والمجموع **يطابق** رقم البطاقة (يحرسه الاختبار).
 */
export function orderedBreakdown(itemKeys, { poRows = [], trRows = [] } = {}) {
  const keySet = toKeySet(itemKeys);
  const po = groupByDocument(poOrderedEntries(poRows), keySet);
  const tr = groupByDocument(transferImpactEntries(trRows).ordered, keySet);
  return {
    rows: [
      ...po.rows.map((r) => ({ ...r, why: 'أمر شراء مفتوح' })),
      ...tr.rows.map((r) => ({ ...r, why: 'نقلٌ وارد مفتوح' })),
    ],
    total: round6(po.total + tr.total),
  };
}

/**
 * تفكيك «المحجوز»: صفوف الأرصدة المحجوزة (وعودات البيع — مخزنًا وتشغيلةً)
 * + طلبات النقل المفتوحة الخارجة. المجموع يطابق رقم البطاقة.
 */
export function committedBreakdown(itemKeys, { balances = [], trRows = [] } = {}) {
  const keySet = toKeySet(itemKeys);
  const reservedRows = (balances || [])
    .filter((b) => (Number(b?.qtyReserved) || 0) > 0)
    .map((b) => ({
      balanceId: b.id || null,
      warehouse: String(b.warehouse ?? '').toUpperCase(),
      batch: String(b.batch ?? '').trim(),
      qty: round6(Number(b.qtyReserved) || 0),
      why: 'محجوز لوعد بيع',
    }));
  const tr = groupByDocument(transferImpactEntries(trRows).committed, keySet);
  const reservedTotal = round6(reservedRows.reduce((s, r) => s + r.qty, 0));
  return {
    rows: [...reservedRows, ...tr.rows.map((r) => ({ ...r, why: 'نقلٌ صادر مفتوح' }))],
    total: round6(reservedTotal + tr.total),
  };
}

/**
 * تفكيك «الموجود»: صفوف الأرصدة الحيّة (مخزن × تشغيلة × موقع) — كلّ صفٍّ
 * بابُ النزول التالي: كشفُ حركته (SAP-7) يصل للمستند والبند والدفعة.
 */
export function inStockBreakdown(balances = []) {
  const rows = (balances || []).map((b) => ({
    balanceId: b.id || null,
    warehouse: String(b.warehouse ?? '').toUpperCase(),
    batch: String(b.batch ?? '').trim(),
    bin: String(b.bin ?? '').trim(),
    expiry: String(b.expiry ?? '').trim(),
    qty: round6(Number(b.qty) || 0),
  }));
  return { rows, total: round6(rows.reduce((s, r) => s + r.qty, 0)) };
}
