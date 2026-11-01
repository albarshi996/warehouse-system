/**
 * مبدّلُ المحلّ الفعّال — يُضمَّن في ترويسة كلّ شاشةٍ منطوقةٍ بالمحل.
 *
 * المرحلة ص: مستخدمٌ واحدٌ يرى كلَّ المحلّات، ويختار من هنا «المحلَّ الفعّال»
 * الذي تُوسَم به العمليّاتُ وتُرشَّح عليه التقاريرُ والأرصدةُ والخزينة. «كلُّ
 * المحلّات» (null) نظرةٌ شاملة. الحالةُ في `shopStore` فتبقى عبر تنقّل الصفحات
 * وتتزامن بين الجزر. مكوّنٌ رقيقٌ فوق خدمةٍ ومخزنٍ مُختبَرَين.
 */
import { useEffect, useState } from 'react';
import * as door from '../../../services/_db/index.js';
import { createShops } from '../../../services/shops/shopsService.js';
import { getActiveShop, setActiveShop, subscribeActiveShop } from '../../../services/shops/shopStore.js';

export default function ShopSwitcher({ db = door, onChange }) {
  const [shops, setShops] = useState([]);
  const [active, setActive] = useState(getActiveShop());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await createShops(db).listActive();
        if (alive) setShops(list);
      } catch {
        /* يبقى فارغًا — المبدّل يعرض «كلّ المحلّات» وحدها */
      } finally {
        if (alive) setReady(true);
      }
    })();
    // مزامنةٌ مع أيّ مبدّلٍ آخرَ في الصفحة (بثُّ shopStore).
    const off = subscribeActiveShop((s) => {
      if (alive) setActive(s);
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  const pick = (e) => {
    const next = setActiveShop(e.target.value || null);
    setActive(next);
    if (typeof onChange === 'function') onChange(next);
  };

  return (
    <div dir="rtl" className="flex items-center gap-2">
      <label htmlFor="bz-shop-switcher" className="text-sm font-medium text-ink-2 whitespace-nowrap">
        المحلّ الفعّال:
      </label>
      <select
        id="bz-shop-switcher"
        value={active || ''}
        onChange={pick}
        className="border border-ink/15 rounded-lg px-3 py-1.5 text-sm text-ink bg-white focus:outline-none focus:border-brand-navy/40"
      >
        <option value="">كلُّ المحلّات</option>
        {shops.map((s) => (
          <option key={s.code} value={s.code}>
            {s.nameAr} ({s.code})
          </option>
        ))}
      </select>
      {ready && shops.length === 0 && (
        <span className="text-xs text-ink-2">لا محلّاتٍ بعد</span>
      )}
    </div>
  );
}
