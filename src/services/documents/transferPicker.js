/**
 * ‹155-P3/P4› منتقي أصناف مخزن النقل — منطقٌ خالصٌ بلا Firestore وبلا DOM.
 *
 * مواصفةُ موقع 155 (جزء ٣): في مستند النقل بخطوةٍ واحدة، إدخالُ الصنف كان
 * «امسح/اكتب ثمّ استدعِ الماستر» بلا قائمةٍ مرئيّة — فلا يعرف أمينُ المخزن ما في
 * مخزن المصدر حتّى يكتبه. هذا الملفّ يبني **قائمةَ اقتراحٍ** من أرصدة المصدر
 * (المفلترة بالمخزن) أو من الماستر كاملًا («عرض الكل») — وهو خالصٌ ليُختبَر وحده.
 *
 * وجزءُ ٤ يبني عليه: الصنفُ الذي **ليس في مخزن المصدر** يُوسَم `addedFromTransfer`
 * فيأخذ عند الترحيل دورةَ «زيادةُ جردٍ ثمّ خصمٌ لصفرٍ» (انظر movements.js). والوسمُ
 * يُشتقّ من هويّة الصنف لا من زرٍّ: ما هويّتُه في أرصدة المصدر يُنقَل عاديًّا، وما
 * ليس فيها يُضاف. والبوّابتان في الترحيل (منعُ السالب · شرطُ صفرِ المصدر الكلّيّ)
 * تحرسان الصحّة ولو انحرف الوسم — فهو تيسيرٌ لا حَكَم.
 */
import { safe } from '../balances/balanceKey.js';

/**
 * هويّةُ نصٍّ للمطابقة — **نفسُ تطبيع `balanceId`** (`safe`): يستبدل ما يكسر المفتاح
 * (`/.#$[]`) والمسافات ويُكبّر. فلا يُوسَم صنفٌ موجودٌ «مضافًا» لفارقِ تطبيعٍ بين
 * قرار المنتقي ومفتاح الرصيد (كان trim+upper أضيق — مراجعةٌ عدائيّة 2026-11-09).
 */
function norm(value) {
  return safe(value);
}

/**
 * مجموعتا هويّة المصدر من أرصدته: الأكواد والباركودات (مطبَّعة).
 *
 * @param {Array} balances صفوفُ أرصدة المخزن.
 * @returns {{skus: Set<string>, barcodes: Set<string>}}
 */
export function senderIdentities(balances) {
  const skus = new Set();
  const barcodes = new Set();
  for (const b of balances || []) {
    const sku = norm(b?.sku);
    const barcode = norm(b?.barcode);
    if (sku) skus.add(sku);
    if (barcode) barcodes.add(barcode);
  }
  return { skus, barcodes };
}

/** هل هويّةُ هذا البند موجودةٌ في مجموعتَي المصدر؟ (كودًا أو باركودًا) */
export function lineInSender(line, identities) {
  if (!identities) return false;
  const sku = norm(line?.sku);
  const barcode = norm(line?.barcode);
  if (sku && identities.skus.has(sku)) return true;
  if (barcode && identities.barcodes.has(barcode)) return true;
  return false;
}

/** هل للبند هويّةٌ أصلًا (كودٌ أو باركود)؟ البندُ الفارغ لا يُوسَم. */
function lineHasIdentity(line) {
  return Boolean(norm(line?.sku) || norm(line?.barcode));
}

/**
 * يُوسِم بنودَ النقل بـ`addedFromTransfer` بحسب غيابها عن أرصدة المصدر.
 *
 * ★★★ العقدُ الحاسم: **لا يوسم إلّا حين تُقرأ أرصدةُ المصدر فعلًا** (`loaded`).
 * قبل القراءة لا نعرف ما في المصدر، فوسمُ الكلّ «مضافًا» خطأٌ يفبرك زيادةَ جردٍ
 * لصنفٍ موجود. فإن لم تُقرأ الأرصدة — أو لا مخزنَ مصدرٍ بعد — **يُنزَع الوسمُ** من
 * كلّ بند، ويبقى الحكمُ النهائيّ لبوّابتَي الترحيل. والبندُ بلا هويّةٍ لا يُوسَم.
 *
 * نقيّ: يُعيد مصفوفةً جديدةً فقط إن تغيّر وسمٌ (وإلّا المرجعَ نفسَه — فلا حلقةُ
 * إعادةِ رسمٍ في الواجهة).
 *
 * @param {Array} lines بنودُ المستند.
 * @param {{skus:Set,barcodes:Set}|null} identities هويّاتُ المصدر، أو null.
 * @param {{loaded?: boolean}} [opts] هل قُرئت أرصدةُ المصدر؟
 * @returns {Array} البنودُ (موسومةً) — المرجعُ نفسُه إن لم يتغيّر شيء.
 */
