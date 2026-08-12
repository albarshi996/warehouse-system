/**
 * تسوية نهاية الرحلة — محاسبة خطّ السير (Route Accounting).
 *
 * المشكلة التي تحلّها: مندوبٌ يخرج صباحًا بمركبةٍ محمّلة، ويعود مساءً بنقدٍ
 * وبضاعةٍ متبقّية ومرتجعات. الدفتر الورقيّ يسأل سؤالًا واحدًا — «كم بعتَ؟» —
 * ويصدّق الجواب. فيضيع الفرق بين ما حُمّل وما بيع وما عاد، ولا يُكتشف إلّا في
 * جردٍ بعد شهر حين يستحيل نسبته إلى رحلةٍ أو شخص.
 *
 * المعادلة الحاكمة:
 *   رصيد البداية + التحميل + المرتجع الداخل − المبيعات − الإيداع − الإرجاع
 *   = الرصيد المتوقّع
 *
 * ═══ لماذا لا نحسبها بأسماء المستندات؟ ═══
 * لأنّ التصنيف بالاسم يشيخ: كلّ نوعٍ جديد يعني `if` جديدة، ونوعٌ يُنسى يعني
 * رقمًا صامتًا ناقصًا. فنصنّف **بالاتّجاه نحو المركبة**: ما دخل موقعها زيادةٌ،
 * وما خرج منه نقصان — أيًّا كان مستنده. فتدخل مستندات `DN`/`POD` القائمة في
 * التسوية بلا تعديل، ويدخل ما سيأتي بلا تعديل أيضًا. والاسم يخدم **التبويب**
 * لا **الميزان**: يُجمّل العرض ولا يُقرّر الرقم.
 *
 * ═══ ثلاثة أرقام لا رقمان ═══
 * الفرق بينها هو الفرق بين نظامٍ يُحاسِب ونظامٍ يُجمِّل:
 *   `expected` — ما تقوله معادلة الرحلة.
 *   `ledgerQty` — ما يقوله رصيد الدفتر الآن.
 *   `counted` — ما تقوله اليد حين تعدّ فعلًا.
 * فـ`drift` (متوقّع ↔ دفتر) يكشف **حركةً خارج نافذة الرحلة** — خطأ نسبةٍ لا
 * خطأ بضاعة. و`variance` (دفتر ↔ معدود) هو **العجز أو الزيادة الحقيقيّان**.
 * دمجُهما في رقمٍ واحد يُخفي أيّهما وقع، وهو أوّل ما يُساء استعماله.
 *
 * منطق خالص: بلا Firestore وبلا DOM، كي يُختبَر في Node.
 */
import { vehicleLocationCode } from '../ledger/locations.js';

/** فاصل مفتاح السطر — صنفٌ وتشغيلة. مطابقٌ لروح `balanceId`. */
const SEP = '__';

/**
 * تبويب تدفّقات المركبة. `dir` هو الميزان، و`labelAr` هو العرض.
 * `otherIn`/`otherOut` ليسا حشوًا: حركةٌ بسببٍ لا نعرفه **تُحسب** ولا تُهمَل —
 * فالميزان لا ينتظر أن نُحدّث جدولًا.
 */
export const VAN_FLOWS = {
  load: { key: 'load', dir: 'in', labelAr: 'تحميل من المستودع' },
  returnIn: { key: 'returnIn', dir: 'in', labelAr: 'مرتجع من العميل' },
  // استرجاع الأمانة تبويبٌ مستقلّ عن مرتجع المبيعات: به يُحسب صافي المحميّة
  // الباقية لدى العملاء (إيداع − استرجاع) فلا تُقفل رحلةٌ وفارقها بلا تفسير.
  consignBack: { key: 'consignBack', dir: 'in', labelAr: 'استرجاع أمانة' },
  otherIn: { key: 'otherIn', dir: 'in', labelAr: 'وارد آخر' },
  sale: { key: 'sale', dir: 'out', labelAr: 'مبيعات' },
  consign: { key: 'consign', dir: 'out', labelAr: 'إيداع أمانة' },
  returnOut: { key: 'returnOut', dir: 'out', labelAr: 'إرجاع للمستودع' },
  otherOut: { key: 'otherOut', dir: 'out', labelAr: 'صادر آخر' },
};

