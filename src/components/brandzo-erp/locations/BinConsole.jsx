import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { useBarcodeCamera, ScanCameraButton, ScanCameraPanel } from '../scan/BarcodeCamera.jsx';
import { useWedgeScanner } from '../scan/useWedgeScanner.js';
import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import { subscribeWarehouses } from '../../../services/locations/warehouseService.js';
import { listenLocations } from '../../../services/locations/locationsService.js';
import { listenBalances } from '../../../services/balances/balancesService.js';
import { createDraft } from '../../../services/documents/documentsService.js';
import { listUnitsAt } from '../../../services/lpn/lpnService.js';
import { binHeadline, binPrefixOf, warehouseForBin } from '../../../services/locations/binAnatomy.js';
import { normalizeLocationCode } from '../../../services/locations/locationCode.js';
import {
  BIN_MODES,
  binContents,
  binProblem,
  buildDocDraft,
  draftLineFor,
  entryProblems,
  linesForScan,
  modeOf,
  orderRequirementOf,
  routeScan,
} from '../../../services/locations/binConsole.js';

/**
 * لوحة الخانة — «امسح الخانة فتُفتح كمستودعٍ داخليّ» (طلب المالك 2026-09-01).
 *
 * ═══ ما تحلّه ═══
 * كلّ شاشات المخزون تبدأ بمستند: افتح أمرًا ثمّ اذهب إلى الرفّ. والعاملُ في
 * الممرّ يبدأ بالرفّ — يقف أمام خانةٍ ويريد أن يعرف ما فيها. فلا شاشةَ تجيبه.
 *
 * ═══ القراءة ═══
 * محرّكُ المسح واحدٌ في `services/scan/` (درسُ «قارئ الباركود لا يقرأ»):
 * الكاميرا تعمل على كلّ جهازٍ ولا تُخفى بحكمٍ مسبق، وجهازُ الباركود مسموعٌ
 * في الشاشة كلّها لا في حقلٍ مركَّز. والتوجيهُ **بالتصنيف لا بترتيب الحقول**،
 * فيمسح العاملُ بأيّ ترتيبٍ ولا يقع كودُ خانةٍ في حقل صنف.
 *
 * ═══ ★★★ ولا رصيدَ يتحرّك من هنا ═══
 * كلّ الحكم في `binConsole.js` الخالص المُختبَر، وهذه الشاشة عرضٌ له. والأوضاعُ
 * الكاتبةُ تُنشئ **مسوّدةَ مستندٍ** تمرّ بمحرّك المستندات — نفسِ الطريق الذي
 * يمرّ به كلُّ شيء. فلا مسارَ رصيدٍ ثانٍ.
 */

const num = (n) => new Intl.NumberFormat('en-US').format(Number(n) || 0);
const IN = 'bg-surface border border-line rounded-lg text-ink text-sm px-2.5 py-2 focus:outline-none focus:border-accent/50';

function Notice({ children }) {
  return (
    <div dir="rtl" className="o_theme">
      <div className="o_ds o_ds_card o_ds_pad text-sm text-ink-2">{children}</div>
    </div>
  );
}

function Stat({ label, value, tone = '' }) {
  return (
    <div>
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`text-lg font-bold ${tone === 'muted' ? 'text-muted' : 'text-ink'}`}>{value}</div>
    </div>
  );
}

