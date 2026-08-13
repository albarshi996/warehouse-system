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
import {
  balancesForItem,
  orderedForItem,
  itemQuantities,
  resolveSubstitutes,
  normalizeItemCode,
} from '../../../services/items/itemIdentity.js';
import { listenDocumentsByTypes } from '../../../services/documents/documentsService.js';
import { measureDocument } from '../../../services/documents/openBox.js';
import { fefoSort, expiryStatus } from '../../../services/balances/balanceKey.js';
import Icon from '../../ui/Icon.jsx';
import { int, num } from '../../odoo/format.js';

export default function ItemCard({ item, items, balances, onEdit, onClose }) {
  const [poDocs, setPoDocs] = useState([]);

  // أوامر الشراء وحدها — مصدر «المطلوب». الاشتراك حيّ كبقيّة الشاشة.
  useEffect(() => {
    return listenDocumentsByTypes(['PO'], setPoDocs, 300);
  }, []);

  const mine = useMemo(() => balancesForItem(item, balances), [item, balances]);

  const openPoRows = useMemo(
    () => poDocs.map((d) => measureDocument(d)).filter((r) => r.open),
    [poDocs]
  );

  const quantities = useMemo(
    () => itemQuantities({ balances: mine, ordered: orderedForItem(item, openPoRows) }),
    [item, mine, openPoRows]
  );

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
        {item.category && <Chip label={`الفئة: ${item.category}`} />}
        {(item.barcodes || []).map((b) => (
          <Chip key={b} label={b} mono title="باركود — وسيلة بحث لا هويّة" />
        ))}
      </div>

      {/* ═══ الكمّيّات الأربع (§9.2 ‹191›) ═══ */}
      <div className="o_dashboard_kpis" style={{ marginBottom: '14px' }}>
        <div className="o_kpi" title={fefoNext ? `FEFO: أقرب تشغيلة ${fefoNext.batch || '—'} تنتهي ${fefoNext.expiry || '—'}` : 'من الأرصدة الحيّة'}>
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
        </div>
        <div className="o_kpi" title="ما وُعد به ولم يُسحب بعد — يُفكّ بالسحب أو بسقوط الأمر">
          <span className="o_kpi_value">{num(quantities.committed)}</span>
          <span className="o_kpi_label">المحجوز</span>
        </div>
        <div className="o_kpi" title="تقريبٌ من أوامر الشراء المفتوحة المعروفة الروابط — الدقيق داخل المستند">
          <span className="o_kpi_value">{num(quantities.ordered)}</span>
          <span className="o_kpi_label">المطلوب (قادم)</span>
        </div>
        <div className="o_kpi" title="المتاح = الموجود − المحجوز. ضمّ «المطلوب» إلى المعادلة يأتي مع دفتر المخزون (SAP-7)">
          <span className="o_kpi_value">{num(quantities.available)}</span>
          <span className="o_kpi_label">المتاح</span>
        </div>
      </div>
      <p style={{ margin: '0 0 14px', fontSize: '11px', color: 'var(--o-main-color-muted)' }}>
        «المطلوب» محسوبٌ من الروابط المعروفة لأوامر الشراء المفتوحة — افتح المستند لترى الرقم الدقيق.
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

      {/* ═══ الموردون والعملاء (ف‑٥ — يكتمل بكتالوج SAP-2) ═══ */}
      <Section title="الموردون والعملاء">
        {item.supplier ? (
          <p style={{ margin: 0, fontSize: 'var(--o-font-size-sm)' }}>
            المورّد (من شيت الأصناف): <strong>{item.supplier}</strong>
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
            لا مورّد مسجّل في شيت الأصناف.
          </p>
        )}
        <p style={{ margin: '6px 0 0', fontSize: '11px', color: 'var(--o-main-color-muted)' }}>
          أكواد الطرف للصنف (كود المورّد/العميل) تأتي مع كتالوج الطرف‑الصنف — لا يُخترع كودٌ قبله.
        </p>
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
