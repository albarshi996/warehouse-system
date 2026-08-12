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
import { listenOrgLocations, saveOrgLocation, setOrgLocationActive } from '../../../services/org/orgLocationsService.js';
import { subscribePartners } from '../../../services/partnerService.js';
import { listenAllDocuments } from '../../../services/documents/documentsService.js';
import {
  ORG_LEVELS, levelOf, indexLocations, locationProblems,
  internalBranchProblems, orgCodeOf, docAmountOf, costByLocation, unlinkedCost,
} from '../../../services/org/orgLocations.js';

const VIEWER_ROLES = ['admin', 'warehouse_manager', 'finance_manager'];

const input =
  'w-full bg-chip border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-gray-500 focus:outline-none focus:border-accent/60';

const EMPTY_FORM = { code: '', nameAr: '', level: 'sector', parentCode: '' };

export default function OrgDimensions() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [locations, setLocations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);

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
  const parentOptions = useMemo(
    () => locations.filter((l) => l.level === parentLevel && l.active !== false),
    [locations, parentLevel]
  );

  async function save() {
    if (busy) return;
    setBusy(true);
    setFlash(null);
    try {
      const code = await saveOrgLocation(
        { ...form, code: form.code.trim().toUpperCase(), parentCode: parentLevel ? form.parentCode : '' },
        locations,
        me
      );
      setFlash({ kind: 'ok', text: `حُفظ الموقع ${code}.` });
      setForm(EMPTY_FORM);
    } catch (e) {
      setFlash({ kind: 'err', text: e?.message || 'تعذّر الحفظ.' });
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <Muted>جارٍ التحقّق من الصلاحية…</Muted>;
  if (!me) return <Muted>سجّل الدخول لعرض هذه الشاشة.</Muted>;
  if (!VIEWER_ROLES.includes(me.role)) return <Muted>هذه الشاشة للمديرَين والماليّ.</Muted>;

  const counts = Object.fromEntries(ORG_LEVELS.map((l) => [l.id, locations.filter((x) => x.level === l.id).length]));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {ORG_LEVELS.map((l) => (
          <Kpi key={l.id} label={l.labelAr} value={counts[l.id]} />
        ))}
      </div>

      {treeProblems.length || branchProblems.length ? (
        <Section title="تدخّل الآن">
          <ul className="text-sm text-red-600 list-disc pr-5 space-y-1">
            {[...treeProblems, ...branchProblems].map((p) => <li key={p}>{p}</li>)}
          </ul>
        </Section>
      ) : null}

      <Section title="إضافة / تعديل موقع">
        <div className="grid gap-3 md:grid-cols-5">
          <input className={input} placeholder="الرمز (مثل SEC-FOOD)" dir="ltr" value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
          <input className={input} placeholder="الاسم العربيّ" value={form.nameAr}
            onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} />
          <select className={input} value={form.level}
            onChange={(e) => setForm((f) => ({ ...f, level: e.target.value, parentCode: '' }))}>
            {ORG_LEVELS.map((l) => <option key={l.id} value={l.id}>{l.labelAr}</option>)}
          </select>
          {parentLevel ? (
            <select className={input} value={form.parentCode}
              onChange={(e) => setForm((f) => ({ ...f, parentCode: e.target.value }))}>
              <option value="">— الأب ({levelOf(parentLevel).labelAr}) —</option>
              {parentOptions.map((p) => <option key={p.code} value={p.code}>{p.nameAr || p.code}</option>)}
            </select>
          ) : (
            <div className="text-xs text-ink-2 self-center">القطاع جذرٌ بلا أب</div>
          )}
          <button type="button" disabled={busy || !form.code.trim() || !form.nameAr.trim()}
            onClick={save}
            className="rounded-lg bg-accent hover:opacity-90 disabled:opacity-40 px-4 py-2 text-sm font-bold text-white transition-colors">
            {busy ? 'جارٍ الحفظ…' : 'حفظ'}
          </button>
        </div>
        {flash ? (
          <p className={`text-sm mt-2 ${flash.kind === 'err' ? 'text-red-600' : 'text-ink-2'}`}>{flash.text}</p>
        ) : null}
        <p className="text-xs text-ink-2 mt-2">
          لا حذف: موقعٌ حُمِّلت عليه تكلفةٌ تاريخيّة يُعطَّل فتبقى تقارير الأمس مقروءة.
          والأكواد المعتمدة ومطابقتها مع أودو قرار المالك (CC-O02) — الشاشة لا تخترعها.
        </p>
      </Section>

      <Section title="الشجرة">
        {!tree.length ? (
          <Muted>لا مواقع بعد — أضف القطاعات أوّلًا ثمّ انزل الشجرة.</Muted>
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
                      <td className="py-2 px-2">
                        <button type="button" className="text-xs text-ink-2 underline"
                          onClick={() => setOrgLocationActive(loc.code, loc.active === false, me)}>
                          {loc.active === false ? 'تفعيل' : 'تعطيل'}
                        </button>
                        <button type="button" className="text-xs text-ink-2 underline ms-3"
                          onClick={() => setForm({ code: loc.code, nameAr: loc.nameAr || '', level: loc.level, parentCode: loc.parentCode || '' })}>
                          تعديل
                        </button>
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

function Section({ title, children }) {
  return (
    <section className="border border-line rounded-xl p-4">
      <h2 className="text-base text-ink mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Kpi({ label, value }) {
  return (
    <div className="border border-line bg-chip rounded-xl p-3">
      <div className="text-xs text-ink-2 mb-1">{label}</div>
      <div className="text-xl text-ink">{value}</div>
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
