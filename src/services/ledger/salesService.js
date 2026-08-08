/**
 * خدمة المبيعات — تربط اعتماد أمر البيع بحجز الرصيد الفعلي.
 *
 * المبدأ: **اعتماد أمر البيع التزامٌ على المخزون، لا توقيعٌ على ورقة.** فحين
 * يُعتمد الأمر تُحجز كمياته من المستودع المصدر بترتيب FEFO — فيهبط «المتاح»
 * الذي يراه البائع التالي، ولا يَعِد اثنان بنفس الكمية. وحين يُنجَز الأمر (اكتمل
 * أو أُغلق) يُفكّ الحجز — لأن ما بقي محجوزًا بلا أمرٍ حيّ يُخفي بضاعةً موجودة.
 *
 * لماذا خدمةٌ مستقلّة لا داخل محرّك المستندات؟ لأن الحجز أثرٌ جانبيّ لدورة
 * المبيعات وحدها، ومحرّك المستندات يخدم أربع عشرة نوعًا لا يعني أكثرها حجزًا.
 * الفصل يُبقي المحرّك عامًّا وهذه الخدمة مركَّزة.
 *
 * ═══ لماذا الحجز أفضل جهدٍ لا شرطُ اعتماد؟ ═══
 * الاعتماد قرار المدير؛ والحجز نتيجةٌ محاسبية له. لو فشل الحجز (تعذّرت كتابة
 * الرصيد لحظتها) لم نُبطل قرار المدير — بل نُثبت الفشل في سجلّ التدقيق بصوتٍ
 * عالٍ ونُعيد النتيجة كي تُعالَج، فمستندٌ معتمَد بلا حجز استثناءٌ يُلاحَق لا
 * صمتٌ يُحتمل. (والمعتمِد وارهاوس-مانجر وهو فاعلٌ مخزنيّ، فالفشل نادر.)
 *
 * ═══ الذرّية: لماذا معاملةٌ لا قراءةٌ ثم كتابة؟ ═══
 * لو قرأنا الأرصدة خارج معاملة ثم حجزنا على أساسها، لأمكن لأمرَي بيعٍ متزامنَين
 * أن يقرآ «متاح 100» معًا فيحجز كلٌّ مئة ⇒ التزامٌ بضعف الموجود. لذا التخصيص
 * والحجز والبصمة يقعون **داخل `runTransaction`**: تُقرأ الأرصدة المرشّحة طازجةً
 * لحظتها، فأيّ حجزٍ متزامن يظهر، وتعيد Firestore تشغيل المعاملة عند التعارض.
 * ولأن المعاملة **لا تشغّل استعلامًا** (تقرأ مستندات بعينها)، نكتشف معرّفات
 * الصفوف المرشّحة أوّلًا خارجها، ثم نقرؤها بعينها داخلها.
 *
 * ═══ متى يُفكّ الحجز؟ (BZ-SCN-004) ═══
 * يُفكّ عند **إنجاز السحب (PICK)** بمقدار ما سُحب فعلًا — لأنّ البضاعة غادرت الرفّ
 * حينها فلا تبقى محجوزةً عليه — وكذلك عند إنجاز أمر البيع أو إغلاقه (لتحرير أيّ
 * بقيّة). قبل هذا كان الحجز لا يُفكّ إلا بانتقال أمر البيع نفسه إلى «منجَز»، وهو
 * ما لا يقع في الدورة (تُنجزها المستندات التابعة PICK/DN/POD وأمر البيع يبقى
 * معتمَدًا) — فيتراكم حجزٌ ميّت يُخفي بضاعةً خرجت، ويرفض طلباتٍ سليمة.
 *
 * التحرير الجزئيّ محكومٌ ببصمتين تمنعان الازدواج: `soReleaseLog` (أيّ مستند سحبٍ
 * طُبّق) و`soReleasedByKey` (كم فُكّ من كل مفتاح حجز) — فلا يُفكّ أكثر ممّا حُجز
 * ولو تكرّر الحدث أو أُنجز أمر البيع بعد سحبه.
 */
