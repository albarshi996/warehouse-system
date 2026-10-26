/**
 * الرابطُ بين JS وأبوابِ كتابة الخزينة (`open_cash_session` · `add_cash_movement`
 * · `close_cash_session`) — نظيرُ `ledgerRpc` للقيد.
 *
 * ★★★ **ليس مسارَ كتابةٍ حيًّا ولا مزدوجة.** عقدٌ مُختبَرٌ يُستعمل حين يُفعَّل
 *     الكاتبُ الواحدُ إلى القاعدة (§3). وكلُّ اعتمادٍ **يُحقن**، ولا يرمي:
 *     كلُّ فشلٍ `{ ok: false, reason }` (فلسفة `pgClient`).
 */
import { CASH_MOVEMENTS, PAYMENT_METHODS } from './cashSession.js';

const str = (v) => String(v ?? '');

/** نداءُ دالّةٍ عبر PostgREST (`POST /rpc/<fn>`). لا يرمي أبدًا. */
async function rpc(fn, body, { fetch: doFetch = globalThis.fetch, apiUrl, token, timeoutMs = 6000 } = {}) {
  const base = str(apiUrl).replace(/\/+$/, '');
  if (!base || !token || typeof doFetch !== 'function') return { ok: false, reason: 'not-configured' };

  let ctrl = null;
  let timer = null;
  if (typeof AbortController === 'function') {
    ctrl = new AbortController();
    timer = setTimeout(() => ctrl.abort(), timeoutMs);
  }

  let res;
  try {
    res = await doFetch(`${base}/rpc/${fn}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
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

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: true, data };
}

/* ═══════════ بانياتُ الأجسام (خالصة، بأسماء معاملات الدوالّ) ═══════════ */

export function openSessionBody({ id, shift = '', opening = 0, openedBy = '', shop = null } = {}) {
  if (!str(id).trim()) throw new Error('وردية بلا معرّف.');
  if (!Number.isInteger(opening) || opening < 0) throw new Error('رصيدُ البداية وحدةٌ صغرى صحيحةٌ غيرُ سالبة.');
  return {
    p_id: str(id).trim(),
    p_shift: str(shift),
    p_opening: opening,
    p_opened_by: str(openedBy),
    p_shop: shop ? str(shop) : null,
  };
}

export function movementBody({ sessionId, kind, method, amount, memo = '' } = {}) {
  if (!str(sessionId).trim()) throw new Error('حركةٌ بلا وردية.');
  if (!CASH_MOVEMENTS[kind]) throw new Error(`نوعُ حركةٍ مجهول: «${kind}».`);
  if (!PAYMENT_METHODS.includes(method)) throw new Error(`وسيلةٌ مجهولة: «${method}».`);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('مبلغُ الحركة وحدةٌ صغرى صحيحةٌ موجبة.');
  return { p_session: str(sessionId).trim(), p_kind: kind, p_method: method, p_amount: amount, p_memo: str(memo) };
}

export function closeBody({ sessionId, counted, reason = '', closedBy = '' } = {}) {
  if (!str(sessionId).trim()) throw new Error('تسكيرٌ بلا وردية.');
  if (!Number.isInteger(counted) || counted < 0) throw new Error('النقدُ المعدود وحدةٌ صغرى صحيحةٌ غيرُ سالبة.');
  return { p_id: str(sessionId).trim(), p_counted: counted, p_reason: str(reason), p_closed_by: str(closedBy) };
}

/* ═══════════ النداءات ═══════════ */

/** يفتح ورديةً عبر الباب. @returns {{ok:true, id:string}|{ok:false, reason:string}} */
export async function openCashSession(session, deps) {
  let body;
  try {
    body = openSessionBody(session);
  } catch (e) {
    return { ok: false, reason: 'bad-input', message: e.message };
  }
  const r = await rpc('open_cash_session', body, deps);
  if (!r.ok) return r;
  return { ok: true, id: typeof r.data === 'string' && r.data ? r.data : body.p_id };
}

/** يضيف حركةً عبر الباب. @returns {{ok:true, seq:number}|{ok:false, reason:string}} */
export async function addCashMovement(movement, deps) {
  let body;
  try {
    body = movementBody(movement);
  } catch (e) {
    return { ok: false, reason: 'bad-input', message: e.message };
  }
  const r = await rpc('add_cash_movement', body, deps);
  if (!r.ok) return r;
  return { ok: true, seq: Number(r.data) };
}

/** يُسكّر ورديةً عبر الباب. @returns {{ok:true, variance:number}|{ok:false, reason:string}} */
export async function closeCashSession(closing, deps) {
  let body;
  try {
    body = closeBody(closing);
  } catch (e) {
    return { ok: false, reason: 'bad-input', message: e.message };
  }
  const r = await rpc('close_cash_session', body, deps);
  if (!r.ok) return r;
  return { ok: true, variance: Number(r.data) };
}
