/* eslint-disable no-console -- أداةُ سطرِ أوامر: مخرَجُها هو منتجُها، والقاعدةُ تحمي حزمةَ المتصفّح. */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  استيرادُ النسخة إلى PostgreSQL — يولّد SQL ولا يتّصل بشيء
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★ **بلا تبعيّةٍ جديدة**: لا `pg` ولا سائقَ اتّصال. يقرأ `db/dump/*.ndjson`
 *   ويكتب `db/dump/_import.sql`، ثمّ يُنفَّذ داخل الحاوية بـ`psql`.
 *   والمخرَجُ **ملفٌّ يُقرأ ويُراجَع قبل تنفيذه** — لا كتابةً عمياء.
 *
 * ★★ **معادُ التشغيل بلا تكرار** (البند ٩): كلُّ إدراجٍ `ON CONFLICT DO UPDATE`
 *    على المفتاح الطبيعيّ. شغّله عشرَ مرّاتٍ ⇒ نفسُ الصفوف، لا نسخةَ ثانية.
 *
 * ★★★ **بلا فقدٍ بالبرهان**: كلُّ حقلٍ لا نعرف له عمودًا يذهب إلى `extra`
 *     ويُطبع في التقرير باسمه. فما لم نخطّط له يُحفظ ويُعلن، ولا يُرمى صامتًا.
 *
 * التشغيل:
 *   node scripts/pg-import.mjs                    # يولّد الملفّ
 *   node scripts/pg-import.mjs --apply            # يولّد ثمّ ينفّذ
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DUMP = join(ROOT, 'db', 'dump');
const OUT = join(DUMP, '_import.sql');
const APPLY = process.argv.includes('--apply');

/* ═══════════════════ أدوات SQL ═══════════════════ */

/** نصٌّ حرفيّ. تُضاعَف علامةُ الاقتباس — والعربيّةُ تمرّ كما هي (UTF-8). */
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? 'NULL' : String(Number(v)));
const jsonb = (v) => `${lit(JSON.stringify(v ?? null))}::jsonb`;
const arr = (v) => (Array.isArray(v) && v.length ? `ARRAY[${v.map(lit).join(',')}]::text[]` : `'{}'::text[]`);

/** طابعٌ زمنيّ: كائنُ `{__type:'timestamp', iso}` أو نصٌّ أو فراغ. */
function ts(v) {
  if (!v) return 'NULL';
  if (typeof v === 'object' && v.__type === 'timestamp') return `${lit(v.iso)}::timestamptz`;
  const t = Date.parse(v);
  return Number.isNaN(t) ? 'NULL' : `${lit(new Date(t).toISOString())}::timestamptz`;
}

const str = (v) => lit(v === null || v === undefined ? '' : String(v));

/* ═══════════════════ الخرائط ═══════════════════ */

/**
 * لكلّ جدول: مفتاحُه الطبيعيّ، والملفُّ المصدر، وخريطةُ الأعمدة.
 * كلُّ عمودٍ دالّةٌ تأخذ الصفَّ الخام وتُعيد نصَّ SQL.
 * وما لم يُذكر هنا يذهب إلى `extra` — ويُطبع.
 */
