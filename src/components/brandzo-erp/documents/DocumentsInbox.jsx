/**
 * صندوق المستندات — «مستنداتي» و«بانتظار اعتمادي» و«الكل» (للمدير).
 *
 * هذه هي الشاشة التي لم يكن للورق مثيلٌ لها: الورقة المطبوعة تُوضع على مكتب
 * وتُنسى. هنا يرى المعتمِد ما ينتظره، ويرى المُنشئ أين وصل مستنده.
 */
import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import {
  listenMyDocuments,
  listenPendingApproval,
  listenAllDocuments,
} from '../../../services/documents/documentsService.js';
import { getSchema, GOVERNED_FORMS } from '../../../services/documents/schemas/index.js';
import { getState } from '../../../services/documents/states.js';

const MANAGER_ROLES = ['admin', 'warehouse_manager'];

function fmt(ts) {
  const d = ts?.toDate?.();
  if (!d) return '—';
  return d.toLocaleString('ar-LY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function DocumentsInbox() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('mine');
  const [mine, setMine] = useState([]);
  const [pending, setPending] = useState([]);
  const [all, setAll] = useState([]);
  const base = getBasePath();

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      setMe(user ? await fetchUserProfile(user) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!me) return;
    const subs = [listenMyDocuments(me.uid, setMine), listenPendingApproval(setPending)];
    if (MANAGER_ROLES.includes(me.role)) subs.push(listenAllDocuments(setAll));
    return () => subs.forEach((u) => u());
  }, [me]);

  /** ما ينتظر اعتماد **هذا** المستخدم تحديدًا — لا كل ما أُرسل. */
  const forMe = useMemo(
    () =>
      pending.filter((d) => {
        if (me?.role === 'admin') return true;
        const approvers = getSchema(d.type)?.roles?.approve || [];
        return approvers.includes(me?.role);
      }),
    [pending, me]
  );

  if (!ready) return <p className="text-gray-300 text-sm py-10 text-center">جارٍ التحقّق…</p>;
  if (!me) {
    return (
      <div className="bg-brand-red/10 border border-brand-red/40 text-red-200 rounded-2xl p-6 text-center" dir="rtl">
        <p className="font-bold text-lg mb-1">🔒 يلزم تسجيل الدخول</p>
      </div>
    );
  }

  const tabs = [
    { key: 'mine', label: 'مستنداتي', count: mine.length },
    { key: 'pending', label: 'بانتظار اعتمادي', count: forMe.length },
    ...(MANAGER_ROLES.includes(me.role) ? [{ key: 'all', label: 'كل المستندات', count: all.length }] : []),
  ];
  const rows = tab === 'mine' ? mine : tab === 'pending' ? forMe : all;

  return (
    <div dir="rtl" className="space-y-6">
      {/* بدء مستند جديد — الجاهز فقط، والباقي معلَّم بمرحلته */}
      <div className="flex flex-wrap gap-2">
        {GOVERNED_FORMS.filter((f) => f.ready).map((f) => (
          <a
            key={f.type}
            href={`${base}/dashboard/document?type=${f.type}`}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-brand-gold text-brand-navy hover:bg-brand-gold/85 transition-colors"
          >
            ＋ {f.titleAr}
          </a>
        ))}
        {GOVERNED_FORMS.filter((f) => !f.ready).map((f) => (
          <span
            key={f.type}
            title={`يصل في المرحلة ${f.phase} — النموذج الورقي متاح الآن في مكتبة النماذج`}
            className="px-4 py-2 rounded-lg text-sm bg-white/5 text-gray-500 border border-white/10 cursor-default"
          >
            {f.titleAr} <span className="text-[10px] text-gray-600">({f.phase})</span>
          </span>
        ))}
      </div>

      <div className="flex gap-2 border-b border-white/10">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-bold border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-brand-gold text-brand-gold'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className="mr-2 text-[11px] bg-white/10 rounded-full px-2 py-0.5">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-center text-gray-500 text-sm py-10">
          {tab === 'pending' ? 'لا شيء ينتظر اعتمادك. ✅' : 'لا مستندات بعد — ابدأ واحدًا من الأعلى.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[640px] text-right">
            <thead>
              <tr className="bg-white/10">
                {['الرقم', 'النوع', 'الحالة', 'أنشأه', 'آخر تحديث', ''].map((h) => (
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
                return (
                  <tr key={d.id} className="border-t border-white/5 hover:bg-white/5">
                    <td className="px-3 py-2 font-mono text-sm text-brand-gold">{d.number || '— مسودّة'}</td>
                    <td className="px-3 py-2 text-sm text-gray-200">{schema?.titleAr || d.type}</td>
                    <td className="px-3 py-2">
                      <span
                        className="text-[11px] font-bold px-2 py-0.5 rounded-full border"
                        style={{ color: state.color, borderColor: `${state.color}66`, background: `${state.color}1a` }}
                      >
                        {state.emoji} {state.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-300">{d.createdByName}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{fmt(d.updatedAt || d.createdAt)}</td>
                    <td className="px-3 py-2">
                      <a
                        href={`${base}/dashboard/document?type=${d.type}&id=${d.id}`}
                        className="text-sm font-bold text-brand-gold hover:underline"
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
    </div>
  );
}
