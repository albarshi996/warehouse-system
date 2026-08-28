/**
 * 🔒 حارسُ المولَّدات — كي لا يفترق **المنشورُ عن المُختبَر**.
 *
 * ═══ العطبُ الذي وُجد لأجله ═══
 * كان في ورك-فلو النشر سطران يُسمّيان `build-arch` و`build-org` بأيديهما —
 * **نسخةٌ يدويّةٌ من `prebuild`**. فلمّا أُضيف إليه مولّدٌ ثالث
 * (`build-usage-guide`) لم يلحق به التعداد، ولا شيءَ اشتكى:
 *
 *   · بوّابةُ الاختبار تُشغّل `npm run build` ⇒ `prebuild` يعمل ⇒ الدليلُ مولَّد.
 *   · وورك-فلو النشر يُشغّل `astro build` مباشرةً بعد التعداد اليدويّ
 *     ⇒ الدليلُ **يُنشر كما أُودع لا كما يُولَّد**.
 *
 * **فالمُختبَرُ غيرُ المنشور** — وهو أخبثُ من عطبٍ يُسقط بناءً، لأنّه لا يُسقط
 * شيئًا. ولم يظهر أثرُه عندنا لأنّنا نولّد ونُودع بأيدينا، وظهر في **مستودع
 * الشركة** حيث الروابطُ غيرُ روابطنا: ٢١٩ رابطًا في دليلهم تشير إلى موقعنا
 * (رُصد 2026-08-28).
 *
 * ═══ والقاعدةُ التي يفرضها ═══
 * **لا يُعدَّد مولّدٌ بيدٍ حيث يمكن استدعاء `prebuild` بالاسم**، وكلُّ مسارٍ
 * يولّد قبل البناء (النشرُ · المزامنة) يمرّ بالمجموعة كاملةً لا ببعضها.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const pkg = JSON.parse(read('package.json'));

/** مولّداتُ `prebuild` كما هي مكتوبةٌ في `package.json` — المصدرُ الوحيد. */
function prebuildGenerators() {
  const script = pkg.scripts?.prebuild ?? '';
  return [...script.matchAll(/scripts\/[\w-]+\.mjs/g)].map((m) => m[0]);
}

test('★★★ سلسلةُ `prebuild` ليست فارغةً ولا مخترَعة — تُقرأ من package.json', () => {
  const gens = prebuildGenerators();
  assert.ok(gens.length >= 2, `«prebuild» بلا مولّدات: ${JSON.stringify(pkg.scripts?.prebuild)}`);
  for (const g of gens) {
    assert.ok(fs.existsSync(path.join(ROOT, g)), `«${g}» مذكورٌ في prebuild ولا وجودَ له على القرص`);
  }
});

test('★★★ ورك-فلو النشر يستدعي `prebuild` بالاسم — ولا يُعدّد مولّداته بيده', () => {
  const wf = read('.github/workflows/astro.yml');

  assert.ok(
    /npm run prebuild/.test(wf),
    'ورك-فلو النشر لا يستدعي `npm run prebuild` — فما يُنشر ليس ما يُولَّد',
  );

  const handListed = prebuildGenerators().filter((g) => wf.includes(`node ${g}`));
  assert.deepEqual(
    handListed,
    [],
    `تعدادٌ يدويٌّ لمولّداتٍ في ورك-فلو النشر (${handListed.join(' · ')}) — ` +
      'وهو الذي تخلّف عن `prebuild` أوّلَ مرّة. يُستدعى `npm run prebuild` وحدَه',
  );
});

test('★★ وسكربتُ المزامنة يمرّ بالمولّدات كلِّها لا ببعضها', () => {
  const sync = read('scripts/sync-sibling.mjs');
  const missing = prebuildGenerators().filter((g) => !sync.includes(g));
  assert.deepEqual(
    missing,
    [],
    `مولّدٌ في prebuild لا تُعيد المزامنةُ بناءه (${missing.join(' · ')}) — ` +
      'فيصل المستودعَ الشقيق محمَّلًا بهويّتنا نحن',
  );
});

test('★ والحارسُ يفشل فعلًا حين يعود التعدادُ اليدويّ — نقضٌ لا دعوى', () => {
  const gens = prebuildGenerators();
  const fake = `      - name: Generate\n        run: |\n          node ${gens[0]}\n`;
  const handListed = gens.filter((g) => fake.includes(`node ${g}`));
  assert.equal(handListed.length, 1, 'الكشفُ لا يرى تعدادًا يدويًّا مكتوبًا أمامه — فهو زينة');
  assert.equal(/npm run prebuild/.test(fake), false, 'الكشفُ يرى استدعاءً غيرَ موجود');
});
