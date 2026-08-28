/**
 * 🔒 حارسُ الوصل ‹GATE-501› — **لا منطقَ بلا مستدعٍ، ولا حارسَ يقرأ حقلًا لا يُكتب.**
 *
 * ═══ الدَّينُ الذي يمنعه ═══
 * ثلاثةُ أنماطٍ ظهرت في طبقاتٍ سابقة، وكلُّها تبدو خضراءَ في كلّ اختبارٍ
 * إيجابيّ:
 *   ① منطقٌ مبنيٌّ ومنشورٌ **لا يستدعيه أحد** (`bz-barcode.js` عاش شهورًا).
 *   ② حارسٌ يقرأ حقلًا **لا يُكتب أبدًا** فلا يُطلق ولو مرّة.
 *   ③ وعدٌ في الوثيقة بلا كودٍ يُنفّذه (منعٌ «في القاعدة» وهو في الشاشة).
 *
 * فهذا الحارس يمسح الشجرة مسحًا آليًّا — لا مراجعةَ يدٍ تنسى.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..');
const SRC = path.join(ROOT, 'src');

function walk(dir, exts) {
  const out = [];
  const rec = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) rec(full);
      else if (exts.some((x) => e.name.endsWith(x))) out.push(full);
    }
  };
  if (fs.existsSync(dir)) rec(dir);
  return out;
}

const GATE_FILES = fs.readdirSync(HERE).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'));
const ALL = walk(SRC, ['.js', '.jsx', '.astro']).filter((f) => !f.endsWith('.test.js'));

/** أسماءُ ما يُصدَّر من ملفّ. */
function exportsOf(file) {
  const src = fs.readFileSync(file, 'utf8');
  const names = [];
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) names.push(m[1]);
  for (const m of src.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)/g)) names.push(m[1]);
  return names;
}

test('★★★ كلُّ ما تصدّره طبقةُ البوابة مستعمَلٌ في كودٍ إنتاجيّ — لا منطقَ ميّت', () => {
  // ★ المقياسُ **عددُ الظهورات لا عددُ الملفّات**: مساعدٌ يستعمله ملفُّه وحدَه
  // حيٌّ (نمطُ `gateReason` داخل `isGateReason`)، والميّتُ ما لا يظهر إلّا في
  // سطر تعريفه. والاختباراتُ مستثناةٌ عمدًا — مُصدَّرٌ لا يستعمله إلّا اختبارُه
  // منطقٌ ميّتٌ بشهادةٍ خضراء، وهو عينُ الدَّين الذي يمنعه هذا الحارس.
  const sources = ALL.map((f) => fs.readFileSync(f, 'utf8'));
  const orphans = [];
  for (const f of GATE_FILES) {
    for (const name of exportsOf(path.join(HERE, f))) {
      const re = new RegExp(`\\b${name}\\b`, 'g');
      const hits = sources.reduce((sum, src) => sum + (src.match(re)?.length ?? 0), 0);
      if (hits <= 1) orphans.push(`${f} → ${name}`);
    }
  }
  assert.deepEqual(orphans, [], `مُصدَّرٌ لا يستعمله أحد — يُوصَل أو يُحذف:\n${orphans.map((o) => `  • ${o}`).join('\n')}`);
});

test('★★★ الحارسُ الرابع موصولٌ فعلًا: exitVerdict يستدعي outLoadProblems', () => {
  const yard = fs.readFileSync(path.join(ROOT, 'src/services/fleet/yardModel.js'), 'utf8');
  assert.ok(yard.includes('outLoadProblems'), 'الحارسُ مبنيٌّ في gateModel ولا يستدعيه exitVerdict');
  const verdict = yard.slice(yard.indexOf('export function exitVerdict'));
  assert.ok(
    verdict.slice(0, 600).includes('outLoadProblems'),
    'الاستيرادُ موجودٌ والنداءُ خارج الدالّة — وهو استيرادٌ ميّت'
  );
});

test('★★★ ما يقرؤه الحارسُ تكتبه الشاشة: load.out يُكتب في checkOut', () => {
  const service = fs.readFileSync(path.join(HERE, 'gateService.js'), 'utf8');
  assert.ok(/shapeOutLoad\(out\)/.test(service), 'checkOut لا يبني حمولةَ خروجٍ — فالحارسُ الرابع يقرأ فراغًا للأبد');
  assert.ok(/advanceVisit\([^)]*EXIT_STAGE[\s\S]{0,120}load/.test(service), 'الحمولةُ لا تُمرَّر مع نقلة الخروج فلا يراها exitVerdict');
});

test('★★★ ودفترُ الطبليات يُكتب من الخدمة لا من الشاشة', () => {
  const service = fs.readFileSync(path.join(HERE, 'gateService.js'), 'utf8');
  assert.ok(/writePalletMoves\(\s*'IN'/.test(service), 'الدخولُ لا يُقيَّد في الدفتر');
  assert.ok(/writePalletMoves\(\s*'OUT'/.test(service), 'الخروجُ لا يُقيَّد في الدفتر');

  const screens = walk(path.join(SRC, 'components/brandzo-erp/gate'), ['.jsx']);
  for (const s of screens) {
    assert.ok(
      !fs.readFileSync(s, 'utf8').includes('addDoc('),
      `${path.basename(s)} يكتب في Firestore مباشرةً — والشاشةُ تعرض ولا تكتب`
    );
  }
});

test('★★★ ق-٧ منعٌ في القاعدة لا في الشاشة: بياناتُ الزائر مستندٌ ابنٌ بقاعدته', () => {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const yard = rules.slice(rules.indexOf('match /yard_visits/'));
  assert.ok(yard.includes('match /visitor/'), 'بياناتُ الزائر بلا قاعدةٍ خاصّة — فيقرؤها كلُّ مصادَق');

  const visitorRule = yard.slice(yard.indexOf('match /visitor/'), yard.indexOf('match /visitor/') + 600);
  for (const role of ['admin', 'warehouse_manager', 'gate_officer']) {
    assert.ok(visitorRule.includes(`'${role}'`), `قاعدةُ الزائر لا تذكر ${role}`);
  }
  assert.ok(!/allow read[\s\S]{0,80}labor_supervisor/.test(visitorRule), 'مشرفُ المناولة يقرأ بيانات زائرٍ لا شأن له به');

  // ولا يُكتب الزائرُ حقلًا على الزيارة — وإلّا فالقاعدةُ الجديدة زينة.
  const service = fs.readFileSync(path.join(HERE, 'gateService.js'), 'utf8');
  const checkIn = service.slice(service.indexOf('export async function checkIn'), service.indexOf('/* ═══════════════ بياناتُ الزائر'));
  assert.ok(!/visitor:\s*shapeVisitor/.test(checkIn), 'الزائرُ ما زال حقلًا على مستند الزيارة — والقاعدةُ الابنة لا تحرسه');
});

test('★★ ولا شاشةَ من شاشات البوابة تكتب قاعدةَ عملٍ — الحكمُ في المنطق الخالص', () => {
  const screens = walk(path.join(SRC, 'components/brandzo-erp/gate'), ['.jsx']);
  assert.ok(screens.length >= 3, 'شاشاتُ البوابة أقلُّ من ثلاث — أين ذهبت؟');
  for (const s of screens) {
    const src = fs.readFileSync(s, 'utf8');
    assert.ok(
      /from '\.\.\/\.\.\/\.\.\/services\/gate\//.test(src),
      `${path.basename(s)} لا يستورد من طبقة البوابة — فمن أين يأتي حكمُه؟`
    );
  }
});
