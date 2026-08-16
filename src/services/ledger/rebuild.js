/**
 * إعادة بناء الأرصدة من الدفتر — منطق خالص بلا Firebase.
 *
 * الدعوى المكتوبة في رأس `ledgerService.js` منذ اليوم الأوّل: «الدفتر هو
 * الحقيقة، والأرصدة **ذاكرةٌ مُسرَّعة** يُعاد بناؤها منه». وكانت دعوًى بلا
 * تنفيذ: **لا دالّة تُعيد البناء**. فلا سبيل لإثبات أنّ رصيدًا يطابق حركاته،
 * ولا أداةَ ترحيلٍ يوم يتغيّر مفتاح الرصيد.
 *
 * وهذا هو العائق الحقيقيّ أمام ف‑١٨ لا المفتاح نفسه: من يقلب المفتاح بلا
 * أداةٍ تُثبت أنّه لم يُفسد شيئًا إنّما يقامر بكلّ رصيدٍ في المستودع.
 *
 * ═══ الفحص الذي يصمد عبر تغيير المفتاح ═══
 *
 * حين يتغيّر المفتاح (بإضافة الموقع والصلاحية) تتغيّر **كلّ** المعرّفات، فتبدو
 * الأرصدة كلّها «منحرفة» وهي سليمة. لذلك يُخرج التقرير طبقتين:
 *
 *   · `drift` — مقارنةٌ **بالمعرّف**: تكشف عطبًا تحت المفتاح نفسه.
 *   · `aggregates` — مقارنةٌ **بالصنف والمستودع**: تتجاهل تقسيم المفتاح
 *     الداخليّ، فتبقى صحيحة قبل القلب وبعده. **هذه هي بوّابة الترحيل**:
 *     تقسيمٌ أدقّ للرصيد لا يجوز أن يغيّر مجموعه.
 */

import { balanceId } from '../balances/balanceKey.js';

/** فرقٌ أصغر من هذا يُعدّ صفرًا — الكسور العشرية لا تُنتج انحرافًا وهميًّا. */
export const EPSILON = 0.0001;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v) => String(v ?? '').trim();

/**
 * زمن الحركة رقمًا للترتيب — يقبل `Timestamp` و`{seconds}` ورقمًا ونصًّا.
 * الغائب يُدفع إلى الآخر كي لا تتقدّم حركةٌ بلا ختمٍ على حركةٍ مختومة.
 */
