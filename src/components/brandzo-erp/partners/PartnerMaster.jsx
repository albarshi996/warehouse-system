import { useEffect, useMemo, useRef, useState } from 'react';
import {
  subscribePartners,
  createPartner,
  updatePartner,
  archivePartner,
  unarchivePartner,
} from '../../../services/partnerService.js';
import { canImport, analyzePartnersFile, commitPartnersImport } from '../../../services/partners/partnersImportService.js';
import { setConnectedPartner } from '../../../services/partners/itemPartnerCatalogService.js';
import EntityAttachments from '../documents/EntityAttachments.jsx';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import Icon from '../../ui/Icon.jsx';
import ListView from '../../odoo/ListView.jsx';
import Pager from '../../odoo/Pager.jsx';
import { pageSlice } from '../../../services/ui/pagination.js';
import { int } from '../../odoo/format.js';

const PAGE_SIZE = 50;

/**
 * شاشة ماستر شركاء الأعمال — واحدة تخدم الموردين والعملاء (توأمان) بـ`kind`.
 * قائمة حيّة (`Suppliers_Master`/`Customers_Master`) + بحث + إضافة/تعديل/أرشفة
 * + استيراد Excel بمعاينة (للمديرَين). الإلزام الحقيقيّ في قواعد Firestore.
 *
 * المرحلة ٤ (2026-07-31): أُعيد كساء العرض بمكوّنات أودو داخل `.o_theme`
 * (ListView + o_input + o_alert) — **المنطق (الاشتراكات وخدمات الكتابة
 * والاستيراد) لم يُمسّ**، غُيّر ما يُرسَم فقط. الأرقام لاتينية (R2) عبر format.
 */

const KINDS = {
  supplier: { title: 'الموردين', one: 'مورّد', codeLabel: 'رمز المورد' },
  customer: { title: 'العملاء', one: 'عميل', codeLabel: 'رمز العميل' },
};

const money = (n) => `${int(n)} د.ل`;

const LIST_COLS = [
  { key: 'code', label: 'الرمز' },
  { key: 'name', label: 'الاسم' },
  { key: 'contact', label: 'المفوّض' },
  { key: 'phone', label: 'الهاتف' },
  { key: 'category', label: 'التصنيف' },
  { key: 'balance', label: 'رصيد الحساب', numeric: true },
  { key: 'actions', label: '' },
];