export function annotateAdditions(lines, identities, { loaded = false } = {}) {
  const list = Array.isArray(lines) ? lines : [];
  let changed = false;
  const next = list.map((line) => {
    const want = loaded && identities && lineHasIdentity(line) && !lineInSender(line, identities);
    const had = line?.addedFromTransfer === true;
    if (want === had) return line;
    changed = true;
    if (want) return { ...line, addedFromTransfer: true };
    const { addedFromTransfer: _omit, ...rest } = line || {};
    return rest;
  });
  return changed ? next : list;
}

/** اسمُ الصنف المعروض: من الرصيد أو من الماستر أو الكودُ نفسُه. */
function nameOf(row, itemsBySku) {
  const fromRow = String(row?.nameAr ?? '').trim();
  if (fromRow) return fromRow;
  const sku = norm(row?.sku);
  const item = sku && itemsBySku ? itemsBySku.get(sku) : null;
  return String(item?.nameAr ?? '').trim();
}

/** خيارٌ واحدٌ لقائمة الاقتراح: القيمةُ تُدرَج، والتسمية تُعين العين. */
function option(value, label) {
  return { value, label };
}

/**
 * يبني خيارات الاقتراح لعمودَي الكود والباركود.
 *
 * `showAll=false` (الافتراض): من أرصدة المصدر وحدها — ما **في المخزن فعلًا**،
 * بكمّيّته المجمّعة عبر التشغيلات والخانات. `showAll=true`: من الماستر كاملًا —
 * لإضافة صنفٍ ليس في المصدر (يأخذه جزءُ ٤). كلاهما يُزيل التكرار بالهويّة.
 *
 * @param {object} opts
 * @param {Array} [opts.balances] أرصدةُ المصدر (للمفلتر).
 * @param {Array} [opts.items] ماستر الأصناف (لـ«عرض الكل» وللأسماء).
 * @param {boolean} [opts.showAll]
 * @returns {{sku: Array<{value,label}>, barcode: Array<{value,label}>}}
 */
export function buildItemSuggestions({ balances = [], items = [], showAll = false } = {}) {
  const itemsBySku = new Map();
  for (const it of items || []) {
    const sku = norm(it?.sku);
    if (sku && !itemsBySku.has(sku)) itemsBySku.set(sku, it);
  }

  const skuMap = new Map(); // sku → {label, qty}
  const barcodeMap = new Map(); // barcode → {label}

  if (showAll) {
    for (const it of items || []) {
      const sku = norm(it?.sku);
      const barcode = norm(it?.barcode);
      const name = String(it?.nameAr ?? '').trim();
      if (sku && !skuMap.has(sku)) {
        skuMap.set(sku, option(it.sku ? String(it.sku).trim() : sku, [name, barcode].filter(Boolean).join(' · ') || sku));
      }
      if (barcode && !barcodeMap.has(barcode)) {
        barcodeMap.set(barcode, option(String(it.barcode).trim(), [name, sku].filter(Boolean).join(' · ') || barcode));
      }
    }
  } else {
    // مجمَّعٌ بالهويّة: الصنفُ الواحد قد يتوزّع تشغيلاتٍ وخاناتٍ — خيارٌ واحدٌ بكمّيّته.
    const qtyBySku = new Map();
    const rawBySku = new Map();
    const qtyByBarcode = new Map();
    const rawByBarcode = new Map();
    for (const b of balances || []) {
      const sku = norm(b?.sku);
      const barcode = norm(b?.barcode);
      const qty = Number(b?.qty) || 0;
      if (sku) {
        qtyBySku.set(sku, (qtyBySku.get(sku) || 0) + qty);
        if (!rawBySku.has(sku)) rawBySku.set(sku, b);
      }
      if (barcode) {
        qtyByBarcode.set(barcode, (qtyByBarcode.get(barcode) || 0) + qty);
        if (!rawByBarcode.has(barcode)) rawByBarcode.set(barcode, b);
      }
    }
    for (const [sku, row] of rawBySku) {
      const name = nameOf(row, itemsBySku);
      const qty = qtyBySku.get(sku) || 0;
      const display = String(row?.sku ?? sku).trim();
      skuMap.set(sku, option(display, [name, `رصيد ${qty}`].filter(Boolean).join(' · ')));
    }
    for (const [barcode, row] of rawByBarcode) {
      const name = nameOf(row, itemsBySku);
      const qty = qtyByBarcode.get(barcode) || 0;
      const display = String(row?.barcode ?? barcode).trim();
      barcodeMap.set(barcode, option(display, [name, `رصيد ${qty}`].filter(Boolean).join(' · ')));
    }
  }

  const byLabel = (a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0);
  return {
    sku: [...skuMap.values()].sort(byLabel),
    barcode: [...barcodeMap.values()].sort(byLabel),
  };
}