export function moveTime(raw) {
  if (!raw) return Number.MAX_SAFE_INTEGER;
  if (typeof raw === 'number') return raw;
  if (typeof raw?.toMillis === 'function') return raw.toMillis();
  if (Number.isFinite(raw?.seconds)) return raw.seconds * 1000;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

/**
 * ترتيب الحركات: بالزمن ثمّ بالمعرّف.
 * المعرّف فاصلٌ حاسم لا تجميل — حركاتُ مستندٍ واحد تحمل ختمًا واحدًا، وبلا
 * فاصلٍ ثابتٍ يختلف ناتجُ إعادة البناء بين تشغيلين فيصير التقرير عديم المعنى.
 */
export function compareMoves(a, b) {
  const ta = moveTime(a?.postedAt);
  const tb = moveTime(b?.postedAt);
  if (ta !== tb) return ta - tb;
  return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
}

/**
 * يعيد بناء صفوف الأرصدة من الحركات وحدها — نفس دلالة `balanceDeltas`
 * (`from` ينقص و`to` يزيد، و«خارج المنشأة» لا رصيد له) مطبَّقةً على التاريخ كلّه.
 *
 * @returns {Array} صفوفٌ بالشكل نفسه الذي يخزّنه `ledgerService`
 */
export function rebuildFromMoves(moves) {
  const rows = new Map();

  const touch = (move, location, sign) => {
    if (location === null || location === undefined || location === '') return;
    // ‹LOC-105› نفس دلالة `balanceDeltas` حرفًا بحرف: لكلّ طرفٍ موقعُه،
    // و`bin` القديم يُقرأ توافقًا. اختلافُ الدالّتين هنا يجعل التقرير يكذب.
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
    if (!id) return;

    let row = rows.get(id);
    if (!row) {
      row = {
        id,
        sku: str(move.sku),
        barcode: str(move.barcode),
        nameAr: str(move.nameAr),
        warehouse: String(location).toUpperCase(),
        batch: str(move.batch),
        expiry: str(move.expiry),
        bin: '',
        unitCost: 0,
        qty: 0,
        moves: 0,
      };
      rows.set(id, row);
    }
    row.qty += sign * num(move.qty);
    row.moves += 1;
    // «آخرُ واردٍ يكسب» — نفس دلالة `balanceDeltas`، والترتيب الزمنيّ يجعلها حتميّة.
    if (sign > 0) {
      if (sideBin) row.bin = String(sideBin).toUpperCase();
      if (move.expiry) row.expiry = str(move.expiry);
      if (num(move.unitCost)) row.unitCost = num(move.unitCost);
      if (move.nameAr) row.nameAr = str(move.nameAr);
    }
  };

  for (const move of [...(moves || [])].sort(compareMoves)) {
    touch(move, move.from, -1);
    touch(move, move.to, +1);
  }
  return [...rows.values()];
}

/**
 * مفتاح التجميع الثابت عبر تغيير مفتاح الرصيد: **الصنف × المستودع**.
 * لا يشمل الدفعة ولا الموقع ولا الصلاحية — وهو المقصود: تقسيمٌ أدقّ للرصيد
 * لا يجوز أن يغيّر مجموعه.
 */
export function aggregateKey(row) {
  const item = String(row?.sku || row?.barcode || '').toUpperCase();
  const wh = String(row?.warehouse || '').toUpperCase();
  return `${item}__${wh}`;
}

function sumByAggregate(rows) {
  const out = new Map();
  for (const r of rows || []) {
    const k = aggregateKey(r);
    out.set(k, (out.get(k) || 0) + num(r.qty));
  }
  return out;
}

/**
 * يقارن ما يقوله الدفتر بما هو مخزَّن — **ولا يكتب شيئًا**.
 *
 * الفصل مقصود: الفحص فعلٌ آمن يُشغّل متى شئت، والكتابة فعلٌ صريح منفصل.
 * ودالّةٌ تفحص وتُصلح معًا تُشغَّل يومًا بنيّة الفحص فتُعيد كتابة المستودع.
 *
 * @returns {{ok:boolean, expected:Array, drift:Array, missing:Array, orphan:Array,
 *            totals:object, aggregates:Array, aggregatesOk:boolean}}
 */
export function reconcileBalances(moves, storedBalances, { epsilon = EPSILON } = {}) {
  const expected = rebuildFromMoves(moves);
  const expectedById = new Map(expected.map((r) => [r.id, r]));
  const storedById = new Map((storedBalances || []).map((b) => [b.id, b]));

  const drift = [];
  const missing = [];
  for (const [id, exp] of expectedById) {
    const stored = storedById.get(id);
    if (!stored) {
      // رصيدٌ يقوله الدفتر ولا وجود له. الصفر ليس عطبًا: صفٌّ نفد ولم يُكتب.
      if (Math.abs(exp.qty) > epsilon) missing.push({ ...exp, storedQty: null, diff: exp.qty });
      continue;
    }
    const diff = exp.qty - num(stored.qty);
    if (Math.abs(diff) > epsilon) {
      drift.push({
        id,
        sku: exp.sku,
        barcode: exp.barcode,
        nameAr: exp.nameAr,
        warehouse: exp.warehouse,
        batch: exp.batch,
        bin: exp.bin,
        expiry: exp.expiry,
        ledgerQty: exp.qty,
        storedQty: num(stored.qty),
        diff,
        moves: exp.moves,
      });
    }
  }

  const orphan = [];
  for (const [id, stored] of storedById) {
    if (expectedById.has(id)) continue;
    // رصيدٌ لا يسنده الدفتر: إمّا استيرادٌ افتتاحيّ (مشروع) أو أثرُ مفتاحٍ قديم
    // (يحتاج ترحيلًا). القيمة الصفريّة تُتجاهل — صفٌّ فارغٌ لا يدّعي شيئًا.
    if (Math.abs(num(stored.qty)) > epsilon) {
      orphan.push({
        id,
        sku: str(stored.sku),
        barcode: str(stored.barcode),
        warehouse: String(stored.warehouse || '').toUpperCase(),
        batch: str(stored.batch),
        ledgerQty: null,
        storedQty: num(stored.qty),
        diff: -num(stored.qty),
      });
    }
  }

  // ═══ الطبقة الثانية: المجموع بالصنف والمستودع ═══
  const ledgerAgg = sumByAggregate(expected);
  const storedAgg = sumByAggregate(storedBalances);
  const aggregates = [];
  for (const key of new Set([...ledgerAgg.keys(), ...storedAgg.keys()])) {
    const l = ledgerAgg.get(key) || 0;
    const s = storedAgg.get(key) || 0;
    if (Math.abs(l - s) > epsilon) aggregates.push({ key, ledgerQty: l, storedQty: s, diff: l - s });
  }

  const ledgerTotal = expected.reduce((s, r) => s + r.qty, 0);
  const storedTotal = (storedBalances || []).reduce((s, b) => s + num(b.qty), 0);

  return {
    ok: drift.length === 0 && missing.length === 0 && orphan.length === 0,
    aggregatesOk: aggregates.length === 0,
    expected,
    drift: drift.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)),
    missing,
    orphan,
    aggregates: aggregates.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)),
    totals: {
      ledgerRows: expected.length,
      storedRows: (storedBalances || []).length,
      ledgerQty: ledgerTotal,
      storedQty: storedTotal,
      diff: ledgerTotal - storedTotal,
    },
  };
}

