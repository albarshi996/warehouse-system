import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listenAllDocuments } from '../../../services/documents/documentsService.js';
import { listenRecentMoves } from '../../../services/ledger/ledgerService.js';
import { getRole } from '../../../services/auth/roles.js';
import {
  buildActivity,
  activitySummary,
  activeRoles,
  usedActions,
  fmtWhen,
} from '../../../services/reference/roleActivityModel.js';

/**
 * سجلّ حركة الأدوار — رصدٌ حيٌّ فعليّ (لا بذرة).
 *
 * يشترك في مصدرين حقيقيّين إضافة-فقط: رؤوس المستندات (إنشاء/اعتماد بالدور) ودفتر
 * الحركات (ترحيل/حركة مخزون بالدور)، فيبني `roleActivityModel` منهما سجلًّا موحّدًا
 * يمتلئ تلقائيًّا مع كل حركة في البوابة. القراءة فقط — لا يكتب شيئًا.
 */

const ACTION_META = {
  create:   { label: 'إنشاء',       color: '#6b7280' },
  submitted:{ label: 'تقديم',       color: '#e0a83c' },
  approved: { label: 'اعتماد',      color: '#2e9e5b' },
  rejected: { label: 'رفض',         color: '#c41e3a' }, /* الأحمر للتحذير فقط */
  posted:   { label: 'حركة/ترحيل',  color: '#DAAA3C' },
};

const DOC_LABEL = {
  GP: 'إذن بوابة', GRN: 'سند استلام', QC: 'فحص جودة', PO: 'أمر شراء', PR: 'طلب شراء',
  PUTAWAY: 'أمر تخزين', SO: 'أمر بيع', PICK: 'قائمة سحب', PACK: 'قائمة تعبئة',
  DN: 'إذن تسليم', INV: 'فاتورة', RET: 'مرتجع', CN: 'إشعار دائن', CC: 'جرد دوري',
  ADJ: 'تسوية جرد', DMG: 'سند تالف', TR: 'طلب نقل', TRN: 'مستند نقل', TRC: 'استلام نقل',
  IPR: 'طلب مشتريات', RFQ: 'كشف عروض', IPO: 'أمر شراء داخلي', PV: 'سند صرف', DLV: 'محضر تسليم',
};
const docLabel = (t) => DOC_LABEL[t] || t || 'مستند';

const ALL_COLOR = '#1a1a2e';

/** عرض الدور: الفارغ (مستندٌ قديمٌ قبل تسجيل الدور) يُعلَّم بصدقٍ لا يُنسب زورًا. */
function roleView(id) {
  if (!id || id === 'unknown') return { label: 'دور غير مُسجَّل', color: '#9ca3af' };
  const r = getRole(id);
  return { label: r.label, color: r.color };
}

function chipStyle(color, active) {
  return active
    ? { background: color, color: '#fff', borderColor: color }
    : { background: color + '14', color, borderColor: color + '66' };
}

