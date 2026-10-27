/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ترجمةُ قيود Firestore ⟵ SQL على `kv_docs` — منطقٌ خالصٌ يُختبَر نصًّا
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★ نظيرُ `pgQuery.js` للمرآة: لا يلمس قاعدةً ولا Tauri، يُنتج `{ sql, params }`
 *   فيُقاس حرفيًّا. والترجمةُ هنا — لا في Rust — كي تُفحص في Node.
 *
 * ★★ خدعةُ النوع: `COALESCE(json_extract(data,'$.f.__ts__'), json_extract(data,'$.f'))`
 *    — الحقلُ العاديّ يسقط إلى قيمته، والطابعُ الزمنيّ يُقرأ ISO من وسمه، فيعمل
 *    الترتيبُ والترشيحُ على النوعين بلا معرفةٍ مسبقةٍ بالمخطّط.
 */

const FIELD_OK = /^[A-Za-z0-9_][A-Za-z0-9_.]*$/;

/** معرّفُ الوثيقة حقلًا — يُقارن بعمود `id` لا بمحتوى الـJSON. */
export const DOC_ID = '__id__';

function jsonPath(field) {
  if (!FIELD_OK.test(field)) throw new Error(`حقلٌ غيرُ صالحٍ للترجمة: «${field}»`);
  return `$.${field}`;
}

/** تعبيرُ الحقل في SQL — عمودُ `id`، أو استخراجٌ يتحمّل الطوابعَ الزمنيّة. */
export function fieldExpr(field) {
  if (field === DOC_ID) return 'id';
  const p = jsonPath(field);
  return `COALESCE(json_extract(data, '${p}.__ts__'), json_extract(data, '${p}'))`;
}