/**
 * بوّابة الترحيل: أيجوز قلبُ مفتاح الرصيد الآن؟
 *
 * الشرط **ليس** غياب الانحراف بالمعرّف — المعرّفات ستتغيّر كلّها بحكم القلب.
 * الشرط أنّ **المجموع بالصنف والمستودع لم يتغيّر**: تقسيمٌ أدقّ لا يخلق كميّةً
 * ولا يُفنيها. ويُضاف شرطٌ ثانٍ: ألّا يبقى رصيدٌ يتيمٌ لا يسنده الدفتر، وإلّا
 * فُقد يوم القلب بلا أثر.
 *
 * @returns {{ok:boolean, blockers:string[]}}
 */
export function migrationVerdict(report) {
  const blockers = [];
  if (!report) return { ok: false, blockers: ['لا تقرير مطابقة — لا يُقلب مفتاحٌ على غير بيّنة.'] };

  if (!report.aggregatesOk) {
    blockers.push(
      `${report.aggregates.length} صنفًا/مستودعًا مجموعه في الدفتر يخالف المخزَّن — القلب يُفسدها. أصلح المطابقة أوّلًا.`
    );
  }
  if (report.orphan?.length) {
    blockers.push(
      `${report.orphan.length} رصيدًا لا يسنده الدفتر (استيرادٌ افتتاحيّ أو مفتاحٌ قديم) — يُرحَّل أو يُقيَّد قبل القلب وإلّا فُقد.`
    );
  }
  return { ok: blockers.length === 0, blockers };
}

/**
 * صفوف الرصيد الجاهزة للكتابة بعد إعادة البناء — بلا حقول الفحص.
 * تُستدعى فقط بعد قرارٍ صريح بإعادة الكتابة.
 */
export function rebuiltRowsForWrite(report) {
  return (report?.expected || []).map(({ moves: _moves, ...row }) => row);
}
