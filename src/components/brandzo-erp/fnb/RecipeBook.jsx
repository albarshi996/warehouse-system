import { useEffect, useMemo, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import { subscribeItems } from '../../../services/items/itemService.js';
import { normalizeItemCode } from '../../../services/items/itemIdentity.js';
import { baseUomOf } from '../../../services/items/uomModel.js';
import {
  explodeRecipe,
  indexRecipes,
  recipeId,
  recipeProblems,
  shapeRecipe,
  unlinkedSaleItems,
} from '../../../services/items/recipe.js';
import {
  listenRecipes,
  saveRecipeVersion,
  setRecipeActive,
} from '../../../services/items/recipesService.js';

/**
 * دفتر الوصفات ‹FNB-501› — أوّل شاشات قطاع الأغذية.
 *
 * ═══ لماذا هي الأولى؟ ═══
 * ثلاثَ عشرةَ قدرةً لقطاع الأغذية مبنيّةً ومختبَرةً وبلا شاشةٍ واحدة. والوصفة
 * أساسُها جميعًا: الإنتاج **يفجّرها** ليعرف ما يصرف، وتكلفةُ الطعام تُحسب
 * منها، وتخصيصُ المنتَج على الفروع يحتاجها. فبناءُ غيرها قبلها بناءٌ على فراغ.
 *
 * ═══ ولا منطقَ هنا ═══
 * التحقّق في `recipeProblems`، والتفجير في `explodeRecipe`، والترقيم والحفظ في
 * `recipesService` — وكلّها مبنيّةٌ ومختبَرةٌ من قبل. هذه الشاشة **عرضٌ وتفاعل**.
 *
 * ═══ نسخٌ لا تعديل ═══
 * الوصفة لا تُكتب فوق نسخةٍ قائمة: كلّ حفظٍ نسخةٌ جديدة برقمٍ أعلى تشير إلى
 * سابقتها، والقديمة تبقى لتفسير استهلاكِ أيّامها. فتقريرُ شهرٍ مضى يُقرأ
 * بوصفة ذلك الشهر لا بوصفة اليوم.
 */

const CAN_EDIT = new Set(['admin', 'warehouse_manager', 'fnb_manager', 'executive_chef']);
const num = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(Number(n) || 0);
const today = () => new Date().toISOString().slice(0, 10);

const EMPTY = { outputSku: '', nameAr: '', effectiveFrom: today(), yieldQty: 1, lines: [{ sku: '', qty: '', uom: '', note: '' }] };

export default function RecipeBook() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [recipes, setRecipes] = useState([]);
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [openSku, setOpenSku] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      if (!user) { setReady(true); return; }
      setMe(await fetchUserProfile(user));
      setReady(true);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!me) return undefined;
    const a = listenRecipes(setRecipes, (e) => setError(e?.message || 'تعذّرت قراءة الوصفات.'));
    const b = subscribeItems(setItems, (e) => setError(e?.message || 'تعذّرت قراءة الأصناف.'));
    return () => { a?.(); b?.(); };
  }, [me]);

  const itemsBySku = useMemo(() => {
    const m = new Map();
    for (const it of items) m.set(normalizeItemCode(it.sku), it);
    return m;
  }, [items]);

  const index = useMemo(() => indexRecipes(recipes), [recipes]);

  /** أحدث نسخةٍ لكلّ مخرَج — هي ما يُعرض في القائمة. */
  const latest = useMemo(() => {
    const rows = [];
    for (const [sku, versions] of index) {
      const head = versions[0];
      rows.push({ sku, head, versions, item: itemsBySku.get(sku) || null });
    }
    rows.sort((a, b) => a.sku.localeCompare(b.sku));
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => `${r.sku} ${r.head?.nameAr || ''}`.toLowerCase().includes(q)) : rows;
  }, [index, itemsBySku, search]);

  /** أصنافٌ تُباع ولا وصفةَ لها — فجوةٌ تُعلَن ولا تُخفى. */
  const unlinked = useMemo(() => unlinkedSaleItems(index, items), [index, items]);

  const problems = useMemo(
    () => (draft ? recipeProblems(draft, itemsBySku) : []),
    [draft, itemsBySku]
  );

  const explosion = useMemo(() => {
    if (!openSku) return null;
    try {
      return explodeRecipe(index, itemsBySku, openSku, 1);
    } catch {
      return null;
    }
  }, [openSku, index, itemsBySku]);

  async function save() {
    if (problems.length) return;
    setBusy('يحفظ نسخةً جديدة…'); setError(''); setFlash('');
    try {
      const shaped = shapeRecipe(draft);
      await saveRecipeVersion(draft, recipes, itemsBySku, me);
      setFlash(`حُفظت وصفة «${shaped.outputSku}» نسخةً جديدة.`);
      setDraft(null);
    } catch (err) {
      setError(err?.message || 'تعذّر الحفظ.');
    } finally {
      setBusy('');
    }
  }

  async function toggleActive(rec) {
    setBusy('…'); setError('');
    try {
      // ⚠ `indexRecipes` يمرّر النسخ عبر `shapeRecipe` فيسقط `id` — والمعرّف
      // يُبنى من الوصفة نفسها (`outputSku@vN`) وهو عين معرّف المستند.
      await setRecipeActive(recipeId(rec), !rec.active, me);
    } catch (err) {
      setError(err?.message || 'تعذّر التغيير.');
    } finally {
      setBusy('');
    }
  }

  if (!ready) return <Notice>يقرأ…</Notice>;
  if (!me) return <Notice>افتح الصفحة بعد تسجيل الدخول.</Notice>;
  const canEdit = CAN_EDIT.has(me.role);

  return (
    <div dir="rtl" className="o_theme space-y-6">
      {/* ═══ الطبقة ١ — ما يحتاج انتباهًا ═══ */}
      {unlinked.length > 0 && (
        <section className="o_ds o_ds_card o_ds_pad border border-brand-red/40 bg-brand-red/5">
          <div className="flex items-start gap-2.5">
            <Icon name="alertTriangle" size={16} className="text-brand-red mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="font-bold text-ink text-sm mb-1">{num(unlinked.length)} صنفًا يُباع بلا وصفة</div>
              <div className="text-xs text-ink-2 leading-relaxed">
                بلا وصفةٍ لا يُعرف ما يُصرف عند بيعه، ولا تُحسب تكلفته الحقيقيّة:{' '}
                <span className="font-mono text-[11px]">{unlinked.slice(0, 12).join(' · ')}</span>
                {unlinked.length > 12 && ` وغيرها (${num(unlinked.length - 12)})`}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ═══ الطبقة ٢ — إجراء ═══ */}
      <section className="o_ds o_ds_card o_ds_pad flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <div className="font-bold text-ink">{num(latest.length)} وصفة · {num(recipes.length)} نسخة</div>
          <div className="text-xs text-muted">
            الوصفة لا تُعدَّل: كلّ حفظٍ نسخةٌ جديدة، والقديمة تبقى لتفسير استهلاك أيّامها.
          </div>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالكود أو الاسم…"
          className="bg-surface border border-line rounded-xl text-ink text-sm px-3 py-2 focus:outline-none focus:border-accent/50"
        />
        {canEdit && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => { setDraft({ ...EMPTY }); setFlash(''); }} disabled={!!busy}>
            وصفة جديدة
          </button>
        )}
      </section>

      {busy && <div className="text-xs text-accent font-bold">{busy}</div>}
      {flash && <div className="rounded-xl border border-accent/40 bg-accent/5 text-sm p-3 text-ink-2">{flash}</div>}
      {error && <div className="rounded-xl border border-brand-red/40 bg-brand-red/5 text-brand-red text-sm p-3">{error}</div>}

      {/* ═══ المحرّر ═══ */}
      {draft && (
        <section className="o_ds o_ds_card o_ds_pad space-y-4">
          <div className="flex items-center gap-2">
            <Icon name="notebook" size={16} className="text-accent" />
            <h3 className="font-bold text-ink">نسخة جديدة</h3>
            <div className="flex-1" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft(null)}>إلغاء</button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="الصنف المخرَج (SKU)">
              <input list="recipe-skus" className={INPUT} value={draft.outputSku}
                onChange={(e) => setDraft({ ...draft, outputSku: e.target.value })} />
            </Field>
            <Field label="الاسم">
              <input className={INPUT} value={draft.nameAr} onChange={(e) => setDraft({ ...draft, nameAr: e.target.value })} />
            </Field>
            <Field label="تاريخ السريان">
              <input type="date" className={INPUT} value={draft.effectiveFrom}
                onChange={(e) => setDraft({ ...draft, effectiveFrom: e.target.value })} />
            </Field>
            <Field label="كمّيّة الناتج">
              <input type="number" min="0" step="any" className={INPUT} value={draft.yieldQty}
                onChange={(e) => setDraft({ ...draft, yieldQty: e.target.value })} />
            </Field>
          </div>

          <datalist id="recipe-skus">
            {items.slice(0, 2000).map((it) => (
              <option key={it.sku} value={it.sku}>{it.nameAr || ''}</option>
            ))}
          </datalist>

          <div>
            <div className="text-xs font-bold text-ink-2 mb-2">المكوّنات</div>
            <div className="space-y-2">
              {draft.lines.map((l, i) => (
                <div key={i} className="flex flex-wrap gap-2 items-center">
                  <input list="recipe-skus" placeholder="كود المكوّن" className={`${INPUT} flex-1 min-w-[140px]`} value={l.sku}
                    onChange={(e) => setLine(setDraft, draft, i, { sku: e.target.value })} />
                  <input type="number" min="0" step="any" placeholder="الكمّيّة" className={`${INPUT} w-24`} value={l.qty}
                    onChange={(e) => setLine(setDraft, draft, i, { qty: e.target.value })} />
                  <input placeholder="الوحدة" className={`${INPUT} w-24`} value={l.uom}
                    onChange={(e) => setLine(setDraft, draft, i, { uom: e.target.value })} />
                  <span className="text-[10px] text-muted w-20 truncate">
                    {itemsBySku.get(normalizeItemCode(l.sku))?.nameAr || ''}
                  </span>
                  <button type="button" className="text-muted hover:text-brand-red text-sm px-2"
                    onClick={() => setDraft({ ...draft, lines: draft.lines.filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-secondary btn-sm mt-2"
              onClick={() => setDraft({ ...draft, lines: [...draft.lines, { sku: '', qty: '', uom: '', note: '' }] })}>
              أضف مكوّنًا
            </button>
          </div>

          {problems.length > 0 && (
            <div className="rounded-lg border border-brand-red/40 bg-brand-red/5 p-3">
              <div className="text-xs font-bold text-brand-red mb-1.5">لا تُحفظ قبل إصلاح هذه:</div>
              <ul className="text-xs text-ink-2 space-y-1 list-none p-0">
                {problems.map((p, i) => <li key={i}>• {p}</li>)}
              </ul>
            </div>
          )}

          <button type="button" className="btn btn-primary btn-sm" disabled={!!busy || problems.length > 0} onClick={save}>
            احفظ نسخةً جديدة
          </button>
        </section>
      )}

      {/* ═══ الطبقة ٣ — الدفتر ═══ */}
      <section className="o_ds o_ds_card">
        {latest.length === 0 ? (
          <div className="p-8 text-center text-muted text-sm">
            لا وصفةَ بعد. {canEdit ? 'ابدأ بواحدة — الإنتاج وتكلفة الطعام يُبنيان عليها.' : ''}
          </div>
        ) : (
          <div className="divide-y divide-line">
            {latest.map(({ sku, head, versions, item }) => (
              <div key={sku} className="p-3.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <button type="button" onClick={() => setOpenSku(openSku === sku ? '' : sku)}
                    className="flex items-center gap-2 flex-1 min-w-[200px] text-right">
                    <Icon name={openSku === sku ? 'chevronLeft' : 'chevronRight'} size={14} className="text-muted shrink-0" />
                    <span className="min-w-0">
                      <span className="block font-bold text-ink text-sm truncate">
                        {head.nameAr || item?.nameAr || sku}
                      </span>
                      <span className="block text-[11px] text-muted font-mono">{sku}</span>
                    </span>
                  </button>
                  <Tag>نسخة {num(head.version)}</Tag>
                  <Tag>{num(head.lines.length)} مكوّنًا</Tag>
                  <Tag>ناتج {num(head.yieldQty)} {baseUomOf(item) || ''}</Tag>
                  <Tag>من {head.effectiveFrom || '—'}</Tag>
                  {!head.active && <Tag tone="red">معطّلة</Tag>}
                  {versions.length > 1 && <Tag>{num(versions.length)} نسخ</Tag>}
                  {canEdit && (
                    <>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy}
                        onClick={() => setDraft({ ...head, effectiveFrom: today() })}>نسخة جديدة</button>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy}
                        onClick={() => toggleActive(head)}>{head.active ? 'عطّل' : 'فعّل'}</button>
                    </>
                  )}
                </div>

                {openSku === sku && (
                  <div className="mt-3 pt-3 border-t border-line">
                    <div className="text-[11px] font-bold text-ink-2 mb-2">
                      المكوّنات النهائيّة لوحدةٍ واحدة {explosion?.problems?.length ? '(بعد التفجير)' : ''}
                    </div>
                    {explosion?.lines?.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-muted border-b border-line">
                              <th className="px-2 py-1.5 text-right font-bold">المكوّن</th>
                              <th className="px-2 py-1.5 text-right font-bold">الاسم</th>
                              <th className="px-2 py-1.5 text-left font-bold">الكمّيّة</th>
                              <th className="px-2 py-1.5 text-right font-bold">الوحدة</th>
                            </tr>
                          </thead>
                          <tbody>
                            {explosion.lines.map((l) => (
                              <tr key={l.sku} className="border-b border-line/50">
                                <td className="px-2 py-1.5 font-mono">{l.sku}</td>
                                <td className="px-2 py-1.5 text-ink-2">{itemsBySku.get(l.sku)?.nameAr || ''}</td>
                                <td className="px-2 py-1.5 text-left font-mono">{num(l.qty)}</td>
                                <td className="px-2 py-1.5">{l.uom || baseUomOf(itemsBySku.get(l.sku)) || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-xs text-muted">تعذّر التفجير — راجع مكوّنات الوصفة ووحداتها.</div>
                    )}
                    {explosion?.problems?.length > 0 && (
                      <ul className="mt-2 text-[11px] text-brand-red space-y-0.5 list-none p-0">
                        {explosion.problems.map((p, i) => <li key={i}>• {p}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const INPUT = 'bg-surface border border-line rounded-lg text-ink text-sm px-2.5 py-1.5 focus:outline-none focus:border-accent/50';

function setLine(set, draft, i, patch) {
  set({ ...draft, lines: draft.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold text-ink-2 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Tag({ children, tone }) {
  return (
    <span className={`text-[10px] font-bold rounded-chip px-2 py-0.5 border ${
      tone === 'red' ? 'border-brand-red/40 text-brand-red bg-brand-red/5' : 'border-line text-muted bg-chip'
    }`}>{children}</span>
  );
}

function Notice({ children }) {
  return (
    <div className="o_theme" dir="rtl">
      <div className="o_ds o_ds_card o_ds_pad text-center text-muted text-sm">{children}</div>
    </div>
  );
}
