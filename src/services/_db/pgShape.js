/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  عكسُ الخريطة — صفُّ PostgreSQL يعود مستندًا كما تعرفه الشاشات
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★★ **أخطرُ ملفٍّ في المحوَّل، ولماذا:** المزامنةُ (`db/sync/pg-maps.js`)
 *     تحوّل `nameAr` إلى `name_ar` و`uomFactors` إلى `uom_factors`. وإن
 *     أعدناها ناقصةً أو بأسماءٍ غيرِ أسمائها، **فلا رسالةَ خطأٍ واحدة**:
 *     الشاشةُ تعرض اسمًا فارغًا وسعرًا صفرًا، ويظنّ الناظرُ أنّ البياناتِ
 *     هكذا. ⇒ فالخريطةُ هنا **مشتقّةٌ من الأمام حرفًا بحرف**، ويحرسها
 *     `pgShape.test.js` بمقارنةِ الأسماء المقروءة من `pg-maps.js` نفسِه —
 *     فحقلٌ يُضاف هناك ولا يُضاف هنا **يُسقط الاختبار**، لا يمرّ صامتًا.
 *
 * ═══ ثلاثةُ تحويلاتٍ لا تُترك للصدفة ═══
 *
 *   ١ · **الوقت.** Firestore يُعيد `Timestamp` وله `.toDate()`؛ وPostgREST
 *       يُعيد نصًّا ISO. وشاشةٌ تنادي `.toDate()` على نصٍّ **تسقط فورًا**.
 *       فالتحويلُ هنا إلزاميّ — ومصنعُ `Timestamp` **يُحقن** كي يبقى هذا
 *       الملفُّ خالصًا يُختبَر في Node بلا Firebase.
 *
 *   ٢ · **العدم.** العمودُ `NULL` يعني أنّ الحقلَ **لم يكن** في المستند
 *       الأصليّ. فيُحذف الحقلُ أصلًا ولا يُرسَل `null` — لأنّ
 *       `doc.approvedAt?.toDate()` تعمل مع الغائب وتسقط مع `null`… لا،
 *       بل تعمل مع الاثنين؛ والفرقُ الحقيقيُّ في `'approvedAt' in doc`
 *       وفي `Object.keys`. والأمانةُ للأصل أسلم.
 *
 *   ٣ · **الزائد.** ما لم تستهلكه الخريطةُ الأماميّةُ ذهب إلى `extra`.
 *       فيُفرَد أوّلًا ثمّ تَعلوه الأعمدةُ المسمّاة — **فلا حقلَ يضيع**،
 *       ولا `extra` يطمس عمودًا حقيقيًّا.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/* ═══════════════════ أدواتُ التحويل ═══════════════════ */

/** نصٌّ كما هو. والعمودُ `NOT NULL DEFAULT ''` فيأتي `''` لا غياب. */
const str = (v) => (v === null || v === undefined ? '' : String(v));

/** رقمٌ — وPostgREST قد يُرسل `numeric` نصًّا في بعض الإصدارات. */
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const bool = (v) => v === true || v === 't' || v === 'true';

/** `jsonb` يصل مُفكَّكًا من PostgREST؛ والنصُّ احتياطٌ لا أكثر. */
const json = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

/** `text[]` يصل مصفوفةً؛ وما عداها يُلفّ أو يُفرَّغ. */
const arr = (v) => {
  if (Array.isArray(v)) return v;
  if (v === null || v === undefined || v === '') return [];
  return [v];
};

/* ═══════════════════ الخرائطُ المعكوسة ═══════════════════ */

/**
 * `[حقلُ المستند، العمود، النوع]` — والترتيبُ ترتيبُ `pg-maps.js` نفسُه
 * كي تُقارَن الخريطتان بالعين في خمس ثوانٍ عند أيّ تعديل.
 */
