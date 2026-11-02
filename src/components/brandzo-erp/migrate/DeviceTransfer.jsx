/**
 * النقلُ بين الأجهزة (المرحلة ن) — تصديرُ حزمةٍ من قاعدة الجهاز واستيرادُها في
 * آخَر **بمعاينةٍ وكشفِ تعارضٍ قبل أيّ كتابة**، لا دهسًا. غلافُ عرضٍ فوق
 * `deviceTransfer` المُختبَر: التصنيفُ والخطّةُ منطقٌ خالص، وهنا القراءةُ من
 * الباب والكتابةُ إليه والعرض. ثلاثُ طبقات: تصدير · استيرادٌ ومعاينة · تطبيقٌ ونتيجة.
 */
import { useEffect, useMemo, useState } from 'react';
import * as door from '../../../services/_db/index.js';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import {
  buildTransferBundle,
  planTransferImport,
  applyTransferPlan,
  docUpdatedMillis,
  TRANSFER_COLLECTIONS,
} from '../../../services/migrate/deviceTransfer.js';

const VIEWER_ROLES = ['admin', 'warehouse_manager', 'finance_manager'];
const card = 'rounded-xl border border-line bg-surface p-4';
const btn = 'rounded-lg px-3 py-2 text-sm border border-line text-ink bg-chip disabled:opacity-50';
const STATUS_LABEL = { new: 'جديد', update: 'محدَّث (الوارد أحدث)', conflict: 'تعارض', unchanged: 'بلا تغيير' };

