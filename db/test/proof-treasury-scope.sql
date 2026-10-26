-- ═══════════════════════════════════════════════════════════════════════════
--  بيّنةُ نطاق الخزينة (§5 × §7) — ورديّةُ كلِّ محلٍّ لأعضائه؛ والمديرُ الكلّ؛
--  وعاريُ الرمز صفرًا؛ ووردية بلا محلٍّ للمديرين وحدهم.
--
--  التشغيل:
--    docker exec -i warehouse-postgres psql -U warehouse -d warehouse -v ON_ERROR_STOP=1 < db/test/proof-treasury-scope.sql
-- ═══════════════════════════════════════════════════════════════════════════

\set QUIET on
\pset format unaligned
\pset tuples_only on

BEGIN;

INSERT INTO organizations (id, name_ar) VALUES ('O1', 'منشأة');
INSERT INTO shops (id, org_id, name_ar) VALUES ('S1', 'O1', 'محل ١'), ('S2', 'O1', 'محل ٢');
INSERT INTO users (uid, name, role, active) VALUES ('uA', 'أ', 'viewer', true), ('uB', 'ب', 'viewer', true), ('uC', 'ج', 'viewer', true);
INSERT INTO shop_memberships (user_uid, shop_id) VALUES ('uA', 'S1'), ('uB', 'S2');

-- ورديّاتٌ: واحدةٌ لكلّ محلّ، وواحدةٌ بلا محلّ.
INSERT INTO cash_sessions (id, opening_balance, shop_id) VALUES ('CS-1', 1000, 'S1'), ('CS-2', 2000, 'S2'), ('CS-X', 0, NULL);
INSERT INTO cash_movements (session_id, seq, kind, method, amount) VALUES ('CS-1', 0, 'cash_sale', 'cash', 500);

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
SELECT chk('المالكُ يرى الورديّاتِ الثلاث', (SELECT count(*) FROM cash_sessions), 3);
SELECT chk('عاريُ الرمز لا يرى ورديّة', seen('cash_sessions', NULL, NULL), 0);

\echo ''
\echo '════ ١ · الوردية: عضوُ المحلّ يرى ورديّتَه وحدها ════'
SELECT chk('العضوُ أ يرى ورديّةَ S1 وحدها', seen('cash_sessions', 'uA'), 1);
SELECT chk('العضوُ ب يرى ورديّةَ S2 وحدها', seen('cash_sessions', 'uB'), 1);
SELECT chk('غيرُ العضو ج لا يرى ورديّة', seen('cash_sessions', 'uC'), 0);
SELECT chk('المديرُ يرى الكلّ (ومنها بلا محلّ)', seen('cash_sessions', 'mgr', 'albarshi.96@gmail.com'), 3);

\echo ''
\echo '════ ٢ · الحركات: تتبع نطاقَ ورديّتها ════'
SELECT chk('العضوُ أ يرى حركةَ ورديّته', seen('cash_movements', 'uA'), 1);
SELECT chk('العضوُ ب لا يرى حركاتِ محلٍّ آخر', seen('cash_movements', 'uB'), 0);
SELECT chk('المديرُ يرى الحركة', seen('cash_movements', 'mgr', 'albarshi.96@gmail.com'), 1);


ROLLBACK;

\echo ''
\echo '✔ انتهت بيّنةُ نطاق الخزينة — أُلغيت المعاملةُ بلا أثر.'
