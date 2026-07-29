import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  subscribePartners,
  createPartner,
  updatePartner,
  archivePartner,
  unarchivePartner,
} from '../../../services/partnerService.js';
import { canImport, analyzePartnersFile, commitPartnersImport } from '../../../services/partners/partnersImportService.js';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';

/**
 * شاشة ماستر شركاء الأعمال — واحدة تخدم الموردين والعملاء (توأمان) بـ`kind`.
 * قائمة حيّة (`Suppliers_Master`/`Customers_Master`) + بحث + إضافة/تعديل/أرشفة
 * + استيراد Excel بمعاينة (للمديرَين). الإلزام الحقيقيّ في قواعد Firestore.
 */

const KINDS = {
  supplier: { title: 'الموردين', one: 'مورّد', codeLabel: 'رمز المورد' },
  customer: { title: 'العملاء', one: 'عميل', codeLabel: 'رمز العميل' },
};

const money = (n) => `${(Number(n) || 0).toLocaleString('ar-LY', { maximumFractionDigits: 0 })} د.ل`;

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

  return (
    <div className="text-right" dir="rtl">
      <header className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">إدارة {cfg.title}</h2>
          <p className="text-gray-300 mt-1 text-sm">
            {cfg.codeLabel} (BP Code) هو المعرّف الفريد. لا حذف — أرشفة فقط، فشريكٌ استُعمل في مستندٍ يبقى أثره.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canImport(me?.role) && (
            <button
              type="button"
              onClick={() => {
                setImporting((v) => !v);
                setEditor(null);
              }}
              className="inline-flex items-center gap-2 rounded-lg border-2 border-brand-gold text-brand-gold px-4 py-2 font-bold hover:bg-brand-gold hover:text-black active:scale-95 transition-all"
            >
              📥 استيراد {cfg.title}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setEditor({ mode: 'create' });
              setImporting(false);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-red text-white px-4 py-2 font-bold shadow hover:opacity-90 active:scale-95 transition-all"
          >
            ➕ إضافة {cfg.one}
          </button>
        </div>
      </header>

      {toast && (
        <div
          className={`mb-4 p-3 rounded-lg font-bold text-sm ${
            toast.kind === 'error'
              ? 'bg-red-500/15 text-red-200 border border-red-500/30'
              : 'bg-green-500/15 text-green-200 border border-green-500/30'
          }`}
        >
          {toast.text}
        </div>
      )}

      {error && !loading && (
        <div className="mb-4 p-3 rounded-lg font-bold text-sm bg-red-500/15 text-red-200 border border-red-500/30">{error}</div>
      )}

      {importing && (
        <div className="mb-6">
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
        <div className="mb-6">
          <PartnerForm
            kind={kind}
            cfg={cfg}
            mode={editor.mode}
            row={editor.row}
            onSaved={(code) => {
              setEditor(null);
              flashToast('success', editor.mode === 'create' ? `تمت إضافة ${code}` : `حُفظت تعديلات ${code}`);
            }}
            onCancel={() => setEditor(null)}
          />
        </div>
      )}

      {/* ملخّص */}
      {rows.length > 0 && (
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <SummaryTile label={cfg.title} value={rows.length.toLocaleString('ar-LY')} />
          <SummaryTile label="إجمالي رصيد الحساب (افتتاحيّ)" value={money(totalBalance)} gold />
          <SummaryTile label="بحصّة إنفاق" value={rows.filter((r) => Number(r.accountBalance)).length.toLocaleString('ar-LY')} />
        </div>
      )}

      <div className="bg-black/20 rounded-xl border border-white/10 overflow-hidden">
        <div className="p-4 border-b border-white/10 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <input
            type="search"
            placeholder={`بحث بالرمز أو الاسم أو المفوّض أو الهاتف…`}
            className="flex-1 md:max-w-md bg-black/30 border border-white/15 rounded-lg p-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-gold"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="inline-flex items-center gap-2 text-sm text-gray-300 select-none">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-brand-gold" />
            إظهار المؤرشفين
          </label>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="w-full text-right text-sm">
            <thead className="bg-white/5 text-gray-300">
              <tr>
                <th className="px-4 py-3 font-bold whitespace-nowrap">الرمز</th>
                <th className="px-4 py-3 font-bold">الاسم</th>
                <th className="px-4 py-3 font-bold hidden sm:table-cell">الشخص المفوّض</th>
                <th className="px-4 py-3 font-bold hidden md:table-cell whitespace-nowrap">الهاتف</th>
                <th className="px-4 py-3 font-bold hidden lg:table-cell">التصنيف</th>
                <th className="px-4 py-3 font-bold whitespace-nowrap">رصيد الحساب</th>
                <th className="px-4 py-3 font-bold text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400 italic">جارٍ الجلب من السحابة…</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400 italic">
                    {rows.length === 0 ? `لا ${cfg.title} بعد. ابدأ بالإضافة أو الاستيراد.` : 'لا نتائج مطابقة.'}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.code} className={r.archived ? 'opacity-50' : ''}>
                    <td className="px-4 py-3 font-mono text-brand-gold font-bold whitespace-nowrap">{r.code}</td>
                    <td className="px-4 py-3 font-medium text-gray-100">{r.nameAr || '—'}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-gray-300">{r.contactPerson || '—'}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-300 font-mono text-xs" style={{ direction: 'ltr', textAlign: 'right' }}>{r.phone || '—'}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-gray-300">{r.category || '—'}</td>
                    <td className="px-4 py-3 font-bold text-gray-100 whitespace-nowrap">{money(r.accountBalance)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditor({ mode: 'edit', row: r })}
                          className="text-xs font-bold text-brand-gold border border-brand-gold rounded-md px-3 py-1 hover:bg-brand-gold hover:text-black transition-colors"
                        >
                          تعديل
                        </button>
                        {r.archived ? (
                          <button type="button" onClick={() => handleUnarchive(r)} className="text-xs font-bold text-green-300 border border-green-500/40 rounded-md px-3 py-1 hover:bg-green-600 hover:text-white transition-colors">استعادة</button>
                        ) : (
                          <button type="button" onClick={() => handleArchive(r)} className="text-xs font-bold text-gray-400 border border-white/15 rounded-md px-3 py-1 hover:bg-gray-600 hover:text-white transition-colors">أرشفة</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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

function PartnerForm({ kind, cfg, mode, row, onSaved, onCancel }) {
  const [form, setForm] = useState(() => ({
    code: row?.code || '',
    nameAr: row?.nameAr || '',
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
      if (mode === 'create') {
        await createPartner(kind, form);
        onSaved?.(form.code.trim().toUpperCase());
      } else {
        const patch = { ...form };
        delete patch.code;
        await updatePartner(kind, form.code, patch);
        onSaved?.(form.code);
      }
    } catch (e2) {
      setErr(e2?.message ?? 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-black/25 p-4 sm:p-6 rounded-xl border border-white/10" dir="rtl">
      <h3 className="text-lg font-bold text-brand-gold mb-4">{mode === 'create' ? `➕ إضافة ${cfg.one}` : `✏️ تعديل ${cfg.one} ${row?.code || ''}`}</h3>
      {err && <div className="mb-4 p-3 rounded-lg bg-red-500/15 text-red-200 border border-red-500/30 text-sm font-bold">{err}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field label={`${cfg.codeLabel} (BP Code) *`}>
          <input value={form.code} onChange={(e) => set('code', e.target.value)} disabled={mode === 'edit'} className="fld disabled:opacity-60" style={{ direction: 'ltr', textAlign: 'right' }} />
        </Field>
        <Field label="الاسم (BP Name) *">
          <input value={form.nameAr} onChange={(e) => set('nameAr', e.target.value)} className="fld" />
        </Field>
        {FORM_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <input
              type={f.number ? 'number' : 'text'}
              value={form[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              className="fld"
              style={f.ltr ? { direction: 'ltr', textAlign: 'right' } : undefined}
            />
          </Field>
        ))}
      </div>
      <div className="flex flex-col sm:flex-row gap-3 sm:justify-end pt-5">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded font-bold text-gray-300 border border-white/15 hover:bg-white/5 transition-colors">إلغاء</button>
        <button type="submit" disabled={busy} className="px-6 py-2 rounded bg-brand-red text-white font-bold shadow hover:opacity-90 active:scale-95 transition-all disabled:opacity-50">
          {busy ? 'جارٍ الحفظ…' : mode === 'create' ? 'إضافة' : 'حفظ التعديلات'}
        </button>
      </div>
      <style>{`.fld{width:100%;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.15);border-radius:.5rem;padding:.5rem .65rem;color:#f3f4f6}.fld:focus{outline:none;box-shadow:0 0 0 2px var(--brand-gold,#f0a500)}`}</style>
    </form>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-gray-300 mb-1">{label}</span>
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
    <div className="bg-black/25 p-4 sm:p-6 rounded-xl border border-white/10" dir="rtl">
      <h3 className="text-lg font-bold text-brand-gold">📥 استيراد شيت {cfg.title}</h3>
      <p className="text-xs text-gray-400 mt-1 mb-4">
        الأعمدة تُطابَق تلقائيًّا بمرادفات عربية/إنجليزية (BP Code · BP Name · المفوّض · الهاتف · الأرصدة…). لا يُكتب شيء قبل أن تراجع المعاينة وتؤكّد.
      </p>

      <label className="inline-flex items-center gap-2 cursor-pointer rounded-lg border-2 border-dashed border-white/20 px-4 py-2.5 text-sm font-bold text-gray-300 hover:border-brand-gold hover:text-brand-gold transition-colors">
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} disabled={analyzing || committing} />
        {analyzing ? 'جارٍ تحليل الملف…' : '📂 اختر ملف Excel'}
      </label>
      {fileName && <span className="text-xs text-gray-500 font-mono truncate mr-3">{fileName}</span>}

      {error && <div className="mt-4 p-3 rounded-lg border border-red-500/30 bg-red-500/15 text-red-200 text-sm font-bold">{error}</div>}

      {analysis && (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label={`${cfg.one} جديد`} value={plan.created.length} tone="green" />
            <Stat label="سيُحدَّث" value={plan.updated.length} tone="amber" />
            <Stat label="بلا تغيير" value={plan.unchanged.length} tone="gray" />
            <Stat label="بلا رمز (يُتجاوز)" value={plan.skipped.length} tone="red" />
          </div>

          {analysis.summary && (
            <p className="text-xs text-gray-500">
              الورقة: <b>{analysis.summary.sheetName}</b> · صفّ العناوين: {analysis.summary.headerRow} · الأعمدة المتعرَّف عليها: {analysis.summary.detectedColumns?.length ?? '—'}
            </p>
          )}

          {blocking.length > 0 && (
            <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10">
              <p className="text-sm font-bold text-red-200 mb-2">❌ {blocking.length} خطأ يمنع الاستيراد — صحّح الملف وأعد اختياره:</p>
              <ul className="text-xs text-red-300 space-y-1 max-h-40 overflow-y-auto">
                {blocking.slice(0, 12).map((e, i) => (<li key={i}>صفّ {e.row} · {e.message}</li>))}
                {blocking.length > 12 && <li>… و{blocking.length - 12} أخرى</li>}
              </ul>
            </div>
          )}

          {plan.skipped.length > 0 && (
            <div className="p-3 rounded-lg border border-orange-500/30 bg-orange-500/10">
              <p className="text-sm font-bold text-orange-200 mb-2">🚫 {plan.skipped.length} صفًّا بلا رمز — لن يُستورد (الرمز معرّف الماستر):</p>
              <ul className="text-xs text-orange-300 space-y-1 max-h-32 overflow-y-auto">
                {plan.skipped.slice(0, 8).map((row, i) => (<li key={i}>{row.nameAr || 'صف بلا اسم'}</li>))}
                {plan.skipped.length > 8 && <li>… و{plan.skipped.length - 8} أخرى</li>}
              </ul>
            </div>
          )}

          {plan.updated.length > 0 && (
            <div className="p-3 rounded-lg border border-white/10 bg-white/5">
              <p className="text-sm font-bold text-gray-200 mb-2">ما سيتغيّر على شركاء قائمين (عيّنة):</p>
              <ul className="text-xs text-gray-400 space-y-1 max-h-40 overflow-y-auto">
                {plan.updated.slice(0, 6).map((row) => (
                  <li key={row.code}>
                    <b className="font-mono text-brand-gold">{row.code}</b>
                    {row._diff?.slice(0, 3).map((d) => (<span key={d.field} className="mr-2">· {d.labelAr}: «{String(d.before) || '—'}» ← «{String(d.after)}»</span>))}
                  </li>
                ))}
                {plan.updated.length > 6 && <li>… و{plan.updated.length - 6} آخر</li>}
              </ul>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 sm:justify-end pt-1">
            <button type="button" onClick={onCancel} className="px-4 py-2 rounded font-bold text-gray-300 border border-white/15 hover:bg-white/5 transition-colors">إغلاق</button>
            <button
              type="button"
              onClick={handleCommit}
              disabled={!analysis.ok || toWrite === 0 || committing}
              className="px-6 py-2 rounded bg-brand-red text-white font-bold shadow hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {committing ? 'جارٍ الاستيراد…' : toWrite === 0 ? 'لا شيء ليُستورد' : `تأكيد استيراد ${toWrite} ${cfg.one}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const TONES = {
  green: 'bg-green-500/10 border-green-500/30 text-green-200',
  amber: 'bg-amber-500/10 border-amber-500/30 text-amber-200',
  gray: 'bg-white/5 border-white/10 text-gray-300',
  red: 'bg-red-500/10 border-red-500/30 text-red-200',
};

function Stat({ label, value, tone }) {
  return (
    <div className={`rounded-lg border p-3 text-center ${TONES[tone]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-bold mt-0.5">{label}</p>
    </div>
  );
}

function SummaryTile({ label, value, gold }) {
  return (
    <div className={`rounded-xl border p-3 text-center ${gold ? 'bg-amber-500/10 border-amber-500/30' : 'bg-black/20 border-white/10'}`}>
      <p className={`text-lg font-bold ${gold ? 'text-brand-gold' : 'text-white'}`}>{value}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}
