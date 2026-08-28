/**
 * سجلُّ البوابة والمطابقة ‹GATE-403› — منظارُ المدير.
 *
 * ═══ ثلاثُ طبقاتٍ كنمط لوحات البوّابة ═══
 *   ① تدخّلٌ الآن — الفروقُ المفتوحة والتجاوزاتُ الزمنيّة.
 *   ② لقطةٌ — عدّاداتُ الساحة.
 *   ③ فهرسٌ كامل — الزياراتُ مصفّاةً بحمولتيها.
 *
 * ═══ ★ ولا رقمَ يُحسب هنا ═══
 * `yardSnapshot` و`visitTimers` و`visitAlerts` من نموذج الساحة القائم،
 * و`reconcileAll` و`decideVariance` من المطابقة المختبَرة. والشاشةُ تعرض.
 */
import React, { useEffect, useMemo, useState } from 'react';

import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import {
  listenYardVisits,
  listenDoors,
  listenReceivingSessions,
  saveVarianceDecision,
} from '../../../services/gate/gateService.js';
import { yardSnapshot, yardStage, visitTimers, visitAlerts } from '../../../services/fleet/yardModel.js';
import { loadSummary, reasonLabel } from '../../../services/gate/gateModel.js';
import { reconcileAll, openVarianceProblem, LIABLE_PARTIES, liableLabel } from '../../../services/gate/gateReconcile.js';
import { canWriteGate, canReadVisitor } from '../../../services/gate/gateRoles.js';
import { readVisitor } from '../../../services/gate/gateService.js';

const box = { borderColor: 'var(--o-border)', background: 'var(--o-surface)' };
const up = (v) => String(v ?? '').trim().toUpperCase();

const FILTERS = [
  { id: 'open', label: 'داخل الموقع' },
  { id: 'variance', label: 'فروقٌ مفتوحة' },
  { id: 'exited', label: 'خرجت' },
  { id: 'all', label: 'الكلّ' },
];