import {
  doc,
  serverTimestamp,
  runTransaction,
  increment,
} from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { fetchBalancesOnce } from '../balances/balancesService.js';
import { allocateDocument, reservationDeltas, planItemRelease, planFullRelease, isFullyReleased } from './reservations.js';

const DOCS = 'documents';
const BALANCES = 'balances';

/** مجموعة معرّفات أصناف أمر البيع (sku أو barcode) بصيغة موحّدة. */
function orderItemKeys(soDoc) {
  return new Set(
    (soDoc?.lines || [])
      .map((l) => String(l?.sku || l?.barcode || '').trim().toUpperCase())
      .filter(Boolean)
  );
}

function toShortfall(lines) {
  return lines
    .filter((l) => l.shortfall > 0)
    .map((l) => ({
      sku: l.sku,
      barcode: l.barcode,
      nameAr: l.nameAr,
      requested: l.requested,
      allocated: l.allocated,
      shortfall: l.shortfall,
    }));
}

/**
 * يخصّص بنود أمر البيع من الأرصدة المتاحة (FEFO) ويحجزها ذرّيًّا، ويثبّت الخطّة
 * على المستند كي يُفكّ الحجز لاحقًا بدقّة. يُعيد ملخّص التخصيص (بما فيه العجز).
 *
 * العجز لا يمنع — يُخزَّن على المستند كي يقرأه تقرير الأصناف غير المتوفّرة.
 * إيديمبوتنت: إن سبق الحجز (`soReserved`) لم يُكرَّر — يُفحص داخل المعاملة.
 */
