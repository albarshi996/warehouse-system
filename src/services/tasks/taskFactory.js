/**
 * مصنع المهامّ الميدانيّة ‹EXE-102› — من المستند المعتمَد إلى عملٍ مُسنَد.
 *
 * ═══ ما هذا الملفّ وما ليس هو ═══
 * لا يقرّر **أين يُخزَّن** ولا **من أيّ رفٍّ يُسحب** — ذانك محرّكان مبنيّان
 * ومختبَران: `putawaySuggest.js` يرتّب الرفوف المرشّحة بأسبابها، و`pickPlan.js`
 * يوزّع الكمّيّة على الأرصدة بترتيب FEFO ويرتّب المشي. وهذا الملفّ **يُحيل
 * إليهما ولا ينسخ سطرًا منهما** — ولو نُسخا لصار للاقتراح عقلان يفترقان.
 *
 * وظيفته الوحيدة: تحويل مخرجاتهما إلى **مهامّ** تُسنَد وتُقاس وتُغلَق.
 *
 * ═══ أربعة قرارات مكتوبة ═══
 *
 * ١. **الاقتراح لا يُملأ في خانة الوجهة.** قرار المالك قائم: **العامل يختار
 *    الرفّ**، والمحرّك يقترح ويُعلّل. فلو كتب المصنع `toBin` مسبقًا لَصار
 *    الاقتراح أمرًا، ولَسقط السببُ المقيَّد عند التجاوز. فيُحمَل المرشّحون في
 *    `suggested` **بجانب** الخانة المفتوحة لا فيها.
 *
 * ٢. **مستندٌ واحد يُنتج عدّة مهامّ، والفاصل هو المنطقة.** لأنّ المنطقة هي ما
 *    يحدّد **من يمشي أين**: عاملٌ لممرّ. وتقسيمٌ بالبنود يُنتج مهامَّ بعدد
 *    الأصناف فيتقاطع العمّال في الممرّ الواحد.
 *
 * ٣. **النقص يُعلَن سطرًا مفتوحًا لا يُبتلع.** إذا خصّص FEFO ثلاثين من خمسين،
 *    فبناءُ ثلاثين سطرًا وحدها يُخفي العشرين. فيُضاف سطرٌ بمصدرٍ مفتوح
 *    بكمّيّة النقص، ويُعاد النقص في `shortages` ليفتح عليه استثناءٌ لاحقًا.
 *
 * ٤. **التوليد مرّةً واحدة.** إعادة اعتماد المستند لا تُنتج مهامَّ مكرّرة:
 *    لكلّ مهمّةٍ مفتاحٌ مشتقٌّ من (نوع المستند · رقمه · المنطقة)، والمولَّد
 *    سابقًا يُترك ويُعاد في `skipped` — تُترك ولا تُدهس، فلعلّ عاملًا بدأها.
 *
 * منطق خالص: بلا Firestore وبلا DOM، و`nowMs` يُمرَّر ولا يُقرأ.
 */

import { lineKey } from '../documents/chain.js';
import { normalizeLocationCode, parseLocationCode, shortLabelOf } from '../locations/locationCode.js';
import { pickPlan } from '../locations/pickPlan.js';
import { buildGrid } from '../locations/travelGrid.js';
import { suggestLocations } from '../locations/putawaySuggest.js';
import { shapeWorkPayload, workPayloadProblems, WORK_TYPES } from './taskShape.js';

const s = (v) => String(v ?? '').trim();
const up = (v) => s(v).toUpperCase();
const num = (v) => Math.max(0, Number(v) || 0);

/**
 * أيّ نوع عملٍ يولّده كلّ مستند.
 *
 * مفاتيحه أنواع المستندات في `chain.js` وقيمه أنواع `ORDER_TYPES` — لا قائمةَ
 * ثالثة. ومستندٌ غير مذكورٍ هنا **لا يولّد شيئًا** ولا يُخترع له نوع.
 */
export const DOC_WORK_TYPE = Object.freeze({
  PUTAWAY: 'putaway',
  PICK: 'pick',
  TRN: 'transfer',
});

export function workTypeForDoc(docType) {
  return DOC_WORK_TYPE[up(docType)] || '';
}

/** منطقة الموقع — وهي فاصل التقسيم. الموقع المفتوح منطقتُه `''`. */
export function zoneOf(bin) {
  const parsed = parseLocationCode(bin);
  if (!parsed) return '';
  return [parsed.warehouse, parsed.zone].filter(Boolean).join('-');
}

