/**
 * ═══════════════════════════════════════════════════════════════════
 *  دمج المسح الحيّ — عدّة أجهزة تجرد العملية السحابية نفسها بلا ازدواج.
 * ═══════════════════════════════════════════════════════════════════
 *
 * **المشكلة:** كانت شاشة العمليات المخزنية جزيرةً معزولة لكل جهاز — تكتب
 * قيودها في السحابة لكن لا تقرأ قيود غيرها. فموظّفان يجردان المستودع نفسه
 * لا يرى أحدهما عمل الآخر، فيُحسب الصنف الواحد مرّتين.
 *
 * **الحلّ:** الدفتر السحابي `operations/{opId}/scans` هو **مصدر الحقيقة**
 * للكمية الفعلية. كل قيدٍ حدثٌ دائم بكمية: موجبة للمسح، **سالبة للعكس**
 * (الإلغاء لا يمحو التاريخ — يُضاف قيدٌ مضادّ، فالقواعد تمنع التعديل والحذف).
 * لذلك: **الكمية الفعلية المدموجة لأي صنف = مجموع كميات قيوده في الدفتر.**
 *
 * الوحدة **خالصة** (بلا Firestore ولا DOM) ليحرسها الاختبار عنصرًا عنصرًا.
 */

/** مفتاح التجميع الافتراضي: تشذيب + حروف صغيرة. الصفحة تمرّر مفتاحها
 *  القانوني (`bzCanonCode`: يُسقط الفراغات والأصفار البادئة) ليطابق `findInvIdx`. */
export function scanKey(barcode) {
  return String(barcode ?? '')
    .trim()
    .toLowerCase();
}

/**
 * يجمع قيود الدفتر بحسب الباركود.
 *
 * @param {{barcode?:string, qty?:number, name?:string}[]} scans قيود الدفتر
 * @param {(code:string)=>string} [keyFn] دالّة التطبيع (افتراضها {@link scanKey})
 * @returns {Map<string,{qty:number, name:string, count:number}>}
 *   لكل باركود: مجموع الكمية · آخر اسمٍ معروف · عدد القيود.
 */
export function summarizeScans(scans, keyFn = scanKey) {
  const map = new Map();
  for (const s of scans || []) {
    const key = keyFn(s?.barcode);
    if (!key) continue;
    const cur = map.get(key) || { qty: 0, name: '', count: 0 };
    cur.qty += Number(s?.qty) || 0;
    cur.count += 1;
    if (s?.name) cur.name = String(s.name); // آخر اسمٍ يظهر يفوز (الأحدث)
    map.set(key, cur);
  }
  return map;
}

/**
 * يوفّق أصناف الجلسة مع الدفتر المدموج **في المكان**.
 *
 * لا يمسّ `systemQty` (مصدره الماستر لا الدفتر) — يضبط `actualQty`/`scanned`
 * فقط، فيصبح رقم كل جهازٍ هو المجموع عبر كل الأجهزة. الصنف الذي في الدفتر
 * وليس في الجلسة (مسحه زميلٌ ولا نملكه محليًّا) يُعاد في `missing` ليشكّله
 * المستدعي — لأنه هو من يعرف شكل الصنف المحلّي.
 *
 * الكمية الصافية صفرًا (مُسح ثم أُلغي) تعني «غير ممسوح»، فلا نُنبت له سطرًا.
 *
 * @param {object[]} items أصناف الجلسة (تُعدَّل في المكان)
 * @param {Map} ledger ناتج {@link summarizeScans}
 * @param {(code:string)=>string} [keyFn] نفس دالّة تطبيع {@link summarizeScans}
 * @returns {{changed:number, missing:{barcode:string,name:string,qty:number}[]}}
 */
export function applyLedgerToItems(items, ledger, keyFn = scanKey) {
  const seen = new Set();
  let changed = 0;
  for (const it of items || []) {
    const key = keyFn(it.barcodeLower || it.barcode);
    seen.add(key);
    const qty = ledger.get(key)?.qty ?? 0;
    const scanned = qty !== 0;
    if (it.actualQty !== qty || it.scanned !== scanned) changed++;
    it.actualQty = qty;
    it.scanned = scanned;
  }
  const missing = [];
  for (const [key, entry] of ledger) {
    if (!seen.has(key) && (entry.qty || 0) !== 0) {
      missing.push({ barcode: key, name: entry.name || key, qty: entry.qty });
    }
  }
  return { changed, missing };
}
