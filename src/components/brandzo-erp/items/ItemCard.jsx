/**
 * بطاقة الصنف (SAP-1 · §9.2 ‹186-193›) — الكود هويّةً في الصدارة، والباركود
 * وسيلة بحثٍ لا أكثر.
 *
 * ═══ الكمّيّات الأربع (يسدّ ف‑٢ عرضًا) ═══
 * الموجود والمحجوز من الأرصدة الحيّة، و«المطلوب Ordered» من أوامر الشراء
 * المفتوحة — **تقريبٌ معلَن** بنفس عقد صندوق العمل المفتوح (SAP-12): يُحسب
 * من الروابط المعروفة للمستند، والدقيق يُقرأ داخل المستند. والمتاح بمعادلة
 * النظام القائمة (موجود − محجوز)؛ ضمّ المطلوب إليها عملُ SAP-7 (ف‑١٧) فلا
 * يُستبق برقمٍ لا مصدرَ دفتريّ له.
 *
 * ═══ البدائل (يسدّ ف‑٣) والموردون والعملاء (ف‑٥ جزئيًّا) ═══
 * البدائل أكوادٌ تُستبان من الماستر: الموجود ببطاقته والمفقود يُصرَّح بفقده.
 * وتبويب «الموردون والعملاء» يعرض الموجود فعلًا اليوم (مورّد الشيت) ويُعلن
 * أنّ أكواد الطرف للصنف تأتي مع كتالوج الطرف‑الصنف (SAP-2 · ف‑٦) — لا
 * يُخترع كود.
 *
 * كلّ الحساب في `itemIdentity.js` الخالص المُختبَر؛ هذا عرضٌ له.
 */
import { useEffect, useMemo, useState } from 'react';
import { unitLabel } from '../../../services/itemService.js';
import { ITEM_TYPES, typeOf } from '../../../services/items/itemType.js';
import { uomLabel } from '../../../services/items/uomModel.js';
import {
  balancesForItem,
  itemSearchKeys,
  itemQuantities,
  resolveSubstitutes,
  normalizeItemCode,
} from '../../../services/items/itemIdentity.js';
import { itemOpenDemand } from '../../../services/ledger/openDemand.js';
import { orderedBreakdown, committedBreakdown, inStockBreakdown } from '../../../services/ledger/drill.js';
import { getBasePath } from '../../../services/auth/authService.js';
import { listenDocumentsByTypes } from '../../../services/documents/documentsService.js';
import { measureDocument } from '../../../services/documents/openBox.js';
import { fefoSort, expiryStatus } from '../../../services/balances/balanceKey.js';
import { PARTNER_TYPES } from '../../../services/partners/itemPartnerCatalog.js';
import {
  subscribeCatalogForItem,
  upsertCatalogEntry,
  canEditCatalog,
} from '../../../services/partners/itemPartnerCatalogService.js';
import EntityAttachments from '../documents/EntityAttachments.jsx';
import Icon from '../../ui/Icon.jsx';
import { int, num } from '../../odoo/format.js';

