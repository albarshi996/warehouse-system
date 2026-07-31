import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listenBalances } from '../../../services/balances/balancesService.js';
import { movesForSku, movesForBarcode } from '../../../services/ledger/ledgerService.js';
import { availableQty } from '../../../services/ledger/reservations.js';
import { stuckBalances } from '../../../services/ledger/locations.js';
import Icon from '../../ui/Icon.jsx';
import ListView from '../../odoo/ListView.jsx';
import { num } from '../../odoo/format.js';

/**
 * دفتر حركات المخزون — أوّل ثمرة يلمسها المستخدم من الدفتر.
 *
 * يجيب سؤالين لم يكن للنظام جوابٌ عنهما: «كم رصيدي الحقيقي المتاح؟» و«من أين
 * جاء هذا الرصيد؟». الأوّل من الأرصدة الحيّة (الموجود ناقص المحجوز)، والثاني
 * من كشف الحركة الذي يعيد بناء القصّة من الدفتر: كل زيادة ونقصان بمستنده.
 *
 * ولوحة الاستثناءات أعلاه تعرض ما لا ينبغي أن يكون: رصيدٌ عالق في موقعٍ كان
 * يجب أن يفرغ — بضاعةٌ وصلت ولم تُخزَّن، أو شُحنت ولم تُستلم.
 *
 * المرحلة ٤ (2026-07-31): أُعيد كساء العرض بمكوّنات أودو داخل `.o_theme`
 * (ListView + o_alert + o_ds_card) — **المنطق (الاشتراكات والأرصدة والكشف
 * ولوحة الاستثناءات) لم يُمسّ**، غُيّر ما يُرسَم فقط. الأرقام لاتينية (R2) عبر format.
 */

