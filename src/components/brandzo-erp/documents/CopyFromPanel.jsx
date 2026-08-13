/**
 * «جلب من مستند سابق» — الشاشة (SAP-5 · يسدّ ف‑١٣).
 * ─────────────────────────────────────────────────────────────────────────
 * تُفتح من مستندٍ **جديد فارغ**: أختار الطرف، فتظهر مستنداته المؤهّلة،
 * فأختار منها وأحدّد الكمّيّات، فيُنشأ المستند محمّلًا.
 *
 * ═══ ولا مسار بياناتٍ ثانٍ ═══
 * الإنشاء يمرّ بـ`createCombinedInChain` نفسها التي يستدعيها «إنشاء مستند
 * لاحق». فالشاشتان اثنتان والخدمة واحدة — ولو كتبتُ لها مسارًا خاصًّا
 * لانفصلت العلاقتان بعد أوّل تعديل.
 *
 * ═══ وغير المؤهّل يُعرض ═══
 * معطّلًا ومعه سببه. لأنّ الإخفاء الصامت يجعل الموظّف يظنّ المستند مفقودًا
 * فيُنشئه من جديد — وهذا أصل الازدواج.
 *
 * ═══ ولا شيء يُكتب قبل «إنهاء» ═══
 * §12.2-٩ ‹308›: تجهيز النموذج ليس حفظًا، ولا أثر لما لم يُحفظ.
 */
import { useEffect, useMemo, useState } from 'react';
import { getBasePath } from '../../../services/auth/authService.js';
import { listenDocumentsByTypes, createCombinedInChain } from '../../../services/documents/documentsService.js';
import { fetchDocumentRelationshipNeighborhood } from '../../../services/documents/documentRelationsService.js';
import { getSchema } from '../../../services/documents/schemas/index.js';
import {
  sourceTypesFor,
  acceptsCopyFrom,
  copyFromCandidates,
  qualifyCandidate,
  mergeSelection,
  partyOf,
} from '../../../services/documents/copyFrom.js';

const btn =
  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

function typeLabel(type) {
  return getSchema(type)?.titleAr || type;
}

