/**
 * بطاقاتُ حركة مخزن فينسيا ‹VEN-201› — صرفٌ وإدخالٌ بمسودّةٍ ثمّ تثبيت.
 *
 * ═══ ثلاثُ طبقاتٍ كنمط لوحات البوّابة ═══
 *   ① تدخّلٌ الآن — المسودّاتُ المعلَّقة: بطاقةٌ حُضِّرت ولم تُثبَّت لا
 *      تُحرّك شيئًا، والبضاعةُ قد تكون خرجت فعلًا والرصيدُ لا يعلم.
 *   ② لقطةٌ وإجراءات — صرفٌ وإدخالٌ وصافٍ، وزرّا إنشاء.
 *   ③ الفهرسُ الكامل — بحثٌ ومُرشّحاتٌ وجدولُ نظام أودو.
 *
 * ═══ ★★★ ولا رقمَ يُحسب هنا ═══
 * `cardsSnapshot` و`cardVerdict` و`cardTotals` و`cardEffectText` في
 * `veneciaCards` المختبَر (٢٩ اختبارًا)، والتثبيتُ الذرّيُّ في
 * `veneciaCardsService`. والشاشةُ تعرض وتستدعي.
 *
 * ═══ ★★ والشاشةُ تحكم قبل أن تُرسل، والخادمُ يحكم بعدها ═══
 * حكمُ الشاشة راحةٌ للموظّف لا ضمان: بين فتحها وضغط الزرّ قد تصرف بطاقةٌ
 * أخرى آخرَ ثلاجة. ولذلك تُعرض رسالةُ المعاملة كما جاءت — «تغيّر الرصيدُ
 * قبل التثبيت» — ولا تُبتلع.
 */
import { useEffect, useMemo, useState } from 'react';

import Icon from '../../ui/Icon.jsx';
import ListView from '../../odoo/ListView.jsx';
import Badge from '../../odoo/Badge.jsx';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { MANAGER_ROLES } from '../../../services/auth/roles.js';
import { ASSET_CONDITIONS } from '../../../services/assets/assetsModel.js';
import {
  POPULATIONS,
  assetCategory,
  populationLabel,
  rawQty,
} from '../../../services/assets/veneciaModel.js';
import {
  CARD_KINDS,
  cardEffectText,
  cardKind,
  cardKindLabel,
  cardStateLabel,
  cardTotals,
  cardVerdict,
  cardsSnapshot,
  filterCards,
  lineAssetKey,
} from '../../../services/assets/veneciaCards.js';
import { listenVeneciaAssets, todayLocal } from '../../../services/assets/veneciaService.js';
import {
  cancelCard,
  listenVeneciaCards,
  issueNow,
  postCard,
  reverseCard,
  saveCardDraft,
} from '../../../services/assets/veneciaCardsService.js';

const num = (n) => new Intl.NumberFormat('en-US').format(Number(n) || 0);

const STATE_VARIANT = { draft: 'draft', posted: 'done', cancelled: 'danger' };

const inputCls =
  'w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-accent';

function Kpi({ label, value, hint, tone }) {
  return (
    <div className="p-3">
      <div className={`text-xl font-black leading-tight ${tone === 'red' ? 'text-brand-red' : 'text-ink'}`}>
        {value}
      </div>
      <div className="text-[11px] font-bold text-ink-2 mt-0.5">{label}</div>
      <div className="text-[10px] text-muted">{hint}</div>
    </div>
  );
}

function Field({ label, children, hint, required }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold text-ink-2 mb-1">
        {label}
        {required && <span className="text-brand-red"> *</span>}
      </span>
      {children}
      {hint && <span className="block text-[10px] text-muted mt-1">{hint}</span>}
    </label>
  );
}

const emptyLine = () => ({
  population: 'issue',
  assetNo: '',
  assetName: '',
  category: '',
  brand: '',
  condition: 'جيد',
  qty: '',
  createNew: false,
});

const emptyCard = (kind) => ({
  kind,
  cardDate: todayLocal(),
  party: '',
  destination: '',
  purpose: '',
  lines: [emptyLine()],
});

