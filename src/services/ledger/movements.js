/**
 * بناء الحركات من المستند — منطق خالص، بلا Firestore وبلا DOM.
 *
 * يأخذ مستندًا منجَزًا ويُخرج قائمة حركاتٍ جاهزة للقيد، ثم يشتقّ منها أثرها على
 * الأرصدة. خالصٌ عمدًا كي يُختبَر في Node بلا شبكة ولا حساب — وهو الدرس الذي
 * ثبت في `chain.js`: المنطق الذي لا يُختبَر إلا بصريًّا لا يُختبَر أبدًا.
 *
 * ثلاث ضمانات يفرضها هذا الملف:
 *   1. **الكمية دائمًا موجبة** — الاتجاه يحمله `from`/`to` لا إشارةُ الرقم.
 *      السالب في القيد يُخفي الخطأ؛ والاتجاه الصريح يفضحه.
 *   2. **المعرّف حتميّ** — `docId__lineIndex` — فإعادة القيد تكتب فوق نفسها
 *      ولا تُضاعف. لا رصيد يتضخّم لأن موظّفًا ضغط الزرّ مرّتين.
 *   3. **لا حركة بلا هويّة صنفٍ وموقعٍ صالح** — ما يعجز عن ذلك يُرفض بسببٍ
 *      مكتوب، لا يُقيَّد بصمتٍ ثم يُكتشف في الجرد بعد شهر.
 */
import { balanceId } from '../balances/balanceKey.js';
import { postingRuleFor, WAREHOUSE_TOKENS, isWarehouseToken, POSTING_STATE } from './postingRules.js';

/** فاصل المعرّف الحتمي — نفس نمط `balanceId`. */
const SEP = '__';

/** هويّة الصنف: الكود أولًا، فالباركود. مطابقٌ لقاعدة `balanceId`. */
function itemIdentity(line) {
  const sku = String(line?.sku ?? '').trim();
  const barcode = String(line?.barcode ?? '').trim();
  return { sku, barcode, has: Boolean(sku || barcode) };
}

/** معرّف الحركة الحتمي — يمنع الازدواج عند إعادة المحاولة. */
export function moveId(docId, lineIndex) {
  return `${docId}${SEP}${String(lineIndex).padStart(3, '0')}`;
}

/**
 * يحلّ الموقع: رمز موقع نظام يُعاد كما هو، ورمز مستودعٍ يُقرأ من الحقل الموافق
 * في رأس المستند (`warehouse` أو `fromWarehouse` أو `toWarehouse`).
 * `null` تعني «خارج المنشأة» وهي قيمة صالحة لا غياب.
 */
function resolveLocation(slot, header) {
  if (isWarehouseToken(slot)) {
    const field = WAREHOUSE_TOKENS[slot];
    const wh = String(header?.[field] ?? '').trim().toUpperCase();
    return wh || undefined; // undefined = ناقص، وسيُرفض بسبب مكتوب
  }
  return slot; // رمز نظام، أو null للخارج
}

/**
 * يبني حركات مستند. لا يقرأ حالة المستند — الاستدعاء مسؤول عن ذلك
 * (انظر `canPost`) — كي يمكن معاينة الأثر قبل الإنجاز.
 *
 * @param {object} docData المستند (id · type · number · header · lines)
 * @returns {{moves: Array, problems: string[]}} الحركات ومشاكل المنع
 */
export function buildMoves(docData) {
  const problems = [];
  const rule = postingRuleFor(docData?.type);
  if (!rule) return { moves: [], problems };

  const header = docData?.header || {};
  const fromSlot = resolveLocation(rule.from, header);
  const toSlot = resolveLocation(rule.to, header);

  if (fromSlot === undefined || toSlot === undefined) {
    problems.push('المستودع غير محدَّد في رأس المستند — لا يُقيَّد أثرٌ بلا موقع.');
    return { moves: [], problems };
  }

  const moves = [];
  (docData?.lines || []).forEach((line, index) => {
    const raw = rule.computeQty ? rule.computeQty(line) : Number(line?.[rule.qtyField]) || 0;
    const qty = Number(raw) || 0;
    if (qty === 0) return; // بندٌ بلا كمية ليس خطأً — لا يُقيَّد فحسب

    const { sku, barcode, has } = itemIdentity(line);
    if (!has) {
      problems.push(`البند ${index + 1}: لا كود ولا باركود — لا يمكن نسبة الحركة إلى صنف.`);
      return;
    }

    // الاتجاه من الإشارة (التسويات وحدها)، والكمية تبقى موجبة أبدًا.
    const negative = rule.signed && qty < 0;
    const from = negative ? toSlot : fromSlot;
    const to = negative ? fromSlot : toSlot;

    if (from !== null && to !== null && String(from) === String(to)) {
      problems.push(`البند ${index + 1}: المصدر والوجهة موقعٌ واحد — حركةٌ بلا معنى.`);
      return;
    }

    const unitCost = Number(line?.[rule.costField]) || 0;
    const absQty = Math.abs(qty);

    moves.push({
      id: moveId(docData.id, index),
      docId: docData.id,
      docType: docData.type,
      docNumber: docData.number || null,
      lineIndex: index,
      sku,
      barcode,
      nameAr: String(line?.description ?? '').trim(),
      batch: String(line?.batch ?? '').trim(),
      expiry: String(line?.[rule.expiryField] ?? '').trim(),
      from,
      to,
      qty: absQty,
      unitCost,
      value: absQty * unitCost,
      reason: rule.reason,
      reasonLabel: rule.labelAr,
    });
  });

  return { moves, problems };
}

