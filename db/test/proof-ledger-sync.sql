-- ═══════════════════════════════════════════════════════════════════════════
--  بيّنةُ كتابة الدفتر بالمزامنة — `post_journal_local` (024) تحرس التوازنَ
--  والتكرارَ والفترةَ المقفلة كـ`post_journal`، لكنّ تخويلَها بالمنح لا بالدعوى:
--  **محجوبةٌ عن دور الويب تمامًا**، وتُوسم قيودَها آليًّا `sync`/`system`.
--
--  التشغيل:
--    docker exec -i warehouse-postgres psql -U warehouse -d warehouse -v ON_ERROR_STOP=1 < db/test/proof-ledger-sync.sql
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
\echo '════ ١ · الترحيلُ عبر باب المزامنة — بلا رمزٍ (عمليّةُ خادمٍ موثوقة) ════'
-- لا set_config لدعاوى الرمز: الدالّةُ لا تشترط is_manager()، والتخويلُ بالمنح.
SELECT must_pass('ترحيلُ قيدٍ متوازن',
  $q$SELECT post_journal_local('L-1', DATE '2026-10-21', 400000,
     '[{"account":"CASH","debit":400000,"credit":0},{"account":"AR","party":"C-1","debit":0,"credit":400000}]'::jsonb,
     'سند قبض', 'RCP', 'doc-rcp-1')$q$);

SELECT must_pass('القيدُ مُوسَمٌ آليًّا sync/system مع أثرِ المصدر',
  $q$DO $d$
     DECLARE u text; r text; st text; sid text;
     BEGIN
       SELECT created_by_uid, created_by_role, source_type, source_id
         INTO u, r, st, sid FROM journal_entries WHERE key = 'L-1';
       IF u <> 'sync' OR r <> 'system' THEN RAISE EXCEPTION 'الوسمُ خطأ: %/%', u, r; END IF;
       IF st <> 'RCP' OR sid <> 'doc-rcp-1' THEN RAISE EXCEPTION 'الأثرُ خطأ: %/%', st, sid; END IF;
     END $d$;$q$);

SELECT must_pass('إعادةُ الترحيل لا تُضاعف (القفزُ لا الرفض)',
  $q$DO $d$
     DECLARE n integer;
     BEGIN
       PERFORM post_journal_local('L-1', DATE '2026-10-21', 400000,
         '[{"account":"CASH","debit":400000,"credit":0},{"account":"AR","debit":0,"credit":400000}]'::jsonb);
       SELECT count(*) INTO n FROM journal_entries WHERE key = 'L-1';
       IF n <> 1 THEN RAISE EXCEPTION 'تكرار: % صفوف للمفتاح نفسه', n; END IF;
     END $d$;$q$);


\echo ''
\echo '════ ٢ · الباب يرفض ما لا يُقبل — كلُّ حرّاس post_journal باقية ════'
SELECT must_fail('قيدٌ غير متوازن',
  $q$SELECT post_journal_local('L-UNBAL', DATE '2026-10-21', 1000,
     '[{"account":"CASH","debit":1000,"credit":0},{"account":"AR","debit":0,"credit":900}]'::jsonb)$q$);

SELECT must_fail('المجموعُ لا يطابق المعلَن',
  $q$SELECT post_journal_local('L-AMT', DATE '2026-10-21', 999,
     '[{"account":"CASH","debit":500,"credit":0},{"account":"AR","debit":0,"credit":500}]'::jsonb)$q$);

SELECT must_fail('قيدٌ قبل حدّ الافتتاح',
  $q$SELECT post_journal_local('L-OLD', DATE '2026-10-01', 500,
     '[{"account":"CASH","debit":500,"credit":0},{"account":"AR","debit":0,"credit":500}]'::jsonb)$q$);

SELECT must_fail('سطرٌ واحدٌ (القيدُ المزدوج سطران فأكثر)',
  $q$SELECT post_journal_local('L-ONE', DATE '2026-10-21', 500,
     '[{"account":"CASH","debit":500,"credit":0}]'::jsonb)$q$);

SELECT must_fail('سطرٌ مدينٌ ودائنٌ معًا',
  $q$SELECT post_journal_local('L-SIDE', DATE '2026-10-21', 100,
     '[{"account":"CASH","debit":100,"credit":100},{"account":"AR","debit":0,"credit":100}]'::jsonb)$q$);


\echo ''
\echo '════ ٣ · التخويلُ بالمنح: محجوبةٌ عن دور الويب تمامًا ════'
SELECT must_pass('web_user وweb_anon بلا تنفيذٍ لباب المزامنة',
  $q$DO $d$
     BEGIN
       IF has_function_privilege('web_user',
            'post_journal_local(text,date,bigint,jsonb,text,text,text,text,text)', 'EXECUTE')
         THEN RAISE EXCEPTION 'web_user يملك تنفيذَ باب المزامنة!'; END IF;
       IF has_function_privilege('web_anon',
            'post_journal_local(text,date,bigint,jsonb,text,text,text,text,text)', 'EXECUTE')
         THEN RAISE EXCEPTION 'web_anon يملك تنفيذَ باب المزامنة!'; END IF;
     END $d$;$q$);


ROLLBACK;

\echo ''
\echo '✔ انتهت بيّنةُ كتابة الدفتر بالمزامنة — أُلغيت المعاملةُ بلا أثر.'
