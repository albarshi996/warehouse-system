/**
 * بابُ ترحيلِ المستندات إلى الدفتر المحلّيّ (المرحلة م) — يُفعّل مسارَ الكتابة الخامل.
 *
 * عند بلوغ المستندِ حالةً نهائيّة (منجَز/مغلق) يُشتقّ قيدُه المزدوجُ ويُلحَق بدفتر
 * الجهاز — فتصير «منجَز» تولّد قيدًا فعليًّا (درس [[feedback-wiring-before-done]]).
 *
 * ★★ **ذرّيٌّ ومتخطٍّ**: المعرّفُ حتميّ (`TYPE__id`)، فإعادةُ الترحيل تُتخطّى ولا
 *    تُضاعِف (أمانُ الملحق-فقط من المخزن). ★ **موسومٌ بالمحلّ** تلقائيًّا (يضعه
 *    `deriveLedgerEntry` من المستند). ★ **بابٌ محقونٌ لا مستورَد** فيُبرهَن في Node.
 *
 * بوّابةُ التفعيل (الخلفيّة `local-sqlite` وحدَها) تبقى عند المُنادي (`documentsService`)
 * كي لا يكتب الويبُ (Firestore) شيئًا — هنا المنطقُ الخالصُ للترحيل.
 */
import { createLocalLedger } from './localLedgerStore.js';
import { POSTABLE_STATES } from './ledgerSync.js';

export function createLedgerPost(db) {
  const L = createLocalLedger(db);

  /**
   * يُرحّل مستندًا نهائيًّا (أو عدّة) إلى الدفتر — النهائيّةُ وحدَها، ذرّيًّا ومتخطّيًا.
   * القيدُ يُوسَم بمحلّ مستنده تلقائيًّا. ترشيحٌ اختياريٌّ بمحلٍّ للدفعة.
   * @returns خلاصةُ `postDocuments` (مُرحَّل · متخطًّى · فاشل).
   */
  async function postDone(documents, shop) {
    const docs = Array.isArray(documents) ? documents : [documents].filter(Boolean);
    return L.postDocuments(docs, { states: POSTABLE_STATES, shop });
  }

  return { postDone };
}
