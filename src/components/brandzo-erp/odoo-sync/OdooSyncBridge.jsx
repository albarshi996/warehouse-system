/**
 * جسر المزامنة الحيّ مع أودو — المرآة المبنيّة على الوقائع.
 * ─────────────────────────────────────────────────────────────────────────
 * ثلاثة أعمدة: البوابة (مستنداتك الحقيقيّة) → الجسر (التحويل والدفع) → أودو
 * (المرآة). مساران: أوامر الشراء وماستر الأصناف. كلّ ما يُدفع يصل أودو **مسوّدةً
 * حتى الاعتماد**، بتزامنٍ مستمرّ (onSnapshot) وإشعارات (جرس + خلاصة نشاط).
 *
 * الوصول: المديران (الإلزام الحقيقيّ في firestore.rules).
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { listenDocumentsByTypes } from '../../../services/documents/documentsService.js';
import { subscribeItems } from '../../../services/itemService.js';
import { odoo } from '../../../services/odoo/index.js';
import { odooStateLabel } from '../../../services/odoo/poMapper.js';
import { pickingStateLabel } from '../../../services/odoo/grnMapper.js';
import {
  pushPurchaseOrder,
  pushItem,
  approveInOdoo,
  pushGoodsReceipt,
  validateReceiptInOdoo,
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

const TONE = {
  warn: { bg: '#fdf6e3', color: '#8a6d1b', border: '#e6d08a' },
  success: { bg: '#e9f7ef', color: '#1e7e34', border: '#bfe3c9' },
  error: { bg: '#fdecee', color: '#b02a37', border: '#f1aeb5' },
  muted: { bg: 'var(--chip, #f4f4f6)', color: 'var(--ink-2, #555)', border: 'var(--line, #e5e5ea)' },
};

function Badge({ tone = 'muted', children }) {
  const t = TONE[tone] || TONE.muted;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={{ background: t.bg, color: t.color, border: `1px solid ${t.border}` }}
    >
      {children}
    </span>
  );
}

/** شارة حالة أودو (مسوّدة كهرمانيّة / مؤكّد أخضر). */
function OdooStateBadge({ state }) {
  const { text, tone } = odooStateLabel(state);
  return <Badge tone={tone}>{text}</Badge>;
}

