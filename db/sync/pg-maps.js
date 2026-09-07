/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  خرائطُ الأعمدة وبناءُ الإدراج — تعريفٌ واحدٌ للمستوردِ وللمزامنة
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★★ **وحدةٌ خالصة**: تأخذ صفوفًا وتُعيد نصَّ SQL. لا تتّصل بقاعدةٍ ولا تقرأ
 *     ملفًّا — ولذلك تُختبَر في Node العاري، وهي أوّلُ مرّةٍ يصير فيها لخريطةِ
 *     الأعمدة اختبار.
 *
 * ★★ وانتُزعت من `scripts/pg-import.mjs` حين احتاجتها المزامنة. والنسختان
 *    كانتا ستنحرفان حتمًا: المستوردُ يُشغَّل مرّةً كلَّ شهر، والمزامنةُ كلَّ
 *    دقيقتين — فعمودٌ يُضاف في أحدهما ولا يُضاف في الآخر يُنتج فرقًا يظهر
 *    بعد أسابيع ولا يُفسَّر.
 *
 * ★★★ **ولا كتابةَ فارغة:** `ON CONFLICT DO UPDATE … WHERE` يُسقط التحديثَ
 *     حين لا يختلف شيء. وهذا ليس تحسينًا: بدونه تُعيد المزامنةُ كتابةَ الصفّ
 *     كلَّ دورةٍ فيُطلق مشغّلُ `set_updated_at` ويدهس ختمَ Firestore — فتصير
 *     المرآةُ تخترع زمنًا لا تعكسه. (وانظر `db/schema/005-sync.sql`.)
 * ═══════════════════════════════════════════════════════════════════════════
 */

/* ═══════════════════ أدوات SQL ═══════════════════ */

/** نصٌّ حرفيّ. تُضاعَف علامةُ الاقتباس — والعربيّةُ تمرّ كما هي (UTF-8). */
export const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

export const num = (v) =>
  v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? 'NULL' : String(Number(v));

export const jsonb = (v) => `${lit(JSON.stringify(v ?? null))}::jsonb`;

export const arr = (v) =>
  Array.isArray(v) && v.length ? `ARRAY[${v.map(lit).join(',')}]::text[]` : `'{}'::text[]`;

/** طابعٌ زمنيّ: كائنُ `{__type:'timestamp', iso}` أو نصٌّ أو فراغ. */
export function ts(v) {
  if (!v) return 'NULL';
  if (typeof v === 'object' && v.__type === 'timestamp') return `${lit(v.iso)}::timestamptz`;
  const t = Date.parse(v);
  return Number.isNaN(t) ? 'NULL' : `${lit(new Date(t).toISOString())}::timestamptz`;
}

export const str = (v) => lit(v === null || v === undefined ? '' : String(v));

/** طابعٌ زمنيٌّ لا يقبل الفراغ — للأعمدة `NOT NULL DEFAULT now()`. */
const tsOrNow = (v) => (ts(v) === 'NULL' ? 'now()' : ts(v));

/** رقمٌ لا يقبل الفراغ. */
const numOr0 = (v) => (num(v) === 'NULL' ? '0' : num(v));

/* ═══════════════════ الخرائط ═══════════════════ */

/**
 * لكلّ جدول: مفتاحُه الطبيعيّ، والمسارُ المصدر، وخريطةُ الأعمدة.
 * كلُّ عمودٍ دالّةٌ تأخذ الصفَّ الخام وتُعيد نصَّ SQL.
 * وما لم يُذكر في `consumed` يذهب إلى `extra` — ويُطبع باسمه.
 *
 * ★ و`path` هو مسارُ Firestore كما تراه المزامنة، و`file` اسمُ ملفّ النسخة.
 */
