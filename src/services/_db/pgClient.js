/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  عميلُ القاعدة — ويترجم كلَّ عطبٍ إلى «ارجع إلى Firebase»، لا إلى خطأ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★★ **القاعدةُ الحاكمة: لا شيءَ هنا يرمي إلى الشاشة.**
 *
 *     حاسوبُ المالك هو الخادم. وهو يُطفأ وينام وينقطع إنترنتُه، وهذا
 *     **متوقَّعٌ لا استثنائيّ**. فلو سُمح لعطبٍ هنا أن يبلغ الشاشةَ لصارت
 *     البوّابةُ أهشَّ ممّا كانت قبل أن نبدأ — وهو نقيضُ الغرض.
 *     ⇒ فكلُّ فشلٍ يُعيد `{ ok: false }`، والمحوَّلُ يسأل Firebase عندها.
 *       **ولا تتحسّن البوّابةُ أو تسوء؛ تبقى كما هي في أسوأ الأحوال.**
 *
 * ★★ **والصحّةُ تُطفأ لمدّةٍ ولا تُسأل في كلّ طلب:** خادمٌ نائمٌ يعني مهلةَ
 *    انتظارٍ كاملةً لكلّ قراءة. فعشرون قراءةً في شاشةٍ واحدةٍ تعني عشرين
 *    مهلة — والشاشةُ تتجمّد وهي «تعمل». فأوّلُ فشلٍ يُسكت القاعدةَ ثلاثين
 *    ثانيةً، وتمرّ الشاشةُ كلُّها إلى Firebase بلا انتظارٍ واحد.
 *
 * ★ وكلُّ اعتمادٍ خارجيٍّ **يُحقن** (`fetch` · `now` · `getIdToken`) كي
 *   يُختبَر الملفُّ في Node بلا شبكةٍ ولا حسابٍ ولا سحابة.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** الإعداداتُ الافتراضيّة — تُقرأ من بيئة البناء وتُستبدل في الاختبار. */
export const DEFAULTS = Object.freeze({
  timeoutMs: 6000,
  /** مدّةُ إسكاتِ القاعدة بعد فشل. */
  cooldownMs: 30000,
  /** أقصى تأخّرٍ مقبولٍ في المرآة قبل أن تُعدّ بائتة. */
  staleSeconds: 900,
  /** عمرُ إجابةِ الطزاجة قبل إعادة السؤال. */
  freshnessTtlMs: 30000,
  /** هامشُ أمانٍ قبل انتهاء الرمز. */
  tokenSkewMs: 60000,
});

/**
 * ينشئ عميلًا. وكلُّ حالته داخليّةٌ — فلا مثيلَ يسرّب إلى آخر في الاختبار.
 *
 * @param {object} deps
 * @param {string} deps.apiUrl عنوانُ PostgREST.
 * @param {string} deps.authUrl عنوانُ جسر الرمز.
 * @param {() => Promise<string|null>} deps.getIdToken رمزُ Firebase الحاليّ.
 * @param {typeof fetch} [deps.fetch]
 * @param {() => number} [deps.now]
 * @param {Partial<typeof DEFAULTS>} [deps.options]
 */
