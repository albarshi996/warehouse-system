/**
 * تغذيةُ الدفتر بالمزامنة — تحويلُ مستنداتِ الدورة المرآةِ إلى أجسام نداء
 * `post_journal_local` (024). **الكاتبُ الواحد (§3):** تستعمله آلةُ المزامنة
 * وحدَها حين تُرفع رايةُ `SYNC_LEDGER` — لا البوّابة، ولا بجانبِ كتابتها.
 *
 * ★ منطقٌ خالص: يعيد استعمال محرّك الاشتقاق (`deriveLedgerEntry`) وعقدَ النداء
 *   (`buildPostJournalBody`) المُختبَرَين. لا شبكةَ ولا قاعدة هنا — فيُختبَر في
 *   Node وحدَه، والمزامنةُ تتولّى صياغةَ SQL وتمريرَه إلى `psql`.
 *
 * ★★ **المفتاحُ حتميٌّ من المستند** (`entry.key = ple.id`)، فإعادةُ الدورة على
 *    نفس المستند تُنتج نفسَ المفتاح، و`post_journal_local` يتخطّاه (القفزُ لا
 *    الرفض). فالتشغيلُ المتكرّر آمنٌ بلا تكرارِ قيد.
 */
import { deriveLedgerEntry, COUNTERPART } from './deriveEntries.js';
import { buildPostJournalBody } from './ledgerRpc.js';
import { baseOf } from './accounts.js';

/**
 * ★★★ **الحالاتُ النهائيّةُ وحدَها تُرحَّل إلى الدفتر** — وهذا تصحيحُ عطبٍ كشفته
 *     المراجعةُ العدائيّة (2026-10-26): الترحيلُ من «معتمَد» يُفسد الدفترَ
 *     بطريقين، لأنّ المفتاحَ حتميٌّ والبابُ يتخطّى القائمَ ولا عكسَ في المسار:
 *       ١) تعديلُ مديرٍ لمستندٍ معتمَدٍ غيرِ مقيَّدٍ مخزنيًّا (011 يجيزه) يترك
 *          قيدًا بالمبلغ القديم أبدًا — انحرافٌ صامتٌ لا يكشفه توازنُ الدفتر.
 *       ٢) إلغاءُ معتمَدٍ بعد ترحيله (approved→canceled، 011 يجيزه) يترك قيدًا
 *          شبحيًّا لا يُعكَس.
 *     و«منجَز/مغلق» في آلة الحالات (011) **لا يُعدَّلان** (التعديلُ مشروطٌ
 *     بـsubmitted/approved) **ولا يُلغَيان** (الإلغاءُ من approved وحدَها) —
 *     فالترحيلُ منهما نهائيٌّ آمن، والمفتاحُ الحتميُّ صحيحٌ أبدًا. والتصحيحُ
 *     بمستندٍ مضادٍّ (إشعار/مرتجع يُرحَّل قيدَه) لا بنقضِ قيدٍ منجَز — وهو عينُ
 *     المحاسبة السليمة: تُقيَّد الواقعةُ حين تُنجَز لا وهي تتقلّب.
 */
export const POSTABLE_STATES = Object.freeze(['done', 'closed']);

/**
 * أجسامُ نداء `post_journal_local` من مجموعة مستندات — المعتمَدة وحدها، وما
 * قبل حدّ الافتتاح يُسقط بهدوء (كالمحرّك). كلُّ جسمٍ يحمل `p_source_id` = معرّفَ
 * المستند لأثرٍ يُتبَّع.
 * @returns {Array<{p_key,p_date,p_amount,p_lines,p_memo,p_source_type,p_source_id,p_reverses,p_shop}>}
 */
export function ledgerCallBodies(documents = [], { states = POSTABLE_STATES } = {}) {
  return (Array.isArray(documents) ? documents : [])
    .filter((d) => states.includes(d?.state) && COUNTERPART[d?.type])
    .map((d) => {
      try {
        const entry = deriveLedgerEntry(d);
        if (!entry) return null;
        entry.docId = d.id || d.__id || '';
        const body = buildPostJournalBody(entry);
        // ★★★ تحويلُ اصطلاح الحساب لقاعدةِ البيانات: المحرّكُ يسمّي حسابَ
        //     الذمّة الفرعيَّ نصًّا (`AR:C-1`) للعرض، لكنّ جدولَ `accounts`
        //     يحمل الحسابَ **الأساس** وحدَه (مفتاحٌ أجنبيٌّ على `journal_lines`)
        //     والطرفُ عمودٌ مستقلّ (`party`). فيُردّ الحسابُ إلى أساسه ويبقى
        //     الطرفُ في حقله — وإلّا كسر المفتاحُ الأجنبيُّ الإدراجَ. كشفته
        //     التجربةُ الحيّة لا الاختبار (بيانات الاختبار كانت نظيفةً أصلًا).
        body.p_lines = body.p_lines.map((l) => ({ ...l, account: baseOf(l.account) }));
        return body;
      } catch {
        return null; // قبل T0 أو مستندٌ معطوب — لا يُسقط الباقي
      }
    })
    .filter(Boolean);
}