/**
 * ‹155-P4› حارسُ البنود المضافة قبل الترحيل — **رصيدُ الصنف الكلّيُّ في المصدر**.
 *
 * ★★★ العقدُ الحقيقيّ: البندُ الموسومُ «مضاف» يُفترَض **غائبًا كلّيًّا** عن المصدر،
 * فيأخذ دورةَ «زيادةٌ ثمّ خصمٌ لصفر». لكنّ حارسَ المعاملة يفحص **مفتاحَ الخصم
 * الواحد** (دفعة/خانة البند)، لا رصيدَ الصنف عبر كلّ مفاتيحه — فصنفٌ له رصيدٌ تحت
 * دفعةٍ/خانةٍ أخرى يمرّ، فتُخلَق كمّيّةٌ في الوجهة من حساب التسوية بلا خصمٍ حقيقيّ
 * (مراجعةٌ عدائيّة 2026-11-09). هذا يجمع رصيدَ كلّ هويّةٍ مضافةٍ في أرصدة المصدر،
 * ويردُّ ما له رصيد. و`truncated` (قراءةٌ بلغت الحدَّ) تعني عدمَ اليقين بالغياب،
 * فتُردّ الإضافةُ كلُّها احترازًا (لا تُخلَق بضاعةٌ على شكٍّ).
 *
 * منطقٌ خالص: يُمرَّر أرصدةَ المصدر (المقروءةَ خارج المعاملة) فلا Firestore هنا.
 *
 * @param {Array} lines بنودُ المستند.
 * @param {Array} sourceBalances أرصدةُ مخزن المصدر (كلُّها، أو ما قُرئ منها).
 * @param {{truncated?: boolean}} [opts] هل بلغت قراءةُ الأرصدة الحدَّ (ناقصة)؟
 * @returns {string[]} قائمةُ مشكلاتٍ (فارغةٌ إن صحّ).
 */
export function addedItemsSourceConflict(lines, sourceBalances, { truncated = false } = {}) {
  const added = (Array.isArray(lines) ? lines : []).filter(
    (l) => l?.addedFromTransfer === true && Number(l?.qty) > 0
  );
  if (!added.length) return [];
  if (truncated) {
    return ['تعذّر التحقّقُ من غياب الأصناف المضافة عن المصدر (قائمةُ أرصدته بلغت الحدَّ) — انقلها نقلًا عاديًّا، أو راجِع مخزنَ المصدر.'];
  }

  // رصيدُ كلّ هويّةٍ في المصدر عبر كلّ مفاتيحها (تشغيلات · خانات · صلاحيّات · حالات).
  const qtyBySku = new Map();
  const qtyByBarcode = new Map();
  for (const b of sourceBalances || []) {
    const sku = norm(b?.sku);
    const barcode = norm(b?.barcode);
    const q = Number(b?.qty) || 0;
    if (sku) qtyBySku.set(sku, (qtyBySku.get(sku) || 0) + q);
    if (barcode) qtyByBarcode.set(barcode, (qtyByBarcode.get(barcode) || 0) + q);
  }

  const out = [];
  for (const l of added) {
    const sku = norm(l?.sku);
    const barcode = norm(l?.barcode);
    // الكودُ هو الهويّة إن وُجد، وإلّا الباركود (نظيرُ `balanceId`) — فلا ازدواجَ عدّ.
    const total = sku ? qtyBySku.get(sku) || 0 : barcode ? qtyByBarcode.get(barcode) || 0 : 0;
    if (total > 0) {
      const name = String(l?.description || l?.sku || l?.barcode || 'صنف').trim();
      out.push(`الصنف «${name}» موسومٌ «مضاف» لكنّ له رصيدًا (${total}) في المصدر — أزِل وسمَ الإضافة وانقله نقلًا عاديًّا.`);
    }
  }
  return out;
}
