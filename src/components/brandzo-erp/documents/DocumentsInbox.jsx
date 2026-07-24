/**
 * صندوق المستندات (F5) — «مستنداتي» و«بانتظار اعتمادي» و«الكل» (للمدير).
 *
 * هذه هي الشاشة التي لم يكن للورق مثيلٌ لها: الورقة المطبوعة تُوضع على مكتب
 * **فتُنسى**، ولا أحد يعرف كم بقيت هناك. هنا يرى المعتمِد ما ينتظره **مرتّبًا
 * بإلحاحه**، ويرى المُنشئ أين وصل مستنده، ويُكشف المنسيّ بشارة «متأخّر».
 *
 * كل الحساب في `inbox.js` الخالص المُختبَر؛ هذا عرضٌ وتفاعل.
 */
import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import {
  listenMyDocuments,
  listenPendingApproval,
  listenAllDocuments,
} from '../../../services/documents/documentsService.js';
import { getSchema, GOVERNED_FORMS } from '../../../services/documents/schemas/index.js';
import { getState, STATES } from '../../../services/documents/states.js';
import { PURCHASE_CHAIN, OUTBOUND_CHAIN } from '../../../services/documents/chain.js';
import {
  awaitingMyApproval,
  sortByUrgency,
  filterDocs,
  inboxStats,
  ageInState,
  isStale,
  toCsv,
  csvFileName,
} from '../../../services/documents/inbox.js';

const MANAGER_ROLES = ['admin', 'warehouse_manager'];