/** سبب الحركة ← تبويبها. ما ليس هنا يقع في `otherIn`/`otherOut` بحسب اتّجاهه. */
const REASON_FLOW = {
  'load-van': 'load',        // DN — التحميل عبر إذن التسليم (الدورة القائمة)
  'van-load': 'load',        // VLD — تحميل المركبة المباشر
  'van-return-in': 'returnIn', // CRN — مرتجع ميدانيّ عاد إلى المركبة
  delivery: 'sale',          // POD — تسليم للعميل (الدورة القائمة)
  'van-sale': 'sale',        // VSI — بيع من المركبة
  // أسباب الأمانة كما يكتبها الدفتر فعلًا (postingRules): الإيداع يخرج من
  // المركبة إلى `CUST:`، واسترجاعُه يعود منها إليها. المفتاح القديم
  // `van-consign` لم يكتبه الدفتر قطّ فكانت الأمانة تسقط في «صادر آخر».
  'consign-out': 'consign',      // VCD — إيداع بضاعةٍ محميّة لدى العميل
  'consign-return': 'consignBack', // VCR — استرجاع المحميّة إلى المركبة
  'van-return-out': 'returnOut', // VRT — إرجاع المتبقّي للمستودع
};

/** مفتاح السطر: صنفٌ (كودًا أو باركود) وتشغيلة. */
export function settlementKey({ sku, barcode, batch } = {}) {
  const item = String(sku ?? '').trim().toUpperCase() || String(barcode ?? '').trim().toUpperCase();
  if (!item) return '';
  return `${item}${SEP}${String(batch ?? '').trim().toUpperCase()}`;
}

/**
 * تبويب حركةٍ واحدة بالنسبة لمركبةٍ بعينها.
 * يُعيد `null` إن لم تمسّ المركبة أصلًا — أو مسّت طرفيها (وهي حركةٌ بلا معنى
 * يرفضها `buildMoves` أصلًا، فنتجاهلها هنا صمتًا لا نُضاعفها).
 */
export function classifyVanMove(move, vanCode) {
  const code = String(vanCode || '').toUpperCase();
  if (!code) return null;
  const from = String(move?.from ?? '').toUpperCase();
  const to = String(move?.to ?? '').toUpperCase();
  const inbound = to === code;
  const outbound = from === code;
  if (inbound === outbound) return null; // لا تمسّها، أو تمسّ طرفيها

  const named = REASON_FLOW[move?.reason];
  const flow = named && VAN_FLOWS[named]?.dir === (inbound ? 'in' : 'out')
    ? named
    : (inbound ? 'otherIn' : 'otherOut');

  return { flow, dir: inbound ? 'in' : 'out', qty: Math.abs(Number(move?.qty) || 0) };
}

/** صفٌّ فارغ بكلّ التبويبات مصفّرة — كي لا تختلف بنية الصفوف بين حالةٍ وأخرى. */
function emptyRow(seed) {
  const row = {
    key: seed.key,
    sku: seed.sku || '',
    barcode: seed.barcode || '',
    nameAr: seed.nameAr || '',
    batch: seed.batch || '',
    expiry: seed.expiry || '',
    opening: 0,
    totalIn: 0,
    totalOut: 0,
  };
  for (const f of Object.keys(VAN_FLOWS)) row[f] = 0;
  return row;
}

