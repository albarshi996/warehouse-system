/**
 * لوحة «الأثر المالي» (SAP-17 · يسدّ ف‑٤١ · §16.18 ‹774-783›).
 *
 * الإجراء كان موجودًا منذ CC-202 **وبلا محتوى**. هنا محتواه: الثمانية
 * كما تنصّ الخطة — حالة المزامنة · المستند المالي · رقم القيد وتاريخه ·
 * إجمالي المدين والدائن · أسطر الحسابات · العملة والصرف والأبعاد ·
 * المستند العكسي · أخطاء المزامنة.
 *
 * ═══ والأرقام كلّها مستوردة ═══
 * البوابة **لا تُولّد قيدًا** (قرار المالك): ما تعرضه هنا مرآةُ أودو
 * (SAP-16) — والغائب يُقال غائبًا ولا يُلفَّق. وما لا أثرَ ماليَّ له
 * يُعلن سببه فلا شاشةَ فارغة.
 *
 * كلّ الحكم في `services/odoo/financialImpact.js` الخالص المُختبَر.
 */
import { useEffect, useState } from 'react';
import { financialImpactView } from '../../../services/odoo/financialImpact.js';
import { listenMirror } from '../../../services/odoo/pullService.js';
import Icon from '../../ui/Icon.jsx';

export default function FinancialImpactPanel({ doc }) {
  const [moves, setMoves] = useState([]);
  const [moveLines, setMoveLines] = useState([]);
  const [payments, setPayments] = useState([]);
  const [mirrorError, setMirrorError] = useState('');

  // مرآة أودو المستوردة (SAP-16) — ثلاثة نطاقات. وفشل القراءة يُقال ولا
  // يُسقط اللوحة: «لا يُعرف» أصدق من شاشةٍ بيضاء.
  useEffect(() => {
    const unsubs = [
      listenMirror('moves', setMoves, () => setMirrorError('تعذّرت قراءة مرآة القيود — هل نُشرت قواعد المرآة وسُحبت؟')),
      listenMirror('moveLines', setMoveLines, () => {}),
      listenMirror('payments', setPayments, () => {}),
    ].filter(Boolean);
    return () => unsubs.forEach((u) => { try { u(); } catch { /* تجاهل */ } });
  }, []);

  const view = financialImpactView(doc, { moves, moveLines, payments });

  if (!view.known) {
    return (
      <Shell>
        <p style={{ margin: 0, fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
          نوعٌ غير معلَنٍ في عقد الأثر المالي — يُضاف إليه قبل عرض أثره.
        </p>
      </Shell>
    );
  }

  if (!view.financial) {
    return (
      <Shell>
        <p style={{ margin: '0 0 4px', fontSize: 'var(--o-font-size-sm)', fontWeight: 'var(--o-font-weight-bold)' }}>
          {view.message}
        </p>
        <p style={{ margin: 0, fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>{view.note}</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <p style={{ margin: '0 0 10px', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
        {view.note} — <strong>الأرقام كلّها مستوردةٌ من النظام المالي، والبوابة لا تُنشئ قيدًا.</strong>
      </p>

      {mirrorError && (
        <p style={{ margin: '0 0 8px', fontSize: '11px', color: 'var(--o-text-warning, #8a6d1b)' }}>{mirrorError}</p>
      )}

      <div className="o_form_grid" style={{ marginBottom: '10px' }}>
        <Cell label="حالة المزامنة" value={view.syncState} tone={view.entryNumber ? 'ok' : 'muted'} />
        <Cell label="المستند المالي" value={view.odooDoc || '—'} mono />
        <Cell label="رقم القيد" value={view.entryNumber || '—'} mono />
        <Cell label="تاريخ القيد" value={view.entryDate || '—'} />
        <Cell label="إجمالي المدين" value={view.totalDebit ?? '—'} />
        <Cell label="إجمالي الدائن" value={view.totalCredit ?? '—'} />
        <Cell
          label="التوازن"
          value={view.balanced === null ? '—' : view.balanced ? 'متوازن' : 'غير متوازن'}
          tone={view.balanced === false ? 'danger' : view.balanced ? 'ok' : 'muted'}
        />
        <Cell label="العملة" value={view.currency || '—'} />
        <Cell label="سعر الصرف" value={view.exchangeRate ?? '—'} />
        <Cell label="المستند العكسي" value={view.reversal || '—'} mono />
      </div>

      {view.lines.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--o-font-size-xs)', marginBottom: '8px' }}>
          <thead>
            <tr style={{ textAlign: 'right', color: 'var(--o-main-color-muted)' }}>
              <th style={{ padding: '4px 6px' }}>الحساب</th>
              <th style={{ padding: '4px 6px' }}>البيان</th>
              <th style={{ padding: '4px 6px' }}>مدين</th>
              <th style={{ padding: '4px 6px' }}>دائن</th>
            </tr>
          </thead>
          <tbody>
            {view.lines.map((l, i) => (
              <tr key={l.id || i} style={{ borderTop: '1px solid var(--o-border-color, #e5e5ea)' }}>
                <td style={{ padding: '4px 6px', fontFamily: 'monospace', direction: 'ltr', textAlign: 'right' }}>{l.account || l.accountCode || '—'}</td>
                <td style={{ padding: '4px 6px' }}>{l.label || l.name || '—'}</td>
                <td style={{ padding: '4px 6px', fontVariantNumeric: 'tabular-nums' }}>{l.debit ?? '—'}</td>
                <td style={{ padding: '4px 6px', fontVariantNumeric: 'tabular-nums' }}>{l.credit ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {view.syncError && (
        <p style={{ margin: '0 0 6px', fontSize: '11px', color: 'var(--o-text-danger, #b3261e)' }}>
          <Icon name="alertTriangle" size={12} /> {view.syncError}
        </p>
      )}

      {!view.entryNumber && !view.syncError && (
        <p style={{ margin: 0, fontSize: '11px', color: 'var(--o-main-color-muted)' }}>
          لم يُستورد قيدُ هذا المستند بعد — اسحب من أودو في شاشة المزامنة، أو راجع إن كان قد أُنشئ هناك.
        </p>
      )}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <section id="doc-financial" className="o_ds_card o_ds_pad" style={{ marginBottom: '18px' }} aria-label="الأثر المالي">
      <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '0 0 8px', fontSize: '15px' }}>
        <Icon name="dollarSign" size={16} /> الأثر المالي
      </h3>
      {children}
    </section>
  );
}

function Cell({ label, value, mono = false, tone = '' }) {
  const color =
    tone === 'ok' ? 'var(--o-text-success, #1a7f37)'
      : tone === 'danger' ? 'var(--o-text-danger, #b3261e)'
        : tone === 'muted' ? 'var(--o-main-color-muted)' : undefined;
  return (
    <div className="o_field_block">
      <span className="o_form_label">{label}</span>
      <div
        style={{
          padding: '6px 10px',
          borderRadius: 'var(--o-border-radius)',
          background: 'var(--o-chip, #f4f4f6)',
          fontSize: 'var(--o-font-size-sm)',
          fontFamily: mono ? 'monospace' : undefined,
          direction: mono ? 'ltr' : undefined,
          textAlign: mono ? 'right' : undefined,
          color,
        }}
      >
        {String(value)}
      </div>
    </div>
  );
}
