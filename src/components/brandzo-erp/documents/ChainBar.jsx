/**
 * شريط السلسلة والمطابقة الثلاثية (F2).
 *
 * يجيب عن سؤالين لا يجيب عنهما الورق:
 *   1. **أين أنا من الدورة؟** — ما سبق هذا المستند وما تولّد عنه، بأرقامهم
 *      وحالاتهم وروابطهم.
 *   2. **هل تطابق المطلوب والمستلَم والمقبول؟** — المطابقة الثلاثية صنفًا
 *      صنفًا، بحكمٍ مسبَّب لا برأي.
 *
 * كل الحساب في `chain.js` الخالص المُختبَر؛ هذا عرضٌ له فقط.
 */
import { useEffect, useMemo, useState } from 'react';
import { getBasePath } from '../../../services/auth/authService.js';
import { fetchChainDocuments, createNextInChain } from '../../../services/documents/documentsService.js';
import { chainOf, threeWayMatch, nextInChain, MATCH_STATUS, PURCHASE_CHAIN } from '../../../services/documents/chain.js';
import { getSchema } from '../../../services/documents/schemas/index.js';
import { getState } from '../../../services/documents/states.js';

/** بطاقة مستند واحد في الشريط. */
function DocChip({ node, current = false }) {
  const schema = getSchema(node.type);
  const st = node.state ? getState(node.state) : null;
  const href = `${getBasePath()}/dashboard/document?type=${node.type}${node.id ? `&id=${node.id}` : ''}`;
  const body = (
    <>
      <span className="text-[10px] font-bold opacity-70">{schema?.titleAr || node.type}</span>
      <span className="text-xs font-bold">{node.number || 'مسودّة'}</span>
      {st && (
        <span className="text-[10px]" style={{ color: st.color }}>
          {st.emoji} {st.label}
        </span>
      )}
    </>
  );
  const cls = `flex flex-col gap-0.5 rounded-xl px-3 py-2 border min-w-[8.5rem] transition-colors ${
    current
      ? 'bg-brand-gold/15 border-brand-gold/50 text-brand-gold'
      : 'bg-white/5 border-white/15 text-gray-100 hover:bg-white/10'
  }`;
  return current ? <div className={cls}>{body}</div> : <a href={href} className={cls}>{body}</a>;
}

