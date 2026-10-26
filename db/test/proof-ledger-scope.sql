-- ═══════════════════════════════════════════════════════════════════════════
--  بيّنةُ نطاق القيد (§5 × §6) — قيدُ كلِّ محلٍّ وسطورُه لأعضائه؛ المديرُ الكلّ؛
--  عاريُ الرمز صفرًا؛ وقيدٌ بلا محلٍّ للمديرين وحدهم.
--
--  التشغيل:
--    docker exec -i warehouse-postgres psql -U warehouse -d warehouse -v ON_ERROR_STOP=1 < db/test/proof-ledger-scope.sql
-- ═══════════════════════════════════════════════════════════════════════════

\set QUIET on
\pset format unaligned
\pset tuples_only on

BEGIN;

INSERT INTO organizations (id, name_ar) VALUES ('O1', 'منشأة');
INSERT INTO shops (id, org_id, name_ar) VALUES ('S1', 'O1', 'محل ١'), ('S2', 'O1', 'محل ٢');
INSERT INTO users (uid, name, role, active) VALUES ('uA', 'أ', 'viewer', true), ('uB', 'ب', 'viewer', true), ('uC', 'ج', 'viewer', true);
INSERT INTO shop_memberships (user_uid, shop_id) VALUES ('uA', 'S1'), ('uB', 'S2');

-- قيودٌ متوازنة: لكلّ محلٍّ قيدٌ، وواحدٌ بلا محلّ.
INSERT INTO journal_entries (key, entry_date, amount, shop_id) VALUES
  ('JE-1', '2026-10-21', 1000, 'S1'), ('JE-2', '2026-10-21', 2000, 'S2'), ('JE-X', '2026-10-21', 500, NULL);
INSERT INTO journal_lines (entry_key, line_index, account, debit, credit) VALUES
  ('JE-1', 0, 'CASH', 1000, 0), ('JE-1', 1, 'AR', 0, 1000),
  ('JE-2', 0, 'CASH', 2000, 0), ('JE-2', 1, 'AR', 0, 2000),
  ('JE-X', 0, 'CASH', 500, 0),  ('JE-X', 1, 'AR', 0, 500);

CREATE OR REPLACE FUNCTION seen(tbl text, uid text, email text DEFAULT NULL) RETURNS bigint AS $$
DECLARE n bigint; claims text;
BEGIN
  claims := CASE WHEN uid IS NULL AND email IS NULL THEN '{}'
                 ELSE json_build_object('sub', uid, 'email', email)::text END;
  PERFORM set_config('request.jwt.claims', claims, true);
  EXECUTE 'SET LOCAL ROLE web_user';
  EXECUTE format('SELECT count(*) FROM %I', tbl) INTO n;
  RESET ROLE;
  RETURN n;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION chk(label text, got bigint, want bigint) RETURNS void AS $$
BEGIN
  IF got <> want THEN RAISE EXCEPTION '  ✘ %: رأى % والمتوقَّع %', label, got, want; END IF;
  RAISE NOTICE '  ✔ % — رأى % كما يجب', label, got;
END; $$ LANGUAGE plpgsql;


\echo ''
\echo '════ ٠ · القياسُ حقيقيّ ════'
SELECT chk('المالكُ يرى القيودَ الثلاثة', (SELECT count(*) FROM journal_entries), 3);
SELECT chk('عاريُ الرمز لا يرى قيدًا', seen('journal_entries', NULL, NULL), 0);

\echo ''
\echo '════ ١ · القيد: عضوُ المحلّ يرى قيدَ محلِّه وحده ════'
SELECT chk('العضوُ أ يرى قيدَ S1 وحده', seen('journal_entries', 'uA'), 1);
SELECT chk('العضوُ ب يرى قيدَ S2 وحده', seen('journal_entries', 'uB'), 1);
SELECT chk('غيرُ العضو ج لا يرى قيدًا', seen('journal_entries', 'uC'), 0);
SELECT chk('المديرُ يرى الكلّ (ومنها بلا محلّ)', seen('journal_entries', 'mgr', 'albarshi.96@gmail.com'), 3);

\echo ''
\echo '════ ٢ · السطور: تتبع نطاقَ قيدها ════'
SELECT chk('العضوُ أ يرى سطرَي قيده', seen('journal_lines', 'uA'), 2);
SELECT chk('العضوُ ب لا يرى سطورَ محلٍّ آخر', seen('journal_lines', 'uB'), 2);
SELECT chk('المديرُ يرى السطورَ الستّة', seen('journal_lines', 'mgr', 'albarshi.96@gmail.com'), 6);


ROLLBACK;

\echo ''
\echo '✔ انتهت بيّنةُ نطاق القيد — أُلغيت المعاملةُ بلا أثر.'
