-- ═══════════════════════════════════════════════════════════════════════════
--  بيّنةُ طبقةِ المزامنة — والحارسُ الذي لم نره يرفض شيئًا غيرُ موجود
-- ═══════════════════════════════════════════════════════════════════════════
--  يُبرهن على أربعةِ أشياءَ **يفشل كلٌّ منها صامتًا** لو انكسر:
--    ١. `sync_log` ملحَقٌ-فقط فعلًا (لا بالنيّة).
--    ٢. الختمُ التلقائيُّ ما زال يعمل لمن لم يذكره — أي لكلّ كودِ البوّابة.
--    ٣. والختمُ الصريحُ يُحترم — وهو ما يجعل المرآةَ تعكس ولا تخترع.
--    ٤. و`ON CONFLICT … WHERE` لا يلمس الصفَّ حين لا يختلف شيء.
--
--  ★★★ والرابعُ هو الأهمّ: بدونه تُعيد المزامنةُ كتابةَ ١١٧٣ صنفًا كلَّ
--      دقيقتين، فيُطلق المشغّلُ في كلّ مرّة، فيصير `updated_at` **ساعةَ
--      المزامنة لا ساعةَ العمل** — ولا يظهر ذلك في أيّ خطأ.
--
--  التشغيل:
--    docker exec -i warehouse-postgres psql -U warehouse -d warehouse -v ON_ERROR_STOP=1 < db/test/proof-sync.sql
-- ═══════════════════════════════════════════════════════════════════════════

\set QUIET on
\pset format unaligned
\pset tuples_only on

BEGIN;

CREATE OR REPLACE FUNCTION must_fail(label text, stmt text) RETURNS void AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '  ✔ % — رُفض كما يجب (%)', label, left(SQLERRM, 60);
    RETURN;
  END;
  RAISE EXCEPTION '  ✘ % — مرّ ولم يُرفض! الحارس لا يعمل.', label;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION must_pass(label text, stmt text) RETURNS void AS $$
BEGIN
  EXECUTE stmt;
  RAISE NOTICE '  ✔ % — مرّ كما يجب', label;
END;
$$ LANGUAGE plpgsql;


\echo ''
\echo '════ ١ · سجلُّ المزامنة ملحَقٌ-فقط ════'

SELECT must_pass('إدراج سطرِ دورة',
  $$INSERT INTO sync_log (cycle_id, path, mode, queries, docs_read, rows_written, ok, started_at)
    VALUES ('proof-cycle', 'Items_Master', 'incremental', 1, 3, 3, TRUE, now())$$);

SELECT must_fail('تعديلُ سطرٍ مسجَّل',
  $$UPDATE sync_log SET docs_read = 0 WHERE cycle_id = 'proof-cycle'$$);

SELECT must_fail('حذفُ سطرٍ مسجَّل',
  $$DELETE FROM sync_log WHERE cycle_id = 'proof-cycle'$$);


\echo ''
\echo '════ ٢ · الفشلُ يُسمّى ولا يُبتلع ════'

SELECT must_pass('تسجيلُ فشلٍ باسمه',
  $$INSERT INTO sync_log (cycle_id, path, mode, ok, error, started_at)
    VALUES ('proof-cycle', 'documents', 'incremental', FALSE, 'permission-denied', now())$$);

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM sync_log WHERE cycle_id = 'proof-cycle' AND NOT ok;
  IF n <> 1 THEN RAISE EXCEPTION '  ✘ الفشلُ لم يُسجَّل'; END IF;
  RAISE NOTICE '  ✔ الفشلُ محفوظٌ برسالته — لا صمت';
END $$;


\echo ''
\echo '════ ٣ · حالةُ المزامنة والختمُ التلقائيّ ════'

-- ★★ يُدرَج بختمٍ قديمٍ صراحةً. والسببُ ليس تزويقًا: `now()` **مجمَّدٌ داخل
--    المعاملة**، فلو أُدرج الصفُّ بالختم الافتراضيّ لَما أمكن للمشغّلِ أن
--    يُنتج قيمةً مختلفة — ولَبدا الحارسُ مكسورًا وهو سليم، أو سليمًا وهو
--    مكسور. فالبيّنةُ التي لا تفرّق بين الحالتين ليست بيّنة.
SELECT must_pass('إدراجُ حالةِ مسارٍ بختمٍ قديم',
  $$INSERT INTO sync_state (path, mode, mark_field, watermark, updated_at)
    VALUES ('Items_Master', 'incremental', 'updatedAt', '2026-09-01T10:00:00Z',
            '2020-01-01T00:00:00Z')$$);

-- ★ من لم يذكر `updated_at` يُختَم له تلقائيًّا — وهذا كلُّ كودِ البوّابة.
DO $$
DECLARE after_ts timestamptz;
BEGIN
  UPDATE sync_state SET watermark = '2026-09-02T10:00:00Z' WHERE path = 'Items_Master';
  SELECT updated_at INTO after_ts FROM sync_state WHERE path = 'Items_Master';

  IF after_ts = '2020-01-01T00:00:00Z'::timestamptz THEN
    RAISE EXCEPTION '  ✘ الختمُ التلقائيُّ لم يتحرّك — الحارسُ انكسر';
  END IF;
  RAISE NOTICE '  ✔ الختمُ التلقائيُّ يعمل لمن لم يذكره (%)', after_ts;
