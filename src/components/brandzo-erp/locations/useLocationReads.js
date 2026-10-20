/**
 * ‹LOC-READS› خطّافاتُ القراءة المقصورة لسيّد المواقع — الوصلُ بـFirestore وReact وحدَه.
 *
 * المنطقُ والأحكامُ في `services/locations/locationReads.js` (خالصٌ مختبَر)، والقرّاءُ
 * في `locationsService.js` و`balancesService.js`. وهنا لا شيءَ إلّا: متى يُقرأ، وماذا،
 * وأين يُحفظ ما قُرئ بعمر الشاشة.
 *
 * ═══ مفتاحُ الإطفاء ═══
 * `localStorage['bz.locations.fullReads'] = '1'` (أو أسماءُ شاشاتٍ مفصولةٌ بفواصل)
 * يُعيد في ذلك المتصفّح المستمعَ الكاملَ القديمَ حرفًا — والشاشةُ تسأل
 * `useFullLocationReads` مرّةً عند الفتح، وتسلك الطريقَ القديمَ كما كُتب.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  countLocations,
  countLocationsInPrefix,
  distinctPrefixes,
  distinctZones,
  fetchLocationWitness,
  fetchLocationsByCodes,
  hasPalletCapacity,
  listenBoundLocations,
  listenLocation,
  listenLocationsOfWarehouses,
  listenPickFaces,
} from '../../../services/locations/locationsService.js';
import { listenBalancesInBins, listenBalancesInBinsOf } from '../../../services/balances/balancesService.js';
import { codesToRead, fullLocationReads } from '../../../services/locations/locationReads.js';

/** يُمهَل ما يُكتب حرفًا حرفًا (كودُ رفٍّ · بادئةُ مستودع) فلا تُطلق كلُّ ضغطةٍ قراءة. */
export const SETTLE_MS = 350;

function browserStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** أمُطفأٌ هذا التحسينُ لهذه الشاشة في هذا المتصفّح؟ — يُقرأ مرّةً عند الفتح. */
export function useFullLocationReads(screen) {
  return useMemo(() => fullLocationReads(screen, browserStorage()), [screen]);
}

// ── الشاهد: قراءةٌ واحدةٌ بعمر الصفحة، تشترك فيها الشاشاتُ والخطّافات ─────────
let witnessPromise = null;

/** الشاهد — خانةٌ حقيقيّةٌ واحدة (`limit(1)`)، أو `null` إن كان السيّدُ فارغًا. */
export function loadLocationWitness() {
  if (!witnessPromise) {
    witnessPromise = fetchLocationWitness().catch((err) => {
      witnessPromise = null; // فشلٌ عابر لا يُحفظ جوابًا
      throw err;
    });
  }
  return witnessPromise;
}

// ── البادئاتُ القائمة وسقفُ الطبالي: سؤالان صغيران بعمر الصفحة ───────────────
const prefixesPromises = new Map();
let palletCapsPromise = null;

/**
 * البادئاتُ القائمة — منها يُختار المستودع. و`liveOnly` يُسقط مستودعًا خاناتُه كلُّها
 * مؤرشفة (جذورُ `scopeChoices`)، وبدونه كلُّ خانة (`warehouseCodesOf`).
 */
export function usePrefixChoices(enabled = true, { liveOnly = false } = {}) {
  const [state, setState] = useState({ prefixes: [], ready: false });
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    if (!prefixesPromises.has(liveOnly)) {
      prefixesPromises.set(
        liveOnly,
        distinctPrefixes({ liveOnly }).catch((err) => {
          prefixesPromises.delete(liveOnly);
          throw err;
        })
      );
    }
    prefixesPromises
      .get(liveOnly)
      .then((prefixes) => alive && setState({ prefixes, ready: true }))
      .catch(() => alive && setState({ prefixes: [], ready: true }));
    return () => {
      alive = false;
    };
  }, [enabled, liveOnly]);
  return state;
}

/** مناطقُ مستودعٍ حيّة — مرّةً لكلّ مستودعٍ بعمر الشاشة. */
export function useZoneChoices(prefix, { enabled = true } = {}) {
  const p = String(prefix ?? '').trim().toUpperCase();
  const memo = useRef(new Map());
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled || !p || memo.current.has(p)) return undefined;
    let alive = true;
    memo.current.set(p, null);
    distinctZones(p)
      .then((zones) => {
        memo.current.set(p, zones);
        if (alive) setVersion((v) => v + 1);
      })
      .catch(() => memo.current.delete(p));
    return () => {
      alive = false;
    };
  }, [enabled, p]);
  return enabled && p ? memo.current.get(p) || NO_ZONES : NO_ZONES;
}
const NO_ZONES = Object.freeze([]);