export function createClient(deps) {
  const cfg = { ...DEFAULTS, ...(deps.options || {}) };
  const doFetch = deps.fetch || globalThis.fetch;
  const now = deps.now || (() => Date.now());
  const apiUrl = String(deps.apiUrl || '').replace(/\/+$/, '');
  const authUrl = String(deps.authUrl || '').replace(/\/+$/, '');

  /** الرمزُ المبدَّل وآخرُ لحظةٍ يصلح فيها. */
  let token = null;
  let tokenExpiresAt = 0;
  /** آخرُ هويّةٍ بُدّل لها الرمز — تبدُّلُ المستخدم يُبطل الرمزَ فورًا. */
  let tokenFor = null;

  /** إلى متى نسكت عن سؤال القاعدة. */
  let mutedUntil = 0;

  /** إجابةُ الطزاجة الأخيرة. */
  let freshCache = { at: 0, set: null };

  const configured = Boolean(apiUrl && authUrl && typeof doFetch === 'function');

  /** هل القاعدةُ مسؤولةٌ الآن؟ */
  function healthy() {
    return configured && now() >= mutedUntil;
  }

  /** يُسكت القاعدةَ بعد فشل — ويُبطل الطزاجةَ معها. */
  function mute() {
    mutedUntil = now() + cfg.cooldownMs;
    freshCache = { at: 0, set: null };
  }

  /** طلبٌ بمهلة. و**كلُّ** استثناءٍ يُبتلع ويصير `null`. */
  async function request(url, init) {
    if (typeof AbortController !== 'function') return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
    try {
      return await doFetch(url, { ...init, signal: ctrl.signal });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * يبدّل رمزَ Firebase برمزِ القاعدة. و`null` تعني «لا سبيلَ الآن».
   *
   * ★ والرمزُ يُخزَّن بهويّة صاحبه: لو بدّل المستخدمُ حسابَه وبقي الرمزُ
   *   القديم، لقرأ بدور غيره حتّى ينتهي — وهو تسريبُ صلاحيّةٍ كامل.
   */
  async function ensureToken() {
    const idToken = await deps.getIdToken().catch(() => null);
    if (!idToken) return null;

    if (token && tokenFor === idToken && now() < tokenExpiresAt - cfg.tokenSkewMs) return token;

    const res = await request(`${authUrl}/token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!res || !res.ok) {
      mute();
      return null;
    }

    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!body || typeof body.token !== 'string') {
      mute();
      return null;
    }

    token = body.token;
    tokenFor = idToken;
    // `exp` بالثواني في JWT؛ وغيابُه يعني دقيقةً واحدةً احتياطًا لا أبدًا.
    tokenExpiresAt = Number.isFinite(body.exp) ? body.exp * 1000 : now() + 60000;
    return token;
  }

  /**
   * استعلامٌ على جدول. يُعيد `{ ok, rows }` — ولا يرمي أبدًا.
   * @param {string} table
   * @param {string} search سلسلةُ معاملاتٍ جاهزةٌ من `pgQuery.translate`.
   */
  async function select(table, search) {
    if (!healthy()) return { ok: false, reason: 'muted' };
    const t = await ensureToken();
    if (!t) return { ok: false, reason: 'no-token' };

    const res = await request(`${apiUrl}/${table}?${search}`, {
      headers: { Authorization: `Bearer ${t}`, Accept: 'application/json' },
    });
    if (!res) {
      mute();
      return { ok: false, reason: 'unreachable' };
    }
    if (!res.ok) {
      // ★★ ٤٠١ و٤٠٣ حكمُ صلاحيّةٍ لا عطبُ خادم: الرمزُ يُبطَل ليُجدَّد، ولا
      //    تُسكت القاعدةُ — فإسكاتُها نصفَ دقيقةٍ على رمزٍ منتهٍ يُضيّع
      //    قراءاتٍ صحيحةً بلا سبب.
      if (res.status === 401 || res.status === 403) {
        token = null;
        tokenFor = null;
      } else {
        mute();
      }
      return { ok: false, reason: `http-${res.status}` };
    }

    let rows = null;
    try {
      rows = await res.json();
    } catch {
      rows = null;
    }
    if (!Array.isArray(rows)) return { ok: false, reason: 'bad-body' };
    return { ok: true, rows };
  }

  /**
   * المساراتُ الطازجةُ الآن — و`null` تعني «تعذّر القياس».
   *
   * ★★★ و`null` **ليست «كلُّها بائتة»**: التمييزُ مقصود. فالمحوَّلُ يعامل
   *     «لم أقس» معاملةَ المقبول (وإلّا تعطّل الهجينُ كلَّه عند أوّل تعثّرٍ
   *     في سؤالٍ جانبيّ)، ويعامل «قِيس فبَاتَ» معاملةَ المرفوض.
   */
  async function freshPaths() {
    if (!healthy()) return null;
    if (freshCache.set && now() - freshCache.at < cfg.freshnessTtlMs) return freshCache.set;

    const res = await select('rpc/mirror_freshness', 'select=path,age_seconds');
    if (!res.ok) return null;

    const set = new Set();
    for (const row of res.rows) {
      const raw = row ? row.age_seconds : null;
      // ★★★ العدمُ ليس صفرًا: `Number(null)` صفرٌ، فمسارٌ **لم يُزامَن قطُّ**
      //     (`last_run_at IS NULL`) كان يُقرأ «طازجًا هذه اللحظة» — وهو أسوأُ
      //     ما يمكن أن يقع في هذا الملفّ. فيُردّ صراحةً قبل أيّ تحويل.
      if (raw === null || raw === undefined || raw === '') continue;
      const age = Number(raw);
      if (Number.isFinite(age) && age >= 0 && age <= cfg.staleSeconds) set.add(String(row.path));
    }
    freshCache = { at: now(), set };
    return set;
  }

  /** حالةٌ تُقرأ في التشخيص — لا تُستعمل في قرار. */
  function status() {
    return {
      configured,
      healthy: healthy(),
      mutedForMs: Math.max(0, mutedUntil - now()),
      hasToken: Boolean(token),
      fresh: freshCache.set ? [...freshCache.set] : null,
    };
  }

  return { select, freshPaths, healthy, status, mute, apiUrl, authUrl, configured };
}
