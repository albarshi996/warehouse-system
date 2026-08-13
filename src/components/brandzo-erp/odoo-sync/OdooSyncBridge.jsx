/**
 * جسر المزامنة الحيّ مع أودو — المرآة المبنيّة على الوقائع، **بشمول الدورة كلّها**.
 * ─────────────────────────────────────────────────────────────────────────
 * ثلاثة مسارات تغطّي كلّ ما هو حيّ في البوابة:
 *   1. الدورة المستندية (الكلّ): الأنواع الـ27 المحكومة — أمر الشراء والاستلام
 *      بمخطِّطيهما المخصوصَين، والبقيّة بجدول العبور `docCrosswalk` (يحرسه
 *      اختبار انجرافٍ يفشل إن أُضيف نوعٌ بلا تخطيط).
 *   2. ماستر الأصناف: دفعٌ وسحبٌ متبادلان مع `product.product`.
 *   3. العمليات المخزنيّة: دفتر الحركات (`stock_moves` ملحق-فقط) → `stock.move`.
 *
 * القاعدة: كلّ مستندٍ يُدفع يصل أودو **مسوّدةً حتى الاعتماد**؛ والقيود
 * التاريخيّة (الحركات) تنعكس منجزةً كما وقعت. تزامنٌ مستمرّ (onSnapshot)
 * وإشعارات (جرس + خلاصة من سجلٍّ ملحق-فقط).
 *
 * الوصول: المديران (الإلزام الحقيقيّ في firestore.rules).
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listenAllDocuments } from '../../../services/documents/documentsService.js';
import { GOVERNED_FORMS } from '../../../services/documents/schemas/index.js';
import { subscribeItems } from '../../../services/itemService.js';
import { listenRecentMoves } from '../../../services/ledger/ledgerService.js';
import { odoo } from '../../../services/odoo/index.js';
import { odooStateLabel } from '../../../services/odoo/poMapper.js';
import { pickingStateLabel } from '../../../services/odoo/grnMapper.js';
import { odooTargetFor, refText } from '../../../services/odoo/docCrosswalk.js';
import { isPushSealed } from '../../../services/odoo/directionGuard.js';
import {
  pushAnyDocument,
  pushItem,
  approveInOdoo,
  validateReceiptInOdoo,
  approveAnyInOdoo,
  syncLedgerMoves,
  pullProducts,
  listenSyncState,
  listenSyncEvents,
  describeOdooConfig,
} from '../../../services/odoo/odooSyncService.js';
import { IconDoc, IconBox, IconSync, IconArrow, IconCheck, IconBell, IconUp, IconDown } from './icons.jsx';

const ALLOWED = ['admin', 'warehouse_manager'];

/** تسميات حالات مستند البوابة (محرّك المستندات). */
const PORTAL_STATE = {
  draft: 'مسودة',
  submitted: 'بانتظار الاعتماد',
  approved: 'معتمد',
  done: 'منجَز',
  rejected: 'مرفوض',
};

/** نوع البوابة → عنوانه العربيّ (من سجلّ النماذج المحكومة نفسه). */
const TYPE_TITLE = Object.fromEntries(GOVERNED_FORMS.map((f) => [f.type, f.titleAr]));

const TONE = {
  warn: { bg: '#fdf6e3', color: '#8a6d1b', border: '#e6d08a' },
  success: { bg: '#e9f7ef', color: '#1e7e34', border: '#bfe3c9' },
  error: { bg: '#fdecee', color: '#b02a37', border: '#f1aeb5' },
  muted: { bg: 'var(--chip, #f4f4f6)', color: 'var(--ink-2, #555)', border: 'var(--line, #e5e5ea)' },
};

/**
 * مرجع أودو نصًّا آمنًا.
 *
 * أودو يعيد الحقول العلاقيّة على هيئة `[id, "الاسم"]`، ويعيد `false` عند
 * الفراغ. فرسمُ الحقل مباشرةً يطبع `[object Object]` — وهو ما ظهر حيًّا في
 * لقطة المالك 2026-08-13 على سجلّ `TRN`.
 */