/** شارة حالة الاستلام (مسوّدة/جاهز كهرمانيّ · منجَز أخضر). */
function PickingStateBadge({ state }) {
  const { text, tone } = pickingStateLabel(state);
  return <Badge tone={tone}>{text}</Badge>;
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
  const [track, setTrack] = useState('PO'); // 'PO' | 'GRN' | 'item'
  const [pos, setPos] = useState([]);
  const [grns, setGrns] = useState([]);
  const [items, setItems] = useState([]);
  const [odooProducts, setOdooProducts] = useState([]);
  const [syncState, setSyncState] = useState([]);
  const [events, setEvents] = useState([]);
  const [busy, setBusy] = useState('');
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
    const u1 = listenDocumentsByTypes(['PO', 'GRN'], (docs) => {
      setPos(docs.filter((d) => d.type === 'PO'));
      setGrns(docs.filter((d) => d.type === 'GRN'));
    }, 200);
    const u2 = subscribeItems(setItems, () => {}, { includeArchived: false });
    const u3 = listenSyncState(setSyncState, () => {});
    const u4 = listenSyncEvents(setEvents, 40, () => {});
    return () => {
      u1?.();
      u2?.();
      u3?.();
      u4?.();
    };
  }, [allowed]);

  // العمود الأيمن لمسار الأصناف: أصناف أودو الحاليّة (قراءة عبر نفس مسار الإنتاج).
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

  const onPushPO = (docObj) =>
    run(`po-${docObj.id}`, async () => {
      await pushPurchaseOrder(docObj, me);
      flash(`دُفع أمر الشراء ${docObj.number || ''} إلى أودو مسوّدةً`, 'success');
    });

  const onApprove = (rec) =>
    run(`ap-${rec.id}`, async () => {
      await approveInOdoo(rec, me);
      flash(`اعتُمد ${rec.sourceNumber || 'الأمر'} في أودو — أصبح مؤكّدًا`, 'success');
    });

  const onPushGrn = (docObj) =>
    run(`grn-${docObj.id}`, async () => {
      await pushGoodsReceipt(docObj, me);
      flash(`دُفعت مذكرة الاستلام ${docObj.number || ''} إلى أودو مسوّدةً`, 'success');
    });

  const onValidateReceipt = (rec) =>
    run(`vr-${rec.id}`, async () => {
      await validateReceiptInOdoo(rec, me);
      flash(`صُدّق الاستلام ${rec.sourceNumber || rec.title || ''} في أودو — منجَز`, 'success');
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

  if (!ready) return <div className="text-ink-2 text-sm p-6">…جارٍ التحميل</div>;
  if (!allowed)
    return (
      <div className="rounded-lg border border-line bg-chip p-6 text-ink-2 text-sm">
        هذه الصفحة للمديرين. سجّل الدخول بحسابٍ مخوّل لرؤية جسر المزامنة.
      </div>
    );

  const poMirror = syncState.filter((r) => r.sourceType === 'PO');
  const grnMirror = syncState.filter((r) => r.sourceType === 'GRN');
  const pushedPO = new Set(poMirror.map((r) => r.sourceId));
  const pushedGRN = new Set(grnMirror.map((r) => r.sourceId).filter(Boolean));
  const linkedItems = new Set(syncState.filter((r) => r.sourceType === 'item').map((r) => r.sourceId));

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
            أودو: <b>مسوّدة (draft)</b> ← <span style={{ color: '#1e7e34' }}><b>اعتماد ⇒ مؤكّد (purchase)</b></span>
          </span>
          <span className="text-ink-2">
            · تأكيد الأمر <b>يجدول استلامًا واردًا تلقائيًّا</b> (WH/IN) يبقى حتى «تصديق» ⇒ <b>منجَز</b>
          </span>
          <span className="text-ink-2">— لا شيء يصبح مؤكّدًا في أودو إلّا باعتمادٍ صريح.</span>
        </div>
      </div>

      {/* مبدّل المسار */}
      <div className="flex gap-2 mb-4">
        {[
          { id: 'PO', label: 'أوامر الشراء', icon: <IconDoc width={15} height={15} /> },
          { id: 'GRN', label: 'الاستلام (GRN)', icon: <IconDoc width={15} height={15} /> },
          { id: 'item', label: 'ماستر الأصناف', icon: <IconBox width={15} height={15} /> },
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
      </div>

      {/* الجسر ثلاثيّ الأعمدة */}
      {msg && (
        <div className="mb-3 rounded-lg px-4 py-2 text-sm font-medium border" style={{ ...TONE[msg.tone === 'ok' ? 'success' : msg.tone] }}>
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
        {/* ── العمود ١: البوابة ── */}
        <section className="rounded-xl border border-line bg-surface p-4">
          {track === 'PO' ? (
            <>
              <ColumnHead
                icon={<IconDoc />}
                title="البوابة — أوامر الشراء"
                sub={`${pos.length} أمر شراء حقيقيّ`}
                tone={TONE.muted}
              />
              {pos.length === 0 && <p className="text-xs text-ink-2">لا توجد أوامر شراء بعد. أنشئ واحدًا من صفحة المستندات.</p>}
              {pos.map((d) => {
                const pushed = pushedPO.has(d.id);
                return (
                  <Card key={d.id}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-ink text-sm truncate">{d.number || 'مسودة'}</div>
                        <div className="text-[11px] text-ink-2 truncate">{d.header?.supplier || '—'}</div>
                      </div>
                      <Badge tone={d.state === 'approved' || d.state === 'done' ? 'success' : 'muted'}>
                        {PORTAL_STATE[d.state] || d.state}
                      </Badge>
                    </div>
                    <div className="mt-2">
                      {pushed ? (
                        <Badge tone="success">
                          <IconCheck width={12} height={12} /> مرتبط بأودو
                        </Badge>
                      ) : (
                        <button
                          type="button"
                          className={btnPrimary}
                          style={primaryStyle}
                          disabled={busy === `po-${d.id}`}
                          onClick={() => onPushPO(d)}
                        >
                          <IconArrow width={14} height={14} />
                          {busy === `po-${d.id}` ? '…' : 'ادفع إلى أودو'}
                        </button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </>
          ) : track === 'GRN' ? (
            <>
              <ColumnHead
                icon={<IconDoc />}
                title="البوابة — مذكرات الاستلام"
                sub={`${grns.length} مذكرة استلام حقيقيّة`}
                tone={TONE.muted}
              />
              {grns.length === 0 && <p className="text-xs text-ink-2">لا توجد مذكرات استلام بعد. أنشئ واحدة من صفحة المستندات.</p>}
              {grns.map((d) => {
                const pushed = pushedGRN.has(d.id);
                return (
                  <Card key={d.id}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-ink text-sm truncate">{d.number || 'مسودة'}</div>
                        <div className="text-[11px] text-ink-2 truncate">
                          {d.header?.supplier || '—'}{d.header?.poRef ? ` · مرجع ${d.header.poRef}` : ''}
                        </div>
                      </div>
                      <Badge tone={d.state === 'approved' || d.state === 'done' ? 'success' : 'muted'}>
                        {PORTAL_STATE[d.state] || d.state}
                      </Badge>
                    </div>
                    <div className="mt-2">
                      {pushed ? (
                        <Badge tone="success">
                          <IconCheck width={12} height={12} /> مرتبط بأودو
                        </Badge>
                      ) : (
                        <button
                          type="button"
                          className={btnPrimary}
                          style={primaryStyle}
                          disabled={busy === `grn-${d.id}`}
                          onClick={() => onPushGrn(d)}
                        >
                          <IconArrow width={14} height={14} />
                          {busy === `grn-${d.id}` ? '…' : 'ادفع إلى أودو'}
                        </button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </>
          ) : (
            <>
              <ColumnHead icon={<IconBox />} title="البوابة — ماستر الأصناف" sub={`${items.length} صنف`} tone={TONE.muted} />
              {items.slice(0, 40).map((it) => (
                <Card key={it.sku}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-ink text-sm truncate">{it.nameAr}</div>
                      <div className="text-[11px] text-ink-2 ltr:text-left" style={{ direction: 'ltr' }}>{it.sku}</div>
                    </div>
                    {linkedItems.has(it.sku) || it.odooId ? (
                      <Badge tone="success">
                        <IconCheck width={12} height={12} /> مرتبط
                      </Badge>
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
          )}
        </section>

        {/* ── العمود ٢: الجسر ── */}
        <section className="rounded-xl border border-line bg-chip p-4 flex flex-col items-center justify-center gap-3 lg:w-[190px]">
          <span className="w-12 h-12 rounded-full grid place-items-center text-white" style={primaryStyle}>
            <IconSync width={24} height={24} />
          </span>
          <div className="text-center text-[12px] text-ink-2 leading-relaxed">
            التحويل عبر <b className="text-ink">odooMapper</b>
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
          <div className="text-center text-[11px] text-ink-2">
            {track === 'PO'
              ? `${poMirror.length} مدفوع`
              : track === 'GRN'
                ? `${grnMirror.length} استلام في أودو`
                : `${odooProducts.length} صنف في أودو`}
          </div>
        </section>

        {/* ── العمود ٣: أودو (المرآة) ── */}
        <section className="rounded-xl border border-line bg-surface p-4">
          {track === 'PO' ? (
            <>
              <ColumnHead icon={<IconDoc />} title="أودو — أوامر الشراء" sub={`${poMirror.length} مسجَّل`} tone={TONE.success} />
              {poMirror.length === 0 && <p className="text-xs text-ink-2">لا شيء بعد — ادفع أمرًا من البوابة ليظهر هنا مسوّدةً.</p>}
              {poMirror.map((r) => (
                <Card key={r.id}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-ink text-sm truncate">{r.sourceNumber || `#${r.odooId}`}</div>
                      <div className="text-[11px] text-ink-2 truncate">{r.supplier || '—'}</div>
                    </div>
                    <OdooStateBadge state={r.odooState} />
                  </div>
                  <div className="text-[11px] text-ink-2 mt-1">
                    {r.lineCount || 0} بند · {(r.amountTotal || 0).toLocaleString('ar-LY')} د.ل
                  </div>
                  {r.odooState === 'draft' && (
                    <div className="mt-2">
                      <button
                        type="button"
                        className={btnPrimary}
                        style={primaryStyle}
                        disabled={busy === `ap-${r.id}`}
                        onClick={() => onApprove(r)}
                      >
                        <IconCheck width={14} height={14} />
                        {busy === `ap-${r.id}` ? '…' : 'اعتمد في أودو'}
                      </button>
                    </div>
                  )}
                </Card>
              ))}
            </>
          ) : track === 'GRN' ? (
            <>
              <ColumnHead icon={<IconDoc />} title="أودو — الاستلامات الواردة" sub={`${grnMirror.length} مسجَّل`} tone={TONE.success} />
              {grnMirror.length === 0 && (
                <p className="text-xs text-ink-2">
                  لا شيء بعد — اعتمد أمر شراءٍ (يجدول أودو استلامًا تلقائيًّا) أو ادفع مذكرة استلامٍ من البوابة.
                </p>
              )}
              {grnMirror.map((r) => (
                <Card key={r.id}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-ink text-sm truncate">{r.sourceNumber || r.title || `#${r.odooId}`}</div>
                      <div className="text-[11px] text-ink-2 truncate">
                        {r.supplier || '—'}{r.poNumber ? ` · أمر ${r.poNumber}` : ''}
                      </div>
                    </div>
                    <PickingStateBadge state={r.odooState} />
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-ink-2">
                    {r.autoCreated ? (
                      <Badge tone="muted">أنشأه أودو تلقائيًّا عند تأكيد الأمر</Badge>
                    ) : (
                      <span>{r.lineCount || 0} بند · {(r.totalReceived || 0).toLocaleString('ar-LY')} وحدة مستلمة</span>
                    )}
                  </div>
                  {r.odooState !== 'done' && (
                    <div className="mt-2">
                      <button
                        type="button"
                        className={btnPrimary}
                        style={primaryStyle}
                        disabled={busy === `vr-${r.id}`}
                        onClick={() => onValidateReceipt(r)}
                      >
                        <IconCheck width={14} height={14} />
                        {busy === `vr-${r.id}` ? '…' : 'صدّق الاستلام'}
                      </button>
                    </div>
                  )}
                </Card>
              ))}
            </>
          ) : (
            <>
              <ColumnHead icon={<IconBox />} title="أودو — الأصناف" sub={`${odooProducts.length} صنف`} tone={TONE.success} />
              {odooProducts.length === 0 && <p className="text-xs text-ink-2">لا أصناف — استخدم «اسحب» أو «ادفع».</p>}
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
    <div className="absolute left-0 mt-2 w-80 max-h-96 overflow-auto rounded-lg border border-line bg-surface shadow-xl z-50 p-3" style={{ background: 'var(--surface,#fff)' }}>
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
