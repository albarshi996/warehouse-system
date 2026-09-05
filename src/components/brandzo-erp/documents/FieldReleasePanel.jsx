/**
 * «أطلق للميدان» ‹JR-801› — السلكُ بين المستند المعتمَد وشاشة العامل.
 *
 * ═══ العطبُ الذي تسدّه ═══
 * `releaseDocumentTasks` مبنيّةٌ منذ ‹EXE-104›، وهي **الدالّة الوحيدة** التي
 * تحوّل مستندًا معتمَدًا إلى صفوفِ `labor_tasks` تحمل `docRef {type,number,id}`
 * — وهو الحقلُ الذي يصل الاتّجاهين معًا: من المستند إلى العمل، ومن العمل إلى
 * مستنده. و«مهامي» تقرأ `labor_tasks` أصلًا. فالطرفان مبنيّان **والسلكُ كان
 * مفقودًا**: لا مستدعيَ للدالّة في الشجرة كلّها.
 *
 * وهذا نمطُ «مبنيٌّ ومنشورٌ وبلا مستدعٍ» — لا يشتكي منه اختبارٌ ولا لينت، لأنّ
 * الكود سليمٌ تمامًا؛ يبقى المشرفُ يفتح مستندًا معتمَدًا ولا يجد طريقًا إلى
 * الميدان، فيُنشئ مهمّةً بيده من اللوحة الإداريّة **بلا بنود**.
 *
 * ═══ ولماذا لوحةٌ مستقلّةٌ لا زرٌّ في `ChainBar` ═══
 * `ChainBar` يشتقّ **مستندًا من مستند**: التزامٌ ورقيٌّ يلد التزامًا. وهذه
 * تُطلق **عملًا إلى رجلٍ يمشي إلى رفّ**. ومعنيان تحت عنوانٍ واحدٍ يُربكان
 * المشغّل: يضغط ظانًّا أنّه أنشأ ورقةً وقد أسند عملًا لفريقٍ في الوردية.
 *
 * ═══ والشاشةُ تعرض ولا تشتقّ ═══
 * كلُّ رقمٍ هنا مخرَجُ `generateTasks` الخالصة المختبَرة: كم مهمّةً · بأيّ
 * مناطق · كم بندًا لكلٍّ · ما النقص · ما أُطلق سلفًا. ولا يُعاد بناء سطرٍ
 * منها هنا — ولو أُعيد لصار للقرار عقلان يفترقان أوّل تعديل.
 */
import { useEffect, useMemo, useState } from 'react';
import { getBasePath } from '../../../services/auth/authService.js';
import { listenBalances } from '../../../services/balances/balancesService.js';
import { listenCrews } from '../../../services/labor/crewsService.js';
import { canReleaseTasks } from '../../../services/labor/laborRoles.js';
import { taskState } from '../../../services/labor/laborModel.js';
import { listenLaborTasks, releaseDocumentTasks } from '../../../services/labor/laborTasksService.js';
import { canDeriveFrom } from '../../../services/documents/states.js';
import { generateTasks, workTypeForDoc } from '../../../services/tasks/taskFactory.js';
import { WORK_TYPES } from '../../../services/tasks/taskShape.js';