function originLabel(origin) {
  const text = refText(origin);
  // السجلّات التي دُفعت قبل إصلاح `docCrosswalk` تحمل النصّ الحرفيّ
  // «[object Object]» مخزَّنًا. لا نستطيع إصلاحها في أودو — الكتابة مختومة —
  // فنُخفيها بدل عرض حشوٍ لا يدلّ على شيء. وتُصحَّح ذاتيًّا عند أوّل سحب.
  return /^\[object /.test(text) ? '' : text;
}

function Badge({ tone = 'muted', title, children }) {
  const t = TONE[tone] || TONE.muted;
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={{ background: t.bg, color: t.color, border: `1px solid ${t.border}` }}
    >
      {children}
    </span>
  );
}

/** شارة حالة سجلّ مرآةٍ في أودو — لكلّ نوعٍ منطقه (PO/استلام/عامّ). */
function MirrorStateBadge({ rec }) {
  if (rec.sourceType === 'PO') {
    const { text, tone } = odooStateLabel(rec.odooState);
    return <Badge tone={tone}>{text}</Badge>;
  }
  if (rec.sourceType === 'GRN') {
    const { text, tone } = pickingStateLabel(rec.odooState);
    return <Badge tone={tone}>{text}</Badge>;
  }
  if (rec.odooState === 'draft') return <Badge tone="warn">مسوّدة</Badge>;
  return <Badge tone="success">{rec.confirmLabel || 'معتمد'}</Badge>;
}

/** رأس عمودٍ في الجسر. */
function ColumnHead({ icon, title, sub, tone }) {
  return (
    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-line">
      <span className="shrink-0 w-9 h-9 rounded-lg grid place-items-center" style={{ background: tone.bg, color: tone.color }}>
        {icon}
      </span>
      <div>
        <div className="font-bold text-ink text-sm">{title}</div>
        <div className="text-[11px] text-ink-2">{sub}</div>
      </div>
    </div>
  );
}

/** بطاقةٌ عامّة في عمود. */
function Card({ children, muted }) {
  return (
    <div className={`rounded-lg border border-line p-3 mb-2 ${muted ? 'opacity-70' : ''}`} style={{ background: 'var(--surface, #fff)' }}>
      {children}
    </div>
  );
}

const btn =
  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const btnPrimary = `${btn} text-white`;
const primaryStyle = { background: 'var(--accent, #714B67)' };

