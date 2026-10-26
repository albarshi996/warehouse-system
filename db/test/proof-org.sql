-- ═══════════════════════════════════════════════════════════════════════════
--  بيّنةُ صلاحيّة المحلات (§5) — النطاقُ صفًّا صفًّا: العضوُ يرى محلَّه، لا غيرَه؛
--  والمديرُ يرى الكلّ؛ وعاريُ الرمز لا يرى شيئًا.
--
--  ★★★ المزلق: مالكُ الجدول يتجاوز RLS. فيبدأ الملفُّ بإثبات أنّ عاريَ الرمز
--      يرى صفرًا — وإلّا فالقياسُ بلا معنى.
--
--  التشغيل:
--    docker exec -i warehouse-postgres psql -U warehouse -d warehouse -v ON_ERROR_STOP=1 < db/test/proof-org.sql
-- ═══════════════════════════════════════════════════════════════════════════

\set QUIET on
\pset format unaligned
\pset tuples_only on

BEGIN;

-- بذرةٌ: منشأتان، ثلاثةُ محلات (O1 فيه S1·S2، وO2 فيه S3)، وثلاثةُ مستخدمين.
INSERT INTO organizations (id, name_ar) VALUES ('O1', 'منشأة أولى'), ('O2', 'منشأة ثانية');
INSERT INTO shops (id, org_id, code, name_ar) VALUES
  ('S1', 'O1', 'SH1', 'محل ١'), ('S2', 'O1', 'SH2', 'محل ٢'), ('S3', 'O2', 'SH3', 'محل ٣');
INSERT INTO users (uid, name, role, active) VALUES
  ('uA', 'أ', 'viewer', true), ('uB', 'ب', 'viewer', true), ('uC', 'ج', 'viewer', true), ('uD', 'د', 'viewer', true);
INSERT INTO shop_memberships (user_uid, shop_id) VALUES ('uA', 'S1'), ('uB', 'S2');
-- عضوٌ **معطَّل** (active=false) — يحرس `AND active` في دالّتَي النطاق.
INSERT INTO shop_memberships (user_uid, shop_id, active) VALUES ('uD', 'S1', false);

-- عددُ الصفوف المرئيّة لهويّةٍ بعينها عبر RLS (SET ROLE web_user).
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
\echo '════ ٠ · القياسُ حقيقيّ (المالك يرى، عاريُ الرمز لا) ════'
SELECT chk('المالكُ يرى المحلاتِ الثلاثة', (SELECT count(*) FROM shops), 3);
SELECT chk('عاريُ الرمز لا يرى محلًّا', seen('shops', NULL, NULL), 0);

\echo ''
\echo '════ ١ · المحل: العضوُ يرى محلَّه وحده ════'
SELECT chk('العضوُ أ يرى محلَّه S1 وحده', seen('shops', 'uA'), 1);
SELECT chk('العضوُ ب يرى محلَّه S2 وحده', seen('shops', 'uB'), 1);
SELECT chk('غيرُ العضو ج لا يرى محلًّا', seen('shops', 'uC'), 0);
SELECT chk('العضوُ المعطَّل د لا يرى محلَّه (حارسُ active)', seen('shops', 'uD'), 0);
SELECT chk('العضوُ المعطَّل د لا يرى منشأتَه', seen('organizations', 'uD'), 0);
SELECT chk('المديرُ (بالبريد) يرى الكلّ', seen('shops', 'mgr', 'albarshi.96@gmail.com'), 3);

\echo ''
\echo '════ ٢ · المنشأة: تُرى بعضويّة محلٍّ فيها ════'
SELECT chk('العضوُ أ يرى منشأتَه O1 وحدها', seen('organizations', 'uA'), 1);
SELECT chk('غيرُ العضو ج لا يرى منشأة', seen('organizations', 'uC'), 0);
SELECT chk('المديرُ يرى المنشأتين', seen('organizations', 'mgr', 'albarshi.96@gmail.com'), 2);

\echo ''
\echo '════ ٣ · العضويّات: صاحبُها وحده أو المدير ════'
SELECT chk('العضوُ أ يرى عضويّتَه وحدها', seen('shop_memberships', 'uA'), 1);
SELECT chk('المديرُ يرى العضويّاتِ الثلاث (ومنها المعطَّلة)', seen('shop_memberships', 'mgr', 'albarshi.96@gmail.com'), 3);


ROLLBACK;

\echo ''
\echo '✔ انتهت بيّنةُ صلاحيّة المحلات — أُلغيت المعاملةُ بلا أثر.'
