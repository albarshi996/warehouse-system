-- ═══════════════════════════════════════════════════════════════════════════
--  البياناتُ الرئيسة — الأصناف والمستخدمون والمخازن
-- ═══════════════════════════════════════════════════════════════════════════
--  ★★★ هذه الجداولُ مبنيّةٌ على **قياسِ بياناتك الحقيقيّة** (2026-09-02)، لا
--      على قراءةِ الكود وحده. والفرقُ ظهر فورًا:
--        · الصنفُ يحمل `archived` لا `active` — والكودُ يقرأ الاثنين.
--        · `odooId` في ١٠٠٪ من الأصناف (فارغًا في أكثرها) — أثرُ استيرادٍ قديم.
--        · `substitutes` و`sellUom` و`buyUom` لم يذكرها الشكلُ المرجعيّ أصلًا.
--        · المستخدمُ قد لا يحمل بريدًا (٧ من ١٧ فقط).
--      ولو بنيتُ على الكود وحده لسقطت ثلاثةُ حقولٍ بصمت.
--
--  القياسُ الذي بُنيت عليه:
--    Items_Master  ١١٧٣ — معرّفُ المستند = `sku` في ١٠٠٪ · صفرُ تكرارٍ في
--                  الأكواد · صفرُ تضاربٍ في الباركودات · ٩٠ صنفًا بلا باركود
--    users         ١٧   — ٨ أدوارٍ مستعملةٍ من ٢٤
--    warehouses    ٢    — WH001 الرحبة · WH002 طرابلس
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
--  الأدوار — مرجعٌ مطابقٌ لـ`src/services/auth/roles.js`
--  وجودُها جدولًا يجعل الدورَ الخاطئ يُرفض عند الكتابة، لا يُكتشف في شاشةٍ
--  فارغةٍ بعد شهر. وRLS تقرأ منه.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE roles (
  id        text PRIMARY KEY,
  label_ar  text NOT NULL,
  sort      integer NOT NULL DEFAULT 0
);

INSERT INTO roles (id, label_ar, sort) VALUES
  ('admin',             'المدير العام',            1),
  ('scm_manager',       'مدير السلاسل والإمداد',   2),
  ('warehouse_manager', 'مدير المستودع',           3),
  ('storekeeper',       'أمين المخزن',             4),
  ('qc_inspector',      'مفتّش الجودة',            5),
  ('gate_officer',      'ضابط البوابة',            6),
  ('purchase_officer',  'موظف المشتريات',          7),
  ('finance_manager',   'المدير المالي',           8),
  ('return_manager',    'مسؤول المرتجعات',         9),
  ('inventory_auditor', 'مدقّق الجرد',            10),
  ('count_assignee',    'موظّف جرد مكلَّف',        11),
  ('viewer',            'مشاهد',                  12),
  ('department_user',   'مستخدم إدارة',           13),
  ('fleet',             'الحركة',                 14),
  ('treasury',          'أمين الخزينة',           15),
  ('labor_supervisor',  'مشرف المناولة',          16),
  ('sales_rep',         'مندوب المبيعات',         17),
  ('sales_supervisor',  'مشرف المبيعات',          18),
  ('fnb_manager',       'مدير قطاع الأغذية',      19),
  ('branch_manager',    'مدير الفرع',             20),
  ('executive_chef',    'الشيف التنفيذيّ',        21),
  ('receiving_unit',    'وحدة الاستلام والرقابة',  22),
  ('putaway_unit',      'وحدة التخزين وتحديد المواقع', 23),
  ('picking_unit',      'وحدة تحضير الطلبات والصرف',   24);


-- ───────────────────────────────────────────────────────────────────────────
--  المستخدمون — معرّفُ المستند هو `uid` من Firebase Auth
--
--  ⚠️ المصادقةُ تبقى على Firebase Auth في هذه الجولة (هجرةٌ واحدةٌ في المرّة).
--    فـ`uid` هنا هو نفسُه هناك، وRLS تقرؤه من الرمز المُوقَّع.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  uid         text PRIMARY KEY,
  name        text NOT NULL CHECK (btrim(name) <> ''),
  role        text NOT NULL REFERENCES roles (id),
  active      boolean NOT NULL DEFAULT true,
  -- ٧ من ١٧ فقط يحملون بريدًا — فالعمودُ يقبل الفراغ عمدًا.
  email       text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  extra       jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX users_email_unique ON users (lower(email))
  WHERE email IS NOT NULL AND email <> '';
CREATE INDEX users_role ON users (role) WHERE active;

CREATE TRIGGER users_touch BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- الهويّةُ لا تتبدّل: مستخدمٌ غيّر `uid` مستخدمٌ آخر.
CREATE TRIGGER users_identity BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION write_once('uid');