function fmt(ts) {
  const d = ts?.toDate?.();
  if (!d) return '—';
  return d.toLocaleString('ar-LY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** بطاقة عدّ في شريط اللقطة. */
function Tile({ value, label, tone = 'text-gray-100' }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center">
      <div className={`text-lg font-extrabold leading-tight ${tone}`}>{value}</div>
      <div className="text-[10px] text-gray-400 font-bold mt-0.5">{label}</div>
    </div>
  );
}

export default function DocumentsInbox() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('pending');
  const [mine, setMine] = useState([]);
  const [pending, setPending] = useState([]);
  const [all, setAll] = useState([]);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  /** يُثبَّت مرّة عند التحميل: لو قرأنا الساعة في كل رسم لتغيّر الترتيب تحت المؤشّر. */
  const [now] = useState(() => Date.now());
  const base = getBasePath();

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      setMe(user ? await fetchUserProfile(user) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!me) return undefined;
    const subs = [listenMyDocuments(me.uid, setMine), listenPendingApproval(setPending)];
    if (MANAGER_ROLES.includes(me.role)) subs.push(listenAllDocuments(setAll));
    return () => subs.forEach((u) => u());
  }, [me]);

  /** ما ينتظر اعتماد **هذا** المستخدم تحديدًا — لا كل ما أُرسل. */
  const forMe = useMemo(() => awaitingMyApproval(pending, me), [pending, me]);

  const source = tab === 'mine' ? mine : tab === 'pending' ? forMe : all;
  const rows = useMemo(
    () => sortByUrgency(filterDocs(source, { q, type: typeFilter, state: stateFilter }), now),
    [source, q, typeFilter, stateFilter, now]
  );
  const stats = useMemo(() => inboxStats(source, now), [source, now]);

  function exportCsv() {
    const label = tab === 'mine' ? 'مستنداتي' : tab === 'pending' ? 'بانتظار-اعتمادي' : 'الكل';
    const blob = new Blob([toCsv(rows, now)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = csvFileName(label, now);
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!ready) return <p className="text-gray-300 text-sm py-10 text-center">جارٍ التحقّق…</p>;
  if (!me) {
    return (
      <div className="bg-brand-red/10 border border-brand-red/40 text-red-200 rounded-2xl p-6 text-center" dir="rtl">
        <p className="font-bold text-lg mb-1">🔒 يلزم تسجيل الدخول</p>
      </div>
    );
  }

  const tabs = [
    { key: 'pending', label: 'بانتظار اعتمادي', count: forMe.length },
    { key: 'mine', label: 'مستنداتي', count: mine.length },
    ...(MANAGER_ROLES.includes(me.role) ? [{ key: 'all', label: 'كل المستندات', count: all.length }] : []),
  ];

  /** أزرار البدء مجمّعة بسلسلتها — تسعة أزرار مسطّحة تُربك لا تُيسّر. */
  const readyForms = GOVERNED_FORMS.filter((f) => f.ready);
  const groups = [
    { title: '📥 الوارد', types: PURCHASE_CHAIN },
    { title: '📤 الصادر', types: OUTBOUND_CHAIN },
  ];

  return (
    <div dir="rtl" className="space-y-5">
      {/* ── بدء مستند جديد، مجمّعًا بالسلسلة ── */}
      <div className="space-y-2">
        {groups.map((g) => {
          const forms = readyForms.filter((f) => g.types.includes(f.type));
          if (!forms.length) return null;
          return (
            <div key={g.title} className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-gray-400 w-16">{g.title}</span>
              {forms.map((f) => (
                <a
                  key={f.type}
                  href={`${base}/dashboard/document?type=${f.type}`}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-brand-gold text-brand-navy hover:bg-brand-gold/85 transition-colors"
                >
                  ＋ {f.titleAr}
                </a>
              ))}
            </div>
          );
        })}
        {GOVERNED_FORMS.some((f) => !f.ready) && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-gray-500 w-16">⏳ قادم</span>
            {GOVERNED_FORMS.filter((f) => !f.ready).map((f) => (
              <span
                key={f.type}
                title={`يصل في المرحلة ${f.phase} — النموذج الورقي متاح الآن في مكتبة النماذج`}
                className="px-3.5 py-1.5 rounded-lg text-xs bg-white/5 text-gray-500 border border-white/10 cursor-default"
              >
                {f.titleAr} <span className="text-[10px] text-gray-600">({f.phase})</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── التبويبات ── */}
      <div className="flex gap-2 border-b border-white/10 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-bold border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-brand-gold text-brand-gold' : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
            {t.count > 0 && <span className="mr-2 text-[11px] bg-white/10 rounded-full px-2 py-0.5">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ── لقطة الحالة ── */}
      {stats.total > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <Tile value={stats.total} label="الإجمالي" />
          <Tile value={stats.draft} label="مسودّة" />
          <Tile value={stats.submitted} label="بانتظار الاعتماد" tone="text-amber-300" />
          <Tile value={stats.approved} label="معتمَد" tone="text-emerald-300" />
          <Tile value={stats.done} label="منجَز" tone="text-emerald-400" />
          <Tile value={stats.stale} label="⏰ متأخّر" tone={stats.stale ? 'text-red-300' : 'text-gray-400'} />
        </div>
      )}

      {/* ── البحث والتصفية والتصدير ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 ابحث برقم المستند أو نوعه أو منشئه…"
          className="flex-1 min-w-[14rem] bg-white/10 border border-white/20 rounded-lg text-white text-sm px-3 py-2 focus:outline-none focus:border-brand-gold/50"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-white/10 border border-white/20 rounded-lg text-white text-sm px-3 py-2 focus:outline-none focus:border-brand-gold/50"
        >
          <option value="">كل الأنواع</option>
          {readyForms.map((f) => (
            <option key={f.type} value={f.type} className="text-black">
              {f.titleAr}
            </option>
          ))}
        </select>
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="bg-white/10 border border-white/20 rounded-lg text-white text-sm px-3 py-2 focus:outline-none focus:border-brand-gold/50"
        >
          <option value="">كل الحالات</option>
          {Object.values(STATES).map((s) => (
            <option key={s.id} value={s.id} className="text-black">
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 disabled:opacity-40 px-4 py-2 text-sm font-bold text-gray-100 transition-colors"
        >
          ⬇️ تصدير ({rows.length})
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-center text-gray-500 text-sm py-10">
          {q || typeFilter || stateFilter
            ? 'لا نتائج لهذا البحث.'
            : tab === 'pending'
              ? 'لا شيء ينتظر اعتمادك. ✅'
              : 'لا مستندات بعد — ابدأ واحدًا من الأعلى.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[720px] text-right">
            <thead>
              <tr className="bg-white/10">
                {['الرقم', 'النوع', 'الحالة', 'أنشأه', 'الانتظار', 'آخر تحديث', ''].map((h) => (
                  <th key={h} className="px-3 py-2 text-xs font-bold text-gray-300">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const state = getState(d.state);
                const schema = getSchema(d.type);
                const age = ageInState(d, now);
                const stale = isStale(d, now);
                return (
                  <tr key={d.id} className={`border-t border-white/5 hover:bg-white/5 ${stale ? 'bg-red-500/5' : ''}`}>
                    <td className="px-3 py-2 font-mono text-sm text-brand-gold">{d.number || '— مسودّة'}</td>
                    <td className="px-3 py-2 text-sm text-gray-200">{schema?.titleAr || d.type}</td>
                    <td className="px-3 py-2">
                      <span
                        className="text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap"
                        style={{ color: state.color, borderColor: `${state.color}66`, background: `${state.color}1a` }}
                      >
                        {state.emoji} {state.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-300">{d.createdByName}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {age == null ? (
                        <span className="text-gray-600">—</span>
                      ) : stale ? (
                        <span className="text-red-300 font-bold">⏰ {age} يومًا</span>
                      ) : (
                        <span className="text-gray-400">{age} يومًا</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{fmt(d.updatedAt || d.createdAt)}</td>
                    <td className="px-3 py-2">
                      <a
                        href={`${base}/dashboard/document?type=${d.type}&id=${d.id}`}
                        className="text-sm font-bold text-brand-gold hover:underline whitespace-nowrap"
                      >
                        فتح ←
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {stats.stale > 0 && (
        <p className="text-[11px] text-gray-500">
          ⏰ «متأخّر» = تجاوز مهلة حالته (بانتظار الاعتماد: يومان · معتمَد: ٥ أيام · مسودّة: أسبوعان) —
          وهو ما كان الورق يُخفيه على المكاتب.
        </p>
      )}
    </div>
  );
}
