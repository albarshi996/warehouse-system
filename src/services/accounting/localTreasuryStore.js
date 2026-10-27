/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  الخزينةُ المحلّيّة على المخزن — النظيرُ المحلّيُّ لأبواب `cash_session`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * م٢ · الشريحةُ الثانية: ثاني مستهلكٍ فعليٍّ لخلفيّة م١ (`local-sqlite`)، شقيقةُ
 * `localLedgerStore`. تخزّن الورديّاتِ وحركاتِها على المخزن المحلّيّ (SQLite عبر
 * Tauri)، فيملك الجهازُ خزينتَه بلا إنترنت — نظيرُ `db/schema/016/017` و`treasuryRpc`.
 *
 * ★★★ **عقودُ الخزينة (§7) مفروضةٌ في المنطق المُختبَر** (إذ لا RLS في SQLite،
 *     فالتخويلُ والعقودُ تنتقل إلى بابِ الكتابة الواحد — خطّة §2):
 *       • **المتوقَّع = البداية + واردٌ نقديّ − صادرٌ نقديّ**، والبطاقةُ والبنكُ
 *         خارجَ الدرج — بإعادة استعمال `summarize`/`closeSession` حرفيًّا.
 *       • **الفتحُ idempotent**: القفزُ لا الرفض على معرّفٍ قائمٍ (كـ`open_cash_session`).
 *       • **الحركاتُ ملحقةٌ-فقط**: ترقيمٌ متسلسلٌ (`seq = أقصى + 1`) ولا تعديلَ ولا
 *         حذف — التصحيحُ حركةٌ مضادّةٌ لا محوٌ للتاريخ (كـ`treasury_append_only`).
 *       • **التسكير بابٌ واحد**: يتحقّق ثمّ يُغلق؛ الفرقُ يحتاج سببًا ولا يتحوّل
 *         دَينًا تلقائيًّا، والوردية المُسكَّرةُ نهائيّةٌ لا تُعاد فتحًا، ولا إغلاقان.
 *
 * ★★ **كاتبٌ واحد (§3):** هذا هو البابُ الوحيد الذي يكتب الخزينةَ؛ لا الشاشةُ ولا
 *    بجانبِ كتابتها. والعمليّاتُ المغيّرةُ (`open`/`addMovement`/`close`) **تُسلسَل
 *    في الباب** (طابورُ وعود)، فلا تتداخل قراءةُ-ثمّ-كتابةِ عمليّتين: يبقى ترقيمُ
 *    الحركة متسلسلًا بلا تصادم (نظيرُ `FOR UPDATE` في `add_cash_movement`)، وفحصُ
 *    «الوردية مفتوحة؟» موثوقًا (نظيرُ `FOR UPDATE` في `close_cash_session`).
 *
 * ⚠️ **حدُّ المواءمة (صادقٌ لا مُدَّعًى):** هذا ضمانٌ على مستوى الباب الواحد —
 *    عمليّةٌ واحدةٌ على الجهاز — لا ضمانٌ بنيويٌّ في القاعدة كنظيره في PostgreSQL
 *    (`cash_movements` مفتاحٌ مركّبٌ + مُحفِّزُ الملحق-فقط + حارسُ الوردية، 016/017).
 *    فالمخزنُ العامُّ `kv_docs` بدائيّتُه UPSERT (دهسٌ لا رفض)، والحارسُ البنيويُّ
 *    على مستوى Rust/SQL تحصينٌ لاحقٌ (خطّة §2: العقودُ والتخويلُ تنتقل إلى طبقة
 *    الأوامر). والكاتبُ هنا واحدٌ في عمليّةٍ واحدة، فالتسلسلُ عند الباب هو الحدُّ
 *    الكافي لهذا المعمار — والبرهانُ عليه اختبارُ تنادٍ متزامنٍ يُثبت ألّا تصادمَ
 *    في الترقيم ولا إغلاقَين على وردية.
 *
 * ★ **خاملةٌ:** صفرُ مستهلكين — لا شاشةَ تستوردها بعد. ومحايدةُ الخلفيّة: تعمل فوق
 *   أيِّ بابٍ يحقّق عقدَ Firestore (في الاختبار `createLocalDb`، وفي سطح المكتب
 *   محوَّلُ `local-sqlite`) — فتُبرهَن بلا جهازٍ ولا Rust، ثمّ على SQLite حقيقيّة.
 *
 * منطقٌ خالصٌ (`cashSession.js`) فوق بابٍ محقون: بلا Firestore وبلا شبكةٍ هنا.
 */