export default function RoleActivity() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [docs, setDocs] = useState([]);
  const [moves, setMoves] = useState([]);
  const [loaded, setLoaded] = useState({ docs: false, moves: false });
  const [roleF, setRoleF] = useState('all');
  const [actionF, setActionF] = useState('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      if (!user) { setMe(null); setReady(true); return; }
      try {
        const profile = await fetchUserProfile(user);
        setMe(profile || { role: '', name: user.email });
      } catch {
        setMe({ role: '', name: user.email });
      }
      setReady(true);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!me) return undefined;
    const u1 = listenAllDocuments((rows) => {
      setDocs(rows);
      setLoaded((s) => ({ ...s, docs: true }));
    }, 150);
    const u2 = listenRecentMoves((rows) => {
      setMoves(rows);
      setLoaded((s) => ({ ...s, moves: true }));
    }, 150);
    return () => { u1?.(); u2?.(); };
  }, [me]);

  const entries = useMemo(() => buildActivity({ docs, moves, limit: 300 }), [docs, moves]);
  const summary = useMemo(() => activitySummary(entries), [entries]);
  const roles = useMemo(() => activeRoles(entries), [entries]);
  const actions = useMemo(() => usedActions(entries), [entries]);

  const filtered = useMemo(
    () => entries.filter((e) => {
      const okRole = roleF === 'all' || (e.roleId || 'unknown') === roleF;
      const okAction = actionF === 'all' || e.action === actionF;
      const okQ = !q || (e.docNumber || '').toLowerCase().includes(q);
      return okRole && okAction && okQ;
    }),
    [entries, roleF, actionF, q]
  );

  if (!ready) {
    return (
      <div className="rounded-2xl bg-chip border border-line p-10 text-center text-sm text-muted">
        جارٍ التحقّق من الدخول…
      </div>
    );
  }
  if (!me) {
    return (
      <div className="rounded-2xl bg-chip border border-line p-10 text-center text-sm text-muted">
        سجّل الدخول لعرض سجلّ حركة الأدوار.
      </div>
    );
  }

  const dataLoading = !loaded.docs || !loaded.moves;

  return (
    <div>
      {/* بطاقات الإحصاء الحيّة */}
      <section className="mb-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { v: summary.total, l: 'إجمالي القيود' },
            { v: summary.roles, l: 'دورًا فاعلًا' },
            { v: summary.approvals, l: 'اعتمادًا' },
            { v: summary.docs, l: 'مستندًا متأثّرًا' },
          ].map((s) => (
            <div key={s.l} className="bg-chip border border-line rounded-xl p-4 text-center">
              <div className="text-2xl font-extrabold text-brand-yellow">{s.v}</div>
              <div className="text-[11px] text-ink-2 mt-1">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* المصفّيات */}
      <section className="mb-8 rounded-2xl bg-chip border border-line p-5 no-print">
        <div className="mb-4">
          <p className="text-[11px] font-bold text-muted mb-2">تصفية بالدور</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRoleF('all')}
              className="px-3 py-2 rounded-xl border text-xs font-bold transition-all"
              style={chipStyle(ALL_COLOR, roleF === 'all')}
            >
              كل الأدوار ({summary.total})
            </button>
            {roles.map((r) => {
              const rv = roleView(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRoleF(r.id)}
                  className="px-3 py-2 rounded-xl border text-xs font-bold transition-all inline-flex items-center gap-1.5"
                  style={chipStyle(rv.color, roleF === r.id)}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: 'currentColor' }} aria-hidden="true"></span>
                  <span>{rv.label} ({r.count})</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-4">
          <p className="text-[11px] font-bold text-muted mb-2">تصفية بنوع الحركة</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActionF('all')}
              className="px-3 py-2 rounded-xl border text-xs font-bold transition-all"
              style={chipStyle(ALL_COLOR, actionF === 'all')}
            >
              كل الحركات ({summary.total})
            </button>
            {actions.map((a) => {
              const meta = ACTION_META[a.action] || { label: a.action, color: '#6b7280' };
              return (
                <button
                  key={a.action}
                  type="button"
                  onClick={() => setActionF(a.action)}
                  className="px-3 py-2 rounded-xl border text-xs font-bold transition-all"
                  style={chipStyle(meta.color, actionF === a.action)}
                >
                  {meta.label} ({a.count})
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-[11px] font-bold text-muted mb-2">بحث برقم المستند</p>
          <div className="relative max-w-md">
            <input
              type="text"
              value={q}
              onInput={(e) => setQ(e.target.value.trim().toLowerCase())}
              autoComplete="off"
              placeholder="مثال: BFP-GRN-2026-0042"
              className="w-full bg-surface-2 border border-line rounded-xl text-ink text-sm px-4 py-2.5 focus:outline-none focus:border-accent/60"
            />
          </div>
        </div>
      </section>

      {/* الخطّ الزمنيّ */}
      <section className="mb-10">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="text-xl font-bold text-ink">الخطّ الزمنيّ للحركة</h2>
          <span className="text-[11px] text-muted">{filtered.length} قيدًا</span>
        </div>

        {dataLoading ? (
          <div className="rounded-2xl bg-chip border border-line p-10 text-center text-sm text-muted">
            جارٍ تحميل الحركة الحيّة…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-chip border border-line p-8 text-center text-sm text-muted">
            {entries.length === 0
              ? 'لا حركة مسجّلة بعد — سيمتلئ السجلّ تلقائيًّا مع كل إنشاءٍ أو اعتمادٍ أو حركة مخزون في البوابة.'
              : 'لا توجد قيود مطابقة للمصفّيات المختارة.'}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((e) => {
              const rv = roleView(e.roleId);
              const act = ACTION_META[e.action] || { label: e.action, color: '#6b7280' };
              return (
                <div
                  key={e.id}
                  className="rounded-2xl bg-chip border border-line p-4 sm:p-5"
                  style={{ borderRight: `3px solid ${rv.color}` }}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold"
                        style={chipStyle(rv.color, false)}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ background: 'currentColor' }} aria-hidden="true"></span>
                        {rv.label}
                      </span>
                      <span
                        className="inline-flex items-center px-2.5 py-1 rounded-lg border text-[10px] font-bold"
                        style={chipStyle(act.color, false)}
                      >
                        {act.label}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted shrink-0">{fmtWhen(e.atMs)}</span>
                  </div>

                  <p className="mt-2.5 text-sm font-bold text-ink">
                    {docLabel(e.docType)}{' '}
                    <span className="text-ink-2 font-mono font-normal">· {e.docNumber || '—'}</span>
                  </p>
                  {e.note ? <p className="text-xs text-ink-2 leading-relaxed mt-1.5">{e.note}</p> : null}
                  <p className="text-[11px] text-muted mt-2">
                    الفاعل: <span className="text-ink-2 font-medium">{e.actorName || '—'}</span>
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