export default function VeneciaCards() {
  const [profile, setProfile] = useState(null);
  const [assets, setAssets] = useState([]);
  const [cards, setCards] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState({ tone: '', text: '' });
  const [busy, setBusy] = useState('');

  const [q, setQ] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');

  const [form, setForm] = useState(null); // { ...card, docId? }
  const [openId, setOpenId] = useState('');
  const [reasonDraft, setReasonDraft] = useState('');

  useEffect(
    () =>
      subscribeAuth(async (user) => {
        if (!user) return setProfile(null);
        setProfile(await fetchUserProfile(user).catch(() => null));
      }),
    []
  );

  useEffect(() => listenVeneciaAssets(setAssets, () => setAssets([])), []);
  useEffect(
    () =>
      listenVeneciaCards(
        (list) => {
          setCards(list);
          setLoaded(true);
          setError('');
        },
        (e) => {
          setLoaded(true);
          setError(
            e?.code === 'permission-denied'
              ? 'بطاقاتُ فينسيا للمديرَين — وهذا حدٌّ في قاعدة البيانات لا في الشاشة.'
              : e?.message || 'تعذّرت قراءة البطاقات.'
          );
        }
      ),
    []
  );

  // ★★★ ‹NUM-601› حالةُ الاتّصال تُعرض **قبل** الضغط لا بعده: التثبيتُ وحدَه
  // يحتاج الشبكةَ (الرقمُ الرسميُّ لا يُحجز محلّيًّا)، وبقيّةُ الشاشة تعمل.
  // فمن يرى الشريطَ يعرف لماذا زرُّ التثبيت محجوب، ولا يظنّ النظامَ معطوبًا.
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' || navigator.onLine !== false
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  // ★★ وتلميحُ البطء للحالة الثانية: **متّصلٌ في ظاهره ولا يبلغ الخادمَ**.
  // `navigator.onLine` لا تكشفها (راوترٌ بلا إنترنت يقول «متّصل»)، والمعاملةُ
  // تتعلّق كما لو كان مقطوعًا. فلا تُجهَض — إجهاضُ معاملةٍ قد تكون كُتبت على
  // الخادم يحرق رقمًا — ولكنْ يُقال للموظّف إنّ الانتظارَ غيرُ طبيعيّ.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!busy) { setSlow(false); return undefined; }
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, [busy]);

  // ‹VEN-202› نموذجُ الصرف السريع — ثلاثةُ حقولٍ لا بطاقةٌ كاملة.
  const [quick, setQuick] = useState({ party: '', assetNo: '', qty: '', destination: '' });

  const canWrite = MANAGER_ROLES.includes(profile?.role);
  const index = useMemo(() => new Map(assets.map((a) => [a.docId, a])), [assets]);
  // ★★★ الاختيارُ بـ`docId` لا بـ`id`: رقمُ الأصل وحدَه **ليس هويّةً** في
  // فينسيا — ثلاثون رقمًا متصادمًا بين «بضاعة الصرف» و«أصول المدعوم»
  // (BRZ-0001 خشبُ باركي هنا وثلاجةُ تجميد هناك). فاختيارٌ بالرقم يصرف من
  // المجموعة الخطأ ولا يشتكي أحد.
  const quickAsset = useMemo(
    () => (quick.assetNo ? assets.find((a) => a.docId === quick.assetNo) || null : null),
    [assets, quick.assetNo]
  );
  const quickReady = useMemo(
    () =>
      !!quickAsset &&
      !!quick.party.trim() &&
      Number.parseInt(quick.qty, 10) > 0,
    [quickAsset, quick.party, quick.qty]
  );

  const snap = useMemo(() => cardsSnapshot(cards), [cards]);
  const drafts = useMemo(() => cards.filter((c) => c.state === 'draft'), [cards]);
  const rows = useMemo(
    () => filterCards(cards, { q, kind: kindFilter, state: stateFilter }),
    [cards, q, kindFilter, stateFilter]
  );
  const sorted = useMemo(
    () => [...rows].sort((x, y) => String(y.cardDate || '').localeCompare(String(x.cardDate || ''))),
    [rows]
  );
  const open = useMemo(() => cards.find((c) => c.docId === openId) || null, [cards, openId]);

  /** حكمُ الشاشة على النموذج المفتوح — يُعرض حيًّا قبل الحفظ. */
  const formVerdict = useMemo(
    () => (form ? cardVerdict(form, index) : { ok: true, problems: [] }),
    [form, index]
  );

  async function run(label, fn, done) {
    setBusy(label);
    setMsg({ tone: '', text: '' });
    try {
      const out = await fn();
      setMsg({ tone: 'ok', text: typeof done === 'function' ? done(out) : done });
    } catch (e) {
      setMsg({ tone: 'bad', text: e?.message || 'تعذّرت العمليّة.' });
    } finally {
      setBusy('');
    }
  }

  /** يملأ بنَد الأصل من الجرد حين يُختار رقمُه — فلا يُكتب اسمٌ بيدٍ تُخطئ. */
  function fillLineFromAsset(line) {
    const key = lineAssetKey(line);
    const a = key ? index.get(key) : null;
    if (!a) return line;
    return {
      ...line,
      assetName: a.assetName || line.assetName,
      category: assetCategory(a),
      brand: a.brand || '',
      createNew: false,
    };
  }

  const setLine = (i, patch) =>
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l, j) => (j === i ? fillLineFromAsset({ ...l, ...patch }) : l)),
    }));

  const availableOf = (line) => {
    const key = lineAssetKey(line);
    const a = key ? index.get(key) : null;
    return a ? rawQty(a.qty) : null;
  };

  return (
    <div dir="rtl" className="o_theme space-y-5">
      {/* ═══ الترويسة ═══ */}
      <section className="o_ds o_ds_card o_ds_pad">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-grid place-items-center w-9 h-9 rounded-lg bg-accent/10 border border-accent/25 text-accent shrink-0">
            <Icon name="arrowLeftRight" size={18} />
          </span>
          <div className="flex-1 min-w-[240px]">
            <div className="font-bold text-ink">بطاقات حركة مخزن فينسيا</div>
            <div className="text-xs text-muted leading-relaxed">
              بطاقةٌ واحدةٌ باتّجاهين: <strong>صرفٌ</strong> يُنقص و<strong>إدخالٌ</strong> يزيد. تُحضَّر مسودّةً
              فتُراجَع، ثمّ تُثبَّت برقمٍ رسميٍّ فتتحرّك الكمّيّاتُ دفعةً واحدة.
            </div>
          </div>
          <a className="btn btn-secondary btn-sm" href="../venecia-assets/">
            لوحة الجرد
          </a>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-brand-red/40 bg-brand-red/5 text-brand-red text-xs p-2.5">
          {error}
        </div>
      )}
      {loaded && !error && !canWrite && (
        <div className="rounded-lg border border-line bg-surface-2 text-xs p-2.5 text-ink-2">
          أنت تقرأ ولا تكتب: إنشاءُ البطاقات وتثبيتُها للمدير العامّ ومدير المستودعات.
        </div>
      )}
      {loaded && !online && (
        <div className="rounded-lg border border-brand-red/40 bg-brand-red/5 text-xs p-2.5 text-brand-red">
          <strong>بلا اتّصالٍ بالإنترنت.</strong> يمكنك إنشاءُ المسودّات وحفظُها — وتُرفع حين تعود
          الشبكة. <strong>ولا يمكن التثبيتُ الآن</strong>: الرقمُ الرسميُّ يُحجز من الخادم ولا يُخترع
          محلّيًّا.
        </div>
      )}
      {busy && slow && (
        <div className="rounded-lg border border-accent/40 bg-accent/5 text-xs p-2.5 text-ink-2">
          ما زالت العمليّةُ جاريةً — الاتّصالُ بطيءٌ أو لا يبلغ الخادم. <strong>لا تُعد الضغط</strong>:
          إن كانت قد كُتبت فسترى نتيجتَها، وإلّا فأعِدها بعد أن تستقرّ الشبكة.
        </div>
      )}
      {msg.text && (
        <div
          className={`rounded-lg text-xs p-2.5 border ${
            msg.tone === 'bad'
              ? 'border-brand-red/40 bg-brand-red/5 text-brand-red whitespace-pre-line'
              : 'border-accent/40 bg-accent/5 text-ink-2'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* ═══ ⓪ صرفٌ بخطوةٍ واحدة ‹VEN-202› ═══
          ★ المسارُ الطويل (بطاقةٌ ← بنودٌ ← مسودّةٌ ← تثبيت) باقٍ أسفلَه لمن
          يصرف عدّةَ أصنافٍ في سندٍ واحد — **يُضاف ولا يُنتزع**. وهذا للحالة
          الغالبة: صنفٌ واحدٌ لشخصٍ واحدٍ يأخذه الآن. */}
      {canWrite && (
        <section className="o_ds o_ds_card o_ds_pad space-y-3">
          <div className="flex items-center gap-2">
            <Icon name="arrowLeftRight" size={16} className="text-accent" />
            <h2 className="text-[13px] font-bold text-ink">اصرف الآن</h2>
            <span className="text-[11px] text-muted">
              صنفٌ واحدٌ لشخصٍ واحد — يُقيَّد ويُرقَّم ويَنزل الرصيدُ بضغطةٍ واحدة.
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="من أخذها" required>
              <input
                className={inputCls}
                value={quick.party}
                onChange={(e) => setQuick({ ...quick, party: e.target.value })}
                placeholder="اسم المستلِم"
              />
            </Field>
            <Field label="الصنف" required>
              <select
                className={inputCls}
                value={quick.assetNo}
                onChange={(e) => setQuick({ ...quick, assetNo: e.target.value })}
              >
                <option value="">— اختر —</option>
                {assets
                  .filter((a) => !a.archived)
                  .map((a) => (
                    <option key={a.docId} value={a.docId}>
                      {a.id} — {a.assetName} (متاح {num(a.qty)})
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="الكمّيّة" required>
              <input
                className={inputCls}
                type="number"
                min="1"
                value={quick.qty}
                onChange={(e) => setQuick({ ...quick, qty: e.target.value })}
              />
            </Field>
            <Field label="الجهة أو المشروع">
              <input
                className={inputCls}
                value={quick.destination}
                onChange={(e) => setQuick({ ...quick, destination: e.target.value })}
                placeholder="اختياريّ"
              />
            </Field>
            <div className="flex items-end">
              <button
                type="button"
                className="btn btn-primary btn-sm w-full"
                disabled={!!busy || !online || !quickReady}
                title={!online ? 'الصرفُ يحتاج اتّصالًا — الرقمُ الرسميُّ يُحجز من الخادم.' : ''}
                onClick={() =>
                  run(
                    'يُصرَف…',
                    () =>
                      issueNow(
                        {
                          ...emptyCard('issue'),
                          party: quick.party,
                          destination: quick.destination,
                          lines: [
                            fillLineFromAsset({
                              ...emptyLine(),
                              population: quickAsset?.population || 'issue',
                              assetNo: quickAsset?.id || '',
                              qty: quick.qty,
                            }),
                          ],
                        },
                        index,
                        profile
                      ),
                    (out) => {
                      setQuick({ party: '', assetNo: '', qty: '', destination: '' });
                      return `صُرفت ${num(out.moved)} وحدة — السند ${out.number}.`;
                    }
                  )
                }
              >
                اصرف
              </button>
            </div>
          </div>
          {!online && (
            <p className="text-[11px] text-brand-red">
              بلا اتّصال: احفظ بطاقةً مسودّةً من «بطاقةٌ جديدة» أدناه، وثبّتها حين تعود الشبكة.
            </p>
          )}
        </section>
      )}

      {/* ═══ ① مسودّاتٌ معلَّقة ═══ */}
      <section className="o_ds o_ds_card o_ds_pad space-y-3">
        <div className="flex items-center gap-2">
          <Icon name="alertTriangle" size={16} className={drafts.length ? 'text-brand-red' : 'text-muted'} />
          <div className="font-bold text-ink text-sm">مسودّاتٌ معلَّقة</div>
          <span className="text-[11px] text-muted">
            {drafts.length ? `${num(drafts.length)} بطاقةً لم تُثبَّت — ولا تُحرّك رصيدًا` : 'لا شيء'}
          </span>
        </div>
        {!loaded && <div className="text-xs text-muted">تُقرأ البطاقات…</div>}
        {loaded && !drafts.length && !error && (
          <div className="text-xs text-muted">
            {cards.length ? 'كلُّ البطاقات مثبَّتةٌ أو ملغاة.' : 'لا بطاقةَ بعد — أنشئ بطاقةَ صرفٍ أو إدخال.'}
          </div>
        )}
        <div className="space-y-2">
          {drafts.slice(0, 8).map((c) => (
            <div
              key={c.docId}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 p-2.5"
            >
              <Badge variant={c.kind === 'issue' ? 'warn' : 'progress'}>{cardKindLabel(c.kind)}</Badge>
              <span className="font-bold text-[13px] text-ink flex-1 min-w-[140px]">{c.party || '—'}</span>
              <span className="text-[11px] text-ink-2">
                {num(cardTotals(c).lines)} بندًا · {num(cardTotals(c).units)} وحدة
              </span>
              <span className="text-[11px] text-muted">{c.cardDate || '—'}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpenId(c.docId)}>
                افتحها
              </button>
            </div>
          ))}
          {drafts.length > 8 && (
            <div className="text-[11px] text-muted">و{num(drafts.length - 8)} مسودّةً أخرى في الفهرس.</div>
          )}
        </div>
      </section>

      {/* ═══ ② لقطةٌ وإجراءات ═══ */}
      <section className="o_ds o_ds_card">
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-x-reverse divide-line">
          <Kpi label="صُرف" value={num(snap.issued.units)} hint={`${num(snap.issued.cards)} بطاقة`} />
          <Kpi label="أُدخل" value={num(snap.received.units)} hint={`${num(snap.received.cards)} بطاقة`} />
          <Kpi
            label="الصافي"
            value={cardEffectText({ kind: snap.net < 0 ? 'issue' : 'receipt', lines: [{ qty: Math.abs(snap.net) }] })}
            hint="إدخالٌ ناقصَ صرف"
            tone={snap.net < 0 ? 'red' : ''}
          />
          <Kpi
            label="مسودّات"
            value={num(snap.drafts)}
            hint="لم تُحرّك رصيدًا"
            tone={snap.drafts ? 'red' : ''}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line p-3">
          {CARD_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              className={`btn btn-sm ${k.id === 'issue' ? 'btn-primary' : 'btn-secondary'}`}
              disabled={!canWrite || !!busy}
              onClick={() => {
                setForm(emptyCard(k.id));
                setOpenId('');
              }}
            >
              {k.label} جديدة
            </button>
          ))}
          {busy && <span className="text-[11px] font-bold text-accent">{busy}</span>}
          <span className="text-[10px] text-muted ms-auto">
            المثبَّتةُ لا تُعدَّل — تُصحَّح ببطاقةٍ مضادّة.
          </span>
        </div>
      </section>

      {/* ═══ نموذجُ البطاقة ═══ */}
      {form && (
        <section className="o_ds o_ds_card o_ds_pad space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Icon name={form.kind === 'issue' ? 'arrowUpTray' : 'arrowDownTray'} size={16} className="text-accent" />
            <div className="font-bold text-ink text-sm">
              {form.docId ? 'تعديل مسودّة' : `${cardKindLabel(form.kind)} جديدة`}
            </div>
            <Badge variant={form.kind === 'issue' ? 'warn' : 'progress'}>{cardKind(form.kind)?.short}</Badge>
            <span className="text-[11px] text-muted ms-auto">
              {num(cardTotals(form).lines)} بندًا · {num(cardTotals(form).units)} وحدة
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="التاريخ" required>
              <input
                type="date"
                className={inputCls}
                value={form.cardDate}
                onChange={(e) => setForm({ ...form, cardDate: e.target.value })}
              />
            </Field>
            <Field label={cardKind(form.kind)?.partyLabel || 'الطرف'} required>
              <input
                className={inputCls}
                value={form.party}
                onChange={(e) => setForm({ ...form, party: e.target.value })}
                placeholder={form.kind === 'issue' ? 'اسم المستلِم' : 'اسم المورِّد'}
              />
            </Field>
            <Field label="الجهة أو المشروع">
              <input
                className={inputCls}
                value={form.destination}
                onChange={(e) => setForm({ ...form, destination: e.target.value })}
                placeholder="مشروع الرحبة"
              />
            </Field>
            <Field label="الغرض">
              <input
                className={inputCls}
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              />
            </Field>
          </div>

          {/* البنود */}
          <div className="rounded-lg border border-line overflow-hidden">
            <div className="flex items-center gap-2 p-2.5 border-b border-line bg-surface-2">
              <div className="font-bold text-[12px] text-ink">البنود</div>
              <button
                type="button"
                className="btn btn-secondary btn-sm ms-auto"
                onClick={() => setForm({ ...form, lines: [...form.lines, emptyLine()] })}
              >
                أضف بندًا
              </button>
            </div>
            <div className="divide-y divide-line">
              {form.lines.map((l, i) => {
                const have = availableOf(l);
                const short = form.kind === 'issue' && have !== null && Number(l.qty) > have;
                return (
                  <div key={i} className="grid gap-2 p-2.5 sm:grid-cols-12 items-end">
                    <div className="sm:col-span-2">
                      <Field label="المجموعة">
                        <select
                          className={inputCls}
                          value={l.population}
                          onChange={(e) => setLine(i, { population: e.target.value })}
                        >
                          {POPULATIONS.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <div className="sm:col-span-2">
                      <Field label="رقم الأصل">
                        <input
                          className={`${inputCls} font-mono`}
                          list={`venecia-assets-${l.population}`}
                          value={l.assetNo}
                          onChange={(e) => setLine(i, { assetNo: e.target.value.trim() })}
                          placeholder="BRZ-0001"
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-3">
                      <Field label="اسم الأصل">
                        <input
                          className={inputCls}
                          value={l.assetName}
                          onChange={(e) => setLine(i, { assetName: e.target.value })}
                          readOnly={!l.createNew && have !== null}
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-2">
                      <Field
                        label="الكمية"
                        hint={
                          have === null
                            ? form.kind === 'receipt'
                              ? 'أصلٌ جديد'
                              : 'غيرُ مسجَّل'
                            : `المتاح ${num(have)}`
                        }
                      >
                        <input
                          type="number"
                          min="0"
                          className={`${inputCls} ${short ? 'border-brand-red' : ''}`}
                          value={l.qty}
                          onChange={(e) => setLine(i, { qty: e.target.value })}
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-2">
                      {form.kind === 'receipt' && have === null && (
                        <label className="flex items-center gap-1.5 text-[11px] text-ink-2">
                          <input
                            type="checkbox"
                            checked={l.createNew}
                            onChange={(e) => setForm({
                              ...form,
                              lines: form.lines.map((x, j) => (j === i ? { ...x, createNew: e.target.checked } : x)),
                            })}
                          />
                          أصلٌ جديد
                        </label>
                      )}
                      {/* ★ والأصلُ الجديد يُولَد مصنَّفًا: تصنيفٌ يُترك فارغًا
                          يُولّد «غير مصنّف» في الجرد ولا يُصفَّى به أبدًا. */}
                      {form.kind === 'receipt' && l.createNew && (
                        <div className="space-y-1 mt-1">
                          <input
                            className={inputCls}
                            list="venecia-card-categories"
                            value={l.category}
                            onChange={(e) => setForm({
                              ...form,
                              lines: form.lines.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)),
                            })}
                            placeholder="التصنيف — اثاث · بناء · كهرباء …"
                          />
                          <select
                            className={inputCls}
                            value={l.condition}
                            onChange={(e) => setLine(i, { condition: e.target.value })}
                          >
                            {ASSET_CONDITIONS.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                    <div className="sm:col-span-1 flex justify-end">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={form.lines.length === 1}
                        onClick={() => setForm({ ...form, lines: form.lines.filter((_, j) => j !== i) })}
                      >
                        احذف
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* تصنيفاتُ الجرد القائمة — تُقترح على الأصل الجديد فلا يُخترع تصنيفٌ ثانٍ لنفس الشيء. */}
          <datalist id="venecia-card-categories">
            {[...new Set(assets.filter((a) => !a.archived).map((a) => assetCategory(a)))].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          {POPULATIONS.map((p) => (
            <datalist key={p.id} id={`venecia-assets-${p.id}`}>
              {assets
                .filter((a) => a.population === p.id && !a.archived)
                .map((a) => (
                  <option key={a.docId} value={a.id}>
                    {a.assetName} — المتاح {rawQty(a.qty)}
                  </option>
                ))}
            </datalist>
          ))}

          {!formVerdict.ok && (
            <div className="rounded-lg border border-brand-red/40 bg-brand-red/5 text-brand-red text-[11px] p-2.5 space-y-0.5">
              {formVerdict.problems.map((p) => (
                <div key={p}>• {p}</div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!canWrite || !!busy || !formVerdict.ok}
              onClick={() =>
                run(
                  'تُحفظ…',
                  () => saveCardDraft(form, index, profile, { docId: form.docId || '' }),
                  (out) => {
                    setForm(null);
                    setOpenId(out.docId);
                    return 'حُفظت المسودّة — راجعها ثمّ ثبّتها.';
                  }
                )
              }
            >
              احفظ المسودّة
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm(null)}>
              إلغاء
            </button>
            <span className="text-[10px] text-muted">المسودّةُ لا تُحرّك كمّيّةً.</span>
          </div>
        </section>
      )}

      {/* ═══ لوحُ البطاقة ═══ */}
      {open && (
        <section className="o_ds o_ds_card o_ds_pad space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-ink-2">{open.number || 'بلا رقمٍ بعد'}</span>
            <Badge variant={open.kind === 'issue' ? 'warn' : 'progress'}>{cardKindLabel(open.kind)}</Badge>
            <Badge variant={STATE_VARIANT[open.state] || 'draft'}>{cardStateLabel(open.state, open.kind)}</Badge>
            <span className="font-bold text-ink">{open.party || '—'}</span>
            <span className="text-[11px] text-muted">{open.cardDate}</span>
            <span className="text-[11px] text-ink-2 ms-auto" dir="ltr">
              {cardEffectText(open)}
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpenId('')}>
              أغلق
            </button>
          </div>

          <div className="o_list_scroll">
            <table className="o_list_view">
              <thead>
                <tr>
                  <th>رقم الأصل</th>
                  <th>اسم الأصل</th>
                  <th>المجموعة</th>
                  <th className="o_list_number">الكمية</th>
                  <th className="o_list_number">المتاح الآن</th>
                </tr>
              </thead>
              <tbody>
                {(open.lines ?? []).map((l, i) => {
                  const have = availableOf(l);
                  return (
                    <tr key={i}>
                      <td><span className="font-mono text-[11px]">{l.assetNo}</span></td>
                      <td>{l.assetName}</td>
                      <td><span className="text-[11px]">{populationLabel(l.population)}</span></td>
                      <td className="o_list_number">{num(l.qty)}</td>
                      <td className="o_list_number">{have === null ? '—' : num(have)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {open.purpose && <div className="text-[11px] text-ink-2">الغرض: {open.purpose}</div>}
          {open.cancelReason && (
            <div className="text-[11px] text-brand-red">سببُ الإلغاء: {open.cancelReason}</div>
          )}
          {open.state === 'posted' && (
            <div className="text-[10px] text-muted">
              ثُبِّتت {open.postedDay || ''} بيد {open.postedBy || '—'}.
            </div>
          )}

          {open.state === 'draft' && (
            <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!canWrite || !!busy || !online}
                title={!online ? 'التثبيتُ يحتاج اتّصالًا — الرقمُ الرسميُّ يُحجز من الخادم.' : ''}
                onClick={() =>
                  run(
                    'تُثبَّت…',
                    () => postCard(open.docId, profile),
                    (out) =>
                      `ثُبِّتت البطاقة ${out.number} — ${num(out.moved)} وحدة` +
                      (out.created ? ` وأُنشئ ${num(out.created)} أصلًا جديدًا.` : '.')
                  )
                }
              >
                {cardKind(open.kind)?.postLabel || 'ثبّتها'}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!canWrite || !!busy}
                onClick={() => setForm({ ...open, lines: (open.lines ?? []).map((l) => ({ ...l })) })}
              >
                عدّلها
              </button>
              <Field label="سببُ الإلغاء">
                <input
                  className={inputCls}
                  value={reasonDraft}
                  onChange={(e) => setReasonDraft(e.target.value)}
                  placeholder="أُلغي الطلب"
                />
              </Field>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!canWrite || !!busy || !reasonDraft.trim()}
                onClick={() =>
                  run('تُلغى…', () => cancelCard(open.docId, reasonDraft, profile), () => {
                    setReasonDraft('');
                    return 'أُلغيت المسودّة.';
                  })
                }
              >
                ألغِها
              </button>
            </div>
          )}

          {open.state === 'posted' && (
            <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
              <div className="text-[10px] text-muted basis-full">
                المثبَّتةُ لا تُعدَّل ولا تُلغى — التصحيحُ ببطاقةٍ مضادّةٍ في الاتّجاه الآخر، تُقيَّد بسببها.
              </div>
              <Field label="سببُ البطاقة المضادّة">
                <input
                  className={inputCls}
                  value={reasonDraft}
                  onChange={(e) => setReasonDraft(e.target.value)}
                  placeholder="أُعيدت البضاعةُ إلى المخزن"
                />
              </Field>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!canWrite || !!busy || !reasonDraft.trim()}
                onClick={() =>
                  run('تُنشأ…', () => reverseCard(open.docId, reasonDraft, profile), (out) => {
                    setReasonDraft('');
                    setOpenId(out.docId);
                    return `أُنشئت ${cardKindLabel(out.kind)} مضادّةٌ مسودّةً — راجعها ثمّ ثبّتها.`;
                  })
                }
              >
                أنشئ بطاقةً مضادّة
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
                اطبعها
              </button>
            </div>
          )}
        </section>
      )}

      {/* ═══ ③ الفهرسُ الكامل ═══ */}
      <section className="o_ds o_ds_card">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line">
          <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
            <Icon name="search" size={14} className="text-muted" />
            <input
              className={inputCls}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="بحث: الرقم · الطرف · الجهة · اسم الأصل"
            />
          </div>
          <select className={`${inputCls} max-w-[150px]`} value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
            <option value="">الاتّجاهان</option>
            {CARD_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
          <select className={`${inputCls} max-w-[140px]`} value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
            <option value="">كلُّ الحالات</option>
            <option value="draft">مسودّة</option>
            <option value="posted">مثبَّتة</option>
            <option value="cancelled">ملغاة</option>
          </select>
          <span className="text-[11px] text-muted ms-auto">
            {num(sorted.length)} من {num(cards.length)}
          </span>
        </div>

        {!sorted.length ? (
          <div className="p-6 text-center text-xs text-muted">
            {cards.length ? 'لا بطاقةَ تطابق التصفية.' : 'لا بطاقةَ بعد.'}
          </div>
        ) : (
          <ListView
            selectable={false}
            onRowClick={(r) => {
              setOpenId(r.id);
              setReasonDraft('');
            }}
            columns={[
              { key: 'number', label: 'الرقم', width: '150px' },
              { key: 'kind', label: 'الاتّجاه', width: '110px' },
              { key: 'date', label: 'التاريخ', width: '110px' },
              { key: 'party', label: 'الطرف' },
              { key: 'dest', label: 'الجهة' },
              { key: 'lines', label: 'بنود', numeric: true, width: '70px' },
              { key: 'effect', label: 'الأثر', numeric: true, width: '90px' },
              { key: 'state', label: 'الحالة', width: '110px' },
            ]}
            rows={sorted.map((c) => ({
              id: c.docId,
              decoration: c.state === 'cancelled' ? 'muted' : undefined,
              cells: {
                number: <span className="font-mono text-[11px]">{c.number || '—'}</span>,
                kind: (
                  <Badge variant={c.kind === 'issue' ? 'warn' : 'progress'}>{cardKind(c.kind)?.short || '—'}</Badge>
                ),
                date: <span className="text-[11px]">{c.cardDate || '—'}</span>,
                party: c.party || '—',
                dest: <span className="text-[11px] text-muted">{c.destination || '—'}</span>,
                lines: num(cardTotals(c).lines),
                effect: (
                  <span dir="ltr" className={c.state === 'posted' ? 'font-bold' : 'text-muted'}>
                    {cardEffectText(c)}
                  </span>
                ),
                state: (
                  <Badge variant={STATE_VARIANT[c.state] || 'draft'}>{cardStateLabel(c.state, c.kind)}</Badge>
                ),
              },
            }))}
          />
        )}
      </section>
    </div>
  );
}
