/**
 * قوائم الأسعار وتقرير انحرافها (م٣-ج · يسدّ ف‑٣).
 *
 * السعر المكتوب بيدٍ في كلّ فاتورة تسريبٌ صامت: يبيع مندوبٌ بسعر التجزئة لعميل
 * جملة وآخر بالعكس، ولا يظهر الأثر حتّى يُقفل الشهر بهامشٍ ناقص. فهنا تُعرَّف
 * القوائم، وهنا يُقرأ من خالفها.
 *
 * بنية ٣ طبقات: انحرافٌ يستحقّ النظر · القوائم · بنود القائمة المختارة.
 * الوصول: المشرف والمديران — من يُقيَّد بالسعر لا يضعه.
 */
import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listenPriceLists, savePriceList, setPriceListActive } from '../../../services/pricing/priceListService.js';
import { listenDocumentsByTypes } from '../../../services/documents/documentsService.js';
import {
  PRICE_SEGMENTS,
  deviationRows,
  deviationSummary,
  DEVIATION_COLUMNS,
  listProblems,
} from '../../../services/pricing/priceListModel.js';
import { UOM_MASTER } from '../../../services/items/uomModel.js';

const EDITOR_ROLES = ['admin', 'warehouse_manager', 'sales_supervisor'];
const SALES_TYPES = ['SO', 'INV', 'VSI', 'VCS', 'DN'];

const input = 'bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink';
const btn = 'rounded-lg px-3 py-2 text-sm border border-line text-ink bg-chip disabled:opacity-50';
const btnPrimary = 'rounded-lg px-4 py-2.5 text-sm bg-accent text-white disabled:opacity-50';
const card = 'rounded-xl border border-line bg-surface p-4';

const blankList = () => ({
  name: '',
  segment: 'retail',
  currency: 'LYD',
  validFrom: '',
  validTo: '',
  isDefault: false,
  active: true,
  lines: [{ sku: '', uom: 'piece', price: 0, minQty: 0 }],
});

