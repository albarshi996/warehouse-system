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
import {
  postingRuleFor,
  WAREHOUSE_TOKENS,
  isWarehouseToken,
  isVehicleToken,
  isCustomerToken,
  POSTING_STATE,
} from './postingRules.js';
import { vehicleLocationCode, customerLocationCode, isAccountLocation } from './locations.js';
import { normalizeStockStatus } from './stockStatus.js';
import { isStocked, typeOf } from '../items/itemType.js';
import { toBase, baseUomOf, hasUomDefinition, normalizeUom, checkFraction } from '../items/uomModel.js';

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
  // موقع المركبة: يُقرأ من اللوحة ويُصاغ `VAN:‹لوحة›` — رصيدٌ لكل مركبةٍ على حدة.
  if (isVehicleToken(slot)) {
    const plate = String(header?.vehiclePlate ?? '').trim();
    return plate ? vehicleLocationCode(plate) : undefined; // undefined = لوحة ناقصة
  }
  // موقع العميل: يُقرأ من رمزه ويُصاغ `CUST:‹رمز›` — رصيد الأمانة والمحميّة.
  if (isCustomerToken(slot)) {
    const code = String(header?.customerCode ?? '').trim();
    return code ? customerLocationCode(code) : undefined; // undefined = رمز ناقص
  }
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
 * **الخدمة لا تُقيَّد (م٣-أ):** بندُ «رسوم نقل» بكمّيّة ١ كان يبني رصيدًا
 * وهميًّا يعدّه أمين المخزن فلا يجده. و`typeMap` اختياريّة عمدًا: غيابها يعني
 * سلوك اليوم حرفيًّا — فالميزة تُفعَّل بالبيانات لا بالنشر.
 *
 * **الوحدات (م٣-ب):** كلّ حركة تُقيَّد بوحدة الأساس وتُعرض بوحدة الإدخال —
 * لكن **لصنفٍ عرّف المالك وحداته وحده**. وما لم يُعرَّف يمرّ رقمه كما هو، فتدخل
 * الميزة صنفًا صنفًا لا دفعةً واحدةً على النظام كلّه.
 *
 * @param {object} docData المستند (id · type · number · header · lines)
 * @param {{items?: Map<string,object>|object}} [opts] خريطة `sku → سجلّ الصنف`
 * @returns {{moves: Array, problems: string[], skipped: Array}} الحركات والمشاكل وما استُبعد
 */
