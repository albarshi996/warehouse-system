/**
 * شريطُ الإجراءات الجماعيّة — الاعتمادُ والإغلاقُ والإلغاءُ بضغطةٍ واحدة
 * (طلب المالك: «الاعتماد الجماعي · إغلاق المستندات الجماعي» · 2026-10-02).
 *
 * ═══ ★★★ الخطّةُ تُعرَض قبل أن يقع شيء ═══
 * لا يُنفَّذ إجراءٌ جماعيٌّ من ضغطةٍ واحدة. الضغطةُ الأولى تُظهر **الخطّة**:
 * كم مستندًا سيُنفَّذ عليه، وكم استُبعد، **ولماذا استُبعد كلٌّ منها بأرقامه**.
 * والثانيةُ تنفّذ.
 *
 * ولمَ خطوتان؟ لأنّ الإجراءَ الجماعيَّ لا تراجعَ فيه: اعتمادُ ثلاثين مستندًا
 * خطأً يحتاج ثلاثين رفضًا ثمّ ثلاثين تصحيحًا. والخطوةُ الثانيةُ ثمنُها ثانية،
 * وثمنُ غيابها ساعة.
 *
 * ═══ والتقدّمُ يُرى وهو يجري ═══
 * ★★ خمسون نقلةً تتابعًا قد تأخذ دقيقة. وشاشةٌ جامدةٌ دقيقةً تُدفَع ثانيةً
 * أو تُغلق في منتصفها — فيُرسم شريطُ تقدّمٍ باسم المستند الجاري. و«إيقاف»
 * يُحترَم **بين** المستندات لا في وسط واحدٍ منها (لا نقلةَ تُقطع نصفَها).
 *
 * كلُّ الحكم في `services/documents/bulkActions.js` الخالص، والتنفيذُ في
 * `bulkActionsService.js` — حلقةً على `transitionDocument` مستندًا مستندًا.
 */
