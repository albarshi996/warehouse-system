/**
 * خدمةُ الكاشير (‹POS م٧›) — البيعُ بخطوةٍ واحدة فوق بابِ المستندات.
 *
 * عند «بيع»: يُنشئ مستند POS ويُرحّله (إرسال→اعتماد→إنجاز) في ضغطةٍ واحدة — فيقع
 * عند «منجَز»: **(أ)** خصمُ المخزون (المخزن→خارج، `POSTING_RULES.POS`)، **(ب)** قيدٌ
 * مزدوجٌ مدينٌ النقد/البنك دائنٌ المبيعات (`deriveSaleEntry`). مصدرٌ واحد: المستندُ
 * نفسُه يُقيَّد في دفتر الجهاز ويظهر في التقارير — نمطُ `recordExpense`.
 *
 * الرياضياتُ الخالصةُ (`cartTotals` · `saleProblems`) في `cashierCart.js` تُختبر
 * وحدها؛ وهذا غلافٌ رفيعٌ يستدعي بابَ المستندات.
 */
import { createDraft, transitionDocument } from '../documents/documentsService.js';
import { getSchema } from '../documents/schemas/index.js';
import { cartTotals, saleProblems } from './cashierCart.js';

const str = (v) => String(v ?? '').trim();
const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * يصوغ رأسَ مستند POS وبنودَه من السلّة (منطقٌ خالصٌ يُختبر). الإجماليُّ والباقي
 * من `cartTotals` — فالقيدُ يقرأ `grandTotal` المختوم، لا يُعيد حسابَه.
 */
export function shapeSale(input = {}) {
  const t = cartTotals(input.lines, {
    cartDiscount: input.cartDiscount,
    paid: input.paid,
    method: input.paymentMethod,
  });
  const header = {
    saleDate: str(input.saleDate) || todayIso(),
    warehouse: str(input.warehouse).toUpperCase(),
    paymentMethod: str(input.paymentMethod),
    customer: str(input.customer),
    cartDiscount: t.cartDiscount,
    grandTotal: t.grandTotal,
    amountPaid: t.paid,
    change: t.change,
    note: str(input.note),
  };
  const lines = t.rows.map((r) => ({
    sku: str(r.sku),
    barcode: str(r.barcode),
    description: str(r.description),
    qty: Number(r.qty) || 0,
    uom: str(r.uom),
    unitPrice: Number(r.unitPrice) || 0,
    discount: Number(r.discount) || 0,
  }));
  return { header, lines, totals: t };
}

/**
 * يسجّل بيعًا نقديًّا بخطوةٍ واحدة. يُعيد `{ id, number, grandTotal, change }` عند
 * الاكتمال، أو يرمي بخطأٍ يحمل `reached` إن تعثّر بعد الإنشاء.
 *
 * @param {object} input مدخلاتُ السلّة (lines · warehouse · paymentMethod · paid · …)
 * @param {object} profile ملفُّ الفاعل (role · name)
 */
export async function recordSale(input, profile) {
  const problems = saleProblems(input);
  if (problems.length) throw new Error(problems.join(' · '));

  const schema = getSchema('POS');
  const { header, lines, totals } = shapeSale(input);
  const id = await createDraft({ type: 'POS', stage: schema.stage, profile, header, lines });

  let reached = 'draft';
  try {
    await transitionDocument(id, 'submitted', { profile, schema });
    reached = 'submitted';
    await transitionDocument(id, 'approved', { profile, schema });
    reached = 'approved';
    const number = await transitionDocument(id, 'done', { profile, schema });
    return { id, number: number || '', grandTotal: totals.grandTotal, change: totals.change, reached: 'done' };
  } catch (cause) {
    const err = new Error(
      `أُنشئ البيعُ وبلغ «${reached}» ولم يكتمل الإنجاز: ${cause?.message || cause}. أكمِله من «المستندات».`
    );
    err.docId = id;
    err.reached = reached;
    throw err;
  }
}
