/**
 * ‹ODOO-ORD› تنفيذُ استيراد أوامر أودو على البيانات الحيّة — الغلافُ السحابيّ لـ`orderImport.js`.
 *
 * يُعيد استعمالَ آلة الاستيراد المُرحِّل نفسِها: سجلُّ منع التكرار أوّلًا بمعرّفٍ محجوز ثمّ المستند
 * (`ensureDocument`)، والنقلاتُ بالمسار الرسميّ (`transitionDocument`). والفرقُ أنّ الأمرَ لا يُرحَّل:
 * يقف «معتمَدًا» سجلًّا للاطّلاع، ويُحدَّث في مكانه حين يتقدّم في أودو، ويُلغى حين يُلغى هناك.
 *
 * ميزانيةُ القراءة: سجلّاتُ الورقة ثلاثين ثلاثين + مستندُ كلِّ أمرٍ معروفٍ سلفًا (لتُقارَن حالتُه)؛ والأمرُ
 * الذي لم يتغيّر لا يُكتب له شيء.
 */
import { importSheet } from '../excel/excelImport.js';
import { transitionDocument, updateFromSource } from '../documents/documentsService.js';
import { getSchema } from '../documents/schemas/index.js';
import { buildOrdersPreview, orderMarker, toOrderDraft, ORDER_KIND } from './orderImport.js';
import { canPostImport, ensureDocument, fetchKnown, postedImportEnabled, whoami } from './postedImportService.js';

/** يقرأ الورقة ويبني المعاينة — بلا أيّ كتابة. */
export async function analyzeOrdersFile(file) {
  const result = await importSheet(file, 'sourceOrders', { sheetName: 'SourceOrders' });
  const rows = result?.rows || [];
  const first = buildOrdersPreview(rows, { sheetErrors: result?.errors });
  const known = await fetchKnown(first.orders.map((o) => o.markerId), ORDER_KIND);
  const preview = known.size ? buildOrdersPreview(rows, { known, sheetErrors: result?.errors }) : first;
  return { ...preview, fileName: file?.name || '' };
}

/** النقلاتُ الباقية من حالةٍ إلى الهدف — والإلغاءُ من «معتمَد» يمرّ بسببٍ مكتوب. */
const PATHS = {
  approved: { draft: ['submitted', 'approved'], submitted: ['approved'], rejected: ['submitted', 'approved'], approved: [] },
  canceled: { draft: ['canceled'], submitted: ['approved', 'canceled'], rejected: ['canceled'], approved: ['canceled'], canceled: [] },
};

/**
 * يطبّق قرارات المعاينة أمرًا أمرًا — وفشلُ أمرٍ لا يوقف إخوتَه.
 * @returns {Promise<{created:Array, updated:Array, canceled:Array, failed:Array}>}
 */
export async function commitOrdersImport(preview, profile, { onProgress } = {}) {
  if (!postedImportEnabled()) throw new Error('الاستيراد المُرحِّل مُطفأ (مفتاح الإطفاء).');
  if (!canPostImport(profile?.role)) throw new Error('استيرادُ الأوامر مقصورٌ على المدير العامّ ومدير المستودع.');
  if (preview?.errors?.length) throw new Error('لا يُستورد ملفٌّ فيه خطأ — صحّح الورقة وأعد رفعها.');
  if (!preview?.ok) throw new Error('لا شيء جديد — كلُّ أوامر الورقة مطابقةٌ لما في البوّابة.');

  const stamp = whoami(profile);
  const todo = preview.orders.filter((o) => ['new', 'newCanceled', 'resume', 'update', 'cancel'].includes(o.status));
  const out = { created: [], updated: [], canceled: [], failed: [] };

  for (const [index, o] of todo.entries()) {
    onProgress?.({ index, total: todo.length, docRef: o.docRef });
    const schema = getSchema(o.orderType);
    try {
      if (o.status === 'update') {
        // التحديثُ في المكان تقصره القاعدةُ على المدير العامّ — فيُرفض هنا بوضوحٍ قبل أن يرفضه الخادم بصمت.
        if (profile?.role !== 'admin') throw new Error('تحديثُ أمرٍ قائم للمدير العامّ وحده.');
        const d = toOrderDraft(o);
        await updateFromSource(o.documentId, { header: d.header, lines: d.lines, profile, note: `تحديثٌ من أودو (${o.sourceUpdatedAt})` });
        out.updated.push({ docRef: o.docRef, documentId: o.documentId, type: o.orderType });
        continue;
      }
      if (o.status === 'cancel') {
        await transitionDocument(o.documentId, 'canceled', { profile, schema, note: 'أُلغي في أودو' });
        out.canceled.push({ docRef: o.docRef, documentId: o.documentId, type: o.orderType });
        continue;
      }
      const cur = await ensureDocument(o, profile, stamp, { marker: orderMarker, draft: toOrderDraft });
      const target = o.canceled ? 'canceled' : 'approved';
      const steps = PATHS[target][cur.state];
      if (!steps) throw new Error(`الأمر في حالة «${cur.state}» — يُعالَج يدويًّا.`);
      let number = null;
      for (const to of steps) {
        const note = to === 'canceled' ? 'أُلغي في أودو' : 'استيرادُ أمرٍ من أودو';
        number = (await transitionDocument(cur.id, to, { profile, schema, note })) || number;
      }
      (target === 'canceled' ? out.canceled : out.created).push({ docRef: o.docRef, documentId: cur.id, number, type: o.orderType });
    } catch (err) {
      out.failed.push({ docRef: o.docRef, documentId: o.documentId, error: err?.message || String(err) });
    }
  }
  return out;
}
