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

import { governanceCounters, GOVERNANCE_DECISIONS, decisionProblem, planDecision, reviewCard } from '../../../services/lpn/governanceQueue.js';
import { buildLabel } from '../../../services/lpn/labelModel.js';
import { stateLabel, LPN_FLAGS } from '../../../services/lpn/lpnLifecycle.js';
import { listUnitsByState } from '../../../services/lpn/lpnService.js';

/** الحالات التي تُجلب للوحة — والترتيب هو ترتيب العمل. */
const BOARD_STATES = ['PENDING_GOVERNANCE', 'APPROVED', 'LABEL_PRINTED', 'PENDING_PUTAWAY'];

export default function GovernanceBoard() {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const groups = await Promise.all(BOARD_STATES.map((s) => listUnitsByState(s, 100)));
        if (!alive) return;
        setUnits(groups.flat());
      } catch (e) {
        if (alive) setError(e?.message || 'تعذّرت قراءة الطبالي — تحقّق من الاتصال والصلاحية.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const counters = useMemo(() => governanceCounters(units), [units]);
  const pending = useMemo(() => units.filter((u) => u.state === 'PENDING_GOVERNANCE'), [units]);
  const card = useMemo(() => (selected ? reviewCard(selected, selected.session ?? null) : null), [selected]);
  const label = useMemo(() => (selected ? buildLabel(selected) : null), [selected]);

  async function decide(id) {
    if (!selected) return;
    const problem = decisionProblem(selected, id, { reason, actor: 'المستخدم الحاليّ' });
    if (problem) { setError(problem); return; }
    const plan = planDecision(selected, id, { reason, actor: 'المستخدم الحاليّ', at: new Date().toISOString() });
    if (plan.problem) { setError(plan.problem); return; }
    setBusy(id);
    setError('');
    // ملاحظة: تنفيذ الخطّة على السحابة يقع في LPN-207 (الوصل الكامل).
    // الشاشة اليوم تعرض الأثر المخطَّط وتتحقّق من القرار — ولا تكتب بعد.
    setTimeout(() => {
      setBusy('');
      setError(`الخطّة صحيحة: ${plan.plan.label} ← ${plan.plan.nextState ? stateLabel(plan.plan.nextState) : 'بلا تغيير حالة'}${plan.plan.generatesIdentity ? ' · تولد الهويّة' : ''}. التنفيذ السحابيّ يُوصَل في LPN-207.`);
    }, 200);
  }

  if (loading) return <div className="o_theme"><p className="text-ink-2 text-sm">جارٍ قراءة الطبالي…</p></div>;

  return (
    <div className="o_theme" dir="rtl">
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
        <div className="mb-4 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: 'var(--o-border)', background: 'var(--o-surface-2)' }}>
          {error}
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
              {pending.map((u) => (
                <li key={u.code}>
                  <button
                    type="button"
                    onClick={() => { setSelected(u); setReason(''); setError(''); }}
                    className="w-full text-right rounded-lg border px-4 py-3 transition"
                    style={{
                      borderColor: selected?.code === u.code ? 'var(--o-primary)' : 'var(--o-border)',
                      background: selected?.code === u.code ? 'var(--o-surface-2)' : 'transparent',
                    }}
                  >
                    <div className="font-bold text-ink text-sm">{u.code || u.tempRef}</div>
                    <div className="text-ink-2 text-xs mt-1">
                      {u.warehouse} · {(u.lines ?? []).length} بندًا
                      {(u.flags ?? []).length > 0 && <span> · {u.flags.map((f) => LPN_FLAGS[f]).join(' و')}</span>}
                    </div>
                  </button>
                </li>
              ))}
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
                    disabled={busy === id}
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

function Counter({ label, value, warn = false }) {
  return (
    <div className="rounded-lg border px-4 py-3" style={{ borderColor: warn ? 'var(--o-danger, #b42318)' : 'var(--o-border)' }}>
      <div className="text-2xl font-bold text-ink tabular-nums">{value}</div>
      <div className="text-xs text-ink-2 mt-0.5">{label}</div>
    </div>
  );
}