const todayStamp = () => {
  try { return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'); } catch { return 'export'; }
};

/** يقرأ مجموعةً من الباب → [{id, data, updatedAt}] — أو [] إن تعذّرت (مجموعةٌ غائبة). */
async function readCollection(path) {
  try {
    const snap = await door.getDocs(door.collection(door.db, path));
    return snap.docs.map((d) => {
      const data = d.data() || {};
      return { id: d.id, data, updatedAt: docUpdatedMillis(data) };
    });
  } catch {
    return [];
  }
}

export default function DeviceTransfer() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { tone, text }
  const [plan, setPlan] = useState(null);
  const [resolutions, setResolutions] = useState({});
  const [report, setReport] = useState(null);

  useEffect(() => {
    const unsub = subscribeAuth(async (u) => {
      setMe(u ? await fetchUserProfile(u) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  async function exportBundle() {
    setBusy(true);
    setMsg(null);
    try {
      const collections = {};
      for (const path of TRANSFER_COLLECTIONS) {
        const docs = await readCollection(path);
        if (docs.length) collections[path] = docs;
      }
      const bundle = buildTransferBundle(collections, { device: me?.name || me?.email || 'جهاز', exportedAt: Date.now() });
      const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `BHOME-transfer-${todayStamp()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setMsg({ tone: 'ok', text: `صُدّرت حزمةٌ بـ${bundle.docCount} مستندًا من ${Object.keys(collections).length} مجموعة.` });
    } catch (e) {
      setMsg({ tone: 'warn', text: 'تعذّر التصدير: ' + (e?.message || '') });
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file) {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    setReport(null);
    try {
      const bundle = JSON.parse(await file.text());
      if (!bundle || typeof bundle.collections !== 'object') throw new Error('ملفٌّ ليس حزمةَ نقلٍ صالحة.');
      const localByCollection = {};
      for (const path of Object.keys(bundle.collections)) {
        const docs = await readCollection(path);
        localByCollection[path] = new Map(docs.map((d) => [d.id, { data: d.data, updatedAt: d.updatedAt }]));
      }
      const p = planTransferImport(bundle, localByCollection);
      setPlan(p);
      setResolutions({});
      setMsg({ tone: 'ok', text: `معاينةٌ من «${p.device || 'جهاز'}»: ${p.summary.total} مستندًا.` });
    } catch (e) {
      setPlan(null);
      setMsg({ tone: 'warn', text: 'تعذّرت قراءةُ الحزمة: ' + (e?.message || '') });
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!plan) return;
    setBusy(true);
    setMsg(null);
    try {
      const { ops, report: rep } = applyTransferPlan(plan, { resolutions });
      // كتابةٌ دفعةً دفعةً عبر الباب (نظيرُ importDump) — دهسٌ مقصودٌ لِما اختير فقط.
      for (let i = 0; i < ops.length; i += 400) {
        const batch = door.writeBatch();
        for (const o of ops.slice(i, i + 400)) batch.set(door.doc(door.db, o.collectionPath, o.id), o.data);
        await batch.commit();
      }
      setReport(rep);
      setMsg({ tone: 'ok', text: `طُبّقت الحزمة: ${rep.applied} مستندًا (${ops.length} كتابة).` });
      setPlan(null);
    } catch (e) {
      setMsg({ tone: 'warn', text: 'تعذّر التطبيق: ' + (e?.message || '') });
    } finally {
      setBusy(false);
    }
  }

  const resolvable = useMemo(
    () => (plan?.items || []).filter((i) => i.status === 'update' || i.status === 'conflict'),
    [plan]
  );
  const setRes = (key, val) => setResolutions((r) => ({ ...r, [key]: val }));
  const resOf = (it) => resolutions[it.key] || (it.status === 'update' ? 'take' : 'keep');

  if (!ready) return <p className="text-sm text-ink-2">جارٍ التحقّق…</p>;
  if (!me) return <p className="text-sm text-ink-2">سجّل الدخول أوّلًا.</p>;
  if (!VIEWER_ROLES.includes(me.role)) {
    return <p className="text-sm text-ink-2">النقلُ بين الأجهزة محصورٌ بالمديرَين والمدير الماليّ.</p>;
  }

  return (
    <div className="space-y-5">
      {msg && (
        <div className={`text-sm rounded-lg px-3 py-2 ${msg.tone === 'warn' ? 'text-brand-red' : 'text-ink'} bg-chip border border-line`}>
          {msg.text}
        </div>
      )}

      {/* ═══ الطبقة ١: تصدير ═══ */}
      <section className={card}>
        <h2 className="text-base font-bold text-ink mb-1">تصديرُ حزمةٍ من هذا الجهاز</h2>
        <p className="text-sm text-ink-2 mb-3">
          تُقرأ بياناتُ المحلّ التشغيليّة (مستندات · أصناف · محلّات · أرصدة · دفتر · خزينة · ذمم) إلى ملفٍّ واحد — بروابطها كاملةً.
        </p>
        <button className={btn} onClick={exportBundle} disabled={busy}>تصديرُ الحزمة (JSON)</button>
      </section>

      {/* ═══ الطبقة ٢: استيرادٌ ومعاينة ═══ */}
      <section className={card}>
        <h2 className="text-base font-bold text-ink mb-1">استيرادُ حزمةٍ من جهازٍ آخر</h2>
        <p className="text-sm text-ink-2 mb-3">
          تُعرَض معاينةٌ قبل أيّ كتابة: جديدٌ يُضاف · محدَّثٌ (الوارد أحدث) يُؤخَذ · تعارضٌ يبقى محلّيًّا حتّى تقرّر. لا دهسَ أعمى.
        </p>
        <input type="file" accept="application/json,.json" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} className="text-sm text-ink" />
      </section>

      {plan && (
        <section className={card}>
          <h2 className="text-base font-bold text-ink mb-3">المعاينة {plan.device ? `— من «${plan.device}»` : ''}</h2>
          <div className="grid gap-3 sm:grid-cols-4 text-sm mb-4">
            {[
              ['جديد', plan.summary.new],
              ['محدَّث', plan.summary.update],
              ['تعارض', plan.summary.conflict],
              ['بلا تغيير', plan.summary.unchanged],
            ].map(([label, n]) => (
              <div key={label} className="rounded-lg bg-chip border border-line p-3">
                <div className="text-ink-2 text-xs mb-1">{label}</div>
                <div className="text-ink text-lg">{n}</div>
              </div>
            ))}
          </div>

          {resolvable.length > 0 && (
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-ink-2 text-xs border-b border-line">
                    {['المجموعة', 'المعرّف', 'الحالة', 'القرار'].map((h) => (
                      <th key={h} className="text-right font-bold py-2 px-2 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resolvable.slice(0, 200).map((it) => (
                    <tr key={it.key} className="border-b border-line/60">
                      <td className="py-2 px-2 text-ink-2">{it.path}</td>
                      <td className="py-2 px-2 text-ink">{it.id}</td>
                      <td className={`py-2 px-2 ${it.status === 'conflict' ? 'text-brand-red' : 'text-ink'}`}>
                        {STATUS_LABEL[it.status]}{it.appendOnly && it.status === 'conflict' ? ' (ملحق-فقط: محميّ)' : ''}
                      </td>
                      <td className="py-2 px-2">
                        <select
                          className="bg-surface border border-line rounded px-2 py-1 text-xs text-ink"
                          value={resOf(it)}
                          onChange={(e) => setRes(it.key, e.target.value)}
                          disabled={it.appendOnly && it.status === 'conflict'}
                        >
                          <option value="keep">أبقِ المحلّيّ</option>
                          <option value="take">خُذ الوارد</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {resolvable.length > 200 && (
                <p className="text-xs text-ink-2 mt-2">تُعرَض أوّلُ ٢٠٠ من {resolvable.length} — والتطبيقُ يشمل الكلّ بقراره الافتراضيّ.</p>
              )}
            </div>
          )}

          <button className={btn} onClick={apply} disabled={busy || plan.summary.total === 0}>
            تطبيقُ الحزمة على هذا الجهاز
          </button>
        </section>
      )}

      {report && (
        <section className={card}>
          <h2 className="text-base font-bold text-ink mb-3">نتيجةُ النقل</h2>
          <ul className="text-sm text-ink space-y-1">
            <li>أُضيف جديدًا: {report.added}</li>
            <li>حُدِّث: {report.updated}</li>
            <li>تعارضاتٌ أُخذ فيها الوارد: {report.conflictsTaken}</li>
            <li>تعارضاتٌ أُبقي فيها المحلّيّ: {report.conflictsKept}</li>
            {report.appendOnlyBlocked > 0 && <li className="text-brand-red">ملحق-فقطُ محميٌّ لم يُدهَس: {report.appendOnlyBlocked} — راجِعْها يدويًّا</li>}
            <li className="text-ink-2">بلا تغيير (مكرّر): {report.unchanged}</li>
          </ul>
        </section>
      )}
    </div>
  );
}