END $$;

-- ★★★ ومن ذكره صراحةً يُحترم — وهذا ما يجعل المرآةَ صادقة.
DO $$
DECLARE got timestamptz;
BEGIN
  UPDATE sync_state
     SET watermark = '2026-09-03T10:00:00Z',
         updated_at = '2020-01-01T00:00:00Z'
   WHERE path = 'Items_Master';
  SELECT updated_at INTO got FROM sync_state WHERE path = 'Items_Master';

  IF got <> '2020-01-01T00:00:00Z'::timestamptz THEN
    RAISE EXCEPTION '  ✘ الختمُ الصريحُ دُهس — المرآةُ تخترع زمنًا (got=%)', got;
  END IF;
  RAISE NOTICE '  ✔ الختمُ الصريحُ محفوظ — المرآةُ تعكس ولا تخترع';
END $$;


\echo ''
\echo '════ ٤ · الكتابةُ الفارغةُ لا تلمس الصفّ ════'

SELECT must_pass('صنفٌ للتجربة',
  $$INSERT INTO items (sku, name_ar, base_uom, updated_at)
    VALUES ('PROOF-SYNC-1', 'صنف بيّنة', 'piece', '2026-09-01T10:00:00Z')$$);

-- ★★★ نفسُ الصفّ بنفس القيم ⇒ `WHERE … IS DISTINCT FROM` يُسقط التحديث،
--     فلا يُطلق المشغّلُ، فلا يتغيّر الختم. وهذا هو ما يجعل «صفرَ فرقٍ»
--     ممكنًا أصلًا في `reconcile`.
DO $$
DECLARE got timestamptz;
BEGIN
  INSERT INTO items (sku, name_ar, base_uom, updated_at)
  VALUES ('PROOF-SYNC-1', 'صنف بيّنة', 'piece', '2026-09-01T10:00:00Z')
  ON CONFLICT (sku) DO UPDATE SET
    name_ar = EXCLUDED.name_ar,
    base_uom = EXCLUDED.base_uom,
    updated_at = EXCLUDED.updated_at
  WHERE (items.name_ar, items.base_uom, items.updated_at)
     IS DISTINCT FROM (EXCLUDED.name_ar, EXCLUDED.base_uom, EXCLUDED.updated_at);

  SELECT updated_at INTO got FROM items WHERE sku = 'PROOF-SYNC-1';
  IF got <> '2026-09-01T10:00:00Z'::timestamptz THEN
    RAISE EXCEPTION '  ✘ دورةٌ بلا تغييرٍ دهست الختم (got=%) — المرآةُ تكذب', got;
  END IF;
  RAISE NOTICE '  ✔ دورةٌ بلا تغييرٍ لا تلمس الصفّ';
END $$;

-- وتغييرٌ حقيقيٌّ يمرّ ويُحترم ختمُه.
DO $$
DECLARE got timestamptz; nm text;
BEGIN
  INSERT INTO items (sku, name_ar, base_uom, updated_at)
  VALUES ('PROOF-SYNC-1', 'اسمٌ جديد', 'piece', '2026-09-05T09:00:00Z')
  ON CONFLICT (sku) DO UPDATE SET
    name_ar = EXCLUDED.name_ar,
    base_uom = EXCLUDED.base_uom,
    updated_at = EXCLUDED.updated_at
  WHERE (items.name_ar, items.base_uom, items.updated_at)
     IS DISTINCT FROM (EXCLUDED.name_ar, EXCLUDED.base_uom, EXCLUDED.updated_at);

  SELECT updated_at, name_ar INTO got, nm FROM items WHERE sku = 'PROOF-SYNC-1';
  IF nm <> 'اسمٌ جديد' THEN RAISE EXCEPTION '  ✘ التغييرُ الحقيقيُّ لم يمرّ'; END IF;
  IF got <> '2026-09-05T09:00:00Z'::timestamptz THEN
    RAISE EXCEPTION '  ✘ ختمُ المصدر لم يُحترم (got=%)', got;
  END IF;
  RAISE NOTICE '  ✔ التغييرُ الحقيقيُّ يمرّ بختم المصدر';
END $$;


\echo ''
\echo '════ ٥ · عرضُ الكلفة يجيب السؤالَ اليوميّ ════'

DO $$
DECLARE reads bigint;
BEGIN
  SELECT firestore_reads INTO reads FROM sync_cost_daily LIMIT 1;
  IF reads IS NULL OR reads < 1 THEN
    RAISE EXCEPTION '  ✘ عرضُ الكلفة لا يحسب القراءات';
  END IF;
  RAISE NOTICE '  ✔ عرضُ الكلفة يعمل — قراءاتُ اليوم %', reads;
END $$;


-- ★ ولا أثرَ يبقى: البيّنةُ تُعاد ألفَ مرّةٍ على قاعدةٍ فيها بياناتٌ حقيقيّة.
ROLLBACK;

\echo ''
\echo '✔ بيّنةُ المزامنة تامّة — وكلُّ حارسٍ أُطلق ورُفض بعينه.'
