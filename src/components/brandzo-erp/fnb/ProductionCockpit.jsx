import { useEffect, useMemo, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import { subscribeItems } from '../../../services/items/itemService.js';
import { subscribeWarehouses } from '../../../services/locations/warehouseService.js';
import { listenOrgLocations } from '../../../services/org/orgLocationsService.js';
import { listenRecipes } from '../../../services/items/recipesService.js';
import { normalizeItemCode } from '../../../services/items/itemIdentity.js';
import { createDraft, listenDocumentsByTypes } from '../../../services/documents/documentsService.js';
import { indexRecipes, recipeAsOf, explodeRecipe } from '../../../services/items/recipe.js';
import {
  YIELD_EXCEPTION_PCT,
  allocationVerdict,
  batchDates,
} from '../../../services/items/productionBatch.js';
import {
  linkedProduction,
  producedBatches,
  qcVerdictFor,
  yieldRows,
} from '../../../services/items/productionReading.js';
import {
  allocateProduction,
  shortfallException,
  toBranchTransfers,
} from '../../../services/intelligence/productionAllocation.js';

/**
 * دورة الإنتاج ‹FNB-502 · FNB-503 · FNB-504› — الشاشة الثالثة لقطاع الأغذية.
 *
 * ═══ ما تحلّه ═══
 * سلسلة الإنتاج `PRO→MIS→PRC` مبنيّةٌ في محرّك المستندات، والمنطق الذي
 * **يفهمها** مبنيٌّ ومختبَرٌ ومهجور: `explodeRecipe` يحسب الموادّ من الوصفة،
 * و`expectedFromIssued` يقول ما كانت الموادُّ المصروفة تكفي لإنتاجه،
 * و`yieldOf` يفصل خسارة التحضير عن الصرف الناقص، و`allocateProduction`
 * يقسم النقص بالتناسب. **كلّها بلا مستدعٍ واحد قبل هذه الشاشة.**
 *
 * فالشاشة **لا تحسب شيئًا** — تعرض ما يقوله المنطق الخالص، وتحوّله إلى
 * مستنداتٍ من السلسلة القائمة: أمرَ إنتاجٍ (PRO) وطلباتِ نقلٍ للفروع (TR).
 *
 * ═══ ولماذا ثلاثة مقاطع في شاشةٍ واحدة ═══
 * لأنّها **دورةٌ واحدة** لا ثلاث شاشات: من يخطّط هو من يقيس الـYield هو من
 * يخصّص على الفروع. وثلاثةُ روابطَ لثلاث لحظاتٍ من فعلٍ واحد تُفرّق ما
 * يجمعه العمل — والقاعدة «شاشةٌ واحدة بمنطقٍ واحد».
 *
 * ═══ والـYield يُقرأ برقمَين لا برقم ═══
 * «المخطَّط ١٠٠ والمنتَج ٩٢» تقول ٪٩٢ وهي نصف الحقيقة: قد يكون النقص لأنّ
 * الموادّ المصروفة لم تكفِ أصلًا. فالشاشة تعرض الرقمَين معًا ومعهما جملةُ
 * `why` من المنطق نفسه — ومن خلطهما لام الطاهيَ على صرفٍ ناقص.
 */

const CAN_PRODUCE = new Set(['admin', 'warehouse_manager', 'fnb_manager', 'executive_chef']);
const DOCS_CAP = 200;
const num = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(Number(n) || 0);
const today = () => new Date().toISOString().slice(0, 10);

const TABS = [
  { key: 'plan', label: 'الخطّة والموادّ', icon: 'notebook' },
  { key: 'yield', label: 'قياس الـYield', icon: 'gauge' },
  { key: 'allocate', label: 'التخصيص على الفروع', icon: 'truck' },
];

export default function ProductionCockpit() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('plan');
  const [items, setItems] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [locations, setLocations] = useState([]);
  const [docs, setDocs] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      if (!user) { setReady(true); return; }
      setMe(await fetchUserProfile(user));
      setReady(true);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!me) return undefined;
    const a = subscribeItems(setItems);
    const b = listenRecipes(setRecipes, (e) => setError(e?.message || 'تعذّرت قراءة الوصفات.'));
    const c = subscribeWarehouses(setWarehouses);
    const d = listenOrgLocations(setLocations, (e) => setError(e?.message || 'تعذّرت قراءة الفروع.'));
    const e = listenDocumentsByTypes(['PRO', 'MIS', 'PRC', 'QC'], setDocs, DOCS_CAP);
    return () => { a?.(); b?.(); c?.(); d?.(); e?.(); };
  }, [me]);

  const itemsBySku = useMemo(() => {
    const map = new Map();
    for (const it of items || []) {
      const code = normalizeItemCode(it?.sku);
      if (code) map.set(code, it);
    }
    return map;
  }, [items]);

  const index = useMemo(() => indexRecipes(recipes), [recipes]);
  /** المخرَجات التي لها وصفةٌ سارية — لا يُنتَج ما لا وصفةَ له من هذه الشاشة. */
  const outputs = useMemo(() => {
    const list = [];
    for (const sku of index.keys()) {
      const r = recipeAsOf(index, sku, today());
      if (r) list.push({ sku, nameAr: r.nameAr || itemsBySku.get(sku)?.nameAr || '', version: r.version, yieldQty: r.yieldQty });
    }
    return list.sort((a, b) => a.sku.localeCompare(b.sku));
  }, [index, itemsBySku]);

  const branches = useMemo(
    () => (locations || []).filter((l) => l?.level === 'branch' && l?.active !== false),
    [locations]
  );

  if (!ready) return <Notice>يقرأ…</Notice>;
  if (!me) return <Notice>افتح الصفحة بعد تسجيل الدخول.</Notice>;
  if (!CAN_PRODUCE.has(me.role)) return <Notice>دورة الإنتاج للشيف التنفيذيّ ومديري القطاع والمستودع.</Notice>;

  const shared = { me, itemsBySku, index, outputs, warehouses, branches, docs, busy, setBusy, setError, setCreated };

  return (
    <div dir="rtl" className="space-y-6">
      {/* ═══ الطبقة ١ — أين نحن من الدورة ═══ */}
      <section className="o_ds o_ds_card o_ds_pad">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => { setTab(t.key); setError(''); setCreated(null); }}
              className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-secondary'}`}
            >
              <Icon name={t.icon} size={14} className="ml-1" />
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted mt-2 leading-relaxed">
          الدورة واحدة: تُخطَّط بالوصفة، ثمّ تُقاس بما صُرف فعلًا، ثمّ تُخصَّص على الفروع بالتناسب.
          {' '}تُقرأ من {num(outputs.length)} وصفةً سارية و{num(docs.length)} مستندَ إنتاج.
        </p>
      </section>

      {busy && <div className="text-xs text-accent font-bold">{busy}</div>}
      {error && <div className="rounded-xl border border-brand-red/40 bg-brand-red/5 text-brand-red text-sm p-3">{error}</div>}
      {created && <CreatedBanner created={created} />}

      {tab === 'plan' && <PlanPane {...shared} />}
      {tab === 'yield' && <YieldPane {...shared} />}
      {tab === 'allocate' && <AllocatePane {...shared} />}
    </div>
  );
}

