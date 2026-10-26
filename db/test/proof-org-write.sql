-- ═══════════════════════════════════════════════════════════════════════════
--  بيّنةُ أبواب كتابة المحلات — تخويلٌ · idempotent · upsert العضويّة · FK.
--
--  التشغيل:
--    docker exec -i warehouse-postgres psql -U warehouse -d warehouse -v ON_ERROR_STOP=1 < db/test/proof-org-write.sql
-- ═══════════════════════════════════════════════════════════════════════════

\set QUIET on
\pset format unaligned
\pset tuples_only on

BEGIN;

CREATE OR REPLACE FUNCTION must_fail(label text, stmt text) RETURNS void AS $$
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE '  ✔ % — رُفض كما يجب (%)', label, left(SQLERRM, 55); RETURN;
  END;
  RAISE EXCEPTION '  ✘ % — مرّ ولم يُرفض!', label;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION must_pass(label text, stmt text) RETURNS void AS $$
BEGIN EXECUTE stmt; RAISE NOTICE '  ✔ % — مرّ كما يجب', label; END; $$ LANGUAGE plpgsql;

-- مستخدمٌ للعضويّة (بذرةٌ كمالك).
INSERT INTO users (uid, name, role, active) VALUES ('uX', 'س', 'viewer', true);

SELECT set_config('request.jwt.claims', '{"sub":"u-admin","email":"albarshi.96@gmail.com"}', true);


\echo ''
\echo '════ ١ · إنشاءُ المنشأة والمحل (idempotent) ════'
SELECT must_pass('إنشاءُ منشأة', $q$SELECT create_organization('O1', 'منشأة')$q$);
SELECT must_pass('إعادةُ الإنشاء لا تُضاعف',
  $q$DO $d$ DECLARE n int; BEGIN
       PERFORM create_organization('O1', 'اسمٌ آخر');
       SELECT count(*) INTO n FROM organizations WHERE id='O1';
       IF n <> 1 THEN RAISE EXCEPTION 'تكرار %', n; END IF;
     END $d$;$q$);
SELECT must_pass('إنشاءُ محلّ', $q$SELECT create_shop('S1', 'O1', 'محل ١', 'SH1')$q$);
SELECT must_fail('محلٌّ في منشأةٍ مجهولةٍ يُرفض', $q$SELECT create_shop('S2', 'لا-وجود', 'محل')$q$);


\echo ''
\echo '════ ٢ · إسنادُ العضويّة (upsert) ════'
SELECT must_pass('إسنادُ عضويّة', $q$SELECT set_shop_membership('uX', 'S1', 'staff', true)$q$);
SELECT must_pass('إعادةُ الإسناد تُحدِّث الدورَ والحالة لا تُضاعف',
  $q$DO $d$ DECLARE n int; r text; a boolean; BEGIN
       PERFORM set_shop_membership('uX', 'S1', 'manager', false);
       SELECT count(*), max(shop_role), bool_and(active) INTO n, r, a FROM shop_memberships WHERE user_uid='uX' AND shop_id='S1';
       IF n <> 1 THEN RAISE EXCEPTION 'تكرار %', n; END IF;
       IF r <> 'manager' OR a <> false THEN RAISE EXCEPTION 'لم يُحدَّث: % %', r, a; END IF;
     END $d$;$q$);
SELECT must_fail('عضويّةٌ لمستخدمٍ مجهولٍ تُرفض', $q$SELECT set_shop_membership('لا-أحد', 'S1')$q$);
SELECT must_fail('عضويّةٌ لمحلٍّ مجهولٍ تُرفض', $q$SELECT set_shop_membership('uX', 'لا-محلّ')$q$);


\echo ''
\echo '════ ٣ · التخويلُ والصلاحيّة ════'
SELECT set_config('request.jwt.claims', '{}', true);
SELECT must_fail('غيرُ المخوَّل لا يُنشئ منشأة', $q$SELECT create_organization('O-NO', 'x')$q$);

SELECT must_pass('دورُ الويب ينفّذ الأبواب ولا يكتب مباشرة',
  $q$DO $d$ BEGIN
       IF has_function_privilege('web_user','create_shop(text,text,text,text)','EXECUTE') IS NOT TRUE
         THEN RAISE EXCEPTION 'بلا تنفيذٍ لبابِ المحل'; END IF;
       IF has_table_privilege('web_user','shops','INSERT') THEN RAISE EXCEPTION 'web_user يملك INSERT للمحلات!'; END IF;
       IF has_table_privilege('web_user','shop_memberships','INSERT') THEN RAISE EXCEPTION 'INSERT للعضويّات!'; END IF;
     END $d$;$q$);


ROLLBACK;

\echo ''
\echo '✔ انتهت بيّنةُ أبواب كتابة المحلات — أُلغيت المعاملةُ بلا أثر.'
