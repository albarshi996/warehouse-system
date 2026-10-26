-- ═══════════════════════════════════════════════════════════════════════════
--  بيّنةُ الخزينة — المتوقَّعُ والبطاقةُ خارج الدرج والتسكيرُ والتخويلُ والملحق-فقط.
--
--  التشغيل:
--    docker exec -i warehouse-postgres psql -U warehouse -d warehouse -v ON_ERROR_STOP=1 < db/test/proof-treasury.sql
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
\echo '════ ١ · فتحُ وردية وحركاتُها ════'
SELECT must_pass('فتحُ وردية',
  $q$INSERT INTO cash_sessions (id, shift, opening_balance, opened_by) VALUES ('S-EXP', 'صباحيّة', 100000, 'أحمد')$q$);

SELECT must_pass('إضافةُ حركاتٍ (نقد وبطاقة)',
  $q$INSERT INTO cash_movements (session_id, seq, kind, method, amount) VALUES
    ('S-EXP', 0, 'customer_receipt', 'cash', 40000),
    ('S-EXP', 1, 'customer_receipt', 'card', 25000),
    ('S-EXP', 2, 'expense', 'cash', 10000)$q$);


\echo ''
\echo '════ ٢ · المتوقَّع: البطاقةُ خارج الدرج ════'
SELECT must_pass('المتوقَّع = 100000 + 40000 − 10000 = 130000 (البطاقةُ مستبعدة)',
  $q$DO $d$
     DECLARE e bigint;
     BEGIN
       SELECT cash_session_expected('S-EXP') INTO e;
       IF e <> 130000 THEN RAISE EXCEPTION 'المتوقَّع % لا 130000', e; END IF;
     END $d$;$q$);


\echo ''
\echo '════ ٣ · التسكير: الفرقُ يحتاج سببًا ════'
-- عجزٌ 5000 بلا سبب → يُرفض (المتوقَّع 130000، المعدود 125000).
SELECT must_fail('فرقٌ بلا سببٍ يُرفض',
  $q$SELECT close_cash_session('S-EXP', 125000, '')$q$);
-- بسببٍ مكتوب → يُقبل، والفرقُ يُسجَّل لا يُحوَّل دَينًا.
SELECT must_pass('فرقٌ بسببٍ يُقبل ويُسجَّل',
  $q$SELECT close_cash_session('S-EXP', 125000, 'صرفٌ لم يُوثَّق', 'أحمد')$q$);


\echo ''
\echo '════ ٤ · لا إغلاقان، ولا إعادةُ فتح ════'
SELECT must_fail('تسكيرُ وردية مُسكَّرةٍ يُرفض',
  $q$SELECT close_cash_session('S-EXP', 130000, 'ثانٍ')$q$);
SELECT must_fail('إعادةُ فتح وردية مُسكَّرةٍ تُرفض',
  $q$UPDATE cash_sessions SET state = 'open' WHERE id = 'S-EXP'$q$);


\echo ''
\echo '════ ٥ · التسكيرُ المطابقُ بلا فرق ════'
SELECT must_pass('وردية ثانية: المعدودُ = المتوقَّع ⇒ صفرُ فرقٍ بلا سبب',
  $q$DO $d$
     DECLARE v bigint;
     BEGIN
       INSERT INTO cash_sessions (id, opening_balance) VALUES ('S-ZERO', 50000);
       INSERT INTO cash_movements (session_id, seq, kind, method, amount) VALUES ('S-ZERO', 0, 'cash_sale', 'cash', 20000);
       SELECT close_cash_session('S-ZERO', 70000, '') INTO v;  -- 50000 + 20000
       IF v <> 0 THEN RAISE EXCEPTION 'الفرقُ % لا صفر', v; END IF;
     END $d$;$q$);


\echo ''
\echo '════ ٦ · ملحق-فقط ════'
SELECT must_fail('تعديلُ حركةٍ يُرفض',
  $q$UPDATE cash_movements SET amount = 1 WHERE session_id = 'S-EXP' AND seq = 0$q$);
SELECT must_fail('حذفُ حركةٍ يُرفض',
  $q$DELETE FROM cash_movements WHERE session_id = 'S-EXP' AND seq = 0$q$);


\echo ''
\echo '════ ٧ · التخويلُ والصلاحيّة ════'
SELECT must_pass('وردية للتخويل',
  $q$INSERT INTO cash_sessions (id, opening_balance) VALUES ('S-AUTH', 10000)$q$);
SELECT set_config('request.jwt.claims', '{}', true);
SELECT must_fail('غيرُ المخوَّل لا يُسكّر',
  $q$SELECT close_cash_session('S-AUTH', 10000, '')$q$);

SELECT must_pass('دورُ الويب يقرأ ولا يكتب حركاتٍ مباشرة',
  $q$DO $d$
     BEGIN
       IF has_table_privilege('web_user','cash_sessions','SELECT') IS NOT TRUE
         THEN RAISE EXCEPTION 'web_user بلا قراءة'; END IF;
       IF has_table_privilege('web_user','cash_movements','INSERT')
         THEN RAISE EXCEPTION 'web_user يملك كتابةَ حركةٍ مباشرة!'; END IF;
     END $d$;$q$);


ROLLBACK;

\echo ''
\echo '✔ انتهت بيّنةُ الخزينة — أُلغيت المعاملةُ بلا أثر.'
