/**
 * شاشةُ إدارة المحلّات (المرحلة ص) — إنشاءٌ وسردٌ وتفعيل، بثلاث طبقات:
 *   تدخّل الآن:   المحلُّ الفعّال (المبدّل) وعددُ المحلّات.
 *   إجراء سريع:   إضافةُ محلٍّ جديدٍ برمزٍ فريدٍ واسمٍ عربيّ.
 *   فهرس كامل:    كلُّ المحلّات بحالتها، مع تفعيلٍ/تعطيل.
 *
 * كلُّ محلٍّ شركةٌ مستقلّةٌ معزولةٌ تمامًا. غلافُ عرضٍ رقيقٌ فوق `shopsService`
 * المُختبَر؛ لا منطقَ محاسبيًّا هنا. أرقامٌ لاتينيّة، بلا إيموجي، الأحمرُ للتحذير.
 */
import { useCallback, useEffect, useState } from 'react';
import * as door from '../../../services/_db/index.js';
import { createShops } from '../../../services/shops/shopsService.js';
import ShopSwitcher from './ShopSwitcher.jsx';

export default function ShopsAdmin({ db = door }) {
  const svc = () => createShops(db);
  const [shops, setShops] = useState([]);
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [msg, setMsg] = useState(null); // { tone: 'ok' | 'warn', text }
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setShops(await svc().list());
    } catch (e) {
      setMsg({ tone: 'warn', text: 'تعذّرت قراءةُ المحلّات: ' + (e?.message || '') });
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await svc().create({ code, nameAr });
    setBusy(false);
    if (!r.ok) {
      const text =
        r.reason === 'bad-code'
          ? 'أدخِل رمزًا للمحلّ'
          : r.reason === 'bad-name'
            ? 'أدخِل اسمًا عربيًّا للمحلّ'
            : 'تعذّر الإنشاء: ' + (r.message || r.reason);
      setMsg({ tone: 'warn', text });
      return;
    }
    setMsg(
      r.skipped
        ? { tone: 'warn', text: `الرمزُ ${r.id} موجودٌ — لم يُنشأ مجدّدًا` }
        : { tone: 'ok', text: `أُضيف المحلُّ ${r.id}` },
    );
    setCode('');
    setNameAr('');
    refresh();
  };

  const toggle = async (shop) => {
    await svc().setActive(shop.code, !shop.active);
    refresh();
  };

  return (
    <div className="o_theme" dir="rtl">
      {/* طبقة ١ — تدخّل الآن: المحلُّ الفعّال */}
      <div className="bg-white border border-ink/10 rounded-xl p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <ShopSwitcher db={db} />
        <span className="text-sm text-ink-2">
          عددُ المحلّات: <b className="text-ink tabular-nums">{ready ? shops.length : '…'}</b>
        </span>
      </div>

      {/* طبقة ٢ — إجراء سريع: إضافةُ محلّ */}
      <form onSubmit={add} className="bg-white border border-ink/10 rounded-xl p-4 mb-4">
        <h2 className="text-base font-bold text-ink mb-3">إضافةُ محلٍّ جديد</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-2">الرمز (فريد)</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="RH"
              className="border border-ink/15 rounded-lg px-3 py-2 text-sm text-ink w-32"
            />
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[12rem]">
            <span className="text-xs text-ink-2">الاسم بالعربيّة</span>
            <input
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              placeholder="محلّ الرحبة"
              className="border border-ink/15 rounded-lg px-3 py-2 text-sm text-ink w-full"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="bg-brand-navy text-white rounded-lg px-4 py-2 text-sm font-bold transition-opacity disabled:opacity-50"
          >
            {busy ? 'جارٍ…' : 'أضِف المحلّ'}
          </button>
        </div>
        {msg && (
          <div
            className={`mt-3 text-sm rounded-lg p-2 ${
              msg.tone === 'ok'
                ? 'text-ink bg-success/5 border border-success/30'
                : 'text-danger bg-danger/5 border border-danger/40'
            }`}
          >
            {msg.text}
          </div>
        )}
      </form>

      {/* طبقة ٣ — فهرس كامل: كلُّ المحلّات */}
      <div className="bg-white border border-ink/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-brand-navy/5 text-ink-2">
            <tr>
              <th className="p-3 text-right font-semibold">الرمز</th>
              <th className="p-3 text-right font-semibold">الاسم</th>
              <th className="p-3 text-center font-semibold">الحالة</th>
              <th className="p-3 text-center font-semibold">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {!ready && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-ink-2">جارٍ القراءة…</td>
              </tr>
            )}
            {ready && shops.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-ink-2">
                  لا محلّاتٍ بعد — أضِف أوّلَ محلٍّ أعلاه.
                </td>
              </tr>
            )}
            {shops.map((s) => (
              <tr key={s.code} className="border-t border-ink/5">
                <td className="p-3 font-medium text-ink tabular-nums">{s.code}</td>
                <td className="p-3 text-ink">{s.nameAr}</td>
                <td className="p-3 text-center">
                  <span className={s.active ? 'text-ink' : 'text-ink-2'}>
                    {s.active ? 'فعّال' : 'معطَّل'}
                  </span>
                </td>
                <td className="p-3 text-center">
                  <button
                    type="button"
                    onClick={() => toggle(s)}
                    className="text-sm text-brand-navy hover:underline"
                  >
                    {s.active ? 'تعطيل' : 'تفعيل'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