const MAPS = [
  {
    table: 'warehouses',
    file: 'warehouses',
    conflict: 'code',
    // ★ الكودُ هو المفتاح، ومعرّفُ Firestore العشوائيُّ يُحفظ للمطابقة.
    cols: {
      code: (r) => str(r.code),
      name: (r) => str(r.name),
      manager: (r) => str(r.manager),
      status: (r) => str(r.status || 'نشط'),
      facility_type: (r) => str(r.facilityType || 'warehouse'),
      created_at: (r) => ts(r.createdAt) === 'NULL' ? 'now()' : ts(r.createdAt),
      firebase_id: (r) => str(r.__id),
    },
    consumed: ['code', 'name', 'manager', 'status', 'facilityType', 'createdAt', '__id'],
  },
  {
    table: 'users',
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
      unit_price: (r) => (num(r.unitPrice) === 'NULL' ? '0' : num(r.unitPrice)),
      cost_price: (r) => (num(r.costPrice) === 'NULL' ? '0' : num(r.costPrice)),
      sell_price: (r) => (num(r.sellPrice) === 'NULL' ? '0' : num(r.sellPrice)),
      min_stock: (r) => (num(r.minStock) === 'NULL' ? '0' : num(r.minStock)),
      substitutes: (r) => jsonb(r.substitutes ?? []),
      notes: (r) => str(r.notes),
      legacy_balance: (r) => num(r.balance),
      odoo_id: (r) => (r.odooId === null || r.odooId === undefined ? 'NULL' : lit(String(r.odooId))),
      created_at: (r) => (ts(r.createdAt) === 'NULL' ? 'now()' : ts(r.createdAt)),
      updated_at: (r) => (ts(r.updatedAt) === 'NULL' ? 'now()' : ts(r.updatedAt)),
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
    table: 'counters',
    file: 'counters',
    conflict: 'type, year',
    cols: {
      type: (r) => str(r.type),
      year: (r) => (num(r.year) === 'NULL' ? String(new Date().getFullYear()) : num(r.year)),
      seq: (r) => (num(r.seq) === 'NULL' ? '0' : num(r.seq)),
    },
    consumed: ['__id', 'type', 'year', 'seq'],
  },
];

/* ═══════════════════ التوليد ═══════════════════ */

function rowsOf(file) {
  const p = join(DUMP, `${file}.ndjson`);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

const sql = [];
const report = [];

sql.push('-- مولَّدٌ آليًّا بـ scripts/pg-import.mjs — لا يُحرَّر يدويًّا.');
sql.push('-- معادُ التشغيل: كلُّ إدراجٍ ON CONFLICT DO UPDATE على المفتاح الطبيعيّ.');
sql.push('BEGIN;');
sql.push('');

for (const map of MAPS) {
  const rows = rowsOf(map.file);
  if (rows === null) {
    report.push({ table: map.table, count: 0, note: `الملفّ «${map.file}.ndjson» غير موجود` });
    continue;
  }

  const colNames = Object.keys(map.cols);
  const extraKeys = new Set();
  const values = [];

  for (const r of rows) {
    // كلُّ ما لم نخطّط له ⇒ extra، ويُعلَن.
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

  if (!values.length) {
    report.push({ table: map.table, count: 0, note: 'لا صفوف' });
    continue;
  }

  const all = [...colNames, 'extra'];
  const keys = map.conflict.split(',').map((s) => s.trim());
  const updates = all.filter((c) => !keys.includes(c)).map((c) => `${c} = EXCLUDED.${c}`);

  sql.push(`-- ${map.table}: ${values.length} صفًّا`);
  sql.push(`INSERT INTO ${map.table} (${all.join(', ')}) VALUES`);
  sql.push(values.join(',\n'));
  sql.push(`ON CONFLICT (${map.conflict}) DO UPDATE SET`);
  sql.push('  ' + updates.join(',\n  ') + ';');
  sql.push('');

  report.push({ table: map.table, count: values.length, extra: [...extraKeys] });
}

sql.push('COMMIT;');
writeFileSync(OUT, sql.join('\n'), 'utf8');

/* ═══════════════════ التقرير ═══════════════════ */

console.log('=== IMPORT PLAN ===\n');
for (const r of report) {
  console.log(`  ${String(r.count).padStart(6)}  ${r.table.padEnd(14)}${r.note ? '  ! ' + r.note : ''}`);
  if (r.extra && r.extra.length) {
    console.log(`          -> extra: ${r.extra.join(', ')}`);
  }
}
console.log(`\n  SQL written: db/dump/_import.sql`);

if (!APPLY) {
  console.log('\n  (not applied. re-run with --apply)');
  process.exit(0);
}

console.log('\n=== APPLYING ===\n');
try {
  const out = execFileSync(
    'docker',
    ['exec', '-i', 'warehouse-postgres', 'psql', '-U', 'warehouse', '-d', 'warehouse', '-v', 'ON_ERROR_STOP=1', '-q'],
    { input: readFileSync(OUT), encoding: 'utf8' }
  );
  if (out.trim()) console.log(out);
  console.log('  OK - applied.');
} catch (err) {
  console.error('  FAILED:', err.stderr || err.message);
  process.exit(1);
}