export default function OdooSyncBridge() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [track, setTrack] = useState('docs'); // 'docs' | 'item' | 'ops'
  const [docsAll, setDocsAll] = useState([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [items, setItems] = useState([]);
  const [moves, setMoves] = useState([]);
  const [odooProducts, setOdooProducts] = useState([]);
  const [syncState, setSyncState] = useState([]);
  const [events, setEvents] = useState([]);
  const [busy, setBusy] = useState('');
  // ختم الاتّجاه (SAP-15): ثابتٌ في الكود لا في السياسة، فلا يُقرأ من الشبكة.
  const sealed = isPushSealed();
  const [msg, setMsg] = useState(null);
  const [feedOpen, setFeedOpen] = useState(false);
  const [seenCount, setSeenCount] = useState(0);

  const cfg = useMemo(() => describeOdooConfig(), []);

  useEffect(() => {
    const unsub = subscribeAuth(async (u) => {
      setMe(u ? await fetchUserProfile(u) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  const allowed = me && ALLOWED.includes(me.role);

  useEffect(() => {
    if (!allowed) return undefined;
    const u1 = listenAllDocuments(setDocsAll, 200);
    const u2 = subscribeItems(setItems, () => {}, { includeArchived: false });
    const u3 = listenSyncState(setSyncState, () => {});
    const u4 = listenSyncEvents(setEvents, 40, () => {});
    const u5 = listenRecentMoves(setMoves, 100);
    return () => {
      u1?.();
      u2?.();
      u3?.();
      u4?.();
      u5?.();
    };
  }, [allowed]);

  // مسار الأصناف: أصناف أودو الحاليّة (قراءة عبر نفس مسار الإنتاج).
  const refreshOdooProducts = useCallback(async () => {
    try {
      const recs = await odoo.searchRead(
        'product.product',
        [],
        ['default_code', 'name', 'x_name_en', 'qty_available'],
        { order: 'default_code asc' }
      );
      setOdooProducts(recs);
    } catch {
      setOdooProducts([]);
    }
  }, []);

  useEffect(() => {
    if (allowed && track === 'item') refreshOdooProducts();
  }, [allowed, track, refreshOdooProducts, syncState]);

  const flash = (text, tone = 'success') => {
    setMsg({ text, tone });
    setTimeout(() => setMsg(null), 4200);
  };

  const unread = Math.max(0, events.length - seenCount);

  const run = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      flash(e?.message || 'تعذّرت العمليّة', 'error');
    } finally {
      setBusy('');
    }
  };

  /* ── الفهارس المشتقّة من المرآة ── */
  const mirrorById = useMemo(() => new Map(syncState.map((r) => [r.id, r])), [syncState]);
  const docMirror = syncState.filter((r) => r.sourceType !== 'item' && r.sourceType !== 'move');
  const moveMirror = syncState.filter((r) => r.sourceType === 'move');
  const pushedDocs = useMemo(() => {
    const s = new Set();
    for (const r of docMirror) if (r.sourceId) s.add(`${r.sourceType}_${r.sourceId}`);
    return s;
  }, [docMirror]);
  const linkedItems = new Set(syncState.filter((r) => r.sourceType === 'item').map((r) => r.sourceId));
  const mirroredMoves = new Set(moveMirror.map((r) => r.sourceId));

  /* ── المستندات المعروضة (فلتر النوع) ── */
  const typesPresent = useMemo(
    () => [...new Set(docsAll.map((d) => d.type))].sort(),
    [docsAll]
  );
  const docsShown = typeFilter === 'all' ? docsAll : docsAll.filter((d) => d.type === typeFilter);

  /* ── المعالجات ── */
  const onPushDoc = (docObj) =>
    run(`doc-${docObj.id}`, async () => {
      await pushAnyDocument(docObj, me);
      flash(`دُفع ${docObj.number || TYPE_TITLE[docObj.type] || docObj.type} إلى أودو مسوّدةً`, 'success');
    });

  const onApproveMirror = (rec) =>
    run(`ap-${rec.id}`, async () => {
      if (rec.sourceType === 'PO') {
        await approveInOdoo(rec, me);
        flash(`اعتُمد ${rec.sourceNumber || 'الأمر'} — أصبح مؤكّدًا، وجدول أودو استلامًا تلقائيًّا`, 'success');
      } else if (rec.sourceType === 'GRN') {
        await validateReceiptInOdoo(rec, me);
        flash(`صُدّق الاستلام ${rec.sourceNumber || rec.title || ''} — منجَز`, 'success');
      } else {
        await approveAnyInOdoo(rec, me);
        flash(`اعتُمد ${rec.sourceNumber || rec.title || ''} في أودو (${rec.confirmLabel || 'معتمد'})`, 'success');
      }
    });

  const onPushItem = (item) =>
    run(`it-${item.sku}`, async () => {
      await pushItem(item, me);
      flash(`دُفع الصنف ${item.sku} إلى أودو`, 'success');
    });

  const onPull = () =>
    run('pull', async () => {
      const r = await pullProducts(me);
      await refreshOdooProducts();
      flash(`سُحب ${r.total} صنفًا (${r.created} جديد · ${r.updated} محدَّث) إلى الماستر`, 'success');
    });

  const onSyncMoves = () =>
    run('mv', async () => {
      const r = await syncLedgerMoves(moves, mirrorById, me);
      flash(
        r.pushed > 0
          ? `زومنت ${r.pushed} حركة مخزنيّة إلى أودو (تُخُطّي ${r.skipped} مُزامَنة سابقًا)`
          : 'كلّ الحركات مُزامَنة أصلًا — لا جديد',
        'success'
      );
    });

  if (!ready) return <div className="text-ink-2 text-sm p-6">…جارٍ التحميل</div>;
  if (!allowed)
    return (
      <div className="rounded-lg border border-line bg-chip p-6 text-ink-2 text-sm">
        هذه الصفحة للمديرين. سجّل الدخول بحسابٍ مخوّل لرؤية جسر المزامنة.
      </div>
    );

  return (
    <div dir="rtl">
      {/* شريط الوضع + الجرس */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Badge tone={cfg.live ? 'success' : 'warn'}>
            <IconSync width={13} height={13} /> {cfg.label}
          </Badge>
          <span className="text-[11px] text-ink-2">
            كلّ دفعٍ يمرّ بنفس واجهة عميل الإنتاج — التبديل للإنتاج مفتاح بيئةٍ واحد.
          </span>
        </div>
        <div className="relative">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-ink hover:bg-chip"
            onClick={() => {
              setFeedOpen((v) => !v);
              setSeenCount(events.length);
            }}
          >
            <IconBell width={15} height={15} /> النشاط
            {unread > 0 && (
              <span className="grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] text-white" style={{ background: '#b02a37' }}>
                {unread}
              </span>
            )}
          </button>
          {feedOpen && <ActivityFeed events={events} onClose={() => setFeedOpen(false)} />}
        </div>
      </div>

      {/* شريط الشرح: آلتا الحالة جنبًا إلى جنب */}
      <div className="rounded-lg border border-line bg-chip p-3 mb-4 text-[12px]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-bold text-ink">آليّة الربط:</span>
          <span className="text-ink-2">
            البوابة: <b>مسودة</b> ← <b>مُرسل</b> ← <b>معتمد</b> ← <b>منجَز</b>
          </span>
          <span className="text-ink-2">
            أودو: <b>مسوّدة (draft)</b> ← <span style={{ color: '#1e7e34' }}><b>اعتماد ⇒ حالة نموذجه</b></span> (مؤكّد/مُرحّل/منجَز)
          </span>
          <span className="text-ink-2">
            · تأكيد أمر الشراء <b>يجدول استلامًا واردًا تلقائيًّا</b> (WH/IN)
          </span>
          <span className="text-ink-2">— لا شيء يُعتمد في أودو إلّا بقرارٍ صريح؛ والقيود التاريخيّة تنعكس كما وقعت.</span>
        </div>
      </div>

      {/* مبدّل المسار */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { id: 'docs', label: `الدورة المستندية (${docsAll.length})`, icon: <IconDoc width={15} height={15} /> },
          { id: 'item', label: 'ماستر الأصناف', icon: <IconBox width={15} height={15} /> },
          { id: 'ops', label: `العمليات المخزنيّة (${moves.length})`, icon: <IconSync width={15} height={15} /> },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTrack(t.id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold border transition-colors ${
              track === t.id ? 'text-white border-transparent' : 'text-ink border-line hover:bg-chip'
            }`}
            style={track === t.id ? primaryStyle : undefined}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
        {track === 'docs' && typesPresent.length > 1 && (
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-xs font-bold text-ink"
            aria-label="تصفية بنوع المستند"
          >
            <option value="all">كلّ الأنواع ({docsAll.length})</option>
            {typesPresent.map((t) => (
              <option key={t} value={t}>
                {TYPE_TITLE[t] || t} ({docsAll.filter((d) => d.type === t).length})
              </option>
            ))}
          </select>
        )}
      </div>

      {msg && (
        <div className="mb-3 rounded-lg px-4 py-2 text-sm font-medium border" style={{ ...TONE[msg.tone === 'ok' ? 'success' : msg.tone] }}>
          {msg.text}
        </div>
      )}

      {/* الجسر ثلاثيّ الأعمدة */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
        {/* ── العمود ١: البوابة ── */}
        <section className="rounded-xl border border-line bg-surface p-4">
          {track === 'docs' ? (
            <>
              <ColumnHead
                icon={<IconDoc />}
                title="البوابة — الدورة المستندية"
                sub={`${docsShown.length} مستند حقيقيّ${typeFilter !== 'all' ? ` · ${TYPE_TITLE[typeFilter] || typeFilter}` : ''}`}
                tone={TONE.muted}
              />
              {docsShown.length === 0 && <p className="text-xs text-ink-2">لا مستندات بعد. أنشئ من صفحة المستندات — سيظهر هنا فورًا.</p>}
              {docsShown.map((d) => {
                const pushed = pushedDocs.has(`${d.type}_${d.id}`);
                const target = odooTargetFor(d.type);
                return (
                  <Card key={d.id}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-ink text-sm truncate">{d.number || 'مسودة'}</div>
                        <div className="text-[11px] text-ink-2 truncate">
                          {TYPE_TITLE[d.type] || d.type}
                          {d.header?.supplier ? ` · ${d.header.supplier}` : d.header?.customer ? ` · ${d.header.customer}` : ''}
                        </div>
                      </div>
                      <Badge tone={d.state === 'approved' || d.state === 'done' ? 'success' : 'muted'}>
                        {PORTAL_STATE[d.state] || d.state}
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {pushed ? (
                        <Badge tone="success">
                          <IconCheck width={12} height={12} /> مرتبط بأودو
                        </Badge>
                      ) : target && sealed ? (
                        // ختم الاتّجاه (SAP-15): لا تُعرض دعوةٌ إلى فعلٍ مختوم.
                        // الزرّ لم يُحذف — يعود بفكّ الختم وحده.
                        <Badge tone="muted" title="الاتّجاه المعتمد: أودو ← البوابة. البوابة تقرأ ولا تكتب.">
                          الدفع مختوم
                        </Badge>
                      ) : target ? (
                        <button
                          type="button"
                          className={btnPrimary}
                          style={primaryStyle}
                          disabled={busy === `doc-${d.id}`}
                          onClick={() => onPushDoc(d)}
                        >
                          <IconArrow width={14} height={14} />
                          {busy === `doc-${d.id}` ? '…' : 'ادفع إلى أودو'}
                        </button>
                      ) : (
                        <Badge tone="error">بلا تخطيط أودو</Badge>
                      )}
                      {target && <span className="text-[10px] text-ink-2" style={{ direction: 'ltr' }}>{target.model}</span>}
                    </div>
                  </Card>
                );
              })}
            </>
          ) : track === 'item' ? (
            <>
              <ColumnHead icon={<IconBox />} title="البوابة — ماستر الأصناف" sub={`${items.length} صنف`} tone={TONE.muted} />
              {items.slice(0, 40).map((it) => (
                <Card key={it.sku}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-ink text-sm truncate">{it.nameAr}</div>
                      <div className="text-[11px] text-ink-2" style={{ direction: 'ltr' }}>{it.sku}</div>
                    </div>
                    {linkedItems.has(it.sku) || it.odooId ? (
                      <Badge tone="success">
                        <IconCheck width={12} height={12} /> مرتبط
                      </Badge>
                    ) : sealed ? (
                      <Badge tone="muted" title="الاتّجاه المعتمد: أودو ← البوابة.">الدفع مختوم</Badge>
                    ) : (
                      <button
                        type="button"
                        className={`${btn} border border-line text-ink hover:bg-chip`}
                        disabled={busy === `it-${it.sku}`}
                        onClick={() => onPushItem(it)}
                      >
                        <IconUp width={13} height={13} /> ادفع
                      </button>
                    )}
                  </div>
                </Card>
              ))}
              {items.length > 40 && <p className="text-[11px] text-ink-2 mt-1">… و{items.length - 40} صنفًا آخر</p>}
            </>
          ) : (
            <>
              <ColumnHead
                icon={<IconSync />}
                title="البوابة — دفتر حركات المخزون"
                sub={`آخر ${moves.length} حركة مقيّدة (ملحق-فقط)`}
                tone={TONE.muted}
              />
              {moves.length === 0 && <p className="text-xs text-ink-2">لا حركات بعد — تُقيَّد الحركات عند إنجاز المستندات المخزنيّة.</p>}
              {moves.slice(0, 40).map((mv) => (
                <Card key={mv.id}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-ink text-sm truncate" style={{ direction: 'ltr' }}>{mv.sku || '—'}</div>
                      <div className="text-[11px] text-ink-2 truncate">
                        {mv.from || '؟'} ← {mv.to || '؟'}{mv.docNumber ? ` · ${mv.docNumber}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-ink">{Number(mv.qty) || 0}</span>
                      {mirroredMoves.has(mv.id) && (
                        <Badge tone="success">
                          <IconCheck width={12} height={12} /> مُزامَنة
                        </Badge>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
              {moves.length > 40 && <p className="text-[11px] text-ink-2 mt-1">… و{moves.length - 40} حركة أخرى</p>}
            </>
          )}
        </section>

        {/* ── العمود ٢: الجسر ── */}
        <section className="rounded-xl border border-line bg-chip p-4 flex flex-col items-center justify-center gap-3 lg:w-[190px]">
          <span className="w-12 h-12 rounded-full grid place-items-center text-white" style={primaryStyle}>
            <IconSync width={24} height={24} />
          </span>
          <div className="text-center text-[12px] text-ink-2 leading-relaxed">
            التحويل عبر <b className="text-ink">جدول العبور</b>
            <br />
            ثمّ <b className="text-ink">odoo.create</b> / <b className="text-ink">write</b>
          </div>
          <div className="w-full border-t border-line my-1" />
          {track === 'item' && (
            <button type="button" className={`${btn} border border-line text-ink hover:bg-surface w-full justify-center`} disabled={busy === 'pull'} onClick={onPull}>
              <IconDown width={14} height={14} />
              {busy === 'pull' ? '…' : 'اسحب أصناف أودو'}
            </button>
          )}
          {track === 'ops' && (
            <button type="button" className={`${btn} border border-line text-ink hover:bg-surface w-full justify-center`} disabled={busy === 'mv'} onClick={onSyncMoves}>
              <IconArrow width={14} height={14} />
              {busy === 'mv' ? '…' : 'زامن الحركات إلى أودو'}
            </button>
          )}
          <div className="text-center text-[11px] text-ink-2">
            {track === 'docs'
              ? `${docMirror.length} مستند في أودو`
              : track === 'item'
                ? `${odooProducts.length} صنف في أودو`
                : `${moveMirror.length} قيد في أودو`}
          </div>
        </section>

        {/* ── العمود ٣: أودو (المرآة) ── */}
        <section className="rounded-xl border border-line bg-surface p-4">
          {track === 'docs' ? (
            <>
              <ColumnHead icon={<IconDoc />} title="أودو — المستندات" sub={`${docMirror.length} مسجَّل`} tone={TONE.success} />
              {docMirror.length === 0 && (
                <p className="text-xs text-ink-2">
                  {sealed
                    ? 'لا شيء بعد — المرآة تمتلئ بالسحب من أودو، والدفع مختوم.'
                    : 'لا شيء بعد — ادفع مستندًا من البوابة ليظهر هنا مسوّدةً.'}
                </p>
              )}
              {docMirror.map((r) => {
                const isPending = r.sourceType === 'PO' ? r.odooState === 'draft' : r.sourceType === 'GRN' ? r.odooState !== 'done' : r.odooState === 'draft';
                const verb = r.sourceType === 'PO' ? 'اعتمد في أودو' : r.sourceType === 'GRN' ? 'صدّق الاستلام' : r.verb || 'اعتمد';
                return (
                  <Card key={r.id}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-ink text-sm truncate">{r.sourceNumber || r.title || `#${r.odooId}`}</div>
                        <div className="text-[11px] text-ink-2 truncate">
                          {TYPE_TITLE[r.sourceType] || r.sourceType}
                          {r.supplier ? ` · ${r.supplier}` : ''}
                          {r.poNumber ? ` · أمر ${r.poNumber}` : originLabel(r.origin) ? ` · مرجع ${originLabel(r.origin)}` : ''}
                        </div>
                      </div>
                      <MirrorStateBadge rec={r} />
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-ink-2">
                      {r.autoCreated ? (
                        <Badge tone="muted">أنشأه أودو تلقائيًّا عند تأكيد الأمر</Badge>
                      ) : (
                        <span style={{ direction: 'ltr' }}>{r.odooModel}</span>
                      )}
                    </div>
                    {isPending && (
                      <div className="mt-2">
                        <button
                          type="button"
                          className={btnPrimary}
                          style={primaryStyle}
                          disabled={busy === `ap-${r.id}`}
                          onClick={() => onApproveMirror(r)}
                        >
                          <IconCheck width={14} height={14} />
                          {busy === `ap-${r.id}` ? '…' : verb}
                        </button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </>
          ) : track === 'item' ? (
            <>
              <ColumnHead icon={<IconBox />} title="أودو — الأصناف" sub={`${odooProducts.length} صنف`} tone={TONE.success} />
              {odooProducts.length === 0 && (
                <p className="text-xs text-ink-2">
                  {sealed ? 'لا أصناف — استخدم «اسحب» من أودو.' : 'لا أصناف — استخدم «اسحب» أو «ادفع».'}
                </p>
              )}
              {odooProducts.map((p) => (
                <Card key={p.id}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-ink text-sm truncate">{p.name}</div>
                      <div className="text-[11px] text-ink-2" style={{ direction: 'ltr' }}>{p.default_code}</div>
                    </div>
                    <Badge tone="muted">{Number(p.qty_available ?? 0)} متاح</Badge>
                  </div>
                </Card>
              ))}
            </>
          ) : (
            <>
              <ColumnHead icon={<IconSync />} title="أودو — القيود المخزنيّة" sub={`${moveMirror.length} قيد (stock.move)`} tone={TONE.success} />
              {moveMirror.length === 0 && <p className="text-xs text-ink-2">لا قيود بعد — اضغط «زامن الحركات إلى أودو».</p>}
              {moveMirror.map((r) => (
                <Card key={r.id}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-ink text-sm truncate">{r.title || r.sourceNumber || `#${r.odooId}`}</div>
                      <div className="text-[11px] text-ink-2 truncate">{r.sourceNumber ? `مستند ${r.sourceNumber}` : '—'}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-ink">{Number(r.qty) || 0}</span>
                      <Badge tone="success">منجَز</Badge>
                    </div>
                  </div>
                </Card>
              ))}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/** خلاصة النشاط — سجلّ الأحداث الملحق-فقط (الأحدث أولًا). */
function ActivityFeed({ events, onClose }) {
  const kindLabel = { push: 'دفع', approve: 'اعتماد', pull: 'سحب', error: 'خطأ' };
  const kindTone = { push: 'muted', approve: 'success', pull: 'muted', error: 'error' };
  return (
    <div className="absolute left-0 mt-2 w-80 max-h-96 overflow-auto rounded-lg border border-line shadow-xl z-50 p-3" style={{ background: 'var(--surface,#fff)' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-ink text-sm">سجلّ النشاط</span>
        <button type="button" className="text-ink-2 hover:text-ink text-lg leading-none" onClick={onClose} aria-label="إغلاق">×</button>
      </div>
      {events.length === 0 && <p className="text-xs text-ink-2">لا نشاط بعد.</p>}
      <ul className="space-y-2">
        {events.map((e) => (
          <li key={e.id} className="flex items-start gap-2 text-[12px]">
            <Badge tone={kindTone[e.kind] || 'muted'}>{kindLabel[e.kind] || e.kind}</Badge>
            <div className="min-w-0">
              <div className="text-ink leading-snug">{e.message}</div>
              <div className="text-[10px] text-ink-2">{e.actorName || ''}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
