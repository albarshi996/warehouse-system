/**
 * شاشة مراجعة الأصناف المعلّقة (I-د).
 *
 * ما تحلّه: الباركود المجهول الذي يمسحه الموظّف ميدانيًّا كان يعيش في
 * `localStorage` جلسةً واحدة ثم يضيع — لا المدير يعلم أنه مرّ، ولا الماستر
 * يتعلّم منه. الآن يصل هنا: يراه المدير بعدد مرّات مسحه ومن رآه أولًا،
 * فيعتمده صنفًا حقيقيًّا في الماستر أو يرفضه بسببٍ موثَّق.
 *
 * كل الأحكام في `pendingModel.js` الخالص المُختبَر؛ هذا عرضٌ وإدخال.
 */
import { useEffect, useMemo, useState } from 'react';
import { listenPending, approvePending, rejectPending } from '../../../services/items/pendingService.js';
import { PENDING_STATES, pendingSummary } from '../../../services/items/pendingModel.js';

/** بطاقة عدّ صغيرة. */
function Tally({ value, label, tone }) {
  return (
    <div className={`rounded-xl border px-4 py-2 text-center ${tone}`}>
      <div className="text-xl font-extrabold leading-tight">{value}</div>
      <div className="text-[11px] font-bold opacity-80">{label}</div>
    </div>
  );
}

