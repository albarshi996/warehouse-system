/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  حارسُ انحراف جدول أدوار المستندات في القاعدة
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★★ **النسخةُ الثالثة هي الخطر.** `approveRoles`/`completeRoles` مكتوبتان
 *     في `firestore.rules` وفي المخطّطات، ويحرسهما `rolesParity`. وهجرةُ
 *     القاعدة تضيف **ثالثةً** في SQL — ولو كُتبت بيدٍ لانحرفت صامتةً:
 *     دورٌ يعتمد في القاعدة ولا يعتمد في الواجهة. فالثالثةُ **تُولَّد**،
 *     وهذا الفحصُ يثبت أنّ المولَّدَ على القرص يطابق القواعدَ **الآن**.
 *
 * ★★ وهو يحرس الاتّجاهين: تعديلُ القواعد بلا إعادة توليد **وتحريرُ** الملفّ
 *    المولَّد بيد — كلاهما يُسقط الاختبار.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSql } from '../../../scripts/gen-doc-roles.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RULES = join(ROOT, 'firestore.rules');
const SQL = join(ROOT, 'db', 'schema', '010-doc-roles.sql');

test('★★★ جدولُ أدوار المستندات في SQL يطابق `firestore.rules` حرفًا بحرف', () => {
  assert.ok(existsSync(SQL), 'الملفُّ المولَّد مفقود — شغّل `node scripts/gen-doc-roles.mjs`');
  const want = buildSql(readFileSync(RULES, 'utf8'));
  const got = readFileSync(SQL, 'utf8');
  assert.equal(
    got.replace(/\r\n/g, '\n'),
    want.replace(/\r\n/g, '\n'),
    'انحرف `db/schema/010-doc-roles.sql` عن القواعد. أعِدْ توليدَه:\n' +
      '  node scripts/gen-doc-roles.mjs'
  );
});

test('★★ والمولّدُ يقرأ أنواعًا فعلًا — فلا يطابق فراغًا بفراغ', () => {
  const sql = buildSql(readFileSync(RULES, 'utf8'));
  const rows = (sql.match(/^ {2}\('/gm) || []).length;
  // ★ نقضُ الحارس نفسِه: محلِّلٌ عاجزٌ يُخرج صفرَ صفوفٍ ويبقى الفحصُ الأوّلُ
  //   أخضرَ (فراغٌ = فراغ). فيُشترط عددٌ معقولٌ صراحةً.
  assert.ok(rows >= 20, `قرأ ${rows} نوعًا فقط — المحلِّلُ عاجزٌ أو القواعدُ تغيّرت`);
});