-- ───────────────────────────────────────────────────────────────────────────
--  المخازن — الكودُ هو الهويّة (`WH001` · `WH002`)
--
--  ★ في Firestore معرّفُ المستند عشوائيّ و`code` حقلٌ داخله. وهنا نجعل الكودَ
--    مفتاحًا، ونحفظ المعرّفَ العشوائيَّ في `firebase_id` للمطابقة — لأنّ
--    الحركاتِ والأرصدةَ كلَّها تشير إلى المخزن **بكوده** لا بمعرّفه.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE warehouses (
  code           text PRIMARY KEY CHECK (btrim(code) <> ''),
  name           text NOT NULL CHECK (btrim(name) <> ''),
  manager        text NOT NULL DEFAULT '',
  status         text NOT NULL DEFAULT 'نشط',
  facility_type  text NOT NULL DEFAULT 'warehouse',

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  firebase_id    text UNIQUE,
  extra          jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TRIGGER warehouses_touch BEFORE UPDATE ON warehouses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER warehouses_identity BEFORE UPDATE ON warehouses
  FOR EACH ROW EXECUTE FUNCTION write_once('code');


-- ───────────────────────────────────────────────────────────────────────────
--  الأصناف — ١١٧٣ صنفًا، وهي ٩٤٪ من بياناتك الحقيقيّة
--
--  «الكودُ هو الهويّة» (SAP-1 §9.1): معرّفُ المستند = `sku`، وقد تحقّق في
--  ١٠٠٪ من الأصناف المقيسة.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE items (
  sku             text PRIMARY KEY CHECK (btrim(sku) <> ''),
  name_ar         text NOT NULL CHECK (btrim(name_ar) <> ''),
  name_en         text NOT NULL DEFAULT '',

  -- الصنفُ الواحد يحمل أكثرَ من باركود (عبوةٌ قديمةٌ وأخرى جديدة).
  -- ٩٠ صنفًا بلا باركودٍ أصلًا — فالفراغُ حالةٌ صالحةٌ لا عطب.
  barcodes        text[] NOT NULL DEFAULT '{}',

  -- ★ `archived` لا `active` — هكذا هي البيانات فعلًا (١١٧٣ صنفًا كلُّها false).
  archived        boolean NOT NULL DEFAULT false,

  -- التصنيف
  category        text NOT NULL DEFAULT '',
  subcategory     text NOT NULL DEFAULT '',
  family          text NOT NULL DEFAULT '',
  sub_family      text NOT NULL DEFAULT '',
  department      text NOT NULL DEFAULT '',
  section         text NOT NULL DEFAULT '',
  shade           text NOT NULL DEFAULT '',
  item_type       text NOT NULL DEFAULT '',
  supply_route    text NOT NULL DEFAULT '',
  supplier        text NOT NULL DEFAULT '',

  -- الوحدات
  unit            text NOT NULL DEFAULT '',
  base_uom        text NOT NULL DEFAULT '',
  sell_uom        text NOT NULL DEFAULT '',
  buy_uom         text NOT NULL DEFAULT '',
  uom_group_code  text NOT NULL DEFAULT '',
  uom_group_name  text NOT NULL DEFAULT '',
  uom_factors     jsonb NOT NULL DEFAULT '{}'::jsonb,
  uom_barcodes    jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- المال — أرقامٌ عشريّةٌ دقيقة، لا عائمة. المالُ لا يُقرَّب بالصدفة.
  unit_price      numeric(18,4) NOT NULL DEFAULT 0,
  cost_price      numeric(18,4) NOT NULL DEFAULT 0,
  sell_price      numeric(18,4) NOT NULL DEFAULT 0,
  min_stock       numeric(18,4) NOT NULL DEFAULT 0,

  substitutes     jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes           text NOT NULL DEFAULT '',

  -- ⚠️ حقلٌ قديمٌ يحمله ٤٧ صنفًا. **ليس رصيدًا** — الرصيدُ في `balances` وحده.
  --    يُحفظ للتتبّع ولا يُقرأ منه حكم.
  legacy_balance  numeric(18,4),

  -- أثرُ الاستيراد من أودو. الربطُ أُلغي (قرار المالك 2026-09-02) والحقلُ
  -- يبقى مرجعًا تاريخيًّا — فحذفُ الأثر يُفقد القدرةَ على تفسير الماضي.
  odoo_id         text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  firebase_id     text UNIQUE,
  extra           jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX items_barcodes_gin ON items USING gin (barcodes);
CREATE INDEX items_category     ON items (category, subcategory);
CREATE INDEX items_name_ar      ON items (name_ar);
CREATE INDEX items_live         ON items (sku) WHERE NOT archived;

CREATE TRIGGER items_touch BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER items_identity BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION write_once('sku');

-- ───────────────────────────────────────────────────────────────────────────
--  ★★ باركودٌ واحدٌ لصنفٍ واحد — قاعدةُ عملٍ لا تُفرض اليوم في أيّ مكان.
--
--  البياناتُ اليومَ نظيفة (صفرُ تضاربٍ في ١١٧٣ صنفًا)، لكنّ النظافةَ بلا حارسٍ
--  حالةُ يومٍ لا حكمُ أبد: باركودٌ يُلصق على صنفين يجعل المسحَ يقرأ الخطأ ولا
--  يُعلن. وPostgreSQL لا يعرف `UNIQUE` على عناصر مصفوفة — فمشغّلٌ يفعلها.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION items_barcode_unique() RETURNS trigger AS $$
DECLARE
  clash text;
BEGIN
  IF NEW.barcodes IS NULL OR cardinality(NEW.barcodes) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT i.sku INTO clash
  FROM items i
  WHERE i.sku <> NEW.sku AND i.barcodes && NEW.barcodes
  LIMIT 1;

  IF clash IS NOT NULL THEN
    RAISE EXCEPTION
      'باركودٌ مستعملٌ سلفًا للصنف «%» — الباركود يدلّ على صنفٍ واحدٍ لا صنفين.',
      clash;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER items_barcode_guard BEFORE INSERT OR UPDATE OF barcodes ON items
  FOR EACH ROW EXECUTE FUNCTION items_barcode_unique();

INSERT INTO schema_migrations (version) VALUES ('002-master')
  ON CONFLICT (version) DO NOTHING;