export default function PendingItems({ me, onFlash }) {
  const [records, setRecords] = useState([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('pending');
  const [busy, setBusy] = useState(false);
  /** السجلّ المفتوح للاعتماد + مسودّة المدير. */
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    const unsub = listenPending(
      (list) => {
        setRecords(list);
        setError('');
      },
      (err) => setError(err?.message || 'تعذّرت قراءة الأصناف المعلّقة')
    );
    return () => unsub();
  }, []);

  const summary = useMemo(() => pendingSummary(records), [records]);
  const shown = useMemo(
    () =>
      records
        .filter((r) => (filter === 'all' ? true : r.state === filter))
        .sort((a, b) => (b.seenCount || 0) - (a.seenCount || 0)),
    [records, filter]
  );

  function openApprove(rec) {
    setEditing({
      rec,
      draft: {
        sku: '',
        // الاسم المكتوب في الميدان بذرةٌ للمدير — إلا إن كان الباركود نفسه.
        nameAr: rec.name && rec.name !== rec.barcode ? rec.name : '',
        nameEn: '',
        category: '',
        unit: 'piece',
        unitPrice: rec.lastPrice || 0,
      },
    });
  }

  async function doApprove() {
    setBusy(true);
    try {
      const { sku } = await approvePending(editing.rec, editing.draft, me);
      onFlash?.('success', `اعتُمد في الماستر بالكود ${sku} — صار يُستدعى بالباركود فورًا`);
      setEditing(null);
    } catch (e) {
      onFlash?.('error', e.message || 'تعذّر الاعتماد');
    } finally {
      setBusy(false);
    }
  }

  async function doReject(rec) {
    const reason = window.prompt('سبب الرفض (إلزامي — الرفض بلا سبب لا يُوثَّق):');
    if (reason === null) return;
    setBusy(true);
    try {
      await rejectPending(rec, reason, me);
      onFlash?.('success', 'رُفض السجلّ — وبقي أثره');
    } catch (e) {
      onFlash?.('error', e.message || 'تعذّر الرفض');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-bold text-white">⏳ الأصناف المعلّقة</h3>
          <p className="text-xs text-gray-300 mt-1 max-w-2xl leading-relaxed">
            باركودات مُسحت في الميدان ولا يعرفها الماستر. لا توقف العمل ولا تدخل الماستر
            حتى تعتمدها — والمعرّف حتميّ فمسحُ الباركود عشرًا يُنشئ سجلًّا واحدًا بعدّاده.
          </p>
        </div>
        <div className="flex gap-2">
          <Tally value={summary.pending} label="بانتظار المراجعة" tone="bg-amber-500/10 border-amber-500/30 text-amber-300" />
          <Tally value={summary.approved} label="اعتُمد" tone="bg-emerald-500/10 border-emerald-500/30 text-emerald-300" />
          <Tally value={summary.rejected} label="مرفوض" tone="bg-red-500/10 border-red-500/30 text-red-300" />
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-3">
          {error} — تأكّد من نشر قواعد الأمان المحدَّثة (Items_Pending).
        </p>
      )}

      <div className="flex gap-2 mb-3">
        {[
          ['pending', 'بانتظار المراجعة'],
          ['approved', 'المعتمَدة'],
          ['rejected', 'المرفوضة'],
          ['all', 'الكل'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
              filter === key ? 'bg-brand-gold/20 text-brand-gold border border-brand-gold/40' : 'bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">
          {filter === 'pending' ? '✅ لا أصناف معلّقة — كل ما مُسح معروف في الماستر.' : 'لا سجلّات في هذا التصنيف.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-white/10">
                <th className="text-right py-2 px-2">الباركود</th>
                <th className="text-right py-2 px-2">الاسم الميداني</th>
                <th className="py-2 px-2">مرّات المسح</th>
                <th className="py-2 px-2">أول من رآه</th>
                <th className="py-2 px-2">الحالة</th>
                <th className="py-2 px-2">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const st = PENDING_STATES[r.state] || PENDING_STATES.pending;
                return (
                  <tr key={r.id} className="border-b border-white/5">
                    <td className="py-2 px-2 font-mono text-gray-100" dir="ltr">{r.rawBarcode || r.barcode}</td>
                    <td className="py-2 px-2 text-gray-200">
                      {r.name && r.name !== r.barcode ? r.name : <span className="text-gray-500">— بلا اسم</span>}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span className={`font-bold ${(r.seenCount || 0) > 3 ? 'text-brand-gold' : 'text-gray-300'}`}>
                        {r.seenCount || 1}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center text-gray-300">{r.firstSeenByName || '—'}</td>
                    <td className="py-2 px-2 text-center whitespace-nowrap" style={{ color: st.color }}>
                      {st.emoji} {st.label}
                      {r.state === 'approved' && r.approvedSku && (
                        <span className="block text-[10px] text-gray-400">{r.approvedSku}</span>
                      )}
                      {r.state === 'rejected' && r.rejectReason && (
                        <span className="block text-[10px] text-gray-400">{r.rejectReason}</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-center whitespace-nowrap">
                      {r.state === 'pending' ? (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => openApprove(r)}
                            className="rounded-lg bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-50 px-3 py-1 text-white font-bold ml-1"
                          >
                            اعتماد
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => doReject(r)}
                            className="rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 px-3 py-1 text-gray-200 font-bold"
                          >
                            رفض
                          </button>
                        </>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── نموذج الاعتماد ── */}
      {editing && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="text-sm font-bold text-white mb-1">
            اعتماد الباركود <span className="font-mono text-brand-gold" dir="ltr">{editing.rec.rawBarcode || editing.rec.barcode}</span>
          </p>
          <p className="text-[11px] text-gray-400 mb-3">
            الباركود يُضاف تلقائيًّا إلى فهرس الاستدعاء، فيُعرَف بمسحه فور الاعتماد.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              ['sku', 'كود الصنف (SKU) *', 'text'],
              ['nameAr', 'الاسم العربي *', 'text'],
              ['nameEn', 'الاسم الإنجليزي', 'text'],
              ['category', 'التصنيف', 'text'],
              ['unit', 'الوحدة', 'text'],
              ['unitPrice', 'سعر الوحدة (د.ل)', 'number'],
            ].map(([key, label, type]) => (
              <label key={key} className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-gray-300">{label}</span>
                <input
                  type={type}
                  value={editing.draft[key]}
                  onChange={(e) => setEditing((s) => ({ ...s, draft: { ...s.draft, [key]: e.target.value } }))}
                  className="bg-white/10 border border-white/20 rounded-lg text-white text-sm px-3 py-2 focus:outline-none focus:border-brand-gold/50"
                />
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              disabled={busy}
              onClick={doApprove}
              className="rounded-lg bg-brand-red hover:bg-brand-red-dark disabled:opacity-50 px-5 py-2 text-sm font-bold text-white"
            >
              {busy ? '…' : '✅ اعتماد وإضافة للماستر'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-lg bg-white/10 hover:bg-white/20 px-4 py-2 text-sm font-bold text-gray-200"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
