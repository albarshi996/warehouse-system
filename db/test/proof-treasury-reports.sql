-- ═══════════════════════════════════════════════════════════════════════════
--  بيّنةُ تقرير الوردية — session_summary يفصل النقدَ عن البنك والبطاقة بدقّة.
--
--  التشغيل:
--    docker exec -i warehouse-postgres psql -U warehouse -d warehouse -v ON_ERROR_STOP=1 < db/test/proof-treasury-reports.sql
-- ═══════════════════════════════════════════════════════════════════════════

\set QUIET on
\pset format unaligned
\pset tuples_only on

BEGIN;

INSERT INTO cash_sessions (id, opening_balance) VALUES ('CS-1', 100000);
INSERT INTO cash_movements (session_id, seq, kind, method, amount) VALUES
  ('CS-1', 0, 'customer_receipt', 'cash', 50000),
  ('CS-1', 1, 'expense',          'cash', 20000),
  ('CS-1', 2, 'customer_receipt', 'card', 25000),
  ('CS-1', 3, 'customer_receipt', 'bank', 15000);

CREATE OR REPLACE FUNCTION chk(label text, got bigint, want bigint) RETURNS void AS $$
BEGIN
  IF got <> want THEN RAISE EXCEPTION '  ✘ %: % والمتوقَّع %', label, got, want; END IF;
  RAISE NOTICE '  ✔ % = % كما يجب', label, got;
END; $$ LANGUAGE plpgsql;


\echo ''
\echo '════ ملخّصُ الوردية ════'
SELECT chk('رصيدُ البداية',  (SELECT opening   FROM session_summary('CS-1')), 100000);
SELECT chk('الواردُ النقديّ', (SELECT cash_in   FROM session_summary('CS-1')), 50000);
SELECT chk('الصادرُ النقديّ', (SELECT cash_out  FROM session_summary('CS-1')), 20000);
SELECT chk('المتوقَّع في الدرج (100000 + 50000 − 20000)', (SELECT expected FROM session_summary('CS-1')), 130000);
SELECT chk('صافي البنك (خارج الدرج)', (SELECT net_bank FROM session_summary('CS-1')), 15000);
SELECT chk('صافي البطاقة (خارج الدرج)', (SELECT net_card FROM session_summary('CS-1')), 25000);


ROLLBACK;

\echo ''
\echo '✔ انتهت بيّنةُ تقرير الوردية — أُلغيت المعاملةُ بلا أثر.'
