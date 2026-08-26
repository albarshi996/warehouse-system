/**
 * الاستلام الميدانيّ — من أمر شراءٍ مفتوح إلى طبليةٍ ترفع للحوكمة.
 *
 * ═══ ولماذا شاشةٌ جديدة لا وضعٌ في شاشة المسح؟ ═══
 * قِيس الأمر لا خُمِّن: وضع «استلام» **موجودٌ أصلًا** في `SCAN_MODES`، لكنّه
 * **التقاطٌ عامّ** — يسجّل ما دخل بلا أمرٍ ولا رصيدٍ مفتوح ولا طبلية، وهو
 * صحيحٌ لما وُضع له («الالتقاط لا يُحاسِب» · CAP-101).
 *
 * وهذا الاستلام **مقودٌ بمستند**: يبدأ من أمرٍ معتمد، ويردّ الصنف الغريب،
 * ويعدّ المفتوح تنازليًّا، ويثمر حمولةً تُعتمد. فدسُّه في مكوّنٍ من ١٢١٨
 * سطرًا يعمل جراحةٌ في شاشةٍ تعمل — وتفويض المالك يمنعها. وليست «صفحةً فوق
 * صفحة» لأنّ الوظيفة غير موجودةٍ أصلًا: لا شاشةَ اليوم تستلم من أمر شراء.
 *
 * ═══ القاعدة الحاكمة ═══
 * **الشاشة عرضٌ للحكم لا حَكَم.** كلّ قراءةٍ تمرّ بـ`scanIntoDraft` التي
 * تستدعي `scanVerdict` الخالصة على البيانات الحيّة — فلا شرطَ يُكتب هنا،
 * والصوتُ والاهتزاز يتبعان نتيجة الحكم الفعليّة لا ظنّ الواجهة.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { subscribeItems } from '../../../services/items/itemService.js';
import { buildItemIndexes } from '../../../services/items/uomWiring.js';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listenDocumentsByTypes } from '../../../services/documents/documentsService.js';
import { documentLineProgress } from '../../../services/documents/documentLineProgress.js';
import { openOrderCard, remainingOf, sessionTotals } from '../../../services/lpn/receivingSession.js';
import {
  addDraft,
  closeDraftToGovernance,
  createGrnFromSession,
  finishSession,
  listenSession,
  scanIntoDraft,
  startSession,
} from '../../../services/lpn/receivingService.js';
import { grnPreview } from '../../../services/lpn/grnBridge.js';

export default function ReceivingFlow() {
  const [me, setMe] = useState(null);
  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [session, setSession] = useState(null);
  const [activeDraft, setActiveDraft] = useState('P1');
  const [code, setCode] = useState('');
  const [qty, setQty] = useState('');
  const [batch, setBatch] = useState('');
  const [expiry, setExpiry] = useState('');
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const seqRef = useRef(0);
  const inputRef = useRef(null);

  const indexes = useMemo(() => buildItemIndexes(items), [items]);
  const actorName = me?.name || me?.displayName || me?.email || '';

  useEffect(() => subscribeAuth(async (u) => setMe(u ? await fetchUserProfile(u) : null)), []);
  useEffect(() => subscribeItems(setItems), []);

  // أوامر الشراء المفتوحة — بطاقتها من `openOrderCard` فما تعرضه القائمة
  // هو ما تقيس عليه الجلسة حرفيًّا.
  const [rawOrders, setRawOrders] = useState([]);
  useEffect(() => listenDocumentsByTypes(['PO'], (docs) => {
    setRawOrders(docs);
    // البطاقة من `openOrderCard` — فما تعرضه القائمة هو ما تقيس عليه
    // الجلسة، والمحجوب يُسقَط بسببه المحسوب لا بظنّ الواجهة.
    setOrders(docs.map((d) => openOrderCard(d, [], [])).filter((c) => c.canReceive));
    setLoading(false);
  }, 50), []);

  useEffect(() => {
    if (!sessionId) return undefined;
    return listenSession(sessionId, setSession);
  }, [sessionId]);

  const totals = useMemo(() => (session ? sessionTotals(session) : null), [session]);
  // معاينةُ المستند قبل توليده — مستندٌ ماليٌّ يُنشأ بلا أن يُرى محتواه
  // توقيعٌ على المجهول (grnBridge).
  const grn = useMemo(() => (session ? grnPreview(session) : null), [session]);
  const draft = useMemo(
    () => (session?.drafts ?? []).find((d) => d.ref === activeDraft) ?? null,
    [session, activeDraft]
  );

  const say = useCallback((kind, text) => {
    setFlash({ kind, text });
    // الصوت والاهتزاز من **نتيجة الحكم** لا من ظنّ الواجهة (خطة ٧ ثانيًا).
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(kind === 'ok' ? 40 : [80, 60, 80]);
    }
  }, []);

  async function begin(orderCard) {
    if (!actorName) { say('err', 'لم تُقرأ هويّتك بعد — أعد تحميل الصفحة.'); return; }
    setBusy(true);
    try {
      const full = rawOrders.find((d) => d.id === orderCard.id);
      if (!full) throw new Error('تعذّر العثور على الأمر — أعد تحميل الصفحة.');
      const progress = documentLineProgress(full, [], []);
      const { id } = await startSession(full, progress, { actor: actorName, warehouse: orderCard.warehouse, device: 'WEB' });
      setSessionId(id);
      setActiveDraft('P1');
      say('ok', `فُتحت جلسة على ${orderCard.number} — امسح أوّل صنف.`);
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (e) {
      say('err', e?.message || 'تعذّر فتح الجلسة.');
    } finally {
      setBusy(false);
    }
  }

  async function submitScan(e) {
    e?.preventDefault?.();
    const raw = code.trim();
    if (!raw || busy) return;
    setBusy(true);
    try {
      seqRef.current += 1;
      const r = await scanIntoDraft(
        sessionId,
        activeDraft,
        { barcode: raw, qty: qty === '' ? undefined : Number(qty), batch, expiry },
        { indexes, actor: actorName, device: 'WEB', seq: seqRef.current }
      );
      if (r.ok) {
        say('ok', `قُبلت: ${raw}`);
        setCode(''); setQty(''); // الدفعة والصلاحية تبقيان — الكرتونة تلو الكرتونة من دفعةٍ واحدة
      } else {
        say(r.needsSupervisor ? 'warn' : 'err', r.message);
      }
    } catch (err) {
      say('err', err?.message || 'تعذّرت القراءة.');
    } finally {
      setBusy(false);
      // حقل القراءة يبقى نشطًا بلا لمسٍ بعد كلّ مسحة (متطلّب خطة ٧).
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }

  async function closeDraft() {
    setBusy(true);
    try {
      await closeDraftToGovernance(sessionId, activeDraft, { actor: actorName });
      say('ok', `رُفعت الطبلية ${activeDraft} للحوكمة — لا قراءة عليها بعد الآن.`);
    } catch (e) {
      say('err', e?.message || 'تعذّر الإغلاق.');
    } finally { setBusy(false); }
  }

  async function newDraft() {
    setBusy(true);
    try {
      const ref = await addDraft(sessionId);
      setActiveDraft(ref);
      say('ok', `فُتحت طبلية ${ref}.`);
    } catch (e) {
      say('err', e?.message || 'تعذّر فتح طبلية.');
    } finally { setBusy(false); }
  }

  async function makeGrn() {
    setBusy(true);
    try {
      const r = await createGrnFromSession(sessionId, { profile: me });
      say('ok', `تولّد الاستلام ${r.number || r.docId} مسوّدةً — اعتمده من صندوق المستندات ليتحرّك الرصيد.`);
    } catch (e) {
      say('err', e?.message || 'تعذّر توليد الاستلام.');
    } finally { setBusy(false); }
  }

  async function endSession() {
    setBusy(true);
    try {
      await finishSession(sessionId, { actor: actorName });
      say('ok', 'أُغلقت الجلسة — والمتبقّي المفتوح يبقى على الأمر لجلسةٍ لاحقة.');
      setSessionId(''); setSession(null);
    } catch (e) {
      say('err', e?.message || 'تعذّر الإغلاق.');
    } finally { setBusy(false); }
  }

  if (loading) return <div className="o_theme"><p className="text-ink-2 text-sm">جارٍ قراءة أوامر الشراء…</p></div>;

  // ── اختيار الأمر ──
  if (!sessionId) {
    return (
      <div className="o_theme" dir="rtl">
        {flash && <Flash flash={flash} />}
        <h2 className="text-lg font-bold text-ink mb-3">أوامر الشراء المفتوحة ({orders.length})</h2>
        {orders.length === 0 ? (
          <p className="text-ink-2 text-sm">
            لا أمر شراءٍ معتمدٌ له رصيدٌ مفتوح. اعتمد أمرًا من صندوق المستندات ثمّ عُد.
          </p>
        ) : (
          <ul className="space-y-2">
            {orders.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => begin(o)}
                  className="w-full text-right rounded-lg border px-4 py-4"
                  style={{ borderColor: 'var(--o-border)' }}
                >
                  <div className="font-bold text-ink">{o.number}</div>
                  <div className="text-ink-2 text-xs mt-1">
                    {o.supplier || '—'} · {o.warehouse || '—'} · {o.lineCount} صنفًا
                  </div>
                  <div className="text-ink-2 text-xs mt-1">
                    المطلوب {o.ordered} · المستلم {o.received} · <strong className="text-ink">المفتوح {o.open}</strong>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // ── المسح ──
  return (
    <div className="o_theme" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <div className="font-bold text-ink">{session?.order?.number}</div>
          <div className="text-ink-2 text-xs">{session?.supplier} · {session?.warehouse}</div>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary text-sm" onClick={newDraft} disabled={busy}>طبلية جديدة</button>
          <button type="button" className="btn btn-secondary text-sm" onClick={endSession} disabled={busy}>إنهاء الجلسة</button>
        </div>
      </div>

      {totals && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Stat label="المفتوح" value={totals.open} />
          <Stat label="المقروء" value={totals.received} />
          <Stat label="المتبقّي" value={totals.remaining} />
        </div>
      )}

      {flash && <Flash flash={flash} />}

      <div className="flex flex-wrap gap-2 mb-3">
        {(session?.drafts ?? []).map((d) => (
          <button
            key={d.ref}
            type="button"
            onClick={() => setActiveDraft(d.ref)}
            className={d.ref === activeDraft ? 'btn btn-primary text-sm' : 'btn btn-secondary text-sm'}
          >
            {d.ref} ({(d.lines ?? []).length})
            {d.state !== 'SCANNING' && ' ✓'}
          </button>
        ))}
      </div>

      {draft?.state === 'SCANNING' ? (
        <form onSubmit={submitScan} className="mb-4">
          <input
            ref={inputRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="امسح الباركود أو اكتبه"
            className="w-full rounded-lg border px-4 py-4 text-lg mb-2"
            style={{ borderColor: 'var(--o-border)', background: 'var(--o-surface)' }}
            autoFocus
            inputMode="none"
          />
          <div className="grid grid-cols-3 gap-2 mb-2">
            <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="الكمّيّة (١)" type="number" min="0" step="any"
              className="rounded-lg border px-3 py-3 text-sm" style={{ borderColor: 'var(--o-border)' }} />
            <input value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="الدفعة"
              className="rounded-lg border px-3 py-3 text-sm" style={{ borderColor: 'var(--o-border)' }} />
            <input value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="الصلاحية" type="date"
              className="rounded-lg border px-3 py-3 text-sm" style={{ borderColor: 'var(--o-border)' }} />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary flex-1 py-3" disabled={busy || !code.trim()}>تسجيل القراءة</button>
            <button type="button" className="btn btn-secondary py-3" onClick={closeDraft} disabled={busy || (draft?.lines ?? []).length === 0}>
              إغلاق ورفعٌ للحوكمة
            </button>
          </div>
        </form>
      ) : (
        <p className="text-ink-2 text-sm mb-4">
          هذه الطبلية رُفعت للحوكمة — افتح طبليةً جديدة لتُكمل.
        </p>
      )}

      {(draft?.lines ?? []).length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ink-2 text-xs border-b" style={{ borderColor: 'var(--o-border)' }}>
              <th className="text-right py-2">الصنف</th>
              <th className="text-right py-2">الدفعة</th>
              <th className="text-left py-2">الكمّيّة</th>
            </tr>
          </thead>
          <tbody>
            {draft.lines.map((l, i) => (
              <tr key={`${l.sku}-${l.batch}-${i}`} className="border-b" style={{ borderColor: 'var(--o-border)' }}>
                <td className="py-2 text-ink">{l.name || l.sku}</td>
                <td className="py-2 text-ink-2">{l.batch || '—'}</td>
                <td className="py-2 text-left text-ink tabular-nums">{l.qty} {l.uom}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── الاستلام الرسميّ: حيث تصير الحمولة رصيدًا ── */}
      {grn && (
        <div className="mt-6 rounded-lg border p-4" style={{ borderColor: 'var(--o-border)' }}>
          <h3 className="font-bold text-ink text-sm mb-2">الاستلام الرسميّ (GRN)</h3>
          {session?.grnNumber ? (
            <p className="text-ink-2 text-sm">
              تولّد <strong className="text-ink">{session.grnNumber}</strong> من هذه الجلسة.
              اعتمده من صندوق المستندات ليتحرّك الرصيد — ولا يُشتقّ مرّتين.
            </p>
          ) : grn.problem ? (
            <p className="text-ink-2 text-sm">{grn.problem}</p>
          ) : (
            <>
              <p className="text-ink-2 text-xs mb-2">
                {grn.palletCount} طبليةً معتمدة · {grn.lines.length} بندًا · إجمالي {grn.total}
              </p>
              <ul className="text-sm mb-3 space-y-1">
                {grn.lines.map((l) => (
                  <li key={l.lineId} className="flex justify-between">
                    <span className="text-ink">{l.sku}</span>
                    <span className="text-ink-2 tabular-nums">
                      {l.received} من {l.open}{l.over > 0 && <strong> (+{l.over} فوق المفتوح)</strong>}
                    </span>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn btn-primary w-full py-3" onClick={makeGrn} disabled={busy}>
                توليد الاستلام الرسميّ
              </button>
              <p className="text-ink-2 text-xs mt-2">
                يولد <strong>مسوّدةً</strong> — والرصيد يتحرّك عند اعتمادها وإنجازها، لا قبله.
              </p>
            </>
          )}
        </div>
      )}

      {(session?.lines ?? []).length > 0 && (
        <details className="mt-4">
          <summary className="text-sm text-ink-2 cursor-pointer">المتبقّي المفتوح لكلّ صنف</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {session.lines.map((l) => (
              <li key={l.lineId} className="flex justify-between">
                <span className="text-ink">{l.sku}</span>
                <span className="text-ink-2 tabular-nums">{remainingOf(l)} من {l.open}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Flash({ flash }) {
  const color = flash.kind === 'ok' ? 'var(--o-border)' : 'var(--o-danger, #b42318)';
  return (
    <div className="mb-3 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: color }}>
      {flash.text}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border px-3 py-2 text-center" style={{ borderColor: 'var(--o-border)' }}>
      <div className="text-xl font-bold text-ink tabular-nums">{value}</div>
      <div className="text-xs text-ink-2">{label}</div>
    </div>
  );
}
