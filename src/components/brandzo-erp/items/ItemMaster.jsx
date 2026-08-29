import React, { useEffect, useMemo, useState } from 'react';
import {
  subscribeItems,
  archiveItem,
  unarchiveItem,
  UNIT_OPTIONS,
} from '../../../services/items/itemService.js';
import { canImport } from '../../../services/items/itemsImportService.js';
import { uomDebtReport, uomDebtExportRows } from '../../../services/items/uomWiring.js';
import { exportItemsMaster } from '../../../services/excel/excelExport.js';
import { listenBalances } from '../../../services/balances/balancesService.js';
import { totalQty, stockValue, fefoSort, expiryStatus } from '../../../services/balances/balanceKey.js';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import Icon from '../../ui/Icon.jsx';
import ListView from '../../odoo/ListView.jsx';
import Pager from '../../odoo/Pager.jsx';
import { pageSlice } from '../../../services/ui/pagination.js';

const PAGE_SIZE = 50;
import { int, num } from '../../odoo/format.js';
import ItemForm from './ItemForm.jsx';
import ItemCard from './ItemCard.jsx';
import ItemsImport from './ItemsImport.jsx';
import BalancesImport from './BalancesImport.jsx';
import PendingItems from './PendingItems.jsx';

/**
 * Items master screen. Real-time list of `Items_Master`, with search,
 * add/edit/archive controls, and Excel import (managers only).
 *
 * المرحلة ٤ (2026-07-31): أُعيد كساء العرض بمكوّنات أودو داخل `.o_theme`
 * (ListView + o_input + o_alert + o_kpi + Icon) — **المنطق (الاشتراكات،
 * الأرصدة الحيّة، FEFO، الاستيراد) لم يُمسّ**، غُيّر ما يُرسَم فقط.
 * الأرقام لاتينية (R2) عبر format.
 */

const LIST_COLS = [
  { key: 'sku', label: 'SKU' },
  { key: 'barcode', label: 'الباركود' },
  { key: 'nameAr', label: 'الاسم (AR)' },
  { key: 'nameEn', label: 'الاسم (EN)' },
  { key: 'category', label: 'الفئة' },
  { key: 'unit', label: 'الوحدة' },
  { key: 'balance', label: 'الرصيد', numeric: true },
  { key: 'minStock', label: 'الحد الأدنى', numeric: true },
  { key: 'actions', label: 'إجراءات' },
];

