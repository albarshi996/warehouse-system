import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listenBalances } from '../../../services/balances/balancesService.js';
import { movesForSku, movesForBarcode } from '../../../services/ledger/ledgerService.js';
import { availableQty } from '../../../services/ledger/reservations.js';
import { stuckBalances } from '../../../services/ledger/locations.js';

/**
 * دفتر حركات المخزون — أوّل ثمرة يلمسها المستخدم من الدفتر.
 *
 * يجيب سؤالين لم يكن للنظام جوابٌ عنهما: «كم رصيدي الحقيقي المتاح؟» و«من أين
 * جاء هذا الرصيد؟». الأوّل من الأرصدة الحيّة (الموجود ناقص المحجوز)، والثاني
 * من كشف الحركة الذي يعيد بناء القصّة من الدفتر: كل زيادة ونقصان بمستنده.
 *
 * ولوحة الاستثناءات أعلاه تعرض ما لا ينبغي أن يكون: رصيدٌ عالق في موقعٍ كان
 * يجب أن يفرغ — بضاعةٌ وصلت ولم تُخزَّن، أو شُحنت ولم تُستلم.
 */

const num = (n) => (Number(n) || 0).toLocaleString('ar-LY');

function fmtTime(ts) {
  const d = ts?.toDate?.();
  if (!d) return '—';
  return d.toLocaleString('ar-LY', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const REASON_TONE = {
  receipt: '#10b981',
  putaway: '#059669',
  pick: '#f59e0b',
  delivery: '#3b82f6',
  'quality-reject': '#8b5cf6',
  'return-in': '#0ea5e9',
  damage: '#ef4444',
  adjustment: '#DAAA3C',
};

export default function StockLedger() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [balances, setBalances] = useState([]);
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState(null); // { key, kind }
  const [moves, setMoves] = useState([]);
  const [loadingMoves, setLoadingMoves] = useState(false);

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      if (!user) {
        setMe(null);
        setReady(true);
        return;
      }
      const profile = await fetchUserProfile(user);
      setMe(profile);
      setReady(true);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!me) return undefined;
    const unsub = listenBalances(
      (rows) => setBalances(rows),
      () => setBalances([])
    );
    return () => unsub?.();
  }, [me]);

  // الأرصدة مجمّعة بالصنف — سطرٌ لكل صنف، بمجموع الموجود والمحجوز والمتاح.
  const items = useMemo(() => {
    const byItem = new Map();
    balances.forEach((b) => {
      const key = String(b.sku || b.barcode || '').trim().toUpperCase();
      if (!key) return;
      const prev = byItem.get(key) || {
        key,
        sku: b.sku || '',
        barcode: b.barcode || '',
        nameAr: b.nameAr || '',
        qty: 0,
        reserved: 0,
        available: 0,
        locations: new Set(),
      };
      prev.qty += Number(b.qty) || 0;
      prev.reserved += Number(b.qtyReserved) || 0;
      prev.available += availableQty(b);
      if (b.warehouse) prev.locations.add(String(b.warehouse).toUpperCase());
      if (!prev.nameAr && b.nameAr) prev.nameAr = b.nameAr;
      byItem.set(key, prev);
    });
    return [...byItem.values()].sort((a, b) => a.key.localeCompare(b.key, 'ar'));
  }, [balances]);

  const filtered = useMemo(() => {
    const q = term.trim().toUpperCase();
    if (!q) return items.slice(0, 60);
    return items
      .filter((it) => it.key.includes(q) || it.nameAr.toUpperCase().includes(q) || it.barcode.toUpperCase().includes(q))
      .slice(0, 60);
  }, [items, term]);

  const stuck = useMemo(() => stuckBalances(balances), [balances]);

  async function openCard(item) {
    setSelected(item);
    setLoadingMoves(true);
    try {
      const rows = item.sku ? await movesForSku(item.sku) : await movesForBarcode(item.barcode);
      setMoves(rows);
    } catch {
      setMoves([]);
    } finally {
      setLoadingMoves(false);
    }
  }

  // كشف الحركة عبر كل المواقع، بترتيب زمنيّ ورصيدٍ جارٍ إجماليّ.
  const card = useMemo(() => {
    if (!selected || !moves.length) return null;
    // نجمع كل مواقع الصنف في كشفٍ واحد: الرصيد الجاري = صافي الداخل والخارج.
    const ordered = moves
      .slice()
      .sort((a, b) => (a.postedAt?.seconds || 0) - (b.postedAt?.seconds || 0));
    let running = 0;
    const rows = ordered.map((m) => {
      const qty = Number(m.qty) || 0;
      // الداخل إلى مستودع حقيقي يزيد، والخارج منه ينقص. حركات مواقع النظام
      // الداخلية (استلام←رفّ) تظهر كسطرٍ محايد على الإجمالي.
      const toReal = m.to && !isSystem(m.to);
      const fromReal = m.from && !isSystem(m.from);
      let signed = 0;
      if (toReal && !fromReal) signed = qty; // دخل مستودعًا حقيقيًّا
      else if (fromReal && !toReal) signed = -qty; // خرج من مستودع حقيقي
      running += signed;
      return { ...m, signed, balance: running };
    });
    return { rows, closing: running };
  }, [selected, moves]);

  if (!ready) return <p className="text-ink-2 text-sm py-10 text-center">جارٍ التحميل…</p>;
  if (!me) return <Notice>افتح الصفحة بعد تسجيل الدخول ليُقرأ رصيدك.</Notice>;

  return (
    <div dir="rtl" className="space-y-5">
      {/* لوحة الاستثناءات: العالق في مواقع التصفير */}
      {stuck.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">⚠️</span>
            <h3 className="text-sm font-bold text-amber-300">
              {num(stuck.length)} رصيدًا عالقًا في مواقع يجب أن تفرغ
            </h3>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {stuck.slice(0, 12).map((s, i) => (
              <div key={i} className="rounded-lg bg-surface p-2 text-xs">
                <div className="flex justify-between">
                  <span className="font-bold text-ink">{s.sku || s.barcode}</span>
                  <span className="text-amber-300">{num(s.qty)} في {s.locationLabel}</span>
                </div>
                <p className="text-muted mt-1 leading-snug">{s.hint}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* قائمة الأصناف بأرصدتها الحيّة */}
        <div className="rounded-xl bg-surface border border-line p-4">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="ابحث بالكود أو الاسم أو الباركود…"
            className="w-full mb-3 px-3 py-2 rounded-lg bg-surface border border-line text-ink text-sm placeholder-gray-500"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-xs bz-dashboard-table">
              <thead>
                <tr className="text-muted text-right">
                  <th className="py-2">الصنف</th>
                  <th>الموجود</th>
                  <th>المحجوز</th>
                  <th>المتاح</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => (
                  <tr
                    key={it.key}
                    onClick={() => openCard(it)}
                    className={`cursor-pointer border-t border-line hover:bg-surface-2 ${selected?.key === it.key ? 'bg-accent/10' : ''}`}
                  >
                    <td className="py-2">
                      <div className="font-bold text-ink">{it.sku || it.barcode}</div>
                      <div className="text-muted">{it.nameAr}</div>
                    </td>
                    <td className="text-ink-2">{num(it.qty)}</td>
                    <td className="text-amber-300">{num(it.reserved)}</td>
                    <td className="font-bold text-emerald-300">{num(it.available)}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-gray-500">
                      {items.length ? 'لا نتيجة للبحث.' : 'لا أرصدة بعد — ابدأ بقيد مستند أو استيراد رصيد افتتاحي.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* كشف حركة الصنف المختار */}
        <div className="rounded-xl bg-surface border border-line p-4">
          {!selected ? (
            <p className="text-gray-500 text-sm py-10 text-center">اختر صنفًا لعرض كشف حركته الكامل — من الاستلام حتى التسليم.</p>
          ) : (
            <>
              <div className="mb-3">
                <h3 className="text-sm font-bold text-ink">📇 كشف حركة: {selected.sku || selected.barcode}</h3>
                <p className="text-xs text-muted">{selected.nameAr}</p>
              </div>
              {loadingMoves ? (
                <p className="text-muted text-sm py-8 text-center">جارٍ تحميل الحركات…</p>
              ) : !card || !card.rows.length ? (
                <p className="text-gray-500 text-sm py-8 text-center">لا حركات مقيّدة لهذا الصنف بعد.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs bz-dashboard-table">
                    <thead>
                      <tr className="text-muted text-right">
                        <th className="py-2">التاريخ</th>
                        <th>الحركة</th>
                        <th>المستند</th>
                        <th>وارد</th>
                        <th>صادر</th>
                        <th>الرصيد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {card.rows.map((r) => (
                        <tr key={r.id} className="border-t border-line">
                          <td className="py-2 text-muted whitespace-nowrap">{fmtTime(r.postedAt)}</td>
                          <td>
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-bold"
                              style={{ background: `${REASON_TONE[r.reason] || '#6b7280'}22`, color: REASON_TONE[r.reason] || '#9ca3af' }}
                            >
                              {r.reasonLabel || r.reason}
                            </span>
                          </td>
                          <td className="text-ink-2 whitespace-nowrap">{r.docNumber || r.docType}</td>
                          <td className="text-emerald-300">{r.signed > 0 ? num(r.qty) : ''}</td>
                          <td className="text-red-300">{r.signed < 0 ? num(r.qty) : ''}</td>
                          <td className="font-bold text-ink">{num(r.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-line">
                        <td colSpan={5} className="py-2 text-left font-bold text-ink-2">الرصيد الصافي في المستودعات الحقيقية</td>
                        <td className="font-bold text-accent">{num(card.closing)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** هل هذا الرمز موقع نظام؟ نسخة محلّية تتجنّب استيرادًا دائريًّا للعرض. */
function isSystem(code) {
  return ['RECEIVING', 'QUARANTINE', 'STAGING', 'TRANSIT', 'SCRAP', 'ADJUSTMENT'].includes(String(code || '').toUpperCase());
}

function Notice({ children }) {
  return <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-sm p-4">{children}</div>;
}