export default function PartnerMaster({ kind = 'supplier' }) {
  const cfg = KINDS[kind] || KINDS.supplier;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState(null); // null | { mode, row? }
  const [importing, setImporting] = useState(false);
  const [me, setMe] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => setMe(user ? await fetchUserProfile(user) : null));
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = subscribePartners(
      kind,
      (next) => {
        setRows(next);
        setLoading(false);
      },
      (err) => {
        setError(err?.message ?? 'تعذّر الاتصال بقاعدة البيانات');
        setLoading(false);
      },
      { includeArchived: showArchived }
    );
    return () => unsub();
  }, [kind, showArchived]);

  const flashToast = (kindT, text) => {
    setToast({ kind: kindT, text });
    setTimeout(() => setToast(null), 3000);
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      [r.code, r.nameAr, r.nameEn, r.contactPerson, r.phone, r.category, r.taxNo]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(term))
    );
  }, [rows, search]);

  const totalBalance = useMemo(() => rows.reduce((s, r) => s + (Number(r.accountBalance) || 0), 0), [rows]);

  // ترقيم من طرف العميل فوق القائمة المحمّلة — يكشف الذيل بدل قصّه صامتًا (المحور ٧).
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [search, showArchived]);
  const pageRows = useMemo(() => pageSlice(filtered, page, PAGE_SIZE), [filtered, page]);

  const handleArchive = async (row) => {
    if (!window.confirm(`أرشفة ${cfg.one} «${row.nameAr || row.code}»؟ (لا يُحذف — يُخفى من القوائم)`)) return;
    try {
      await archivePartner(kind, row.code);
      flashToast('success', `تمت أرشفة ${row.code}`);
    } catch (err) {
      flashToast('error', err?.message ?? 'فشلت الأرشفة');
    }
  };

  const handleUnarchive = async (row) => {
    try {
      await unarchivePartner(kind, row.code);
      flashToast('success', `تمت استعادة ${row.code}`);
    } catch (err) {
      flashToast('error', err?.message ?? 'فشلت الاستعادة');
    }
  };

  const listRows = pageRows.map((r) => ({
    id: r.code,
    decoration: r.archived ? 'muted' : undefined,
    cells: {
      code: <span className="decoration-bf">{r.code}</span>,
      name: r.nameAr || '—',
      contact: r.contactPerson || '—',
      phone: <span style={{ direction: 'ltr', display: 'inline-block' }}>{r.phone || '—'}</span>,
      category: r.category || '—',
      balance: money(r.accountBalance),
      actions: (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditor({ mode: 'edit', row: r }); setImporting(false); }}>تعديل</button>
          {r.archived ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleUnarchive(r)}>استعادة</button>
          ) : (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleArchive(r)}>أرشفة</button>
          )}
        </div>
      ),
    },
  }));

  return (
    <div className="o_theme" dir="rtl">
      <div className="o_control_panel">
        <div className="o_cp_start">
          <nav className="o_breadcrumb" aria-label="مسار التنقّل"><span className="o_active">إدارة {cfg.title}</span></nav>
        </div>
        <div className="o_cp_end" style={{ gap: '8px' }}>
          {canImport(me?.role) && (
            <button type="button" className="btn btn-secondary" onClick={() => { setImporting((v) => !v); setEditor(null); }}>
              <Icon name="arrowDownTray" size={15} /> استيراد {cfg.title}
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => { setEditor({ mode: 'create' }); setImporting(false); }}>
            <Icon name="userPlus" size={15} /> إضافة {cfg.one}
          </button>
        </div>
      </div>

      <div className="o_ds">
        <p style={{ fontSize: 'var(--o-font-size-sm)', color: 'var(--o-main-color-muted)', margin: '0 0 14px', lineHeight: 1.6 }}>
          {cfg.codeLabel} (BP Code) هو المعرّف الفريد. لا حذف — أرشفة فقط، فشريكٌ استُعمل في مستندٍ يبقى أثره.
        </p>

        {toast && <div className={`o_alert ${toast.kind === 'error' ? 'danger' : 'success'}`}>{toast.text}</div>}
        {error && !loading && <div className="o_alert danger">{error}</div>}

        {importing && (
          <div style={{ marginBottom: '18px' }}>
            <PartnerImport
              kind={kind}
              cfg={cfg}
              onDone={({ created, updated }) => {
                setImporting(false);
                flashToast('success', `تم الاستيراد: ${created} ${cfg.one} جديد · ${updated} حُدِّث`);
              }}
              onCancel={() => setImporting(false)}
            />
          </div>
        )}

        {editor && (
          <div style={{ marginBottom: '18px' }}>
            <PartnerForm
              kind={kind}
              cfg={cfg}
              mode={editor.mode}
              row={editor.row}
              me={me}
              onSaved={(code) => {
                setEditor(null);
                flashToast('success', editor.mode === 'create' ? `تمت إضافة ${code}` : `حُفظت تعديلات ${code}`);
              }}
              onCancel={() => setEditor(null)}
            />
          </div>
        )}

        {rows.length > 0 && (
          <div className="o_dashboard_kpis" style={{ marginBottom: '18px' }}>
            <div className="o_kpi">
              <span className="o_kpi_icon"><Icon name="users" size={20} /></span>
              <span className="o_kpi_value">{int(rows.length)}</span>
              <span className="o_kpi_label">{cfg.title}</span>
            </div>
            <div className="o_kpi">
              <span className="o_kpi_icon"><Icon name="dollarSign" size={20} /></span>
              <span className="o_kpi_value">{money(totalBalance)}</span>
              <span className="o_kpi_label">إجمالي رصيد الحساب (افتتاحيّ)</span>
            </div>
            <div className="o_kpi">
              <span className="o_kpi_icon"><Icon name="trendingUp" size={20} /></span>
              <span className="o_kpi_value">{int(rows.filter((r) => Number(r.accountBalance)).length)}</span>
              <span className="o_kpi_label">بحصّة إنفاق</span>
            </div>
          </div>
        )}

        <div className="o_ds_card">
          <div className="o_ds_toolbar">
            <div className="o_searchview">
              <span className="o_searchview_icon" aria-hidden="true">⌕</span>
              <input
                type="search"
                aria-label="بحث"
                placeholder="بحث بالرمز أو الاسم أو المفوّض أو الهاتف…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <label className="o_toggle">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              إظهار المؤرشفين
            </label>
          </div>

          {loading ? (
            <div className="o_dashboard_empty">جارٍ الجلب من السحابة…</div>
          ) : filtered.length === 0 ? (
            <div className="o_dashboard_empty">
              {rows.length === 0 ? `لا ${cfg.title} بعد. ابدأ بالإضافة أو الاستيراد.` : 'لا نتائج مطابقة.'}
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

/* ═══════════════ نموذج الإضافة/التعديل ═══════════════ */

const FORM_FIELDS = [
  { key: 'contactPerson', label: 'الشخص المفوّض' },
  { key: 'phone', label: 'رقم الهاتف', ltr: true },
  { key: 'email', label: 'البريد الإلكتروني', ltr: true },
  { key: 'taxNo', label: 'الرقم الضريبي' },
  { key: 'category', label: 'التصنيف' },
  { key: 'paymentTerms', label: 'شروط الدفع' },
  { key: 'currency', label: 'العملة' },
  { key: 'creditLimit', label: 'حد الائتمان', number: true },
  { key: 'accountBalance', label: 'رصيد الحساب (افتتاحيّ)', number: true },
  { key: 'address', label: 'العنوان' },
];

function PartnerForm({ kind, cfg, mode, row, me, onSaved, onCancel }) {
  const [form, setForm] = useState(() => ({
    code: row?.code || '',
    nameAr: row?.nameAr || '',
    connectedPartnerCode: row?.connectedPartnerCode || '',
    ...Object.fromEntries(FORM_FIELDS.map((f) => [f.key, row?.[f.key] ?? ''])),
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setErr('');
    if (!form.code.trim()) return setErr('الرمز (BP Code) مطلوب');
    if (!form.nameAr.trim()) return setErr('الاسم مطلوب');
    setBusy(true);
    try {
      const savedCode = form.code.trim().toUpperCase();
      if (mode === 'create') {
        await createPartner(kind, form);
      } else {
        const patch = { ...form };
        delete patch.code;
        delete patch.connectedPartnerCode; // يمرّ بمسار المرآتين لا بالتعديل العامّ
        await updatePartner(kind, form.code, patch);
      }
      // الربط المتبادل (SAP-2 · ف‑٧): يُكتب في البطاقتين معًا أو لا يُكتب.
      const prevLink = String(row?.connectedPartnerCode ?? '').trim().toUpperCase();
      const nextLink = String(form.connectedPartnerCode ?? '').trim().toUpperCase();
      if (prevLink !== nextLink) {
        await setConnectedPartner(kind, savedCode, nextLink);
      }
      onSaved?.(savedCode);
    } catch (e2) {
      setErr(e2?.message ?? 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="o_ds_card o_ds_pad" dir="rtl">
      <h3 className="o_form_title" style={{ fontSize: '18px', marginTop: 0 }}>{mode === 'create' ? `إضافة ${cfg.one}` : `تعديل ${cfg.one} ${row?.code || ''}`}</h3>
      {err && <div className="o_alert danger">{err}</div>}
      <div className="o_form_grid">
        <FieldWrap label={`${cfg.codeLabel} (BP Code) *`}>
          <input className="o_input" value={form.code} onChange={(e) => set('code', e.target.value)} disabled={mode === 'edit'} style={{ direction: 'ltr', textAlign: 'right' }} />
        </FieldWrap>
        <FieldWrap label="الاسم (BP Name) *">
          <input className="o_input" value={form.nameAr} onChange={(e) => set('nameAr', e.target.value)} />
        </FieldWrap>
        {FORM_FIELDS.map((f) => (
          <FieldWrap key={f.key} label={f.label}>
            <input
              className="o_input"
              type={f.number ? 'number' : 'text'}
              value={form[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              style={f.ltr ? { direction: 'ltr', textAlign: 'right' } : undefined}
            />
          </FieldWrap>
        ))}
        {/* SAP-2 (ف‑٧): الكيان الواحد مورّدًا وعميلًا — بطاقتان مترابطتان لا بطاقة مخلوطة */}
        <FieldWrap label={kind === 'supplier' ? 'بطاقة العميل المرتبطة (الكيان نفسه)' : 'بطاقة المورّد المرتبطة (الكيان نفسه)'}>
          <input
            className="o_input"
            placeholder={kind === 'supplier' ? 'رمز العميل — إن كان الكيان عميلًا أيضًا' : 'رمز المورّد — إن كان الكيان مورّدًا أيضًا'}
            value={form.connectedPartnerCode}
            onChange={(e) => set('connectedPartnerCode', e.target.value)}
            style={{ direction: 'ltr', textAlign: 'right' }}
          />
        </FieldWrap>
      </div>
      {/* SAP-11 (ف‑٢٨): مرفقات البطاقة — عقد المورّد وسجلّ العميل على البطاقة لا في ملاحظة */}
      {mode === 'edit' && row?.code && (
        <div style={{ marginTop: '14px' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 'var(--o-font-size-sm)', fontWeight: 'var(--o-font-weight-bold)' }}>
            مرفقات البطاقة
          </h4>
          <EntityAttachments entityKind={kind} entityId={row.code} me={me} />
        </div>
      )}

      <div className="o_form_actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>إلغاء</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'جارٍ الحفظ…' : mode === 'create' ? 'إضافة' : 'حفظ التعديلات'}
        </button>
      </div>
    </form>
  );
}

function FieldWrap({ label, children }) {
  return (
    <label className="o_field_block">
      <span className="o_form_label">{label}</span>
      {children}
    </label>
  );
}

/* ═══════════════ الاستيراد بالمعاينة ═══════════════ */

function PartnerImport({ kind, cfg, onDone, onCancel }) {
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setAnalysis(null);
    setError('');
    setAnalyzing(true);
    try {
      setAnalysis(await analyzePartnersFile(kind, file));
    } catch (err) {
      setError(err?.message ?? 'تعذّر قراءة الملف.');
    } finally {
      setAnalyzing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleCommit() {
    if (!analysis?.ok) return;
    setCommitting(true);
    setError('');
    try {
      const { created, updated } = await commitPartnersImport(kind, analysis);
      onDone?.({ created, updated });
    } catch (err) {
      setError(err?.message ?? 'تعذّر الاستيراد — لم يُكتب شيء.');
    } finally {
      setCommitting(false);
    }
  }

  const plan = analysis?.plan;
  const blocking = (analysis?.errors ?? []).filter((e) => e.severity !== 'warning');
  const toWrite = plan ? plan.created.length + plan.updated.length : 0;

  return (
    <div className="o_ds_card o_ds_pad" dir="rtl">
      <h3 className="o_form_title" style={{ fontSize: '18px', marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon name="arrowDownTray" size={18} /> استيراد شيت {cfg.title}
      </h3>
      <p style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', margin: '2px 0 14px', lineHeight: 1.6 }}>
        الأعمدة تُطابَق تلقائيًّا بمرادفات عربية/إنجليزية (BP Code · BP Name · المفوّض · الهاتف · الأرصدة…). لا يُكتب شيء قبل أن تراجع المعاينة وتؤكّد.
      </p>

      <label className="o_filedrop">
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFile} disabled={analyzing || committing} />
        {analyzing ? 'جارٍ تحليل الملف…' : 'اختر ملف Excel'}
      </label>
      {fileName && <span style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-gray-500)', marginInlineStart: '10px', fontFamily: 'monospace' }}>{fileName}</span>}

      {error && <div className="o_alert danger" style={{ marginTop: '14px' }}>{error}</div>}

      {analysis && (
        <div style={{ marginTop: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="o_dashboard_kpis" style={{ margin: 0 }}>
            <Stat label={`${cfg.one} جديد`} value={plan.created.length} />
            <Stat label="سيُحدَّث" value={plan.updated.length} />
            <Stat label="بلا تغيير" value={plan.unchanged.length} />
            <Stat label="بلا رمز (يُتجاوز)" value={plan.skipped.length} alert={plan.skipped.length > 0} />
          </div>

          {analysis.summary && (
            <p style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-gray-500)' }}>
              الورقة: <b>{analysis.summary.sheetName}</b> · صفّ العناوين: {analysis.summary.headerRow} · الأعمدة المتعرَّف عليها: {analysis.summary.detectedColumns?.length ?? '—'}
            </p>
          )}

          {blocking.length > 0 && (
            <div className="o_alert danger">
              <div className="o_alert_title"><Icon name="alertTriangle" size={16} /> {blocking.length} خطأ يمنع الاستيراد — صحّح الملف وأعد اختياره:</div>
              <ul>
                {blocking.slice(0, 12).map((e, i) => (<li key={i}>صفّ {e.row} · {e.message}</li>))}
                {blocking.length > 12 && <li>… و{blocking.length - 12} أخرى</li>}
              </ul>
            </div>
          )}

          {plan.skipped.length > 0 && (
            <div className="o_alert warning">
              <div className="o_alert_title"><Icon name="alertTriangle" size={16} /> {plan.skipped.length} صفًّا بلا رمز — لن يُستورد (الرمز معرّف الماستر):</div>
              <ul>
                {plan.skipped.slice(0, 8).map((row, i) => (<li key={i}>{row.nameAr || 'صف بلا اسم'}</li>))}
                {plan.skipped.length > 8 && <li>… و{plan.skipped.length - 8} أخرى</li>}
              </ul>
            </div>
          )}

          {plan.updated.length > 0 && (
            <div className="o_ds_card" style={{ padding: '12px 14px', boxShadow: 'none' }}>
              <p style={{ fontSize: 'var(--o-font-size-sm)', fontWeight: 'var(--o-font-weight-bold)', margin: '0 0 8px' }}>ما سيتغيّر على شركاء قائمين (عيّنة):</p>
              <ul style={{ margin: 0, paddingInlineStart: '18px', maxHeight: '160px', overflowY: 'auto', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
                {plan.updated.slice(0, 6).map((row) => (
                  <li key={row.code}>
                    <b style={{ color: 'var(--o-action)', fontFamily: 'monospace' }}>{row.code}</b>
                    {row._diff?.slice(0, 3).map((d) => (<span key={d.field} style={{ marginInlineStart: '8px' }}>· {d.labelAr}: «{String(d.before) || '—'}» ← «{String(d.after)}»</span>))}
                  </li>
                ))}
                {plan.updated.length > 6 && <li>… و{plan.updated.length - 6} آخر</li>}
              </ul>
            </div>
          )}

          <div className="o_form_actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>إغلاق</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCommit}
              disabled={!analysis.ok || toWrite === 0 || committing}
            >
              {committing ? 'جارٍ الاستيراد…' : toWrite === 0 ? 'لا شيء ليُستورد' : `تأكيد استيراد ${toWrite} ${cfg.one}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, alert }) {
  return (
    <div className={`o_kpi${alert ? ' alert' : ''}`}>
      <span className="o_kpi_value">{int(value)}</span>
      <span className="o_kpi_label">{label}</span>
    </div>
  );
}