export default function CopyFromPanel({ targetType, me, onFlash }) {
  const sourceTypes = useMemo(() => sourceTypesFor(targetType), [targetType]);
  const [open, setOpen] = useState(false);
  const [docs, setDocs] = useState([]);
  const [party, setParty] = useState('');
  const [chosen, setChosen] = useState([]); // معرّفات المصادر المختارة
  const [plans, setPlans] = useState({}); // معرّف → مرشَّحٌ بخطّةٍ دقيقة
  const [qty, setQty] = useState({}); // «معرّف المستند|معرّف السطر» → كمّيّة
  const [busy, setBusy] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);

  useEffect(() => {
    if (!open || !sourceTypes.length) return undefined;
    return listenDocumentsByTypes(sourceTypes, setDocs, 200);
  }, [open, sourceTypes]);

  /** المرشَّحون — تصفيةٌ سريعة بلا شبكة. الأرقام الدقيقة تأتي عند الاختيار. */
  const { eligible, rejected } = useMemo(
    () => copyFromCandidates(targetType, docs, { party }),
    [targetType, docs, party]
  );

  /** الأطراف المتاحة — من المستندات نفسها لا من قائمةٍ ثانية. */
  const parties = useMemo(() => {
    const set = new Set();
    for (const d of docs) {
      const p = partyOf(d);
      if (p) set.add(p);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ar'));
  }, [docs]);

  /**
   * عند اختيار مستند: تُجلب علاقاته الحقيقيّة وتُحسب كمّيّته المفتوحة بدقّة.
   * القائمة مُرشِّح، والجدول هو الحقيقة — فلا تُبنى كمّيّةٌ على تقدير.
   */
  async function toggle(candidate) {
    const id = candidate.document.id;
    if (chosen.includes(id)) {
      setChosen((prev) => prev.filter((x) => x !== id));
      return;
    }
    setChosen((prev) => [...prev, id]);
    if (plans[id]) return;
    setLoadingPlans(true);
    try {
      const hood = await fetchDocumentRelationshipNeighborhood(candidate.document);
      const precise = qualifyCandidate(candidate.document, targetType, {
        party,
        relations: hood?.relations ?? [],
        relatedDocuments: hood?.documents ?? [],
      });
      setPlans((prev) => ({ ...prev, [id]: precise }));
    } catch (e) {
      onFlash?.(e?.message || 'تعذّر قراءة الكمّيّة المفتوحة.', 'err');
      setChosen((prev) => prev.filter((x) => x !== id));
    } finally {
      setLoadingPlans(false);
    }
  }

  const selected = chosen.map((id) => plans[id]).filter((c) => c?.eligible);

  const preview = useMemo(
    () =>
      mergeSelection(
        selected.map((candidate) => ({
          candidate,
          quantities: Object.fromEntries(
            candidate.plan.lines.map((l) => [l.lineId, qty[`${candidate.document.id}|${l.lineId}`]])
          ),
        }))
      ),
    [selected, qty]
  );

  async function finish() {
    if (preview.problems.length) return;
    setBusy(true);
    try {
      const requestedByLineBySource = {};
      for (const source of preview.sources) {
        requestedByLineBySource[source.id] = Object.fromEntries(source.lines.map((l) => [l.lineId, l.qty]));
      }
      const newId = await createCombinedInChain(
        selected.map((c) => c.document),
        me,
        targetType,
        { requestedByLineBySource }
      );
      window.location.href = `${getBasePath()}/dashboard/document?type=${targetType}&id=${newId}`;
    } catch (e) {
      onFlash?.(e?.message || 'تعذّر إنشاء المستند.', 'err');
      setBusy(false);
    }
  }

  if (!acceptsCopyFrom(targetType)) return null;

  if (!open) {
    return (
      <button type="button" className={`${btn} border border-line text-ink hover:bg-chip`} onClick={() => setOpen(true)}>
        جلب من مستند سابق
      </button>
    );
  }

  return (
    <div className="bg-chip border border-line rounded-2xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-bold text-ink text-sm">جلب من مستند سابق</div>
          <div className="text-[11px] text-ink-2">
            المصادر المسموحة: {sourceTypes.map(typeLabel).join(' · ')}
          </div>
        </div>
        <button type="button" className={`${btn} border border-line text-ink hover:bg-surface`} onClick={() => setOpen(false)}>
          إغلاق
        </button>
      </div>

      {/* ١ — الطرف. يُختار أوّلًا فتُعرض مستنداته وحدها (§12.2 ‹300-301›). */}
      <label className="block text-xs text-ink-2">
        الطرف
        <select
          className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          value={party}
          onChange={(e) => {
            setParty(e.target.value);
            setChosen([]);
            setQty({});
          }}
        >
          <option value="">— كلّ الأطراف —</option>
          {parties.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </label>

      {/* ٢ — المستندات المؤهّلة */}
      <div>
        <div className="text-xs font-bold text-ink mb-1">المستندات المؤهّلة ({eligible.length})</div>
        {eligible.length === 0 && <p className="text-xs text-ink-2">لا مستند مؤهّل لهذا الطرف.</p>}
        <div className="space-y-1">
          {eligible.map((c) => (
            <label
              key={c.document.id}
              className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs cursor-pointer"
            >
              <input
                type="checkbox"
                checked={chosen.includes(c.document.id)}
                onChange={() => toggle(c)}
                className="w-4 h-4 accent-[var(--accent,#714B67)]"
              />
              <span className="font-bold text-ink">{c.document.number || c.document.id}</span>
              <span className="text-ink-2">{typeLabel(c.document.type)}</span>
              <span className="text-ink-2 mr-auto">المفتوح: {c.openTotal}</span>
            </label>
          ))}
        </div>
      </div>

      {/* ٣ — غير المؤهّل بسببه: يُعرض ولا يُخفى، فلا يُنشئه أحدٌ من جديد */}
      {rejected.length > 0 && (
        <details>
          <summary className="text-[11px] text-ink-2 cursor-pointer">غير مؤهّل ({rejected.length}) — ولماذا</summary>
          <div className="mt-1 space-y-1">
            {rejected.map((c) => (
              <div key={c.document.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-[11px] opacity-70">
                <span className="font-bold text-ink">{c.document.number || c.document.id}</span>
                <span className="text-ink-2">{c.reason}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ٤ — الأسطر والكمّيّات */}
      {loadingPlans && <p className="text-xs text-ink-2">يقرأ الكمّيّات المفتوحة…</p>}
      {selected.map((c) => (
        <div key={c.document.id} className="rounded-lg border border-line bg-surface p-2">
          <div className="text-xs font-bold text-ink mb-1">{c.document.number || c.document.id}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]" style={{ minWidth: 420 }}>
              <thead>
                <tr className="text-ink-2">
                  <th className="text-right py-1 px-2">السطر</th>
                  <th className="text-center py-1 px-2">المطلوبة</th>
                  <th className="text-center py-1 px-2">المنفَّذة</th>
                  <th className="text-center py-1 px-2">المفتوحة</th>
                  <th className="text-center py-1 px-2">الكمّيّة للجلب</th>
                </tr>
              </thead>
              <tbody>
                {c.plan.lines.map((l) => {
                  const openQty = Math.max(0, l.capacity - l.executed);
                  const key = `${c.document.id}|${l.lineId}`;
                  return (
                    <tr key={l.lineId} className="border-t border-line">
                      <td className="py-1 px-2 text-ink">{l.lineNumber}</td>
                      <td className="py-1 px-2 text-center" style={{ fontVariantNumeric: 'tabular-nums' }}>{l.capacity}</td>
                      <td className="py-1 px-2 text-center" style={{ fontVariantNumeric: 'tabular-nums' }}>{l.executed}</td>
                      <td className="py-1 px-2 text-center" style={{ fontVariantNumeric: 'tabular-nums' }}>{openQty}</td>
                      <td className="py-1 px-2 text-center">
                        {openQty <= 0 ? (
                          <span className="text-ink-2">غير متاح</span>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            max={openQty}
                            value={qty[key] ?? openQty}
                            onChange={(e) => setQty((prev) => ({ ...prev, [key]: e.target.value }))}
                            className="w-20 rounded border border-line bg-surface px-2 py-1 text-center text-ink"
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* ٥ — المشاكل بأرقامها لا بتحذيرٍ مبهم */}
      {selected.length > 0 && preview.problems.length > 0 && (
        <ul className="text-[11px] space-y-0.5" style={{ color: '#b02a37' }}>
          {preview.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3 pt-2 border-t border-line">
        <button
          type="button"
          className={`${btn} text-white`}
          style={{ background: 'var(--accent, #714B67)' }}
          disabled={busy || selected.length === 0 || preview.problems.length > 0}
          onClick={finish}
        >
          {busy ? 'يُنشئ…' : `إنهاء — جلب ${preview.totalDrawn || 0}`}
        </button>
        <span className="text-[11px] text-ink-2">
          لا يُحفظ شيءٌ قبل «إنهاء» — والعلاقة تُكتب مع المستند لا قبله.
        </span>
      </div>
    </div>
  );
}
