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
import { fetchChainDocuments, createNextInChain, createCombinedInChain } from '../../../services/documents/documentsService.js';
import { fetchDocumentRelationshipNeighborhood } from '../../../services/documents/documentRelationsService.js';
import { chainOf, threeWayMatch, derivationTargets, MATCH_STATUS, fefoViolations, gateVerdict, adjustmentVerdict, creditNoteVerdict } from '../../../services/documents/chain.js';
import { listenBalances } from '../../../services/balances/balancesService.js';
import { getSchema } from '../../../services/documents/schemas/index.js';
import DocumentRelationshipMap from './DocumentRelationshipMap.jsx';
import PartialDerivationPanel from './PartialDerivationPanel.jsx';
import { partialDerivationPlan } from '../../../services/documentFlow.js';
import { documentLineProgress, lineOutcomes } from '../../../services/documentLineProgress.js';

/**
 * رقمٌ يُفتح ما وراءه (SAP-9 · يسدّ ف‑٢١).
 *
 * §15.1 ‹400›: من أمر الشراء يفتح المستخدم تفاصيل «١٠٠» والاستلامات، و«٩٧»
 * والتخزين، و«٣» ومحضر الرفض. فالرقم الذي لا يُفتح ما وراءه يترك الموظّف
 * يسأل بالهاتف — ويُنشئ مستندًا من جديد حين لا يجد جوابًا.
 *
 * وما لا مصدر له يبقى نصًّا لا زرًّا: زرٌّ لا يفعل شيئًا أسوأ من لا زرّ.
 */
function DrillNumber({ value, group, basePath, tone }) {
  const docs = group?.documents ?? [];
  if (!value) return <span className="text-ink-2">—</span>;
  if (!docs.length) return <span style={{ color: tone }}>{value}</span>;
  const title = docs.map((d) => `${d.documentNumber || d.documentId}: ${d.qty}`).join(' · ');
  return (
    <span className="inline-flex items-center gap-1" title={title}>
      <a
        href={`${basePath}?type=${docs[0].documentType}&id=${docs[0].documentId}`}
        className="font-bold underline decoration-dotted underline-offset-4"
        style={{ color: tone || 'var(--accent, #714B67)' }}
      >
        {value}
      </a>
      {docs.length > 1 && <span className="text-[10px] text-ink-2">({docs.length})</span>}
    </span>
  );
}

