/**
 * جلسةُ الممرّ — «كلُّ مسحةٍ تُثبَّت لحظتَها» (طلب المالك 2026-09-02). منطقٌ خالص.
 *
 * ═══ الفجوة التي تسدّها ═══
 * كانت لوحةُ الخانة تجمع البنودَ **في الشاشة** ثمّ تحفظها بضغطةٍ واحدةٍ في
 * الآخر. فمن أُغلق هاتفُه أو نفدت بطّاريّتُه قبل الضغطة **ضاع عملُه كلُّه** —
 * وهو يقف في ممرٍّ مشى فيه ساعة. والعاملُ لا يُلام على بطّاريّة.
 *
 * ═══ ★★★ ولا مجموعةَ جديدة ولا قاعدةَ تُنشر ═══
 * السجلُّ الملحق-فقط مبنيٌّ ومنشورٌ منذ ‹CAP›: `operations/{id}/scans`. وقاعدتُه
 * الحيّة **لا تحصر الحقول** (فُحصت)، فيكفي أن تحمل المسحةُ خانتَها. واختراعُ
 * مجموعةٍ ثانيةٍ يعني قاعدةً ينتظر نشرَها المالك — وميزةً معطّلةً حتى ينشر.
 *
 * ═══ ولماذا الجلسةُ بالممرّ لا بالخانة ═══
 * العاملُ يمشي ممرًّا كاملًا: يقف عند خانةٍ فيعدّها، ثمّ التي تليها. فجلسةٌ
 * لكلّ خانةٍ تعني مئةَ جلسةٍ في ممرٍّ واحد ومئةَ محضرِ جرد. والنطاقُ في
 * `operationScope` **بادئةُ كود موقع** أصلًا — فـ«الممرّ A في الرحبة» هو
 * `RH-A` حرفيًّا، و«أهذه الخانة تحته؟» دالّةٌ قائمةٌ مُختبَرة.
 */

import { normalizeLocationCode, parseLocationCode } from './locationCode.js';
import { withinScope } from '../stock/operationScope.js';

const str = (v) => String(v ?? '').trim();
const up = (v) => str(v).toUpperCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** نوعُ الجلسة — يميّزها في سجلّ العمليّات عن جرد الشاشة العامّ. */
export const BIN_SESSION_TYPE = 'bin-count';

/**
 * نطاقُ جلسةِ خانةٍ — المستودعُ والممرّ، وهما أوّلُ مقطعين في الكود.
 * خانةٌ بكودٍ معطوبٍ تُعيد نطاقًا فارغًا ولا تُخترع لها جلسة.
 */
export function sessionScopeFor(binCode) {
  const parsed = parseLocationCode(binCode);
  if (!parsed) return { warehouse: '', zone: '' };
  return { warehouse: up(parsed.warehouse), zone: up(parsed.zone) };
}

/** بادئةُ النطاق نصًّا — `RH-A`. */
export function scopePrefix(scope) {
  return [up(scope?.warehouse), up(scope?.zone)].filter(Boolean).join('-');
}

/**
 * تسميةُ الجلسة كما يقرؤها العامل — «الممرّ A · الرحبة».
 * تُقرأ تسميةُ المقطع من المستودع، فتقول «الممرّ» حيث يُسمّيه المستودعُ ممرًّا.
 */
export function sessionLabel(scope, warehouse, segmentLabels = {}) {
  const zoneLabel = str(segmentLabels?.zone) || 'الممرّ';
  const whName = str(warehouse?.nameAr || warehouse?.name) || up(scope?.warehouse);
  const zone = up(scope?.zone);
  return [zone ? `${zoneLabel} ${zone}` : '', whName].filter(Boolean).join(' · ');
}

/**
 * أتغطّي هذه الجلسةُ هذه الخانة؟
 *
 * تُستعمل لاستئناف جلسةٍ مفتوحةٍ بدل فتح ثانيةٍ للممرّ نفسِه — فعاملان في
 * ممرٍّ واحدٍ يكتبان في سجلٍّ واحد، ومحضرُ الجرد يخرج مرّةً لا مرّتين.
 */
export function sessionCovers(operation, binCode) {
  if (!operation || operation.type !== BIN_SESSION_TYPE) return false;
  if (str(operation.status) !== 'open') return false;
  const code = normalizeLocationCode(binCode);
  if (!code) return false;
  const scope = { warehouse: up(operation.warehouse), zone: up(operation.zone) };
  if (!scope.warehouse) return false;
  return withinScope(scope, code);
}

/** أوّلُ جلسةٍ مفتوحةٍ تغطّي هذه الخانة — و`null` إن لم توجد. */
export function findSessionFor(operations, binCode) {
  return (operations || []).find((o) => sessionCovers(o, binCode)) || null;
}

/**
 * حمولةُ المسحة الواحدة — بأسماء حقول `appendScan` لا بأسمائنا.
 *
 * ⚠️ `qty` هنا **المعدود**، و`bookQty` الدفتريُّ لحظةَ العدّ. والفارقُ يُحسب
 * في المستند لا هنا — نفسُ قاعدة `ADJ` في `postingRules`.
 */
