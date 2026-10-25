-- ═══════════════════════════════════════════════════════════════════════════
--  بيّنةُ المحاسبة — كلُّ حارسٍ يُطلَق مرّةً بعينه، وإلّا فهو غيرُ موجود.
--  (قرار المالك 2026-10-25: الدفترُ المحليّ يملك المحاسبة.)
--
--  التشغيل:
--    docker exec -i warehouse-postgres psql -U warehouse -d warehouse -v ON_ERROR_STOP=1 < db/test/proof-accounting.sql
-- ═══════════════════════════════════════════════════════════════════════════

\set QUIET on
\pset format unaligned
\pset tuples_only on

-- كلُّ ما يلي داخل معاملةٍ تُلغى في آخر الملفّ — فالبيّنةُ تُعاد بلا أثر، والدفترُ
-- ملحقٌ-فقط فلا يُنظَّف بالحذف أصلًا.
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
\echo '════ ١ · القيد المتوازن يُقبل ════'
SELECT must_pass('قيدٌ متوازن (قبض 400)',
  $q$DO $d$
     BEGIN
       INSERT INTO journal_entries (key, entry_date, amount, memo) VALUES ('P-BASE', '2026-10-21', 400000, 'سند قبض');
       INSERT INTO journal_lines (entry_key, line_index, account, debit, credit) VALUES
         ('P-BASE', 0, 'CASH', 400000, 0),
         ('P-BASE', 1, 'AR', 0, 400000);
       SET CONSTRAINTS journal_balanced_trg IMMEDIATE;
     END $d$;$q$);


\echo ''
\echo '════ ٢ · العقد ① — التوازن ════'
SELECT must_fail('قيدٌ غير متوازن يُرفض عند الفحص',
  $q$DO $d$
     BEGIN
       INSERT INTO journal_entries (key, entry_date, amount) VALUES ('P-UNBAL', '2026-10-21', 1000);
       INSERT INTO journal_lines (entry_key, line_index, account, debit, credit) VALUES
         ('P-UNBAL', 0, 'CASH', 1000, 0),
         ('P-UNBAL', 1, 'AR', 0, 900);
       SET CONSTRAINTS journal_balanced_trg IMMEDIATE;
     END $d$;$q$);

SELECT must_fail('السطرُ مدينٌ ودائنٌ معًا يُرفض',
  $q$INSERT INTO journal_lines (entry_key, line_index, account, debit, credit)
     VALUES ('P-BASE', 9, 'CASH', 100, 100)$q$);


\echo ''
\echo '════ ٣ · العقد ② — المفتاحُ الفريد ════'
SELECT must_fail('تكرارُ مفتاح القيد يُرفض',
  $q$INSERT INTO journal_entries (key, entry_date, amount) VALUES ('P-BASE', '2026-10-21', 400000)$q$);


\echo ''
\echo '════ ٤ · العقد ③ — ملحقٌ-فقط (لا تعديل ولا حذف) ════'
SELECT must_fail('تعديلُ قيدٍ مرحّل يُرفض',
  $q$UPDATE journal_entries SET memo = 'تلاعب' WHERE key = 'P-BASE'$q$);

SELECT must_fail('حذفُ قيدٍ مرحّل يُرفض',
  $q$DELETE FROM journal_entries WHERE key = 'P-BASE'$q$);

SELECT must_pass('التصحيحُ قيدٌ عكسيٌّ مرتبطٌ يُقبل',
  $q$DO $d$
     BEGIN
       INSERT INTO journal_entries (key, entry_date, amount, reverses, memo)
         VALUES ('P-BASE~REV', '2026-10-21', 400000, 'P-BASE', 'عكس P-BASE');
       INSERT INTO journal_lines (entry_key, line_index, account, debit, credit) VALUES
         ('P-BASE~REV', 0, 'AR', 400000, 0),
         ('P-BASE~REV', 1, 'CASH', 0, 400000);
       SET CONSTRAINTS journal_balanced_trg IMMEDIATE;
     END $d$;$q$);


\echo ''
\echo '════ ٥ · العقد ④ — الفترةُ المقفلة ════'
SELECT must_fail('قيدٌ قبل حدّ الافتتاح 2026-10-20 يُرفض',
  $q$INSERT INTO journal_entries (key, entry_date, amount) VALUES ('P-OLD', '2026-10-01', 1000)$q$);


\echo ''
\echo '════ ٦ · التكاملُ المرجعيّ ════'
SELECT must_fail('سطرٌ بحسابٍ مجهولٍ يُرفض',
  $q$INSERT INTO journal_lines (entry_key, line_index, account, debit, credit)
     VALUES ('P-BASE', 5, 'NOPE', 100, 0)$q$);

SELECT must_fail('قيمةٌ سالبةٌ تُرفض',
  $q$INSERT INTO journal_lines (entry_key, line_index, account, debit, credit)
     VALUES ('P-BASE', 6, 'CASH', -5, 0)$q$);


\echo ''
\echo '════ ٧ · الصلاحيّة (RLS) ════'
SELECT must_pass('RLS مفعّلةٌ على جداول المحاسبة الثلاثة',
  $q$DO $d$
     DECLARE n integer;
     BEGIN
       SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE ns.nspname = 'public' AND c.relname IN ('accounts','journal_entries','journal_lines')
           AND c.relrowsecurity;
       IF n <> 3 THEN RAISE EXCEPTION 'RLS ناقصةٌ: % من 3', n; END IF;
     END $d$;$q$);

SELECT must_pass('دورُ الويب يقرأ ولا يكتب (الكتابةُ بابُها أمرُ العمل)',
  $q$DO $d$
     BEGIN
       IF has_table_privilege('web_user','journal_entries','SELECT') IS NOT TRUE
         THEN RAISE EXCEPTION 'web_user بلا قراءة'; END IF;
       IF has_table_privilege('web_user','journal_entries','INSERT')
         THEN RAISE EXCEPTION 'web_user يملك كتابةَ رأسٍ!'; END IF;
       IF has_table_privilege('web_user','journal_lines','INSERT')
         THEN RAISE EXCEPTION 'web_user يملك كتابةَ سطرٍ!'; END IF;
     END $d$;$q$);


ROLLBACK;

\echo ''
\echo '✔ انتهت بيّنةُ المحاسبة — أُلغيت المعاملةُ بلا أثر.'
