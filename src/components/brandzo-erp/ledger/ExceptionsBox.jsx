/**
 * صندوق الاستثناءات ‹EXE-204› — داخل غرفة القيادة لا صفحةً ثانية.
 *
 * كان الاستثناء سطرًا يُقرأ ويُترك: عنوانٌ وتفصيلٌ ورابطٌ يقود إلى **صفحة**
 * فيها مئة سطر. فصار صفًّا يحمل:
 *   الرقم · النوع · الخطورة · **الإجراء المطلوب** · **المسؤول** · الوقت
 *   المتبقّي · وزرّ العمل.
 *
 * ولا حسابَ هنا: `boardRows` و`filterRows` في `exceptions.js` الخالص،
 * والشاشة تعرض ما قرّرتاه.
 */
import { useMemo, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { getBasePath } from '../../../services/auth/authService.js';
import { LINK_STATE, drillChain } from '../../../services/ledger/exceptionDrill.js';
import {
  EXCEPTION_TYPES,
  SEVERITY,
  SEVERITY_LABELS,
  STATUS_LABELS,
  boardRows,
  filterRows,
} from '../../../services/ledger/exceptions.js';

const n = (v) => new Intl.NumberFormat('en-US').format(Number(v) || 0);

export default function ExceptionsBox({ detections, registry, nowMs, onRegister, busy, tasks = [], laborTasks = [] }) {
  const [severity, setSeverity] = useState('');
  const [type, setType] = useState('');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const base = getBasePath();

  const rows = useMemo(() => boardRows(detections, registry, nowMs), [detections, registry, nowMs]);
  const shown = useMemo(() => filterRows(rows, { severity, type, onlyOverdue }), [rows, severity, type, onlyOverdue]);
  const unregistered = rows.filter((r) => !r.registered).length;

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Icon name="alertTriangle" size={16} />
        <h2 className="text-sm font-bold text-ink">الاستثناءات — ما يحتاج تدخّلًا</h2>
        <span className="text-xs text-muted">({n(shown.length)} من {n(rows.length)})</span>
        <div className="flex-1" />

        <select className="text-xs bg-chip border border-line rounded px-2 py-1 text-ink" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">كل الخطورات</option>
          {Object.values(SEVERITY).map((s) => (
            <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
          ))}
        </select>
        <select className="text-xs bg-chip border border-line rounded px-2 py-1 text-ink" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">كل الأنواع</option>
          {Object.values(EXCEPTION_TYPES).map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <label className="text-xs text-ink-2 flex items-center gap-1">
          <input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />
          المتأخّر فقط
        </label>

        {/* ت-O01: النظام يكشف والمشرف يُسجّل — لا تسجيلَ صامتًا خلف ظهره. */}
        {unregistered > 0 && onRegister && (
          <button type="button" className="text-xs font-bold px-3 py-1 rounded bg-accent text-brand-navy disabled:opacity-50" disabled={Boolean(busy)} onClick={onRegister}>
            {busy || `سجّل ${n(unregistered)} مكشوفًا`}
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm py-6 text-center text-ink-2">لا استثناء يطابق — كلّ العمليات ضمن الطبيعيّ.</p>
      ) : (
        <div className="grid gap-2">
          {shown.slice(0, 24).map((e, i) => (
            <Row key={e.id || `d${i}`} e={e} base={base} tasks={tasks} laborTasks={laborTasks} />
          ))}
          {shown.length > 24 && <p className="text-xs text-muted text-center">…و{n(shown.length - 24)} استثناءً آخر.</p>}
        </div>
      )}
    </div>
  );
}

function Row({ e, base, tasks, laborTasks }) {
  const [open, setOpen] = useState(false);
  const drill = useMemo(() => drillChain(e, { tasks, laborTasks, base }), [e, tasks, laborTasks, base]);
  // الأحمر للخطورة المرتفعة وحدها — وما دونها بلا لونِ إنذار.
  const high = e.severity === SEVERITY.HIGH;
  return (
    <div className={`rounded-xl border p-3 ${high ? 'border-brand-red/50' : 'border-line'} bg-surface`}>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        {e.number ? (
          <strong className="text-xs font-mono text-ink">{e.number}</strong>
        ) : (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-chip text-ink-2 border border-line">غير مسجَّل بعد</span>
        )}
        <span className="text-xs font-bold text-ink">{e.typeLabel}</span>
        <span className={`text-[11px] ${high ? 'text-brand-red' : 'text-muted'}`}>{SEVERITY_LABELS[e.severity]}</span>
        {e.status && <span className="text-[11px] text-muted">{STATUS_LABELS[e.status]}</span>}
        {e.registered && !e.stillDetected && (
          <span className="text-[11px] text-muted" title="لم يعد المحرّك يكشفه — يبقى مفتوحًا حتى يُبتّ فيه">زال سببه</span>
        )}
        <div className="flex-1" />
        <span className={`text-[11px] ${e.remaining?.overdue ? 'text-brand-red font-bold' : 'text-muted'}`}>{e.remaining?.label}</span>
      </div>

      <div className="text-[11px] text-muted leading-snug mb-1">
        {e.reason}
        {e.docRef?.number && <span className="font-mono"> · {e.docRef.number}</span>}
        {e.sku && <span className="font-mono"> · {e.sku}</span>}
        {e.qty > 0 && <span> · {n(e.qty)} وحدة</span>}
        {e.location && <span className="font-mono"> · {e.location}</span>}
      </div>

      {/* الإجراء المطلوب ومسؤوله — لا تنبيهَ بلا «افعل كذا». */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <strong className="text-ink">الإجراء:</strong>
        <span className="text-ink-2">{e.action || '—'}</span>
        {e.ownerRole && <span className="text-muted">· المسؤول: {e.ownerRole}</span>}
        <div className="flex-1" />
        {/* ‹EXE-501› النزول سلسلةٌ لا رابطُ صفحة — وأوّل فجوةٍ تُقال قبل الفتح. */}
        <button type="button" className="text-accent font-bold hover:underline" onClick={() => setOpen((v) => !v)}>
          {open ? 'أخفِ المسار' : 'المسار إلى الإجراء'}
        </button>
      </div>

      {open && (
        <ol className="mt-2 space-y-1 text-[11px] border-t border-line pt-2">
          {drill.chain.map((c, i) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2">
              <span className="text-muted">{i + 1}.</span>
              {c.href ? (
                <a className="text-accent hover:underline font-bold" href={c.href}>{c.label}</a>
              ) : (
                <span className={c.state === LINK_STATE.missing ? 'text-muted' : 'text-ink font-bold'}>{c.label}</span>
              )}
              {c.hint && <span className="text-muted">— {c.hint}</span>}
              {c.state === LINK_STATE.missing && <span className="text-muted">(حلقةٌ مفقودة)</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