/**
 * تسوية رحلة مركبة.
 *
 * @param {object} args
 * @param {string} args.plate لوحة المركبة
 * @param {Array}  args.moves حركات الدفتر ضمن نافذة الرحلة (من `stock_moves`)
 * @param {Array}  [args.opening] رصيد البداية `[{sku,barcode,batch,qty}]`
 * @param {Array}  [args.balances] أرصدة الدفتر الحالية (لكشف `drift`)
 * @param {Array}  [args.counted] الجرد الفعليّ عند العودة `[{sku,barcode,batch,qty}]`
 * @returns {{plate:string, vanCode:string, rows:Array, totals:object,
 *            hasDrift:boolean, hasVariance:boolean, isClear:boolean}}
 */
export function vanSettlement({ plate, moves = [], opening = [], balances = [], counted = null } = {}) {
  const vanCode = vehicleLocationCode(plate);
  const byKey = new Map();

  const rowFor = (seed) => {
    const key = settlementKey(seed);
    if (!key) return null;
    let row = byKey.get(key);
    if (!row) {
      row = emptyRow({ ...seed, key });
      byKey.set(key, row);
    }
    // نُثري الوصف والصلاحية من أوّل مصدرٍ يحملهما (الحركات أغنى من الأرصدة).
    if (!row.nameAr && seed.nameAr) row.nameAr = seed.nameAr;
    if (!row.expiry && seed.expiry) row.expiry = seed.expiry;
    if (!row.sku && seed.sku) row.sku = seed.sku;
    if (!row.barcode && seed.barcode) row.barcode = seed.barcode;
    return row;
  };

  for (const o of opening || []) {
    const row = rowFor(o);
    if (row) row.opening += Number(o?.qty) || 0;
  }

  for (const move of moves || []) {
    const cls = classifyVanMove(move, vanCode);
    if (!cls) continue;
    const row = rowFor(move);
    if (!row) continue;
    row[cls.flow] += cls.qty;
    if (cls.dir === 'in') row.totalIn += cls.qty;
    else row.totalOut += cls.qty;
  }

  // رصيد الدفتر الآن — لموقع هذه المركبة وحدها.
  const ledgerByKey = new Map();
  for (const b of balances || []) {
    if (String(b?.warehouse ?? '').toUpperCase() !== vanCode) continue;
    const key = settlementKey(b);
    if (!key) continue;
    ledgerByKey.set(key, (ledgerByKey.get(key) || 0) + (Number(b?.qty) || 0));
    rowFor(b);
  }

  const countedByKey = counted ? new Map() : null;
  if (counted) {
    for (const c of counted) {
      const key = settlementKey(c);
      if (!key) continue;
      countedByKey.set(key, (countedByKey.get(key) || 0) + (Number(c?.qty) || 0));
      rowFor(c);
    }
  }

  const rows = [...byKey.values()].map((row) => {
    const expected = row.opening + row.totalIn - row.totalOut;
    const ledgerQty = ledgerByKey.get(row.key) || 0;
    const out = { ...row, expected, ledgerQty, drift: round(ledgerQty - expected) };
    if (countedByKey) {
      const countedQty = countedByKey.get(row.key) || 0;
      out.counted = countedQty;
      out.variance = round(countedQty - ledgerQty);
    }
    return out;
  });

  rows.sort((a, b) => (a.sku || a.barcode).localeCompare(b.sku || b.barcode, 'ar') || a.batch.localeCompare(b.batch, 'ar'));

  const sum = (key) => round(rows.reduce((s, r) => s + (Number(r[key]) || 0), 0));
  const totals = {
    opening: sum('opening'),
    totalIn: sum('totalIn'),
    totalOut: sum('totalOut'),
    expected: sum('expected'),
    ledgerQty: sum('ledgerQty'),
    lines: rows.length,
  };
  for (const f of Object.keys(VAN_FLOWS)) totals[f] = sum(f);
  if (countedByKey) {
    totals.counted = sum('counted');
    totals.variance = sum('variance');
  }
  // صافي الأمانة الباقية لدى العملاء من حركات هذه النافذة: إيداعٌ − استرجاع.
  // بضاعتنا خارج المركبة — لا تمنع الإقفال (الأمانة تعيش عبر الرحلات بتصميمها)
  // لكنّها تُعلَن كي لا يُقرأ فارق المركبة الصفريّ اكتمالًا وبضاعتنا عند الغير.
  totals.consignOutstanding = round(totals.consign - totals.consignBack);

  return {
    plate: String(plate || '').trim().toUpperCase(),
    vanCode,
    rows,
    totals,
    hasDrift: rows.some((r) => Math.abs(r.drift) > 0.0001),
    hasVariance: Boolean(countedByKey) && rows.some((r) => Math.abs(r.variance) > 0.0001),
    isClear: rows.every((r) => Math.abs(r.ledgerQty) <= 0.0001),
  };
}

