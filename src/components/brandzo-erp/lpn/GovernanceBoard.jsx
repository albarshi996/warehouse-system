/**
 * لوحة حوكمة الطبالي — الشاشة التي يقف عندها قرارُ «صار مخزونًا».
 *
 * المشكلة التي تحلّها: منطق الحوكمة كلُّه مبنيٌّ مختبَر في
 * `governanceQueue.js`، **ولا شاشة تستدعيه** — فالقرار يبقى في الملفّات
 * لا في يد موظّف. هذه الشاشة تصله بالإنسان.
 *
 * ═══ القاعدة الحاكمة ═══
 * **الشاشة عرضٌ للحكم لا حَكَم.** كلّ قرارٍ يمرّ بـ`planDecision`، وكلّ
 * عدّادٍ من `governanceCounters`، وكلّ بطاقةٍ من `reviewCard` — فلا شرطَ
 * واحدٌ يُكتب هنا، ولا رقمَ يُحسب. وما يظهر للموظّف هو ما يقيس عليه النظام
 * حرفيًّا.
 *
 * الطبقات الثلاث (منهجيّة اللوحات المعتمَدة): تدخّل الآن (بانتظار الحوكمة)
 * ← إجراءات سريعة (العدّادات) ← الفهرس الكامل. وبلا إيموجي، والأحمر
 * للتحذير وحده.
 */
import React, { useEffect, useMemo, useState } from 'react';

import { governanceCounters, GOVERNANCE_DECISIONS, decisionProblem, reviewCard } from '../../../services/lpn/governanceQueue.js';
import { buildLabel } from '../../../services/lpn/labelModel.js';
import { listUnitsByState } from '../../../services/lpn/lpnService.js';
import { executeDecision, listPendingGovernance } from '../../../services/lpn/receivingService.js';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
// ‹LPN-511› الصلاحية تُعلَم قبل الضغط — والمجهولُ يمرّ.
import { uiGate } from '../../../services/lpn/lpnRoles.js';

/**
 * الحالات المجلوبة من `handling_units` — أي **المعتمَدة فما بعد**.
 * وما قبل الاعتماد يأتي من الجلسات (`listPendingGovernance`) لأنّه ليس
 * في المجموعة أصلًا: الهويّة تولد عند الاعتماد.
 */
const BOARD_STATES = ['APPROVED', 'LABEL_PRINTED', 'PENDING_PUTAWAY', 'STORED'];