export function scanPayload({ bin, item = {}, qty, bookQty = 0, profile } = {}) {
  return {
    bin: normalizeLocationCode(bin),
    barcode: str(item.barcode),
    sku: up(item.sku),
    name: str(item.nameAr || item.name),
    batch: str(item.batch),
    expiry: str(item.expiry),
    qty: num(qty),
    bookQty: num(bookQty),
    uom: str(item.uom),
    opType: BIN_SESSION_TYPE,
    profile,
  };
}

/** أعطابُ المسحة قبل تثبيتها — كلٌّ جملةٌ تقول الصواب. */
export function scanProblems({ bin, item, qty } = {}) {
  const problems = [];
  if (!normalizeLocationCode(bin)) problems.push('لا خانةَ محدَّدة — امسح ملصقَ الخانة وحدّدها أوّلًا.');
  if (!str(item?.sku) && !str(item?.barcode)) {
    problems.push('لم يُعرَف الصنفُ الممسوح — امسح ملصقًا سليمًا أو اخترْ من محتوى الخانة.');
  }
  if (!(num(qty) > 0)) problems.push('الكمّيّة يجب أن تكون أكبر من صفر.');
  return problems;
}

/**
 * ملخّصُ الجلسة من قيودها المحفوظة — ما تعرضه الشاشة حيًّا.
 *
 * والقيدُ **لا يُحذف**: التصحيحُ قيدٌ عكسيّ (كمّيّةٌ سالبة) كما في `operations`.
 * فالمجموعُ جمعٌ لا آخرُ قيمة.
 */
export function sessionSummary(scans = []) {
  const bins = new Set();
  const skus = new Set();
  let counted = 0;
  for (const s of scans) {
    const bin = normalizeLocationCode(s?.bin);
    if (bin) bins.add(bin);
    if (str(s?.sku)) skus.add(up(s.sku));
    counted += num(s?.qty);
  }
  return { scanCount: scans.length, binCount: bins.size, skuCount: skus.size, counted };
}

/** قيودُ خانةٍ بعينها من الجلسة — لعرض «ما عددتَه هنا». */
export function scansOfBin(scans = [], binCode) {
  const code = normalizeLocationCode(binCode);
  return code ? scans.filter((s) => normalizeLocationCode(s?.bin) === code) : [];
}

/**
 * بنودُ محضر الجرد من قيود الجلسة — تُجمَع بالخانة والصنف والدفعة.
 *
 * ★★ الجمعُ ضرورةٌ لا تحسين: العاملُ قد يمسح الصنفَ نفسَه ثلاث مرّاتٍ في
 * الخانة نفسِها (ثلاثةُ كراتين)، والمحضرُ يريد سطرًا واحدًا بمجموعها. وبندٌ
 * لكلّ مسحةٍ يُنتج محضرًا لا يُقرأ ويُضاعف عملَ من يعتمده.
 *
 * والدفتريُّ يُؤخذ من **أوّل** قيدٍ للمفتاح — فهو قيمةُ الرصيد لحظةَ العدّ،
 * وآخرُ قيدٍ قد يكون بعد أن غيّرت حركةٌ أخرى الرصيد.
 */
export function linesFromScans(scans = []) {
  const byKey = new Map();
  for (const s of scans) {
    const bin = normalizeLocationCode(s?.bin);
    const sku = up(s?.sku);
    if (!bin || (!sku && !str(s?.barcode))) continue;
    const key = `${bin}__${sku}__${up(s?.batch)}`;
    const prev = byKey.get(key);
    if (prev) {
      prev.count1 += num(s?.qty);
      continue;
    }
    byKey.set(key, {
      sku,
      barcode: str(s?.barcode),
      description: str(s?.name),
      bin,
      batch: str(s?.batch),
      expiry: str(s?.expiry),
      bookQty: num(s?.bookQty),
      count1: num(s?.qty),
      count2: '',
    });
  }
  return [...byKey.values()].sort((a, b) => a.bin.localeCompare(b.bin) || a.sku.localeCompare(b.sku));
}

/**
 * مسوّدةُ محضر الجرد للجلسة كاملةً — ترويسةٌ وبنود، جاهزةً لـ`createDraft`.
 *
 * و`zone` هي **بادئةُ الممرّ** لا خانةً واحدة: الجلسةُ ممرٌّ، وكلُّ بندٍ يحمل
 * خانتَه. فمن قرأ المحضرَ بعد شهرٍ يعرف الممرَّ والرفَّ معًا.
 */
export function sessionDraft(operation, scans = [], { warehouseCode = '', today = '' } = {}) {
  const lines = linesFromScans(scans);
  if (!lines.length) return null;
  const scope = { warehouse: up(operation?.warehouse), zone: up(operation?.zone) };
  return {
    type: 'CC',
    header: {
      countDate: str(today),
      countType: 'جرد خانات',
      zone: scopePrefix(scope),
      warehouse: up(warehouseCode) || scope.warehouse,
      sessionCode: str(operation?.code),
    },
    lines,
  };
}