const muted = { fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' };

/**
 * منطقةُ مفتاحِ مهمّةٍ مولَّدة — المفتاح `نوع::رقم::منطقة` كما يبنيه
 * `taskKey`. و`ALL` هي المنطقةُ الفارغة (موقعٌ مفتوح بلا كودٍ يُقرأ).
 *
 * ★ ولماذا يُقرأ المفتاحُ بدل قراءة المهمّة نفسها؟ لأنّ `skipped` يُعيد
 * مفاتيحَ لا مهامَّ — وهي الحقيقةُ التي بنى عليها المصنعُ حكمَه بالتخطّي.
 */
function groupOfKey(key) {
  const group = String(key || '').split('::')[2] || '';
  return !group || group === 'ALL' ? 'بلا منطقة' : group;
}

export default function FieldReleasePanel({ doc, me, items = [], locations = [], onFlash }) {
  const workType = workTypeForDoc(doc?.type);

  /**
   * ★★★ حارسُ الظهور — والسؤالُ هنا ليس «أتملك هذه العمليّة؟».
   *
   * `uiGate` تجيب عن الملكيّة وتُمرّر المجهولَ عمدًا (منعٌ بُني على جهلٍ
   * بالهويّة أسوأ من سماحٍ يردّه الخادم). والسؤالُ الذي يقرّر ظهورَ **هذا**
   * الزرّ أضيقُ منه: «أيقبل الخادمُ كتابتي في `labor_tasks`؟» — والقاعدةُ
   * تحكمها بـ`isLaborWriter()`: ثلاثةُ أدوارٍ لا أكثر.
   *
   * فمشرفُ المستندات يرى الزرَّ ويضغطه ويرتدّ عملُه بـ`permission-denied`
   * بعد أن أعلن للفريق أنّ الشحنة أُسندت. **والزرُّ الظاهرُ يجب أن يكون
   * الزرَّ الذي ينجح.**
   */
  const active =
    Boolean(doc?.id) && Boolean(workType) && canDeriveFrom(doc?.state) && canReleaseTasks(me?.role);

  const [crews, setCrews] = useState([]);
  const [crewId, setCrewId] = useState('');
  const [laborTasks, setLaborTasks] = useState([]);
  /**
   * ★★★ `null` تعني «لم تُقرأ بعد» لا «فارغة».
   *
   * وبينهما فرقٌ يكذب: `pickPlan` بلا أرصدةٍ يُعلن **كلّ** بندٍ ناقصًا. فلو
   * بدأت القائمةُ فارغةً لَرأى المشرفُ لوحةً حمراء تقول إنّ الشحنة كلَّها
   * مفقودة، ثمّ تصحّح نفسَها بعد جزءٍ من الثانية. والتجربةُ الجافّة تَعِد
   * بالحقيقة — فتُؤجَّل حتّى تُقاس، ولا تُخمَّن ثمّ تُعتذَر.
   */
  const [balances, setBalances] = useState(null);
  const [balancesProblem, setBalancesProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [released, setReleased] = useState(null);

  // لا اشتراكَ قبل أن تُعرَض اللوحة: مستندٌ لا يولّد عملًا (فاتورةٌ · تصريح)
  // لا يقرأ مجموعتين كاملتين من السحابة لأجل لوحةٍ لن تظهر.
  useEffect(() => {
    if (!active) return undefined;
    const stopCrews = listenCrews(setCrews, () => setCrews([]));
    const stopTasks = listenLaborTasks(setLaborTasks, () => setLaborTasks([]));
    return () => {
      stopCrews?.();
      stopTasks?.();
    };
  }, [active]);

  // الأرصدة تلزم السحبَ (ترتيب FEFO) والتخزينَ (الرفّ الذي فيه الصنفُ نفسه)
  // — والنقلُ الداخليّ طرفاه من رأس المستند، فلا تُقرأ له مجموعةٌ كاملة.
  useEffect(() => {
    if (!active) return undefined;
    if (workType === 'transfer') {
      setBalances([]);
      return undefined;
    }
    const stop = listenBalances(
      (list) => {
        setBalances(list);
        setBalancesProblem('');
      },
      // ⚠️ والفشلُ يُعلَن ولا يُبتلع: قائمةٌ فارغةٌ صامتة تُنتج «نقصًا» كاذبًا
      // في كلّ بند، فيُلغي المشرفُ إطلاقًا صحيحًا ظنًّا أنّ المخزن خالٍ.
      (e) => {
        setBalances([]);
        setBalancesProblem(e?.message || 'تعذّرت قراءة الأرصدة.');
      }
    );
    return () => stop?.();
  }, [active, workType]);

  /** مهامُّ هذا المستند القائمة — الرابطُ `docRef.id` وهو ما يصل الاتّجاهين. */
  const existing = useMemo(
    () => (laborTasks || []).filter((t) => t?.docRef?.id && t.docRef.id === doc?.id),
    [laborTasks, doc?.id]
  );

  /**
   * ★★★ التجربةُ الجافّة — **نداءُ `generateTasks` نفسِه الذي سيقع**.
   *
   * ولذلك بالذات وُجد `advice` خارج الحمولة المخزَّنة: بُني لهذه الشاشة
   * بعينها كي يرى المشرفُ الرفوفَ المرشّحة وأسبابَ تعذّرها **قبل** أن يُسند
   * العمل، لا بعد أن يقف العاملُ أمام الرفّ.
   *
   * ★★ والوقتُ يُقرأ مرّةً ويُمرَّر مرّتين (هنا وعند الضغط): لو قُرئ ثانيةً
   * لجاز أن يرشّح FEFO تشغيلةً غير التي عُرضت — ووعدٌ يُخلَف مرّةً لا
   * يُصدَّق بعدها.
   */
  const dry = useMemo(() => {
    if (!active || balances === null) return null;
    const opts = { balances, locations, items, nowMs: Date.now() };
    const existingKeys = existing.map((t) => t?.workKey).filter(Boolean);
    return { opts, existingKeys, ...generateTasks(doc, { ...opts, existingKeys }) };
  }, [active, doc, balances, locations, items, existing]);

  const activeCrews = useMemo(() => crews.filter((c) => c?.active !== false), [crews]);

  async function release() {
    if (!dry || busy || !crewId || dry.problem || !dry.tasks.length) return;
    setBusy(true);
    try {
      // ★ نفسُ الخيارات التي بُنيت عليها المعاينة — و`existing` يمرّ كما هو
      // فتشتقّ الخدمةُ منه مفاتيحَها ولا يُبنى للتخطّي حاسبٌ ثانٍ.
      const result = await releaseDocumentTasks(doc, { crewId, existing, ...dry.opts }, me);
      setReleased({ created: result.created.length, skipped: result.skipped.length });
      onFlash?.(`أُطلقت ${result.created.length} مهمّةً للميدان.`);
    } catch (e) {
      onFlash?.(e?.message || 'تعذّر إطلاق المهامّ.', 'err');
    } finally {
      setBusy(false);
    }
  }

  // ★ الصمتُ لا الاعتذار: مسؤولُ المشتريات يفتح عشرات المستندات، ولافتةُ «لا
  // تملك الإطلاق» على كلٍّ منها ضجيجٌ لا يُفيده — ومن يملكها يراها.
  if (!active) return null;

  const label = WORK_TYPES[workType]?.label || 'عمل ميدانيّ';
  const tasks = dry?.tasks || [];
  const shortages = dry?.shortages || [];
  const skipped = dry?.skipped || [];
  const problem = dry?.problem || '';
  /** أسبابُ تعذّر الاقتراح — بلا تكرار: سببٌ واحدٌ مكرّرٌ عشرين مرّةً لا يُقرأ. */
  const adviceProblems = [
    ...new Set(tasks.flatMap((t) => (t.advice || []).map((a) => a.problem).filter(Boolean))),
  ];
  /** ⚠️ مهامُّ هذا المستند التي أُنشئت يدويًّا: بلا `workKey` فلا تمنع تكرارًا. */
  const handmade = existing.filter((t) => !t?.workKey);

  return (
    <section className="o_theme" aria-label="إطلاق مهامّ الميدان">
      <div className="o_ds" style={{ display: 'grid', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 'var(--o-font-size-base)', fontWeight: 'var(--o-font-weight-bold)' }}>
            أطلق للميدان — {label}
          </h3>
          <p style={{ margin: '4px 0 0', ...muted }}>
            ليس اشتقاقَ مستندٍ من مستند: هنا يصير المستندُ المعتمَد عملًا مُسنَدًا إلى فريق،
            ويظهر في «مهامي» على جهاز العامل ببنوده ورفوفه المقترحة.
          </p>
        </div>

        {!dry ? (
          <p style={{ margin: 0, ...muted }}>جارٍ قياسُ ما سيقع — تُقرأ الأرصدةُ أوّلًا…</p>
        ) : problem ? (
          /* ★ حرفيًّا كما قاله المحرّك — وإعادةُ صياغته تُخفي سببَه الحقيقيّ. */
          <div className="o_alert danger" style={{ margin: 0 }}>
            <div className="o_alert_title">لا إطلاق</div>
            <p style={{ margin: 0 }}>{problem}</p>
          </div>
        ) : (
          <>
            {balancesProblem && (
              <div className="o_alert danger" style={{ margin: 0 }}>
                <div className="o_alert_title">لم تُقرأ الأرصدة</div>
                <p style={{ margin: 0 }}>
                  {balancesProblem} — وما يُعرض أدناه محسوبٌ على رصيدِ صفر، فالنقصُ فيه مبالَغٌ فيه
                  والرفوفُ المقترحةُ ناقصة. أعِد التحميل قبل أن تُسند عملًا على قياسٍ لم يُقس.
                </p>
              </div>
            )}

            {/* ── التجربةُ الجافّة: ما سيقع بالضبط، قبل الزرّ ── */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'baseline' }}>
              <strong style={{ fontSize: 'var(--o-font-size-sm)' }}>
                {tasks.length ? `${tasks.length} مهمّةً ستُنشأ` : 'لا مهمّةَ جديدة'}
              </strong>
              {skipped.length > 0 && (
                <span style={muted}>· {skipped.length} أُطلقت سلفًا فتُترك ولا تُدهس</span>
              )}
              {tasks.length > 1 && (
                <span style={muted}>· مهمّةٌ لكلّ منطقة — عاملٌ لممرّ لا عمّالٌ يتقاطعون</span>
              )}
            </div>

            {tasks.length > 0 && (
              <div className="o_list_scroll">
                <table className="o_list_view">
                  <thead>
                    <tr>
                      <th>المنطقة</th>
                      <th>البنود</th>
                      <th>العنوان كما يقرؤه العامل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t) => (
                      <tr key={t.key}>
                        <td>{t.groupLabel}</td>
                        <td className="o_list_number">{t.work.lines.length}</td>
                        <td style={muted}>{t.title}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── النقصُ يُعلَن بالاسم: سطرٌ مفتوحٌ في المهمّة لا صمتٌ يُبتلع ── */}
            {shortages.length > 0 && (
              <div className="o_alert warning" style={{ margin: 0 }}>
                <div className="o_alert_title">{shortages.length} صنفًا بنقصٍ في الرصيد</div>
                <ul>
                  {shortages.map((s) => (
                    <li key={`${s.sku}|${s.barcode}`}>
                      {s.nameAr || s.sku || s.barcode} — ناقصٌ {s.qty}
                      {s.problem ? ` · ${s.problem}` : ''}
                    </li>
                  ))}
                </ul>
                <p style={{ margin: '6px 0 0', ...muted }}>
                  يُبنى لها سطرٌ بمصدرٍ مفتوح: العاملُ يراها ولا تختفي، وتبقى مفتوحةً لاستثناءٍ لاحق.
                </p>
              </div>
            )}

            {adviceProblems.length > 0 && (
              <div className="o_alert warning" style={{ margin: 0 }}>
                <div className="o_alert_title">تعذّر اقتراحُ الرفّ لبعض البنود</div>
                <ul>
                  {adviceProblems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
                <p style={{ margin: '6px 0 0', ...muted }}>
                  ولا يمنع الإطلاق: الوجهة تبقى مفتوحةً ويختار العاملُ الرفَّ بمسحه.
                </p>
              </div>
            )}

            {/* ── ما أُطلق سلفًا: يُترك ولا يُدهس، فلعلّ عاملًا بدأه ── */}
            {existing.length > 0 && (
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 'var(--o-font-size-sm)', fontWeight: 'var(--o-font-weight-bold)' }}>
                  مهامُّ هذا المستند القائمة ({existing.length})
                </p>
                <ul style={{ margin: 0, paddingInlineStart: '18px', ...muted }}>
                  {existing.map((t) => (
                    <li key={t.id}>
                      {t.workKey ? groupOfKey(t.workKey) : 'أُنشئت يدويًّا'} · {taskState(t.state).label} ·{' '}
                      {(t.lines || []).length} بندًا
                    </li>
                  ))}
                </ul>
                {handmade.length > 0 && (
                  <p style={{ margin: '6px 0 0', ...muted }}>
                    ⚠️ {handmade.length} منها أُنشئت يدويًّا بلا مفتاحِ عمل — فلا تحرس من التكرار،
                    راجعها بالعين قبل الإطلاق.
                  </p>
                )}
              </div>
            )}

            {/* ── الإسناد: فريقٌ لا نظام ── */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
              <label className="o_field_block" style={{ minWidth: '220px' }}>
                <span className="o_form_label" style={muted}>الفريق المنفّذ *</span>
                <select className="o_input" value={crewId} onChange={(e) => setCrewId(e.target.value)}>
                  <option value="">— اختر الفريق —</option>
                  {activeCrews.map((c) => (
                    <option key={c.id} value={c.id}>
                      فريق {c.crewNo} · {c.shift}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !crewId || !tasks.length}
                onClick={release}
              >
                {busy ? 'جارٍ الإطلاق…' : `أطلق للميدان${tasks.length ? ` — ${tasks.length} مهمّة` : ''}`}
              </button>
            </div>

            {activeCrews.length === 0 ? (
              <p style={{ margin: 0, ...muted }}>
                لا فرقَ نشطة — يُشكَّل الفريقُ من{' '}
                <a className="o_field_link" href={`${getBasePath()}/dashboard/labor-operations`}>
                  لوحة عمالة الشحن والتفريغ
                </a>
                . والمهمّةُ تُسنَد إلى فريقٍ لا إلى النظام.
              </p>
            ) : (
              !crewId && (
                <p style={{ margin: 0, ...muted }}>
                  اختر الفريقَ أوّلًا — المهمّةُ بلا منفّذٍ إعلانٌ لا إسناد.
                </p>
              )
            )}

            {tasks.length === 0 && skipped.length > 0 && (
              <p style={{ margin: 0, ...muted }}>
                كلُّ مناطق هذا المستند أُطلقت سلفًا — ولا تُنشأ نسخةٌ ثانية.
              </p>
            )}
          </>
        )}

        {released && (
          <div className="o_alert success" style={{ margin: 0 }}>
            أُطلقت {released.created} مهمّةً
            {released.skipped > 0 ? ` · وتُركت ${released.skipped} أُطلقت سلفًا` : ''} —{' '}
            <a className="o_field_link" href={`${getBasePath()}/dashboard/my-tasks`}>
              افتح «مهامي»
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
