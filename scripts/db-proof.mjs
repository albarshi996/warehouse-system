/* eslint-disable no-console -- أداةُ سطرِ أوامر: مخرَجُها هو منتجُها. */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  مُشغّلُ بيّنات القاعدة — ويَعُدُّ الفحوصَ ولا يكتفي بخضرة المخرَج
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★★ **الدرسُ الذي بُني عليه هذا الملفّ (2026-09-07):** `db/test/proof.sql`
 *     أعلن «٢٤ فحصًا يُطلق فيها كلُّ حارسٍ ويُرفض بعينه»، وكان **يُطلق ستّة**
 *     — يموت عند سطرٍ يُدرج عمودًا لا وجودَ له، فلا يصل إلى التسعةَ عشرَ
 *     الباقيةَ وفيها **حارسُ الرصيد السالب**. ولم يُلاحظ شهورًا لأنّ السكربتَ
 *     الميّتَ في منتصفه **لا يطبع «تُخطّيت»؛ لا يطبع شيئًا**، والعينُ تقرأ ما
 *     طُبع لا ما نقص.
 *
 *     ⇒ فلكلّ ملفِّ بيّنةٍ **حدٌّ أدنى معلَنٌ من الفحوص**، ويسقط إن نقص.
 *       والعدُّ أرخصُ من القراءة، ولا يكذب.
 *
 * التشغيل:  npm run proof
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTAINER = process.env.PG_CONTAINER || 'warehouse-postgres';

/**
 * كلُّ بيّنةٍ وحدُّها الأدنى. والرقمُ **يُرفع عند إضافة فحصٍ ولا يُخفَّض**
 * إلّا بقرارٍ مكتوب — فخفضُه لإسكات فشلٍ هو عينُ العطب الذي يحرسه الملفّ.
 */
const PROOFS = [
  { file: 'db/test/proof.sql', min: 25, what: 'حرّاسُ المخطّط' },
  { file: 'db/test/proof-sync.sql', min: 13, what: 'طبقةُ المزامنة' },
  { file: 'db/test/proof-rls-read.sql', min: 11, what: 'صلاحيّةُ القراءة' },
];

/**
 * ★★ ويُجمع `stderr` إلى `stdout` عمدًا: psql يكتب `RAISE NOTICE` — وهي
 *    كلُّ سطور «✔» — على **مجرى الخطأ**. وقراءةُ `stdout` وحدَه تُحصي فحصًا
 *    واحدًا من خمسةٍ وعشرين فيبدو كلُّ شيءٍ ميّتًا. (وقع هذا هنا حرفيًّا.)
 */
function run(file) {
  const res = spawnSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'warehouse', '-d', 'warehouse', '-v', 'ON_ERROR_STOP=1'],
    { input: readFileSync(join(ROOT, file)), encoding: 'utf8' }
  );
  if (res.error) throw res.error;
  const out = (res.stdout || '') + (res.stderr || '');
  if (res.status !== 0) {
    const err = new Error(out.trim().split('\n').slice(-3).join(' | '));
    err.combined = out;
    throw err;
  }
  return out;
}

console.log('=== بيّنات القاعدة ===\n');

let failed = 0;

for (const p of PROOFS) {
  if (!existsSync(join(ROOT, p.file))) {
    console.error(`  XX  ${p.what.padEnd(20)} الملفُّ «${p.file}» غير موجود`);
    failed += 1;
    continue;
  }

  let out;
  try {
    out = run(p.file);
  } catch (err) {
    const msg = String(err.stderr || err.message).trim().split('\n').slice(-3).join(' | ');
    console.error(`  XX  ${p.what.padEnd(20)} سقط: ${msg}`);
    failed += 1;
    continue;
  }

  // ★ العدُّ هو الحكم — لا غيابُ الخطأ.
  const fired = (out.match(/✔/g) || []).length;
  if (fired < p.min) {
    console.error(
      `  XX  ${p.what.padEnd(20)} أُطلق ${fired} فحصًا والحدُّ الأدنى ${p.min}` +
        ' — البيّنةُ ماتت في منتصفها'
    );
    failed += 1;
    continue;
  }

  console.log(`  ok  ${p.what.padEnd(20)} ${String(fired).padStart(3)} فحصًا (الحدّ ${p.min})`);
}

console.log(
  failed === 0
    ? '\n✔ كلُّ البيّنات أُطلقت كاملةً.'
    : `\n✘ ${failed} بيّنةً لم تكتمل.`
);
process.exit(failed === 0 ? 0 : 1);