export default function ItemCard({ item, items, balances, me, onEdit, onClose }) {
  const [demandDocs, setDemandDocs] = useState([]);
  // كتالوج الطرف‑الصنف (SAP-2 · ف‑٦): أكواد الموردين والعملاء لهذا الصنف.
  const [catalogEntries, setCatalogEntries] = useState([]);
  const [catalogNote, setCatalogNote] = useState('');
  // الحفر التحليليّ (SAP-13): الرقم المضغوط يفتح قائمته المكوِّنة لا صفحة عامّة.
  const [drill, setDrill] = useState(null); // null | 'inStock' | 'committed' | 'ordered'

  useEffect(() => {
    return subscribeCatalogForItem(
      item?.sku,
      setCatalogEntries,
      // قاعدة المجموعة قد لا تكون منشورة بعد (قرار‑٥) — يُقال ذلك ولا يُخفى.
      () => setCatalogNote('تعذّرت قراءة الكتالوج — القاعدة لم تُنشر بعد (قرار‑٥).')
    );
  }, [item?.sku]);

  // مصدرا الطلب المفتوح (SAP-7): أوامر الشراء (مطلوبٌ قادم) وطلبات النقل
  // (محجوزٌ في المصدر ومطلوبٌ في الوجهة — §14 ‹368›). الاشتراك حيّ.
  useEffect(() => {
    return listenDocumentsByTypes(['PO', 'TR'], setDemandDocs, 300);
  }, []);

  const mine = useMemo(() => balancesForItem(item, balances), [item, balances]);

  const openRows = useMemo(() => {
    const rows = demandDocs.map((d) => measureDocument(d)).filter((r) => r.open);
    return {
      poRows: rows.filter((r) => r.document.type === 'PO'),
      trRows: rows.filter((r) => r.document.type === 'TR'),
    };
  }, [demandDocs]);

  const demand = useMemo(
    () => itemOpenDemand(itemSearchKeys(item), openRows),
    [item, openRows]
  );

  const quantities = useMemo(
    () => itemQuantities({
      balances: mine,
      ordered: demand.ordered,
      committedInTransit: demand.committedInTransit,
    }),
    [mine, demand]
  );

  // قوائم الحفر (SAP-13): تُحسب عند الطلب — ومجموع كلٍّ يطابق رقم بطاقته
  // (يحرسه drill.test). المتاح معادلةٌ من الثلاثة فليس له قائمة رابعة.
  const drillData = useMemo(() => {
    if (!drill) return null;
    const keys = itemSearchKeys(item);
    if (drill === 'inStock') return { title: 'الموجود — أرصدةٌ بمواقعها وتشغيلاتها', ...inStockBreakdown(mine) };
    if (drill === 'committed') return { title: 'المحجوز — وعودات البيع والنقل الصادر', ...committedBreakdown(keys, { balances: mine, trRows: openRows.trRows }) };
    return { title: 'المطلوب — المستندات المفتوحة المكوِّنة', ...orderedBreakdown(keys, openRows) };
  }, [drill, item, mine, openRows]);

  const itemsBySku = useMemo(() => {
    const map = new Map();
    for (const it of items || []) map.set(normalizeItemCode(it.sku), it);
    return map;
  }, [items]);

  const substitutes = useMemo(
    () => resolveSubstitutes(item?.substitutes, itemsBySku),
    [item, itemsBySku]
  );

  const type = ITEM_TYPES[typeOf(item)] || ITEM_TYPES.sale;
  const fefoNext = useMemo(
    () => fefoSort(mine).find((b) => (Number(b.qty) || 0) > 0) || null,
    [mine]
  );
  const nearExpiry = mine.some((b) => ['near', 'expired'].includes(expiryStatus(b.expiry, Date.now())));

  return (
    <div className="o_ds_card o_ds_pad" dir="rtl">
      {/* ═══ الهويّة — الكود في الصدارة، والباركود وسيلة بحث ═══ */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h3 className="o_form_title" style={{ fontSize: '18px', margin: 0 }}>
            <span style={{ fontFamily: 'monospace', direction: 'ltr', display: 'inline-block' }}>{item.sku}</span>
            {item.archived && (
              <span style={{ marginInlineStart: '8px', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
                (مؤرشف)
              </span>
            )}
          </h3>
          <p style={{ margin: '4px 0 0', fontWeight: 'var(--o-font-weight-bold)' }}>
            {item.nameAr || '—'}
            {item.nameEn && (
              <span style={{ marginInlineStart: '8px', color: 'var(--o-main-color-muted)', fontWeight: 'normal' }}>
                {item.nameEn}
              </span>
            )}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
            الكود هو هويّة الصنف — تغيير الاسم لا يقطع تاريخه. الباركود وسيلة بحث.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {onEdit && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(item)}>
              تعديل
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>

      {/* التصنيف والوحدة والباركودات */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '12px 0' }}>
        <Chip label={`النوع: ${type.label}`} />
        <Chip label={`الوحدة: ${unitLabel(item.unit)}`} />
        {/* SAP-3: تعريفات الوحدات — ما يجعل التحويل يعمل لهذا الصنف */}
        {item.baseUom && <Chip label={`الأساس: ${uomLabel(item.baseUom)}`} title="وحدة دفتر المخزون" />}
        {Object.entries(item.uomFactors || {}).map(([u, f]) => (
          <Chip key={u} label={`${uomLabel(u)} × ${num(f)}`} title="معامل التحويل إلى الأساس" />
        ))}
        {item.buyUom && <Chip label={`شراء: ${uomLabel(item.buyUom)}`} title="الوحدة المقترحة في مستندات الشراء" />}
        {item.sellUom && <Chip label={`بيع: ${uomLabel(item.sellUom)}`} title="الوحدة المقترحة في مستندات البيع" />}
        {item.category && <Chip label={`الفئة: ${item.category}`} />}
        {(item.barcodes || []).map((b) => (
          <Chip key={b} label={b} mono title="باركود — وسيلة بحث لا هويّة" />
        ))}
      </div>

      {/* ═══ الكمّيّات الأربع (§9.2 ‹191›) — كلّ رقمٍ يفتح قائمته المكوِّنة (SAP-13) ═══ */}
      <div className="o_dashboard_kpis" style={{ marginBottom: '8px' }}>
        <button
          type="button"
          className="o_kpi"
          onClick={() => setDrill(drill === 'inStock' ? null : 'inStock')}
          style={{ cursor: 'pointer', textAlign: 'inherit', border: drill === 'inStock' ? '1px solid var(--o-brand-primary)' : undefined }}
          title={fefoNext ? `FEFO: أقرب تشغيلة ${fefoNext.batch || '—'} تنتهي ${fefoNext.expiry || '—'} — اضغط للتفصيل` : 'اضغط لأرصدته موقعًا موقعًا'}
        >
          <span className="o_kpi_icon"><Icon name="package" size={20} /></span>
          <span className="o_kpi_value">
            {num(quantities.inStock)}
            {nearExpiry && (
              <span style={{ marginInlineStart: '4px', color: 'var(--o-text-danger)', display: 'inline-flex', verticalAlign: 'middle' }} title="تشغيلة قاربت الانتهاء">
                <Icon name="alertTriangle" size={13} />
              </span>
            )}
          </span>
          <span className="o_kpi_label">الموجود</span>
        </button>
        <button
          type="button"
          className="o_kpi"
          onClick={() => setDrill(drill === 'committed' ? null : 'committed')}
          style={{ cursor: 'pointer', textAlign: 'inherit', border: drill === 'committed' ? '1px solid var(--o-brand-primary)' : undefined }}
          title="وعودات البيع + ما سيخرج بنقلٍ مفتوح (§14 ‹368›) — اضغط للتفصيل"
        >
          <span className="o_kpi_value">{num(quantities.committed)}</span>
          <span className="o_kpi_label">المحجوز</span>
        </button>
        <button
          type="button"
          className="o_kpi"
          onClick={() => setDrill(drill === 'ordered' ? null : 'ordered')}
          style={{ cursor: 'pointer', textAlign: 'inherit', border: drill === 'ordered' ? '1px solid var(--o-brand-primary)' : undefined }}
          title="من أوامر الشراء المفتوحة ووجهات النقل — اضغط لمستنداته"
        >
          <span className="o_kpi_value">{num(quantities.ordered)}</span>
          <span className="o_kpi_label">المطلوب (قادم)</span>
        </button>
        <div className="o_kpi" title="المتاح = الموجود − المحجوز + المطلوب — معادلةٌ من الثلاثة، فافتح أيًّا منها">
          <span className="o_kpi_value" style={quantities.available < 0 ? { color: 'var(--o-text-danger)' } : undefined}>
            {num(quantities.available)}
          </span>
          <span className="o_kpi_label">المتاح</span>
        </div>
      </div>

      {/* قائمة الحفر — الرقم يتفكّك إلى مكوِّناته بمجموعٍ مطابق (§18 ‹921-922›) */}
      {drillData && (
        <div className="o_ds_card o_ds_pad" style={{ marginBottom: '10px', borderInlineStart: '3px solid var(--o-brand-primary, #714B67)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <p style={{ margin: 0, fontSize: 'var(--o-font-size-xs)', fontWeight: 'var(--o-font-weight-bold)' }}>{drillData.title}</p>
            <span style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
              المجموع {num(drillData.total)} — يطابق الرقم
            </span>
          </div>
          {drillData.rows.length === 0 ? (
            <p style={{ margin: 0, fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>لا مكوّنات — الرقم صفر.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--o-font-size-xs)' }}>
              <tbody>
                {drillData.rows.map((r, i) => (
                  <tr key={r.docId || r.balanceId || i} style={{ borderTop: '1px solid var(--o-border-color, #e5e5ea)' }}>
                    <td style={{ padding: '5px 4px' }}>
                      {r.docId ? (
                        <a
                          href={`${getBasePath()}/dashboard/document?type=${encodeURIComponent(r.docType)}&id=${encodeURIComponent(r.docId)}`}
                          style={{ color: 'var(--o-action)', fontWeight: 'var(--o-font-weight-bold)', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '3px' }}
                          title="فتح المستند — ومنه السطر والحركة"
                        >
                          {r.docNumber || r.docType}
                        </a>
                      ) : (
                        <a
                          href={`${getBasePath()}/dashboard/stock-ledger`}
                          style={{ color: 'var(--o-action)', fontWeight: 'var(--o-font-weight-bold)', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '3px' }}
                          title="دفتر الحركات — ومنه المستند والبند والدفعة"
                        >
                          {r.warehouse || '—'}{r.batch ? ` · ${r.batch}` : ''}{r.bin ? ` · ${r.bin}` : ''}
                        </a>
                      )}
                      <span style={{ marginInlineStart: '6px', fontSize: '10px', color: 'var(--o-main-color-muted)' }}>
                        {r.why || (r.expiry ? `صلاحية ${r.expiry}` : '')}
                        {r.docId && r.warehouse ? ` · ${r.warehouse}` : ''}
                      </span>
                    </td>
                    <td style={{ padding: '5px 4px', textAlign: 'left', fontVariantNumeric: 'tabular-nums', fontWeight: 'var(--o-font-weight-bold)', whiteSpace: 'nowrap' }}>
                      {num(r.qty)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      <p style={{ margin: '0 0 14px', fontSize: '11px', color: 'var(--o-main-color-muted)' }}>
        اضغط أيّ رقمٍ لقائمته المكوِّنة — ومنها المستند فالسطر فالحركة فالدفعة والموقع.
      </p>

      {/* ═══ الأصناف البديلة (ف‑٣) ═══ */}
      <Section title="الأصناف البديلة">
        {substitutes.length === 0 ? (
          <p style={{ margin: 0, fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
            لا بدائل مسجّلة — تُضاف أكوادها من «تعديل».
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {substitutes.map(({ sku, item: sub }) => (
              <Chip
                key={sku}
                mono
                label={sub ? `${sku} — ${sub.nameAr}` : `${sku} — غير معرّف في الماستر`}
                danger={!sub}
                title={sub ? 'بديل معرّف في الماستر' : 'كودٌ لا يقابله صنف — صحّحه أو سجّل الصنف'}
              />
            ))}
          </div>
        )}
      </Section>

      {/* ═══ الموردون والعملاء (ف‑٥ · كتالوج SAP-2) ═══ */}
      <Section title="الموردون والعملاء وأكوادهم للصنف">
        {catalogNote && (
          <p style={{ margin: '0 0 8px', fontSize: '11px', color: 'var(--o-text-warning, #8a6d1b)' }}>{catalogNote}</p>
        )}
        {catalogEntries.length === 0 ? (
          <p style={{ margin: 0, fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
            لا كود طرفٍ مسجّلًا لهذا الصنف بعد.
            {item.supplier ? ` (مورّد الشيت: ${item.supplier})` : ''}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--o-font-size-xs)' }}>
              <thead>
                <tr style={{ textAlign: 'right', color: 'var(--o-main-color-muted)' }}>
                  <th style={{ padding: '4px 8px' }}>الطرف</th>
                  <th style={{ padding: '4px 8px' }}>النوع</th>
                  <th style={{ padding: '4px 8px' }}>كوده للصنف</th>
                  <th style={{ padding: '4px 8px' }}>وحدته</th>
                </tr>
              </thead>
              <tbody>
                {catalogEntries.map((e) => (
                  <tr key={e.id} style={{ borderTop: '1px solid var(--o-border-color, #e5e5ea)' }}>
                    <td style={{ padding: '4px 8px' }}>
                      <span style={{ fontFamily: 'monospace', direction: 'ltr', display: 'inline-block' }}>{e.partnerCode}</span>
                      {e.partnerName && <span style={{ marginInlineStart: '6px', color: 'var(--o-main-color-muted)' }}>{e.partnerName}</span>}
                    </td>
                    <td style={{ padding: '4px 8px' }}>{PARTNER_TYPES[e.partnerType] || e.partnerType}</td>
                    <td style={{ padding: '4px 8px', fontFamily: 'monospace', direction: 'ltr' }}>{e.partnerItemCode}</td>
                    <td style={{ padding: '4px 8px' }}>
                      {e.uom || '—'}
                      {e.conversionFactor ? ` × ${num(e.conversionFactor)}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canEditCatalog(me?.role) && <CatalogEntryForm sku={item.sku} />}
        <p style={{ margin: '6px 0 0', fontSize: '11px', color: 'var(--o-main-color-muted)' }}>
          التخزين على الهويّة الداخليّة دائمًا — كود الطرف عرضٌ في مستنده ووسيلة بحثٍ في بنوده.
        </p>
      </Section>

      {/* ═══ مرفقات الصنف (SAP-11 · ف‑٢٨): شهادة · صورة · نشرة — على البطاقة لا في ملاحظة ═══ */}
      <Section title="المرفقات">
        <EntityAttachments entityKind="item" entityId={item.sku} me={me} />
      </Section>

      {/* ═══ الأرصدة التفصيليّة — كلّ رقمٍ يقف على صفوفه ═══ */}
      <Section title={`الأرصدة (${int(mine.length)} صفّ)`}>
        {mine.length === 0 ? (
          <p style={{ margin: 0, fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
            لا أرصدة تفصيليّة — الرصيد الدفتريّ من الشيت: {num(item.balance ?? 0)}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--o-font-size-xs)' }}>
              <thead>
                <tr style={{ textAlign: 'right', color: 'var(--o-main-color-muted)' }}>
                  <th style={{ padding: '4px 8px' }}>المخزن</th>
                  <th style={{ padding: '4px 8px' }}>التشغيلة</th>
                  <th style={{ padding: '4px 8px' }}>الصلاحية</th>
                  <th style={{ padding: '4px 8px' }}>الكمّيّة</th>
                  <th style={{ padding: '4px 8px' }}>المحجوز</th>
                </tr>
              </thead>
              <tbody>
                {fefoSort(mine).map((b, i) => (
                  <tr key={b.id || i} style={{ borderTop: '1px solid var(--o-border-color, #e5e5ea)' }}>
                    <td style={{ padding: '4px 8px' }}>{b.warehouse || '—'}</td>
                    <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{b.batch || '—'}</td>
                    <td style={{ padding: '4px 8px' }}>{b.expiry || '—'}</td>
                    <td style={{ padding: '4px 8px', fontVariantNumeric: 'tabular-nums' }}>{num(b.qty ?? 0)}</td>
                    <td style={{ padding: '4px 8px', fontVariantNumeric: 'tabular-nums' }}>{num(b.qtyReserved ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

/**
 * إدخال كود طرفٍ للصنف — للمديرَين (تطابق قاعدة المجموعة).
 * الإلزاميّ ثلاثة فقط (§10.2 ‹251›): النوع والرمز وكوده للصنف.
 * الخدمة ترفض طرفًا أو صنفًا لا وجود له — الكتالوج يربط ولا يُنشئ.
 */
function CatalogEntryForm({ sku }) {
  const [form, setForm] = useState({ partnerType: 'supplier', partnerCode: '', partnerItemCode: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { kind: 'ok'|'err', text }

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      await upsertCatalogEntry({ ...form, sku });
      setMsg({ kind: 'ok', text: `سُجّل كود ${form.partnerCode} للصنف.` });
      setForm((f) => ({ ...f, partnerCode: '', partnerItemCode: '' }));
    } catch (err) {
      setMsg({ kind: 'err', text: err?.message ?? 'تعذّر الحفظ' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginTop: '10px' }}>
      <select
        className="o_input"
        style={{ width: 'auto' }}
        value={form.partnerType}
        onChange={(e) => setForm((f) => ({ ...f, partnerType: e.target.value }))}
        aria-label="نوع الطرف"
      >
        {Object.entries(PARTNER_TYPES).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <input
        className="o_input"
        style={{ width: '150px', direction: 'ltr', textAlign: 'right' }}
        placeholder="رمز الطرف (BP)"
        value={form.partnerCode}
        onChange={(e) => setForm((f) => ({ ...f, partnerCode: e.target.value }))}
        aria-label="رمز الطرف"
      />
      <input
        className="o_input"
        style={{ width: '170px', direction: 'ltr', textAlign: 'right' }}
        placeholder="كوده لهذا الصنف"
        value={form.partnerItemCode}
        onChange={(e) => setForm((f) => ({ ...f, partnerItemCode: e.target.value }))}
        aria-label="كود الطرف للصنف"
      />
      <button type="submit" className="btn btn-secondary btn-sm" disabled={busy}>
        {busy ? 'جارٍ الحفظ…' : 'تسجيل الكود'}
      </button>
      {msg && (
        <span style={{ fontSize: '11px', color: msg.kind === 'err' ? 'var(--o-text-danger, #b3261e)' : 'var(--o-text-success, #1a7f37)' }}>
          {msg.text}
        </span>
      )}
    </form>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <h4 style={{ margin: '0 0 8px', fontSize: 'var(--o-font-size-sm)', fontWeight: 'var(--o-font-weight-bold)' }}>{title}</h4>
      {children}
    </div>
  );
}

function Chip({ label, mono = false, danger = false, title }) {
  return (
    <span
      title={title}
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: '999px',
        fontSize: 'var(--o-font-size-xs)',
        background: danger ? 'var(--o-bg-danger, #fdeaea)' : 'var(--o-chip, #f4f4f6)',
        color: danger ? 'var(--o-text-danger, #b3261e)' : 'var(--o-main-color, inherit)',
        border: '1px solid var(--o-border-color, #e5e5ea)',
        fontFamily: mono ? 'monospace' : undefined,
        direction: mono ? 'ltr' : undefined,
      }}
    >
      {label}
    </span>
  );
}