export default function GovernanceBoard() {
  const [me, setMe] = useState(null);
  const [units, setUnits] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => subscribeAuth(async (user) => {
    setMe(user ? await fetchUserProfile(user) : null);
  }), []);

  const load = React.useCallback(async () => {
    try {
      const [groups, waiting] = await Promise.all([
        Promise.all(BOARD_STATES.map((s) => listUnitsByState(s, 100))),
        listPendingGovernance(100),
      ]);
      setUnits(groups.flat());
      setPending(waiting);
      setError('');
    } catch (e) {
      setError(e?.message || 'تعذّرت قراءة الطبالي — تحقّق من الاتصال والصلاحية.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // العدّادات تُشتقّ من المجموعتين معًا: المنتظرة في جلساتها والمعتمَدة في سجلّها.
  const counters = useMemo(
    () => governanceCounters([...pending, ...units]),
    [pending, units]
  );
  const card = useMemo(() => (selected ? reviewCard(selected, selected.session ?? null, {
    rejections: selected.rejections ?? [],
    exceptions: selected.exceptions ?? [],
  }) : null), [selected]);
  const label = useMemo(() => (selected?.lpn ? buildLabel({ ...selected, code: selected.lpn }) : null), [selected]);

  const actorName = me?.name || me?.displayName || me?.email || '';
  // ‹LPN-511› والمجهولُ يمرّ — فقراءةٌ فاشلةٌ للهويّة منعت المديرَ العامّ مرّة.
  const approveGate = uiGate(me?.role, 'APPROVE');

  async function decide(id) {
    if (!selected) return;
    if (!actorName) { setError('لم تُقرأ هويّتك بعد — أعد تحميل الصفحة.'); return; }

    // الحكم أوّلًا في المتصفّح: رسالةٌ فوريّةٌ للموظّف بلا انتظار الشبكة.
    // والخدمة تعيد الحكم نفسه على البيانات الحيّة — فلا تُصدَّق الشاشة وحدها.
    const problem = decisionProblem(selected, id, { reason, actor: actorName });
    if (problem) { setError(problem); setDone(''); return; }

    setBusy(id);
    setError('');
    setDone('');
    try {
      const r = await executeDecision(selected.sessionId, selected.ref, id, { reason, actor: actorName });
      setDone(r.lpn ? `تمّ: ${GOVERNANCE_DECISIONS[id].label} — وهويّتها ${r.lpn}.` : `تمّ: ${GOVERNANCE_DECISIONS[id].label}.`);
      setSelected(null);
      setReason('');
      await load();
    } catch (e) {
      setError(e?.message || 'تعذّر تنفيذ القرار.');
    } finally {
      setBusy('');
    }
  }

  if (loading) return <div className="o_theme"><p className="text-ink-2 text-sm">جارٍ قراءة الطبالي…</p></div>;

  return (
    <div className="o_theme" dir="rtl">
      <RoleGate gate={approveGate} />
      {/* ── الطبقة ٢: العدّادات ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Counter label="بانتظار الحوكمة" value={counters.pendingApproval} warn={counters.pendingApproval > 0} />
        <Counter label="بانتظار الطباعة" value={counters.pendingPrint} />
        <Counter label="بانتظار التخزين" value={counters.pendingPutaway} />
        <Counter label="تحت الفحص" value={counters.underInspection} />
        <Counter label="محجوزة" value={counters.held} />
        <Counter label="مخزَّنة" value={counters.stored} />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: 'var(--o-danger, #b42318)' }}>
          {error}
        </div>
      )}
      {done && (
        <div className="mb-4 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: 'var(--o-border)', background: 'var(--o-surface-2)' }}>
          {done}
        </div>
      )}

      <div className="grid lg:grid-cols-5 gap-6">
        {/* ── الطبقة ١: تدخّل الآن ── */}
        <section className="lg:col-span-2">
          <h2 className="text-lg font-bold text-ink mb-3">بانتظار قرارك ({pending.length})</h2>
          {pending.length === 0 ? (
            <p className="text-ink-2 text-sm">لا طبلية تنتظر — الطابور نظيف.</p>
          ) : (
            <ul className="space-y-2">
              {pending.map((u) => {
                const key = `${u.sessionId}/${u.ref}`;
                const isOn = selected && `${selected.sessionId}/${selected.ref}` === key;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => { setSelected(u); setReason(''); setError(''); setDone(''); }}
                      className="w-full text-right rounded-lg border px-4 py-3 transition"
                      style={{
                        borderColor: isOn ? 'var(--o-primary)' : 'var(--o-border)',
                        background: isOn ? 'var(--o-surface-2)' : 'transparent',
                      }}
                    >
                      <div className="font-bold text-ink text-sm">
                        {u.session?.order?.number || 'بلا أمر'} · طبلية {u.ref}
                      </div>
                      <div className="text-ink-2 text-xs mt-1">
                        {u.warehouse} · {(u.lines ?? []).length} بندًا
                        {(u.rejections ?? []).length > 0 && <span> · {u.rejections.length} مرفوضًا</span>}
                        {(u.exceptions ?? []).length > 0 && <span> · {u.exceptions.length} استثناءً</span>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── الطبقة ٣: البطاقة والقرار ── */}
        <section className="lg:col-span-3">
          {!card ? (
            <p className="text-ink-2 text-sm">اختر طبليةً لتُراجعها.</p>
          ) : (
            <div className="rounded-lg border p-5" style={{ borderColor: 'var(--o-border)' }}>
              <h2 className="text-lg font-bold text-ink mb-1">{card.palletRef}</h2>
              <p className="text-ink-2 text-xs mb-4">
                {card.order?.number ? `${card.order.number} · ` : ''}{card.supplier || '—'} · استلمها {card.receivedBy || '—'}
              </p>

              {card.needsAttention && (
                <div className="mb-4 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: 'var(--o-danger, #b42318)' }}>
                  <strong className="block mb-1">يستدعي وقفة:</strong>
                  <ul className="list-disc pr-5 space-y-0.5 text-xs">
                    {card.overs.length > 0 && <li>{card.overs.length} بندًا فوق المفتوح</li>}
                    {card.unknownBase.length > 0 && <li>{card.unknownBase.length} بندًا بمعاملٍ مجهول</li>}
                    {card.rejectionSummary.map((r) => <li key={r.reason}>{r.label}: {r.qty}</li>)}
                    {card.exceptions.length > 0 && <li>{card.exceptions.length} استثناءً غير معالَج</li>}
                  </ul>
                </div>
              )}

              <table className="w-full text-sm mb-4">
                <thead>
                  <tr className="text-ink-2 text-xs border-b" style={{ borderColor: 'var(--o-border)' }}>
                    <th className="text-right py-2">الصنف</th>
                    <th className="text-right py-2">الدفعة</th>
                    <th className="text-right py-2">الوحدة</th>
                    <th className="text-left py-2">الكمّيّة</th>
                  </tr>
                </thead>
                <tbody>
                  {card.lines.map((l, i) => (
                    <tr key={`${l.sku}-${l.batch}-${i}`} className="border-b" style={{ borderColor: 'var(--o-border)' }}>
                      <td className="py-2 text-ink">{l.sku}</td>
                      <td className="py-2 text-ink-2">{l.batch || '—'}</td>
                      <td className="py-2 text-ink-2">{l.uom}</td>
                      <td className="py-2 text-left text-ink tabular-nums">{l.qty}{l.over > 0 && <span className="text-xs"> (+{l.over})</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {label?.isMixed && <p className="text-xs text-ink-2 mb-3">{label.mixedNotice}</p>}

              <label className="block text-xs text-ink-2 mb-1">السبب (إلزاميّ لغير الاعتماد الصريح)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="w-full rounded-lg border px-3 py-2 text-sm mb-3"
                style={{ borderColor: 'var(--o-border)', background: 'var(--o-surface)' }}
                placeholder="يبقى في السجلّ باسمك"
              />

              <div className="flex flex-wrap gap-2">
                {Object.entries(GOVERNANCE_DECISIONS).map(([id, d]) => (
                  <button
                    key={id}
                    type="button"
                    disabled={busy === id || !approveGate.allowed}
                    onClick={() => decide(id)}
                    className="btn text-sm px-3 py-2 rounded-lg border"
                    style={{ borderColor: 'var(--o-border)' }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** ‹LPN-511› شريطُ الصلاحية — يُعلِم ولا يحجب من لا يُعرَف. */
function RoleGate({ gate }) {
  if (!gate || gate.allowed) return null;
  return (
    <div className="o_alert danger mb-3" style={{ fontSize: 'var(--o-font-size-sm)' }}>
      {gate.message}
    </div>
  );
}

function Counter({ label, value, warn = false }) {
  return (
    <div className="rounded-lg border px-4 py-3" style={{ borderColor: warn ? 'var(--o-danger, #b42318)' : 'var(--o-border)' }}>
      <div className="text-2xl font-bold text-ink tabular-nums">{value}</div>
      <div className="text-xs text-ink-2 mt-0.5">{label}</div>
    </div>
  );
}
