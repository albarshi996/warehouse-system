/**
 * تكوينُ المستودع من جردٍ معتمد — منطق خالص، بلا Firestore وبلا DOM.
 *
 * المبدأ الحاكم (منظومة موقع 155): **اعتمادُ الجرد = تكوينُ المستودع**. فمِن
 * بنودِ الجرد المعتمَد يتكوّن المستودعُ تلقائيًّا شيئَين:
 *   ① **ترقياتُ ماستر الأصناف** — كلُّ صنفٍ عُدّ يصير سجلًّا في الماستر.
 *   ② **الأرصدةُ الافتتاحيّة** — رصيدٌ لكلّ (صنف × تشغيلة) بمقدار ما عُدّ.
 * و«لا حركةَ على مخزنٍ قبل تكوينه» يحرسه `formationViolation` في `movements.js`.
 *
 * ═══ ★★★ مفتاحُ الرصيد الافتتاحيّ = مفتاحُ حركة الصرف/الاستلام لاحقًا ═══
 * الأرصدةُ الافتتاحيّةُ تُبنى بـ`balanceId` **نفسِه** الذي يبنيه الدفترُ لحركاتِ
 * الصرف والاستلام — **بلا موقعٍ تخزينيّ (bin) وبحالة OK**. ولو حملت الأرصدةُ
 * الافتتاحيّةُ خانةً لانقسم الرصيدُ عن مفتاح الصرف (الذي يصرف بلا خانةٍ غالبًا)
 * فرُفض صرفٌ صحيح. والتشغيلةُ والصلاحيّةُ تبقيان (عليهما يقوم FEFO). والخانةُ
 * تدخل لاحقًا بمستند التخزين (PUTAWAY) لا بالتكوين — التكوينُ رصيدٌ إجماليّ.
 *
 * خالصةٌ عمدًا كي تُختبَر في Node بلا شبكة — نفسُ درس `movements.js`.
 */
import { balanceId } from '../balances/balanceKey.js';
import { isStocked, typeOf } from '../items/itemType.js';

const str = (v) => String(v ?? '').trim();
const upper = (v) => str(v).toUpperCase();

/**
 * الكمّيّةُ المعدودةُ لبندٍ — مصدرُها مرنٌ كي تصلح لبنود الجرد (CC) ولقيود
 * المسح (operations) معًا:
 *   `qty`/`countedQty` الصريحة أوّلًا، وإلّا **العدّ المؤكَّد** (الثاني إن وُجد
 *   ثمّ الأوّل). والفارغُ وغيرُ الرقميّ يُعدّ صفرًا — بندٌ عُدّ فوُجد صفرًا رصيدٌ
 *   افتتاحيٌّ صفريٌّ صحيح («الرصيدُ الصفريّ يُكتب لا يُمحى»).
 */
export function countedQtyOf(line) {
  for (const key of ['qty', 'countedQty', 'count2', 'count1']) {
    const v = line?.[key];
    if (v !== undefined && v !== null && v !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

/**
 * يبني ترقياتِ الماستر والأرصدةَ الافتتاحيّة من بنودِ جردٍ لمخزنٍ بعينه.
 *
 * - **الخدمةُ لا رصيدَ لها** (م٣-أ): تُرقّى في الماستر إن حملت كودًا، ولا تدخل
 *   الأرصدة — تمامًا كما يستبعدها `buildMoves`. و`items` اختياريّةٌ: غيابُها
 *   يعني «لا علمَ بالنوع» فالكلُّ يُعدّ بضاعةً (سلوك اليوم حرفيًّا).
 * - **جردٌ فارغٌ** (مخزنٌ فارغٌ مثل E2/E3) يُعيد مصفوفتَين فارغتَين — ويُكوَّن
 *   المخزنُ مع ذلك (العلَمُ على وثيقته، لا على وجودِ رصيد).
 * - الأرصدةُ تُجمَّع بالمفتاح: بندان لنفس (صنف × تشغيلة) يصيران رصيدًا واحدًا
 *   مجموعًا، فلا يدهس أحدُهما الآخر عند الكتابة بمعرّفٍ واحد.
 *
 * @param {Array} countedLines بنودُ الجرد (sku · barcode · description · batch ·
 *   expiry · count1/count2 أو qty · unitPrice).
 * @param {string} warehouseCode كودُ المخزن (E1 …) — يُسوّى إلى أحرفٍ كبيرة.
 * @param {{items?: Map<string,object>|object}} [opts] خريطةُ `sku → سجلّ الصنف`.
 * @returns {{itemUpserts: Array, openingBalances: Array}}
 */
export function buildFormation(countedLines, warehouseCode, { items = null } = {}) {
  const wh = upper(warehouseCode);
  const itemUpserts = [];
  const byId = new Map();
  if (!wh) return { itemUpserts, openingBalances: [] };

  const itemOf = (sku) => {
    if (!items || !sku) return null;
    return (items instanceof Map ? items.get(sku) : items[sku]) || null;
  };
  const seenUpsert = new Set();

  for (const line of Array.isArray(countedLines) ? countedLines : []) {
    const sku = upper(line?.sku ?? line?.itemCode);
    const barcode = str(line?.barcode);
    if (!sku && !barcode) continue; // لا هويّةَ صنفٍ ⇒ لا تكوين

    const item = itemOf(sku);
    const nameAr = str(line?.description ?? line?.nameAr ?? item?.nameAr);
    const unitPrice = Number(line?.unitPrice ?? line?.unitCost ?? item?.unitPrice) || 0;

    // ترقيةُ الماستر: بندٌ بكودٍ يصير سجلَّ صنف (مرّةً لكلّ كودٍ، ولو تكرّر البند).
    // البندُ بباركودٍ بلا كودٍ لا يُنشئ ماسترًا (الكودُ هو الهويّة — SAP-1).
    if (sku && !seenUpsert.has(sku)) {
      seenUpsert.add(sku);
      const up = { sku };
      if (nameAr) up.nameAr = nameAr;
      if (barcode) up.barcodes = [barcode];
      if (unitPrice) up.unitPrice = unitPrice;
      itemUpserts.push(up);
    }

    // الخدمةُ تُحتسب صنفًا ولا تُقيَّد مخزنيًّا (م٣-أ) — لا رصيدَ افتتاحيَّ لها.
    if (item && !isStocked(typeOf(item))) continue;

    const qty = countedQtyOf(line);
    const batch = str(line?.batch);
    const expiry = str(line?.expiry ?? line?.expiryDate);
    // ★★★ بلا bin وبحالة OK — فيطابق مفتاحَ حركة الصرف/الاستلام لاحقًا.
    const id = balanceId({ sku, barcode, warehouse: wh, batch, bin: '', expiry, status: 'OK' });
    if (!id) continue;

    const prev = byId.get(id);
    if (prev) {
      prev.qty += qty;
      continue;
    }
    byId.set(id, {
      id,
      sku,
      barcode,
      nameAr,
      warehouse: wh,
      bin: '',
      batch,
      expiry,
      stockStatus: 'OK',
      qty,
      unitCost: unitPrice,
    });
  }

  return { itemUpserts, openingBalances: [...byId.values()] };
}
