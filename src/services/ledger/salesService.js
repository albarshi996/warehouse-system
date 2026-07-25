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
 * ═══ حدٌّ معروف موثَّق ═══
 * الحجز يبقى قائمًا حتى **إنجاز** أمر البيع لا حتى سحبه. فبين الاعتماد والإنجاز
 * — حين تخرج البضاعة بقائمة السحب — يبقى «المتاح» متحفّظًا (أقلّ من الحقيقي
 * بمقدار المحجوز الجاري). هذا **آمنٌ لا خطِر**: يُنقص المتاح فلا يُبيع ما لا
 * يوجد، ولا يزيده فيُبيع مرّتين. وعند الإنجاز يعود المتاح دقيقًا.
 */
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { fetchBalancesOnce } from '../balances/balancesService.js';
import { allocateDocument } from './reservations.js';
import { reserve, release } from './ledgerService.js';

const DOCS = 'documents';

/**
 * يخصّص بنود أمر البيع من الأرصدة المتاحة (FEFO) ويحجزها، ويثبّت الخطّة على
 * المستند كي يُفكّ الحجز لاحقًا بدقّة. يُعيد ملخّص التخصيص (بما فيه العجز).
 *
 * العجز لا يمنع — يُخزَّن على المستند كي يقرأه تقرير الأصناف غير المتوفّرة.
 */
export async function allocateAndReserve(soDoc) {
  const balances = await fetchBalancesOnce();
  const result = allocateDocument(soDoc, balances);

  // كل التخصيصات عبر البنود في قائمة واحدة — هي ما سيُحجز ويُفكّ.
  const allocations = result.lines.flatMap((line) => line.allocations || []);
  if (allocations.length) {
    await reserve(allocations);
  }

  // بصمة الحجز على المستند: الخطّة (للفكّ الدقيق) والعجز (للتقارير).
  const shortfall = result.lines
    .filter((l) => l.shortfall > 0)
    .map((l) => ({ sku: l.sku, barcode: l.barcode, nameAr: l.nameAr, requested: l.requested, allocated: l.allocated, shortfall: l.shortfall }));

  await updateDoc(doc(db, DOCS, soDoc.id), {
    soAllocation: allocations,
    soShortfall: shortfall,
    soReserved: true,
    soReleased: false,
    updatedAt: serverTimestamp(),
  });

  return { reserved: allocations.length, shortfall, fullyAllocated: result.fullyAllocated };
}

/**
 * يفكّ حجز أمر البيع من الخطّة المثبّتة عليه. يُستدعى عند إنجاز الأمر.
 * آمنٌ للتكرار: إن فُكّ الحجز من قبل لم يُفكّ ثانيةً (فلا يصير المحجوز سالبًا).
 */
export async function releaseReservation(soDoc) {
  if (soDoc?.soReleased) return { released: 0, already: true };
  const allocations = soDoc?.soAllocation || [];
  if (allocations.length) {
    await release(allocations);
  }
  await updateDoc(doc(db, DOCS, soDoc.id), {
    soReleased: true,
    updatedAt: serverTimestamp(),
  });
  return { released: allocations.length, already: false };
}