const SPECS = Object.freeze({
  Items_Master: Object.freeze({
    idColumn: 'firebase_id',
    fields: Object.freeze([
      ['sku', 'sku', 'str'],
      ['nameAr', 'name_ar', 'str'],
      ['nameEn', 'name_en', 'str'],
      ['barcodes', 'barcodes', 'arr'],
      ['archived', 'archived', 'bool'],
      ['category', 'category', 'str'],
      ['subcategory', 'subcategory', 'str'],
      ['family', 'family', 'str'],
      ['subFamily', 'sub_family', 'str'],
      ['department', 'department', 'str'],
      ['section', 'section', 'str'],
      ['shade', 'shade', 'str'],
      ['itemType', 'item_type', 'str'],
      ['supplyRoute', 'supply_route', 'str'],
      ['supplier', 'supplier', 'str'],
      ['unit', 'unit', 'str'],
      ['baseUom', 'base_uom', 'str'],
      ['sellUom', 'sell_uom', 'str'],
      ['buyUom', 'buy_uom', 'str'],
      ['uomGroupCode', 'uom_group_code', 'str'],
      ['uomGroupName', 'uom_group_name', 'str'],
      ['uomFactors', 'uom_factors', 'json'],
      ['uomBarcodes', 'uom_barcodes', 'json'],
      ['unitPrice', 'unit_price', 'num'],
      ['costPrice', 'cost_price', 'num'],
      ['sellPrice', 'sell_price', 'num'],
      ['minStock', 'min_stock', 'num'],
      ['substitutes', 'substitutes', 'json'],
      ['notes', 'notes', 'str'],
      // ★ `balance` القديمُ سُمّي `legacy_balance` في الجدول كي لا يُخلط
      //   بالرصيد المحسوب من الدفتر. والاسمُ يعود كما كان في المستند.
      ['balance', 'legacy_balance', 'num'],
      ['odooId', 'odoo_id', 'str'],
      ['createdAt', 'created_at', 'ts'],
      ['updatedAt', 'updated_at', 'ts'],
    ]),
  }),

  documents: Object.freeze({
    idColumn: 'id',
    fields: Object.freeze([
      ['type', 'type', 'str'],
      ['number', 'number', 'str'],
      ['state', 'state', 'str'],
      ['stage', 'stage', 'num'],
      ['posted', 'posted', 'bool'],
      ['header', 'header', 'json'],
      ['lines', 'lines', 'json'],
      ['links', 'links', 'json'],
      ['createdAt', 'created_at', 'ts'],
      ['updatedAt', 'updated_at', 'ts'],
      ['createdByUid', 'created_by_uid', 'str'],
      ['createdByName', 'created_by_name', 'str'],
      ['createdByRole', 'created_by_role', 'str'],
      ['numberedAt', 'numbered_at', 'ts'],
      ['approvedAt', 'approved_at', 'ts'],
      ['approvedByUid', 'approved_by_uid', 'str'],
      ['approvedByName', 'approved_by_name', 'str'],
      ['approvedByRole', 'approved_by_role', 'str'],
      ['postedAt', 'posted_at', 'ts'],
      ['postedByUid', 'posted_by_uid', 'str'],
      ['postedMoves', 'posted_moves', 'num'],
    ]),
  }),
});

/** مواصفةُ مجموعةٍ، أو `null` لغير المنسوخ. */
export function specFor(head) {
  return SPECS[head] || null;
}

/**
 * حقلُ المستند ⟵ عمودُه ونوعُه. و`null` لحقلٍ **لا عمودَ له** (ساكنٌ في
 * `extra`).
 *
 * ★★★ وهذا هو الحارسُ الذي يمنع ترشيحًا كاذبًا: `where('soAllocation','==',x)`
 *     على حقلٍ يعيش داخل `extra` **لا يمكن ترجمتُه إلى عمود**. والترجمةُ
 *     التقريبيّةُ هنا أسوأُ من العجز: تُعيد صفوفًا ناقصةً بلا رسالةِ خطأ.
 *     فيُعاد `null`، ويُردّ الاستعلامُ كلُّه إلى Firebase.
 *
 * @param {string} head
 * @param {string} field
 * @returns {{ column: string, kind: string } | null}
 */
export function columnForField(head, field) {
  const spec = SPECS[head];
  if (!spec || typeof field !== 'string') return null;
  // ★ الحقلُ المتشعّب (`header.supplier`) لا يُترجَم: العمودُ `jsonb` وطريقُ
  //   PostgREST إليه (`header->>supplier`) يختلف في الترتيب والمقارنة.
  if (field.includes('.')) return null;
  const hit = spec.fields.find(([f]) => f === field);
  if (!hit) return null;
  return { column: hit[1], kind: hit[2] };
}

/** أسماءُ الأعمدة المطلوبة من القاعدة — `select` صريحٌ لا `*`. */
export function columnsFor(head) {
  const spec = SPECS[head];
  if (!spec) return null;
  const cols = spec.fields.map(([, col]) => col);
  cols.push(spec.idColumn, 'extra');
  return [...new Set(cols)];
}

/**
 * صفٌّ ⟵ مستند.
 *
 * @param {string} head اسمُ المجموعة (`Items_Master` …).
 * @param {Record<string, unknown>} row الصفُّ كما وصل من PostgREST.
 * @param {{ ts: (iso: string) => unknown }} deps مصنعُ الوقت — يُحقن.
 * @returns {{ id: string, data: Record<string, unknown> } | null}
 */
export function rowToDoc(head, row, deps) {
  const spec = SPECS[head];
  if (!spec || !row || typeof row !== 'object') return null;
  const toTs = deps && typeof deps.ts === 'function' ? deps.ts : null;

  // ★ الزائدُ أوّلًا كي تعلوه الأعمدةُ المسمّاة.
  const extra = json(row.extra);
  const data = extra && typeof extra === 'object' && !Array.isArray(extra) ? { ...extra } : {};

  for (const [field, col, kind] of spec.fields) {
    const raw = row[col];
    switch (kind) {
      case 'str':
        data[field] = str(raw);
        break;
      case 'bool':
        data[field] = bool(raw);
        break;
      case 'arr':
        data[field] = arr(raw);
        break;
      case 'json': {
        const v = json(raw);
        if (v !== null) data[field] = v;
        break;
      }
      case 'num': {
        const v = num(raw);
        if (v !== null) data[field] = v;
        break;
      }
      case 'ts': {
        // ★★★ العدمُ يبقى عدمًا: مستندٌ لم يُعتمد ليس مستندًا اعتُمد في ١٩٧٠.
        if (raw === null || raw === undefined || raw === '') break;
        data[field] = toTs ? toTs(raw) : raw;
        break;
      }
      default:
        break;
    }
  }

  const id = row[spec.idColumn];
  if (id === null || id === undefined || id === '') return null;
  return { id: String(id), data };
}