import { openSession, validateMovement, summarize, closeSession, CASH_MOVEMENTS } from './cashSession.js';

/** مجموعتا المخزن المحلّيّ — المعرّفُ هو المفتاح؛ الحركةُ `<session>__<seq>`. */
export const CASH_SESSIONS_COLLECTION = 'cash_sessions';
export const CASH_MOVEMENTS_COLLECTION = 'cash_movements';

const str = (v) => String(v ?? '').trim();

/** وردية (من المحرّك) ⟵ وثيقةُ مخزنٍ تحمل الحقولَ وفراغاتِ التسكير. */
function toSessionDoc(session, input, db) {
  return {
    id: session.id,
    shift: session.shift || '',
    openingBalance: session.openingBalance,
    openedBy: session.openedBy || '',
    openedAt: session.openedAt || '',
    shop: input?.shop_id ?? input?.shop ?? null,
    state: 'open',
    // حقولُ التسكير تبقى فارغةً حتّى الإغلاق (كأعمدة 016 القابلة للـNULL).
    countedCash: null,
    variance: null,
    closeReason: '',
    closedBy: '',
    closedAt: '',
    postedAt: db.serverTimestamp(),
  };
}

/** حقولُ التسكير التي تُدمَج على الوردية عند الإغلاق — لا تمسّ الهويّةَ ولا البداية. */
function toClosePatch(close, db) {
  return {
    state: 'closed',
    countedCash: close.countedCash,
    variance: close.variance,
    closeReason: close.reason || '',
    closedBy: close.closedBy || '',
    closedAt: close.closedAt || '',
    closedPostedAt: db.serverTimestamp(),
  };
}

/** حركةٌ مُتحقَّقةٌ ⟵ وثيقةُ مخزنٍ ملحقةٌ-فقط. */
function toMovementDoc({ sessionId, seq, kind, method, amount, memo, at, byUid }, db) {
  return {
    sessionId,
    seq,
    kind,
    method,
    amount,
    memo: str(memo),
    at: str(at),
    byUid: str(byUid),
    postedAt: db.serverTimestamp(),
  };
}

/**
 * بابُ خزينةٍ محلّيٌّ فوق بابِ بياناتٍ بعقد Firestore.
 * @param {object} db باب البيانات (مصنعُ `createLocalDb` أو محوَّلُ `local-sqlite`).
 */
