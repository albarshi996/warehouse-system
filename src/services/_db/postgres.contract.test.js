/**
 * عقدُ المحوَّل الهجين — يُفحص **نصًّا** لا باستيراد.
 *
 * ★★★ **ولماذا نصًّا؟** لأنّ `postgres.js` يستورد `firestore.js` ومعها
 *     تهيئةُ تطبيق Firebase. واستيرادُه في Node يعني سحابةً وحسابًا ومفاتيحَ
 *     بيئةٍ لا وجودَ لها في المُشغّل — فيصير الاختبارُ هشًّا ويُسكَت يومًا.
 *     والمطلوبُ هنا ليس تشغيلَ الدوالّ بل **الإجابةُ على ثلاثة أسئلةٍ بنيويّة**:
 *     أكمُلت الرموز؟ أما زالت الكتابةُ كلُّها خارجَ قاعدتنا؟ أله مستدعٍ أصلًا؟
 *
 * ★★ والثالثُ درسٌ مسجَّلٌ في هذا المستودع: **«مبنيٌّ ومنشورٌ وبلا مستدعٍ»**.
 *    فمحوَّلٌ كاملٌ لا يذكره `index.js` هو ملفٌّ ميّتٌ يبدو إنجازًا.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { REQUIRED_SYMBOLS } from './backend.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(HERE, f), 'utf8');

/** أسماءُ ما يُصدّره ملفٌّ — من نصّه. */
function exportsOf(src) {
  const names = new Set();
  const patterns = [
    /export\s+async\s+function\s+([A-Za-z_$][\w$]*)/g,
    /export\s+function\s+([A-Za-z_$][\w$]*)/g,
    /export\s+const\s+([A-Za-z_$][\w$]*)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src)) !== null) names.add(m[1]);
  }
  return names;
}

test('★★★ العقدُ كاملٌ — اثنان وعشرون رمزًا، ولا واحدَ ينقص', () => {
  const names = exportsOf(read('postgres.js'));
  const missing = REQUIRED_SYMBOLS.filter((n) => !names.has(n));
  assert.deepEqual(missing, [], `ينقص المحوَّلَ: ${missing.join(' · ')}`);
});

test('ويُصدّر المثيلَ والنوعَ واسمَه — كما يفعل محوَّل Firestore', () => {
  const names = exportsOf(read('postgres.js'));
  for (const n of ['db', 'Timestamp', 'BACKEND_NAME']) {
    assert.equal(names.has(n), true, `ينقصه ${n}`);
  }
});

test('★★★ نقض: لا سطرَ في المحوَّل يكتب في قاعدتنا — `select` وحدَه', () => {
  const src = read('postgres.js');
  const used = new Set([...src.matchAll(/client\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  const allowed = new Set(['select', 'freshPaths', 'healthy', 'status', 'configured']);
  const extra = [...used].filter((n) => !allowed.has(n));
  assert.deepEqual(extra, [], `استعمالٌ غيرُ مأذونٍ للعميل: ${extra.join(' · ')}`);
});

test('★★★ والكتابةُ مُفوَّضةٌ حرفيًّا إلى Firestore لا مُعادةُ البناء', () => {
  const src = read('postgres.js');
  for (const w of ['setDoc', 'updateDoc', 'addDoc', 'deleteDoc', 'writeBatch', 'runTransaction']) {
    assert.match(
      src,
      new RegExp(`export\\s+const\\s+${w}\\s*=\\s*fs\\.${w}\\s*;`),
      `${w} يجب أن يكون تفويضًا حرفيًّا — أيُّ منطقٍ فوقه بابُ تصادم`
    );
  }
});

test('★★ والمستمعون و`getDocFromServer` يمرّون إلى Firestore بلا شرط', () => {
  const src = read('postgres.js');
  // لا شرطَ ولا `await` ولا `decide` داخل جسمَيهما: تمريرٌ مباشر.
  const live = src.match(/export function onSnapshot[\s\S]{0,160}?\n}/);
  assert.ok(live, 'onSnapshot غيرُ موجود');
  assert.match(live[0], /return fs\.onSnapshot\(/);
  assert.equal(/decide|client\./.test(live[0]), false, 'المستمعون لا يمرّون بقرارٍ هجين');

  const srv = src.match(/export function getDocFromServer[\s\S]{0,160}?\n}/);
  assert.ok(srv);
  assert.match(srv[0], /return fs\.getDocFromServer\(/);
});

test('★★★ وله مستدعٍ: `index.js` يسجّله في جدول المحوّلات', () => {
  const idx = read('index.js');
  assert.match(idx, /import \* as postgres from '\.\/postgres\.js'/, 'غيرُ مستورد');
  assert.match(idx, /const BACKENDS = \{[^}]*\bpostgres\b/, 'غيرُ مسجَّلٍ في الجدول');
});

test('★★ ولا يستورد Firestore من خارج الباب — الجدارُ يبقى جدارًا', () => {
  const src = read('postgres.js');
  assert.equal(/from ['"]firebase\/firestore['"]/.test(src), false);
  assert.match(src, /import \* as fs from '\.\/firestore\.js'/);
});

test('★★★ ونجدةُ نفاد الحصّة موصولةٌ في القراءتين — لا مكتوبةً وحدَها', () => {
  const src = read('postgres.js');
  for (const fn of ['getDoc', 'getDocs']) {
    const head = src.indexOf(`export async function ${fn}(`);
    assert.notEqual(head, -1, `${fn} غيرُ موجود`);
    // جسمُ الدالّة: ما بين رأسِها ورأسِ التصدير الذي يليها — بلا هروبٍ
    // ولا تعبيرٍ نمطيّ، فالهروبُ في هذا المستودع يتكسّر عبر الصَّدفة.
    const next = src.indexOf('export ', head + 10);
    const body = src.slice(head, next === -1 ? src.length : next);

    assert.ok(body.includes('try {'), `${fn} بلا حمايةٍ من عطب Firebase`);
    assert.ok(body.includes('isQuotaError(err)'), `${fn} لا يميّز نفادَ الحصّة`);
    assert.ok(body.includes('markDegraded('), `${fn} يُنقذ صامتًا — والرايةُ شرط`);
    assert.ok(body.includes('throw err;'), `${fn} يبتلع أعطابًا أخرى`);
  }
});

test('★★★ نقض: ولا نجدةَ للكتابة — مصدرُ الحقيقة واحدٌ يومَ الأزمة', () => {
  const src = read('postgres.js');
  // الكتابةُ تفويضٌ حرفيٌّ بلا `try`، فلا يمكن أصلًا أن تُحوَّل إلى المرآة.
  for (const w of ['setDoc', 'updateDoc', 'addDoc', 'deleteDoc', 'writeBatch', 'runTransaction']) {
    assert.ok(src.includes(`export const ${w} = fs.${w};`), `${w} ليس تفويضًا حرفيًّا`);
  }
});

test('★★ والرايةُ مقروءةٌ من الخارج — وإلّا لم تُعرض للمستخدم', () => {
  assert.ok(read('postgres.js').includes('degraded: () =>'));
});
