/**
 * «مهامي» — شاشة تنفيذ التخزين والسحب على جهاز العامل.
 *
 * قرار المالك: **العامل يختار الرفّ بنفسه**. فالمحرّك يقترح ويُعلّل، والعامل
 * يقرّر. والرفّ المرفوض **لا يُمنع** بل يمرّ بسببٍ إلزاميّ يُقيَّد في التدقيق.
 *
 * التصميم للهاتف أوّلًا: بندٌ واحدٌ أمام العين، وأربع خانات مسحٍ كبيرة، وزرٌّ
 * واحد. عاملٌ يحمل طردًا بيدٍ وهاتفًا بالأخرى لا يتصفّح جداول.
 */
import { useEffect, useMemo, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import Badge from '../../odoo/Badge.jsx';
import { listenLocations } from '../../../services/locations/locationsService.js';
import { listenBalances } from '../../../services/balances/balancesService.js';
import { suggestLocations } from '../../../services/locations/putawaySuggest.js';
import { applyScan, scanVerdict } from '../../../services/locations/scanGate.js';
import { finishVerdict, lineProgress, taskProgress } from '../../../services/labor/laborModel.js';

const EMPTY_SCAN = { item: '', batch: '', bin: '', qty: '', note: '' };

export default function WorkerTaskPanel({ task, onSaveLines, onFinish }) {
  const [lines, setLines] = useState(() => task?.lines || []);
  const [active, setActive] = useState(0);
  const [scan, setScan] = useState(EMPTY_SCAN);
  const [locations, setLocations] = useState([]);
  const [balances, setBalances] = useState([]);
  const [problems, setProblems] = useState([]);
  const [note, setNote] = useState('');

  useEffect(() => setLines(task?.lines || []), [task?.id, task?.lines]);
  useEffect(() => listenLocations(setLocations, () => setLocations([])), []);
  useEffect(() => listenBalances(setBalances, () => setBalances([])), []);

  const line = lines[active];
  const progress = useMemo(() => taskProgress(lines), [lines]);
  const lp = useMemo(() => (line ? lineProgress(line) : null), [line]);

  const suggestion = useMemo(() => {
    if (!line) return { candidates: [], rejected: [], problem: '' };
    return suggestLocations({
      line: { ...line, qty: lp?.remaining ?? 0 },
      locations,
      balances,
      warehouse: task?.warehouse,
    });
  }, [line, lp, locations, balances, task?.warehouse]);

  if (!line) {
    return <p className="text-sm text-ink-2">لا بنود في هذه المهمّة.</p>;
  }

  function submit() {
    const verdict = scanVerdict({
      line,
      scannedItem: scan.item,
      scannedBatch: scan.batch,
      scannedBin: scan.bin,
      qty: Number(scan.qty),
      locations,
      balances,
      overrideNote: scan.note,
    });
    setProblems(verdict.problems);
    if (!verdict.ok) return;

    const next = lines.map((l, i) => (i === active ? applyScan(l, verdict.entry) : l));
    setLines(next);
    setScan(EMPTY_SCAN);
    setNote(verdict.entry.override ? 'سُجّل التجاوز في سجلّ التدقيق.' : '');
    onSaveLines?.(next, verdict.entry);

    // انتقالٌ تلقائيّ للبند التالي غير المكتمل — العامل لا يبحث.
    const doneNow = lineProgress(next[active]);
    if (doneNow.remaining === 0) {
      const nextOpen = next.findIndex((l) => lineProgress(l).remaining > 0);
      if (nextOpen >= 0) setActive(nextOpen);
    }
  }

  function finish() {
    const v = finishVerdict(lines);
    onFinish?.(v, lines);
    setNote(v.message || 'أُنجزت المهمّة كاملة.');
  }

  return (
    <div dir="rtl">
      {/* شريط التقدّم — كم أُنجز وكم بقي، بلا اعتمادٍ على اللون وحده */}
      <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
        <strong className="text-ink">{progress.doneLines}/{progress.lines} بندًا</strong>
        <span className="text-ink-2">أُنجز {progress.totalDone} من {progress.totalRequired}</span>
        {progress.remaining > 0 && <Badge tone="warning">يبقى {progress.remaining}</Badge>}
        {progress.complete && <Badge tone="success">مكتملة</Badge>}
      </div>

      {/* شريط البنود */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
        {lines.map((l, i) => {
          const p = lineProgress(l);
          return (
            <button
              key={i}
              type="button"
              onClick={() => { setActive(i); setProblems([]); }}
              className="px-3 py-1.5 rounded-lg border text-xs whitespace-nowrap"
              style={{
                borderColor: i === active ? 'var(--o-brand-primary, #714B67)' : 'var(--o-border-color, #ddd)',
                fontWeight: i === active ? 700 : 500,
              }}
            >
              {l.sku} · {p.done}/{p.required}
              {p.state === 'done' && ' ✓'}
            </button>
          );
        })}
      </div>

      {/* البند الحاليّ */}
      <div className="o_ds_card o_ds_pad mb-3">
        <div className="flex flex-wrap items-baseline gap-2 mb-1">
          <strong className="text-lg text-ink" style={{ direction: 'ltr' }}>{line.sku}</strong>
          <span className="text-sm text-ink-2">{line.description}</span>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-ink-2">
          {line.batch && <span>الدفعة: <strong>{line.batch}</strong></span>}
          {line.expiry && <span>الصلاحية: <strong style={{ direction: 'ltr', display: 'inline-block' }}>{line.expiry}</strong></span>}
          <span>المطلوب: <strong>{lp.required}</strong></span>
          <span>المتبقّي: <strong>{lp.remaining}</strong></span>
        </div>
      </div>

      {/* الاقتراح — ولكلّ مرشّحٍ سببه والسعة قبل/بعد */}
      <div className="o_ds_card o_ds_pad mb-3">
        <h4 className="text-sm font-bold text-ink mb-2">أين يُخزَّن؟ — اقتراح النظام</h4>

        {suggestion.problem && <p className="text-xs text-ink-2 mb-2">{suggestion.problem}</p>}

        {suggestion.candidates.map((c, i) => (
          <button
            key={c.code}
            type="button"
            onClick={() => setScan((s) => ({ ...s, bin: c.code }))}
            className="w-full text-right border rounded-lg p-2 mb-2"
            style={{ borderColor: scan.bin === c.code ? 'var(--o-brand-primary, #714B67)' : 'var(--o-border-color, #ddd)' }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-2">{i + 1}</span>
              <strong style={{ direction: 'ltr' }}>{c.shortLabel}</strong>
              <span className="text-xs text-ink-2" style={{ direction: 'ltr' }}>{c.code}</span>
              {c.capacityAfter?.capacity != null && (
                <span className="text-xs text-ink-2">
                  السعة: {c.capacityBefore.used}/{c.capacityBefore.capacity} ← {c.capacityAfter.used}/{c.capacityAfter.capacity}
                </span>
              )}
            </div>
            <ul className="text-[11px] text-ink-2 mt-1 mr-4 leading-relaxed" style={{ listStyle: 'disc' }}>
              {c.reasons.map((r, j) => <li key={j}>{r}</li>)}
            </ul>
          </button>
        ))}

        {suggestion.rejected.length > 0 && (
          <details className="text-xs text-ink-2 mt-1">
            <summary>مواقع غير مقترَحة ({suggestion.rejected.length}) — ولماذا</summary>
            <ul className="mt-1 mr-4 leading-relaxed" style={{ listStyle: 'disc' }}>
              {suggestion.rejected.map((r) => (
                <li key={r.code}><span style={{ direction: 'ltr' }}>{r.code}</span> — {r.reason}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* المسح الرباعيّ */}
      <div className="o_ds_card o_ds_pad mb-3">
        <h4 className="text-sm font-bold text-ink mb-2">امسح</h4>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <Field label="باركود الموقع" value={scan.bin} ltr onChange={(v) => setScan({ ...scan, bin: v })} />
          <Field label="باركود الصنف" value={scan.item} ltr onChange={(v) => setScan({ ...scan, item: v })} />
          <Field label="الدفعة" value={scan.batch} onChange={(v) => setScan({ ...scan, batch: v })} />
          <Field label="الكمّيّة" value={scan.qty} type="number" onChange={(v) => setScan({ ...scan, qty: v })} />
        </div>

        {problems.some((p) => p.includes('إلزاميّ')) && (
          <div className="mt-2">
            <Field label="سبب التخزين رغم التحذير (إلزاميّ)" value={scan.note} onChange={(v) => setScan({ ...scan, note: v })} />
          </div>
        )}

        {problems.length > 0 && (
          <div className="o_alert danger mt-2">
            <ul className="text-xs leading-relaxed mr-4" style={{ listStyle: 'disc' }}>
              {problems.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
        )}

        {note && <div className="o_alert success mt-2 text-xs">{note}</div>}

        <div className="o_form_actions mt-3">
          <button type="button" className="btn btn-primary" onClick={submit}>
            <Icon name="checkCircle" size={15} /> تأكيد المسح
          </button>
          <button type="button" className="btn btn-secondary" onClick={finish}>
            إنهاء المهمّة
          </button>
        </div>
        <p className="text-[11px] text-ink-2 mt-2">
          الرصيد لا يتحرّك إلّا عند إنجاز المستند — والمسح هنا يُسجّل ما وُضع فعلًا وأين.
        </p>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', ltr }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-ink-2 mb-1">{label}</span>
      <input
        type={type}
        className="o_input w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={ltr ? 'امسح أو اكتب' : ''}
        style={{ padding: '8px', fontSize: '15px', ...(ltr ? { direction: 'ltr', textAlign: 'right' } : {}) }}
      />
    </label>
  );
}
