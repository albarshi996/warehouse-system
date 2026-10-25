-- ═══════════════════════════════════════════════════════════════════════════
--  المحاسبة المحلّيّة — القيدُ المزدوج (قرار المالك 2026-10-25: الدفترُ المحليّ
--  يملك المحاسبة). تخزينُ ما يحسبه محرّكُ `src/services/accounting/` الخالص.
-- ═══════════════════════════════════════════════════════════════════════════
--
--  العقودُ الأربعة (خطّة §6) مفروضةٌ في القاعدة لا في المستدعي:
--   ① **متوازن**: مجموعُ المدين = مجموعُ الدائن = المعلَن — حارسٌ مؤجَّلٌ يفحص عند الختم.
--   ② **مفتاحٌ فريد** يمنع التكرار: `journal_entries.key` مفتاحٌ أوّليّ حتميّ.
--   ③ **تصحيحٌ بعكسٍ مرتبط لا حذف**: الجدولان ملحقان-فقط (حارسٌ يمنع UPDATE/DELETE)،
--      والعكسُ قيدٌ جديدٌ `reverses` يشير إلى أصله.
--   ④ **فترةٌ مقفلة**: `CHECK (entry_date >= T0)` — لا قيدَ قبل حدّ الافتتاح.
--
--  المبالغُ **BIGINT بالوحدة الصغرى** (الدينار ×1000) — كما محرّك JS، فلا كسرٌ عائم.
--  ولا جدولَ بلا RLS (يُعاد فحصُ الحارس في آخر الملفّ).
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
--  دليلُ الحسابات — يطابق `src/services/accounting/accounts.js`.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE accounts (
  code       text PRIMARY KEY CHECK (btrim(code) <> ''),
  name_ar    text NOT NULL CHECK (btrim(name_ar) <> ''),
  type       text NOT NULL CHECK (type IN ('asset', 'liability', 'income', 'contra_income', 'expense', 'equity')),
  normal     text NOT NULL CHECK (normal IN ('debit', 'credit')),
  subledger  text NOT NULL DEFAULT '',
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  extra      jsonb NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO accounts (code, name_ar, type, normal, subledger) VALUES
  ('CASH',            'النقد',               'asset',         'debit',  ''),
  ('BANK',            'البنك',               'asset',         'debit',  ''),
  ('AR',              'ذمم العملاء',          'asset',         'debit',  'customer'),
  ('AP',              'ذمم الموردين',         'liability',     'credit', 'supplier'),
  ('SALES',           'المبيعات',             'income',        'credit', ''),
  ('SALES_RETURNS',   'مرتجعات المبيعات',     'contra_income', 'debit',  ''),
  ('INVENTORY',       'المخزون',             'asset',         'debit',  ''),
  ('CASH_IN_TRANSIT', 'نقدٌ في عهدة المندوب', 'asset',         'debit',  '')
ON CONFLICT (code) DO NOTHING;


-- ───────────────────────────────────────────────────────────────────────────
--  رأسُ القيد — المفتاحُ الحتميّ هو ضمانةُ منع التكرار (العقد ②).
--  `amount` بالوحدة الصغرى = مجموعُ المدين = مجموعُ الدائن (يفحصه الحارسُ المؤجّل).
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE journal_entries (
  key         text PRIMARY KEY CHECK (btrim(key) <> ''),
  -- العقد ④: لا قيدَ قبل حدّ الافتتاح 2026-10-20 (نفسُ OPENING_CUTOFF).
  entry_date  date NOT NULL CHECK (entry_date >= DATE '2026-10-20'),
  memo        text NOT NULL DEFAULT '',
  amount      bigint NOT NULL CHECK (amount > 0),

  source_type text NOT NULL DEFAULT '',
  source_id   text NOT NULL DEFAULT '',
  -- العقد ③: التصحيحُ عكسٌ مرتبطٌ لا حذف.
  reverses    text REFERENCES journal_entries (key),

  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by_uid  text NOT NULL DEFAULT '',
  created_by_name text NOT NULL DEFAULT '',
  created_by_role text NOT NULL DEFAULT '',
  extra           jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX journal_entries_date   ON journal_entries (entry_date);
CREATE INDEX journal_entries_source ON journal_entries (source_type, source_id);


-- ───────────────────────────────────────────────────────────────────────────
--  سطورُ القيد — المفتاحُ المركّب `(entry_key, line_index)` حتميّ.
--  العقد: السطرُ إمّا مدينٌ وإمّا دائن، لا كلاهما ولا صفرُهما؛ والمبلغُ موجب.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE journal_lines (
  entry_key   text NOT NULL REFERENCES journal_entries (key),
  line_index  integer NOT NULL CHECK (line_index >= 0),
  account     text NOT NULL REFERENCES accounts (code),
  party       text NOT NULL DEFAULT '',
  debit       bigint NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit      bigint NOT NULL DEFAULT 0 CHECK (credit >= 0),
  extra       jsonb NOT NULL DEFAULT '{}'::jsonb,

  PRIMARY KEY (entry_key, line_index),
  -- إمّا مدينٌ وإمّا دائن: أحدُهما موجبٌ والآخرُ صفر.
  CONSTRAINT journal_lines_one_side CHECK ((debit > 0) <> (credit > 0))
);

CREATE INDEX journal_lines_account ON journal_lines (account);
CREATE INDEX journal_lines_party   ON journal_lines (account, party) WHERE party <> '';


-- ───────────────────────────────────────────────────────────────────────────
--  العقد ① — حارسُ التوازن المؤجّل: يُفحص عند ختم المعاملة (أو SET CONSTRAINTS
--  IMMEDIATE)، فتُدرَج السطورُ ثمّ يُتحقَّق أنّ مجموعَها متوازنٌ ويطابق المعلَن.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION journal_check_balanced() RETURNS trigger AS $$
DECLARE k text; dr bigint; cr bigint; amt bigint;
BEGIN
  k := COALESCE(NEW.entry_key, OLD.entry_key);
  SELECT COALESCE(sum(debit), 0), COALESCE(sum(credit), 0) INTO dr, cr
    FROM journal_lines WHERE entry_key = k;
  SELECT amount INTO amt FROM journal_entries WHERE key = k;
  -- إن حُذف الرأسُ (لا يُفترض) فلا شيء يُفحص.
  IF amt IS NULL THEN RETURN NULL; END IF;
  IF dr <> cr THEN
    RAISE EXCEPTION 'قيد «%» غير متوازن: مدين % ≠ دائن % (بالوحدة الصغرى).', k, dr, cr;
  END IF;
  IF dr <> amt THEN
    RAISE EXCEPTION 'قيد «%»: مجموعُ السطور % لا يطابق المعلَن %.', k, dr, amt;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER journal_balanced_trg
  AFTER INSERT OR UPDATE OR DELETE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION journal_check_balanced();


-- ───────────────────────────────────────────────────────────────────────────
--  العقد ③ — ملحقٌ-فقط: لا تعديلَ ولا حذفَ للقيد (التصحيحُ عكسٌ مرتبط).
--  يحرس من كلّ مسارٍ ولو من psql مباشرةً (كـ`counters_forward_only`).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION accounting_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'دفترُ القيد ملحقٌ-فقط: لا % — التصحيحُ قيدٌ عكسيٌّ مرتبطٌ لا محوٌ للتاريخ.', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entries_append_only BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION accounting_append_only();
CREATE TRIGGER journal_lines_append_only BEFORE UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION accounting_append_only();


-- ───────────────────────────────────────────────────────────────────────────
--  RLS — قراءةٌ للمديرين، ولا كتابةَ ويبٍ (الكتابةُ بابُها أمرُ العمل/الخادم).
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts', 'journal_entries', 'journal_lines']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_read_manager', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO web_user USING (is_manager())',
      t || '_read_manager', t
    );
    EXECUTE format('GRANT SELECT ON %I TO web_user', t);
    -- لا INSERT/UPDATE/DELETE لدور الويب: الدفترُ يُكتب بأمرِ عملٍ مخوَّل لا بالواجهة.
  END LOOP;
END $$;


-- ───────────────────────────────────────────────────────────────────────────
--  ★★★ الحارسُ الأخير — لا جدولَ يُترك بلا RLS (نظيرُ 006-rls-read).
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'جداولٌ بلا RLS: % — كلُّ جدولٍ يُحرَس أو يُستثنى بقرارٍ مكتوب.', missing;
  END IF;
  RAISE NOTICE 'كلُّ جداول public محروسةٌ بـRLS بعد المحاسبة.';
END $$;


INSERT INTO schema_migrations (version) VALUES ('014-accounting')
  ON CONFLICT (version) DO NOTHING;