/* ═══════════════ ① الخطّة — الوصفة تقول ما يُصرف ═══════════════ */

function PlanPane({ me, itemsBySku, index, outputs, warehouses, setBusy, setError, setCreated, busy }) {
  const [sku, setSku] = useState('');
  const [qty, setQty] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [productionDate, setProductionDate] = useState(today());
  const [shelfLifeDays, setShelfLifeDays] = useState('');

  const planned = Number(qty) || 0;
  /** انفجار الوصفة — الشاشة تعرضه ولا تعيد حسابه. */
  const bom = useMemo(
    () => (sku && planned > 0 ? explodeRecipe(index, itemsBySku, sku, planned, { onDate: productionDate }) : null),
    [index, itemsBySku, sku, planned, productionDate]
  );
  /** تاريخا الدفعة — بلا مدّة صلاحيّةٍ لا يُخترع تاريخ، ويُعلَن نقصُه. */
  const dates = useMemo(
    () => batchDates({ producedOn: productionDate, shelfLifeDays: Number(shelfLifeDays) || 0 }),
    [productionDate, shelfLifeDays]
  );
  const recipe = useMemo(() => (sku ? recipeAsOf(index, sku, productionDate) : null), [index, sku, productionDate]);

  async function createOrder() {
    if (!sku || planned <= 0 || !warehouse) return;
    setBusy('ينشئ أمر الإنتاج…'); setError('');
    try {
      const item = itemsBySku.get(normalizeItemCode(sku));
      const id = await createDraft({
        type: 'PRO',
        profile: me,
        header: {
          orderDate: today(),
          productionDate,
          warehouse,
          costCenter: warehouse,
        },
        lines: [{
          sku: normalizeItemCode(sku),
          description: item?.nameAr || recipe?.nameAr || '',
          qtyPlanned: planned,
          uom: item?.baseUom || '',
          // ★ نسخة الوصفة تُختم على البند: من يقيس الـYield غدًا يقيسه
          //   بوصفة اليوم لا بوصفةٍ عُدّلت بعده.
          recipeRef: recipe ? `${normalizeItemCode(sku)}@v${recipe.version}` : '',
          shelfLifeDays: Number(shelfLifeDays) || 0,
        }],
      });
      setCreated({ type: 'PRO', id, label: 'أمر إنتاج', hint: `${num(planned)} من «${sku}»` });
    } catch (err) {
      setError(err?.message || 'تعذّر إنشاء أمر الإنتاج.');
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <section className="o_ds o_ds_card o_ds_pad grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="المنتَج (له وصفةٌ سارية)">
          <select className={SELECT} value={sku} onChange={(e) => setSku(e.target.value)}>
            <option value="">— اختر —</option>
            {outputs.map((o) => (
              <option key={o.sku} value={o.sku}>{o.nameAr ? `${o.nameAr} — ${o.sku}` : o.sku} (v{o.version})</option>
            ))}
          </select>
        </Field>
        <Field label="الكمّيّة المخطَّطة">
          <input type="number" min="0" step="any" className={SELECT} value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="وحدة الإنتاج">
          <select className={SELECT} value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
            <option value="">— اختر —</option>
            {(warehouses || []).map((w) => (
              <option key={w.code} value={String(w.code).toUpperCase()}>{w.nameAr || w.code}</option>
            ))}
          </select>
        </Field>
        <Field label="تاريخ الإنتاج المخطَّط">
          <input type="date" className={SELECT} value={productionDate} onChange={(e) => setProductionDate(e.target.value)} />
        </Field>
        <Field label="مدّة الصلاحيّة (أيّام)">
          <input type="number" min="0" step="1" className={SELECT} value={shelfLifeDays} onChange={(e) => setShelfLifeDays(e.target.value)} />
        </Field>
      </section>

      {outputs.length === 0 && (
        <Notice>لا وصفةَ ساريةً بعد — تُكتب الوصفات في «دفتر الوصفات» أوّلًا، فمنها يُحسب صرفُ الموادّ.</Notice>
      )}

      {sku && planned > 0 && (
        <>
          <section className="o_ds o_ds_card grid grid-cols-2 sm:grid-cols-4 divide-x divide-x-reverse divide-line">
            <Kpi label="الموادّ الخام" value={num(bom?.lines?.length || 0)} hint="بعد تفجير الوصفات المتداخلة" />
            <Kpi label="دفعة الوصفة" value={num(recipe?.yieldQty || 0)} hint="ما تُخرجه المقادير المكتوبة" />
            <Kpi label="تاريخ الصلاحيّة" value={dates.expiry || '—'} hint={dates.mfgDate ? `إنتاجٌ في ${dates.mfgDate}` : 'تاريخُ الاستلام غير مقروء'} tone={dates.expiry ? '' : 'red'} />
            <Kpi label="أعطابٌ في التفجير" value={num(bom?.problems?.length || 0)} hint="مكوّنٌ خارج الماستر أو معاملٌ مجهول" tone={bom?.problems?.length ? 'red' : ''} />
          </section>

          {(dates.problem || (bom?.problems?.length || 0) > 0) && (
            <section className="o_ds o_ds_card o_ds_pad border border-brand-red/40 bg-brand-red/5">
              <ul className="text-xs leading-relaxed space-y-1 list-none p-0 m-0">
                {dates.problem && <li className="text-brand-red font-bold">• {dates.problem}</li>}
                {(bom?.problems || []).map((p, i) => <li key={i} className="text-brand-red font-bold">• {p}</li>)}
              </ul>
              <p className="text-[11px] text-ink-2 mt-2">
                الأعطاب تُعلَن ولا تُحسب من جهل — فالمجموع أدناه ناقصٌ معلَنُ النقص، ولا يُمنع إصدار الأمر بسببها.
              </p>
            </section>
          )}

          <section className="o_ds o_ds_card overflow-x-auto">
            <h3 className="text-sm font-black text-ink px-4 pt-4 pb-2">ما تحتاجه هذه الكمّيّة من موادّ خام</h3>
            <table className="w-full text-xs border-collapse">
              <thead className="bg-surface-2 text-ink-2 border-b border-line">
                <tr><Th>المادّة</Th><Th>الاسم</Th><Th>الكمّيّة</Th><Th>الوحدة</Th><Th>عبر</Th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(bom?.lines || []).map((l) => (
                  <tr key={l.sku}>
                    <Td align="left">{l.sku}</Td>
                    <Td>{itemsBySku.get(l.sku)?.nameAr || '—'}</Td>
                    <Td align="left" className="font-bold">{num(l.qty)}</Td>
                    <Td align="left">{l.uom || '—'}</Td>
                    <Td className="text-muted">{l.via || 'مباشرةً'}</Td>
                  </tr>
                ))}
                {!(bom?.lines || []).length && (
                  <tr><Td className="text-center text-muted py-6">لا موادَّ — راجع الوصفة.</Td></tr>
                )}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-line flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-primary btn-sm" disabled={!warehouse || !!busy} onClick={createOrder}>
                أصدِر أمر إنتاج (PRO)
              </button>
              <span className="text-[11px] text-muted">
                الأمر مسودّةٌ لا تقيّد شيئًا — القيد يقع في صرف الموادّ (MIS) واستلام الإنتاج (PRC).
                {!warehouse && ' اختر وحدة الإنتاج أوّلًا.'}
              </span>
            </div>
          </section>
        </>
      )}
    </>
  );
}

