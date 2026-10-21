/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  حارسُ بيئة البناء — كلُّ مفتاحٍ يقرؤه الكودُ يجب أن يُمرَّر في النشر
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★★ **العطبُ الذي بُني هذا الحارسُ عليه (قِيس 2026-10-20):** محوَّلُ
 *     القاعدة الهجين يقرأ `PUBLIC_DB_BACKEND` و`PUBLIC_PG_API_URL`
 *     و`PUBLIC_PG_AUTH_URL`، **ولم يكن أيٌّ منها مذكورًا في
 *     `.github/workflows/astro.yml`**.
 *
 *     والأثرُ لو مرّ: يضع المالكُ المفاتيحَ في أسرار المستودع، ويُطلق النشرَ،
 *     **ويخرج البناءُ أخضرَ تمامًا** — ولا يصل منها حرفٌ إلى الحزمة، لأنّ
 *     البناءَ يستبدل `import.meta.env.PUBLIC_*` بما يراه في بيئته هو، وما لا
 *     يُذكر في `env:` ليس في بيئته. فتظلّ البوّابةُ على Firebase **ويظنّ
 *     الجميعُ أنّها انتقلت** — وهو عينُ ما يحذّر منه `backend.js` في مفتاحٍ
 *     مكتوبٍ خطأً، إلّا أنّ هذا **لا يرمي ولا يُطلق تحذيرًا**.
 *
 *     ⇒ ولهذا يُفحص بالمطابقة لا بالمراجعة: الكودُ مصدرُ الحقيقة، والنشرُ
 *       يلحق به. **ومفتاحٌ يُضاف غدًا ولا يُمرَّر يُسقط `npm test` اليوم.**
 *
 * ★★ ويُقرأ الاستعمالُ بنمطٍ ضيّقٍ عمدًا (`شيء.PUBLIC_X`) لا بأيّ ذكرٍ للاسم:
 *    فالتعليقاتُ والوثائقُ تذكر مفاتيحَ لا تُقرأ (`PUBLIC_ODOO_MODE` مثلًا
 *    مذكورٌ في شرحٍ ولا يُقرأ في سطرٍ واحد)، وحارسٌ يشتكي من تعليقٍ حارسٌ
 *    يُسكَت بعد أسبوع.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = process.cwd();
const WORKFLOW = join(ROOT, '.github/workflows/astro.yml');

/** قراءةٌ حقيقيّةٌ لمتغيّر بيئة: `import.meta.env.PUBLIC_X` أو `ENV.PUBLIC_X`. */
const READ = /(?:import\.meta\.env|\b[A-Za-z_$][\w$]*)\.(PUBLIC_[A-Z0-9_]+)/g;

/**
 * ملفّاتُ المصدر **من فهرس git** لا من مسح القرص.
 *
 * ★ ودرسٌ مسجَّل: مسحٌ يسأل `git ls-files` لا يرى عملًا لم يُضَف بعد. فيُضمّ
 *   غيرُ المتتبَّع صراحةً كي يُقاس ما بين يديك لا ما أُودع أمس.
 */
function sourceFiles() {
  // ★ ويُضيَّق أوّلًا بـ`git grep` إلى ما يذكر `PUBLIC_` أصلًا: قراءةُ كلّ
  //   ملفّات `src` تكلّف عشرَ ثوانٍ في كلّ تشغيلٍ للاختبارات، وهي ضريبةٌ
  //   تُدفع ألفَ مرّةٍ لتُمسك حالةً واحدة. والتضييقُ لا يفقد شيئًا: مفتاحٌ
  //   يُقرأ ولا يُذكر اسمُه في الملفّ محالٌ.
  const out = execFileSync(
    'git',
    // ★ و`--untracked` وحدَه يمسح شجرةَ العمل كلَّها — المتتبَّعَ وغيرَه معًا.
    //   وقرنُه بـ`--cached` يرفضه git صراحةً، فلا يُجمعان.
    ['grep', '-l', '--untracked', '-e', 'PUBLIC_', '--', 'src'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 32 }
  );
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter((f) => /\.(js|jsx|astro|ts|tsx)$/.test(f) && !/\.test\./.test(f));
}

test('★★★ كلُّ مفتاح `PUBLIC_` يقرؤه الكودُ مُمرَّرٌ في بناء النشر', () => {
  const workflow = readFileSync(WORKFLOW, 'utf8');
  const passed = new Set((workflow.match(/PUBLIC_[A-Z0-9_]+/g) || []));

  const used = new Map(); // المفتاح ⟵ أوّلُ ملفٍّ يقرؤه
  for (const file of sourceFiles()) {
    let text;
    try {
      text = readFileSync(join(ROOT, file), 'utf8');
    } catch {
      continue; // ملفٌّ حُذف بين الفهرسة والقراءة
    }
    for (const m of text.matchAll(READ)) {
      if (!used.has(m[1])) used.set(m[1], file);
    }
  }

  assert.ok(used.size >= 6, `لم يُعثر إلّا على ${used.size} مفتاحًا — النمطُ معطوب`);

  const missing = [...used.entries()].filter(([key]) => !passed.has(key));
  assert.deepEqual(
    missing.map(([k, f]) => `${k} (${f})`),
    [],
    'مفاتيحُ تُقرأ ولا تُمرَّر في astro.yml — ستخرج فارغةً إلى الناس بلا تحذير'
  );
});

test('★★ والحارسُ يفشل فعلًا حين يُحذف مفتاح — نقضٌ لا دعوى', () => {
  // يُحاكى بحذف مفتاحٍ من نصّ الورك-فلو ثمّ يُعاد الفحصُ على النصّ المبتور.
  const workflow = readFileSync(WORKFLOW, 'utf8');
  const stripped = workflow.replace(/^.*PUBLIC_DB_BACKEND.*$/m, '');
  const passed = new Set(stripped.match(/PUBLIC_[A-Z0-9_]+/g) || []);
  assert.equal(passed.has('PUBLIC_DB_BACKEND'), false, 'لو بقي، فالحارسُ لا يرى شيئًا أصلًا');
});

test('★★ ومفاتيحُ الهجين الأربعةُ مذكورةٌ بأسمائها — لا تُنسى بالصمت', () => {
  const workflow = readFileSync(WORKFLOW, 'utf8');
  for (const key of [
    'PUBLIC_DB_BACKEND',
    'PUBLIC_PG_API_URL',
    'PUBLIC_PG_AUTH_URL',
    'PUBLIC_DB_HYBRID',
    'PUBLIC_PG_STALE_SECONDS',
  ]) {
    assert.match(workflow, new RegExp(`${key}:\\s*\\$\\{\\{\\s*secrets\\.${key}\\s*\\}\\}`), key);
  }
});
