/**
 * الأبعاد التنظيميّة — قطاع › براند › فرع › مركز تكلفة (CC-401).
 *
 * سيّد المواقع (م٦-أ) كان منطقًا خالصًا مختبَرًا **بلا شاشةٍ تُديره ولا
 * تقريرٍ يقرؤه** — كتالوجًا في الظلام. هنا الوصلة: الشجرة تُدار من مكانٍ
 * واحد، وكلّ مستندٍ يحمل رمزَ موقعه تُحمَّل تكلفته على فرعه وبرانده وقطاعه
 * صعودًا، وما لم يُربط يُحصى ويُعرض — لا يذوب في المجموع بصمت.
 *
 * بنية ٣ طبقات: تدخّل الآن (أعطاب الشجرة والفرع-العميل) · الإدارة · التكلفة.
 * الوصول: المديران والمالي (من يُقيَّد بمركز التكلفة لا يعيد تشكيله).
 */
import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listenOrgLocations, saveOrgLocation, setOrgLocationActive, importOrgLocations, seedOrgLocations, saveBranchProfile } from '../../../services/org/orgLocationsService.js';
import { subscribePartners } from '../../../services/partnerService.js';
import { listenAllDocuments } from '../../../services/documents/documentsService.js';
import {
  levelOf, indexLocations, locationProblems,
  internalBranchProblems, orgCodeOf, docAmountOf, costByLocation, unlinkedCost,
  suggestLocationCode, parentChoices, pathOf, childLevelOf, orgSetupSteps, newChildDraft,
} from '../../../services/org/orgLocations.js';
import { planOrgImport, seedWarnings, orgTemplateGuide } from '../../../services/org/orgImport.js';
import {
  CONCEPT_TYPES, BRANCH_STATES, WEEK_DAYS, WEEK_DAY_LABELS,
  shapeBranchProfile, profileGaps, profileCompleteness,
} from '../../../services/org/branchProfile.js';
import { importSheet } from '../../../services/excel/excelImport.js';
import { exportTemplateWithGuide } from '../../../services/excel/excelExport.js';

// ‹FNB-107› مدير القطاع صاحبُ المدخل (البراندات والفروع) — يرى الشجرة ويُدخلها.
const VIEWER_ROLES = ['admin', 'warehouse_manager', 'finance_manager', 'fnb_manager'];

const input =
  'w-full bg-chip border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-gray-500 focus:outline-none focus:border-accent/60';

/**
 * النموذج مسوّدةٌ لا استمارةُ امتحان: `mode` يفصل الإنشاء عن التعديل (فالرمز
 * هويّةٌ تُثبَّت مرّةً)، و`autoCode` يجعل الرمز **تلقائيًّا افتراضًا** ويبقى
 * بابُ الكتابة اليدويّة مفتوحًا لمن له ترميزٌ قائم.
 */
const EMPTY_FORM = { mode: 'create', code: '', nameAr: '', level: 'sector', parentCode: '', autoCode: true };

/** أمثلةٌ في الحقل الفارغ — المستوى المجرَّد يُفهم بمثالٍ أسرعَ ممّا يُفهم بتعريف. */
const PLACEHOLDER_NAME = Object.freeze({
  sector: 'مثال: قطاع الأغذية والمشروبات',
  brand: 'مثال: براند الواحة',
  branch: 'مثال: فرع بنغازي — دبي ستريت',
  cost_center: 'مثال: صيانة فرع بنغازي',
});