export const MAPS = [
  {
    table: 'warehouses',
    path: 'warehouses',
    file: 'warehouses',
    conflict: 'code',
    // ★ الكودُ هو المفتاح، ومعرّفُ Firestore العشوائيُّ يُحفظ للمطابقة.
    cols: {
      code: (r) => str(r.code),
      name: (r) => str(r.name),
      manager: (r) => str(r.manager),
      status: (r) => str(r.status || 'نشط'),
      facility_type: (r) => str(r.facilityType || 'warehouse'),
      created_at: (r) => tsOrNow(r.createdAt),
      firebase_id: (r) => str(r.__id),
    },
    consumed: ['code', 'name', 'manager', 'status', 'facilityType', 'createdAt', '__id'],
  },
  {
    table: 'users',
    path: 'users',
    file: 'users',
    conflict: 'uid',
    cols: {
      uid: (r) => str(r.__id),
      name: (r) => str(r.name),
      role: (r) => str(r.role),
      active: (r) => (r.active === false ? 'FALSE' : 'TRUE'),
      email: (r) => (r.email ? lit(r.email) : 'NULL'),
    },
    consumed: ['__id', 'name', 'role', 'active', 'email'],
  },
  {
    table: 'items',
    path: 'Items_Master',
    file: 'Items_Master',
    conflict: 'sku',
    cols: {
      sku: (r) => str(r.sku || r.__id),
      name_ar: (r) => str(r.nameAr),
      name_en: (r) => str(r.nameEn),
      barcodes: (r) => arr(r.barcodes),
      archived: (r) => (r.archived === true ? 'TRUE' : 'FALSE'),
      category: (r) => str(r.category),
      subcategory: (r) => str(r.subcategory),
      family: (r) => str(r.family),
      sub_family: (r) => str(r.subFamily),
      department: (r) => str(r.department),
      section: (r) => str(r.section),
      shade: (r) => str(r.shade),
      item_type: (r) => str(r.itemType),
      supply_route: (r) => str(r.supplyRoute),
      supplier: (r) => str(r.supplier),
      unit: (r) => str(r.unit),
      base_uom: (r) => str(r.baseUom),
      sell_uom: (r) => str(r.sellUom),
      buy_uom: (r) => str(r.buyUom),
      uom_group_code: (r) => str(r.uomGroupCode),
      uom_group_name: (r) => str(r.uomGroupName),
      uom_factors: (r) => jsonb(r.uomFactors ?? {}),
      uom_barcodes: (r) => jsonb(r.uomBarcodes ?? {}),
      unit_price: (r) => numOr0(r.unitPrice),
      cost_price: (r) => numOr0(r.costPrice),
      sell_price: (r) => numOr0(r.sellPrice),
      min_stock: (r) => numOr0(r.minStock),
      substitutes: (r) => jsonb(r.substitutes ?? []),
      notes: (r) => str(r.notes),
      legacy_balance: (r) => num(r.balance),
      odoo_id: (r) => (r.odooId === null || r.odooId === undefined ? 'NULL' : lit(String(r.odooId))),
      created_at: (r) => tsOrNow(r.createdAt),
      updated_at: (r) => tsOrNow(r.updatedAt),
      firebase_id: (r) => str(r.__id),
    },
    consumed: [
      '__id', 'sku', 'nameAr', 'nameEn', 'barcodes', 'archived', 'category', 'subcategory',
      'family', 'subFamily', 'department', 'section', 'shade', 'itemType', 'supplyRoute',
      'supplier', 'unit', 'baseUom', 'sellUom', 'buyUom', 'uomGroupCode', 'uomGroupName',
      'uomFactors', 'uomBarcodes', 'unitPrice', 'costPrice', 'sellPrice', 'minStock',
      'substitutes', 'notes', 'balance', 'odooId', 'createdAt', 'updatedAt',
    ],
  },
  {
    // ★★ الشكلُ **مقيسٌ من ١٧٥ مستندًا** لا مفترَض: الرأسُ والسطورُ والروابطُ
    //    كائناتٌ تبقى `jsonb`، وحقولُ الحجز (`soAllocation` …) تسقط في `extra`
    //    باسمها — وهي في سبعةِ مستنداتٍ فقط، فلا عمودَ لها اليوم.
    table: 'documents',
    path: 'documents',
    file: 'documents',
    conflict: 'id',
    cols: {
      id: (r) => str(r.__id),
      type: (r) => str(r.type),
      number: (r) => str(r.number),
      state: (r) => str(r.state || 'draft'),
      stage: (r) => num(r.stage),
      posted: (r) => (r.posted === true ? 'TRUE' : 'FALSE'),
      header: (r) => jsonb(r.header ?? {}),
      lines: (r) => jsonb(r.lines ?? []),
      links: (r) => jsonb(r.links ?? {}),
      created_at: (r) => tsOrNow(r.createdAt),
      updated_at: (r) => tsOrNow(r.updatedAt),
      created_by_uid: (r) => str(r.createdByUid),
      created_by_name: (r) => str(r.createdByName),
      created_by_role: (r) => str(r.createdByRole),
      numbered_at: (r) => ts(r.numberedAt),
      approved_at: (r) => ts(r.approvedAt),
      approved_by_uid: (r) => str(r.approvedByUid),
      approved_by_name: (r) => str(r.approvedByName),
      approved_by_role: (r) => str(r.approvedByRole),
      posted_at: (r) => ts(r.postedAt),
      posted_by_uid: (r) => str(r.postedByUid),
      posted_moves: (r) => numOr0(r.postedMoves),
      firebase_id: (r) => str(r.__id),
    },
    consumed: [
      '__id', 'type', 'number', 'state', 'stage', 'posted', 'header', 'lines', 'links',
      'createdAt', 'updatedAt', 'createdByUid', 'createdByName', 'createdByRole',
      'numberedAt', 'approvedAt', 'approvedByUid', 'approvedByName', 'approvedByRole',
      'postedAt', 'postedByUid', 'postedMoves',
    ],
  },
  {
    table: 'counters',
    path: 'counters',
    file: 'counters',
    conflict: 'type, year',
    cols: {
      type: (r) => str(r.type),
      year: (r) => (num(r.year) === 'NULL' ? String(new Date().getFullYear()) : num(r.year)),
      seq: (r) => numOr0(r.seq),
    },
    consumed: ['__id', 'type', 'year', 'seq'],
  },
];