/* ═══════════════ ② الـYield — رقمان لا رقم ═══════════════ */

function YieldPane({ itemsBySku, index, docs }) {
  const [proId, setProId] = useState('');

  const orders = useMemo(() => (docs || []).filter((d) => d?.type === 'PRO'), [docs]);
  const order = useMemo(() => orders.find((d) => d.id === proId) || null, [orders, proId]);

  /** النسبةُ والتجميعُ والقياس — كلّها من الوحدة الخالصة المحروسة باختبارها. */
  const linked = useMemo(() => linkedProduction(order, docs), [order, docs]);
  const rows = useMemo(() => yieldRows(order, docs, index, itemsBySku), [order, docs, index, itemsBySku]);
  const multiOutput = useMemo(() => rows.length > 1, [rows]);

  return (
    <>
      <section className="o_ds o_ds_card o_ds_pad flex flex-wrap items-end gap-3">
        <Field label="أمر الإنتاج" className="flex-1 min-w-[240px]">
          <select className={SELECT} value={proId} onChange={(e) => setProId(e.target.value)}>
            <option value="">— اختر —</option>
            {orders.map((d) => (
              <option key={d.id} value={d.id}>
                {d.number || 'مسودّة'} · {d.header?.productionDate || '—'} · {(d.lines || [])[0]?.sku || ''}
              </option>
            ))}
          </select>
        </Field>
        <span className="text-[11px] text-muted">
          يُقاس من {num(linked.issues.length)} مستندَ صرفٍ و{num(linked.receipts.length)} استلامًا مرتبطًا بالأمر.
        </span>
      </section>

      {orders.length === 0 && <Notice>لا أمرَ إنتاجٍ بعد — أصدِر واحدًا من مقطع «الخطّة والموادّ».</Notice>}

      {order && linked.issues.length === 0 && (
        <Notice>
          لا صرفَ موادَّ مرتبطًا بهذا الأمر — فالمتوقَّع لا يُحسب، ويبقى الـYield مقيسًا بالمخطَّط وحده.
        </Notice>
      )}

      {order && rows.length > 0 && (
        <section className="o_ds o_ds_card overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-surface-2 text-ink-2 border-b border-line">
              <tr>
                <Th>المنتَج</Th><Th>المخطَّط</Th><Th>المنتَج فعلًا</Th>
                <Th>ما تكفيه الموادّ</Th><Th>٪ من الخطّة</Th><Th>٪ من الموادّ</Th><Th>القراءة</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.sku} className={r.exception ? 'bg-brand-red/5' : ''}>
                  <Td align="left">
                    <div className="font-bold">{r.sku}</div>
                    <div className="text-[10px] text-muted">{r.description}</div>
                  </Td>
                  <Td align="left">{num(r.result.planned)}</Td>
                  <Td align="left" className="font-bold">{num(r.result.produced)}</Td>
                  <Td align="left">
                    {r.result.expected > 0 ? num(r.result.expected) : '—'}
                    {r.exp.limitedBy && <div className="text-[10px] text-muted">المقيِّدة: {r.exp.limitedBy}</div>}
                  </Td>
                  <Td align="left">{r.result.vsPlanned == null ? '—' : `٪${r.result.vsPlanned}`}</Td>
                  <Td align="left" className={r.exception ? 'text-brand-red font-black' : 'font-bold'}>
                    {r.result.vsExpected == null ? '—' : `٪${r.result.vsExpected}`}
                  </Td>
                  <Td className="max-w-[22rem]">
                    <div className={r.result.shortIssue ? 'text-brand-red' : 'text-ink-2'}>{r.result.why}</div>
                    {r.exception && (
                      <div className="text-[10px] text-brand-red font-bold mt-1">استثناءٌ يُفتح: {r.exception.reason}</div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-muted px-4 py-3 border-t border-line leading-relaxed">
            العتبة ٪{YIELD_EXCEPTION_PCT} وتُقاس بعمود «٪ من الموادّ» لا بعمود الخطّة —
            {' '}فالنقص عن الخطّة بسبب صرفٍ ناقص ليس خطأ تحضير، ومن خلطهما لام الطاهيَ على غير ذنبه.
            {multiOutput && (
              <>
                {' '}<span className="text-brand-red font-bold">
                  وهذا الأمر بأكثر من مخرَج: الموادّ المصروفة لا تُنسب لمخرَجٍ بعينه، فعمود «ما تكفيه الموادّ» ساكتٌ عمدًا
                  {' '}ويبقى القياس بالمخطَّط وحده. أفرِد المخرَجات بأوامرَ لتُقاس تحضيرًا.
                </span>
              </>
            )}
          </p>
        </section>
      )}
    </>
  );
}

/* ═══════════════ ③ التخصيص — النقص يُقتسم لا يُلقى على آخر من طلب ═══════════════ */

function AllocatePane({ me, itemsBySku, branches, docs, busy, setBusy, setError, setCreated }) {
  const [batchKey, setBatchKey] = useState('');
  const [declared, setDeclared] = useState('');
  const [demands, setDemands] = useState({});

  /**
   * الدفعات المنتَجة — **تُقرأ من استلام الإنتاج لا تُكتب بيد**.
   * فمن أثبت الدفعة في PRC أثبت كمّيّتها وصلاحيّتها ومخزنها؛ وإعادةُ كتابتها
   * هنا تفتح بابَ رقمَين لدفعةٍ واحدة.
   */
  const batches = useMemo(() => producedBatches(docs, itemsBySku), [docs, itemsBySku]);

  const picked = useMemo(() => batches.find((b) => b.key === batchKey) || null, [batches, batchKey]);

  /**
   * قرار الجودة — **يُبحث عنه في مستندات الفحص بالدفعة نفسها**، ولا يُفترض.
   * وحين لا يوجد مستندٌ يحملها يبقى الحكم غائبًا، ويُعلَن غيابُه: فالمنطق
   * يمنع تخصيص دفعةٍ بلا قرار، ومن أراد المضيّ يُصرّح بالقرار باسمه.
   */
  const qcFound = useMemo(() => qcVerdictFor(picked?.batch, docs), [picked, docs]);

  const qcStatus = qcFound?.status || declared || 'pending';

  const produced = useMemo(
    () => ({
      sku: picked?.sku || '',
      batch: picked?.batch || '',
      expiry: picked?.expiry || '',
      qty: picked?.qty || 0,
      warehouse: picked?.warehouse || '',
      qcStatus,
    }),
    [picked, qcStatus]
  );
  const warehouse = produced.warehouse;
  const sku = produced.sku;
  const verdict = useMemo(() => allocationVerdict(produced), [produced]);

  const demandRows = useMemo(
    () => branches
      .map((b) => ({ branch: String(b.code).toUpperCase(), nameAr: b.nameAr || b.code, qty: Number(demands[String(b.code).toUpperCase()]) || 0 }))
      .filter((d) => d.qty > 0),
    [branches, demands]
  );

  const result = useMemo(
    () => (sku && produced.qty > 0 && demandRows.length ? allocateProduction(produced, demandRows) : null),
    [sku, produced, demandRows]
  );
  const shortEx = useMemo(() => (result ? shortfallException(produced, result) : null), [produced, result]);
  const nameOf = useMemo(() => new Map(branches.map((b) => [String(b.code).toUpperCase(), b.nameAr || b.code])), [branches]);

  async function sendTransfers() {
    if (!result?.ok) return;
    const drafts = toBranchTransfers(produced, result, { fromWarehouse: warehouse, requestDate: today() });
    if (!drafts.length) return;
    setBusy(`ينشئ ${drafts.length} طلبَ نقل…`); setError('');
    try {
      const ids = [];
      for (const draft of drafts) {
        ids.push(await createDraft({ type: 'TR', profile: me, header: draft.header, lines: draft.lines }));
      }
      setCreated({ type: 'TR', id: ids[0], label: `${ids.length} طلب نقل`, hint: `تخصيص «${produced.sku}» على ${ids.length} فرعًا` });
      setDemands({});
    } catch (err) {
      setError(err?.message || 'تعذّر إنشاء طلبات النقل.');
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <section className="o_ds o_ds_card o_ds_pad grid gap-3 lg:grid-cols-3">
        <Field label="الدفعة المنتَجة (من استلام الإنتاج)" className="lg:col-span-2">
          <select className={SELECT} value={batchKey} onChange={(e) => { setBatchKey(e.target.value); setDeclared(''); }}>
            <option value="">— اختر —</option>
            {batches.map((b) => (
              <option key={b.key} value={b.key}>
                {b.docNumber} · {b.sku}{b.description ? ` — ${b.description}` : ''} · {num(b.qty)}{b.batch ? ` · دفعة ${b.batch}` : ' · بلا رقم دفعة'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="قرار الجودة">
          {qcFound ? (
            <div className={`${SELECT} ${qcFound.status === 'passed' ? '' : 'text-brand-red font-bold'}`}>
              {qcFound.decision || 'بلا قرارٍ نهائيّ'} — من {qcFound.number}
            </div>
          ) : (
            <select className={SELECT} value={declared} onChange={(e) => setDeclared(e.target.value)} disabled={!picked}>
              <option value="">— لا مستندَ فحصٍ يحمل هذه الدفعة —</option>
              <option value="passed">أُصرّح: مقبولة</option>
              <option value="rejected">أُصرّح: مرفوضة</option>
            </select>
          )}
        </Field>
      </section>

      {batches.length === 0 && (
        <Notice>
          لا دفعةَ منتَجةً بعد — تُثبَت الدفعات في «استلام إنتاج (PRC)»، ومنه تُقرأ هنا بكمّيّتها وصلاحيّتها ومخزنها.
        </Notice>
      )}

      {picked && (
        <section className="o_ds o_ds_card grid grid-cols-2 sm:grid-cols-4 divide-x divide-x-reverse divide-line">
          <Kpi label="المنتَج" value={picked.sku} hint={picked.description || '—'} />
          <Kpi label="المتاح" value={num(picked.qty)} hint={picked.batch ? `دفعة ${picked.batch}` : 'بلا رقم دفعة'} />
          <Kpi label="الصلاحيّة" value={picked.expiry || '—'} hint={picked.expiry ? 'تدخل ترتيب FEFO' : 'بلا صلاحيّة يتعطّل FEFO'} tone={picked.expiry ? '' : 'red'} />
          <Kpi label="مصدر الشحن" value={picked.warehouse || '—'} hint={picked.qcRef ? `مرجع الفحص ${picked.qcRef}` : 'بلا مرجع فحصٍ على المستند'} tone={picked.warehouse ? '' : 'red'} />
        </section>
      )}

      {picked && !verdict.ok && (
        <section className="o_ds o_ds_card o_ds_pad border border-brand-red/40 bg-brand-red/5">
          <div className="text-brand-red text-sm font-bold">{verdict.problem}</div>
          {!qcFound && (
            <p className="text-[11px] text-ink-2 mt-2 leading-relaxed">
              الحكم يُبحث عنه في مستندات الفحص بالدفعة نفسها ولا يُفترض. ولا مستندَ فحصٍ يحمل «{picked.batch || '—'}» —
              {' '}فمن أراد المضيّ يصرّح بالقرار باسمه من الحقل أعلاه، ويبقى التصريح تصريحَه لا حكمَ الجودة.
            </p>
          )}
        </section>
      )}

      {branches.length === 0 && (
        <Notice>لا فرعَ مسجّلًا بعد — تُضاف الفروع من «الأبعاد التنظيميّة والتكلفة».</Notice>
      )}

      {sku && verdict.ok && branches.length > 0 && (
        <section className="o_ds o_ds_card o_ds_pad">
          <h3 className="text-sm font-black text-ink mb-3">طلبات الفروع على «{produced.sku}»</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {branches.map((b) => {
              const code = String(b.code).toUpperCase();
              return (
                <Field key={code} label={b.nameAr || code}>
                  <input
                    type="number" min="0" step="any" className={SELECT}
                    value={demands[code] ?? ''}
                    onChange={(e) => setDemands((d) => ({ ...d, [code]: e.target.value }))}
                  />
                </Field>
              );
            })}
          </div>
        </section>
      )}

      {result && (
        <>
          <section className="o_ds o_ds_card grid grid-cols-2 sm:grid-cols-4 divide-x divide-x-reverse divide-line">
            <Kpi label="المتاح للتخصيص" value={num(produced.qty)} hint="ما أُنتج وقُبل جودةً" />
            <Kpi label="مجموع الطلب" value={num(demandRows.reduce((s, d) => s + d.qty, 0))} hint={`${num(demandRows.length)} فرعًا طلب`} />
            <Kpi label="النقص الكلّيّ" value={num(result.shortfall)} hint={result.shortfall > 0 ? 'يُقتسم بالتناسب' : 'يكفي الطلب كلَّه'} tone={result.shortfall > 0 ? 'red' : ''} />
            <Kpi label="فروعٌ لن تستلم كاملًا" value={num(result.allocations.filter((a) => a.shortfall > 0).length)} hint="بعد التناسب والتدوير" tone={result.allocations.some((a) => a.shortfall > 0) ? 'red' : ''} />
          </section>

          {(result.problems.length > 0 || shortEx) && (
            <section className="o_ds o_ds_card o_ds_pad border border-brand-red/40 bg-brand-red/5">
              <ul className="text-xs leading-relaxed space-y-1 list-none p-0 m-0">
                {result.problems.map((p, i) => <li key={i} className="text-brand-red font-bold">• {p}</li>)}
                {shortEx && <li className="text-brand-red font-bold">• استثناءٌ يُفتح: {shortEx.reason}</li>}
              </ul>
            </section>
          )}

          <section className="o_ds o_ds_card overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-surface-2 text-ink-2 border-b border-line">
                <tr><Th>الفرع</Th><Th>طلب</Th><Th>خُصّص</Th><Th>ينقصه</Th><Th>٪ التغطية</Th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.allocations.map((a) => {
                  const pct = a.requested > 0 ? Math.round((a.allocated / a.requested) * 1000) / 10 : 0;
                  return (
                    <tr key={a.branch} className={a.shortfall > 0 ? 'bg-brand-red/5' : ''}>
                      <Td>
                        <div className="font-bold">{nameOf.get(a.branch) || a.branch}</div>
                        <div className="text-[10px] text-muted font-mono">{a.branch}</div>
                      </Td>
                      <Td align="left">{num(a.requested)}</Td>
                      <Td align="left" className="font-bold">{num(a.allocated)}</Td>
                      <Td align="left" className={a.shortfall > 0 ? 'text-brand-red font-bold' : 'text-muted'}>{a.shortfall > 0 ? num(a.shortfall) : '—'}</Td>
                      <Td align="left">٪{pct}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-line flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-primary btn-sm" disabled={!warehouse || !!busy} onClick={sendTransfers}>
                حوّلها إلى طلبات نقل (TR)
              </button>
              <span className="text-[11px] text-muted">
                بسلسلة النقل القائمة TR→TRN→TRC لا بمسار شحنٍ ثانٍ للمطبخ.
                {!warehouse && ' اختر مصدر الشحن أوّلًا.'}
              </span>
            </div>
          </section>
        </>
      )}
    </>
  );
}

/* ═══════════════ قطعٌ مشتركة ═══════════════ */

const SELECT = 'w-full bg-surface border border-line rounded-lg text-ink text-sm px-2.5 py-2 focus:outline-none focus:border-accent/50';

function CreatedBanner({ created }) {
  const base = getBasePath();
  return (
    <div className="rounded-xl border border-accent/40 bg-accent/5 text-sm p-3 flex flex-wrap items-center gap-3">
      <Icon name="checkCircle" size={16} className="text-accent shrink-0" />
      <span className="flex-1 text-ink-2">أُنشئ {created.label} — {created.hint}. مسودّةٌ تنتظر الاعتماد.</span>
      <a href={`${base}/dashboard/document?type=${created.type}&id=${created.id}`} className="btn btn-secondary btn-sm">افتحه</a>
    </div>
  );
}

function Field({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[11px] font-bold text-ink-2 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Kpi({ label, value, hint, tone }) {
  return (
    <div className="p-3">
      <div className={`text-xl font-black leading-tight ${tone === 'red' ? 'text-brand-red' : 'text-ink'}`}>{value}</div>
      <div className="text-[11px] font-bold text-ink-2 mt-0.5">{label}</div>
      <div className="text-[10px] text-muted">{hint}</div>
    </div>
  );
}

const Th = ({ children, align }) => (
  <th className={`px-3 py-2 font-bold whitespace-nowrap ${align === 'left' ? 'text-left' : 'text-right'}`}>{children}</th>
);
const Td = ({ children, align, className = '' }) => (
  <td className={`px-3 py-2 align-top ${align === 'left' ? 'text-left font-mono' : 'text-right'} ${className}`}>{children}</td>
);

function Notice({ children }) {
  return <div className="o_ds o_ds_card o_ds_pad text-center text-muted text-sm">{children}</div>;
}