export async function allocateAndReserve(soDoc) {
  // خارج المعاملة: اكتشاف **معرّفات** الصفوف المرشّحة لأصناف الأمر فقط
  // (لا يمكن تشغيل استعلام داخل معاملة). قيمها تُقرأ طازجةً داخل المعاملة.
  const wantKeys = orderItemKeys(soDoc);
  const candidateIds = (await fetchBalancesOnce())
    .filter((b) => {
      const s = String(b?.sku || '').trim().toUpperCase();
      const bc = String(b?.barcode || '').trim().toUpperCase();
      return wantKeys.has(s) || wantKeys.has(bc);
    })
    .map((b) => b.id)
    .filter(Boolean);

  return runTransaction(db, async (tx) => {
    const soRef = doc(db, DOCS, soDoc.id);
    const soSnap = await tx.get(soRef);
    if (!soSnap.exists()) throw new Error('أمر البيع غير موجود.');
    const fresh = soSnap.data();
    if (fresh.soReserved) {
      // حُجز من قبل — لا نكرّر (يمنع الحجز المزدوج تحت التزامن).
      return {
        reserved: (fresh.soAllocation || []).length,
        shortfall: fresh.soShortfall || [],
        fullyAllocated: (fresh.soShortfall || []).length === 0,
        already: true,
      };
    }

    // قراءة الأرصدة المرشّحة **طازجةً داخل المعاملة** (كلّ القراءات قبل الكتابة).
    const freshBalances = [];
    for (const id of candidateIds) {
      const bSnap = await tx.get(doc(db, BALANCES, id));
      if (bSnap.exists()) freshBalances.push({ id, ...bSnap.data() });
    }

    // التخصيص على المتاح الطازج (qty − qtyReserved) بترتيب FEFO.
    const result = allocateDocument(fresh, freshBalances);
    const allocations = result.lines.flatMap((line) => line.allocations || []);
    const shortfall = toShortfall(result.lines);

    // الحجز على `qtyReserved` ذرّيًّا مع بصمة الأمر — كلّها أو لا شيء.
    reservationDeltas(allocations, 1).forEach((d) => {
      tx.set(
        doc(db, BALANCES, d.id),
        {
          sku: d.sku,
          barcode: d.barcode,
          warehouse: d.warehouse,
          batch: d.batch,
          qtyReserved: increment(d.delta),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });

    tx.update(soRef, {
      soAllocation: allocations,
      soShortfall: shortfall,
      soReserved: true,
      soReleased: false,
      updatedAt: serverTimestamp(),
    });

    return {
      reserved: allocations.length,
      shortfall,
      fullyAllocated: result.fullyAllocated,
      already: false,
    };
  });
}

/**
 * يفكّ **ما تبقّى** محجوزًا من أمر البيع. يُستدعى عند إنجاز الأمر أو إغلاقه —
 * فيحرّر البقيّة التي لم يفكّها السحب الجزئيّ، ولا يُكرّر ما فُكّ (يقرأ
 * `soReleasedByKey`). ذرّيّ وإيديمبوتنت: `soReleased` يُقرأ **داخل المعاملة**،
 * فنقرتان متزامنتان لا تفكّان مرّتين — وإلّا صار المحجوز سالبًا (بيعٌ مزدوج).
 */
export async function releaseReservation(soDoc) {
  return runTransaction(db, async (tx) => {
    const soRef = doc(db, DOCS, soDoc.id);
    const soSnap = await tx.get(soRef);
    if (!soSnap.exists()) throw new Error('أمر البيع غير موجود.');
    const fresh = soSnap.data();
    if (fresh.soReleased) return { released: 0, already: true };

    const { deltas, releasedByKey } = planFullRelease(fresh.soAllocation || [], fresh.soReleasedByKey || {});
    deltas.forEach((d) => {
      tx.set(
        doc(db, BALANCES, d.id),
        { qtyReserved: increment(d.delta), updatedAt: serverTimestamp() },
        { merge: true }
      );
    });

    tx.update(soRef, { soReleased: true, soReleasedByKey: releasedByKey, updatedAt: serverTimestamp() });
    return { released: deltas.length, already: false };
  });
}

/**
 * يفكّ حجز أمر البيع بمقدار ما سُحب فعلًا في مستند سحبٍ (PICK) منجَز — البضاعة
 * غادرت الرفّ فلا تبقى محجوزةً عليه (BZ-SCN-004). يقرأ أمر البيع الأصل من
 * `pickDoc.links.SO` (لا بحثًا نصّيًّا)، ويوزّع المسحوب على مفاتيح الحجز.
 *
 * ذرّيّ وإيديمبوتنت: كلٌّ من `soReleaseLog` (بصمة مستند السحب) و`soReleasedByKey`
 * (المُحرَّر لكل مفتاح) يُقرأ داخل المعاملة، فإعادة إنجاز السحب لا تفكّ مرّتين.
 */
export async function releaseForPick(pickDoc) {
  const soLink = pickDoc?.links?.SO;
  if (!soLink?.id) return { released: 0, skipped: 'no-so' };

  const wantByItem = {};
  for (const l of pickDoc?.lines || []) {
    const k = String(l?.sku || l?.barcode || '').trim().toUpperCase();
    const q = Number(l?.qtyPicked) || 0;
    if (!k || q <= 0) continue;
    wantByItem[k] = (wantByItem[k] || 0) + q;
  }
  if (!Object.keys(wantByItem).length) return { released: 0, skipped: 'no-picked' };

  return runTransaction(db, async (tx) => {
    const soRef = doc(db, DOCS, soLink.id);
    const soSnap = await tx.get(soRef);
    if (!soSnap.exists()) throw new Error('أمر البيع المرتبط غير موجود.');
    const fresh = soSnap.data();
    if (!fresh.soReserved) return { released: 0, skipped: 'not-reserved' };

    const log = Array.isArray(fresh.soReleaseLog) ? fresh.soReleaseLog : [];
    if (log.includes(pickDoc.id)) return { released: 0, already: true };

    const { deltas, releasedByKey } = planItemRelease(
      fresh.soAllocation || [],
      fresh.soReleasedByKey || {},
      wantByItem
    );
    deltas.forEach((d) => {
      tx.set(
        doc(db, BALANCES, d.id),
        { qtyReserved: increment(d.delta), updatedAt: serverTimestamp() },
        { merge: true }
      );
    });

    const released = deltas.reduce((s, d) => s - d.delta, 0);
    tx.update(soRef, {
      soReleasedByKey: releasedByKey,
      soReleaseLog: [...log, pickDoc.id],
      soReleased: isFullyReleased(fresh.soAllocation || [], releasedByKey),
      updatedAt: serverTimestamp(),
    });
    return { released, already: false };
  });
}
