/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  المخزنُ عبر SQL — يصل ترجمةَ `sqlQuery` بأوامر Tauri، لا منطقَ فيه
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * واجهةٌ صغيرةٌ (`get` · `query` · `count` · `write`) يبني عليها `localDb` عقدَ
 * Firestore. و`invoke` محقونٌ: الحقيقيُّ جسرُ Tauri (`index.js`)، والمزيّفُ في
 * الاختبار قاعدةُ SQLite في الذاكرة (`node:sqlite`) — فنفسُ الـSQL يُفحص حيًّا.
 */
import { buildSelect, buildCount } from './sqlQuery.js';

const GET_SQL = 'SELECT id, data FROM kv_docs WHERE collection = ? AND id = ?';
const DELETE_SQL = 'DELETE FROM kv_docs WHERE collection = ? AND id = ?';
const UPSERT_SQL =
  'INSERT INTO kv_docs (collection, id, data, updated_at) VALUES (?, ?, ?, ?) ' +
  'ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at';

/** عمليّةٌ واحدةٌ ⟵ بيانُ SQL لدفعة. */
function toStmt(op) {
  if (op.op === 'delete') return { sql: DELETE_SQL, params: [op.col, op.id] };
  return { sql: UPSERT_SQL, params: [op.col, op.id, op.data, op.updatedAt] };
}

export function createSqlStore(invoke) {
  return {
    async get(col, id) {
      const rows = await invoke('bhome_db_query', { sql: GET_SQL, params: [col, id] });
      const row = rows && rows[0];
      return row ? { id: row.id, data: row.data } : null;
    },

    async query(col, constraints) {
      const { sql, params } = buildSelect(col, constraints);
      const rows = await invoke('bhome_db_query', { sql, params });
      return (rows || []).map((r) => ({ id: r.id, data: r.data }));
    },

    async count(col, constraints) {
      const { sql, params } = buildCount(col, constraints);
      const rows = await invoke('bhome_db_query', { sql, params });
      const row = rows && rows[0];
      return row ? Number(row.n) || 0 : 0;
    },

    /**
     * كتابةٌ ذرّيّة. عمليّةٌ واحدةٌ تمرّ `bhome_db_exec`، وأكثرُ تمرّ
     * `bhome_db_batch` في معاملةٍ واحدة — فالدفعةُ لا تُترك نصفَ مكتوبة.
     */
    async write(ops) {
      if (!ops || ops.length === 0) return;
      if (ops.length === 1) {
        await invoke('bhome_db_exec', toStmt(ops[0]));
        return;
      }
      await invoke('bhome_db_batch', { stmts: ops.map(toStmt) });
    },
  };
}