/** أفي السيّد رفٌّ أعلن سقفَ طبالٍ؟ — `null` قبل الجواب. */
export function usePalletCaps(enabled = true) {
  const [caps, setCaps] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    if (!palletCapsPromise) {
      palletCapsPromise = hasPalletCapacity().catch((err) => {
        palletCapsPromise = null;
        throw err;
      });
    }
    palletCapsPromise.then((v) => alive && setCaps(v)).catch(() => alive && setCaps(false));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return caps;
}

/** @returns {{witness:object|null, ready:boolean}} */
export function useLocationWitness(enabled = true) {
  const [state, setState] = useState({ witness: null, ready: false });
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    loadLocationWitness()
      .then((witness) => alive && setState({ witness, ready: true }))
      // تعذّرُ القراءة ⇒ لا شاهد ⇒ «السيّدُ فارغ» ⇒ لا حكم — وهو سلوكُ المستمع
      // القديم حين يفشل (قائمةٌ فارغة)، فلا يُخترع منعٌ من عجزٍ عن القراءة.
      .catch(() => alive && setState({ witness: null, ready: true }));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return state;
}

const keyOf = (list) => [...new Set((list || []).map((v) => String(v ?? '').trim().toUpperCase()).filter(Boolean))].sort().join('|');

/**
 * خاناتُ مستودعٍ أو أكثر حيّةً — ولا شيءَ قبل أن يُعرف المستودع.
 * @returns {{locations:object[], ready:boolean, error:string}}
 */
export function useWarehouseLocations(prefixes, { enabled = true } = {}) {
  const key = keyOf(prefixes);
  const [state, setState] = useState({ key: '', locations: [], ready: false, error: '' });
  useEffect(() => {
    if (!enabled || !key) {
      setState({ key: '', locations: [], ready: false, error: '' });
      return undefined;
    }
    setState((p) => (p.key === key ? p : { key, locations: [], ready: false, error: '' }));
    return listenLocationsOfWarehouses(
      key.split('|'),
      (locations) => setState({ key, locations, ready: true, error: '' }),
      (err) => setState({ key, locations: [], ready: true, error: err?.message || 'تعذّرت قراءة المواقع.' })
    );
  }, [enabled, key]);
  return state.key === key ? state : { key, locations: [], ready: false, error: '' };
}

/** أرصدةُ خانات مستودعٍ أو أكثر حيّةً. */
export function useWarehouseBalances(prefixes, { enabled = true } = {}) {
  const key = keyOf(prefixes);
  const [state, setState] = useState({ key: '', balances: [], ready: false, error: '' });
  useEffect(() => {
    if (!enabled || !key) {
      setState({ key: '', balances: [], ready: false, error: '' });
      return undefined;
    }
    setState((p) => (p.key === key ? p : { key, balances: [], ready: false, error: '' }));
    return listenBalancesInBinsOf(
      key.split('|'),
      (balances) => setState({ key, balances, ready: true, error: '' }),
      (err) => setState({ key, balances: [], ready: true, error: err?.message || 'تعذّرت قراءة الأرصدة.' })
    );
  }, [enabled, key]);
  return state.key === key ? state : { key, balances: [], ready: false, error: '' };
}

/** أرصدةُ خاناتٍ بعينها حيّةً (خانةُ اللوحة المفتوحة، الرفُّ الممسوح). */
export function useBinBalances(codes, { enabled = true } = {}) {
  const list = codesToRead(codes);
  const key = list.join('|');
  const [state, setState] = useState({ key: '', balances: [], ready: false });
  useEffect(() => {
    if (!enabled || !key) {
      setState({ key: '', balances: [], ready: false });
      return undefined;
    }
    return listenBalancesInBins(
      key.split('|'),
      (balances) => setState({ key, balances, ready: true }),
      () => setState({ key, balances: [], ready: true })
    );
  }, [enabled, key]);
  return state.key === key ? state : { key, balances: [], ready: false };
}

/** أوجهُ التجهيز حيّةً — قلّةٌ من آلاف الخانات، وهي كلُّ ما يقرؤه طابورُ التزويد. */
export function usePickFaces(enabled = true) {
  const [state, setState] = useState({ locations: [], ready: false });
  useEffect(() => {
    if (!enabled) return undefined;
    return listenPickFaces(
      (locations) => setState({ locations, ready: true }),
      () => setState({ locations: [], ready: true })
    );
  }, [enabled]);
  return state;
}

let countPromise = null;
/** عددُ خانات السيّد كلّه من الخادم — مرّةً بعمر الصفحة؛ `null` قبل الجواب. */
export function useLocationCount(enabled = true) {
  const [n, setN] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    if (!countPromise) {
      countPromise = countLocations().catch((err) => {
        countPromise = null;
        throw err;
      });
    }
    countPromise.then((v) => alive && setN(v)).catch(() => alive && setN(null));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return n;
}

/** الخاناتُ المربوطةُ بملصقاتٍ حيّةً — لتصادم الملصقات وتقدّم التكويد. */
export function useBoundLocations(enabled = true) {
  const [state, setState] = useState({ locations: [], ready: false });
  useEffect(() => {
    if (!enabled) return undefined;
    return listenBoundLocations(
      (locations) => setState({ locations, ready: true }),
      () => setState({ locations: [], ready: true })
    );
  }, [enabled]);
  return state;
}