export default function ChainBar({ doc, me, onFlash }) {
  const [related, setRelated] = useState([]);
  const [busy, setBusy] = useState(false);
  const [showMatch, setShowMatch] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!doc?.id) {
      setRelated([]);
      return undefined;
    }
    fetchChainDocuments(doc)
      .then((list) => alive && setRelated(list))
      .catch(() => alive && setRelated([]));
    return () => {
      alive = false;
    };
  }, [doc?.id, doc?.state, doc?.number]);

  const chain = useMemo(() => (doc?.id ? chainOf(doc, related) : null), [doc, related]);

  /** مستندات المطابقة: من السلسلة كلها بما فيها المستند الحالي. */
  const match = useMemo(() => {
    if (!doc?.id) return null;
    const all = [...related, doc];
    const pick = (t) => all.find((d) => d.type === t) || null;
    const po = pick('PO');
    const grn = pick('GRN');
    if (!po && !grn) return null; // لا مطابقة قبل وجود أمر أو استلام
    return threeWayMatch({ po, grn, qc: pick('QC') });
  }, [doc, related]);

  const next = nextInChain(doc?.type);
  const nextSchema = next ? getSchema(next) : null;
  const alreadyDerived = (chain?.after || []).some((a) => a.type === next);
  const canDerive =
    next &&
    nextSchema &&
    ['approved', 'done'].includes(doc?.state) &&
    !alreadyDerived &&
    (me?.role === 'admin' || (nextSchema.roles?.create || []).includes(me?.role));

  async function handleDerive() {
    setBusy(true);
    try {
      const newId = await createNextInChain(doc, me);
      window.location.href = `${getBasePath()}/dashboard/document?type=${next}&id=${newId}`;
    } catch (e) {
      onFlash?.(e.message || 'تعذّر إنشاء المستند التالي.', 'err');
      setBusy(false);
    }
  }

  if (!doc?.id || !PURCHASE_CHAIN.includes(doc.type)) return null;

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
      {/* ── مسار السلسلة ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-brand-gold/80 ml-1">🔗 سلسلة الشراء</span>
        {chain.before.map((n) => (
          <span key={n.id} className="flex items-center gap-2">
            <DocChip node={n} />
            <span className="text-gray-500">←</span>
          </span>
        ))}
        <DocChip node={chain.current} current />
        {chain.after.map((n) => (
          <span key={n.id} className="flex items-center gap-2">
            <span className="text-gray-500">←</span>
            <DocChip node={n} />
          </span>
        ))}

        {canDerive && (
          <button
            type="button"
            onClick={handleDerive}
            disabled={busy}
            className="mr-auto rounded-xl bg-brand-red hover:bg-brand-red-dark disabled:opacity-50 px-4 py-2 text-xs font-bold text-white transition-colors"
          >
            {busy ? '…' : `＋ أنشئ ${nextSchema.titleAr}`}
          </button>
        )}
      </div>

      {next && !alreadyDerived && !['approved', 'done'].includes(doc.state) && (
        <p className="text-[11px] text-gray-400">
          يُنشأ «{nextSchema?.titleAr}» بعد اعتماد هذا المستند — لا يُبنى التزامٌ على ما لم يُعتمد.
        </p>
      )}

      {/* ── المطابقة الثلاثية ── */}
      {match && (
        <div className="border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => setShowMatch((v) => !v)}
            className="w-full flex items-center justify-between gap-3 text-right"
          >
            <span className="text-xs font-bold text-gray-100">
              ⚖️ المطابقة الثلاثية — المطلوب ↔ المستلَم ↔ المقبول
            </span>
            <span className="flex items-center gap-2">
              {match.ok ? (
                <span className="text-[11px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3 py-0.5">
                  ✅ مطابقة تامّة
                </span>
              ) : (
                <span className="text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-full px-3 py-0.5">
                  {match.missingDocs.length
                    ? `ناقص: ${match.missingDocs.join(' · ')}`
                    : `${match.problems.length} فرقًا يحتاج قرارًا`}
                </span>
              )}
              <span className="text-gray-400 text-xs">{showMatch ? '▲' : '▼'}</span>
            </span>
          </button>

          {showMatch && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 border-b border-white/10">
                    <th className="text-right py-1.5 px-2">الصنف</th>
                    <th className="py-1.5 px-2">مطلوب (PO)</th>
                    <th className="py-1.5 px-2">مستلَم (GRN)</th>
                    <th className="py-1.5 px-2">مقبول (QC)</th>
                    <th className="py-1.5 px-2">الفرق</th>
                    <th className="py-1.5 px-2">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {match.rows.map((r) => {
                    const s = MATCH_STATUS[r.status];
                    return (
                      <tr key={r.key} className="border-b border-white/5">
                        <td className="py-1.5 px-2 text-gray-100">{r.description}</td>
                        <td className="py-1.5 px-2 text-center text-gray-200">{r.qtyOrdered}</td>
                        <td className="py-1.5 px-2 text-center text-gray-200">{r.qtyReceived}</td>
                        <td className="py-1.5 px-2 text-center text-gray-200">{r.qtyAccepted}</td>
                        <td className="py-1.5 px-2 text-center" style={{ color: r.varianceReceived ? s.color : undefined }}>
                          {r.varianceReceived > 0 ? `+${r.varianceReceived}` : r.varianceReceived || '—'}
                        </td>
                        <td className="py-1.5 px-2 text-center whitespace-nowrap" style={{ color: s.color }}>
                          {s.emoji} {s.label}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {match.problems.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {match.problems.map((p) => (
                    <li key={p.key} className="text-[11px]" style={{ color: MATCH_STATUS[p.status].color }}>
                      · <b>{p.description}</b>: {p.note}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[10px] text-gray-500 mt-2">
                حدّ التسامح: 2% أو وحدة واحدة (أيّهما أكبر) — لفروق التقريب والوزن.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