export default function GateLog() {
  const [me, setMe] = useState(null);
  const [visits, setVisits] = useState([]);
  const [doors, setDoors] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [filter, setFilter] = useState('open');
  const [openId, setOpenId] = useState('');
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ decision: '', liability: '', correction: '' });

  useEffect(() => subscribeAuth(async (u) => setMe(u ? await fetchUserProfile(u) : null)), []);
  useEffect(() => listenYardVisits((l) => setVisits(l), () => setVisits([])), []);
  useEffect(() => listenDoors((l) => setDoors(l), () => setDoors([])), []);
  useEffect(() => listenReceivingSessions((l) => setSessions(l), () => setSessions([])), []);

  const canDecide = canWriteGate(me?.role);
  const seesVisitor = canReadVisitor(me?.role);
  const [visitorOf, setVisitorOf] = useState({});
  const now = Date.now();

  /**
   * ق-٧: بياناتُ الزائر تُقرأ **عند الطلب** من مستندها الابن، لا مع كلّ
   * زيارة. وردُّ القاعدة `permission-denied` يُقال نصًّا — فلا يُشبه الفراغُ
   * «لا زائرَ لها».
   */
  async function loadVisitor(visitId) {
    if (visitorOf[visitId]) { setVisitorOf((s) => ({ ...s, [visitId]: null })); return; }
    try {
      const v = await readVisitor(visitId);
      setVisitorOf((s) => ({ ...s, [visitId]: v ?? { empty: true } }));
    } catch {
      setVisitorOf((s) => ({ ...s, [visitId]: { denied: true } }));
    }
  }
  const snap = useMemo(() => yardSnapshot(doors, visits, now), [doors, visits, now]);

  /** يقابل كلَّ زيارةٍ بجلستها — والمفتاحُ رقمُ أمر الشراء. */
  const rows = useMemo(() => {
    const byPo = new Map();
    for (const s of sessions) {
      const key = up(s?.order?.number);
      if (key && !byPo.has(key)) byPo.set(key, s);
    }
    return reconcileAll(
      visits.map((v) => ({
        visit: v,
        session: byPo.get(up(v?.load?.in?.poRef)) ?? null,
        decision: v?.varianceDecision ?? null,
      }))
    );
  }, [visits, sessions]);

  const byVisitId = useMemo(() => new Map(rows.map((r) => [r.visitId, r])), [rows]);
  const openVariances = useMemo(() => rows.filter((r) => r.status === 'variance'), [rows]);

  const shown = useMemo(() => {
    return visits.filter((v) => {
      const r = byVisitId.get(v.id);
      if (filter === 'all') return true;
      if (filter === 'variance') return r?.status === 'variance';
      if (filter === 'exited') return v.stage === 'exited';
      return v.stage !== 'exited' && v.stage !== 'canceled';
    });
  }, [visits, filter, byVisitId]);

  async function submitDecision(e, result) {
    e?.preventDefault?.();
    setBusy(true);
    try {
      await saveVarianceDecision(result.visitId, result, form, me);
      setFlash({ kind: 'ok', text: 'حُسم الفرقُ باسمك — وبقي أثرُه في سجلّ الزيارة.' });
      setForm({ decision: '', liability: '', correction: '' });
      setOpenId('');
    } catch (err) {
      setFlash({ kind: 'err', text: err?.message || 'تعذّر الحفظ.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="o_theme" dir="rtl">
      {flash && (
        <div className="mb-3 rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: flash.kind === 'ok' ? 'var(--o-border)' : 'var(--o-danger, #b42318)' }} role="status">
          {flash.text}
        </div>
      )}

      {/* ① تدخّلٌ الآن — الفروقُ المفتوحة أوّلَ ما يُرى. */}
      <section className="mb-6">
        <h2 className="text-lg font-bold text-ink mb-2">تدخّلٌ الآن</h2>
        {openVariances.length === 0 ? (
          <p className="text-ink-2 text-sm">لا فرقَ مفتوحًا بين البوّابة والاستلام.</p>
        ) : (
          <ul className="space-y-2">
            {openVariances.map((r) => (
              <li key={r.visitId} className="rounded-lg border px-3 py-3" style={box}>
                {/* نصُّ الفرق من الحارس نفسِه — فلا صيغتان لنفس القاعدة. */}
                <div className="font-bold text-ink">{openVarianceProblem(r, r.decision) || r.text}</div>
                <div className="text-xs text-ink-2 mt-1" style={{ direction: 'ltr', textAlign: 'right' }}>
                  {r.plate} · {r.gate.key}
                </div>
                {r.packagesNote && <div className="text-xs text-ink-2 mt-1">{r.packagesNote}</div>}
                <button type="button" className="btn btn-secondary text-xs mt-2" disabled={!canDecide}
                  onClick={() => setOpenId(openId === r.visitId ? '' : r.visitId)}>
                  {openId === r.visitId ? 'أغلِق' : 'احسِم الفرق'}
                </button>
                {!canDecide && (
                  <p className="text-xs text-ink-2 mt-1">
                    الحسمُ لضابط البوابة والمديرَين — وما تراه هنا للقراءة والتدقيق.
                  </p>
                )}

                {openId === r.visitId && canDecide && (
                  <form onSubmit={(e) => submitDecision(e, r)} className="mt-3 space-y-2">
                    <label className="block">
                      <span className="text-xs text-ink-2">القرار — ماذا تقرّر ولماذا؟</span>
                      <textarea rows={2} value={form.decision} onChange={(e) => setForm({ ...form, decision: e.target.value })}
                        className="w-full rounded-lg border px-3 py-2 mt-1" style={box} />
                    </label>
                    <label className="block">
                      <span className="text-xs text-ink-2">الطرف الذي يتحمّله</span>
                      <select value={form.liability} onChange={(e) => setForm({ ...form, liability: e.target.value })}
                        className="w-full rounded-lg border px-3 py-2 mt-1" style={box}>
                        <option value="">—</option>
                        {LIABLE_PARTIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs text-ink-2">الحركة التصحيحيّة (اختياريّة)</span>
                      <input value={form.correction} onChange={(e) => setForm({ ...form, correction: e.target.value })}
                        className="w-full rounded-lg border px-3 py-2 mt-1" style={box} />
                    </label>
                    <button type="submit" className="btn btn-primary text-sm py-2" disabled={busy}>
                      احفظ القرار باسمي
                    </button>
                    <p className="text-xs text-ink-2">
                      لا يُحفظ قرارٌ بلا نصٍّ وطرفٍ يتحمّله — والفرقُ بلا صاحبٍ يتكرّر.
                    </p>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ② لقطةُ الساحة. */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 mb-6">
        <Tile n={snap.onSite} label="داخل الموقع" />
        <Tile n={snap.waiting} label="تنتظر بابًا" />
        <Tile n={snap.atDoor} label="على الأبواب" />
        <Tile n={snap.breaches} label="تجاوزاتُ الوقت" />
        <Tile n={snap.exited} label="خرجت" />
        <Tile n={snap.avgTurnaroundMinutes ?? 0} label="متوسّطُ البقاء (دقيقة)" />
      </div>

      {/* ③ الفهرسُ الكامل. */}
      <section>
        <div className="flex flex-wrap gap-2 mb-3">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
              className={filter === f.id ? 'btn btn-primary text-sm' : 'btn btn-secondary text-sm'}>
              {f.label}
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="text-ink-2 text-sm">لا زيارةَ مطابقة.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="o_table w-full text-sm">
              <thead>
                <tr>
                  <th>اللوحة</th><th>السبب</th><th>المرحلة</th><th>دخلت بـ</th><th>خرجت بـ</th>
                  <th>البقاء</th><th>المطابقة</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((v) => {
                  const sum = loadSummary(v.load);
                  const t = visitTimers(v, now);
                  const alerts = visitAlerts(v, now);
                  const r = byVisitId.get(v.id);
                  return (
                    <tr key={v.id}>
                      <td className="tabular-nums font-bold" style={{ direction: 'ltr', textAlign: 'right' }}>{v.plate}</td>
                      <td>{reasonLabel(v.reason) || '—'}</td>
                      <td>
                        {yardStage(v.stage)?.label || v.stage}
                        {alerts.length > 0 && <div className="text-xs text-ink-2 mt-1">{alerts[0]}</div>}
                        {/* ق-٧: زرُّ الزائر لمن تسمح له القاعدة — ولزيارات الزوّار وحدها. */}
                        {seesVisitor && ['visit', 'staff'].includes(v.reason) && (
                          <>
                            <button type="button" className="btn btn-secondary text-xs mt-1"
                              onClick={() => loadVisitor(v.id)}>
                              {visitorOf[v.id] ? 'أخفِ الزائر' : 'بيانات الزائر'}
                            </button>
                            {visitorOf[v.id]?.denied && (
                              <div className="text-xs text-ink-2 mt-1">
                                منعت القاعدةُ القراءة — بياناتُ الزوّار لضابط البوابة والمديرَين.
                              </div>
                            )}
                            {visitorOf[v.id]?.empty && (
                              <div className="text-xs text-ink-2 mt-1">لم تُسجَّل بياناتُ زائر.</div>
                            )}
                            {visitorOf[v.id]?.name && (
                              <div className="text-xs text-ink-2 mt-1">
                                {visitorOf[v.id].name} · إلى {visitorOf[v.id].host || '—'} · {visitorOf[v.id].phone || '—'}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                      <td>{sum.in.text}</td>
                      <td>
                        {sum.out.text}
                        {sum.differs && <div className="text-xs text-ink-2 mt-1">تختلف عن الدخول — مُثبَتٌ لا خطأ.</div>}
                      </td>
                      <td className="tabular-nums">{t.turnaround.label}</td>
                      <td>
                        {r?.label}
                        {r?.decision?.decidedBy && (
                          <div className="text-xs text-ink-2 mt-1">
                            {liableLabel(r.decision.liability)} · {r.decision.decidedBy}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-ink-2 text-xs mt-4 leading-relaxed">
        الأزمنةُ تُقاس بختم الخادم لا بساعة المتصفّح. والمطابقةُ تقابل
        <strong className="text-ink"> عددَ الطبليات </strong>
        عند البوّابة بالطبالي المعتمدة في الاستلام — وعددُ الطرود يُعلَن بلا نظير،
        فمقارنةُ طردٍ بكمّيّةٍ أساسٍ فرقٌ مخترَع.
      </p>
    </div>
  );
}

function Tile({ n, label }) {
  return (
    <div className="rounded-lg border px-3 py-3 text-center" style={box}>
      <div className="text-xl font-bold text-ink tabular-nums">{n}</div>
      <div className="text-xs text-ink-2 mt-1">{label}</div>
    </div>
  );
}
