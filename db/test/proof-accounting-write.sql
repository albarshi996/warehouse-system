-- ═══════════════════════════════════════════════════════════════════════════
--  بيّنةُ بابِ الكتابة — `post_journal` تحرس التخويلَ والتوازنَ والتكرار،
--  وتكتب ذرّيًّا؛ ولا كتابةَ مباشرةً من دور الويب.
--
--  التشغيل:
--    docker exec -i warehouse-postgres psql -U warehouse -d warehouse -v ON_ERROR_STOP=1 < db/test/proof-accounting-write.sql
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


-- هويّةُ مديرٍ (المدير العام بالبريد) — تُقرأ من دعاوى الرمز كما في الإنتاج.
SELECT set_config('request.jwt.claims', '{"sub":"u-admin","email":"albarshi.96@gmail.com"}', true);

\echo ''
\echo '════ ١ · الترحيلُ الذرّيّ عبر الباب ════'
SELECT must_pass('ترحيلُ قيدٍ متوازن',
  $q$SELECT post_journal('W-1', DATE '2026-10-21', 400000,
     '[{"account":"CASH","debit":400000,"credit":0},{"account":"AR","party":"C-1","debit":0,"credit":400000}]'::jsonb,
     'سند قبض')$q$);

SELECT must_pass('إعادةُ الترحيل لا تُضاعف (القفزُ لا الرفض)',
  $q$DO $d$
     DECLARE n integer;
     BEGIN
       PERFORM post_journal('W-1', DATE '2026-10-21', 400000,
         '[{"account":"CASH","debit":400000,"credit":0},{"account":"AR","debit":0,"credit":400000}]'::jsonb);
       SELECT count(*) INTO n FROM journal_entries WHERE key = 'W-1';
       IF n <> 1 THEN RAISE EXCEPTION 'تكرار: % صفوف للمفتاح نفسه', n; END IF;
     END $d$;$q$);


\echo ''
\echo '════ ٢ · الباب يرفض ما لا يُقبل ════'
SELECT must_fail('قيدٌ غير متوازن',
  $q$SELECT post_journal('W-UNBAL', DATE '2026-10-21', 1000,
     '[{"account":"CASH","debit":1000,"credit":0},{"account":"AR","debit":0,"credit":900}]'::jsonb)$q$);

SELECT must_fail('المجموعُ لا يطابق المعلَن',
  $q$SELECT post_journal('W-AMT', DATE '2026-10-21', 999,
     '[{"account":"CASH","debit":500,"credit":0},{"account":"AR","debit":0,"credit":500}]'::jsonb)$q$);

SELECT must_fail('قيدٌ قبل حدّ الافتتاح',
  $q$SELECT post_journal('W-OLD', DATE '2026-10-01', 500,
     '[{"account":"CASH","debit":500,"credit":0},{"account":"AR","debit":0,"credit":500}]'::jsonb)$q$);

SELECT must_fail('سطرٌ مدينٌ ودائنٌ معًا',
  $q$SELECT post_journal('W-SIDE', DATE '2026-10-21', 100,
     '[{"account":"CASH","debit":100,"credit":100},{"account":"AR","debit":0,"credit":100}]'::jsonb)$q$);


\echo ''
\echo '════ ٣ · التخويل ════'
-- نزعُ الهويّة: لا مديرَ الآن.
SELECT set_config('request.jwt.claims', '{}', true);
SELECT must_fail('غيرُ المخوَّل لا يرحّل قيدًا',
  $q$SELECT post_journal('W-NOAUTH', DATE '2026-10-21', 100,
     '[{"account":"CASH","debit":100,"credit":0},{"account":"AR","debit":0,"credit":100}]'::jsonb)$q$);


\echo ''
\echo '════ ٤ · البابُ الواحد: تنفيذٌ نعم، كتابةٌ مباشرةٌ لا ════'
SELECT must_pass('دورُ الويب ينفّذ الباب ولا يملك INSERT مباشرًا',
  $q$DO $d$
     BEGIN
       IF has_function_privilege('web_user',
            'post_journal(text,date,bigint,jsonb,text,text,text,text,text)', 'EXECUTE') IS NOT TRUE
         THEN RAISE EXCEPTION 'web_user بلا تنفيذٍ للباب'; END IF;
       IF has_table_privilege('web_user', 'journal_entries', 'INSERT')
         THEN RAISE EXCEPTION 'web_user يملك INSERT مباشرًا!'; END IF;
       IF has_table_privilege('web_user', 'journal_lines', 'INSERT')
         THEN RAISE EXCEPTION 'web_user يملك INSERT للسطور!'; END IF;
     END $d$;$q$);


ROLLBACK;

\echo ''
\echo '✔ انتهت بيّنةُ بابِ الكتابة — أُلغيت المعاملةُ بلا أثر.'