export default function PriceLists() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [lists, setLists] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    const unsub = subscribeAuth(async (u) => {
      setMe(u ? await fetchUserProfile(u) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!me || !EDITOR_ROLES.includes(me.role)) return undefined;
    const u1 = listenPriceLists(setLists, (e) => setErr(e?.message || 'تعذّر قراءة القوائم'));
    const u2 = listenDocumentsByTypes(SALES_TYPES, setDocuments, 500);
    return () => {
      u1();
      u2();
    };
  }, [me]);

  const rows = useMemo(() => deviationRows(documents), [documents]);
  const summary = useMemo(() => deviationSummary(rows), [rows]);
  const problems = useMemo(() => (draft ? listProblems(draft) : []), [draft]);

  async function onSave() {
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      await savePriceList(draft, me);
      setMsg('حُفظت القائمة — تسري على كلّ فاتورةٍ تُفتح بعدها.');
      setDraft(null);
    } catch (e) {
      setErr(e?.message || 'تعذّر الحفظ');
    } finally {
      setSaving(false);
    }
  }

  const patch = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const patchLine = (i, k, v) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l, j) => (i === j ? { ...l, [k]: v } : l)) }));

  if (!ready) return <p className="text-sm text-ink-2">جارٍ التحقّق…</p>;
  if (!me) return <p className="text-sm text-ink-2">سجّل الدخول أوّلًا.</p>;
  if (!EDITOR_ROLES.includes(me.role)) {
    return <p className="text-sm text-ink-2">قوائم الأسعار محصورةٌ بالمديرَين ومشرف المبيعات.</p>;
  }

  return (
    <div className="space-y-5">
      {/* ═══ الطبقة ١: الانحراف ═══ */}
      <section className={card}>
        <h2 className="text-base font-bold text-ink mb-1">انحراف الأسعار</h2>
        <p className="text-xs text-ink-2 mb-3">
          من باع بغير سعر القائمة وبكم. مقروءٌ من وسم البيع لا بمقارنةٍ رجعيّة — فالقائمة تتغيّر والوسم لا.
        </p>
        {rows.length === 0 ? (
          <p className="text-sm text-ink">لا انحراف مسجّل.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3 text-sm mb-4">
              <div className="rounded-lg bg-chip border border-line p-3">
                <div className="text-ink-2 text-xs mb-1">حالات الانحراف</div>
                <div className="text-ink text-lg">{summary.total}</div>
              </div>
              <div className="rounded-lg bg-chip border border-line p-3">
                <div className="text-ink-2 text-xs mb-1">بيعٌ بأقلّ من القائمة</div>
                <div className={summary.below ? 'text-brand-red text-lg' : 'text-ink text-lg'}>{summary.below}</div>
              </div>
              <div className="rounded-lg bg-chip border border-line p-3">
                <div className="text-ink-2 text-xs mb-1">الأثر الصافي (د.ل)</div>
                <div className={summary.impact < 0 ? 'text-brand-red text-lg' : 'text-ink text-lg'}>{summary.impact}</div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-ink-2 text-xs border-b border-line">
                    {DEVIATION_COLUMNS.map((c) => (
                      <th key={c.key} className="text-right font-bold py-2 px-2 whitespace-nowrap">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((r) => (
                    <tr key={r.id} className="border-b border-line/60">
                      {DEVIATION_COLUMNS.map((c) => (
                        <td key={c.key} className={`py-2 px-2 ${c.key === 'impact' && r.impact < 0 ? 'text-brand-red' : 'text-ink'}`}>
                          {String(r[c.key] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* ═══ الطبقة ٢: القوائم ═══ */}
      <section className={card}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-base font-bold text-ink">القوائم</h2>
          <button className={btnPrimary} onClick={() => setDraft(blankList())} disabled={Boolean(draft)}>
            قائمة جديدة
          </button>
        </div>
        {lists.length === 0 ? (
          <p className="text-sm text-ink-2">
            لا قوائم بعد — والنظام يعمل: من لا قائمة له تبقى الكتابة اليدوية متاحة بلا وسمٍ ولا تنبيه.
          </p>
        ) : (
          <ul className="space-y-2">
            {lists.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 text-sm border-b border-line/60 pb-2">
                <span className="text-ink font-semibold">{l.name}</span>
                <span className="text-ink-2 text-xs">
                  {PRICE_SEGMENTS.find((s) => s.value === l.segment)?.label || l.segment} · {(l.lines || []).length} بندًا
                  {l.isDefault ? ' · الافتراضيّة' : ''}
                  {l.active === false ? ' · معطَّلة' : ''}
                </span>
                <button className={btn} onClick={() => setDraft({ ...l, lines: l.lines || [] })}>تحرير</button>
                <button className={btn} onClick={() => setPriceListActive(l.id, l.active === false, me)}>
                  {l.active === false ? 'تفعيل' : 'تعطيل'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ═══ الطبقة ٣: تحرير القائمة ═══ */}
      {draft && (
        <section className={card}>
          <h2 className="text-base font-bold text-ink mb-3">{draft.id ? 'تحرير قائمة' : 'قائمة جديدة'}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-4">
            <label className="text-xs text-ink-2">
              <span className="block mb-1">الاسم</span>
              <input className={`${input} w-full`} value={draft.name} onChange={(e) => patch('name')(e.target.value)} />
            </label>
            <label className="text-xs text-ink-2">
              <span className="block mb-1">الشريحة</span>
              <select className={`${input} w-full`} value={draft.segment} onChange={(e) => patch('segment')(e.target.value)}>
                {PRICE_SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <label className="text-xs text-ink-2">
              <span className="block mb-1">سريان من (اختياريّ)</span>
              <input className={`${input} w-full`} type="date" value={draft.validFrom || ''} onChange={(e) => patch('validFrom')(e.target.value)} />
            </label>
            <label className="text-xs text-ink-2">
              <span className="block mb-1">إلى (اختياريّ)</span>
              <input className={`${input} w-full`} type="date" value={draft.validTo || ''} onChange={(e) => patch('validTo')(e.target.value)} />
            </label>
            <label className="flex items-center gap-2 text-sm text-ink mt-5">
              <input type="checkbox" checked={Boolean(draft.isDefault)} onChange={(e) => patch('isDefault')(e.target.checked)} />
              الافتراضيّة لمن لا قائمة له
            </label>
          </div>

          <div className="overflow-x-auto mb-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink-2 text-xs border-b border-line">
                  <th className="text-right font-bold py-2 px-2">الصنف</th>
                  <th className="text-right font-bold py-2 px-2">الوحدة</th>
                  <th className="text-right font-bold py-2 px-2">السعر</th>
                  <th className="text-right font-bold py-2 px-2">حدّ أدنى للكمّيّة</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {draft.lines.map((l, i) => (
                  <tr key={i} className="border-b border-line/60">
                    <td className="py-1.5 px-2">
                      <input className={`${input} w-32`} value={l.sku} onChange={(e) => patchLine(i, 'sku', e.target.value)} />
                    </td>
                    <td className="py-1.5 px-2">
                      <select className={`${input} w-32`} value={l.uom} onChange={(e) => patchLine(i, 'uom', e.target.value)}>
                        {Object.values(UOM_MASTER).map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5 px-2">
                      <input className={`${input} w-24`} type="number" step="0.01" value={l.price}
                        onChange={(e) => patchLine(i, 'price', Number(e.target.value))} />
                    </td>
                    <td className="py-1.5 px-2">
                      <input className={`${input} w-24`} type="number" min="0" value={l.minQty || 0}
                        onChange={(e) => patchLine(i, 'minQty', Number(e.target.value))} />
                    </td>
                    <td className="py-1.5 px-2">
                      <button className={btn} onClick={() => setDraft((d) => ({ ...d, lines: d.lines.filter((_, j) => j !== i) }))}>
                        حذف
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className={btn} onClick={() => setDraft((d) => ({ ...d, lines: [...d.lines, { sku: '', uom: 'piece', price: 0, minQty: 0 }] }))}>
            بند جديد
          </button>

          {problems.length > 0 && (
            <ul className="mt-3 space-y-1">
              {problems.map((p) => <li key={p} className="text-sm text-brand-red">{p}</li>)}
            </ul>
          )}

          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-line">
            <button className={btnPrimary} onClick={onSave} disabled={saving || problems.length > 0}>
              {saving ? 'جارٍ الحفظ…' : 'حفظ القائمة'}
            </button>
            <button className={btn} onClick={() => setDraft(null)} disabled={saving}>إلغاء</button>
            {msg ? <span className="text-xs text-ink">{msg}</span> : null}
            {err ? <span className="text-xs text-brand-red">{err}</span> : null}
          </div>
        </section>
      )}
    </div>
  );
}