/** تقريبٌ يمنع غبار الفاصلة العائمة من الظهور فرقًا وهميًّا. */
function round(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

/**
 * هل خلت المركبة فعلًا؟ حارس إقفال الرحلة، ونظير `stuckBalances` للمركبات.
 * يقرأ الأرصدة وحدها — فهو صالحٌ قبل بناء التسوية وبعدها.
 */
export function vanRemaining(balances, plate) {
  const vanCode = vehicleLocationCode(plate);
  if (!vanCode) return [];
  return (balances || [])
    .filter((b) => String(b?.warehouse ?? '').toUpperCase() === vanCode)
    .filter((b) => Math.abs(Number(b?.qty) || 0) > 0.0001);
}

/**
 * حكم التسوية — الحارس الذي يمنع إقفال رحلةٍ لم تُصفَّ.
 *
 * القاعدة: **لا تُقفل رحلةٌ ومركبتُها تحمل رصيدًا**. فالبضاعة إمّا بيعت، أو
 * أُودعت أمانةً لدى عميل، أو عادت للمستودع — والثلاثة حركاتٌ مستندية. أمّا
 * رصيدٌ باقٍ على مركبةٍ أُقفلت رحلتها فهو بضاعةٌ بلا عهدة: لا المستودع يطالب
 * بها ولا المندوب مسؤول عنها. وهذا بعينه ما يجعل العجز يظهر بعد شهورٍ بلا صاحب.
 *
 * والفرق المعدود ليس مانعًا بذاته — بل **يلزمه اعتماد المشرف**: العجز حقيقةٌ
 * تُوثَّق وتُنسب، لا خطأٌ يُمنع وقوعه. فمنعُ تسجيله يعني إخفاءه.
 *
 * @param {object}   args
 * @param {object}   args.settlement ناتج `vanSettlement`
 * @param {boolean}  [args.supervisorApproved] اعتماد المشرف للفرق المعدود
 * @param {Array}    [args.openDocuments] مستندات سلسلة المركبة لهذه الرحلة التي
 *   لم تبلغ «منجَز» — مستندٌ عالق يعني حركةً وقعت في الواقع ولم تُقيَّد بعد،
 *   فالتسوية المحسوبة ناقصةٌ بقدره ولا يُبنى إقفالٌ على دفترٍ ناقص.
 * @param {object}   [args.cashVerdict] حكم النقد من `tripCloseVerdict` — يُمرَّر
 *   ليصير ميزان النقد مانعًا لا نصيحة: تحصيلٌ لم يُودَع يمنع الإقفال.
 * @returns {{ok:boolean, blockers:string[], warnings:string[]}}
 */
export function settlementVerdict({ settlement, supervisorApproved = false, openDocuments = [], cashVerdict = null } = {}) {
  const blockers = [];
  const warnings = [];

  if (!settlement) {
    return { ok: false, blockers: ['لا تسوية محسوبة — لا يُقفل ما لم يُحسب.'], warnings };
  }

  const remaining = settlement.rows.filter((r) => Math.abs(r.ledgerQty) > 0.0001);
  if (remaining.length) {
    const qty = round(remaining.reduce((s, r) => s + r.ledgerQty, 0));
    blockers.push(
      `المركبة ما تزال تحمل ${qty} وحدة في ${remaining.length} بندًا — ` +
        'أرجِعها للمستودع أو وثّق تسليمها قبل الإقفال.'
    );
  }

  const openDocs = (openDocuments || []).filter((d) => d && d.state !== 'done');
  if (openDocs.length) {
    const names = openDocs.slice(0, 3).map((d) => `${d.type} ${d.number || ''}`.trim()).join(' · ');
    blockers.push(
      `${openDocs.length} مستندًا في الرحلة لم يُنجَز بعد (${names}${openDocs.length > 3 ? ' …' : ''}) — ` +
        'أثره لم يبلغ الدفتر، والتسوية ناقصةٌ بقدره.'
    );
  }

  if (cashVerdict && cashVerdict.ok === false) {
    for (const reason of cashVerdict.blockers || []) blockers.push(reason);
  }

  if (settlement.hasDrift) {
    const drifted = settlement.rows.filter((r) => Math.abs(r.drift) > 0.0001).length;
    warnings.push(
      `${drifted} بندًا يختلف فيه رصيد الدفتر عن معادلة الرحلة — ` +
        'غالبًا حركةٌ وقعت خارج نافذة الرحلة، تُراجَع قبل الاعتماد.'
    );
  }

  // الأمانة لدى العملاء **إعلانٌ لا مانع** — عمدًا: البضاعة المحميّة تعيش عبر
  // الرحلات بتصميمها (لذلك وُجدت مواقع `CUST:`)، ومنعُ الإقفال بها يكسر
  // نموذج الأمانة كلّه. لكنّ إخفاءها يجعل صفرَ المركبة يُقرأ اكتمالًا
  // وبضاعتنا عند الغير — فتُعلَن بعددها وتُتابَع في أرصدة `CUST:`.
  const consignOut = Number(settlement.totals?.consignOutstanding) || 0;
  if (consignOut > 0.0001) {
    warnings.push(
      `بضاعة محميّة لدى العملاء من هذه النافذة: ${consignOut} وحدة — ` +
        'عهدةٌ خارج المركبة تُتابَع في أرصدة مواقع العملاء.'
    );
  }

  if (settlement.hasVariance && !supervisorApproved) {
    const varied = settlement.rows.filter((r) => Math.abs(r.variance) > 0.0001).length;
    blockers.push(
      `${varied} بندًا بفرقٍ بين الجرد الفعليّ والدفتر — يلزمه اعتماد المشرف بسببٍ مكتوب.`
    );
  }

  return { ok: blockers.length === 0, blockers, warnings };
}

/**
 * حارس إنجاز التسوية (VSR): لا يُنجَز محضرُ تسويةٍ ومركبتُه ما تزال تحمل
 * رصيدًا — الإنجاز توثيقُ خلوّ العهدة لا تمنّيه. دالّة خالصة تُغذّى بأرصدة
 * الدفتر الحيّة وتُستدعى من حارس الإنجاز العامّ قبل تغيير الحالة.
 */
export function vsrPostProblem(docData, balances) {
  if (docData?.type !== 'VSR') return null;
  const plate = docData?.header?.vehiclePlate;
  if (!String(plate ?? '').trim()) return null; // مخطّط VSR يُلزم اللوحة أصلًا
  const remaining = vanRemaining(balances, plate);
  if (!remaining.length) return null;
  const qty = round(remaining.reduce((s, b) => s + (Number(b?.qty) || 0), 0));
  return (
    `لا تُنجَز التسوية والمركبة «${plate}» ما تزال تحمل ${qty} وحدة في ${remaining.length} بندًا — ` +
    'أرجِع المتبقّي للمستودع (VRT) أو وثّق مصيره أوّلًا.'
  );
}
