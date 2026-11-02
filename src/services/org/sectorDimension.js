/**
 * بُعدُ القطاع — تصنيفٌ تحليليٌّ **متعامدٌ مع المحلّ** (قرار المالك 2026-11-01).
 *
 * المحلُّ يفصل (أين وقعت العمليّة)، والقطاعُ يصنّف (أيُّ خطّ عملٍ: أغذية ·
 * مستحضرات …) **عبر المحلّات**. وهو نظيرُ `account.analytic.plan` في أودو:
 * بُعدٌ حرٌّ يُشتقّ من **فئة الصنف** نفسِها لا من هويّةِ محلٍّ ثالثة — فلا يُبنى
 * كِيانٌ جديد (قرار المالك)، ويُعاد استعمالُ تصنيف الصنف القائم (department/
 * family/category من الاستيراد، `itemShape.js`).
 *
 * اختياريٌّ تمامًا: صنفٌ بلا تصنيفٍ يبقى «غير مصنّف» ولا يُمنع، والترشيحُ
 * بالقطاع مستقلٌّ عن أيّ ترشيحٍ بالمحلّ (متعامدان). منطق خالص: بلا Firestore.
 */

const str = (v) => String(v ?? '').trim();
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * حقولُ تصنيف الصنف من الأعمّ (القطاع) إلى الأخصّ — أوّلُ حقلٍ مملوءٍ هو القطاع.
 * `sector` صريحٌ إن وُجد (توافقٌ أماميّ)، ثمّ القسمُ/العائلةُ/الفئة من الاستيراد.
 */
export const SECTOR_FIELDS = ['sector', 'department', 'family', 'category', 'section'];

/** رمزا الحالتين الخاصّتين في المرشّحات والتجميع. */
export const UNCLASSIFIED = '__none__';
export const MIXED = '__mixed__';
export const UNCLASSIFIED_LABEL = 'غير مصنّف';
export const MIXED_LABEL = 'متعدّد القطاعات';

/** قطاعُ صنفٍ — أوّلُ حقلِ تصنيفٍ مملوء، أو '' إن لم يُصنَّف (اختياريٌّ لا يُمنع). */
export function sectorOfItem(item) {
  for (const f of SECTOR_FIELDS) {
    const v = str(item?.[f]);
    if (v) return v;
  }
  return '';
}

/** القطاعاتُ المميَّزة في مجموعة أصناف، مرتّبةً عربيًّا، مع عدد غير المصنّف. */
export function listSectors(items = []) {
  const set = new Set();
  let unclassified = 0;
  for (const it of Array.isArray(items) ? items : []) {
    const s = sectorOfItem(it);
    if (s) set.add(s);
    else unclassified += 1;
  }
  return { sectors: [...set].sort((a, b) => a.localeCompare(b, 'ar')), unclassified };
}

/**
 * ترشيحُ الأصناف بقطاع — '' = الكلّ (بلا ترشيح)، و`UNCLASSIFIED` = غيرُ المصنّف.
 * متعامدٌ: يُطبَّق مستقلًّا عن أيّ مرشّحٍ آخر (بحثٌ · محلّ · أرشفة).
 */
export function filterItemsBySector(items = [], sector = '') {
  const want = str(sector);
  const list = Array.isArray(items) ? items : [];
  if (!want) return list;
  if (want === UNCLASSIFIED) return list.filter((it) => !sectorOfItem(it));
  return list.filter((it) => sectorOfItem(it) === want);
}

/**
 * قطاعُ مستندٍ من بنوده — عبر دالّةِ حلٍّ تُعيد قطاعَ صنفٍ برمزه (فهرسُ الأصناف)،
 * أو من فئةِ البند مباشرةً إن حملها، أو من `header.sector` الصريح. بندٌ واحدٌ
 * مصنَّف ⇒ قطاعُه، متعدّدٌ ⇒ `MIXED`، لا شيءَ ⇒ '' (لا يُخترع تصنيف).
 */
export function sectorOfDoc(doc, resolveItemSector) {
  const explicit = str(doc?.header?.sector);
  if (explicit) return explicit;
  const resolve = typeof resolveItemSector === 'function' ? resolveItemSector : () => '';
  const found = new Set();
  for (const line of doc?.lines || []) {
    const s = str(line?.sector) || str(line?.category) || str(resolve(str(line?.sku) || str(line?.barcode)));
    if (s) found.add(s);
  }
  if (found.size === 0) return '';
  if (found.size === 1) return [...found][0];
  return MIXED;
}

/**
 * تجميعُ مقياسٍ بالقطاع **متعامدًا مع المحلّ**: يُمرَّر `shop` اختياريًّا فيُرشَّح
 * الصفوفُ به أوّلًا ثمّ تُجمَّع بالقطاع — فالبُعدان مستقلّان تمامًا (قطاعُ خطّ
 * العملِ داخلَ محلٍّ بعينه، أو عبر كلّ المحلّات).
 *
 * @param rows صفوفٌ (أصنافٌ أو سطورٌ)
 * @param measureOf دالّةٌ تقرأ المقياسَ من الصفّ
 * @param sectorOf دالّةُ قطاع الصفّ (الافتراض `sectorOfItem`)
 * @param shopOf دالّةُ محلّ الصفّ، و`shop` المحلُّ المطلوب (null/'' = كلّ المحلّات)
 */
export function sectorRollup(rows = [], { measureOf, sectorOf = sectorOfItem, shopOf, shop } = {}) {
  const scoped = shop !== undefined && shop !== null && shop !== '';
  const measure = typeof measureOf === 'function' ? measureOf : () => 0;
  const map = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (scoped && typeof shopOf === 'function' && shopOf(r) !== shop) continue;
    const key = str(sectorOf(r)) || UNCLASSIFIED;
    const prev = map.get(key) || { sector: key, total: 0, count: 0 };
    prev.total = money(prev.total + (Number(measure(r)) || 0));
    prev.count += 1;
    map.set(key, prev);
  }
  return [...map.values()].sort((a, b) => b.total - a.total || String(a.sector).localeCompare(String(b.sector), 'ar'));
}

/** اسمُ القطاع للعرض — يترجم الرمزين الخاصّين، ويُبقي الاسمَ الحرَّ كما هو. */
export function sectorLabel(sector) {
  const s = str(sector);
  if (!s || s === UNCLASSIFIED) return UNCLASSIFIED_LABEL;
  if (s === MIXED) return MIXED_LABEL;
  return s;
}