export function buildMoves(docData, { items = null } = {}) {
  const itemOf = (line) => {
    if (!items) return null;
    const sku = String(line?.sku ?? line?.itemCode ?? '').trim().toUpperCase();
    if (!sku) return null;
    return (items instanceof Map ? items.get(sku) : items[sku]) || null;
  };
  const problems = [];
  const rule = postingRuleFor(docData?.type);
  if (!rule) return { moves: [], problems, skipped: [] };

  const header = docData?.header || {};
  const fromSlot = resolveLocation(rule.from, header);
  const toSlot = resolveLocation(rule.to, header);

  if (fromSlot === undefined || toSlot === undefined) {
    problems.push('المستودع غير محدَّد في رأس المستند — لا يُقيَّد أثرٌ بلا موقع.');
    return { moves: [], problems, skipped: [] };
  }

  const moves = [];
  const skipped = [];
  (docData?.lines || []).forEach((line, index) => {
    const item = itemOf(line);

    // الخدمة تُحتسب قيمةً ولا تُقيَّد مخزنيًّا (م٣-أ). تُسجَّل في `skipped`
    // ولا تُبتلع صامتةً — فاستبعادٌ لا يُرى يصير عطبًا لا يُشخَّص.
    if (item && !isStocked(typeOf(item))) {
      skipped.push({ index, sku: String(line?.sku ?? '').trim(), reason: 'خدمة — لا تُقيَّد مخزنيًّا' });
      return;
    }

    const raw = rule.computeQty ? rule.computeQty(line) : Number(line?.[rule.qtyField]) || 0;
    const entryQty = Number(raw) || 0;
    if (entryQty === 0) return; // بندٌ بلا كمية ليس خطأً — لا يُقيَّد فحسب

    // التحويل إلى وحدة الأساس — لصنفٍ عُرّفت وحداته وحده (م٣-ب).
    const entryUom = String(line?.uom ?? '').trim();
    let qty = entryQty;
    let baseUom = entryUom;
    // معاملٌ مختومٌ على السطر لوحدته الحاليّة (معامل الطرف من كتالوج SAP-2/3)
    // يتقدّم على معامل الصنف: موردان بتعبئة 24 و20 لا يختلط تحويلهما —
    // §10 ‹256›. والختم من `uomWiring.refreshLineBase` وقت الإدخال.
    const stampedFactor = Number(line?.uomFactor);
    const stampedFor = String(line?.uomFactorFor ?? '').trim();
    if (
      line?.uomFactorSource === 'partner'
      && Number.isFinite(stampedFactor) && stampedFactor > 0
      && entryUom && stampedFor === (normalizeUom(entryUom) || entryUom)
    ) {
      const fraction = checkFraction(entryQty, entryUom);
      if (!fraction.ok) {
        problems.push(`البند ${index + 1}: ${fraction.problem}`);
        return;
      }
      qty = Math.round(entryQty * stampedFactor * 1e6) / 1e6;
      baseUom = item ? baseUomOf(item) : entryUom;
    } else if (item && hasUomDefinition(item)) {
      const conv = toBase(item, entryQty, entryUom || baseUomOf(item));
      if (!conv.ok) {
        problems.push(`البند ${index + 1}: ${conv.problem}`);
        return;
      }
      qty = conv.qty;
      baseUom = conv.base;
    }

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

    // ‹LOC-105› الموقع طرفٌ لا صفة: تنسبه القاعدة إلى المصدر أو الوجهة، ويُقلب
    // مع الطرفين عند التسوية السالبة. وبلا هذا التمييز يستحيل قلبُ مفتاح الرصيد.
    const binValue = String(line?.bin ?? '').trim().toUpperCase();
    const ruleFromBin = rule.binSide === 'from' ? binValue : '';
    const ruleToBin = rule.binSide === 'to' ? binValue : '';
    const fromBin = negative ? ruleToBin : ruleFromBin;
    const toBin = negative ? ruleFromBin : ruleToBin;

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
      // الموقع التخزينيّ داخل المستودع (SAP-7 · ف‑١٨ · §14 ‹364›): يحمله بند
      // التخزين (PUTAWAY) فيعرفه الدفتر — «حسب الموقع التخزينيّ» مستوى عرضٍ
      // من الحركات، ومفتاح الرصيد لم يُمسّ عمدًا (تغييره يقلب FEFO والسحب).
      bin: binValue,
      // ‹LOC-105› طرفا الموقع صريحان: من أيّ رفٍّ خرجت وإلى أيّ رفٍّ دخلت.
      // `bin` يبقى للتوافق الرجعيّ (حركاتٌ قُيّدت قبل اليوم تحمله وحده).
      fromBin,
      toBin,
      // حالة المخزون (LOC-107): بُعدٌ يصف ما يتعايش في الرفّ الواحد (سليم/تالف)
      // ولا يُميّزه موقع. الغياب ⇒ `OK` ⇒ سلوك اليوم حرفيًّا. ولا يدخل مفتاح
      // الرصيد بعد — قيمُه تنتظر اعتماد المالك (LOC-O02).
      stockStatus: normalizeStockStatus(line?.stockStatus),
      qty: absQty,
      // الدفتر بوحدة الأساس، والعرض بوحدة الإدخال (م٣-ب). ولولا حفظ الأصل
      // لصار «٢٠ صندوقًا» في التقرير «٢٤٠» بلا أن يعرف أحدٌ أنّه هو نفسه.
      entryQty: Math.abs(entryQty),
      entryUom,
      baseUom,
      unitCost,
      value: absQty * unitCost,
      reason: rule.reason,
      reasonLabel: rule.labelAr,
      // بُعد الرحلة والمندوب (CC-301): الحركة واقعةٌ تُنسب لرحلةٍ ولصاحب عهدة،
      // لا لضاغط الزرّ وحده (postedBy هو أمين المخزن لا المندوب). بدونهما يستحيل
      // الجواب من الدفتر عن «أيّ رحلةٍ حمّلت هذا الرصيد؟» — والفارغ يبقى فارغًا.
      tripRef: String(header?.tripRef ?? '').trim(),
      repName: String(header?.repName ?? header?.rep ?? '').trim(),
    });
  });

  return { moves, problems, skipped };
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
    // ‹LOC-105› لكلّ طرفٍ موقعُه: الداخل يدخل رفّ الوجهة، والخارج يخرج من رفّ
    // المصدر. و`bin` القديم يُقرأ توافقًا لحركاتٍ قُيّدت قبل اليوم بلا طرفين.
    const sideBin = sign > 0 ? move.toBin ?? move.bin ?? '' : move.fromBin ?? '';
    const id = balanceId({
      sku: move.sku,
      barcode: move.barcode,
      warehouse: location,
      batch: move.batch,
      bin: sideBin,
      expiry: move.expiry,
      status: move.stockStatus,
    });
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
      // موقع الوجهة (ف‑١٨): الداخل إلى مستودعٍ بموقعٍ معلوم يُذكر موقعه على
      // الرصيد — آخرُ تخزينٍ يكسب، عرضًا لا مفتاحًا.
      bin: sideBin || '',
      // حالة المخزون تُحمَل على الرصيد (LOC-107) — حقلًا لا مفتاحًا بعد.
      stockStatus: move.stockStatus || 'OK',
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
 *
 * `allowApproved`: حين يقع القيدُ وانتقالُ الحالة إلى «منجَز» فعلًا ذرّيًّا واحدًا
 * (BZ-SCN-001)، نقبل المستند وهو ما يزال «معتمَدًا» — فالمعاملة نفسها تختمه منجَزًا.
 */
export function canPost(docData, { allowApproved = false } = {}) {
  if (!docData?.id) return { ok: false, reason: 'لا مستند.' };
  if (!postingRuleFor(docData.type)) return { ok: false, reason: 'هذا النوع لا يُحرّك مخزونًا.' };
  const okState = docData.state === POSTING_STATE || (allowApproved && docData.state === 'approved');
  if (!okState) {
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
 * **استثناء المواقع الحسابيّة** (`ADJUSTMENT`): طرفٌ مقابلٌ لا رفٌّ ماديّ، يُسمح
 * لرصيده بالسالب — فلا يُفحص. بدونه تعجز التسوية الموجبة عن القيد (BZ-SCN-002).
 *
 * تُستدعى داخل معاملة القيد بأرصدةٍ قُرئت لحظتها، وفي الاختبار بخريطةٍ ثابتة.
 */
export function findNegativeBalance(deltas, currentById = {}) {
  for (const d of deltas || []) {
    if (!(d.delta < 0)) continue;
    if (isAccountLocation(d.warehouse)) continue; // حساب افتراضيّ يُسمح له بالسالب
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
