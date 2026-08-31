/**
 * ═══════════════════════════════════════════════════════════════════
 *  طابور الإرسال ‹CAP-303 · CAP-304› — «هل وصل عملي؟»
 * ═══════════════════════════════════════════════════════════════════
 *
 * ═══ الفجوة التي يسدّها (قِيست من الشيفرة 2026-08-31) ═══
 * Firestore يقبل القيد **محليًّا على قرص الجهاز** ويرفعه وحده حين تعود
 * الشبكة — وهذا مفعَّلٌ عندنا (`persistentLocalCache` في `config/firebase.js`).
 * فالقيد لا يضيع بانقطاع الشبكة ولا بإغلاق المتصفّح.
 *
 * لكنّ ذلك خلّف **ثقبَين لا يراهما أحد**:
 *
 *   ★ **ثقب الصمت:** العادّ يمسح خمسين صنفًا والشبكة مقطوعة، فيرى جدولَه
 *     ممتلئًا ويظنّ عملَه في السحابة — وهو كلُّه في جيبه. لا رقمَ يقول له
 *     «خمسون لم تصل». فالإشارة موجودةٌ في `snapshot.metadata.hasPendingWrites`
 *     ومهملةٌ تمامًا: `listenScans` تمرّرها والشاشة ترميها.
 *
 *   ★★ **ثقب الابتلاع:** قاعدة `scans` تشترط أن تكون العمليّة الأمّ **مفتوحةً
 *     لحظةَ وصول القيد** (`firestore.rules`: `…data.status == 'open'`). فلو
 *     أقفل المديرُ الجلسةَ من مكتبه وفي هاتف العادّ أربعون قيدًا في الطابور،
 *     رُفضت الأربعون **كلُّها** عند عودة الشبكة — بلا رسالةٍ ولا أثر.
 *     الإقفال يبتلع عملًا حقيقيًّا وقع على الرفّ.
 *
 * ═══ والحكم هنا خالصٌ عمدًا ═══
 * «هل يجوز الإقفال؟» قرارٌ يُختبر عنصرًا عنصرًا، لا شرطٌ يُكتب في زرٍّ فيُنسى
 * عند إضافة زرٍّ ثانٍ. والشاشة تعرض ما يحكم به هذا الملفّ ولا تُعيد بناءه.
 *
 * بلا Firestore وبلا DOM.
 */

/**
 * هل هذا القيد ما زال في الطابور المحلّيّ (لم تُقرّه السحابة بعد)؟
 *
 * ★ والعلامة تُقرأ من موضعَين لأنّ للقيد عمرَين: `_pending` يختمه
 * `listenScans` من `metadata.hasPendingWrites` عند كلّ لقطة، و`metadata`
 * الخام يصل حين تُمرَّر مستنداتٌ لم تُهيَّأ. وأيُّهما حضر كفى.
 *
 * والقيد الذي لا يحمل العلامة يُقرأ **واصلًا** لا معلَّقًا: قيودُ الأمس
 * المقروءةُ من القرص لا تحمل شيئًا، ولو قُرئت معلَّقةً لَادّعى المؤشّر طابورًا
 * وهميًّا يمنع كلَّ إقفال.
 *
 * @param {{_pending?:boolean, metadata?:{hasPendingWrites?:boolean}}} scan
 * @returns {boolean}
 */
export function isPending(scan) {
  if (!scan || typeof scan !== 'object') return false;
  if (typeof scan._pending === 'boolean') return scan._pending;
  return Boolean(scan.metadata?.hasPendingWrites);
}

/**
 * حالة الطابور من قيود الجلسة — رقمٌ واحدٌ يفهمه الواقف في المخزن.
 *
 * @param {object[]} scans قيود الجلسة كما تصل من `listenScans`
 * @returns {{pending:number, sent:number, total:number, allSent:boolean}}
 */
export function queueState(scans) {
  const list = Array.isArray(scans) ? scans : [];
  let pending = 0;
  for (const s of list) if (isPending(s)) pending++;
  return {
    pending,
    sent: list.length - pending,
    total: list.length,
    allSent: pending === 0,
  };
}

/** اختصارٌ لمن يريد الرقم وحده. */
export function pendingCount(scans) {
  return queueState(scans).pending;
}

/**
 * نصُّ المؤشّر كما يُقرأ — والصفرُ **لا نصَّ له**: مؤشّرٌ يقول «٠ غير مُرسَل»
 * ضجيجٌ دائمٌ يُدرَّب العينُ على تجاهله، فحين يصير ٤٠ لا يراه أحد.
 *
 * @param {number} pending
 * @returns {string} نصٌّ عربيّ، أو `''` حين لا طابور.
 */