/** خريطةُ مسارٍ بعينه، أو `null` إن لم يُنمذَج بعد. */
export function mapForPath(path) {
  return MAPS.find((m) => m.path === path) || null;
}

/* ═══════════════════ بناءُ الإدراج ═══════════════════ */

/**
 * يبني `INSERT … ON CONFLICT DO UPDATE` لصفوفِ مسارٍ واحد.
 *
 * @param {object} map  إحدى `MAPS`
 * @param {Array<Record<string, unknown>>} rows  الصفوفُ الخام من Firestore
 * @returns {{sql:string, count:number, extra:string[]}}
 */
export function buildUpsert(map, rows) {
  const colNames = Object.keys(map.cols);
  const extraKeys = new Set();
  const values = [];

  for (const r of rows) {
    // كلُّ ما لم نخطّط له ⇒ extra، ويُعلَن. فلا حقلَ يُرمى صامتًا.
    const extra = {};
    for (const k of Object.keys(r)) {
      if (!map.consumed.includes(k)) {
        extra[k] = r[k];
        extraKeys.add(k);
      }
    }
    const vals = colNames.map((c) => map.cols[c](r));
    vals.push(jsonb(extra));
    values.push(`  (${vals.join(', ')})`);
  }

  if (!values.length) return { sql: '', count: 0, extra: [] };

  const all = [...colNames, 'extra'];
  const keys = map.conflict.split(',').map((s) => s.trim());
  const updated = all.filter((c) => !keys.includes(c));

  // ★★★ الشرطُ الذي يمنع الكتابةَ الفارغة — وبه لا يُطلق مشغّلُ الختم عبثًا.
  const lhs = updated.map((c) => `${map.table}.${c}`).join(', ');
  const rhs = updated.map((c) => `EXCLUDED.${c}`).join(', ');

  const sql = [
    `INSERT INTO ${map.table} (${all.join(', ')}) VALUES`,
    values.join(',\n'),
    `ON CONFLICT (${map.conflict}) DO UPDATE SET`,
    '  ' + updated.map((c) => `${c} = EXCLUDED.${c}`).join(',\n  '),
    `WHERE (${lhs}) IS DISTINCT FROM (${rhs});`,
  ].join('\n');

  return { sql, count: values.length, extra: [...extraKeys] };
}