export default function OrgDimensions() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [locations, setLocations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  // ‹FNB-101› معاينة الغرس بالجملة: تُعرض قبل الكتابة، والقرار للمستخدم بعد أن يرى.
  const [importPlan, setImportPlan] = useState(null);
  const [importing, setImporting] = useState(false);
  // ‹FNB-201› الملفّ التشغيليّ للفرع — يُفتح للفرع المختار وحده.
  const [profileFor, setProfileFor] = useState(null);
  const [profileForm, setProfileForm] = useState(null);

  useEffect(() => {
    const unsub = subscribeAuth(async (u) => {
      setMe(u ? await fetchUserProfile(u) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!me || !VIEWER_ROLES.includes(me.role)) return undefined;
    const unsubs = [
      listenOrgLocations(setLocations),
      subscribePartners('customer', setCustomers, () => setCustomers([])),
      // التكلفة من المستندات الحيّة (المنجَزة والمعتمَدة) — عيّنة محدودة السقف،
      // والتقرير الجامع في مركز التقارير (CC-502) لا هنا.
      listenAllDocuments((docs) => setDocuments(docs.filter((d) => ['approved', 'done'].includes(d.state))), 400),
    ];
    return () => unsubs.forEach((u) => u?.());
  }, [me]);

  const index = useMemo(() => indexLocations(locations), [locations]);
  const treeProblems = useMemo(() => locationProblems(locations), [locations]);
  const branchProblems = useMemo(() => internalBranchProblems(locations, customers), [locations, customers]);
  const seedMix = useMemo(() => seedWarnings(locations), [locations]);

  /** التكلفة على الشجرة من المستندات الحاملة رمزًا. */
  const cost = useMemo(() => {
    const entries = documents
      .map((d) => ({ orgCode: orgCodeOf(d), amount: docAmountOf(d) }))
      .filter((e) => e.orgCode);
    return {
      byLocation: costByLocation(index, entries),
      unlinked: unlinkedCost(index, entries),
      carrying: entries.length,
    };
  }, [index, documents]);

  /** الشجرة للعرض: كلّ موقعٍ بعمقه — الأبناء تحت آبائهم. */
  const tree = useMemo(() => {
    const roots = locations.filter((l) => !l.parentCode);
    const children = (code) => locations.filter((l) => String(l.parentCode || '').toUpperCase() === String(code).toUpperCase());
    const out = [];
    const walk = (loc, depth) => {
      out.push({ ...loc, depth });
      children(loc.code).sort((a, b) => String(a.code).localeCompare(String(b.code))).forEach((c) => walk(c, depth + 1));
    };
    roots.sort((a, b) => String(a.code).localeCompare(String(b.code))).forEach((r) => walk(r, 0));
    // اليتيم (أبوه مفقود) يظهر آخر القائمة لا يختفي.
    for (const loc of locations) if (!out.some((o) => o.code === loc.code)) out.push({ ...loc, depth: 0, orphan: true });
    return out;
  }, [locations]);

  const parentLevel = levelOf(form.level)?.parentOf;
  // خطوات البناء: قطاعٌ ثمّ براندٌ ثمّ فرع — والمحجوبة تقول بم تُفتح.
  const steps = useMemo(() => orgSetupSteps(locations), [locations]);
  // ‹الرمز يُقترح لا يُخترع›: بادئة المستوى ورقمٌ يقفز فوق المشغول.
  const suggestedCode = useMemo(() => suggestLocationCode(index, form.level), [index, form.level]);
  // والمعروض **مشتقٌّ لا مخزَّن** ما دام تلقائيًّا، فلا يتقادم حين تكبر الشجرة تحته.
  const formCode = form.autoCode ? suggestedCode : form.code;
  // والآباء بمسارهم كاملًا — فلا يلتبس براندان باسمٍ واحد تحت قطاعين.
  const parentOptions = useMemo(() => parentChoices(locations, form.level), [locations, form.level]);
  const parentPath = form.parentCode ? pathOf(index, form.parentCode) : '';
  const levelLabel = levelOf(form.level)?.labelAr || form.level;

  /** فتحُ النموذج على مستوًى من شريط الخطوات — والأب يُختار بعدها من قائمةٍ بمساراتها. */
  function startLevel(level) {
    setForm({ ...EMPTY_FORM, level });
    setFlash(null);
  }

  /**
   * فتحُه على ابنٍ تحت موقعٍ بعينه — «أضف براندًا تحت **هذا** القطاع».
   * المستوى والأب والرمز كلّها من مكان النقر، فلا يبقى إلّا الاسم.
   */
  function startChild(parentCode) {
    const draft = newChildDraft(locations, parentCode);
    if (!draft) return;
    setForm({ mode: 'create', code: draft.code, nameAr: '', level: draft.level, parentCode: draft.parentCode, autoCode: true });
    setFlash(null);
  }

  /** التعديل: الاسم والأب يُبدَّلان، والرمز يُعرض ولا يُكتب — تغييرُه يشقّ الموقع نسختين. */
  function startEdit(loc) {
    setForm({
      mode: 'edit',
      code: String(loc.code).toUpperCase(),
      nameAr: loc.nameAr || '',
      level: loc.level,
      parentCode: loc.parentCode || '',
      autoCode: false,
    });
    setFlash(null);
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setFlash(null);
    const code = String(formCode || '').trim().toUpperCase();
    try {
      const before = locations.find((l) => String(l.code).toUpperCase() === code);
      await saveOrgLocation(
        {
          code,
          nameAr: form.nameAr.trim(),
          level: form.level,
          parentCode: parentLevel ? form.parentCode : '',
          // المعطَّل يبقى معطَّلًا بعد تصحيح اسمه — التعديل ليس بابًا خلفيًّا للتفعيل.
          active: before ? before.active !== false : true,
        },
        locations,
        me
      );
      setFlash({ at: 'form', kind: 'ok', text: form.mode === 'edit' ? `حُدِّث الموقع ${code}.` : `حُفظ ${levelLabel} ${code}.` });
      // بعد الإنشاء يبقى المكان مفتوحًا لشقيقٍ تالٍ (عشرون فرعًا تُدخَل تباعًا)،
      // والرمز يتقدّم وحده. وبعد التعديل يُغلق النموذج.
      setForm(form.mode === 'edit' ? EMPTY_FORM : { ...form, nameAr: '', code: '', autoCode: true });
    } catch (e) {
      setFlash({ at: 'form', kind: 'err', text: e?.message || 'تعذّر الحفظ.' });
    } finally {
      setBusy(false);
    }
  }

  /** ‹FNB-101› قالبُ التعبئة: ورقةٌ تُملأ وورقةٌ تشرح — ويُولَّد من مخطّط المستورِد نفسه. */
  function downloadTemplate() {
    setFlash(null);
    try {
      const fileName = exportTemplateWithGuide('orgLocations', orgTemplateGuide(), {
        fileName: 'قالب-الشجرة-التنظيمية',
        sheetName: 'الشجرة',
      });
      setFlash({ at: 'bulk', kind: 'ok', text: `نُزِّل ${fileName} — املأ ورقة «الشجرة»، وورقةُ «تعليمات» فيها القواعد ومثالٌ عامل.` });
    } catch (e) {
      setFlash({ at: 'bulk', kind: 'err', text: e?.message || 'تعذّر توليد القالب.' });
    }
  }

  /** ‹FNB-101› قراءة الشيت ← معاينة كاملة. لا كتابةَ هنا — المعاينة أوّلًا. */
  async function previewImport(file) {
    if (!file) return;
    setFlash(null);
    setImportPlan(null);
    try {
      const sheet = await importSheet(file, 'orgLocations');
      if (!sheet.rows.length) {
        setFlash({ at: 'bulk', kind: 'err', text: sheet.errors[0]?.message || 'الملف بلا صفوف صالحة.' });
        return;
      }
      const plan = planOrgImport(sheet.rows, locations);
      // أخطاء قراءة الشيت (أعمدة مفقودة/قيم فاسدة) تُضمّ لمشاكل الشجرة — رفضٌ واحد مقروء.
      const sheetErrors = sheet.errors.map((e) => `سطر ${e.row}: ${e.message}`);
      setImportPlan({ ...plan, ok: plan.ok && !sheetErrors.length, problems: [...sheetErrors, ...plan.problems] });
    } catch (e) {
      setFlash({ at: 'bulk', kind: 'err', text: e?.message || 'تعذّرت قراءة الملف.' });
    }
  }

  /** الكتابة الذرّيّة — كاملًا أو لا شيء (العقد في importOrgLocations). */
  async function commitImport() {
    if (!importPlan?.ok || importing) return;
    setImporting(true);
    try {
      const { written } = await importOrgLocations(importPlan.toWrite, locations, me);
      setFlash({ at: 'bulk', kind: 'ok', text: `غُرست الشجرة: ${written} موقعًا (${importPlan.counts.created} جديدًا · ${importPlan.counts.updated} محدَّثًا).` });
      setImportPlan(null);
    } catch (e) {
      setFlash({ at: 'bulk', kind: 'err', text: e?.message || 'تعذّر الغرس.' });
    } finally {
      setImporting(false);
    }
  }

  /** البذرة التجريبيّة (ق-O01) — تمرّ بنفس بوّابة الاستيراد. */
  async function plantSeed() {
    if (importing) return;
    setImporting(true);
    setFlash(null);
    try {
      const { written } = await seedOrgLocations(locations, me);
      setFlash({ at: 'bulk', kind: 'ok', text: `غُرست البذرة التجريبيّة: ${written} مواقع بادئتها DEMO- — تُطفأ عند وصول شجرة المالك.` });
    } catch (e) {
      setFlash({ at: 'bulk', kind: 'err', text: e?.message || 'تعذّر غرس البذرة.' });
    } finally {
      setImporting(false);
    }
  }

  function openProfile(loc) {
    setProfileFor(loc.code);
    setProfileForm(shapeBranchProfile(loc.profile || {}));
    setFlash(null);
  }

  async function commitProfile() {
    if (!profileFor || busy) return;
    setBusy(true);
    try {
      const loc = locations.find((l) => String(l.code).toUpperCase() === profileFor);
      await saveBranchProfile(profileFor, profileForm, loc, me);
      setFlash({ at: 'form', kind: 'ok', text: `حُفظ الملفّ التشغيليّ للفرع ${profileFor}.` });
      setProfileFor(null);
      setProfileForm(null);
    } catch (e) {
      setFlash({ at: 'profile', kind: 'err', text: e?.message || 'تعذّر حفظ الملفّ.' });
    } finally {
      setBusy(false);
    }
  }

  const patchProfile = (key, value) => setProfileForm((f) => ({ ...f, [key]: value }));

  if (!ready) return <Muted>جارٍ التحقّق من الصلاحية…</Muted>;
  if (!me) return <Muted>سجّل الدخول لعرض هذه الشاشة.</Muted>;
  if (!VIEWER_ROLES.includes(me.role)) return <Muted>هذه الشاشة للمديرَين والماليّ ومدير القطاع.</Muted>;

  return (
    <div className="space-y-6">
      {/*
        شريط الخطوات: عدّادٌ ومدخلٌ في بطاقةٍ واحدة — لا صفٌّ يعدّ وصفٌّ يقود.
        والمحجوبة تقول بم تُفتح، فلا زرَّ ميتًا بلا سبب.
      */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {steps.map((s) => (
          <StepCard key={s.id} step={s} active={form.mode === 'create' && form.level === s.id}
            onPick={() => startLevel(s.id)} />
        ))}
      </div>

      {treeProblems.length || branchProblems.length || seedMix.length ? (
        <Section title="تدخّل الآن">
          <ul className="text-sm text-red-600 list-disc pr-5 space-y-1">
            {[...treeProblems, ...branchProblems, ...seedMix].map((p) => <li key={p}>{p}</li>)}
          </ul>
        </Section>
      ) : null}

      <Section title={form.mode === 'edit' ? `تعديل ${levelLabel} ${form.code}` : `إضافة ${levelLabel}`}>
        {/* سطرٌ واحد يقول ما يجري الآن وما المطلوب — فلا يُترك المستخدم يخمّن. */}
        <p className="text-sm text-ink-2 mb-3">
          {form.mode === 'edit' ? (
            'الاسم والأب يُبدَّلان. والرمز هويّةٌ تُثبَّت مرّةً واحدة: تغييرُه يشقّ الموقع نسختين ويقطع تكلفة الأمس عن اليوم.'
          ) : parentPath ? (
            <>تُضيف <b className="text-ink">{levelLabel}</b> تحت «{parentPath}» — لم يبقَ إلّا الاسم.</>
          ) : !locations.length ? (
            <>ابدأ باسم أوّل <b className="text-ink">قطاع</b>؛ وحين يُحفظ يظهر في الشجرة أسفلَ الصفحة بزرّ «أضف براندًا» — ومنه تنزل الشجرة خطوةً خطوة.</>
          ) : parentLevel ? (
            <>تُضيف <b className="text-ink">{levelLabel}</b> — اختر {levelOf(parentLevel).labelAr}ه ثمّ اكتب الاسم. (أو انقر «أضف {levelLabel}ًا» عند موضعه في الشجرة، فيُملأ الأب وحده.)</>
          ) : (
            <>تُضيف <b className="text-ink">قطاعًا</b> — وهو جذر الشجرة فلا أب له. اكتب اسمه واحفظ.</>
          )}
        </p>

        <div className="grid gap-3 md:grid-cols-4 items-end">
          {/* ① الاسم أوّلًا — وهو الشيء الوحيد الذي يعرفه المستخدم حقًّا. */}
          <label className="text-sm md:col-span-2">
            <span className="text-ink-2">اسم {levelLabel}</span>
            <input className={`${input} mt-1`} value={form.nameAr}
              placeholder={PLACEHOLDER_NAME[form.level] || ''}
              onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} />
          </label>

          {/* ② الأب: مسارٌ مثبَّت إن جاء النقر من الشجرة، ومنسدلةٌ بمساراتها إن لم يأتِ. */}
          <div className="text-sm">
            <span className="text-ink-2">{parentLevel ? levelOf(parentLevel).labelAr : 'الموضع'}</span>
            {!parentLevel ? (
              <div className="mt-1 px-3 py-2 text-sm text-ink-2 border border-dashed border-line rounded-lg">جذر الشجرة</div>
            ) : form.parentCode && form.mode === 'create' ? (
              <div className="mt-1 flex items-center gap-2 px-3 py-2 border border-line bg-chip rounded-lg">
                <span className="text-sm text-ink truncate" title={parentPath}>{parentPath || form.parentCode}</span>
                <button type="button" className="text-xs text-ink-2 underline shrink-0"
                  onClick={() => setForm((f) => ({ ...f, parentCode: '' }))}>تغيير</button>
              </div>
            ) : parentOptions.length ? (
              <select className={`${input} mt-1`} value={form.parentCode}
                onChange={(e) => setForm((f) => ({ ...f, parentCode: e.target.value }))}>
                <option value="">— اختر {levelOf(parentLevel).labelAr} —</option>
                {parentOptions.map((p) => (
                  <option key={p.code} value={p.code}>{p.path} ({p.code})</option>
                ))}
              </select>
            ) : (
              // قائمةٌ فارغة تقول ما يُفعل، لا تصمت.
              <div className="mt-1 px-3 py-2 text-xs text-ink-2 border border-dashed border-line rounded-lg">
                لا {levelOf(parentLevel).labelAr} بعد — أضِفه أوّلًا.
              </div>
            )}
          </div>

          {/* ③ الرمز: يُولّده النظام، ويبقى بابُ اليد مفتوحًا لمن له ترميزٌ قائم. */}
          <div className="text-sm">
            <span className="text-ink-2">الرمز</span>
            {form.mode === 'edit' || form.autoCode ? (
              <div className="mt-1 flex items-center gap-2 px-3 py-2 border border-line bg-chip rounded-lg">
                <span className="text-sm text-ink font-bold" dir="ltr">{formCode || '—'}</span>
                {form.mode === 'edit' ? (
                  <span className="text-xs text-ink-2 shrink-0">ثابت</span>
                ) : (
                  <button type="button" className="text-xs text-ink-2 underline shrink-0 ms-auto"
                    onClick={() => setForm((f) => ({ ...f, autoCode: false, code: suggestedCode }))}>أكتبه بنفسي</button>
                )}
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-2">
                <input className={input} dir="ltr" value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
                <button type="button" className="text-xs text-ink-2 underline shrink-0"
                  onClick={() => setForm((f) => ({ ...f, autoCode: true }))}>تلقائيّ</button>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-3">
          <button type="button" disabled={busy || !form.nameAr.trim() || !formCode.trim() || (parentLevel && !form.parentCode)}
            onClick={save}
            className="rounded-lg bg-accent hover:opacity-90 disabled:opacity-40 px-4 py-2 text-sm font-bold text-white transition-colors">
            {busy ? 'جارٍ الحفظ…' : form.mode === 'edit' ? 'حفظ التعديل' : `حفظ ${levelLabel}`}
          </button>
          {form.mode === 'edit' || form.parentCode ? (
            <button type="button" className="text-sm text-ink-2 underline" onClick={() => setForm(EMPTY_FORM)}>إلغاء</button>
          ) : null}
          {parentLevel && !form.parentCode && parentOptions.length ? (
            <span className="text-xs text-ink-2">اختر {levelOf(parentLevel).labelAr}ه أوّلًا.</span>
          ) : null}
        </div>

        <Flash flash={flash} at="form" />
        <p className="text-xs text-ink-2 mt-2">
          لا حذف: موقعٌ حُمِّلت عليه تكلفةٌ تاريخيّة يُعطَّل فتبقى تقارير الأمس مقروءة.
          والأكواد المعتمدة ومطابقتها مع أودو قرار المالك (CC-O02) — الشاشة تقترح ولا تفرض.
        </p>
      </Section>

      <Section title="غرس الشجرة بالجملة (Excel)">
        <div className="flex flex-wrap items-center gap-3">
          {/*
            القالب أوّلًا ثمّ الرفع — بترتيب العمل لا بترتيب الشيفرة: من لا يملك
            الشيت لا ينفعه زرُّ الاختيار. والقالب يُولَّد من مخطّط المستورِد نفسه،
            فما نُسلّمه هو ما نقرأ.
          */}
          <button type="button" onClick={downloadTemplate}
            className="rounded-lg border border-accent/40 text-accent px-4 py-2 text-sm hover:bg-accent/5">
            نزّل قالب الإكسل
          </button>
          <label className="rounded-lg border border-line bg-chip px-4 py-2 text-sm cursor-pointer hover:border-accent/60">
            اختر ملفّ الشجرة…
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => { previewImport(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {!locations.length ? (
            <button type="button" disabled={importing} onClick={plantSeed}
              className="rounded-lg border border-line px-4 py-2 text-sm text-ink-2 hover:border-accent/60 disabled:opacity-40">
              {importing ? 'جارٍ الغرس…' : 'غرس بذرة تجريبيّة (DEMO-)'}
            </button>
          ) : null}
          <span className="text-xs text-ink-2">
            نزّل القالب وامْلأ ورقته الأولى «الشجرة» ثمّ ارفعه هنا — وهو يُقبل كاملًا أو يُرفض كاملًا،
            والمعاينة تسبق الكتابة.
          </span>
        </div>
        <Flash flash={flash} at="bulk" />

        {importPlan ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm">
              قُرئ {importPlan.counts.read} صفًّا: <b>{importPlan.counts.created}</b> جديدًا ·{' '}
              <b>{importPlan.counts.updated}</b> تحديثًا · <b className={importPlan.counts.rejected ? 'text-red-600' : ''}>{importPlan.counts.rejected}</b> مرفوضًا.
            </p>
            {importPlan.problems.length ? (
              <ul className="text-sm text-red-600 list-disc pr-5 space-y-1 max-h-48 overflow-y-auto">
                {importPlan.problems.slice(0, 30).map((p) => <li key={p}>{p}</li>)}
                {importPlan.problems.length > 30 ? <li>… و{importPlan.problems.length - 30} أخرى.</li> : null}
              </ul>
            ) : null}
            <div className="flex gap-3">
              <button type="button" disabled={!importPlan.ok || importing} onClick={commitImport}
                className="rounded-lg bg-accent hover:opacity-90 disabled:opacity-40 px-4 py-2 text-sm font-bold text-white">
                {importing ? 'جارٍ الغرس…' : importPlan.ok ? `اغرس ${importPlan.counts.accepted} موقعًا` : 'الغرس ممنوع — أصلح الشيت أوّلًا'}
              </button>
              <button type="button" className="text-sm text-ink-2 underline" onClick={() => setImportPlan(null)}>إلغاء</button>
            </div>
          </div>
        ) : null}
      </Section>

      {profileFor && profileForm ? (
        <Section title={`الملفّ التشغيليّ للفرع ${profileFor}`}>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">المدينة
              <input className={input} value={profileForm.city}
                onChange={(e) => patchProfile('city', e.target.value)} />
            </label>
            <label className="text-sm">نوع النشاط
              <select className={input} value={profileForm.concept}
                onChange={(e) => patchProfile('concept', e.target.value)}>
                <option value="">— اختر —</option>
                {Object.values(CONCEPT_TYPES).map((c) => <option key={c.id} value={c.id}>{c.labelAr}</option>)}
              </select>
            </label>
            <label className="text-sm">تاريخ الافتتاح
              <input type="date" className={input} value={profileForm.openingDate}
                onChange={(e) => patchProfile('openingDate', e.target.value)} />
            </label>
            <label className="text-sm">حالة الفرع
              <select className={input} value={profileForm.state}
                onChange={(e) => patchProfile('state', e.target.value)}>
                {Object.values(BRANCH_STATES).map((st) => <option key={st.id} value={st.id}>{st.labelAr} — {st.hint}</option>)}
              </select>
            </label>
            <label className="text-sm">الطاقة التشغيليّة (وجبات/يوم)
              <input type="number" min="0" className={input} value={profileForm.coversPerDay || ''}
                onChange={(e) => patchProfile('coversPerDay', Number(e.target.value))} />
            </label>
            <label className="text-sm">حجم المبيعات المتوقّع (يوميًّا)
              <input type="number" min="0" className={input} value={profileForm.expectedDailySales || ''}
                onChange={(e) => patchProfile('expectedDailySales', Number(e.target.value))} />
            </label>
            <label className="text-sm md:col-span-2">المنيو المعتمد (أكواد أصناف البيع، تفصلها فاصلة)
              <input className={input} dir="ltr" value={(profileForm.menuSkus || []).join(', ')}
                onChange={(e) => patchProfile('menuSkus', e.target.value.split(/[,\s]+/).filter(Boolean))} />
            </label>
            <label className="text-sm">مهلة التوريد (أيّام)
              <input type="number" min="0" className={input} value={profileForm.leadDays || ''}
                onChange={(e) => patchProfile('leadDays', Number(e.target.value))} />
            </label>
          </div>

          <div className="mt-3">
            <div className="text-sm mb-1">أيّام التوريد</div>
            <div className="flex flex-wrap gap-2">
              {WEEK_DAYS.map((d) => {
                const on = (profileForm.supplyDays || []).includes(d);
                return (
                  <button key={d} type="button"
                    onClick={() => patchProfile('supplyDays', on
                      ? profileForm.supplyDays.filter((x) => x !== d)
                      : [...(profileForm.supplyDays || []), d])}
                    className={`rounded-lg border px-3 py-1 text-sm ${on ? 'border-accent text-accent' : 'border-line text-ink-2'}`}>
                    {WEEK_DAY_LABELS[d]}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-ink-2 mt-1">بلا تقويمٍ: كلّ يومٍ صالح للتوريد — لا تعطيل.</p>
          </div>

          {profileGaps({ profile: profileForm }).length ? (
            <ul className="text-xs text-ink-2 list-disc pr-5 mt-3 space-y-1">
              {profileGaps({ profile: profileForm }).map((g) => <li key={g}>{g}</li>)}
            </ul>
          ) : null}

          <div className="flex gap-3 mt-3">
            <button type="button" disabled={busy} onClick={commitProfile}
              className="rounded-lg bg-accent hover:opacity-90 disabled:opacity-40 px-4 py-2 text-sm font-bold text-white">
              {busy ? 'جارٍ الحفظ…' : 'حفظ الملفّ'}
            </button>
            <button type="button" className="text-sm text-ink-2 underline"
              onClick={() => { setProfileFor(null); setProfileForm(null); }}>إلغاء</button>
          </div>
          <Flash flash={flash} at="profile" />
          <p className="text-xs text-ink-2 mt-2">
            الحدّ الأدنى وPar Level والأصناف المعتمَدة ومسار التوريد سياسةُ صنفٍ لا صفةَ فرع — تُبنى في FNB-202 وFNB-203.
          </p>
        </Section>
      ) : null}

      <Section title="الشجرة">
        {!tree.length ? (
          <Muted>لا مواقع بعد — احفظ أوّل قطاع من الأعلى، ثمّ يظهر هنا بزرّ «أضف براند» تحته.</Muted>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink-2 border-b border-line">
                  {['الموقع', 'الرمز', 'المستوى', 'تكلفة مباشرة', 'تكلفة تجميعيّة', 'الحالة', ''].map((h) => (
                    <th key={h} className="text-right py-2 px-2 font-normal whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tree.map((loc) => {
                  const row = cost.byLocation.get(String(loc.code).toUpperCase());
                  return (
                    <tr key={loc.code} className="border-b border-line/50">
                      <td className="py-2 px-2">
                        <span style={{ paddingInlineStart: `${loc.depth * 1.25}rem` }}>
                          {loc.orphan ? '⚠ ' : ''}{loc.nameAr || loc.code}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-ink-2" dir="ltr">{loc.code}</td>
                      <td className="py-2 px-2 text-ink-2">{levelOf(loc.level)?.labelAr || loc.level}</td>
                      <td className="py-2 px-2">{fmt(row?.direct)}</td>
                      <td className="py-2 px-2 font-bold">{fmt(row?.rollup)}</td>
                      <td className="py-2 px-2">{loc.active === false ? <span className="text-ink-2">معطَّل</span> : 'نشط'}</td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        {/*
                          ★ الأب يُنقر في موضعه لا يُستدعى من قائمة: «أضف براندًا» على صفّ
                          القطاع نفسه — كما يُدرَج موقعٌ تحت مستودعه. المستوى والأب والرمز
                          تتبع مكان النقر، فلا يبقى للمستخدم إلّا الاسم.
                        */}
                        {childLevelOf(loc.level) && loc.active !== false ? (
                          <button type="button"
                            className="text-xs text-accent border border-accent/40 rounded-lg px-2 py-1 hover:bg-accent/5"
                            onClick={() => startChild(loc.code)}>
                            + أضف {childLevelOf(loc.level).labelAr}
                          </button>
                        ) : null}
                        <button type="button" className="text-xs text-ink-2 underline ms-3"
                          onClick={() => startEdit(loc)}>
                          تعديل
                        </button>
                        <button type="button" className="text-xs text-ink-2 underline ms-3"
                          onClick={() => setOrgLocationActive(loc.code, loc.active === false, me)}>
                          {loc.active === false ? 'تفعيل' : 'تعطيل'}
                        </button>
                        {loc.level === 'branch' ? (
                          <button type="button" className="text-xs text-accent underline ms-3" onClick={() => openProfile(loc)}>
                            الملفّ ({profileCompleteness(loc)}٪)
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-ink-2 mt-3">
          التكلفة من آخر {cost.carrying} مستندًا معتمَدًا/منجَزًا يحمل رمز موقع (عيّنة محدودة السقف —
          التقرير الجامع في مركز التقارير)
          {cost.unlinked > 0 ? ` · غير مربوط: ${fmt(cost.unlinked)} — نصٌّ لا يطابق الشجرة، يُنظَّف على مهل.` : '.'}
        </p>
      </Section>
    </div>
  );
}

/**
 * رسالةٌ تظهر **حيث وقع الفعل**: لكلّ رسالةٍ موضعُها (`at`)، فلا يُنزَّل قالبٌ
 * في قسم الاستيراد ثمّ يُعلَن نجاحه في قسمٍ آخر فوقه.
 */
function Flash({ flash, at }) {
  if (!flash || flash.at !== at) return null;
  return <p className={`text-sm mt-2 ${flash.kind === 'err' ? 'text-red-600' : 'text-ink-2'}`}>{flash.text}</p>;
}

function Section({ title, children }) {
  return (
    <section className="border border-line rounded-xl p-4">
      <h2 className="text-base text-ink mb-3">{title}</h2>
      {children}
    </section>
  );
}

/**
 * بطاقةُ خطوة: عدّادٌ ومدخلٌ معًا — الرقم يقول أين وصلت، والزرّ يفتح التالي،
 * والمحجوبة تقول بم تُفتح بدل أن تصمت. (رقم الخطوة لاتينيّ كبقيّة أرقام البوابة.)
 */
function StepCard({ step, active, onPick }) {
  return (
    <div className={`border rounded-xl p-3 transition-colors ${active ? 'border-accent bg-accent/5' : 'border-line bg-chip'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xs text-ink-2">
          <span dir="ltr">{step.order}</span>. {step.labelAr}
        </div>
        <div className="text-xl text-ink">{step.count}</div>
      </div>
      {step.ready ? (
        <button type="button" onClick={onPick}
          className={`mt-2 text-xs underline ${active ? 'text-accent' : 'text-ink-2 hover:text-accent'}`}>
          {active ? 'مفتوحٌ للإضافة' : `أضف ${step.labelAr}`}
        </button>
      ) : (
        <p className="mt-2 text-xs text-ink-2">{step.hint}</p>
      )}
    </div>
  );
}

function Muted({ children }) {
  return <p className="text-sm text-ink-2">{children}</p>;
}

function fmt(n) {
  const v = Number(n) || 0;
  if (!v) return '—';
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}