function fmtTime(ts) {
  const d = ts?.toDate?.();
  if (!d) return '—';
  return d.toLocaleString('ar-LY-u-nu-latn', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
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

const ITEM_COLS = [
  { key: 'item', label: 'الصنف' },
  { key: 'qty', label: 'الموجود', numeric: true },
  { key: 'reserved', label: 'المحجوز', numeric: true },
  { key: 'available', label: 'المتاح', numeric: true },
];

const MOVE_COLS = [
  { key: 'date', label: 'التاريخ' },
  { key: 'reason', label: 'الحركة' },
  { key: 'doc', label: 'المستند' },
  { key: 'inQty', label: 'وارد', numeric: true },
  { key: 'outQty', label: 'صادر', numeric: true },
  { key: 'balance', label: 'الرصيد', numeric: true },
];

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

  if (!ready) {
    return (
      <div className="o_theme" dir="rtl">
        <div className="o_ds"><div className="o_dashboard_empty">جارٍ التحميل…</div></div>
      </div>
    );
  }
  if (!me) {
    return (
      <div className="o_theme" dir="rtl">
        <div className="o_ds"><Notice>افتح الصفحة بعد تسجيل الدخول ليُقرأ رصيدك.</Notice></div>
      </div>
    );
  }

  const itemRows = filtered.map((it) => ({
    id: it.key,
    item: it,
    decoration: selected?.key === it.key ? 'bf' : undefined,
    cells: {
      item: (
        <div>
          <div className="decoration-bf">{it.sku || it.barcode}</div>
          <div style={{ color: 'var(--o-main-color-muted)', fontSize: 'var(--o-font-size-xs)' }}>{it.nameAr}</div>
        </div>
      ),
      qty: num(it.qty),
      reserved: <span style={{ color: 'var(--o-text-warning)' }}>{num(it.reserved)}</span>,
      available: <span className="decoration-bf" style={{ color: 'var(--o-text-success)' }}>{num(it.available)}</span>,
    },
  }));

  const moveRows = (card?.rows || []).map((r) => ({
    id: r.id,
    cells: {
      date: <span style={{ color: 'var(--o-main-color-muted)' }}>{fmtTime(r.postedAt)}</span>,
      reason: (
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: '10px',
            fontSize: '11px',
            fontWeight: 600,
            background: `${REASON_TONE[r.reason] || '#6b7280'}22`,
            color: REASON_TONE[r.reason] || '#9ca3af',
          }}
        >
          {r.reasonLabel || r.reason}
        </span>
      ),
      doc: r.docNumber || r.docType,
      inQty: r.signed > 0 ? <span style={{ color: 'var(--o-text-success)' }}>{num(r.qty)}</span> : '',
      outQty: r.signed < 0 ? <span style={{ color: 'var(--o-text-warning)' }}>{num(r.qty)}</span> : '',
      balance: <span className="decoration-bf">{num(r.balance)}</span>,
    },
  }));

  return (
    <div className="o_theme" dir="rtl">
      <div className="o_control_panel">
        <div className="o_cp_start">
          <nav className="o_breadcrumb" aria-label="مسار التنقّل"><span className="o_active">دفتر حركات المخزون</span></nav>
        </div>
      </div>

      <div className="o_ds">
        {/* لوحة الاستثناءات: العالق في مواقع التصفير */}
        {stuck.length > 0 && (
          <div className="o_alert warning" style={{ marginBottom: '18px' }}>
            <div className="o_alert_title">
              <Icon name="alertTriangle" size={16} /> {num(stuck.length)} رصيدًا عالقًا في مواقع يجب أن تفرغ
            </div>
            <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {stuck.slice(0, 12).map((s, i) => (
                <div
                  key={i}
                  style={{
                    background: 'var(--o-view-background)',
                    border: '1px solid var(--o-border-color)',
                    borderRadius: 'var(--o-border-radius)',
                    padding: '10px 12px',
                    color: 'var(--o-main-text-color)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <span className="decoration-bf">{s.sku || s.barcode}</span>
                    <span style={{ color: 'var(--o-text-warning)' }}>{num(s.qty)} في {s.locationLabel}</span>
                  </div>
                  <p style={{ color: 'var(--o-main-color-muted)', margin: '6px 0 0', fontSize: 'var(--o-font-size-xs)', lineHeight: 1.5 }}>{s.hint}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="o_dashboard_grid2">
          {/* قائمة الأصناف بأرصدتها الحيّة */}
          <div className="o_ds_card">
            <div className="o_ds_toolbar">
              <div className="o_searchview">
                <span className="o_searchview_icon" aria-hidden="true">⌕</span>
                <input
                  type="search"
                  aria-label="بحث"
                  placeholder="ابحث بالكود أو الاسم أو الباركود…"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                />
              </div>
            </div>
            {filtered.length === 0 ? (
              <div className="o_dashboard_empty">
                {items.length ? 'لا نتيجة للبحث.' : 'لا أرصدة بعد — ابدأ بقيد مستند أو استيراد رصيد افتتاحي.'}
              </div>
            ) : (
              <ListView selectable={false} columns={ITEM_COLS} rows={itemRows} onRowClick={(row) => openCard(row.item)} />
            )}
          </div>

          {/* كشف حركة الصنف المختار */}
          <div className="o_ds_card o_ds_pad">
            {!selected ? (
              <div className="o_dashboard_empty">اختر صنفًا لعرض كشف حركته الكامل — من الاستلام حتى التسليم.</div>
            ) : (
              <>
                <div style={{ marginBottom: '12px' }}>
                  <h3 className="o_form_title" style={{ fontSize: '16px', margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icon name="notebook" size={16} /> كشف حركة: {selected.sku || selected.barcode}
                  </h3>
                  <p style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', margin: 0 }}>{selected.nameAr}</p>
                </div>
                {loadingMoves ? (
                  <div className="o_dashboard_empty">جارٍ تحميل الحركات…</div>
                ) : !card || !card.rows.length ? (
                  <div className="o_dashboard_empty">لا حركات مقيّدة لهذا الصنف بعد.</div>
                ) : (
                  <ListView
                    selectable={false}
                    columns={MOVE_COLS}
                    rows={moveRows}
                    footer={{
                      label: 'الرصيد الصافي في المستودعات الحقيقية',
                      cells: { balance: <span className="decoration-bf" style={{ color: 'var(--o-action)' }}>{num(card.closing)}</span> },
                    }}
                  />
                )}
              </>
            )}
          </div>
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
  return <div className="o_alert danger">{children}</div>;
}
