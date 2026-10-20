/**
 * ‹DS-READS› مراجعُ عمود «الوجهة المقترحة» — الخاناتُ والأرصدةُ والبطاقات.
 *
 * ★★★ لا قراءةَ عند فتح الشاشة: النطاقُ يُشتقّ من المعاينة، وبلا معاينةٍ (أو في
 * أمر التسليم) نطاقٌ فارغ فلا يُطلب شيء. وبعدها نطاقُ الورقة وحدَه، وما قُرئ يُحفظ
 * بعمر الشاشة عشرَ دقائق. والمنطقُ كلُّه في `services/locations/directedScope.js`
 * (خالصٌ مختبَر)؛ وهنا الوصلُ بـFirestore وReact وحدَه.
 *
 * ═══ مفتاحُ الإطفاء ═══
 * `localStorage['bz.directedStorage.fullReads'] = '1'` يُعيد المستمعين الثلاثة
 * الكاملين عند الفتح — السلوكَ القديمَ حرفًا — في ذلك المتصفّح وحدَه بلا نشر.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { listenLocations, fetchLocationsForWarehouses } from '../../../services/locations/locationsService.js';
import { listenBalances, fetchBalancesInBinsOf } from '../../../services/balances/balancesService.js';
import {
  subscribeItems,
  cachedItemsIfFresh,
  fetchItemsBySkus,
  fetchItemsByBarcodes,
} from '../../../services/items/itemService.js';
import {
  fullReadsForced,
  isEmptyScope,
  loadReference,
  newReferenceMemo,
  scopeKey,
  scopeOfPreview,
} from '../../../services/locations/directedScope.js';

/** يُمهَل التحريرُ اليدويّ (كتابةُ مستودعٍ حرفًا حرفًا) فلا تُطلق كلُّ ضغطةٍ قراءة. */
const SETTLE_MS = 350;

/** القارئُ الحيّ — كلُّ دالّةٍ استعلامٌ مقصور، والكتالوجُ من ذاكرته إن كان طازجًا. */
const READER = {
  locationsIn: fetchLocationsForWarehouses,
  balancesInBinsOf: fetchBalancesInBinsOf,
  itemsBySkus: fetchItemsBySkus,
  itemsByBarcodes: fetchItemsByBarcodes,
  cachedItems: () => cachedItemsIfFresh(),
};

function browserStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** أمُطفأٌ هذا التحسينُ في هذا المتصفّح؟ — يُقرأ مرّةً عند الفتح. */
export function useFullReadsForced() {
  return useMemo(() => fullReadsForced(browserStorage()), []);
}

/**
 * @returns {{locations:object[], balances:object[], items:object[], ready:boolean,
 *            pending:boolean, error:string, scoped:boolean}}
 */
export function useDirectedReference(preview, fullReads) {
  // ── السلوكُ القديمُ حرفًا — خلف مفتاح الإطفاء وحدَه ───────────────────
  const [full, setFull] = useState({ locations: [], balances: [], items: [] });
  useEffect(() => {
    if (!fullReads) return undefined;
    const offs = [
      listenLocations((locations) => setFull((p) => ({ ...p, locations })), () => setFull((p) => ({ ...p, locations: [] }))),
      listenBalances((balances) => setFull((p) => ({ ...p, balances })), () => setFull((p) => ({ ...p, balances: [] }))),
      subscribeItems((items) => setFull((p) => ({ ...p, items })), () => setFull((p) => ({ ...p, items: [] }))),
    ];
    return () => offs.forEach((off) => off());
  }, [fullReads]);

  // ── القراءةُ الكسولةُ المقصورة ─────────────────────────────────────
  const scope = useMemo(() => scopeOfPreview(preview), [preview]);
  const key = scopeKey(scope);
  const memo = useRef(newReferenceMemo());
  const [scoped, setScoped] = useState({ locations: [], balances: [], items: [], ready: false, pending: false, error: '' });

  useEffect(() => {
    if (fullReads || isEmptyScope(scope)) return undefined;
    let cancelled = false;
    setScoped((p) => ({ ...p, pending: true, error: '' }));
    const timer = setTimeout(() => {
      loadReference(scope, READER, memo.current)
        .then((out) => {
          if (!cancelled) setScoped({ ...out, ready: true, pending: false, error: '' });
        })
        .catch((err) => {
          if (!cancelled) setScoped((p) => ({ ...p, pending: false, error: err?.message || 'تعذّرت القراءة.' }));
        });
    }, SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // المفتاحُ يختصر النطاق (لا `scope`): تحريرُ كمّيّةٍ أو ملاحظةٍ يبني معاينةً
    // جديدةً بالنطاق نفسِه، فلا يُطلق قراءة.
  }, [fullReads, key]);

  if (fullReads) {
    return { ...full, ready: full.items.length > 0, pending: false, error: '', scoped: false };
  }
  return { ...scoped, scoped: true };
}
