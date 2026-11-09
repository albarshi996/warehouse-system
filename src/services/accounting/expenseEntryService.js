/**
 * خدمةُ الإدخال السريع للمصروف (‹EXP-INV›) — الأثرُ الحيّ فوق بابِ المستندات.
 *
 * ═══ التعقيدُ الذي تُزيله ═══
 * المصروفُ المبوّب (EXP) كان يُنشأ من «بدء مستند جديد» ثمّ يُرحَّل يدويًّا في ثلاث
 * نقلاتٍ (إرسال ⟵ اعتماد ⟵ إنجاز) بتوقيعات. وهذه الدالّةُ تؤتمت النقلات الثلاث
 * **التي يضغطها الإنسان أصلًا** في ضغطةٍ واحدة — فلا مصدرَ بياناتٍ ثانٍ ولا دفترَ
 * موازٍ: المستندُ نفسُه يُقيَّد عند «منجَز» في دفتر الجهاز (`deriveExpenseEntry`)،
 * ويظهر في «المصاريف المبوّبة» وفي تقرير الفواتير — مصدرٌ واحد.
 *
 * ═══ الصدقُ عند الفشل ═══
 * لو انقطع الاتصالُ بين النقلات (على الويب)، تبقى مسودّةٌ/معتمَدٌ لا منجَز. نلتقط
 * الحالةَ التي بُلغت ونرفعها في الخطأ (`reached`) — فلا نكذب «سُجّل» ومستندٌ عالقٌ
 * بلا قيد (درسُ «الكتابة تُثبَت برسالة إتمامها»). على سطح المكتب (local-sqlite)
 * النقلاتُ شبه فوريّةٍ موثوقة.
 */
import { createDraft, transitionDocument } from '../documents/documentsService.js';
import { getSchema } from '../documents/schemas/index.js';
import { expenseEntryProblems, shapeExpenseHeader } from './expenseEntry.js';

/**
 * يسجّل مصروفًا مبوّبًا بخطوةٍ واحدة: ينشئ EXP ثمّ يرحّله إرسالًا فاعتمادًا فإنجازًا
 * (فيُقيَّد). يُعيد `{ id, number, reached:'done' }` عند الاكتمال.
 *
 * يرمي بخطأٍ يحمل `reached` (الحالةُ التي بُلغت) و`docId` إن تعثّر بعد الإنشاء —
 * فتُرشد الواجهةُ المستخدمَ إلى إكمال المستند لا إلى إعادة إنشائه.
 *
 * @param {object} input مدخلاتُ النموذج (expenseDate · invoiceNo · category · …)
 * @param {object} profile ملفُّ الفاعل (role · name) — دورُه يقرّر الصلاحيّة
 */
export async function recordExpense(input, profile) {
  const problems = expenseEntryProblems(input);
  if (problems.length) throw new Error(problems.join(' · '));

  const schema = getSchema('EXP');
  const header = shapeExpenseHeader(input);
  const id = await createDraft({ type: 'EXP', stage: schema.stage, profile, header });

  let reached = 'draft';
  try {
    await transitionDocument(id, 'submitted', { profile, schema });
    reached = 'submitted';
    await transitionDocument(id, 'approved', { profile, schema });
    reached = 'approved';
    const number = await transitionDocument(id, 'done', { profile, schema });
    return { id, number: number || '', reached: 'done' };
  } catch (cause) {
    const err = new Error(
      `أُنشئ المصروفُ وبلغ «${reached}» ولم يكتمل الإنجاز: ${cause?.message || cause}. أكمِله من «المستندات».`
    );
    err.docId = id;
    err.reached = reached;
    throw err;
  }
}
