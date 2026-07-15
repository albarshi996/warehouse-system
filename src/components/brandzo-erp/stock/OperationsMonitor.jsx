import { useEffect, useMemo, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import {
  listenOperations,
  listenScans,
  closeOperation,
} from '../../../services/stock/operationsService.js';

const MANAGER_ROLES = ['admin', 'warehouse_manager'];

const OP_ICONS = {
  'جرد': '📋',
  'استلام': '📥',
  'صرف': '📤',
  'إضافة أصناف': '➕',
  'تالف': '⚠️',
  'مرتجع': '↩️',
};

/** يحوّل طابع Firestore الزمني إلى نص عربي مقروء. */
function fmtTime(ts) {
  const d = ts?.toDate?.();
  if (!d) return '—';
  return d.toLocaleString('ar-LY', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtRelative(ts) {
  const d = ts?.toDate?.();
  if (!d) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `قبل ${mins} د`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `قبل ${h} س`;
  return `قبل ${Math.floor(h / 24)} ي`;
}

/**
 * شاشة متابعة العمليات — للمدير العام ومدير المستودع.
 * تعرض العمليات لحظياً، ومن يعمل عليها، وسجلّ المسح الحيّ لكل عملية.
 */
export default function OperationsMonitor() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [ops, setOps] = useState([]);
  const [loadingOps, setLoadingOps] = useState(true);
  const [selected, setSelected] = useState(null);
  const [scans, setScans] = useState([]);
  const [loadingScans, setLoadingScans] = useState(false);
  const [filter, setFilter] = useState('all');
  const [msg, setMsg] = useState('');

  // من أنا؟ ثم استمع للعمليات إن كنت مديراً.
  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      const profile = user ? await fetchUserProfile(user) : null;
      setMe(profile);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!me || !MANAGER_ROLES.includes(me.role)) return;
    const unsub = listenOperations((rows) => {
      setOps(rows);
      setLoadingOps(false);
    });
    return () => unsub();
  }, [me]);

  // سجلّ المسح الحيّ للعملية المختارة.
  useEffect(() => {
    if (!selected) {
      setScans([]);
      return;
    }
    setLoadingScans(true);
    const unsub = listenScans(selected, (rows) => {
      setScans(rows);
      setLoadingScans(false);
    });
    return () => unsub();
  }, [selected]);

  const shown = useMemo(
    () => (filter === 'all' ? ops : ops.filter((o) => o.status === filter)),
    [ops, filter]
  );

  const openCount = useMemo(() => ops.filter((o) => o.status === 'open').length, [ops]);

  // تجميع سجلّ المسح: الإجماليات وتوزيع العمل على الموظّفين والأصناف.
  const agg = useMemo(() => {
    const byUser = new Map();
    const byItem = new Map();
    let totalQty = 0;
    for (const s of scans) {
      const q = Number(s.qty) || 0;
      totalQty += q;
      const u = s.byName || 'غير معروف';
      byUser.set(u, (byUser.get(u) || 0) + q);
      const key = s.barcode || '—';
      const prev = byItem.get(key) || { qty: 0, name: s.name, count: 0 };
      byItem.set(key, { qty: prev.qty + q, name: s.name || prev.name, count: prev.count + 1 });
    }
    return {
      totalQty,
      byUser: [...byUser.entries()].sort((a, b) => b[1] - a[1]),
      byItem: [...byItem.entries()].sort((a, b) => b[1].qty - a[1].qty),
    };
  }, [scans]);

  async function handleClose(opId) {
    if (!confirm('إقفال العملية؟ لن يُقبل أي مسح جديد عليها.')) return;
    try {
      await closeOperation(opId);
      flash('أُقفلت العملية.');
    } catch {
      flash('تعذّر الإقفال (تحقّق من صلاحيتك).');
    }
  }

  function flash(t) {
    setMsg(t);
    setTimeout(() => setMsg(''), 3500);
  }

  if (!ready) {
    return <div className="text-gray-300 text-sm py-10 text-center">جارٍ التحقّق...</div>;
  }

  if (!me || !MANAGER_ROLES.includes(me.role)) {
    return (
      <div className="bg-brand-red/10 border border-brand-red/40 text-red-200 rounded-xl p-6 text-center" dir="rtl">
        <p className="font-bold text-lg mb-1">🚫 غير مصرّح</p>
        <p className="text-sm">هذه الشاشة للمدير العام ومدير المستودع فقط.</p>
      </div>
    );
  }

  const sel = ops.find((o) => o.id === selected);

  return (
    <div dir="rtl" className="space-y-6">
      {msg && (
        <div className="bg-brand-gold/15 border border-brand-gold/40 text-brand-gold rounded-xl px-4 py-2 text-sm text-center">
          {msg}
        </div>
      )}

      {/* لقطة سريعة */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <p className="text-2xl font-bold text-white">{ops.length}</p>
          <p className="text-gray-400 text-xs mt-1">إجمالي العمليات</p>
        </div>
        <div className="bg-green-500/10 border border-green-500/25 rounded-2xl p-4">
          <p className="text-2xl font-bold text-green-300">{openCount}</p>
          <p className="text-gray-400 text-xs mt-1">مفتوحة الآن</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <p className="text-2xl font-bold text-white">{ops.length - openCount}</p>
          <p className="text-gray-400 text-xs mt-1">مُقفلة</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        {/* قائمة العمليات */}
        <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h2 className="text-white font-bold text-sm">📦 العمليات</h2>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-brand-navy border border-white/15 rounded-lg text-white text-xs px-2 py-1 focus:outline-none focus:border-brand-gold/60"
            >
              <option value="all">الكل</option>
              <option value="open">مفتوحة</option>
              <option value="closed">مُقفلة</option>
            </select>
          </div>

          {loadingOps ? (
            <p className="text-gray-400 text-sm text-center py-8">جارٍ التحميل...</p>
          ) : shown.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8 leading-relaxed">
              لا توجد عمليات بعد.
              <br />
              <span className="text-xs">تظهر هنا فور بدء أي موظّف عملية جرد أو استلام.</span>
            </p>
          ) : (
            <ul className="space-y-2 max-h-[520px] overflow-y-auto">
              {shown.map((o) => (
                <li key={o.id}>
                  <button
                    onClick={() => setSelected(o.id)}
                    className={`w-full text-right rounded-xl border p-3 transition ${
                      selected === o.id
                        ? 'bg-brand-red/20 border-brand-red/50'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white font-bold text-sm">
                        {OP_ICONS[o.type] || '📦'} {o.type}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          o.status === 'open'
                            ? 'bg-green-500/20 text-green-300'
                            : 'bg-gray-500/20 text-gray-400'
                        }`}
                      >
                        {o.status === 'open' ? '● مفتوحة' : '○ مُقفلة'}
                      </span>
                    </div>
                    <p className="text-gray-400 text-xs mt-1.5">
                      👤 {o.createdByName || 'غير معروف'}
                    </p>
                    <p className="text-gray-500 text-[10px] mt-0.5">
                      {fmtTime(o.createdAt)} · {fmtRelative(o.createdAt)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* تفاصيل العملية المختارة */}
        <div className="lg:col-span-3 bg-white/5 border border-white/10 rounded-2xl p-4">
          {!sel ? (
            <p className="text-gray-400 text-sm text-center py-16">
              اختر عملية من القائمة لعرض سجلّ المسح الحيّ.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-white font-bold">
                    {OP_ICONS[sel.type] || '📦'} {sel.type}
                    <span className="text-gray-500 text-xs font-mono mr-2" dir="ltr">
                      {sel.id.slice(0, 8)}
                    </span>
                  </h2>
                  <p className="text-gray-400 text-xs mt-1">
                    بدأها {sel.createdByName || 'غير معروف'} · {fmtTime(sel.createdAt)}
                  </p>
                </div>
                {sel.status === 'open' && (
                  <button
                    onClick={() => handleClose(sel.id)}
                    className="text-xs font-bold bg-brand-red/80 hover:bg-brand-red text-white rounded-lg px-3 py-1.5 transition"
                  >
                    🔒 إقفال العملية
                  </button>
                )}
              </div>

              {/* إجماليات */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white/5 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-white">{scans.length}</p>
                  <p className="text-gray-400 text-[10px]">عملية مسح</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-brand-gold">{agg.totalQty}</p>
                  <p className="text-gray-400 text-[10px]">إجمالي الكمية</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-white">{agg.byItem.length}</p>
                  <p className="text-gray-400 text-[10px]">صنف مختلف</p>
                </div>
              </div>

              {/* من يعمل عليها */}
              {agg.byUser.length > 0 && (
                <div>
                  <h3 className="text-gray-300 text-xs font-bold mb-2">👥 توزيع العمل</h3>
                  <div className="flex flex-wrap gap-2">
                    {agg.byUser.map(([name, qty]) => (
                      <span
                        key={name}
                        className="bg-white/5 border border-white/10 rounded-full px-3 py-1 text-xs text-gray-200"
                      >
                        {name} — <b className="text-brand-gold">{qty}</b>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* سجلّ المسح الحيّ */}
              <div>
                <h3 className="text-gray-300 text-xs font-bold mb-2">
                  🔴 سجلّ المسح الحيّ{' '}
                  <span className="text-gray-500 font-normal">(يتحدّث تلقائيًّا)</span>
                </h3>
                {loadingScans ? (
                  <p className="text-gray-400 text-sm text-center py-8">جارٍ التحميل...</p>
                ) : scans.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-8">لا مسح بعد على هذه العملية.</p>
                ) : (
                  <div className="overflow-x-auto max-h-[300px] overflow-y-auto rounded-xl border border-white/10">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-brand-navy">
                        <tr className="text-gray-400">
                          <th className="text-right font-semibold py-2 px-2">الصنف</th>
                          <th className="text-right font-semibold py-2 px-2">الكمية</th>
                          <th className="text-right font-semibold py-2 px-2">من</th>
                          <th className="text-right font-semibold py-2 px-2">متى</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...scans].reverse().map((s) => (
                          <tr key={s.id} className="border-t border-white/5">
                            <td className="py-2 px-2">
                              <p className="text-white font-medium">{s.name || s.barcode}</p>
                              <p className="text-gray-500 text-[10px] font-mono" dir="ltr">
                                {s.barcode}
                              </p>
                            </td>
                            <td className="py-2 px-2 text-brand-gold font-bold">{s.qty}</td>
                            <td className="py-2 px-2 text-gray-300">{s.byName || '—'}</td>
                            <td className="py-2 px-2 text-gray-500">{fmtRelative(s.at) || '…'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