export function createLocalTreasury(db) {
  if (!db || typeof db.runTransaction !== 'function' || typeof db.doc !== 'function') {
    throw new Error('createLocalTreasury يحتاج بابَ بياناتٍ يحقّق عقدَ Firestore');
  }

  const sessionRef = (id) => db.doc(db.db, CASH_SESSIONS_COLLECTION, String(id));
  const movementRef = (sessionId, seq) => db.doc(db.db, CASH_MOVEMENTS_COLLECTION, `${sessionId}__${seq}`);

  // طابورُ تسلسلٍ للعمليّات المغيّرة (نظيرُ localLedgerStore): يضمن ألّا تتداخل
  // قراءةُ-ثمّ-كتابةِ عمليّتين، فيبقى ترقيمُ الحركة متسلسلًا وفحصُ حالة الوردية
  // موثوقًا ولو نُودي البابُ متزامنًا. العملُ لا يرمي، فكلا فرعَي then يمرّرانه.
  let writeTail = Promise.resolve();
  function serialize(work) {
    const run = writeTail.then(work, work);
    writeTail = run.then(() => undefined, () => undefined);
    return run;
  }

  /** قراءةُ ورديةٍ خامٍّ (أو null) — قراءةٌ محميّةٌ تُستعمل داخل العمليّات. */
  async function sessionData(id) {
    const snap = await db.getDoc(sessionRef(id));
    return snap.exists() ? snap.data() : null;
  }

  /** حركاتُ وردية مرتّبةً تصاعديًّا بالتسلسل — نُرشّح بالمعرّف في JS كي يصحّ
   *  مع مخزنٍ لا يطبّق `where` (المزيّفُ في الاختبار) كما مع الحقيقيّ. */
  async function movementsData(id) {
    const snap = await db.getDocs(
      db.query(db.collection(db.db, CASH_MOVEMENTS_COLLECTION), db.where('sessionId', '==', String(id))),
    );
    return snap.docs
      .map((s) => s.data() || {})
      .filter((m) => String(m.sessionId) === String(id))
      .sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));
  }

  /**
   * يفتح ورديةً: يتحقّق (معرّفٌ · رصيدٌ صحيحٌ غيرُ سالب) خالصًا، ثمّ يُلحق
   * **مُسلسَلًا** idempotent — القفزُ لا الرفض على معرّفٍ قائم (لا كتابةَ فوقَه).
   * @returns {Promise<{ok:true,id:string,created:boolean}|{ok:false,reason:string,message?:string}>}
   */
  async function open(input) {
    let session;
    try {
      session = openSession(input); // تحقّقٌ خالصٌ لا يمسّ المخزن — قبل القفل
    } catch (e) {
      return { ok: false, reason: 'bad-session', message: e.message };
    }
    return serialize(async () => {
      try {
        const outcome = await db.runTransaction(db.db, async (tx) => {
          const snap = await tx.get(sessionRef(session.id));
          if (snap.exists()) return 'exists'; // idempotent: القفزُ لا الرفض
          tx.set(sessionRef(session.id), toSessionDoc(session, input, db));
          return 'created';
        });
        return { ok: true, id: session.id, created: outcome === 'created' };
      } catch (e) {
        return { ok: false, reason: 'store', message: e.message };
      }
    });
  }

  /**
   * يُلحق حركةً لوردية مفتوحة: يتحقّق (نوعٌ · وسيلةٌ · مبلغٌ موجب) خالصًا، ثمّ
   * **مُسلسَلًا** يقرأ الورديةَ (موجودةٌ ومفتوحة؟) ويرقّم `seq = أقصى + 1` فيكون
   * الترقيمُ بلا تصادمٍ (نظيرُ `FOR UPDATE`)، ويكتب ملحقًا-فقط (القفزُ لو قام).
   * @returns {Promise<{ok:true,seq:number,posted:boolean}|{ok:false,reason:string,message?:string}>}
   */
  async function addMovement(input) {
    const { sessionId, kind, method, amount, memo = '', at = '', byUid = '' } = input || {};
    try {
      validateMovement({ kind, method, amount }); // تحقّقٌ خالصٌ — قبل القفل
    } catch (e) {
      return { ok: false, reason: 'bad-movement', message: e.message };
    }
    const sid = str(sessionId);
    if (!sid) return { ok: false, reason: 'bad-movement', message: 'حركةٌ بلا وردية' };

    return serialize(async () => {
      let session;
      let existing;
      try {
        session = await sessionData(sid);
        if (!session) return { ok: false, reason: 'not-found' };
        if (session.state !== 'open') return { ok: false, reason: 'not-open' };
        existing = await movementsData(sid);
      } catch (e) {
        return { ok: false, reason: 'store', message: e.message };
      }
      const seq = existing.reduce((mx, m) => Math.max(mx, Number(m.seq) || 0), -1) + 1;
      try {
        const outcome = await db.runTransaction(db.db, async (tx) => {
          const ref = movementRef(sid, seq);
          const snap = await tx.get(ref);
          if (snap.exists()) return 'skip'; // أمانُ الملحق-فقط: لا كتابةَ فوقَ حركة
          tx.set(ref, toMovementDoc({ sessionId: sid, seq, kind, method, amount, memo, at, byUid }, db));
          return 'posted';
        });
        return { ok: true, seq, posted: outcome === 'posted', skipped: outcome === 'skip' };
      } catch (e) {
        return { ok: false, reason: 'store', message: e.message };
      }
    });
  }

  /**
   * يُسكّر ورديةً مفتوحةً: يقرأ الورديةَ وحركاتِها، يحسب المتوقَّع والفرقَ عبر
   * المحرّك الخالص (`closeSession`) — الفرقُ بلا سببٍ يُرفض، ولا يتحوّل دَينًا —
   * ثمّ يدمج حقولَ التسكير **مُسلسَلًا** مع إعادةِ فحصِ «مفتوحة؟» عند الإتمام
   * (نظيرُ `FOR UPDATE`)، فلا إغلاقان، والوردية المُسكَّرةُ نهائيّة.
   * @returns {Promise<{ok:true,variance:number,expectedCash:number,countedCash:number}|{ok:false,reason:string,message?:string}>}
   */
  async function close(id, { countedCash, reason = '', closedBy = '', closedAt = '' } = {}) {
    const sid = str(id);
    if (!sid) return { ok: false, reason: 'bad-close', message: 'تسكيرٌ بلا وردية' };

    return serialize(async () => {
      let session;
      let movements;
      try {
        session = await sessionData(sid);
        if (!session) return { ok: false, reason: 'not-found' };
        movements = await movementsData(sid);
      } catch (e) {
        return { ok: false, reason: 'store', message: e.message };
      }

      let result;
      try {
        // المحرّكُ يرمي على: غيرِ مفتوحة · معدودٍ غيرِ صحيح · فرقٍ بلا سبب.
        result = closeSession(session, movements, { countedCash, reason, closedBy, closedAt });
      } catch (e) {
        return { ok: false, reason: 'bad-close', message: e.message };
      }

      try {
        const outcome = await db.runTransaction(db.db, async (tx) => {
          const snap = await tx.get(sessionRef(sid));
          if (!snap.exists()) return 'gone';
          if (snap.data().state !== 'open') return 'not-open'; // لا إغلاقَ ثانٍ (بنيويٌّ عند الإتمام)
          tx.set(sessionRef(sid), toClosePatch(result, db), { merge: true });
          return 'closed';
        });
        if (outcome === 'gone') return { ok: false, reason: 'not-found' };
        if (outcome === 'not-open') return { ok: false, reason: 'not-open' };
        return {
          ok: true,
          variance: result.variance,
          expectedCash: result.expectedCash,
          countedCash: result.countedCash,
        };
      } catch (e) {
        return { ok: false, reason: 'store', message: e.message };
      }
    });
  }

  /** قراءةُ وردية (مفكوكةً) أو null — المخزنُ المحلّيُّ مصدرُ الحقيقة. */
  async function getSession(id) {
    return sessionData(str(id));
  }

  /** حركاتُ وردية مرتّبةً تصاعديًّا بالتسلسل. */
  async function listMovements(id) {
    return movementsData(str(id));
  }

  /**
   * ملخّصٌ خالصٌ للوردية (الوارد/الصادر النقديّان والمتوقَّع ومجاميعُ الوسائل) —
   * بإعادة استعمال `summarize`. @returns null إن لم توجد الوردية.
   */
  async function summary(id) {
    const session = await sessionData(str(id));
    if (!session) return null;
    const movements = await movementsData(str(id));
    return summarize(session, movements);
  }

  /** كلُّ الورديّات (مفكوكةً)، أو ذاتُ الحالة المطلوبة — نُرشّح في JS كأختها. */
  async function listSessions({ state = null } = {}) {
    const snap = await db.getDocs(db.collection(db.db, CASH_SESSIONS_COLLECTION));
    const all = snap.docs.map((s) => s.data() || {});
    return state ? all.filter((s) => s.state === state) : all;
  }

  return { open, addMovement, close, getSession, listMovements, summary, listSessions, CASH_MOVEMENTS };
}