/** قيمةُ معاملٍ ⟵ ما يفهمه SQLite (الطوابعُ ISO، والمنطقيُّ 0/1). */
export function encodeParam(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object' && typeof v.toDate === 'function') {
    const d = v.toDate();
    return (d instanceof Date ? d : new Date(d)).toISOString();
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

function whereFrag(c) {
  const expr = fieldExpr(c.field);
  const op = c.op;

  if ((op === '==' || op === '!=') && (c.value === null || c.value === undefined)) {
    if (c.field === DOC_ID) {
      return { frag: `id IS ${op === '==' ? '' : 'NOT '}NULL`, params: [] };
    }
    // ★ json_extract يُعيد NULL للمفقود وللـnull الصريح معًا فلا يفرّقهما؛
    //   و`json_type` يُعيد 'null' للصريح وNULL للمفقود — فـ==null يطابق الصريحَ
    //   وحدَه كـFirestore (لا الوثائقَ التي يغيب عنها الحقل).
    const t = `json_type(data, '${jsonPath(c.field)}')`;
    return op === '=='
      ? { frag: `${t} = 'null'`, params: [] }
      : { frag: `(${t} IS NOT NULL AND ${t} != 'null')`, params: [] };
  }
  if (op === 'in' || op === 'not-in') {
    const vals = Array.isArray(c.value) ? c.value : [];
    if (vals.length === 0) return { frag: op === 'in' ? '0' : '1', params: [] };
    const holes = vals.map(() => '?').join(', ');
    return { frag: `${expr} ${op === 'in' ? 'IN' : 'NOT IN'} (${holes})`, params: vals.map(encodeParam) };
  }
  if (op === 'array-contains') {
    const p = jsonPath(c.field);
    return {
      frag: `EXISTS (SELECT 1 FROM json_each(kv_docs.data, '${p}') AS je WHERE je.value = ?)`,
      params: [encodeParam(c.value)],
    };
  }
  if (op === 'array-contains-any') {
    const vals = Array.isArray(c.value) ? c.value : [];
    const p = jsonPath(c.field);
    if (vals.length === 0) return { frag: '0', params: [] };
    const holes = vals.map(() => '?').join(', ');
    return {
      frag: `EXISTS (SELECT 1 FROM json_each(kv_docs.data, '${p}') AS je WHERE je.value IN (${holes}))`,
      params: vals.map(encodeParam),
    };
  }

  const SQL_OP = { '==': '=', '!=': '!=', '<': '<', '<=': '<=', '>': '>', '>=': '>=' };
  const sqlOp = SQL_OP[op];
  if (!sqlOp) throw new Error(`عاملُ شرطٍ غيرُ مدعوم: «${op}»`);
  return { frag: `${expr} ${sqlOp} ?`, params: [encodeParam(c.value)] };
}

/** يجمع القيودَ إلى أجزاءٍ قابلةٍ للتركيب (WHERE · ORDER · LIMIT · المؤشّر). */
function collect(constraints) {
  const wheres = [];
  const orderBy = [];
  let lim = null;
  let startAfter = null;
  for (const c of constraints || []) {
    if (!c || !c.__c) continue;
    if (c.__c === 'where') wheres.push(c);
    else if (c.__c === 'orderBy') orderBy.push({ field: c.field, dir: c.dir === 'desc' ? 'desc' : 'asc' });
    else if (c.__c === 'limit') lim = c.n;
    else if (c.__c === 'startAfter') startAfter = c.vals;
  }
  return { wheres, orderBy, lim, startAfter };
}

/** قيمةُ المؤشّر: قيمةٌ أوّليّةٌ مباشرة، أو لقطةُ وثيقةٍ يُستخرَج منها حقلُ الترتيب. */
function cursorValue(v, order) {
  if (v && typeof v.get === 'function') {
    return order.field === DOC_ID ? v.id : v.get(order.field);
  }
  return v;
}

function whereClause(col, wheres, orderBy, startAfter) {
  const frags = ['collection = ?'];
  const params = [col];
  for (const c of wheres) {
    const { frag, params: ps } = whereFrag(c);
    frags.push(frag);
    params.push(...ps);
  }
  // ★ المؤشّر (`startAfter`) لترتيبٍ واحد: قيمةً أوّليّةً أو لقطةَ وثيقة (نمطُ
  //   الترحيل القياسيّ). وبلا `orderBy` لا موضعَ له فيُهمَل. والترتيبُ المتعدّدُ
  //   الحقول مع مؤشّرٍ يُرفَض بصوتٍ عالٍ لا يُقارَب صامتًا (حدُّ م١ معلَن).
  if (startAfter && startAfter.length && orderBy.length) {
    if (orderBy.length > 1) {
      throw new Error('المؤشّرُ (startAfter) لا يُدعم مع ترتيبٍ متعدّد الحقول في م١');
    }
    const o = orderBy[0];
    frags.push(`${fieldExpr(o.field)} ${o.dir === 'desc' ? '<' : '>'} ?`);
    params.push(encodeParam(cursorValue(startAfter[0], o)));
  }
  return { sql: frags.join(' AND '), params };
}

/** استعلامُ قراءةٍ كامل: { sql, params } يُعيد `id, data`. */
export function buildSelect(col, constraints) {
  const { wheres, orderBy, lim, startAfter } = collect(constraints);
  const { sql: where, params } = whereClause(col, wheres, orderBy, startAfter);
  let sql = `SELECT id, data FROM kv_docs WHERE ${where}`;
  if (orderBy.length) {
    sql += ' ORDER BY ' + orderBy.map((o) => `${fieldExpr(o.field)} ${o.dir === 'desc' ? 'DESC' : 'ASC'}`).join(', ');
  }
  if (lim !== null && lim !== undefined) sql += ` LIMIT ${Math.max(0, Number(lim) | 0)}`;
  return { sql, params };
}

/** عدٌّ بنفس الشروط، بلا ترتيب — ويحترم `limit` (كـFirestore) بعدٍّ على نافذةٍ محدودة. */
export function buildCount(col, constraints) {
  const { wheres, lim } = collect(constraints);
  const { sql: where, params } = whereClause(col, wheres, [], null);
  if (lim !== null && lim !== undefined) {
    return {
      sql: `SELECT COUNT(*) AS n FROM (SELECT 1 FROM kv_docs WHERE ${where} LIMIT ${Math.max(0, Number(lim) | 0)})`,
      params,
    };
  }
  return { sql: `SELECT COUNT(*) AS n FROM kv_docs WHERE ${where}`, params };
}
