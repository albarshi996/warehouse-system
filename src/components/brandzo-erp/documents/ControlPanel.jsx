/**
 * لوحة الرقابة/المطابقة — «أداة المقارنة» المدمجة على المستند.
 *
 * تعرض **قيم المستند الصادر** جنبًا إلى جنب مع قائمة تحقّقٍ يطابق بها المدقّق
 * النسخة الماديّة الموقّعة المرفقة، ثم يسجّل النتيجة (مطابق / يوجد اختلاف)
 * موقّعةً بهويّته. القيود ملحق-فقط، وأحدثها هو الحالة.
 *
 * لا تظهر إلا للأنواع التي تُعلن `schema.control` (الوارد · الفوترة · النقل ·
 * المرتجعات · التالف). المنطق كلّه في `control.js` الخالص المُختبَر.
 */
import { useMemo, useState } from 'react';
import {
  controlCompareRows,
  controlChecklist,
  allChecked,
  hasSignedCopy,
  hasPhoto,
  reconciliationVerdict,
} from '../../../services/documents/control.js';
import { addReconciliation } from '../../../services/documents/controlService.js';

function stamp(at) {
  const d = at?.toDate?.();
  return d ? d.toLocaleString('ar-LY-u-nu-latn', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
}

/** شارة نتيجة المطابقة — أخضر للمطابق، أحمر للاختلاف (الأحمر للتحذير فقط). */
function VerdictBadge({ result }) {
  if (!result) return <span className="text-xs text-gray-500">لم يُطابَق بعد</span>;
  const matched = result === 'matched';
  return (
    <span
      className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
        matched ? 'bg-accent/15 border-accent/40 text-accent' : 'bg-brand-red/10 border-brand-red/40 text-red-300'
      }`}
    >
      {matched ? '✓ مطابق' : '⚠️ يوجد اختلاف'}
    </span>
  );
}

export default function ControlPanel({ docId, schema, me, doc, attachments = [], reconciliations = [], onEnsureDoc }) {
  const control = schema?.control;
  const rows = useMemo(() => controlCompareRows(schema, doc), [schema, doc]);
  const items = controlChecklist(schema);
  const verdict = reconciliationVerdict(reconciliations);

  const [checks, setChecks] = useState({});
  const [result, setResult] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  if (!control) return null;

  const signed = hasSignedCopy(attachments);
  const photo = hasPhoto(attachments);
  const readyMatched = allChecked(schema, checks);

  async function submit() {
    if (!result) {
      setMsg({ tone: 'err', text: 'اختر نتيجة المطابقة أولًا.' });
      return;
    }
    if (result === 'matched' && !readyMatched) {
      setMsg({ tone: 'err', text: 'طابِق كل البنود قبل تسجيل «مطابق».' });
      return;
    }
    if (result === 'mismatch' && !note.trim()) {
      setMsg({ tone: 'err', text: 'اكتب وجه الاختلاف.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      let id = docId;
      if (!id && onEnsureDoc) id = await onEnsureDoc();
      if (!id) {
        setMsg({ tone: 'err', text: 'تعذّر حفظ المستند لتسجيل المطابقة.' });
        return;
      }
      await addReconciliation(id, {
        result,
        checklist: checks,
        note,
        compared: rows.map((r) => r.key),
        profile: me,
      });
      setMsg({ tone: 'ok', text: 'سُجّلت المطابقة.' });
      setChecks({});
      setResult('');
      setNote('');
      setTimeout(() => setMsg(null), 3000);
    } catch (e) {
      setMsg({ tone: 'err', text: e.message || 'تعذّر التسجيل.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-chip border border-line rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-base font-bold text-ink">🔍 الرقابة والمطابقة</h2>
        <VerdictBadge result={verdict.result} />
      </div>
      <p className="text-[11px] text-gray-500 mb-3">
        قارِن المستند الصادر بالنسخة الماديّة الموقّعة المرفقة، وسجّل النتيجة باسمك. القيود دائمة لا تُحذف.
      </p>

      {!docId && (
        <p className="text-[11px] text-accent/80 bg-accent/10 border border-accent/30 rounded-lg px-3 py-2 mb-3">
          يُحفظ المستند تلقائيًّا عند تأكيد التحقّق.
        </p>
      )}
      <div>
          {/* دليل: هل أُرفق ما يُطابَق عليه؟ */}
          {control.requireSignedCopy && !signed && (
            <p className="text-xs text-red-300 bg-brand-red/10 border border-brand-red/40 rounded-lg px-3 py-2 mb-3">
              ⚠️ أرفق النسخة الموقّعة من قسم «المرفقات والأدلّة» أعلاه ليُطابَق عليها.
            </p>
          )}
          {control.requirePhotos && !photo && (
            <p className="text-xs text-red-300 bg-brand-red/10 border border-brand-red/40 rounded-lg px-3 py-2 mb-3">
              ⚠️ لا صور مرفقة — المحضر يستوجب دليلًا مصوَّرًا.
            </p>
          )}

          {/* قيم المستند الصادر — يُطابقها المدقّق بالورقة الموقّعة */}
          {rows.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-bold text-ink-2 mb-2">قيم المستند الصادر:</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {rows.map((r) => (
                  <div key={r.key} className="flex justify-between gap-2 bg-surface border border-line rounded-lg px-3 py-1.5">
                    <span className="text-[11px] text-gray-500">{r.label}</span>
                    <span className="text-xs font-bold text-ink">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* قائمة المطابقة */}
          {items.length > 0 && (
            <div className="mb-4 space-y-1.5">
              {items.map((it) => (
                <label key={it.key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-accent"
                    checked={Boolean(checks[it.key])}
                    onChange={(e) => setChecks((c) => ({ ...c, [it.key]: e.target.checked }))}
                  />
                  <span className="text-sm text-ink-2">{it.label}</span>
                </label>
              ))}
            </div>
          )}

          {/* النتيجة */}
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              type="button"
              onClick={() => setResult('matched')}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                result === 'matched' ? 'bg-accent text-white border-accent' : 'border-accent/40 text-accent bg-accent/10 hover:bg-accent/20'
              }`}
            >
              مطابق
            </button>
            <button
              type="button"
              onClick={() => setResult('mismatch')}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                result === 'mismatch' ? 'bg-brand-red text-white border-brand-red' : 'border-brand-red/40 text-red-300 bg-brand-red/10 hover:bg-brand-red/20'
              }`}
            >
              يوجد اختلاف
            </button>
          </div>

          {result === 'mismatch' && (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="اكتب وجه الاختلاف بدقّة…"
              className="w-full bg-chip border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-gray-500 focus:outline-none focus:border-accent/60 min-h-[64px] resize-y mb-3"
            />
          )}

          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="text-sm font-bold px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {busy ? 'جارٍ التسجيل…' : 'تأكيد التحقّق'}
          </button>

          {msg && (
            <p
              className={`text-xs rounded-lg px-3 py-2 mt-3 border ${
                msg.tone === 'err' ? 'bg-brand-red/10 border-brand-red/40 text-red-300' : 'bg-accent/10 border-accent/30 text-accent'
              }`}
            >
              {msg.text}
            </p>
          )}

          {/* سجلّ المطابقات السابقة */}
          {reconciliations.length > 0 && (
            <div className="mt-4 pt-3 border-t border-line">
              <p className="text-xs font-bold text-ink-2 mb-2">سجلّ المطابقة:</p>
              <ul className="space-y-1.5">
                {[...reconciliations].reverse().map((r) => (
                  <li key={r.id} className="text-[11px] text-gray-500 flex flex-wrap items-center gap-2">
                    <span className={r.result === 'matched' ? 'text-accent font-bold' : 'text-red-300 font-bold'}>
                      {r.result === 'matched' ? '✓ مطابق' : '⚠️ اختلاف'}
                    </span>
                    <span>— {r.byName}</span>
                    {stamp(r.at) && <span>· {stamp(r.at)}</span>}
                    {r.note && <span className="text-ink-2">· {r.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
      </div>
    </section>
  );
}
