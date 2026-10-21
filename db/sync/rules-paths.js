/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  مساراتُ المجموعات — تُقرأ من `firestore.rules` ولا تُكتب هنا
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★★ **وحدةٌ خالصةٌ بلا استيرادٍ واحد.** لا Firebase ولا نظامَ ملفّات ولا
 *     شبكة — تأخذ نصَّ القواعد وتُعيد بنيةً. ولهذا تُختبَر في Node العاري
 *     داخل شجرةِ عملٍ بلا `node_modules`، وهو ما يجعل الحارسَ يعمل فعلًا
 *     بدل أن يبدو عاملًا.
 *
 * ★★ ولماذا انتُزعت من `scripts/firestore-export.mjs`؟ لأنّ حاويةَ المزامنة
 *    تحتاج نفسَ المنطق، **ونسخُه نسخةً ثانيةً يعني انحرافَهما بعد شهر**.
 *    والاتّجاهُ مقصود: المُصدِّرُ يستورد هذه، لا العكس — فالمُصدِّرُ يجرّ
 *    Firebase كلَّه، ولو استوردناه لسقطت خلوصُ هذه الوحدة.
 *
 * ★ والتحليلُ يتتبّع الأقواسَ بمكدّس لأنّ القواعدَ **هرميّة**:
 *   `match /operations/{id} { … match /scans/{id} { … } }` ⇒ `operations/scans`.
 *   وقراءتُها مسطّحةً عطبٌ وقع فعلًا (2026-09-02): سُئل عن `scans` في الجذر
 *   فعادت `permission-denied` ستَّ عشرة مرّة، وسقط `documents` صامتًا.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** `match /X/{id} {` ⇒ مجموعةٌ اسمُها X. */
const MATCH_COLLECTION = /match\s+\/([A-Za-z_][A-Za-z0-9_]*)\/\{[A-Za-z0-9_]+\}\s*\{/;

/** `match /databases/{db}/documents {` ⇒ الجذر، وليس مجموعة. */
const MATCH_ROOT = /match\s+\/databases\/\{[^}]+\}\/documents\s*\{/;

/**
 * `allow update, delete: if false;` — أو `allow update: if false;` وحدَها.
 * ★ هذه هي الطريقةُ التي يُعلن بها الدستورُ أنّ مجموعةً **ملحقةٌ-فقط**،
 *   ومنها نشتقُّ الاشتقاقَ بدل أن نكتب قائمةً تتقادم.
 */
const ALLOW_DENIED = /allow\s+([a-z,\s]+?)\s*:\s*if\s+false\s*;/;

/**
 * يمشي في نصّ القواعد سطرًا سطرًا ويستدعي `onPath` عند كلّ مجموعة،
 * و`onDeny` عند كلّ منعٍ صريحٍ داخل المجموعة الجارية.
 *
 * @param {string} rulesText  محتوى `firestore.rules`
 * @param {(path: string) => void} onPath
 * @param {(path: string, ops: string[]) => void} onDeny
 */
function walkRules(rulesText, onPath, onDeny) {
  const stack = [];
  let depth = 0;

  for (const raw of String(rulesText).split('\n')) {
    const line = raw.replace(/\/\/.*$/, '');

    const m = line.match(MATCH_COLLECTION);
    if (m) {
      stack.push({ name: m[1], atDepth: depth });
      depth += 1;
      if (m[1] !== 'databases') onPath(stack.map((s) => s.name).join('/'));
      continue;
    }

    if (MATCH_ROOT.test(line)) {
      depth += 1;
      continue;
    }

    const deny = line.match(ALLOW_DENIED);
    if (deny && stack.length) {
      const ops = deny[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      onDeny(stack.map((s) => s.name).join('/'), ops);
    }

    for (const ch of line) {
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        while (stack.length && stack[stack.length - 1].atDepth >= depth) stack.pop();
      }
    }
  }
}

/**
 * مساراتُ كلّ المجموعات، **الآباءُ أوّلًا**.
 * الترتيبُ ليس تجميليًّا: المجموعةُ الفرعيّةُ تحتاج معرّفاتِ آبائها قبلها.
 *
 * @param {string} rulesText
 * @returns {string[]} مثل `['items', 'operations', 'operations/scans']`
 */
export function pathsFromRules(rulesText) {
  const paths = new Set();
  walkRules(rulesText, (p) => paths.add(p), () => {});
  return [...paths].sort(
    (a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b)
  );
}

/**
 * المجموعاتُ **الملحقةُ-فقط**: يُمنع فيها التعديلُ والحذفُ معًا.
 *
 * ★★★ ولماذا يهمّ هذا المزامنة؟ لأنّه **الشرطُ الوحيد** الذي يجعل ختمَ
 *     الإنشاء (`at`) صالحًا علامةً مائيّة. صفٌّ لا يتغيّر بعد كتابته يستحيل
 *     أن «يفوت» قراءةً تدريجيّةً بحدّ `at > W`. أمّا مجموعةٌ تُعدَّل، فختمُ
 *     إنشائها **لا يتحرّك عند التعديل** — فتمرّ التعديلاتُ صامتةً إلى الأبد.
 *     وهذا هو الفرقُ بين مزامنةٍ تعمل وأخرى تكذب.
 *
 * @param {string} rulesText
 * @returns {Set<string>}
 */
export function appendOnlyFromRules(rulesText) {
  const denied = new Map();
  walkRules(rulesText, () => {}, (path, ops) => {
    const set = denied.get(path) || new Set();
    for (const op of ops) set.add(op);
    denied.set(path, set);
  });

  const out = new Set();
  for (const [path, ops] of denied) {
    if (ops.has('update') && ops.has('delete')) out.add(path);
  }
  return out;
}
