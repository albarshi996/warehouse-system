-- ═══════════════════════════════════════════════════════════════════════════
--  بيّنةُ أبواب كتابة الخزينة — الفتحُ والإضافةُ: تخويلٌ · idempotent · ترقيمٌ
--  ذرّيّ · لا حركةَ على مُسكَّرة · لا كتابةَ مباشرة.
--
--  التشغيل:
--    docker exec -i warehouse-postgres psql -U warehouse -d warehouse -v ON_ERROR_STOP=1 < db/test/proof-treasury-write.sql
-- ═══════════════════════════════════════════════════════════════════════════

\set QUIET on
\pset format unaligned
\pset tuples_only on

BEGIN;

CREATE OR REPLACE FUNCTION must_fail(label text, stmt text) RETURNS void AS $$
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '  ✔ % — رُفض كما يجب (%)', label, left(SQLERRM, 60); RETURN;
  END;
  RAISE EXCEPTION '  ✘ % — مرّ ولم يُرفض! الحارس لا يعمل.', label;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION must_pass(label text, stmt text) RETURNS void AS $$
BEGIN EXECUTE stmt; RAISE NOTICE '  ✔ % — مرّ كما يجب', label; END; $$ LANGUAGE plpgsql;

SELECT set_config('request.jwt.claims', '{"sub":"u-admin","email":"albarshi.96@gmail.com"}', true);


\echo ''
\echo '════ ١ · الفتحُ عبر الباب ════'
SELECT must_pass('فتحُ وردية',
  $q$SELECT open_cash_session('W-1', 'صباحيّة', 100000, 'أحمد')$q$);

SELECT must_pass('إعادةُ الفتح لا تُضاعف (القفزُ لا الرفض)',
  $q$DO $d$
     DECLARE n integer;
     BEGIN
       PERFORM open_cash_session('W-1', 'أخرى', 999999, 'آخر');
       SELECT count(*) INTO n FROM cash_sessions WHERE id = 'W-1';
       IF n <> 1 THEN RAISE EXCEPTION 'تكرار: % ورديّات', n; END IF;
     END $d$;$q$);


\echo ''
\echo '════ ٢ · الإضافةُ تُرقَّم ذرّيًّا ════'
SELECT must_pass('حركتان ⇒ seq 0 ثمّ 1',
  $q$DO $d$
     DECLARE s0 integer; s1 integer;
     BEGIN
       SELECT add_cash_movement('W-1', 'cash_sale', 'cash', 20000) INTO s0;
       SELECT add_cash_movement('W-1', 'expense', 'cash', 5000) INTO s1;
       IF s0 <> 0 OR s1 <> 1 THEN RAISE EXCEPTION 'الترقيم % ثمّ %', s0, s1; END IF;
     END $d$;$q$);

SELECT must_fail('نوعُ حركةٍ مجهولٌ يُرفض',
  $q$SELECT add_cash_movement('W-1', 'bogus_kind', 'cash', 100)$q$);


\echo ''
\echo '════ ٣ · لا حركةَ على وردية مُسكَّرة ════'
SELECT must_pass('فتحٌ ثمّ تسكيرٌ بلا فرق',
  $q$DO $d$
     BEGIN
       PERFORM open_cash_session('W-CLOSED', '', 0, 'أحمد');
       PERFORM close_cash_session('W-CLOSED', 0, '');  -- متوقَّع 0، معدود 0، فرقٌ صفر
     END $d$;$q$);

SELECT must_fail('إضافةُ حركةٍ لمُسكَّرةٍ تُرفض',
  $q$SELECT add_cash_movement('W-CLOSED', 'cash_sale', 'cash', 100)$q$);


\echo ''
\echo '════ ٤ · التخويلُ والصلاحيّة ════'
SELECT set_config('request.jwt.claims', '{}', true);
SELECT must_fail('غيرُ المخوَّل لا يفتح وردية',
  $q$SELECT open_cash_session('W-NOAUTH', '', 0, '')$q$);

SELECT must_pass('دورُ الويب ينفّذ البابَين ولا يكتب مباشرة',
  $q$DO $d$
     BEGIN
       IF has_function_privilege('web_user', 'open_cash_session(text,text,bigint,text,text)', 'EXECUTE') IS NOT TRUE
         THEN RAISE EXCEPTION 'بلا تنفيذٍ لبابِ الفتح'; END IF;
       IF has_function_privilege('web_user', 'add_cash_movement(text,text,text,bigint,text)', 'EXECUTE') IS NOT TRUE
         THEN RAISE EXCEPTION 'بلا تنفيذٍ لبابِ الإضافة'; END IF;
       IF has_table_privilege('web_user', 'cash_sessions', 'INSERT')
         THEN RAISE EXCEPTION 'web_user يملك INSERT للورديّات!'; END IF;
       IF has_table_privilege('web_user', 'cash_movements', 'INSERT')
         THEN RAISE EXCEPTION 'web_user يملك INSERT للحركات!'; END IF;
     END $d$;$q$);


ROLLBACK;

\echo ''
\echo '✔ انتهت بيّنةُ أبواب كتابة الخزينة — أُلغيت المعاملةُ بلا أثر.'