export default function ItemMaster() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState(null); // null | { mode, item? }
  const [cardSku, setCardSku] = useState(null); // بطاقة الصنف (SAP-1) — كود الصنف المعروض
  const [importing, setImporting] = useState(false);
  const [importingBalances, setImportingBalances] = useState(false);
  const [balances, setBalances] = useState([]);
  const [me, setMe] = useState(null);
  const [toast, setToast] = useState(null); // { kind, text }

  // دَينُ الوحدات — الحكم في النواة، والشاشة تعرضه وتُصدّره (CAP-107).
  const uomDebt = useMemo(() => uomDebtReport(items), [items]);

  /** تصدير قائمة العمل — لا يمنع شيئًا، يُخرج ما يُشتغل عليه بالتدريج. */
  async function exportUomDebt() {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(uomDebtExportRows(uomDebt));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'دين الوحدات');
    XLSX.writeFile(wb, 'Brandzo-UoM-Debt.xlsx');
  }

  /**
   * تصديرُ الماستر إلى إكسل — **الاتّجاه المفقود**.
   *
   * الشاشةُ كانت تستورد ولا تُصدّر، و`exportItemsMaster` مبنيّةٌ منذ زمنٍ
   * **بلا مستدعٍ**. وأثرُ النقص عمليّ: من أراد أن يعرف أيُّ الأصناف مسجَّلٌ
   * قبل أن يستورد دفعةً جديدة لم يكن أمامه إلّا أن يقلّب الشاشة صفحةً صفحة.
   *
   * والملفُّ يخرج **بترويسة الاستيراد نفسِها** — فما يخرج يعود كما هو.
   * ويُصدَّر ما تراه العينُ الآن (بعد البحث والأرشيف) لا ما في القاعدة كلِّها.
   */
  function exportMaster() {
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const name = exportItemsMaster(filtered, { fileName: `Brandzo_Items_Master_${stamp}` });
      setToast({ kind: 'ok', text: `صُدِّر ${filtered.length} صنفًا إلى ${name}` });
    } catch (e) {
      setToast({ kind: 'err', text: e?.message || 'تعذّر التصدير.' });
    }
  }

  // الدور — لإظهار زرّ الاستيراد للمخوَّلين فقط (الإلزام الحقيقي في قواعد Firestore).
  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      setMe(user ? await fetchUserProfile(user) : null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeItems(
      (next) => {
        setItems(next);
        setLoading(false);
      },
      (err) => {
        setError(err?.message ?? 'تعذر الاتصال بقاعدة البيانات');
        setLoading(false);
      },
      { includeArchived: showArchived }
    );
    return () => unsubscribe();
  }, [showArchived]);

  // أرصدة المخزون الحيّة — لعرض الكمية الحقيقية والقيمة وحالة الصلاحية.
  useEffect(() => {
    const unsub = listenBalances(setBalances, () => {});
    return () => unsub();
  }, []);

  // فهرسة الأرصدة بكود الصنف وبباركوده — للربط السريع بصفوف الجدول.
  const balByItem = useMemo(() => {
    const map = new Map();
    for (const b of balances) {
      for (const k of [b.sku, b.barcode].filter(Boolean)) {
        const key = String(k).toUpperCase();
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(b);
      }
    }
    return map;
  }, [balances]);

  const flashToast = (kind, text) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3000);
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((it) =>
      [it.sku, it.nameAr, it.nameEn, it.category, ...(it.barcodes || [])]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term))
    );
  }, [items, search]);

  // ترقيم من طرف العميل فوق القائمة المحمّلة — يكشف الذيل بدل قصّه صامتًا (المحور ٧).
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [search, showArchived]);
  const pageItems = useMemo(() => pageSlice(filtered, page, PAGE_SIZE), [filtered, page]);

  const handleArchive = async (item) => {
    const ok = window.confirm(`هل تريد بالتأكيد أرشفة الصنف ${item.sku}؟`);
    if (!ok) return;
    try {
      await archiveItem(item.sku);
      flashToast('success', `تمت أرشفة ${item.sku}`);
    } catch (err) {
      flashToast('error', err?.message ?? 'فشلت الأرشفة');
    }
  };

  const handleUnarchive = async (item) => {
    try {
      await unarchiveItem(item.sku);
      flashToast('success', `تمت استعادة ${item.sku}`);
    } catch (err) {
      flashToast('error', err?.message ?? 'فشلت الاستعادة');
    }
  };

  // بناء صفوف ListView — نُبقي منطق الرصيد الحيّ حرفيًّا وننقل عرضه فقط لخلايا.
  const listRows = pageItems.map((it) => {
    // الرصيد الحقيقي من مخزن الأرصدة إن وُجد، وإلا الحقل المستورد.
    const keys = [it.sku, ...(it.barcodes || [])].filter(Boolean).map((k) => String(k).toUpperCase());
    const itemBal = [];
    const seen = new Set();
    for (const k of keys) {
      for (const b of balByItem.get(k) || []) {
        if (!seen.has(b.id)) { seen.add(b.id); itemBal.push(b); }
      }
    }
    const liveQty = itemBal.length ? totalQty(itemBal) : null;
    const shownQty = liveQty != null ? liveQty : (it.balance ?? 0);
    const nearExpiry = itemBal.some(
      (b) => ['near', 'expired'].includes(expiryStatus(b.expiry, Date.now()))
    );
    const lowStock = shownQty <= (it.minStock ?? 0);
    const fefoNext = liveQty != null ? fefoSort(itemBal).find((b) => (Number(b.qty) || 0) > 0) : null;
    return {
      id: it.sku,
      decoration: it.archived ? 'muted' : undefined,
      cells: {
        // الكود يفتح بطاقة الصنف (SAP-1 · §9.2) — الهويّة بوّابة كلّ شيء.
        sku: (
          <button
            type="button"
            onClick={() => setCardSku(it.sku)}
            title="فتح بطاقة الصنف"
            style={{
              fontFamily: 'monospace',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: 'var(--o-action)',
              fontWeight: 'var(--o-font-weight-bold)',
              textDecoration: 'underline',
              textDecorationStyle: 'dotted',
              textUnderlineOffset: '3px',
            }}
          >
            {it.sku}
          </button>
        ),
        barcode: (
          <span
            style={{ direction: 'ltr', display: 'inline-block', fontFamily: 'monospace', fontSize: 'var(--o-font-size-xs)' }}
            title={(it.barcodes || []).join('\n')}
          >
            {it.barcodes?.length ? (
              <>
                {it.barcodes[0]}
                {it.barcodes.length > 1 && (
                  <span style={{ marginInlineStart: '4px', color: 'var(--o-action)', fontWeight: 'var(--o-font-weight-bold)' }}>
                    +{int(it.barcodes.length - 1)}
                  </span>
                )}
              </>
            ) : (
              '—'
            )}
          </span>
        ),
        nameAr: it.nameAr || '—',
        nameEn: it.nameEn || '—',
        category: it.category || '—',
        unit: unitLabel(it.unit),
        balance: (
          <span
            style={{ fontWeight: 'var(--o-font-weight-bold)', whiteSpace: 'nowrap', color: lowStock ? 'var(--o-text-warning)' : undefined }}
            title={
              fefoNext
                ? `FEFO: أقرب تشغيلة ${fefoNext.batch || '—'} @ ${fefoNext.warehouse} تنتهي ${fefoNext.expiry || '—'}`
                : liveQty != null
                  ? `موزّع على ${int(itemBal.length)} موقع/تشغيلة`
                  : 'من الشيت — لا أرصدة تفصيلية بعد'
            }
          >
            {num(shownQty)}
            {nearExpiry && (
              <span
                title="تشغيلة قاربت الانتهاء"
                style={{ marginInlineStart: '4px', color: 'var(--o-text-danger)', display: 'inline-flex', verticalAlign: 'middle' }}
              >
                <Icon name="alertTriangle" size={13} />
              </span>
            )}
            {liveQty == null && it.balance != null && (
              <span style={{ marginInlineStart: '4px', fontSize: '10px', color: 'var(--o-main-color-muted)' }} title="من شيت الأصناف — لا أرصدة تفصيلية">
                ~
              </span>
            )}
          </span>
        ),
        minStock: num(it.minStock ?? 0),
        actions: (
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditor({ mode: 'edit', item: it })}>تعديل</button>
            {it.archived ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleUnarchive(it)}>استعادة</button>
            ) : (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleArchive(it)}>أرشفة</button>
            )}
          </div>
        ),
      },
    };
  });

  return (
    <div className="o_theme" dir="rtl">
      <div className="o_control_panel">
        <div className="o_cp_start">
          <nav className="o_breadcrumb" aria-label="مسار التنقّل"><span className="o_active">إدارة الأصناف</span></nav>
        </div>
        <div className="o_cp_end" style={{ gap: '8px' }}>
          {/* التصدير متاحٌ لكلّ من يرى القائمة — يُخرج ما هو معروضٌ أمامه لا أكثر. */}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={exportMaster}
            disabled={!filtered.length}
            title="يُخرج الأصناف المعروضة بترويسة الاستيراد نفسها"
          >
            <Icon name="arrowUpTray" size={15} /> تصدير الأصناف
          </button>
          {canImport(me?.role) && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setImporting((v) => !v);
                  setImportingBalances(false);
                  setEditor(null);
                }}
              >
                <Icon name="arrowDownTray" size={15} /> استيراد الأصناف
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setImportingBalances((v) => !v);
                  setImporting(false);
                  setEditor(null);
                }}
              >
                <Icon name="barChart3" size={15} /> استيراد الأرصدة
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEditor({ mode: 'create' });
              setImporting(false);
            }}
          >
            <Icon name="package" size={15} /> إضافة صنف
          </button>
        </div>
      </div>

      <div className="o_ds">
        <p style={{ fontSize: 'var(--o-font-size-sm)', color: 'var(--o-main-color-muted)', margin: '0 0 14px', lineHeight: 1.6 }}>
          إنشاء وتعديل بيانات أصناف Brandzo. كود SKU هو المعرّف الفريد لكل صنف.
        </p>

        {toast && <div className={`o_alert ${toast.kind === 'error' ? 'danger' : 'success'}`}>{toast.text}</div>}
        {error && !loading && <div className="o_alert danger">{error}</div>}

        {/* دَينُ الوحدات — قياسٌ لا منع (CAP-107 · ق-٢ رفع الحجب عن العدّ) */}
        {uomDebt.rows.length > 0 && (
          <div className="o_ds_card o_ds_pad" style={{ marginBottom: '14px', borderInlineStart: '4px solid var(--o-text-warning, #8a6d1b)' }}>
            <p style={{ margin: '0 0 6px', fontSize: 'var(--o-font-size-sm)', fontWeight: 'var(--o-font-weight-bold)' }}>
              دَينُ الوحدات — قائمة عملٍ قبل أوّل جردٍ حقيقيّ
            </p>
            <p style={{ margin: '0 0 8px', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', lineHeight: 1.7 }}>
              <strong>{int(uomDebt.missingBase)}</strong> صنفًا بلا وحدة أساس ·{' '}
              <strong>{int(uomDebt.missingFactor)}</strong> صنفًا فيه وحدةٌ بلا معامل تحويل — من{' '}
              {int(uomDebt.total)} صنفًا نشطًا.
              <br />
              وهذا قياسٌ لا يمنع شيئًا: الجرد يمضي، والناقص يُوسم ويُحسم في المراجعة.
              لكنّ <strong>الكمّيّة بلا وحدةٍ رقمٌ بلا معنى</strong> — فهذه أولويّة ما قبل الجرد.
            </p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={exportUomDebt}>
              <Icon name="arrowDownTray" size={14} /> تصدير قائمة العمل
            </button>
          </div>
        )}

        {importing && (
          <div style={{ marginBottom: '18px' }}>
            <ItemsImport
              onDone={({ created, updated }) => {
                setImporting(false);
                flashToast('success', `تم الاستيراد: ${created} صنف جديد · ${updated} حُدِّث`);
              }}
              onCancel={() => setImporting(false)}
            />
          </div>
        )}

        {importingBalances && (
          <div style={{ marginBottom: '18px' }}>
            <BalancesImport
              onDone={({ created, updated }) => {
                setImportingBalances(false);
                flashToast('success', `أرصدة: ${created} جديد · ${updated} حُدِّث`);
              }}
              onCancel={() => setImportingBalances(false)}
            />
          </div>
        )}

        {/* الأصناف المعلّقة (I-د) — للمديرَين وحدهما: هما من يبتّ فيها */}
        {canImport(me?.role) && <PendingItems me={me} onFlash={flashToast} />}

        {/* ملخّص المخزون الحيّ — يظهر متى وُجدت أرصدة */}
        {balances.length > 0 && (
          <div className="o_dashboard_kpis" style={{ marginBottom: '18px' }}>
            <div className="o_kpi">
              <span className="o_kpi_icon"><Icon name="layers" size={20} /></span>
              <span className="o_kpi_value">{int(balances.length)}</span>
              <span className="o_kpi_label">سطور أرصدة</span>
            </div>
            <div className="o_kpi">
              <span className="o_kpi_icon"><Icon name="package" size={20} /></span>
              <span className="o_kpi_value">{int(totalQty(balances))}</span>
              <span className="o_kpi_label">إجمالي الكمية</span>
            </div>
            <div className="o_kpi">
              <span className="o_kpi_icon"><Icon name="dollarSign" size={20} /></span>
              <span className="o_kpi_value">{int(stockValue(balances))} د.ل</span>
              <span className="o_kpi_label">قيمة المخزون</span>
            </div>
            <div className="o_kpi alert">
              <span className="o_kpi_icon"><Icon name="alertTriangle" size={20} /></span>
              <span className="o_kpi_value">
                {int(balances.filter((b) => expiryStatus(b.expiry, Date.now()) === 'near' || expiryStatus(b.expiry, Date.now()) === 'expired').length)}
              </span>
              <span className="o_kpi_label">تشغيلات قاربت الانتهاء</span>
            </div>
          </div>
        )}

        {/* بطاقة الصنف (SAP-1 · §9.2): الكمّيّات الأربع والبدائل والموردون — تُفتح من كود الصنف */}
        {cardSku && (() => {
          const cardItem = items.find((it) => it.sku === cardSku);
          if (!cardItem) return null;
          return (
            <div style={{ marginBottom: '18px' }}>
              <ItemCard
                item={cardItem}
                items={items}
                balances={balances}
                me={me}
                onEdit={(it) => {
                  setCardSku(null);
                  setEditor({ mode: 'edit', item: it });
                  setImporting(false);
                  setImportingBalances(false);
                }}
                onClose={() => setCardSku(null)}
              />
            </div>
          );
        })()}

        {editor && (
          <div style={{ marginBottom: '18px' }}>
            <ItemForm
              mode={editor.mode}
              item={editor.item}
              onSaved={(sku) => {
                setEditor(null);
                flashToast(
                  'success',
                  editor.mode === 'create' ? `تمت إضافة الصنف ${sku}` : `تم حفظ تعديلات ${sku}`
                );
              }}
              onCancel={() => setEditor(null)}
            />
          </div>
        )}

        <div className="o_ds_card">
          <div className="o_ds_toolbar">
            <div className="o_searchview">
              <span className="o_searchview_icon" aria-hidden="true">⌕</span>
              <input
                type="search"
                aria-label="بحث"
                placeholder="بحث بالكود أو الاسم أو الفئة…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <label className="o_toggle">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              إظهار الأصناف المؤرشفة
            </label>
          </div>

          {loading ? (
            <div className="o_dashboard_empty">جاري جلب البيانات من السحابة…</div>
          ) : filtered.length === 0 ? (
            <div className="o_dashboard_empty">
              {items.length === 0
                ? 'لا توجد أصناف بعد. ابدأ بإضافة صنف جديد.'
                : 'لا توجد نتائج مطابقة للبحث.'}
            </div>
          ) : (
            <>
              <ListView selectable={false} columns={LIST_COLS} rows={listRows} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <Pager total={filtered.length} page={page} size={PAGE_SIZE} onPage={setPage} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function unitLabel(value) {
  const opt = UNIT_OPTIONS.find((u) => u.value === value);
  return opt?.labelAr ?? value ?? '—';
}
