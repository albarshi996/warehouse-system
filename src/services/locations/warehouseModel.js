/**
 * نموذجُ المخزن — منطقٌ خالصٌ لعلاقة «القطاع ← المخزن» وحالةِ الأرشفة
 * (‹SECT-WH م١› · طلب المالك 2026-11-08: «كلُّ قطاعٍ يضمّ مخزنًا أو أكثر»).
 *
 * ═══ القطاع = المحلّ (قرار المالك 2026-11-09) ═══
 * وحدةُ العزل المبنيّة هي «المحلّ» (`shop`)، فالقطاعُ يُمثَّل بحقل `shop` على وثيقة
 * المخزن — يربطه بسجلّ `shops` المعزول. فلا بُعدٌ رابعٌ ولا مجموعةٌ جديدة: المخزنُ
 * يتبع قطاعَه (محلَّه) بمفتاحٍ واحد، ويُعاد استعمالُه في عزل القراءات والعضويّة لاحقًا.
 *
 * ═══ الأرشفةُ لا الحذف ═══
 * المخزنُ قد تشير إليه أرصدةٌ وحركاتٌ في مجموعاتٍ ملحق-فقط مقدّسة — فحذفُه الصلب
 * ييتّمها. الأرشفةُ تُخفيه من العمل الحيّ وتُبقي سجلَّه (status=«مؤرشف»).
 *
 * منطقٌ خالص: بلا Firestore وبلا DOM — يُختبر وحده، وترِثه مراحلُ العزل.
 */

const str = (v) => String(v ?? '').trim();

/** حالاتُ المخزن — «نشط» الافتراض، و«مؤرشف» بدل الحذف. */
export const WH_STATUS = Object.freeze({ ACTIVE: 'نشط', ARCHIVED: 'مؤرشف' });

/** قطاعُ المخزن (رمزُ المحلّ)، أو '' إن لم يُسنَد بعد. */
export function warehouseSector(wh) {
  return str(wh?.shop);
}

/** هل المخزنُ مؤرشف؟ (بالحالة أو علَمٍ صريح). */
export function isArchived(wh) {
  return str(wh?.status) === WH_STATUS.ARCHIVED || wh?.archived === true;
}

/** هل المخزنُ حيٌّ (غيرُ مؤرشف)؟ */
export function isActiveWarehouse(wh) {
  return !isArchived(wh);
}

/** المخازنُ الحيّةُ وحدَها. */
export function activeWarehouses(list) {
  return (Array.isArray(list) ? list : []).filter(isActiveWarehouse);
}

/**
 * مخازنُ قطاعٍ (محلٍّ) بعينه — الحيّةُ وحدَها. قطاعٌ غيرُ محدَّدٍ ('' /null) لا يضمّ
 * شيئًا (لا يُساوى بالمخازن غير المُسنَدة — تلك لها `unassignedWarehouses`).
 */
export function warehousesInSector(list, shopCode) {
  const s = str(shopCode);
  if (!s) return [];
  return activeWarehouses(list).filter((w) => warehouseSector(w) === s);
}

/** المخازنُ الحيّةُ بلا قطاعٍ مُسنَد — ما يحتاج المديرُ إسنادَه. */
export function unassignedWarehouses(list) {
  return activeWarehouses(list).filter((w) => !warehouseSector(w));
}

/**
 * تجميعُ عددِ المخازن الحيّة لكلّ قطاع — خريطة `shopCode → count`، والمفتاحُ ''
 * للمخازن غير المُسنَدة. لعرض «القطاعُ يضمّ N مخزنًا».
 */
export function sectorRollup(list) {
  const m = new Map();
  for (const w of activeWarehouses(list)) {
    const key = warehouseSector(w);
    m.set(key, (m.get(key) || 0) + 1);
  }
  return m;
}