/**
 * أثر الحركات على الأرصدة: صفٌّ لكل (صنف × موقع × تشغيلة) بمقدار التغيّر.
 *
 * يتجاهل «خارج المنشأة» — لا نمسك رصيدًا للمورّد ولا للعميل. ويجمع الحركات
 * المتكرّرة على نفس المفتاح في دلتا واحدة، فلا نكتب على نفس المستند مرّتين
 * داخل المعاملة (وهو ما يرفضه Firestore أصلًا).
 *
 * @returns {{deltas: Array, problems: string[]}}
 */
export function balanceDeltas(moves) {
  const problems = [];
  const byKey = new Map();

  const touch = (move, location, sign) => {
    if (location === null || location === undefined) return; // الخارج لا رصيد له
    const id = balanceId({ sku: move.sku, barcode: move.barcode, warehouse: location, batch: move.batch });
    if (!id) {
      problems.push(`تعذّر بناء مفتاح رصيد للصنف «${move.sku || move.barcode}» في «${location}».`);
      return;
    }
    const prev = byKey.get(id);
    if (prev) {
      prev.delta += sign * move.qty;
      return;
    }
    byKey.set(id, {
      id,
      sku: move.sku,
      barcode: move.barcode,
      nameAr: move.nameAr,
      warehouse: String(location).toUpperCase(),
      batch: move.batch,
      expiry: move.expiry,
      unitCost: move.unitCost,
      delta: sign * move.qty,
    });
  };

  (moves || []).forEach((move) => {
    touch(move, move.from, -1);
    touch(move, move.to, +1);
  });

  return { deltas: [...byKey.values()], problems };
}

/**
 * هل يجوز قيد هذا المستند الآن؟ الحارس الذي يسبق أي كتابة.
 *
 * `posted` هو الختم الذي يمنع القيد المزدوج. نفحصه هنا وفي المعاملة معًا:
 * هنا لتجربة المستخدم، وهناك للحقيقة.
 */
export function canPost(docData) {
  if (!docData?.id) return { ok: false, reason: 'لا مستند.' };
  if (!postingRuleFor(docData.type)) return { ok: false, reason: 'هذا النوع لا يُحرّك مخزونًا.' };
  if (docData.state !== POSTING_STATE) {
    return { ok: false, reason: 'لا يُقيَّد أثرٌ قبل إنجاز المستند — الإنجاز هو إقرار الوقوع.' };
  }
  if (docData.posted) return { ok: false, reason: 'قُيّد هذا المستند من قبل.' };
  return { ok: true, reason: '' };
}

/**
 * حارس الرصيد السالب — نقيّ وقابل للاختبار وحده.
 *
 * يأخذ الدلتاوات (من `balanceDeltas`) وخريطة الرصيد الحالي `{id: qty}`، ويُعيد
 * أوّل حركةٍ مُنقِصة تُنزل رصيدها تحت الصفر (أو `null` إن كانت كلّها آمنة).
 * الحركات المُزيدة (`delta >= 0`) لا تُفحص — لا تنقص شيئًا. رصيدٌ غائب = 0،
 * فأيّ إنقاصٍ منه خرقٌ (يمنع خلق صفٍّ وهميّ سالب عبر `merge:true`).
 *
 * تُستدعى داخل معاملة القيد بأرصدةٍ قُرئت لحظتها، وفي الاختبار بخريطةٍ ثابتة.
 */
export function findNegativeBalance(deltas, currentById = {}) {
  for (const d of deltas || []) {
    if (!(d.delta < 0)) continue;
    const current = Number(currentById[d.id]) || 0;
    if (current + d.delta < 0) {
      return {
        id: d.id,
        sku: d.sku,
        barcode: d.barcode,
        nameAr: d.nameAr,
        warehouse: d.warehouse,
        batch: d.batch,
        current,
        requested: -d.delta,
      };
    }
  }
  return null;
}

/**
 * معاينة الأثر قبل وقوعه — تُعرض للموظّف قبل ضغط «إنهاء المستند».
 * يجمع البناء والدلتا والمشاكل في نتيجةٍ واحدة صالحة للعرض.
 */
export function previewImpact(docData) {
  const { moves, problems: buildProblems } = buildMoves(docData);
  const { deltas, problems: deltaProblems } = balanceDeltas(moves);
  const problems = [...buildProblems, ...deltaProblems];
  return {
    moves,
    deltas,
    problems,
    ok: problems.length === 0 && moves.length > 0,
    totalQty: moves.reduce((s, m) => s + m.qty, 0),
    totalValue: moves.reduce((s, m) => s + m.value, 0),
  };
}