import { useMemo, useRef, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { int } from '../../odoo/format.js';
import { BULK_ACTIONS, planBulk, groupBlocked, MAX_BULK } from '../../../services/documents/bulkActions.js';
import { runBulk } from '../../../services/documents/bulkActionsService.js';
import SCHEMAS from '../../../services/documents/schemas/index.js';

export default function BulkActionBar({ selectedDocs, me, onDone, onClear, onCopy, onExport }) {
  const [actionId, setActionId] = useState('');
  const [note, setNote] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const abortRef = useRef({ aborted: false });

  const user = { role: me?.role, uid: me?.uid };

  /** الإجراءاتُ التي لها مستندٌ مؤهَّلٌ واحدٌ على الأقلّ في التحديد. */
  const offered = useMemo(
    () =>
      BULK_ACTIONS.map((a) => ({ action: a, plan: planBulk(selectedDocs, a.id, user, { schemas: SCHEMAS, note: 'x' }) }))
        .filter((o) => o.plan.eligible.length > 0),
    [selectedDocs, me?.role, me?.uid]
  );

  const plan = useMemo(
    () => (actionId ? planBulk(selectedDocs, actionId, user, { schemas: SCHEMAS, note }) : null),
    [selectedDocs, actionId, note, me?.role, me?.uid]
  );

  const blockedGroups = useMemo(() => (plan ? groupBlocked(plan.blocked) : []), [plan]);

  if (!selectedDocs.length) return null;

  async function execute() {
    if (!plan?.canRun || running) return;
    setRunning(true);
    setResult(null);
    abortRef.current = { aborted: false };
    try {
      const out = await runBulk(plan, {
        note,
        profile: me,
        signal: abortRef.current,
        onProgress: (p) => setProgress(p),
      });
      setResult(out);
      // لا يُمسح التحديدُ على فشلٍ جزئيّ: ثمّة ما يُصلَح، ومسحُه يُخفي الساقط.
      if (out.failedCount === 0 && !out.aborted) {
        setActionId('');
        setNote('');
        onClear?.();
      }
      onDone?.(out);
    } catch (err) {
      setResult({ total: 0, doneCount: 0, failedCount: 0, failures: [], partial: false, message: err?.message || String(err) });
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  return (
    <div
      className="o_ds_card o_ds_pad"
      style={{ marginBottom: '14px', border: '1px solid var(--o-brand-primary)', background: 'var(--o-brand-light)' }}
    >
      {/* ── السطرُ الأوّل: ما حُدِّد وما يُفعل به ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
        <strong style={{ fontSize: 'var(--o-font-size-sm)' }}>
          حُدِّد {int(selectedDocs.length)} مستندًا
        </strong>

        <button type="button" className="btn btn-secondary btn-sm" onClick={onCopy}>
          <Icon name="clipboardList" size={14} /> نسخٌ للجدول
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onExport}>
          <Icon name="arrowDownTray" size={14} /> تصديرُ المحدَّد
        </button>

        <span style={{ width: '1px', alignSelf: 'stretch', background: 'var(--o-gray-300)', margin: '0 4px' }} />

        {offered.length === 0 ? (
          <span style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
            لا إجراءَ جماعيًّا تملكه على هذا التحديد — راجع حالاتِ المستندات ودورَك.
          </span>
        ) : (
          offered.map(({ action, plan: p }) => (
            <button
              key={action.id}
              type="button"
              className={`btn btn-sm ${actionId === action.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setActionId(actionId === action.id ? '' : action.id); setResult(null); }}
              title={action.hint}
              disabled={running}
            >
              <Icon name={action.icon} size={14} /> {action.label} ({int(p.eligible.length)})
            </button>
          ))
        )}

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ marginInlineStart: 'auto' }}
          onClick={() => { setActionId(''); setNote(''); setResult(null); onClear?.(); }}
          disabled={running}
        >
          <Icon name="x" size={14} /> إلغاءُ التحديد
        </button>
      </div>

      {/* ── الخطّة: تُعرَض قبل أن يقع شيء ── */}
      {plan?.action && !result && (
        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--o-gray-300)' }}>
          <p style={{ margin: '0 0 8px', fontSize: 'var(--o-font-size-sm)', lineHeight: 1.7 }}>
            <strong>{plan.action.label}</strong> — {plan.action.hint}
          </p>
          <p style={{ margin: '0 0 10px', fontSize: 'var(--o-font-size-sm)', lineHeight: 1.7 }}>
            {plan.summary}
          </p>

          {plan.action.needsReason && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px', maxWidth: '620px' }}>
              <span style={{ fontSize: 'var(--o-font-size-xs)', fontWeight: 'var(--o-font-weight-bold)' }}>
                السبب (إلزاميّ — يُسجَّل على كلّ مستند)
              </span>
              <input
                type="text"
                className="o_input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="مثال: المورّد ألغى الكمّيّة المتبقّية ولن تُستلم"
                disabled={running}
              />
            </label>
          )}

          {/* المستبعَدُ يُسمّى بأرقامه — «3 لم تُعتمد» لا يُصلَح به شيء */}
          {blockedGroups.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              <span style={{ fontSize: 'var(--o-font-size-xs)', fontWeight: 'var(--o-font-weight-bold)', color: 'var(--o-main-color-muted)' }}>
                المستبعَدُ من التحديد:
              </span>
              <ul style={{ margin: '5px 0 0', paddingInlineStart: '18px', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', lineHeight: 1.8 }}>
                {blockedGroups.map((g) => (
                  <li key={g.reason}>
                    {g.reason} — <span style={{ fontFamily: 'monospace', direction: 'ltr', unicodeBidi: 'isolate' }}>{g.numbers.slice(0, 8).join(' ، ')}</span>
                    {g.numbers.length > 8 && ` و${int(g.numbers.length - 8)} غيرها`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.deferred.length > 0 && (
            <p style={{ margin: '0 0 10px', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', lineHeight: 1.7 }}>
              سقفُ الدفعة {int(MAX_BULK)} مستندًا حمايةً لحصّة القراءة اليوميّة.
              و{int(plan.deferred.length)} ستبقى محدَّدةً لدفعةٍ ثانيةٍ بعد هذه.
            </p>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            <button type="button" className="btn btn-primary" onClick={execute} disabled={!plan.canRun || running}>
              {running ? 'جارٍ التنفيذ…' : `تأكيد: ${plan.action.label} على ${int(plan.eligible.length)}`}
            </button>
            {running && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { abortRef.current.aborted = true; }}>
                إيقافٌ بعد المستند الجاري
              </button>
            )}
            {!plan.canRun && plan.noteMissing && (
              <span style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
                اكتب السببَ ليُفتَح التنفيذ.
              </span>
            )}
          </div>

          {/* التقدّمُ يُرى وهو يجري */}
          {running && progress && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ height: '6px', background: 'var(--o-gray-200)', borderRadius: '999px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.round(((progress.index + 1) / Math.max(1, progress.total)) * 100)}%`,
                    height: '100%',
                    background: 'var(--o-brand-primary)',
                    transition: 'width 120ms linear',
                  }}
                />
              </div>
              <p style={{ margin: '5px 0 0', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
                {int(progress.index + 1)} من {int(progress.total)} —{' '}
                <span style={{ fontFamily: 'monospace', direction: 'ltr', unicodeBidi: 'isolate' }}>
                  {progress.doc?.number || 'مسودّة'}
                </span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── النتيجة: عددان واسمُ كلِّ ساقطٍ وسببُه ── */}
      {result && (
        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--o-gray-300)' }}>
          <div className={`o_alert ${result.failedCount > 0 ? 'danger' : 'success'}`}>
            <div className="o_alert_title">
              <Icon name={result.failedCount > 0 ? 'alertTriangle' : 'checkCircle'} size={15} /> {result.message}
              {result.aborted && ' (أُوقف بطلبك)'}
            </div>
          </div>
          {result.failures.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingInlineStart: '18px', fontSize: 'var(--o-font-size-xs)', lineHeight: 1.9 }}>
              {result.failures.map((f, i) => (
                <li key={`${f.number}-${i}`}>
                  <span style={{ fontFamily: 'monospace', direction: 'ltr', unicodeBidi: 'isolate' }}>{f.number}</span>
                  {' — '}
                  {f.reason}
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: '10px' }} onClick={() => setResult(null)}>
            إغلاقُ النتيجة
          </button>
        </div>
      )}
    </div>
  );
}