/** عددُ خانات بادئةٍ من الخادم — مرّةً لكلّ بادئةٍ بعمر الشاشة؛ `null` قبل الجواب. */
export function usePrefixCount(prefix, { enabled = true } = {}) {
  const p = String(prefix ?? '').trim().toUpperCase();
  const memo = useRef(new Map());
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled || !p || memo.current.has(p)) return undefined;
    let alive = true;
    memo.current.set(p, null);
    countLocationsInPrefix(p)
      .then((n) => {
        memo.current.set(p, n);
        if (alive) setVersion((v) => v + 1);
      })
      .catch(() => memo.current.delete(p));
    return () => {
      alive = false;
    };
  }, [enabled, p]);
  return enabled && p ? memo.current.get(p) ?? null : null;
}

/** خانةٌ واحدةٌ حيّةً — `undefined` قبل الجواب، `null` إن لم توجد. */
export function useLocation(code, { enabled = true } = {}) {
  const id = codesToRead([code])[0] || '';
  const [state, setState] = useState({ id: '', location: undefined });
  useEffect(() => {
    if (!enabled || !id) {
      setState({ id: '', location: undefined });
      return undefined;
    }
    return listenLocation(
      id,
      (location) => setState({ id, location }),
      () => setState({ id, location: null })
    );
  }, [enabled, id]);
  // ★ بلا كودٍ لا خانة (`null`) — لا «لم تصل بعد» (`undefined`). فخانةُ اللوحة المحدَّدةُ
  //   والمعروضُ فارغ تُحكم كما تُحكم بالقائمة الكاملة، ولا يبقى الحكمُ معلَّقًا على كودٍ غائب.
  if (!id) return null;
  return state.id === id ? state.location : undefined;
}

/**
 * أكوادٌ مكتوبةٌ تُقرأ بأعيانها — مرّةً لكلّ كودٍ بعمر الشاشة.
 *
 * ★ ما قُرئ لا يُعاد: من يكتب في بندٍ رابعٍ لا يُعيد قراءةَ الثلاثة قبله. وما لم
 *   يُقرأ بعدُ يبقى خارج `resolved` — فيعامله المستهلكُ معاملةَ «لم تصل القائمةُ
 *   بعد» لا «غير موجود».
 *
 * @returns {{resolved:Map<string, object|null>, pending:boolean}}
 */
export function useResolvedLocations(codes, { enabled = true, settleMs = SETTLE_MS } = {}) {
  const memo = useRef(new Map());
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const want = codesToRead(codes);
  const missing = enabled ? want.filter((c) => !memo.current.has(c)) : [];
  const missingKey = missing.join('|');

  useEffect(() => {
    if (!missingKey) return undefined;
    let alive = true;
    const timer = setTimeout(() => {
      const ask = missingKey.split('|');
      fetchLocationsByCodes(ask)
        .then((found) => {
          if (!alive) return;
          // المعرّفُ هو الكودُ المطلوب نفسُه — فالمطابقةُ به لا بحقلٍ قد يُكتب بصيغةٍ أخرى.
          const byId = new Map(found.map((l) => [l.id, l]));
          for (const c of ask) memo.current.set(c, byId.get(c) || null);
          setError('');
          setVersion((v) => v + 1);
        })
        .catch((err) => {
          // تبقى «غيرَ مقروءة» — فلا حكمَ عليها، كما لو لم تصل القائمة — ويُعلَن السبب.
          if (alive) setError(err?.message || 'تعذّرت قراءة المواقع.');
        });
    }, settleMs);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [missingKey, settleMs]);

  // `version` هو ما يتغيّر حين تُملأ الذاكرة — والذاكرةُ نفسُها مرجعٌ ثابت.
  const resolved = useMemo(() => new Map(memo.current), [version]);
  return { resolved, pending: Boolean(missingKey), error };
}

/**
 * عددُ الخانات «المعرَّفة» كما تعدّها شاشةُ الإسناد (`active !== false`) — من الخادم:
 * الكلُّ ناقصَ الموسوم `active:false`. `null` قبل الجواب.
 */
export function useActiveLocationCount(enabled = true) {
  const [n, setN] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    Promise.all([countLocations(), countLocations({ inactiveOnly: true })])
      .then(([all, inactive]) => alive && setN(Math.max(0, all - inactive)))
      .catch(() => alive && setN(null));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return n;
}

/** شاهدٌ «معرَّف» (`active !== false`) — لحكمٍ لا يعدّ الموقوفَ موقعًا. */
export function useActiveWitness(enabled = true) {
  const [state, setState] = useState({ witness: null, ready: false });
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    fetchLocationWitness((l) => l?.active !== false)
      .then((witness) => alive && setState({ witness, ready: true }))
      .catch(() => alive && setState({ witness: null, ready: true }));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return state;
}
