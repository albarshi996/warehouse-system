-- ═══════════════════════════════════════════════════════════════════════════
--  بيّنةُ تقارير القيد — الأرصدةُ صحيحةٌ، و**ميزانُ المراجعة يساوي صفرًا**.
--
--  التشغيل:
--    docker exec -i warehouse-postgres psql -U warehouse -d warehouse -v ON_ERROR_STOP=1 < db/test/proof-reports.sql
-- ═══════════════════════════════════════════════════════════════════════════

\set QUIET on
\pset format unaligned
\pset tuples_only on

BEGIN;

-- قيدان متوازنان: فاتورةُ بيعٍ 5000 (مدين AR:C-1 / دائن SALES) وقبضٌ 400
-- (مدين CASH / دائن AR:C-1).
INSERT INTO journal_entries (key, entry_date, amount) VALUES ('JE-1', '2026-10-21', 5000), ('JE-2', '2026-10-21', 400);
INSERT INTO journal_lines (entry_key, line_index, account, party, debit, credit) VALUES
  ('JE-1', 0, 'AR', 'C-1', 5000, 0), ('JE-1', 1, 'SALES', '', 0, 5000),
  ('JE-2', 0, 'CASH', '', 400, 0),  ('JE-2', 1, 'AR', 'C-1', 0, 400);

CREATE OR REPLACE FUNCTION chk(label text, got bigint, want bigint) RETURNS void AS $$
BEGIN
  IF got <> want THEN RAISE EXCEPTION '  ✘ %: % والمتوقَّع %', label, got, want; END IF;
  RAISE NOTICE '  ✔ % = % كما يجب', label, got;
END; $$ LANGUAGE plpgsql;


\echo ''
\echo '════ ١ · أرصدةُ الحسابات ════'
SELECT chk('رصيد AR (5000 − 400)', account_balance('AR'), 4600);
SELECT chk('رصيد CASH', account_balance('CASH'), 400);
SELECT chk('رصيد SALES (دائنٌ سالب)', account_balance('SALES'), -5000);
SELECT chk('رصيد الطرف C-1', party_balance('C-1'), 4600);

\echo ''
\echo '════ ٢ · ميزانُ المراجعة ════'
SELECT chk('عددُ حسابات الميزان', (SELECT count(*) FROM trial_balance()), 3);
SELECT chk('★★★ مجموعُ أرصدة الميزان = صفرٌ (الدفترُ متوازن)',
  (SELECT COALESCE(SUM(balance), 0)::bigint FROM trial_balance()), 0);
SELECT chk('مجموعُ المدين = مجموعُ الدائن',
  (SELECT COALESCE(SUM(total_debit) - SUM(total_credit), 0)::bigint FROM trial_balance()), 0);


ROLLBACK;

\echo ''
\echo '✔ انتهت بيّنةُ التقارير — أُلغيت المعاملةُ بلا أثر.'
