/**
 * شاشةُ الكاشير (نقطةُ بيع) ‹POS م٧› — بيعُ تجزئةٍ لحظيٌّ من مخزنٍ ثابت.
 *
 * سلّةٌ تُملأ بمسح باركود (قارئٌ سلكيّ على مستوى الصفحة) أو بحثٍ بالاسم/الكود ←
 * سعرٌ من الصنف (قابلٌ للتعديل) ← دفعٌ نقدٌ/بطاقة ← «بيع» بخطوةٍ واحدة (يُخصم
 * المخزونُ ويُقيَّد نقدًا/مبيعاتٍ) ← إيصالٌ يُطبع. الرياضياتُ الخالصةُ في
 * `cashierCart.js`، والبيعُ في `cashierService.recordSale`.
 *
 * النسخةُ الأولى (قرار المالك): بلا ضريبة · نقد/بطاقة/تحويل · بلا عروضٍ آليّة.
 * أرقامٌ لاتينيّة، بلا إيموجي، الأحمرُ للتحذير.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { subscribeItemsDelta } from '../../../services/items/itemService.js';
import { itemSearchKeys } from '../../../services/items/itemIdentity.js';
import { subscribeWarehouses } from '../../../services/locations/warehouseService.js';
import { isActiveWarehouse } from '../../../services/locations/warehouseModel.js';
import { useWedgeScanner } from '../scan/useWedgeScanner.js';
import {
  PAY_METHODS,
  isCashPayment,
  cartLineFromItem,
  addOrIncrement,
  cartTotals,
} from '../../../services/pos/cashierCart.js';
import { recordSale } from '../../../services/pos/cashierService.js';

const SELLER_ROLES = ['admin', 'warehouse_manager', 'sales_rep', 'sales_supervisor'];
const canSell = (role) => SELLER_ROLES.includes(role);

const card = 'rounded-xl border border-line bg-surface p-4';
const inputCls = 'w-full bg-chip border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent/60';
const fmt = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const norm = (v) => String(v ?? '').trim().toUpperCase();
const todayIso = () => new Date().toISOString().slice(0, 10);

export default function CashierBoard() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [warehouse, setWarehouse] = useState('');

  const [lines, setLines] = useState([]);
  const [method, setMethod] = useState('نقدًا');
  const [paid, setPaid] = useState('');
  const [cartDiscount, setCartDiscount] = useState('');
  const [customer, setCustomer] = useState('');

  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [receipt, setReceipt] = useState(null); // آخرُ بيعٍ ناجحٍ للطباعة

  useEffect(() => {
    const unsub = subscribeAuth(async (u) => {
      setMe(u ? await fetchUserProfile(u) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!me || !canSell(me.role)) return undefined;
    const unsub = subscribeItemsDelta((list) => setItems(list), () => {});
    return () => unsub && unsub();
  }, [me]);

  useEffect(() => {
    if (!me || !canSell(me.role)) return undefined;
    return subscribeWarehouses(
      (list) => {
        const active = (list || []).filter(isActiveWarehouse);
        setWarehouses(active);
        setWarehouse((w) => w || (active[0] ? norm(active[0].code || active[0].id) : ''));
      },
      () => {}
    );
  }, [me]);

  const role = me?.role;
  const sellable = canSell(role);

  // مطابقاتُ صنفٍ بالرمز/الباركود من الكتالوج (نفسُ مفاتيح الهويّة) — قائمةٌ لا
  // مفردٌ: باركودٌ يحمله أكثرُ من صنفٍ (خطأُ إدخال) يُكشَف بدل بيعِ أوّله صامتًا.
  const findMatches = (code) => {
    const c = norm(code);
    if (!c) return [];
    return items.filter((it) => itemSearchKeys(it).some((k) => norm(k) === c));
  };

  const addItem = (it) => {
    if (!it) return;
    setLines((prev) => addOrIncrement(prev, cartLineFromItem(it, { unitPrice: it.unitPrice })));
    setErr('');
  };

  const addByCode = (code) => {
    const matches = findMatches(code);
    if (matches.length === 0) {
      setErr(`لا صنفَ بالرمز «${String(code).trim()}» — تحقّق أو ابحث بالاسم.`);
      return;
    }
    if (matches.length > 1) {
      // باركودٌ ملتبسٌ: لا نبيع أوّلَ مطابقةٍ صامتًا — يُحسَم بالبحث بالاسم.
      setErr(`الرمز «${String(code).trim()}» يحمله ${matches.length} أصناف — ابحث بالاسم واختَر الصحيح.`);
      return;
    }
    addItem(matches[0]);
  };

  // قارئُ الباركود السلكيّ على مستوى الصفحة (جهازُ الباركود يُسمع في الشاشة كلّها).
  useWedgeScanner((code) => sellable && addByCode(code), { enabled: sellable });

  // اقتراحاتُ البحث بالاسم/الكود/الباركود (من الكتالوج في الذاكرة).
  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return items
      .filter((it) => {
        const name = String(it.nameAr || it.nameEn || '').toLowerCase();
        const keys = itemSearchKeys(it).map((k) => String(k).toLowerCase());
        return name.includes(q) || keys.some((k) => k.includes(q));
      })
      .slice(0, 8);
  }, [search, items]);

  const totals = useMemo(
    () => cartTotals(lines, { cartDiscount, paid, method }),
    [lines, cartDiscount, paid, method]
  );

  const setQty = (i, qty) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, qty: Math.max(0, Number(qty) || 0) } : l)));
  const setPrice = (i, price) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, unitPrice: Math.max(0, Number(price) || 0) } : l)));
  const removeLine = (i) => setLines((prev) => prev.filter((_, j) => j !== i));

  async function sell() {
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      const input = { lines, warehouse, paymentMethod: method, cartDiscount, paid, customer, saleDate: todayIso() };
      const res = await recordSale(input, me);
      setReceipt({
        number: res.number,
        date: todayIso(),
        warehouse,
        method,
        customer,
        lines: totals.rows,
        subtotal: totals.subtotal,
        cartDiscount: totals.cartDiscount,
        grandTotal: res.grandTotal,
        paid: totals.paid,
        change: res.change,
      });
      setMsg(`تمّ البيع ${res.number || ''} — الإجماليّ ${fmt(res.grandTotal)} د.ل${isCashPayment(method) ? ` · الباقي ${fmt(res.change)}` : ''}.`);
      setLines([]);
      setPaid('');
      setCartDiscount('');
      setCustomer('');
      setSearch('');
    } catch (ex) {
      // فشلٌ بعد الإنشاء (رُقّم المستندُ وبدأ الترحيل، `ex.docId` موجود): أفرِغ
      // السلّةَ فلا تُنشئ ضغطةٌ ثانيةٌ بيعًا مكرَّرًا — واليتيمُ يُكمَل من «المستندات».
      // وفشلُ التحقّق قبل الإنشاء (بلا docId) يُبقي السلّةَ لتصحيح المدخل.
      if (ex?.docId) {
        setLines([]);
        setPaid('');
        setErr(`${ex?.message || 'تعذّر إتمامُ البيع.'} لا تُعِد البيعَ من السلّة نفسِها.`);
      } else {
        setErr(ex?.message || 'تعذّر إتمامُ البيع.');
      }
    } finally {
      setSaving(false);
    }
  }

  // طباعةُ الإيصال بعد رسمِه، ثمّ تُمسح.
  useEffect(() => {
    if (!receipt) return undefined;
    const t = setTimeout(() => {
      try { window.print(); } catch { /* الطباعةُ غيرُ متاحة */ }
    }, 80);
    const after = () => setReceipt(null);
    window.addEventListener('afterprint', after);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', after);
    };
  }, [receipt]);

  if (!ready) return <p className="text-sm text-ink-2">جارٍ التحقّق…</p>;
  if (!me) return <p className="text-sm text-ink-2">سجّل الدخول أوّلًا.</p>;
  if (!sellable) return <p className="text-sm text-ink-2">الكاشيرُ للمدير العامّ ومدير المستودعات ومندوبي المبيعات.</p>;

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr] pos-screen">
        {/* ═══ يسار: إضافة الأصناف والسلّة ═══ */}
        <div className="space-y-4">
          <section className={card}>
            <div className="flex flex-wrap items-end gap-3 mb-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-ink-2">المخزن</span>
                <select className={inputCls} value={warehouse} onChange={(e) => setWarehouse(norm(e.target.value))}>
                  {warehouses.length === 0 && <option value="">— لا مخازن —</option>}
                  {warehouses.map((w) => (
                    <option key={w.id || w.code} value={norm(w.code || w.id)} className="bg-surface">
                      {w.name || w.code} ({norm(w.code || w.id)})
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex-1 min-w-[200px] relative">
                <span className="text-[11px] font-bold text-ink-2">امسح الباركود أو ابحث (رمز/باركود/اسم)</span>
                <input
                  className={inputCls}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && search.trim()) { addByCode(search.trim()); setSearch(''); }
                  }}
                  placeholder="امسح أو اكتب ثمّ Enter…"
                  autoFocus
                />
                {suggestions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-line bg-surface shadow-lg max-h-64 overflow-auto">
                    {suggestions.map((it) => (
                      <button
                        key={it.sku || it.id}
                        type="button"
                        className="block w-full text-right px-3 py-2 text-sm text-ink hover:bg-chip border-b border-line/50"
                        onClick={() => { addItem(it); setSearch(''); }}
                      >
                        <span className="font-bold">{it.nameAr || it.nameEn || it.sku}</span>
                        <span className="text-ink-2 text-xs"> · {it.sku}{it.unitPrice ? ` · ${fmt(it.unitPrice)} د.ل` : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {err && <p className="text-[12px] text-red-300">{err}</p>}
            {msg && <p className="text-[12px] text-emerald-300">{msg}</p>}
          </section>

          <section className={card}>
            <h2 className="text-base font-bold text-ink mb-3">السلّة ({totals.count})</h2>
            {lines.length === 0 ? (
              <p className="text-sm text-ink-2">السلّةُ فارغة — امسح صنفًا أو ابحث عنه.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-ink-2 text-xs border-b border-line">
                      <th className="text-right font-bold py-2 px-1">الصنف</th>
                      <th className="text-right font-bold py-2 px-1 w-20">الكمّيّة</th>
                      <th className="text-right font-bold py-2 px-1 w-24">السعر</th>
                      <th className="text-right font-bold py-2 px-1 w-24">الإجماليّ</th>
                      <th className="py-2 px-1 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={`${l.sku}-${i}`} className="border-b border-line/60">
                        <td className="py-1.5 px-1 text-ink">{l.description || l.sku}</td>
                        <td className="py-1.5 px-1">
                          <input type="number" min="0" step="1" className={`${inputCls} py-1`} value={l.qty} onChange={(e) => setQty(i, e.target.value)} />
                        </td>
                        <td className="py-1.5 px-1">
                          <input type="number" min="0" step="0.001" className={`${inputCls} py-1`} value={l.unitPrice} onChange={(e) => setPrice(i, e.target.value)} />
                        </td>
                        <td className="py-1.5 px-1 text-ink">{fmt((Number(l.qty) || 0) * (Number(l.unitPrice) || 0))}</td>
                        <td className="py-1.5 px-1">
                          <button type="button" className="text-red-300 text-xs" onClick={() => removeLine(i)}>حذف</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* ═══ يمين: الدفع والإجماليّ ═══ */}
        <div className="space-y-4">
          <section className={card}>
            <h2 className="text-base font-bold text-ink mb-3">الدفع</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-ink-2">مجموع الأصناف</span>
                <span className="text-ink">{fmt(totals.subtotal)} د.ل</span>
              </div>
              <label className="flex items-center justify-between gap-2 text-sm">
                <span className="text-ink-2">خصم السلّة</span>
                <input type="number" min="0" step="0.001" className={`${inputCls} w-32`} value={cartDiscount} onChange={(e) => setCartDiscount(e.target.value)} placeholder="0" />
              </label>
              <div className="flex justify-between text-base font-bold border-t border-line pt-2">
                <span className="text-ink">المستحقّ</span>
                <span className="text-ink">{fmt(totals.grandTotal)} د.ل</span>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-ink-2">طريقة الدفع</span>
                <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}>
                  {PAY_METHODS.map((m) => (
                    <option key={m} value={m} className="bg-surface">{m}</option>
                  ))}
                </select>
              </label>
              {isCashPayment(method) && (
                <>
                  <label className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink-2">المدفوع</span>
                    <input type="number" min="0" step="0.001" className={`${inputCls} w-32`} value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0" />
                  </label>
                  <div className="flex justify-between text-sm">
                    <span className="text-ink-2">الباقي</span>
                    <span className="text-ink">{fmt(totals.change)} د.ل</span>
                  </div>
                </>
              )}
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-ink-2">العميل (اختياريّ)</span>
                <input className={inputCls} value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="اسمُ العميل" />
              </label>
              <button
                type="button"
                className="w-full rounded-lg bg-accent px-4 py-3 text-base font-bold text-white disabled:opacity-50"
                disabled={saving || totals.count === 0 || !warehouse || (isCashPayment(method) && (Number(paid) || 0) + 1e-9 < totals.grandTotal)}
                onClick={sell}
              >
                {saving ? 'جارٍ البيع…' : `بيع (${fmt(totals.grandTotal)} د.ل)`}
              </button>
            </div>
          </section>
        </div>
      </div>

      {receipt && <SaleReceipt receipt={receipt} />}
    </>
  );
}

/* ═══════════════════ الإيصال — ورقةٌ محايدةٌ بلا هويّةِ شركة ═══════════════════ */

function SaleReceipt({ receipt }) {
  const ref = useRef(null);
  return (
    <div className="pos-receipt" dir="rtl" ref={ref}>
      <style>{RECEIPT_CSS}</style>
      <div className="rcp-head">
        <h1>إيصال بيع</h1>
        <div className="rcp-meta">
          <span>رقم: {receipt.number || '—'}</span>
          <span>التاريخ: {receipt.date}</span>
          <span>المخزن: {receipt.warehouse}</span>
          {receipt.customer ? <span>العميل: {receipt.customer}</span> : null}
        </div>
      </div>
      <table className="rcp-table">
        <thead>
          <tr><th>الصنف</th><th>كمّيّة</th><th>سعر</th><th>إجماليّ</th></tr>
        </thead>
        <tbody>
          {receipt.lines.map((l, i) => (
            <tr key={i}>
              <td>{l.description || l.sku}</td>
              <td className="rcp-num">{l.qty}</td>
              <td className="rcp-num">{fmt(l.unitPrice)}</td>
              <td className="rcp-num">{fmt(l.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="rcp-totals">
        <div><span>المجموع</span><span className="rcp-num">{fmt(receipt.subtotal)}</span></div>
        {receipt.cartDiscount > 0 && <div><span>خصم</span><span className="rcp-num">{fmt(receipt.cartDiscount)}</span></div>}
        <div className="rcp-grand"><span>المستحقّ</span><span className="rcp-num">{fmt(receipt.grandTotal)} د.ل</span></div>
        <div><span>الدفع ({receipt.method})</span><span className="rcp-num">{fmt(receipt.paid)}</span></div>
        {receipt.change > 0 && <div><span>الباقي</span><span className="rcp-num">{fmt(receipt.change)}</span></div>}
      </div>
      <div className="rcp-foot">شكرًا لتعاملكم معنا</div>
    </div>
  );
}

const RECEIPT_CSS = `
.pos-receipt { display: none; }
@media print {
  @page { size: 80mm auto; margin: 4mm; }
  body { background: #fff !important; }
  .pos-screen, .no-print { display: none !important; }
  .pos-receipt {
    display: block !important; width: 72mm; margin: 0 auto;
    background: #fff; color: #000; font-family: 'IBM Plex Sans Arabic', 'Cairo', sans-serif; font-size: 9pt;
  }
  .pos-receipt * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .rcp-head { text-align: center; border-bottom: 1px dashed #333; padding-bottom: 2mm; margin-bottom: 2mm; }
  .rcp-head h1 { font-size: 12pt; font-weight: 800; margin: 0 0 1mm; }
  .rcp-meta { display: flex; flex-direction: column; gap: 0.5mm; font-size: 8pt; }
  .rcp-table { width: 100%; border-collapse: collapse; margin-bottom: 2mm; }
  .rcp-table th, .rcp-table td { border-bottom: 1px solid #ddd; padding: 1mm 0.5mm; font-size: 8pt; text-align: right; }
  .rcp-table th { border-bottom: 1px solid #333; font-weight: 800; }
  .rcp-num { font-family: monospace; direction: ltr; unicode-bidi: isolate; text-align: left; }
  .rcp-totals { border-top: 1px dashed #333; padding-top: 2mm; font-size: 9pt; }
  .rcp-totals > div { display: flex; justify-content: space-between; padding: 0.5mm 0; }
  .rcp-grand { font-weight: 800; font-size: 10pt; border-top: 1px solid #333; border-bottom: 1px solid #333; padding: 1mm 0; }
  .rcp-foot { text-align: center; margin-top: 3mm; font-size: 8pt; }
}
`;
