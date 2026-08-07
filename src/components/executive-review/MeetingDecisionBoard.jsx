import { useEffect, useMemo, useState } from 'react';
import {
  DECISION_STATES,
  createDecisionSession,
  normalizeDecisionSession,
  summarizeDecisionSession,
  updateDecision,
} from '../../services/executiveReview/decisionSession.js';

const STORAGE_KEY = 'brandzo:executive-review:decision-session:v1';
const OPTIONS = [
  ['approved', 'اعتماد'],
  ['conditional', 'اعتماد مشروط'],
  ['deferred', 'تأجيل'],
  ['review', 'إعادة للدراسة'],
];

export default function MeetingDecisionBoard({ decisions }) {
  const [session, setSession] = useState(() => createDecisionSession(decisions.length));
  const [ready, setReady] = useState(false);
  const summary = useMemo(() => summarizeDecisionSession(session), [session]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      setSession(normalizeDecisionSession(stored, decisions.length));
    } catch {
      setSession(createDecisionSession(decisions.length));
    }
    setReady(true);
  }, [decisions.length]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    window.dispatchEvent(new CustomEvent('brandzo:decision-session', { detail: summary }));
  }, [ready, session, summary]);

  function change(index, patch) {
    setSession((current) => updateDecision(current, index, patch));
  }

  function clearSession() {
    if (!window.confirm('هل تريد مسح نتائج جلسة القرار المحفوظة على هذا الجهاز؟')) return;
    setSession(createDecisionSession(decisions.length));
  }

  return (
    <section className="meeting-board" aria-label="لوحة حسم قرارات الاجتماع">
      <header className="meeting-summary">
        <div>
          <p>نتيجة الاجتماع — تحفظ محليًا على هذا الجهاز</p>
          <h2>{summary.resolved} من {summary.total} قرارات حُسمت</h2>
          <div className="meeting-meter" aria-label={`اكتمل ${summary.resolved} من ${summary.total}`}>
            <i style={{ width: `${summary.total ? (summary.resolved / summary.total) * 100 : 0}%` }} />
          </div>
        </div>
        <dl>
          <div><dt>{summary.approved}</dt><dd>معتمد</dd></div>
          <div><dt>{summary.conditional}</dt><dd>مشروط</dd></div>
          <div><dt>{summary.deferred}</dt><dd>مؤجل</dd></div>
          <div><dt>{summary.review}</dt><dd>للدراسة</dd></div>
          <div><dt>{summary.remaining}</dt><dd>متبقٍ</dd></div>
        </dl>
        <div className="meeting-actions no-print">
          <button type="button" onClick={() => window.print()}>طباعة الملخص</button>
          <button type="button" className="quiet" onClick={clearSession}>بدء جلسة جديدة</button>
        </div>
      </header>

      <div className="meeting-decisions">
        {decisions.map((decision, index) => {
          const result = session.decisions[index];
          return (
            <article className={`meeting-decision state-${result.status}`} key={decision.title}>
              <header><span>{index + 1}</span><div><small>{DECISION_STATES[result.status]}</small><h3>{decision.title}</h3></div></header>
              <p><b>القرار المطلوب:</b> {decision.ask}</p>
              <div className="decision-impact"><p><b>عند الاعتماد:</b> {decision.ifYes}</p><p><b>عند التأجيل:</b> {decision.ifNo}</p></div>
              <div className="decision-vote no-print" role="group" aria-label={`حسم القرار ${index + 1}`}>
                {OPTIONS.map(([value, label]) => <button type="button" className={result.status === value ? 'selected' : ''} aria-pressed={result.status === value} onClick={() => change(index, { status: value })} key={value}>{label}</button>)}
              </div>
              <div className="decision-fields">
                <label>المسؤول التنفيذي<input value={result.owner} onChange={(event) => change(index, { owner: event.target.value })} placeholder={decision.owner} /></label>
                <label>موعد الإغلاق<input value={result.due} onChange={(event) => change(index, { due: event.target.value })} placeholder={decision.due} /></label>
                <label className="wide">ملاحظة المدير العام / الشرط / سبب التأجيل<textarea rows="2" value={result.note} onChange={(event) => change(index, { note: event.target.value })} placeholder="تُسجّل الملاحظة هنا…" /></label>
              </div>
              <footer><span><b>المالك المقترح:</b> {decision.owner}</span><span><b>الجهات:</b> {decision.parties}</span><span><b>الموعد المقترح:</b> {decision.due}</span></footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}