export default function ChainBar({ doc, me, onFlash }) {
  const [related, setRelated] = useState([]);
  const [relationshipData, setRelationshipData] = useState({ relations: [], documents: [], storedAvailable: true });
  const [busy, setBusy] = useState(false);
  /** نوع الوجهة التي فُتحت لها لوحة الكميات — واحدة في كل مرّة. */
  const [partialFor, setPartialFor] = useState(null);
  const [showMatch, setShowMatch] = useState(false);
  /** أرصدة المخزن — تُجلب لقوائم السحب وحدها (حارس FEFO يحتاجها). */
  const [balances, setBalances] = useState([]);

  useEffect(() => {
    if (doc?.type !== 'PICK') return undefined;
    const unsub = listenBalances(setBalances, () => setBalances([]));
    return () => unsub();
  }, [doc?.type]);

  useEffect(() => {
    let alive = true;
    if (!doc?.id) {
      setRelated([]);
      setRelationshipData({ relations: [], documents: [], storedAvailable: true });
      return undefined;
    }
    setRelationshipData({ relations: [], documents: [doc], storedAvailable: true });
    (async () => {
      let list = [];
      try {
        list = await fetchChainDocuments(doc);
      } catch {
        list = [];
      }
      if (!alive) return;
      setRelated(list);
      try {
        const relationshipMap = await fetchDocumentRelationshipNeighborhood(doc, list);
        if (alive) setRelationshipData(relationshipMap);
      } catch {
        if (alive) setRelationshipData({ relations: [], documents: [doc, ...list], storedAvailable: false });
      }
    })();
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

  /** 🥇 حارس FEFO — قوائم السحب وحدها. */
  const fefo = useMemo(
    () => (doc?.type === 'PICK' && balances.length ? fefoViolations(doc, balances) : []),
    [doc, balances]
  );

  /** 🏅 حارس البوابة — تصاريح الخروج وحدها، مقيسةً بإذن التسليم المرتبط. */
  const gate = useMemo(() => {
    if (doc?.type !== 'GP') return null;
    const dn = related.find((d) => d.type === 'DN') || null;
    return gateVerdict(doc, dn);
  }, [doc, related]);

  /** 🔒 حارس التسوية — سندات التسوية، مقيسةً بمحضر الجرد المرتبط. */
  const adj = useMemo(() => {
    if (doc?.type !== 'ADJ') return null;
    const cc = related.find((d) => d.type === 'CC') || null;
    return adjustmentVerdict(doc, cc);
  }, [doc, related]);

  /** ⚖️ حارس الإشعار الدائن — مقيسًا بإشعار الإرجاع المرتبط. */
  const credit = useMemo(() => {
    if (doc?.type !== 'CN') return null;
    const ret = related.find((d) => d.type === 'RET') || null;
    return creditNoteVerdict(doc, ret);
  }, [doc, related]);

  /**
   * وجهات الاشتقاق — قد تكون أكثر من واحدة (إذن التسليم يتفرّع: تصريح وفاتورة).
   * لكلٍّ زرُّها، ولا يظهر إلا لمن يملك إنشاءه وبعد الاعتماد وما لم يُشتقّ سلفًا.
   */
  const targets = useMemo(() => {
    if (!doc?.type) return [];
    return derivationTargets(doc.type)
      .map((t) => ({ type: t, schema: getSchema(t) }))
      .filter((t) => t.schema)
      .map((t) => {
        const alreadyDerived = (chain?.after || []).some((a) => a.type === t.type);
        /**
         * CC-204: حيث تُعرف خريطة الكميات، **الرصيد المفتوح هو الحَكَم** لا وجود
         * طفلٍ سابق — أمر شراء بمئة يقبل استلامًا بستّين ثمّ آخر بأربعين، ويُغلق
         * عند الصفر وحده. وحيث لا تُعرف الخريطة تبقى قاعدة الطفل الواحد كما كانت.
         */
        let plan = null;
        try {
          plan = partialDerivationPlan(doc, t.type, relationshipData.relations, relationshipData.documents);
        } catch {
          plan = null;
        }
        const partial = Boolean(plan?.supported);
        return {
          ...t,
          alreadyDerived,
          partial,
          openQty: partial ? plan.totalOpen : null,
          exhausted: partial ? plan.totalOpen <= 0 : alreadyDerived,
          canCreate: me?.role === 'admin' || (t.schema.roles?.create || []).includes(me?.role),
        };
      });
  }, [doc, chain, me, relationshipData]);

  /**
   * تقدّم الأسطر ونتائجها — **مصدرٌ واحد للحفر** (SAP-9).
   * الجدول الثلاثيّ يُجمّع بالصنف عبر ثلاثة مستندات، وهذا يُفصّل ما صار
   * لكلّ سطر ومن أيّ مستند. فلا يُنشأ جدولٌ ثانٍ: الأرقام تبقى مكانها
   * وتُغنى بالحفر من هنا.
   */
  const outcomesBySku = useMemo(() => {
    const progress = documentLineProgress(doc, relationshipData.relations, relationshipData.documents);
    const map = new Map();
    for (const line of progress.lines) {
      const key = line.sku || line.barcode || line.description;
      if (!key) continue;
      const out = lineOutcomes(line);
      const prev = map.get(key);
      // سطران بالصنف نفسه: تُضمّ مصادرهما ولا يُسقَط أحدهما.
      if (!prev) map.set(key, out);
      else {
        prev.executed.documents.push(...out.executed.documents);
        prev.accepted.documents.push(...out.accepted.documents);
        prev.rejected.documents.push(...out.rejected.documents);
        prev.open += out.open;
      }
    }
    return map;
  }, [doc, relationshipData]);

  const docBase = `${getBasePath()}/dashboard/document`;
  const approvedOrDone = ['approved', 'done'].includes(doc?.state);
  const derivable = targets.filter((t) => !t.exhausted && t.canCreate && approvedOrDone);
  const pending = targets.filter((t) => !t.exhausted && !approvedOrDone);
  const openPanel = derivable.find((t) => t.type === partialFor) || null;

  async function handleDerive(toType, requestedByLine = null, extraSources = []) {
    setBusy(true);
    try {
      // المصدر الحاليّ وحده يُجزَّأ سطرًا سطرًا؛ المضمومون يدخلون بكامل المفتوح.
      const newId = extraSources.length
        ? await createCombinedInChain([doc, ...extraSources], me, toType, {
          requestedByLineBySource: requestedByLine ? { [doc.id]: requestedByLine } : null,
        })
        : await createNextInChain(doc, me, toType, { requestedByLine });
      window.location.href = `${getBasePath()}/dashboard/document?type=${toType}&id=${newId}`;
    } catch (e) {
      onFlash?.(e.message || 'تعذّر إنشاء المستند التالي.', 'err');
      setBusy(false);
      setPartialFor(null);
    }
  }

  if (!doc?.id) return null;

  return (
    <div className="bg-chip border border-line rounded-2xl p-4 space-y-3">
      <DocumentRelationshipMap
        current={doc}
        relations={relationshipData.relations}
        documents={relationshipData.documents}
        storedAvailable={relationshipData.storedAvailable}
        basePath={`${getBasePath()}/dashboard/document`}
      />

      {derivable.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {derivable.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => setPartialFor(partialFor === t.type ? null : t.type)}
              disabled={busy}
              aria-expanded={partialFor === t.type}
              className="rounded-xl bg-accent hover:opacity-90 disabled:opacity-50 px-4 py-2 text-xs font-bold text-white transition-colors"
            >
              {busy && partialFor === t.type ? 'جارٍ الإنشاء…' : `أنشئ ${t.schema.titleAr}`}
              {/* المتبقّي يظهر متى صار الاشتقاق جزئيًّا فعلًا — لا على أوّل مرّة. */}
              {t.partial && t.alreadyDerived ? ` — متبقٍّ ${t.openQty}` : ''}
            </button>
          ))}
        </div>
      )}

      {openPanel && (
        <PartialDerivationPanel
          source={doc}
          targetType={openPanel.type}
          title={openPanel.schema.titleAr}
          relations={relationshipData.relations}
          documents={relationshipData.documents}
          busy={busy}
          onConfirm={(requestedByLine, extraSources) => handleDerive(openPanel.type, requestedByLine, extraSources || [])}
          onCancel={() => setPartialFor(null)}
        />
      )}

      {pending.length > 0 && (
        <p className="text-[11px] text-muted">
          يُنشأ {pending.map((t) => `«${t.schema.titleAr}»`).join(' و')} بعد اعتماد هذا المستند — لا يُبنى التزامٌ على ما لم يُعتمد.
        </p>
      )}

      {/* ── 🥇 حارس FEFO ── */}
      {fefo.length > 0 && (
        <div className="border-t border-line pt-3">
          <p className="text-xs font-bold text-amber-300 mb-1.5">
            🥇 مخالفة FEFO — {fefo.length} بندًا سُحب من تشغيلةٍ أبعدَ انتهاءً
          </p>
          <ul className="space-y-1">
            {fefo.map((v) => (
              <li key={v.key} className="text-[11px] text-amber-200/90">
                · <b>{v.description}</b>: {v.message}
                {v.earliestBatch && <span className="text-muted"> (تشغيلة {v.earliestBatch})</span>}
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-gray-500 mt-1.5">
            القاعدة: الأقرب انتهاءً يخرج أولًا — وإلا تراكم القديم حتى يُتلف. صحّح البنود أو وثّق سبب المخالفة.
          </p>
        </div>
      )}

      {/* ── 🏅 حارس البوابة ── */}
      {gate && (
        <div className="border-t border-line pt-3">
          {gate.ok ? (
            <p className="text-xs font-bold text-emerald-300">
              🏅 مطابق لإذن التسليم — الخروج مأذون به
            </p>
          ) : (
            <>
              <p className="text-xs font-bold text-red-300 mb-1.5">🏅 حارس البوابة يمنع: لا خروج بلا إذن مطابق</p>
              <ul className="space-y-1">
                {gate.problems.map((p) => (
                  <li key={p} className="text-[11px] text-red-200/90">· {p}</li>
                ))}
              </ul>
            </>
          )}
          {gate.warnings.length > 0 && (
            <ul className="space-y-1 mt-1.5">
              {gate.warnings.map((w) => (
                <li key={w} className="text-[11px] text-amber-200/80">⚠️ {w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── 🔒 حارس التسوية / ⚖️ حارس الإشعار الدائن ── */}
      {[
        { v: adj, okMsg: '🔒 مطابق لمحضر الجرد — التسوية مسنَدة', badMsg: '🔒 حارس التسوية يمنع: لا تسوية بلا جردٍ مصادَق' },
        { v: credit, okMsg: '⚖️ مطابق لإشعار الإرجاع — الخصم مسنَد', badMsg: '⚖️ حارس الإشعار الدائن يمنع: لا خصم بلا مرتجعٍ معتمَد' },
      ].map(({ v, okMsg, badMsg }, i) =>
        v ? (
          <div key={i} className="border-t border-line pt-3">
            {v.ok ? (
              <p className="text-xs font-bold text-emerald-300">{okMsg}</p>
            ) : (
              <>
                <p className="text-xs font-bold text-red-300 mb-1.5">{badMsg}</p>
                <ul className="space-y-1">
                  {v.problems.map((p) => (
                    <li key={p} className="text-[11px] text-red-200/90">· {p}</li>
                  ))}
                </ul>
              </>
            )}
            {v.warnings.length > 0 && (
              <ul className="space-y-1 mt-1.5">
                {v.warnings.map((w) => (
                  <li key={w} className="text-[11px] text-amber-200/80">⚠️ {w}</li>
                ))}
              </ul>
            )}
          </div>
        ) : null
      )}

      {/* ── المطابقة الثلاثية ── */}
      {match && (
        <div className="border-t border-line pt-3">
          <button
            type="button"
            onClick={() => setShowMatch((v) => !v)}
            className="w-full flex items-center justify-between gap-3 text-right"
          >
            <span className="text-xs font-bold text-ink-2">
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
              <span className="text-muted text-xs">{showMatch ? '▲' : '▼'}</span>
            </span>
          </button>

          {showMatch && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted border-b border-line">
                    <th className="text-right py-1.5 px-2">الصنف</th>
                    <th className="py-1.5 px-2">مطلوب (PO)</th>
                    <th className="py-1.5 px-2">مستلَم (GRN)</th>
                    <th className="py-1.5 px-2">مقبول (QC)</th>
                    <th className="py-1.5 px-2">مرفوض</th>
                    <th className="py-1.5 px-2">مفتوح</th>
                    <th className="py-1.5 px-2">الفرق</th>
                    <th className="py-1.5 px-2">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {match.rows.map((r) => {
                    const s = MATCH_STATUS[r.status];
                    const out = outcomesBySku.get(r.key) || outcomesBySku.get(r.description);
                    return (
                      <tr key={r.key} className="border-b border-line">
                        <td className="py-1.5 px-2 text-ink-2">{r.description}</td>
                        <td className="py-1.5 px-2 text-center text-ink-2">{r.qtyOrdered}</td>
                        {/* الأرقام تُفتح على مستنداتها (SAP-9 · §15.1 ‹400›) */}
                        <td className="py-1.5 px-2 text-center">
                          <DrillNumber value={r.qtyReceived} group={out?.executed} basePath={docBase} />
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <DrillNumber value={r.qtyAccepted} group={out?.accepted} basePath={docBase} />
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <DrillNumber value={out?.rejected?.qty || 0} group={out?.rejected} basePath={docBase} tone="#b02a37" />
                        </td>
                        <td className="py-1.5 px-2 text-center text-ink-2" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {out?.open || '—'}
                        </td>
                        <td className="py-1.5 px-2 text-center" style={{ color: r.varianceReceived ? s.color : undefined }}>
                          {r.varianceReceived > 0 ? `+${r.varianceReceived}` : r.varianceReceived || '—'}
                        </td>
                        <td className="py-1.5 px-2 text-center whitespace-nowrap" style={{ color: s.color }}>
                          {/* نقطةٌ ملوّنة لا إيموجي — §3-٧ ‹46› */}
                          <span className="inline-block w-1.5 h-1.5 rounded-full align-middle ml-1" style={{ background: 'currentColor' }} />
                          {s.label}
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
