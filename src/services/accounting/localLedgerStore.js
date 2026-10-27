/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  دفترُ القيد المحليّ على المخزن — النظيرُ المحلّيُّ لـ`post_journal_local`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * م٢ · الشريحةُ الأولى: أوّلُ مستهلكٍ فعليٍّ لخلفيّة م١ (`local-sqlite`). يخزّن
 * القيدَ المزدوجَ في مجموعة `journal_entries` على المخزن المحلّيّ (SQLite عبر
 * Tauri)، فيملك الجهازُ محاسبتَه بلا إنترنت — قرارُ المالك 2026-10-25 «الدفترُ
 * المحليُّ يملك المحاسبة».
 *
 * ★★★ **عقدُ `post_journal` الأربعةُ مفروضةٌ في المنطق المُختبَر** (إذ لا RLS في
 *     SQLite، فالتخويلُ والعقودُ تنتقل إلى بابِ الكتابة الواحد — خطّة §2):
 *       ① **متوازن** · ② **مفتاحٌ فريد** · ③ **تصحيحٌ بعكسٍ لا حذف** · ④ **فترةٌ
 *       مقفلةٌ ≥ T0** — كلُّها بإعادة استعمال `postEntry`/`reverseEntry` حرفيًّا،
 *       فلا تُكتب القاعدةُ مرّتين ولا تنحرف دلالتُها عن مسار PostgreSQL.
 *
 * ★★ **كاتبٌ واحد (§3):** هذا هو البابُ الوحيد الذي يكتب الدفترَ؛ لا الشاشةُ ولا
 *    بجانبِ كتابتها. والعمليّاتُ المغيّرةُ (`postJournal`/`reverse`) **تُسلسَل في
 *    الباب** (طابورُ وعود)، فلا تتداخل قراءةُ-ثمّ-كتابةِ عمليّتين: يبقى فحصُ
 *    «المفتاحُ قائمٌ؟» موثوقًا، والكتابةُ **ملحقةٌ-فقط** (**القفزُ لا الرفض** على
 *    مفتاحٍ قائم، لا كتابةٌ فوقَه ولا حذف)، والتصحيحُ بقيدٍ مضادٍّ مرتبط.
 *
 * ⚠️ **حدُّ المواءمة (صادقٌ لا مُدَّعًى):** هذا ضمانٌ على مستوى الباب الواحد —
 *    عمليّةٌ واحدةٌ على الجهاز — لا ضمانٌ بنيويٌّ في القاعدة كنظيره في PostgreSQL
 *    (`journal_entries.key` مفتاحٌ أوّليّ + مُحفِّزا الملحق-فقط، 014/024). فالمخزنُ
 *    العامُّ `kv_docs` بدائيّتُه UPSERT (دهسٌ لا رفض)، والحارسُ البنيويُّ على مستوى
 *    Rust/SQL تحصينٌ لاحقٌ (خطّة §2: العقودُ والتخويلُ تنتقل إلى طبقة الأوامر).
 *    والكاتبُ هنا واحدٌ في عمليّةٍ واحدة، فالتسلسلُ عند الباب هو الحدُّ الكافي لهذا
 *    المعمار — والبرهانُ عليه اختبارُ تنادٍ متزامنٍ يُثبت أنّ الأوّلَ لا يُدهَس.
 *
 * ★ **خاملٌ:** صفرُ مستهلكين — لا شاشةَ تستورده بعد. ومحايدُ الخلفيّة: يعمل فوق
 *   أيِّ بابٍ يحقّق عقدَ Firestore (في الاختبار `createLocalDb`، وفي سطح المكتب
 *   محوَّلُ `local-sqlite`) — فيُبرهَن بلا جهازٍ ولا Rust، ثمّ على SQLite حقيقيّة.
 *
 * منطق خالصٌ فوق بابٍ محقون: بلا Firestore وبلا شبكةٍ هنا.
 */
import { postEntry, reverseEntry, createLedger } from './journal.js';
import { deriveLedgerEntry, COUNTERPART } from './deriveEntries.js';
import { POSTABLE_STATES } from './ledgerSync.js';

/** مجموعةُ القيود على المخزن المحلّيّ — ملحقةٌ-فقط، المعرّفُ هو مفتاحُ القيد. */
export const JOURNAL_COLLECTION = 'journal_entries';

