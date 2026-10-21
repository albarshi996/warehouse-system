/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  مولّدُ جدول أدوار المستندات — من `firestore.rules` إلى SQL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ★★★ **لماذا يُولَّد ولا يُكتب بيد؟** لأنّ `approveRoles`/`completeRoles`
 *      مكتوبتان **مرّتين** سلفًا (القواعد والمخطّطات)، وحارسُ `rolesParity`
 *      بُني لأنّ «عدّلهما معًا» أمرٌ مكتوبٌ لا حارس. وكتابتُهما **مرّةً ثالثة**
 *      بيدٍ في SQL تفتح مصدرَ انحرافٍ ثالثًا — والانحرافُ هنا **صامتٌ وكارثيّ**:
 *      دورٌ يعتمد في القاعدة ولا يعتمد في الواجهة، أو العكس.
 *      ⇒ فالقاعدةُ **تُولَّد من القواعد**، ويحرسها `docRolesSql.test.js`.
 *
 *  التشغيل:  node scripts/gen-doc-roles.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRolesFunction } from '../src/services/documents/rolesParity.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'db', 'schema', '010-doc-roles.sql');

/** يبني نصَّ SQL من نصّ القواعد — دالّةٌ خالصةٌ كي تُختبر بلا قرص. */
export function buildSql(rules) {
  const approve = parseRolesFunction(rules, 'approveRoles');
  const complete = parseRolesFunction(rules, 'completeRoles');
  if (!approve.found || !complete.found) {
    throw new Error('لم يُعثر على approveRoles/completeRoles في القواعد');
  }
  const types = [...new Set([...Object.keys(approve.map), ...Object.keys(complete.map)])].sort();
  if (types.length === 0) throw new Error('صفرُ أنواعٍ — المحلِّلُ عاجزٌ أو القواعدُ تغيّرت');

  const lit = (arr) =>
    'ARRAY[' + (arr || []).map((r) => `'${String(r).replace(/'/g, "''")}'`).join(', ') + ']::text[]';

  const rows = types
    .map((t) => `  ('${t}', ${lit(approve.map[t])}, ${lit(complete.map[t])})`)
    .join(',\n');

  return `-- ═══════════════════════════════════════════════════════════════════════════
--  أدوارُ اعتماد المستندات وإنجازها — **ملفٌّ مولَّد، لا يُحرَّر بيد**
--  المصدر: firestore.rules  ·  المولّد: node scripts/gen-doc-roles.mjs
--  والحارس: src/services/documents/docRolesSql.test.js (يُسقط npm test عند الانحراف)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS doc_type_roles (
  doc_type       text PRIMARY KEY,
  approve_roles  text[] NOT NULL,
  complete_roles text[] NOT NULL
);
ALTER TABLE doc_type_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doc_type_roles_read ON doc_type_roles;
CREATE POLICY doc_type_roles_read ON doc_type_roles FOR SELECT TO web_user USING (signed_in());
GRANT SELECT ON doc_type_roles TO web_user;

-- ★ يُستبدل كاملًا في كلّ توليد: نوعٌ حُذف من القواعد يجب أن يختفي هنا أيضًا،
--   وإلّا بقي دورٌ يعتمد مستندًا لم يعد له وجود.
TRUNCATE doc_type_roles;
INSERT INTO doc_type_roles (doc_type, approve_roles, complete_roles) VALUES
${rows};

INSERT INTO schema_migrations (version) VALUES ('010-doc-roles')
  ON CONFLICT (version) DO NOTHING;
`;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('gen-doc-roles.mjs')) {
  const sql = buildSql(readFileSync(join(ROOT, 'firestore.rules'), 'utf8'));
  writeFileSync(OUT, sql, 'utf8');
  const n = (sql.match(/^ {2}\('/gm) || []).length;
  console.info(`✓ ${OUT.replace(ROOT, '.')} — ${n} نوعَ مستند`);
}