export default function BinConsole() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [warehouses, setWarehouses] = useState([]);
  const [locations, setLocations] = useState([]);
  const [balances, setBalances] = useState([]);
  const [units, setUnits] = useState([]);

  const [bin, setBin] = useState('');
  const [mode, setMode] = useState('lookup');
  const [scanned, setScanned] = useState('');
  const [qty, setQty] = useState('');
  const [destination, setDestination] = useState('');
  const [entries, setEntries] = useState([]);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState('');
  const [created, setCreated] = useState(null);

  const base = getBasePath();

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      if (!user) { setReady(true); return; }
      setMe(await fetchUserProfile(user).catch(() => null));
      setReady(true);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!me) return undefined;
    const a = subscribeWarehouses(setWarehouses);
    const b = listenLocations(setLocations);
    const c = listenBalances(setBalances);
    return () => { a?.(); b?.(); c?.(); };
  }, [me]);

  const whDoc = useMemo(() => warehouseForBin(bin, warehouses), [bin, warehouses]);
  const knownCodes = useMemo(() => (locations || []).map((l) => l.code), [locations]);
  const contents = useMemo(() => binContents(bin, { balances, units }), [bin, balances, units]);
  const problem = useMemo(() => (bin ? binProblem(bin, knownCodes) : ''), [bin, knownCodes]);
  const m = modeOf(mode);

  /**
   * طبالي الخانة تُجلب عند فتحها لا مع كلّ رصيد — استعلامٌ محدودٌ بالمستودع
   * والخانة (`listUnitsAt`)، فلا تُقرأ آلافُ الطبالي لعرض رفٍّ واحد.
   */
  useEffect(() => {
    const code = normalizeLocationCode(bin);
    if (!me || !code || !whDoc) { setUnits([]); return undefined; }
    let alive = true;
    // ⚠️ هويّتان مشروعتان للمستودع على الطبليّة: كودُ البوّابة (`WH001`) وبادئةُ
    // الملصقات (`RH`) — و`listUnitsAt` يطابق `warehouse` مطابقةً تامّة. فيُسأل
    // عنهما ويُدمج الناتج، وإلّا عُرضت خانةٌ «بلا طبالي» وفيها طبالي.
    const asked = [...new Set([whDoc.code, binPrefixOf(whDoc)].filter(Boolean))];
    Promise.all(asked.map((w) => listUnitsAt({ warehouse: w, bin: code }).catch(() => [])))
      .then((groups) => {
        if (!alive) return;
        const seen = new Set();
        setUnits(groups.flat().filter((u) => (seen.has(u.code) ? false : seen.add(u.code))));
      });
    return () => { alive = false; };
  }, [me, bin, whDoc]);

  /** الصفوفُ التي يطابقها ما مُسح — قد تكون دفعاتٍ شتّى لصنفٍ واحد. */
  const hits = useMemo(() => (scanned ? linesForScan(contents, scanned) : []), [contents, scanned]);
  const [pickedBatch, setPickedBatch] = useState(0);
  const item = hits[pickedBatch] || hits[0] || null;

  const openBin = useCallback((code) => {
    setBin(code);
    setScanned('');
    setQty('');
    setPickedBatch(0);
    setEntries([]);
    setCreated(null);
    setMsg({ type: '', text: '' });
  }, []);

  /** المسحةُ الواحدة — وجهتُها من التصنيف، والرفضُ يقول الصواب. */
  const onScanned = useCallback(
    (raw) => {
      const v = routeScan(raw, { hasBin: Boolean(bin) });
      if (v.action === 'bin') { openBin(v.code); return; }
      if (v.action === 'item') {
        setScanned(v.code);
        setPickedBatch(0);
        setMsg({ type: '', text: '' });
        return;
      }
      if (v.action === 'pallet') {
        setMsg({ type: 'info', text: `طبليّة «${v.code}» — تُعرض في محتوى الخانة أدناه.` });
        return;
      }
      setMsg({ type: 'error', text: v.message });
    },
    [bin, openBin]
  );

  const camera = useBarcodeCamera({ onCode: onScanned, closeOnCode: true });
  useWedgeScanner(onScanned, { enabled: ready && Boolean(me) });

  function addEntry() {
    const line = draftLineFor(mode, { bin, item: item || { sku: scanned }, qty, bookQty: item?.qty ?? 0 });
    const problems = entryProblems(mode, { line, contents, scanned });
    if (problems.length) { setMsg({ type: 'error', text: problems[0] }); return; }
    setEntries((prev) => [...prev, line]);
    setScanned('');
    setQty('');
    setPickedBatch(0);
    setMsg({ type: 'success', text: 'أُضيف البند.' });
  }

  async function saveDraft() {
    const draft = buildDocDraft(mode, {
      bin,
      // ★★★ كودُ المستودع في البوّابة لا بادئةُ الملصق (كُشف بالفحص الحيّ
      // 2026-09-02): `balances` معرّفُه `صنف__مستودع__دفعة`، والقيدُ يبنيه من
      // `header.warehouse`. فترويسةٌ تحمل «RH» بدل «WH001» تُنشئ رصيدًا
      // موازيًا لنفس البضاعة — عجزٌ في مكانٍ وفائضٌ في آخر بلا صوت.
      warehouse: whDoc?.code || '',
      lines: entries,
      destination,
    });
    if (!draft) { setMsg({ type: 'error', text: orderRequirementOf(mode) || 'لا بنودَ لحفظها.' }); return; }
    setBusy('يحفظ…');
    setMsg({ type: '', text: '' });
    try {
      const id = await createDraft({ type: draft.type, profile: me, header: draft.header, lines: draft.lines });
      setCreated({ id, type: draft.type, lines: draft.lines.length });
      setEntries([]);
    } catch (err) {
      setMsg({ type: 'error', text: err?.message || 'تعذّر الحفظ.' });
    } finally {
      setBusy('');
    }
  }

  if (!ready) return <Notice>يقرأ…</Notice>;
  if (!me) return <Notice>افتح الصفحة بعد تسجيل الدخول.</Notice>;

  return (
    <div dir="rtl" className="o_theme space-y-5">
      {/* ═══ الطبقة ١ — امسح الخانة ═══ */}
      <section className="o_ds o_ds_card o_ds_pad space-y-3">
        <div className="flex items-center gap-2">
          <Icon name="mapPin" size={18} className="text-accent" />
          <h2 className="font-bold text-ink text-sm">امسح ملصق الخانة</h2>
          <span className="text-[11px] text-muted">الكاميرا أو جهاز الباركود — والجهازُ مسموعٌ في الشاشة كلّها</span>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            value={bin}
            onChange={(e) => openBin(e.target.value.toUpperCase())}
            placeholder="RH-A-R-01-01"
            autoComplete="off"
            style={{ direction: 'ltr', textAlign: 'right' }}
            className={`${IN} flex-1 min-w-[200px] font-mono`}
          />
          <ScanCameraButton camera={camera} label="امسح" />
          {bin && (
            <button type="button" onClick={() => openBin('')} className="btn-secondary text-xs">
              أغلق الخانة
            </button>
          )}
        </div>
        <ScanCameraPanel camera={camera} hint="وجّه العدسة إلى ملصق الخانة — تُفتح الخانة بما فيها." />
        {problem && <div className="text-xs text-brand-red">{problem}</div>}
        {/*
          ★★★ الرسالةُ هنا لا في قسمٍ مشروطٍ بخانةٍ مفتوحة (كُشف بالفحص الحيّ
          2026-09-02): أشيعُ ردٍّ يقع **قبل** فتح أيّ خانة — من يمسح صنفًا أوّلًا.
          وكانت الرسالة تُبنى ولا تُعرض، فيقف العاملُ أمام شاشةٍ لا تردّ عليه.
        */}
        {msg.text && (
          <div className={`text-xs ${msg.type === 'error' ? 'text-brand-red' : 'text-ink-2'}`}>{msg.text}</div>
        )}
      </section>

      {/* ═══ الطبقة ٢ — الخانة مفتوحةً: هويّتُها ومحتواها ═══ */}
      {bin && !problem && (
        <>
          <section className="o_ds o_ds_card o_ds_pad space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono font-bold text-ink text-base" style={{ direction: 'ltr' }}>{bin}</span>
              {/* ⚠️ وثيقةُ المستودع تكتب `name` (وهو الاسم العربيّ) — و`nameAr`
                  لا يكتبه أحد. فالترتيبُ هنا يقرأ الاثنين، وإلّا عُرض «WH001». */}
              {whDoc && <span className="text-sm text-ink-2">{whDoc.nameAr || whDoc.name || whDoc.code}</span>}
              {!whDoc && <span className="text-xs text-brand-red">بادئةٌ لا مستودعَ لها — ملصقُ فرعٍ آخر؟</span>}
            </div>
            {whDoc && <div className="text-xs text-ink-2">{binHeadline(bin, whDoc)}</div>}
            <div className="flex flex-wrap items-center gap-5 pt-1">
              <Stat label="أصناف" value={num(contents.skuCount)} />
              <Stat label="مجموع الكمّيّات" value={num(contents.totalQty)} />
              <Stat label="طبالي واقفة" value={num(contents.pallets.length)} tone={contents.pallets.length ? '' : 'muted'} />
            </div>
          </section>

          <section className="o_ds o_ds_card">
            <div className="px-4 py-3 border-b border-line flex items-center gap-2">
              <Icon name="package" size={16} className="text-accent" />
              <h3 className="font-bold text-ink text-sm">ما في الخانة الآن</h3>
            </div>
            {contents.lines.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted">الخانة فارغة — لا رصيدَ مسجَّلٌ عليها.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="o_list w-full text-sm">
                  <thead>
                    <tr>
                      <th>الصنف</th><th>الاسم</th><th>الدفعة</th><th>الصلاحية</th><th>الكمّيّة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contents.lines.map((l, i) => (
                      <tr key={`${l.sku}-${l.batch}-${i}`}>
                        <td className="font-mono" style={{ direction: 'ltr' }}>{l.sku}</td>
                        <td>{l.nameAr || '—'}</td>
                        <td className="font-mono" style={{ direction: 'ltr' }}>{l.batch || '—'}</td>
                        <td className="font-mono" style={{ direction: 'ltr' }}>{l.expiry || '—'}</td>
                        <td className="font-bold">{num(l.qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {contents.pallets.length > 0 && (
              <div className="px-4 py-3 border-t border-line flex flex-wrap gap-2 items-center">
                <span className="text-[11px] text-muted">الطبالي:</span>
                {contents.pallets.map((p) => (
                  <span key={p.code} className="font-mono text-[11px] text-ink-2" style={{ direction: 'ltr' }}>{p.code}</span>
                ))}
              </div>
            )}
          </section>

          {/* ═══ الطبقة ٣ — الوضع ثمّ مسح الصنف ═══ */}
          <section className="o_ds o_ds_card o_ds_pad space-y-3">
            <div className="flex flex-wrap gap-2">
              {BIN_MODES.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => { setMode(x.id); setMsg({ type: '', text: '' }); }}
                  className={mode === x.id ? 'btn-primary text-xs' : 'btn-secondary text-xs'}
                >
                  {x.labelAr}
                </button>
              ))}
            </div>

            {m.id === 'lookup' && (
              <p className="text-xs text-ink-2">
                وضعُ الاستعلام يقرأ ولا يكتب. امسح صنفًا لترى صفوفَه في هذه الخانة، أو بدّل الوضع للعمل.
              </p>
            )}
            {m.needsOrder && (
              <p className="text-xs text-brand-red">{orderRequirementOf(m.id)}</p>
            )}

            <div className="flex flex-wrap gap-2 items-center">
              <input
                value={scanned}
                onChange={(e) => { setScanned(e.target.value); setPickedBatch(0); }}
                placeholder="امسح باركود الصنف أو اكتب كوده"
                autoComplete="off"
                style={{ direction: 'ltr', textAlign: 'right' }}
                className={`${IN} flex-1 min-w-[200px] font-mono`}
              />
              {m.docType && !m.needsOrder && (
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder={m.id === 'count' ? 'المعدود' : 'الكمّيّة'}
                  className={`${IN} w-28`}
                />
              )}
              {m.docType && !m.needsOrder && (
                <button type="button" onClick={addEntry} className="btn-primary text-xs">أضف البند</button>
              )}
            </div>

            {scanned && hits.length === 0 && (
              <div className="text-xs text-ink-2">
                لا رصيدَ لهذا الصنف في هذه الخانة.
                {m.id === 'count' && ' وهذا معنى الجرد — اكتب المعدود ويُسجَّل الفائض.'}
              </div>
            )}

            {hits.length > 1 && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-[11px] text-muted">الدفعة:</span>
                {hits.map((h, i) => (
                  <button
                    key={`${h.batch}-${i}`}
                    type="button"
                    onClick={() => setPickedBatch(i)}
                    className={pickedBatch === i ? 'btn-primary text-[11px]' : 'btn-secondary text-[11px]'}
                  >
                    <span style={{ direction: 'ltr', display: 'inline-block' }}>{h.batch || 'بلا دفعة'}</span> · {num(h.qty)}
                  </button>
                ))}
              </div>
            )}

            {item && (
              <div className="text-xs text-ink-2">
                <strong className="text-ink">{item.nameAr || item.sku}</strong> — الدفتريُّ في هذه الخانة {num(item.qty)}
                {item.expiry ? ` · ينتهي ${item.expiry}` : ''}
              </div>
            )}

          </section>

          {/* ═══ الطبقة ٤ — المسوّدة قبل الحفظ ═══ */}
          {entries.length > 0 && (
            <section className="o_ds o_ds_card o_ds_pad space-y-3">
              <div className="flex items-center gap-2">
                <Icon name="clipboardList" size={16} className="text-accent" />
                <h3 className="font-bold text-ink text-sm">
                  {m.id === 'count' ? 'محضر جرد الخانة' : 'قائمة السحب'} — {num(entries.length)} بندًا
                </h3>
              </div>
              <ul className="text-xs text-ink-2 space-y-1 list-none p-0">
                {entries.map((e, i) => (
                  <li key={i}>
                    <span className="font-mono" style={{ direction: 'ltr', display: 'inline-block' }}>{e.sku}</span>
                    {' — '}
                    {m.id === 'count' ? `دفتريّ ${num(e.bookQty)} · معدود ${num(e.count1)}` : `كمّيّة ${num(e.qtyPicked)}`}
                    {e.batch ? ` · دفعة ${e.batch}` : ''}
                  </li>
                ))}
              </ul>
              {m.id === 'pick' && (
                <label className="block max-w-sm">
                  <span className="block text-[11px] font-bold text-ink-2 mb-1">الوجهة (إلزاميّة في قائمة السحب)</span>
                  <input
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="ساحة التجهيز"
                    className={`${IN} w-full`}
                  />
                </label>
              )}
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  type="button"
                  onClick={saveDraft}
                  disabled={Boolean(busy) || (m.id === 'pick' && !destination.trim())}
                  className="btn-primary text-xs"
                >
                  {busy || 'احفظ المسوّدة'}
                </button>
                <button type="button" onClick={() => setEntries([])} className="btn-secondary text-xs">
                  امسح البنود
                </button>
                <span className="text-[11px] text-muted">
                  تُحفظ مسوّدةً — والرصيدُ يتحرّك عند اعتمادها في محرّك المستندات.
                </span>
              </div>
            </section>
          )}

          {created && (
            <section className="o_ds o_ds_card o_ds_pad flex flex-wrap items-center gap-3">
              <Icon name="checkCircle" size={16} className="text-accent shrink-0" />
              <span className="flex-1 text-sm text-ink-2">
                أُنشئت مسوّدةٌ بـ{num(created.lines)} بندًا — تنتظر الاعتماد.
              </span>
              <a href={`${base}/dashboard/document?type=${created.type}&id=${created.id}`} className="btn-secondary text-xs">
                افتح المستند
              </a>
            </section>
          )}
        </>
      )}
    </div>
  );
}
