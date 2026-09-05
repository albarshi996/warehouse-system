/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  حارسُ الحدّ — لا Firestore خارج الباب
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★★ الدرسُ الذي يحرسه: حدٌّ يُرسَم مرّةً ثمّ يُخترق بملفٍّ واحدٍ جديد **ليس
 *     حدًّا**. يصير بابًا خلفيًّا يكتب في القاعدة القديمة بعد التحويل ولا يعلم
 *     أحد — ولا يُكتشف إلّا حين يُسأل المخزنُ عن رصيدٍ لا يجده.
 *     **فالحدُّ يُمكنَن أو لا يوجد.**
 *
 * ★★ ويفحص هذا الملفّ **النصَّ لا الوحدات**: استيرادُ الباب يجرّ
 *    `config/firebase.js` الذي يقرأ `import.meta.env` — ولا وجودَ له في Node
 *    العاري. ولهذا لا تلمس اختباراتُ المستودع الـ٢٤٧ ملفَّ Firebase أصلًا.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REQUIRED_SYMBOLS } from './backend.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const SRC = join(ROOT, 'src');

/**
 * من يجوز له استيرادُ أيِّ وحدةٍ من Firebase — وكلُّ استثناءٍ مبرَّرٌ باسمه.
 *
 * ★ الحدُّ الذي نبنيه لـ**Firestore وحدَه**: هو ما ينتقل إلى PostgreSQL.
 *   والمصادقةُ وStorage يبقيان على Firebase بقرارٍ صريح (هجرةٌ واحدةٌ في
 *   المرّة)، فلهما استثناءاتٌ مسمّاةٌ لا مفتوحة — وإضافةُ ملفٍّ إليها قرارٌ
 *   يُكتب هنا، لا انزلاقٌ صامت.
 */
const ALLOWED_FIREBASE = {
  // ★★★ ملفٌّ واحدٌ لا غير. هذا هو الحدّ.
  'firebase/firestore': ['src/services/_db/firestore.js'],
  // المصادقةُ تبقى على Firebase: نفسُ البريد ونفسُ كلمة المرور بعد الهجرة.
  'firebase/auth': ['src/config/firebase.js', 'src/services/auth/authService.js'],
  // مثيلُ التطبيق — تبنيه القاعدةُ والأرشيفُ عليه.
  'firebase/app': ['src/config/firebase.js', 'src/services/archive/archiveStorageService.js'],
  // Firebase Storage — خدمةٌ أخرى خارج نطاق هذه الهجرة.
  'firebase/storage': ['src/services/archive/archiveStorageService.js'],
};

const CODE = /\.(js|jsx|ts|tsx|astro|mjs)$/;
const SKIP_DIRS = new Set(['node_modules', 'generated']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (CODE.test(name)) out.push(p);
  }
  return out;
}

/** مسارٌ نسبيٌّ بفواصلَ أماميّةٍ دائمًا — كي يتطابق على ويندوز ولينكس. */
const rel = (p) => relative(ROOT, p).split(sep).join('/');

const FILES = walk(SRC);

test('★★★ `firebase/firestore` لا يُستورد إلّا في ملفٍّ واحد', () => {
  const importers = [];

  for (const file of FILES) {
    const src = readFileSync(file, 'utf8');
    // الاستيرادُ الفعليّ وحدَه — ذِكرُ الاسم في تعليقٍ أو نصٍّ لا يعني شيئًا.
    if (/^\s*import[\s\S]*?from\s*['"]firebase\/firestore['"]/m.test(src)) {
      importers.push(rel(file));
    }
  }

  assert.deepEqual(
    importers.sort(),
    ALLOWED_FIREBASE['firebase/firestore'],
    'استيرادٌ مباشرٌ لـFirestore خارج المحوَّل. مرِّرْه عبر `src/services/_db/index.js`.'
  );
});

test('★★ وحداتُ Firebase الأخرى لا تتسرّب خارج استثناءاتها المسمّاة', () => {
  const offenders = [];

  for (const file of FILES) {
    const r = rel(file);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/^\s*import[\s\S]*?from\s*['"](firebase\/[a-z]+)['"]/gm)) {
      const mod = m[1];
      const allowed = ALLOWED_FIREBASE[mod];
      if (!allowed) {
        offenders.push(`${r}  ←  ${mod}  (وحدةٌ غيرُ مصرَّحٍ بها أصلًا)`);
      } else if (!allowed.includes(r)) {
        offenders.push(`${r}  ←  ${mod}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'استيرادُ Firebase من ملفٍّ ليس في الاستثناءات. أضِفْه إلى `ALLOWED_FIREBASE` بقرارٍ مكتوب، أو مرِّرْه بالباب:\n  ' +
      offenders.join('\n  ')
  );
});

test('★★ `db` يأتي من الباب لا من `config/firebase.js`', () => {
  const offenders = [];

  for (const file of FILES) {
    const r = rel(file);
    if (r === 'src/config/firebase.js' || r === 'src/services/_db/firestore.js') continue;

    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(
      /^\s*import\s*\{([^}]+)\}\s*from\s*['"][^'"]*config\/firebase\.js['"]/gm
    )) {
      const names = m[1]
        .split(',')
        .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
        .filter(Boolean);
      // `auth` و`app` مصادقةٌ وتبقى هناك. `db` وحدَه يجب أن يمرّ بالباب.
      if (names.includes('db')) offenders.push(r);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    '`db` مستوردٌ من `config/firebase.js` بدل `_db/index.js`:\n  ' + offenders.join('\n  ')
  );
});

test('الباب يُصدّر كلَّ رمزٍ في العقد', () => {
  // يُقرأ نصًّا لا استيرادًا — انظر ترويسة الملفّ.
  const src = readFileSync(join(HERE, 'index.js'), 'utf8');
  const missing = REQUIRED_SYMBOLS.filter(
    (n) => !new RegExp(`^export const ${n}\\s*=`, 'm').test(src)
  );

  assert.deepEqual(missing, [], 'رموزٌ في العقد لا يُصدّرها الباب: ' + missing.join(', '));
  assert.match(src, /^export const db\s*=/m, '`db` مُصدَّرٌ من الباب');
});

test('محوَّل Firestore يُصدّر كلَّ رمزٍ في العقد', () => {
  const src = readFileSync(join(HERE, 'firestore.js'), 'utf8');
  const missing = REQUIRED_SYMBOLS.filter((n) => !new RegExp(`\\b${n}\\b`).test(src));

  assert.deepEqual(missing, [], 'رموزٌ في العقد لا يُصدّرها محوَّل Firestore: ' + missing.join(', '));
});

test('★ الباب لا يستورد Firebase بنفسه — القرارُ منفصلٌ عن التنفيذ', () => {
  const src = readFileSync(join(HERE, 'index.js'), 'utf8');
  assert.doesNotMatch(
    src,
    /from\s*['"]firebase\//,
    '`index.js` يصل ولا ينفّذ؛ Firestore في `firestore.js` وحدَه'
  );

  const decide = readFileSync(join(HERE, 'backend.js'), 'utf8');
  assert.doesNotMatch(decide, /^\s*import\s/m, '`backend.js` منطقٌ خالصٌ لا يستورد شيئًا');
});