/**
 * مفتاح المهمّة — هويّتها الثابتة عبر عمليات التوليد.
 * (نوع المستند · رقمه · المجموعة) — ورقم المستند فريدٌ بحكم مولّد الترقيم.
 */
export function taskKey({ docType, docNumber, group }) {
  return [up(docType), up(docNumber), up(group) || 'ALL'].join('::');
}

/** عنوانٌ يقرؤه العامل في سطرٍ واحد — لا يحتاج فتح المهمّة ليعرف ما هي. */
function titleFor(workType, docNumber, group, lineCount) {
  const label = WORK_TYPES[workType]?.label || 'مهمّة';
  const where = group ? ` · ${shortLabelOf(group) || group}` : '';
  return `${label} ${docNumber}${where} — ${lineCount} بندًا`;
}

/**
 * أسطر مهامّ التخزين من مستند `PUTAWAY`.
 *
 * الوجهة **تبقى مفتوحة** ومعها المرشّحون بأسبابهم (القرار ١). وبلا سيّد مواقع
 * تُبنى الأسطر كما هي ويُحمَل سبب تعذّر الاقتراح — فلا يتوقّف التخزين لأنّ
 * المواقع لم تُعرَّف بعد.
 */
function putawayLines(doc, { locations, balances, items }) {
  const warehouse = up(doc?.header?.warehouse);
  return (doc?.lines || [])
    .filter((l) => num(l?.qtyAccepted ?? l?.qty))
    .map((l) => {
      const qty = num(l?.qtyAccepted ?? l?.qty);
      const item = (items || []).find((it) => lineKey(it) === lineKey(l)) || null;
      const advice = suggestLocations({
        line: { sku: l?.sku, barcode: l?.barcode, batch: l?.batch, expiry: l?.expiry, qty, warehouse },
        locations,
        balances,
        item,
        warehouse,
      });
      return {
        sku: s(l?.sku),
        barcode: s(l?.barcode),
        nameAr: s(l?.description || l?.nameAr),
        batch: s(l?.batch),
        expiry: s(l?.expiry),
        uom: s(l?.uom),
        fromBin: '',
        toBin: '', // ← القرار ١: الاقتراح لا يُملأ هنا
        qtyRequired: qty,
        qtyDone: 0,
        suggested: advice.candidates.map((c) => ({ code: c.code, shortLabel: c.shortLabel, reason: c.reason })),
        suggestProblem: advice.problem,
      };
    });
}

/**
 * أسطر مهامّ السحب من مستند `PICK` — بترتيب `pickPathOrder` نفسه لا بترتيبٍ
 * جديد: ترتيبه **هو** مسار المشي، وإعادة ترتيبه تُطيل الطريق.
 */
function pickLines(doc, { balances, nowMs, locations }) {
  // ‹EXE-802› المسار يُرتَّب **بالمشي** حين تتوفّر الشبكة وبالكود حين لا
  // تتوفّر — والشبكة تُبنى من سيّد المواقع نفسه لا من مصدرٍ ثانٍ.
  const grid = (locations || []).length ? buildGrid(locations) : null;
  const plan = pickPlan(doc, balances, { nowMs, grid });
  const lines = plan.path.map((step) => ({
    sku: s(step.sku),
    barcode: '',
    nameAr: s(step.description),
    batch: s(step.batch),
    expiry: s(step.expiry),
    uom: '',
    fromBin: normalizeLocationCode(step.bin),
    toBin: '',
    qtyRequired: num(step.qty),
    qtyDone: 0,
  }));

  // القرار ٣: النقص سطرٌ مفتوح لا صمت.
  const shortages = plan.lines
    .filter((l) => l.shortfall > 0)
    .map((l) => ({ sku: s(l.sku), barcode: s(l.barcode), nameAr: s(l.description), qty: l.shortfall, problem: l.problem }));

  for (const sh of shortages) {
    lines.push({
      sku: sh.sku,
      barcode: sh.barcode,
      nameAr: sh.nameAr,
      batch: '',
      expiry: '',
      uom: '',
      fromBin: '',
      toBin: '',
      qtyRequired: sh.qty,
      qtyDone: 0,
      shortfall: true,
    });
  }
  return { lines, shortages };
}

