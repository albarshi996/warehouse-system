#!/usr/bin/env node
/**
 * حارس خطة المرحلة الأولى — `npm run plan`
 *
 * الغرض: ألّا تُفقد الخطة ولا الإنجاز إن توقّفت الجلسة أو امتلأت.
 * الإنجاز لا يُقاس بذاكرة المحادثة ولا بنثرٍ في ملفٍ طويل، بل بـ`docs/plan/phase-one.json`
 * المحروس هنا. أمرٌ واحد في أوّل أيّ جلسة يقول: أين توقّفنا، وما الجاهز، وما المحجوب، وعلى مَن.
 *
 * يفحص:
 *   1. سلامة الشكل — حقول ناقصة أو حالة غير معروفة أو مالك مجهول.
 *   2. المعرّفات فريدة، والاعتماديات تشير إلى مهامّ موجودة، ولا حلقة دورية.
 *   3. **مهمّة واحدة `doing` فقط** — لا تُفتح جبهتان في آنٍ واحد.
 *   4. **`done` تحتاج بيّنة**: كوميت + ملفّ اختبار حارس موجود فعلًا على القرص.
 *      («تحقّق قبل الثقة» مُمَكْنَنة: لا تُغلق مهمّة بالكلام.)
 *   5. `blocked` تحتاج سبب حجب مكتوب.
 *   6. كل فجوة من ف‑١…ف‑١١ مغطّاة بمهمّة واحدة على الأقلّ.
 *   7. `done` لا تعتمد على مهمّة غير منجزة.
 *
 * ثمّ يكتب بطاقة الاستئناف `docs/plan/الاستئناف.md` (صفحة واحدة) — وهي ما يُقرأ
 * في أوّل الجلسة الجديدة بدل ملفّ التسليم الضخم.
 *
 * لا شبكة ولا Firebase — قراءة ملفّات فقط، فيصلح للـCI.
 * يُنهي بـ0 عند السلامة، وبـ1 عند أيّ خرق.  (`--quiet` يطبع الأخطاء فقط.)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLAN_JSON = path.join(ROOT, 'docs/plan/phase-one.json');
const RESUME_MD = path.join(ROOT, 'docs/plan/الاستئناف.md');

const STATES = ['todo', 'doing', 'done', 'blocked', 'deferred'];
const OWNERS = ['Claude', 'Codex', 'المالك'];

const QUIET = process.argv.includes('--quiet');

const failures = [];
const warnings = [];
const out = (m) => { if (!QUIET) console.info(m); };
const ok = (m) => out(`  \x1b[32m✔\x1b[0m ${m}`);
const bad = (m) => { console.info(`  \x1b[31m✘\x1b[0m ${m}`); failures.push(m); };
const warn = (m) => { out(`  \x1b[33m▲\x1b[0m ${m}`); warnings.push(m); };
const section = (n, t) => out(`\n\x1b[1m${n}. ${t}\x1b[0m`);

// ── قراءة المتتبّع ───────────────────────────────────────────────────────────
if (!fs.existsSync(PLAN_JSON)) {
  console.info(`\x1b[31m✘\x1b[0m المتتبّع مفقود: ${path.relative(ROOT, PLAN_JSON)}`);
  console.info('   بلا متتبّع لا تُعرف نقطة الاستئناف. أعِده من git قبل أيّ عمل.');
  process.exit(1);
}

let plan;
try {
  plan = JSON.parse(fs.readFileSync(PLAN_JSON, 'utf8'));
} catch (e) {
  console.info(`\x1b[31m✘\x1b[0m المتتبّع غير صالح كـJSON: ${e.message}`);
  process.exit(1);
}

const tasks = plan.tasks ?? [];
const byId = new Map(tasks.map((t) => [t.id, t]));
const milestoneIds = new Set((plan.milestones ?? []).map((m) => m.id));

out(`\n\x1b[1mحارس الخطة — ${plan.plan ?? 'بلا عنوان'}\x1b[0m`);
out(`آخر تحديث: ${plan.lastUpdated ?? '—'} بواسطة ${plan.lastUpdatedBy ?? '—'}`);

// ── 1. سلامة الشكل ──────────────────────────────────────────────────────────
section(1, 'سلامة شكل المهامّ');
const seen = new Set();
for (const t of tasks) {
  const at = `المهمّة «${t.id ?? '(بلا معرّف)'}»`;
  if (!t.id) { bad('مهمّة بلا معرّف'); continue; }
  if (seen.has(t.id)) bad(`${at}: معرّف مكرّر`);
  seen.add(t.id);
  if (!t.title) bad(`${at}: بلا عنوان`);
  if (!STATES.includes(t.state)) bad(`${at}: حالة غير معروفة «${t.state}» — المسموح: ${STATES.join(' · ')}`);
  if (!OWNERS.includes(t.owner)) bad(`${at}: مالك مجهول «${t.owner}» — المسموح: ${OWNERS.join(' · ')}`);
  if (!milestoneIds.has(t.milestone)) bad(`${at}: مرحلة غير معرّفة «${t.milestone}»`);
  if (!Array.isArray(t.acceptance) || t.acceptance.length === 0) bad(`${at}: بلا معيار إتمام — مهمّة بلا معيار لا تُغلق أبدًا`);
}
if (failures.length === 0) ok(`${tasks.length} مهمّة بشكل سليم`);

// ── 2. الاعتماديات ──────────────────────────────────────────────────────────
section(2, 'الاعتماديات');
for (const t of tasks) {
  for (const d of t.dependsOn ?? []) {
    if (!byId.has(d)) bad(`المهمّة «${t.id}» تعتمد على «${d}» وهي غير موجودة`);
  }
}
// كشف الحلقات الدورية
const mark = new Map();
const cycle = (id, trail = []) => {
  if (mark.get(id) === 'done') return false;
  if (mark.get(id) === 'open') { bad(`حلقة اعتماد دورية: ${[...trail, id].join(' ← ')}`); return true; }
  mark.set(id, 'open');
  for (const d of byId.get(id)?.dependsOn ?? []) if (byId.has(d) && cycle(d, [...trail, id])) return true;
  mark.set(id, 'done');
  return false;
};
for (const t of tasks) cycle(t.id);
if (!failures.some((f) => f.includes('حلقة') || f.includes('تعتمد على'))) ok('لا اعتمادية معلّقة ولا حلقة دورية');

// ── 3. مهمّة واحدة قيد التنفيذ ──────────────────────────────────────────────
section(3, 'جبهة واحدة');
const doing = tasks.filter((t) => t.state === 'doing');
if (doing.length > 1) bad(`${doing.length} مهامّ في حالة doing (${doing.map((t) => t.id).join(' · ')}) — القاعدة: واحدة فقط`);
else if (doing.length === 1) ok(`قيد التنفيذ: ${doing[0].id} — ${doing[0].title}`);
else ok('لا مهمّة قيد التنفيذ حاليًّا');
// المهمّة الجارية بلا `nextStep` هي أخطر ما في المتتبّع: إن ماتت الجلسة الآن ضاع نصفها.
for (const t of doing) {
  if (!t.nextStep) warn(`المهمّة الجارية «${t.id}» بلا nextStep — إن امتلأت الجلسة الآن ضاع موضع التوقّف`);
  if (!t.progress) warn(`المهمّة الجارية «${t.id}» بلا progress — لا يُعرف ما أُنجز منها`);
}

// ── 4. البيّنة قبل الإغلاق ──────────────────────────────────────────────────
section(4, 'البيّنة قبل الإغلاق');
const done = tasks.filter((t) => t.state === 'done');
for (const t of done) {
  if (!t.evidence?.commit) bad(`المهمّة «${t.id}» معلَنة done بلا كوميت في evidence — الإنجاز يُثبت لا يُدَّعى`);
  if (t.guardTest && !fs.existsSync(path.join(ROOT, t.guardTest))) {
    bad(`المهمّة «${t.id}» معلَنة done واختبارها الحارس مفقود: ${t.guardTest}`);
  }
  for (const d of t.dependsOn ?? []) {
    const dep = byId.get(d);
    if (dep && dep.state !== 'done') bad(`المهمّة «${t.id}» done بينما اعتماديتها «${d}» حالتها ${dep.state}`);
  }
}
if (done.length === 0) ok('لا مهمّة منجزة بعد — لا شيء يحتاج بيّنة');
else if (!failures.some((f) => f.includes('done'))) ok(`${done.length} مهمّة منجزة، كلّها ببيّنة`);

// ── 5. الحجب يحتاج سببًا ────────────────────────────────────────────────────
section(5, 'أسباب الحجب');
const blocked = tasks.filter((t) => t.state === 'blocked');
for (const t of blocked) if (!t.blockedBy) bad(`المهمّة «${t.id}» محجوبة بلا سبب مكتوب في blockedBy`);
ok(`${blocked.length} مهمّة محجوبة`);

// ── 6. تغطية الفجوات ────────────────────────────────────────────────────────
section(6, 'تغطية الفجوات المفحوصة');
const gapIds = Object.keys(plan.gaps ?? {});
const covered = new Set(tasks.flatMap((t) => t.gaps ?? []));
for (const g of covered) if (!gapIds.includes(g)) bad(`مهمّة تشير إلى فجوة غير مسجّلة «${g}»`);
const orphan = gapIds.filter((g) => !covered.has(g));
if (orphan.length) bad(`فجوات بلا مهمّة تسدّها: ${orphan.join(' · ')}`);
else ok(`الفجوات الـ${gapIds.length} كلّها مغطّاة بمهامّ`);

// ── بطاقة الاستئناف ─────────────────────────────────────────────────────────
// «الجاهز» = ما يستطيع الوكيل بدأه الآن. مهامّ المالك تُدرج تحت «على المالك» وحدها،
// كي لا تقرأ جلسةٌ جديدة «ابدأ من: انشر القواعد» وهي ليست له أصلًا.
const isReady = (t) =>
  t.state === 'todo' && t.owner !== 'المالك' && (t.dependsOn ?? []).every((d) => byId.get(d)?.state === 'done');
const ready = tasks.filter(isReady);
const pendingOwner = [
  ...tasks.filter((t) => t.owner === 'المالك' && t.state !== 'done'),
  ...(plan.ownerInputs ?? []).filter((b) => b.state !== 'done').map((b) => ({ id: b.id, title: b.need, ifMissing: b.ifMissing, milestone: b.milestone })),
];
const doneCount = done.length;
const total = tasks.length;
const pct = total ? Math.round((doneCount / total) * 100) : 0;

const line = (t) => `- **${t.id}** — ${t.title}${t.milestone ? ` \`${t.milestone}\`` : ''}`;
// المهمّة قيد التنفيذ تُعرض مفصّلة: ما أُنجز منها، وما الخطوة التالية حرفيًّا، وما لُمس من ملفّات.
// هذا ما ينقذ الجلسة إن امتلأت في **منتصف** مهمّة لا بين مهمّتين.
const detail = (t) => [
  `### ${t.id} — ${t.title}  \`${t.milestone}\``,
  t.progress ? `\n**ما أُنجز منها:** ${t.progress}` : '',
  t.nextStep ? `\n**الخطوة التالية حرفيًّا:** ${t.nextStep}` : '',
  t.branch ? `\n**الفرع:** \`${t.branch}\`` : '',
  t.touches?.length ? `\n**الملفّات المعنيّة:** ${t.touches.map((f) => `\`${f}\``).join(' · ')}` : '',
  t.guardTest ? `\n**الاختبار الحارس المطلوب:** \`${t.guardTest}\`` : '',
  t.acceptance?.length ? `\n**معيار الإتمام:**\n${t.acceptance.map((a) => `- [ ] ${a}`).join('\n')}` : '',
].filter(Boolean).join('\n');
const card = `# بطاقة الاستئناف — المرحلة الأولى

> **ملفّ مولَّد آليًّا — لا يُحرَّر بيد.** مصدره [\`phase-one.json\`](phase-one.json)؛ يُعاد توليده بـ\`npm run plan\`.
> **اقرأني أوّلًا في كلّ جلسة جديدة.** لا تقرأ \`SESSION_HANDOFF.md\` كلّه — هذه الصفحة تكفي للاستئناف.

**الخطة:** [${plan.plan}](../${path.basename(plan.planDoc ?? '')}) · **المسار:** ${plan.track ?? '—'}
**آخر تحديث:** ${plan.lastUpdated ?? '—'} بواسطة ${plan.lastUpdatedBy ?? '—'}
**التقدّم:** ${doneCount} من ${total} مهمّة (${pct}٪)

## أين توقّفنا
${doing.length ? doing.map(detail).join('\n\n') : '_لا مهمّة قيد التنفيذ — ابدأ من «الجاهز للبدء» أدناه._'}

## الجاهز للبدء الآن (بلا انتظار أحد)
${ready.length ? ready.map(line).join('\n') : '_لا شيء جاهز — كلّ ما تبقّى محجوب. راجع «المحجوب» و«على المالك»._'}

## المحجوب
${blocked.length ? blocked.map((t) => `- **${t.id}** — ${t.title} — _محجوب بـ:_ ${t.blockedBy}`).join('\n') : '_لا شيء محجوب._'}

## على المالك
${pendingOwner.length ? pendingOwner.map((t) => `- **${t.id}** — ${t.title}${t.ifMissing ? ` _(إن لم يتوفّر: ${t.ifMissing})_` : ''}`).join('\n') : '_لا شيء معلّق على المالك._'}

## القاعدة عند كلّ إغلاق مهمّة
١. حدّث حالة المهمّة و\`evidence.commit\` في \`phase-one.json\`.
٢. \`npm run plan\` — يُعيد توليد هذه البطاقة ويرفض الإغلاق بلا بيّنة.
٣. سطر في \`SESSION_HANDOFF.md\` بمعرّف المهمّة.

---
_مولَّد بـ\`scripts/plan-check.mjs\`_
`;

fs.writeFileSync(RESUME_MD, card, 'utf8');

// ── الخلاصة ─────────────────────────────────────────────────────────────────
out(`\n\x1b[1mبطاقة الاستئناف\x1b[0m`);
out(`  كُتبت: ${path.relative(ROOT, RESUME_MD)}`);
out(`  التقدّم: ${doneCount}/${total} (${pct}٪) · جاهز: ${ready.length} · محجوب: ${blocked.length} · على المالك: ${pendingOwner.length}`);
if (doing.length === 1) out(`  \x1b[1mأين توقّفنا:\x1b[0m ${doing[0].id} — ${doing[0].title}`);
else if (ready.length) out(`  \x1b[1mابدأ من:\x1b[0m ${ready[0].id} — ${ready[0].title}`);

if (warnings.length) out(`\n\x1b[33m${warnings.length} تنبيه\x1b[0m`);
if (failures.length) {
  console.info(`\n\x1b[31m\x1b[1mفشل الحارس: ${failures.length} خرق\x1b[0m`);
  process.exit(1);
}
out('\n\x1b[32m\x1b[1mالمتتبّع سليم.\x1b[0m\n');