export function queueLabel(pending) {
  const n = Number(pending) || 0;
  if (n <= 0) return '';
  if (n === 1) return 'قراءةٌ واحدة لم تصل السحابة بعد — أبقِ الشاشة مفتوحةً حتى ترجع الشبكة.';
  if (n === 2) return 'قراءتان لم تصلا السحابة بعد — أبقِ الشاشة مفتوحةً حتى ترجع الشبكة.';
  return `${n} قراءة لم تصل السحابة بعد — أبقِ الشاشة مفتوحةً حتى ترجع الشبكة.`;
}

/**
 * ★★ حكمُ الإقفال ‹CAP-304›: **يُمنع ما دام في الطابور قيدٌ واحد.**
 *
 * وهذا المنعُ الوحيدُ المشروع في هذه الطبقة — وقاعدتُنا ق-٣ «لا يقطع الفريق
 * عند الجرد» لا تُخرق به: المنع على **الإقفال** لا على **العدّ**. العادّ يمسح
 * ما شاء بلا شبكة؛ وإنّما يُؤجَّل ختمُ الجلسة حتى يصل ما وقع فعلًا.
 *
 * ولا يمنع إقفالَ جلسةٍ فارغة: صفرُ قيودٍ صفرُ طابور.
 *
 * @param {{pending?:number, scans?:object[]}} input
 *   يُقبل الرقم مباشرةً أو القيود فيُحسب منها — فلا يضطرّ المستدعي لحسابٍ ثانٍ.
 * @returns {{ok:boolean, pending:number, reason:string}}
 *   `reason` نصٌّ يُعرض كما هو، و`''` حين يجوز.
 */
export function closeVerdict(input = {}) {
  const pending =
    Number.isFinite(Number(input?.pending)) && input?.pending != null
      ? Math.max(0, Number(input.pending))
      : pendingCount(input?.scans);
  if (pending > 0) {
    return {
      ok: false,
      pending,
      reason:
        `لا يُقفَل: ${pending} قراءة ما زالت في هذا الجهاز ولم تصل السحابة. ` +
        'والإقفالُ الآن يرفضها الخادم عند عودة الشبكة فتضيع — انتظر حتى يخلو الطابور.',
    };
  }
  return { ok: true, pending: 0, reason: '' };
}

/**
 * ★ آخرُ وصولٍ لكلّ عادّ — ما يُغني المديرَ عمّا لا يستطيع رؤيته.
 *
 * الطابور **محلّيٌّ على الجهاز**: لا ينتقل إلى الخادم، فلا يراه المديرُ في
 * مكتبه بحال. وهذا حدٌّ فنّيٌّ لا يُتجاوَز بشيفرة. وأقربُ ما يُعوّض عنه أن
 * يرى **متى وصلت آخرُ قراءةٍ من كلّ شخص**: توقّفُ محمدٍ عشرين دقيقةً إشارةٌ
 * إمّا أنّه انصرف، وإمّا أنّ هاتفه يمتلئ بعملٍ لم يُرسَل — فيسأله.
 *
 * ويُقاس على القيود **الواصلة** وحدها: القيد المعلَّق لا طابعَ زمنيًّا له
 * (`serverTimestamp` تبقى فارغةً حتى الإقرار)، فلو حُسب لَقيل «وصلت الآن»
 * عن قيدٍ لم يصل — وهو الكذب بعينه.
 *
 * @param {object[]} scans
 * @param {(scan:object)=>number|null} toMillis يحوّل طابع القيد إلى ميلي ثانية
 * @returns {{name:string, lastAt:number, count:number}[]} مرتّبًا: الأقدمُ صمتًا أوّلًا.
 */
export function lastSeenByUser(scans, toMillis) {
  const at = typeof toMillis === 'function' ? toMillis : () => null;
  const map = new Map();
  for (const s of Array.isArray(scans) ? scans : []) {
    if (isPending(s)) continue; // معلَّقٌ = لم يصل، فلا يُقاس به وصول
    const name = String(s?.byName || '').trim() || 'غير معروف';
    const ms = Number(at(s));
    const cur = map.get(name) || { name, lastAt: 0, count: 0 };
    cur.count++;
    if (Number.isFinite(ms) && ms > cur.lastAt) cur.lastAt = ms;
    map.set(name, cur);
  }
  return [...map.values()].sort((a, b) => a.lastAt - b.lastAt);
}