/** قيدٌ مُطبَّعٌ (من المحرّك) ⟵ وثيقةُ مخزنٍ تحمل القيدَ وأثرَه ومصدرَه. */
function toDocData(entry, db) {
  return {
    key: entry.key,
    date: entry.date,
    memo: entry.memo || '',
    amount: entry.amount, // وحدةٌ صغرى صحيحة
    lines: entry.lines.map((l) => ({
      account: String(l.account || ''),
      party: String(l.party || ''),
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
    })),
    sourceType: entry.docType || entry.source_type || '',
    sourceId: entry.docId || entry.source_id || '',
    reverses: entry.reverses || null,
    shop: entry.shop_id || entry.shop || null,
    postedAt: db.serverTimestamp(),
  };
}

/**
 * بابُ دفترٍ محلّيٌّ فوق بابِ بياناتٍ بعقد Firestore.
 * @param {object} db باب البيانات (مصنعُ `createLocalDb` أو محوَّلُ `local-sqlite`).
 */
export function createLocalLedger(db) {
  if (!db || typeof db.runTransaction !== 'function' || typeof db.doc !== 'function') {
    throw new Error('createLocalLedger يحتاج بابَ بياناتٍ يحقّق عقدَ Firestore');
  }

  const entryRef = (key) => db.doc(db.db, JOURNAL_COLLECTION, String(key));

  // طابورُ تسلسلٍ للعمليّات المغيّرة: يضمن ألّا تتداخل قراءةُ-ثمّ-كتابةِ عمليّتين،
  // فيبقى فحصُ «المفتاحُ قائمٌ؟» موثوقًا ولو نُودي البابُ متزامنًا (كاتبٌ واحدٌ
  // بنيويٌّ عند الباب لا سلوكيٌّ فقط). العملُ لا يرمي، فكلا فرعَي then يمرّرانه.
  let writeTail = Promise.resolve();
  function serialize(work) {
    const run = writeTail.then(work, work);
    writeTail = run.then(() => undefined, () => undefined);
    return run;
  }

  /** يُلحق قيدًا مُطبَّعًا دون قفلٍ — يُنادى داخل `serialize` وحدَه. */
  async function appendEntry(entry) {
    const outcome = await db.runTransaction(db.db, async (tx) => {
      const snap = await tx.get(entryRef(entry.key));
      if (snap.exists()) return 'skip'; // ② مفتاحٌ قائم: القفزُ لا الرفض ولا الكتابةُ فوقَه
      tx.set(entryRef(entry.key), toDocData(entry, db));
      return 'posted';
    });
    return { ok: true, key: entry.key, posted: outcome === 'posted', skipped: outcome === 'skip' };
  }

  /** يتحقّق من أيّ مدخلٍ قيدًا عبر المحرّك (العقودُ الأربعة)، ويحمل معه مصدرَه. */
  function normalize(input) {
    const e = postEntry({ key: input?.key, date: input?.date, memo: input?.memo, lines: input?.lines });
    e.docType = input?.docType ?? input?.source_type ?? '';
    e.docId = input?.docId ?? input?.source_id ?? '';
    e.reverses = input?.reverses ?? null;
    e.shop = input?.shop_id ?? input?.shop ?? null;
    return e;
  }

  /**
   * يُلحق قيدًا واحدًا: يتحقّق (العقودُ الأربعة)، ثمّ يُلحق **مُسلسَلًا** فيكون
   * **القفزُ لا الرفض** على مفتاحٍ قائمٍ موثوقًا (لا يُضاعَف ولا يُكتب فوقَ سابق).
   * لا يرمي أبدًا — كلُّ فشلٍ سببٌ صريح.
   * @returns {Promise<{ok:true,key:string,posted:boolean,skipped:boolean}|{ok:false,reason:string,message?:string}>}
   */
  async function postJournal(input) {
    let entry;
    try {
      entry = normalize(input); // تحقّقٌ خالصٌ لا يمسّ المخزن — قبل القفل
    } catch (e) {
      return { ok: false, reason: 'bad-entry', message: e.message };
    }
    return serialize(async () => {
      try {
        return await appendEntry(entry);
      } catch (e) {
        return { ok: false, reason: 'store', message: e.message };
      }
    });
  }

  /** يُلحق قيودًا كثيرة ويُعيد خلاصةً (مُرحَّل · متخطًّى · فاشل) وتفاصيلَها. */
  async function postEntries(entries = []) {
    const summary = { posted: 0, skipped: 0, failed: 0, results: [] };
    for (const e of Array.isArray(entries) ? entries : []) {
      const r = await postJournal(e); // تسلسليٌّ: كاتبٌ واحدٌ لا تسابقَ
      if (!r.ok) summary.failed += 1;
      else if (r.skipped) summary.skipped += 1;
      else summary.posted += 1;
      summary.results.push(r);
    }
    return summary;
  }

  /**
   * المُغذّي (الكاتبُ الواحد): مستنداتُ الدورة ⟵ قيودٌ مشتقّة. **الحالاتُ
   * النهائيّةُ وحدَها** (`POSTABLE_STATES` = منجَز/مغلق) — لا «معتمَد» المتقلّب،
   * إذ المفتاحُ حتميٌّ والبابُ يتخطّى القائمَ، فالترحيلُ من متغيّرٍ يُفسد الدفترَ
   * (درسُ `ledgerSync`). وما قبل T0 أو المعطوبُ يُسقط بهدوء بلا إسقاطِ الباقي.
   */
  function docEntries(documents = [], { states = POSTABLE_STATES } = {}) {
    return (Array.isArray(documents) ? documents : [])
      .filter((d) => states.includes(d?.state) && COUNTERPART[d?.type])
      .map((d) => {
        try {
          const e = deriveLedgerEntry(d);
          if (!e) return null;
          e.docId = d.id || d.__id || ''; // أثرٌ يُتبَّع إلى المستند المصدر
          return e;
        } catch {
          return null; // ④ قبل T0 (فترةٌ مقفلة) أو مستندٌ معطوب
        }
      })
      .filter(Boolean);
  }

  /** يُغذّي الدفترَ من مجموعة مستنداتٍ نهائيّةٍ — نظيرُ `ledgerSync` محلّيًّا. */
  async function postDocuments(documents, opts) {
    return postEntries(docEntries(documents, opts));
  }

  /**
   * ③ تصحيحٌ بعكسٍ مرتبطٍ لا حذف: يقرأ القيدَ القائمَ ويُلحق قيدًا مضادًّا
   * (`<key>~REV`). إعادتُه على المفتاح نفسِه تُتخطّى (idempotent). القيدُ الأصليُّ
   * لا يُمسّ. أمّا تصحيحُ حركةِ مستندٍ فبمستندٍ مضادّ يُرحَّل قيدُه، لا بعكسٍ يدويّ.
   */
  async function reverse(key, { date, reason = '' } = {}) {
    return serialize(async () => {
      let stored;
      try {
        const snap = await db.getDoc(entryRef(key)); // قراءةٌ محميّةٌ كنظيرِها في postJournal
        if (!snap.exists()) return { ok: false, reason: 'not-found' };
        stored = snap.data();
      } catch (e) {
        return { ok: false, reason: 'store', message: e.message };
      }
      let rev;
      try {
        rev = reverseEntry({ key: stored.key, date: stored.date, lines: stored.lines }, { date, reason });
      } catch (e) {
        return { ok: false, reason: 'bad-entry', message: e.message };
      }
      rev.docType = stored.sourceType || '';
      rev.docId = stored.sourceId || '';
      try {
        // داخلَ القفل مباشرةً (لا عبر postJournal) كي لا يتداخل قفلٌ داخل قفل.
        return await appendEntry(rev);
      } catch (e) {
        return { ok: false, reason: 'store', message: e.message };
      }
    });
  }

  /** كلُّ القيود المخزَّنة (مفكوكةً) — المخزنُ المحلّيُّ مصدرُ الحقيقة. */
  async function readEntries() {
    const snap = await db.getDocs(db.collection(db.db, JOURNAL_COLLECTION));
    return snap.docs.map((s) => {
      const d = s.data() || {};
      return {
        key: d.key,
        date: d.date,
        memo: d.memo,
        amount: d.amount,
        lines: Array.isArray(d.lines) ? d.lines : [],
        reverses: d.reverses || null,
        sourceType: d.sourceType || '',
        sourceId: d.sourceId || '',
      };
    });
  }

  /**
   * دفترٌ متراكمٌ من القيود المخزَّنة لاستعلام الأرصدة (`balanceOf`/`subBalances`)
   * — بإعادة استعمال محرّك `createLedger` الخالص، فميزانُ المراجعة يبقى صفرًا.
   */
  async function buildLedger() {
    return createLedger().postMany(await readEntries());
  }

  return { postJournal, postEntries, postDocuments, docEntries, reverse, readEntries, buildLedger };
}
