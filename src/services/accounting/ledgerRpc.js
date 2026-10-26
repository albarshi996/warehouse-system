/**
 * الرابطُ بين محرّك JS وبابِ الكتابة في القاعدة (`post_journal`).
 *
 * ★★★ **ليس مسارَ كتابةٍ حيًّا، ولا كتابةً مزدوجة.** البوّابةُ اليومَ تكتب في
 *     Firebase وحده (قرار المرآة: «الكتابةُ لا تُحوَّل»). هذا الملفُّ **عقدٌ
 *     مُختبَر** يحوّل قيدَ المحرّك الخالص إلى نداء `post_journal`، ويُستعمل حين
 *     يقرّر المالكُ تبديلَ كاتبٍ واحدٍ إلى القاعدة (§3) — لا قبلَه ولا بجانبِه.
 *
 * ★ وكلُّ اعتمادٍ خارجيّ **يُحقن** (`fetch` · `apiUrl` · `token`) كي يُختبَر في
 *   Node بلا شبكة. ولا يرمي إلى الشاشة: كلُّ فشلٍ `{ ok: false, reason }`
 *   (نفسُ فلسفة `pgClient`).
 */

/** يبني جسمَ نداء `post_journal` من قيدٍ مشتقّ — خالصٌ، ويطابق أسماءَ معاملات الدالّة. */
export function buildPostJournalBody(entry) {
  if (!entry || !entry.key) throw new Error('قيدٌ بلا مفتاحٍ فريد — لا يُرحَّل.');
  const lines = Array.isArray(entry.lines) ? entry.lines : [];
  if (lines.length < 2) throw new Error('القيدُ المزدوج سطران فأكثر.');
  return {
    p_key: String(entry.key),
    p_date: String(entry.date || '').slice(0, 10),
    p_amount: entry.amount, // وحدةٌ صغرى صحيحة (من المحرّك)
    p_lines: lines.map((l) => ({
      account: String(l.account || ''),
      party: String(l.party || ''),
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
    })),
    p_memo: String(entry.memo || ''),
    p_source_type: String(entry.docType || entry.source_type || ''),
    p_source_id: String(entry.docId || entry.source_id || ''),
    p_reverses: entry.reverses || null,
    p_shop: entry.shop_id || entry.shop || null,
  };
}

/**
 * يرحّل قيدًا عبر PostgREST (`POST /rpc/post_journal`). لا يرمي أبدًا.
 * @returns {Promise<{ok:true, key:string} | {ok:false, reason:string, message?:string}>}
 */
export async function postJournal(entry, { fetch: doFetch = globalThis.fetch, apiUrl, token, timeoutMs = 6000 } = {}) {
  let body;
  try {
    body = buildPostJournalBody(entry);
  } catch (e) {
    return { ok: false, reason: 'bad-entry', message: e.message };
  }

  const base = String(apiUrl || '').replace(/\/+$/, '');
  if (!base || !token || typeof doFetch !== 'function') {
    return { ok: false, reason: 'not-configured' };
  }

  let ctrl = null;
  let timer = null;
  if (typeof AbortController === 'function') {
    ctrl = new AbortController();
    timer = setTimeout(() => ctrl.abort(), timeoutMs);
  }

  let res;
  try {
    res = await doFetch(`${base}/rpc/post_journal`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined,
    });
  } catch {
    return { ok: false, reason: 'unreachable' };
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!res) return { ok: false, reason: 'unreachable' };
  if (!res.ok) return { ok: false, reason: `http-${res.status}` };

  let out = null;
  try {
    out = await res.json();
  } catch {
    out = null;
  }
  // الدالّةُ تعيد المفتاح (نصًّا)؛ وإن تعذّرت قراءةُ الجسم فالمفتاحُ الذي أرسلناه.
  const key = typeof out === 'string' && out ? out : body.p_key;
  return { ok: true, key };
}