/** أسطر النقل الداخليّ — طرفاه معًا من رأس المستند. */
function transferLines(doc) {
  const from = normalizeLocationCode(doc?.header?.fromBin || doc?.header?.fromWarehouse);
  const to = normalizeLocationCode(doc?.header?.toBin || doc?.header?.toWarehouse);
  return (doc?.lines || [])
    .filter((l) => num(l?.qty))
    .map((l) => ({
      sku: s(l?.sku),
      barcode: s(l?.barcode),
      nameAr: s(l?.description || l?.nameAr),
      batch: s(l?.batch),
      expiry: s(l?.expiry),
      uom: s(l?.uom),
      fromBin: normalizeLocationCode(l?.fromBin || l?.bin) || from,
      toBin: normalizeLocationCode(l?.toBin) || to,
      qtyRequired: num(l?.qty),
      qtyDone: 0,
    }));
}

/**
 * يولّد مهامّ المستند.
 *
 * @param {object} doc                 المستند المعتمَد (رأسٌ وبنود)
 * @param {object} [options]
 * @param {Array}  [options.balances]  الأرصدة الحيّة (للسحب والاقتراح)
 * @param {Array}  [options.locations] سيّد المواقع (للاقتراح)
 * @param {Array}  [options.items]     ماستر الأصناف (لفئة الصنف في الاقتراح)
 * @param {number} [options.nowMs]     الوقت يُمرَّر ولا يُقرأ (لأجل FEFO)
 * @param {string[]} [options.existingKeys] مفاتيح مهامّ وُلّدت سابقًا
 * @param {'zone'|'none'} [options.splitBy='zone'] فاصل التقسيم
 * @returns {{tasks:Array, shortages:Array, skipped:string[], problem:string}}
 */
export function generateTasks(doc, options = {}) {
  const { balances = [], locations = [], items = [], nowMs, existingKeys = [], splitBy = 'zone' } = options;

  const docType = up(doc?.type);
  const workType = workTypeForDoc(docType);
  const docNumber = s(doc?.number);
  const empty = { tasks: [], shortages: [], skipped: [], problem: '' };

  if (!workType) return { ...empty, problem: `المستند «${docType || '—'}» لا يولّد مهامّ ميدانيّة.` };
  if (!docNumber) return { ...empty, problem: 'لا حركة بلا مستند — المستند بلا رقمٍ رسميّ لا يولّد مهامّ.' };

  let lines = [];
  let shortages = [];
  if (workType === 'putaway') lines = putawayLines(doc, { locations, balances, items });
  else if (workType === 'pick') ({ lines, shortages } = pickLines(doc, { balances, nowMs, locations }));
  else lines = transferLines(doc);

  if (!lines.length) return { ...empty, problem: 'لا بندَ قابلًا للتنفيذ في هذا المستند.' };

  // القرار ٢: الفاصل هو المنطقة — ومصدرُها الطرفُ الذي يقرّره النوع.
  const groupOf = (l) => (splitBy === 'zone' ? zoneOf(workType === 'pick' ? l.fromBin : l.toBin) : '');
  const groups = new Map();
  for (const l of lines) {
    const g = groupOf(l);
    if (groups.has(g)) groups.get(g).push(l);
    else groups.set(g, [l]);
  }

  const seen = new Set(existingKeys.map(up));
  const tasks = [];
  const skipped = [];

  for (const [group, groupLines] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const key = taskKey({ docType, docNumber, group });
    // القرار ٤: المولَّد سابقًا يُترك ولا يُدهس — لعلّ عاملًا بدأه.
    if (seen.has(key)) {
      skipped.push(key);
      continue;
    }

    const work = shapeWorkPayload({
      workType,
      docRef: { type: docType, number: docNumber, id: s(doc?.id) },
      warehouse: up(doc?.header?.warehouse),
      lines: groupLines,
    });
    const problems = workPayloadProblems(work);
    if (problems.length) return { ...empty, problem: problems[0] };

    tasks.push({
      key,
      group,
      groupLabel: group ? shortLabelOf(group) || group : 'بلا منطقة',
      title: titleFor(workType, docNumber, group, groupLines.length),
      work,
      // المرشّحون يبقون خارج الحمولة المخزَّنة: عونٌ للشاشة لا قرارٌ محفوظ.
      advice: groupLines.map((l) => ({ sku: l.sku, suggested: l.suggested || [], problem: l.suggestProblem || '' })),
    });
  }

  return { tasks, shortages, skipped, problem: '' };
}
