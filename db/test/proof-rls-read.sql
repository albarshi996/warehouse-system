-- ═══════════════════════════════════════════════════════════════════════════
--  بيّنةُ صلاحيّة القراءة — كلُّ دورٍ × كلُّ جدول، بالإيجاب **وبالنقض**
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ★★★ **ومزلقٌ يُبطل البيّنةَ كلَّها لو نُسي:** مالكُ الجدول **يتجاوز RLS**.
--      فبيّنةٌ تُشغَّل بحساب `warehouse` ترى كلَّ شيءٍ دائمًا وتمرّ خضراءَ
--      ولو لم تكن ثمّة سياسةٌ واحدة. ولهذا يبدأ الملفُّ بإثبات العكس:
--      **يُقاس أنّ عاريَ الرمز لا يرى شيئًا** — وإلّا فما بعده بلا معنى.
--
--  التشغيل:
--    docker exec -i warehouse-postgres psql -U warehouse -d warehouse -v ON_ERROR_STOP=1 < db/test/proof-rls-read.sql
-- ═══════════════════════════════════════════════════════════════════════════

\set QUIET on
\pset format unaligned
\pset tuples_only on

BEGIN;

-- مستخدمٌ تجريبيٌّ لكلّ دورٍ من الأدوار الأربعة والعشرين.
INSERT INTO users (uid, name, role, active)
SELECT 'probe_' || id, 'مجرّب ' || label_ar, id, true FROM roles;

-- وموقوفٌ بدور مدير المستودع — لاختبار `is_active()`.
INSERT INTO users (uid, name, role, active)
VALUES ('probe_suspended', 'مدير موقوف', 'warehouse_manager', false);

-- صنفٌ ومستندٌ كي لا تكون الجداولُ فارغةً فتمرّ البيّنةُ بلا معنى.
INSERT INTO items (sku, name_ar, base_uom) VALUES ('RLS-PROBE-1', 'صنف بيّنة', 'piece');
INSERT INTO documents (id, type, state) VALUES ('RLS-PROBE-DOC', 'GRN', 'draft');

/** عددُ الصفوف المرئيّة في جدولٍ لهويّةٍ بعينها. */
CREATE OR REPLACE FUNCTION seen(tbl text, uid text, email text DEFAULT NULL)
RETURNS bigint AS $$
DECLARE n bigint; claims text;
BEGIN
  claims := CASE
    WHEN uid IS NULL AND email IS NULL THEN '{}'
    ELSE json_build_object('sub', uid, 'email', email)::text
  END;
  PERFORM set_config('request.jwt.claims', claims, true);
  EXECUTE 'SET LOCAL ROLE web_user';
  EXECUTE format('SELECT count(*) FROM %I', tbl) INTO n;
  RESET ROLE;
  RETURN n;
END;
$$ LANGUAGE plpgsql;


\echo ''
\echo '════ ٠ · البيّنةُ تقيس شيئًا أصلًا ════'

-- ★★★ لو سقط هذا، فكلُّ ما بعده كذبٌ مطمئنّ.
DO $$
DECLARE as_owner bigint; as_anon bigint;
BEGIN
  SELECT count(*) INTO as_owner FROM items;
  as_anon := seen('items', NULL, NULL);

  IF as_owner = 0 THEN RAISE EXCEPTION '  ✘ لا صفوفَ أصلًا — البيّنةُ فارغة'; END IF;
  IF as_anon <> 0 THEN
    RAISE EXCEPTION '  ✘ بلا رمزٍ يرى % صفًّا — السياساتُ لا تُطبَّق!', as_anon;
  END IF;
  RAISE NOTICE '  ✔ المالكُ يرى % وعاريُ الرمز يرى ٠ — القياسُ حقيقيّ', as_owner;
END $$;


\echo ''
\echo '════ ١ · الأدوارُ الأربعةُ والعشرون × الجداول العامّة ════'

-- النمطُ الأوّل: كلُّ مصادَقٍ يقرأ. يُجرَّب على **كلّ** دورٍ وكلّ جدول.
DO $$
DECLARE r record; t text; n bigint; total bigint; checks int := 0;
BEGIN
  FOREACH t IN ARRAY ARRAY['roles','warehouses','items','counters','documents','stock_moves','balances']
  LOOP
    EXECUTE format('SELECT count(*) FROM %I', t) INTO total;
    FOR r IN SELECT id FROM roles ORDER BY sort LOOP
      n := seen(t, 'probe_' || r.id);
      IF n <> total THEN
        RAISE EXCEPTION '  ✘ الدور «%» يرى % من % في «%»', r.id, n, total, t;
      END IF;
      checks := checks + 1;
    END LOOP;
  END LOOP;
  RAISE NOTICE '  ✔ % فحصًا (٢٤ دورًا × ٧ جداول): كلٌّ يرى ما يخصّه كاملًا', checks;
END $$;


\echo ''
\echo '════ ٢ · `users` — الرؤيةُ صفًّا صفًّا لا جدولًا ════'

DO $$
DECLARE total bigint; n bigint;
BEGIN
  SELECT count(*) INTO total FROM users;

  -- أمينُ المخزن: نفسَه لا غير.
  n := seen('users', 'probe_storekeeper');
  IF n <> 1 THEN RAISE EXCEPTION '  ✘ أمينُ المخزن يرى % مستخدمًا لا ١', n; END IF;
  RAISE NOTICE '  ✔ أمينُ المخزن يرى نفسَه وحدَه (١ من %)', total;

  -- المديرُ العام: الكلّ.
  n := seen('users', 'probe_admin');
  IF n <> total THEN RAISE EXCEPTION '  ✘ المديرُ يرى % من %', n, total; END IF;
  RAISE NOTICE '  ✔ المديرُ العام يرى الكلّ (%)', total;

  -- مديرُ المستودع: الكلّ (نصُّ `isManager`).
  n := seen('users', 'probe_warehouse_manager');
  IF n <> total THEN RAISE EXCEPTION '  ✘ مديرُ المستودع يرى % من %', n, total; END IF;
  RAISE NOTICE '  ✔ مديرُ المستودع يرى الكلّ';

  -- ★ الموقوف: يسقط من `isManager` فيعود إلى «نفسِه وحدَه». وهذا برهانُ
  --   أنّ `is_active()` موصولٌ فعلًا لا مكتوبٌ في تعليق.
  n := seen('users', 'probe_suspended');
  IF n <> 1 THEN
    RAISE EXCEPTION '  ✘ مديرٌ موقوفٌ يرى % مستخدمًا — `is_active` غيرُ موصول!', n;
  END IF;
  RAISE NOTICE '  ✔ المديرُ الموقوفُ يسقط إلى نفسِه وحدَه — `is_active` يعمل';
END $$;


\echo ''
\echo '════ ٣ · جداولُ التشغيل — للمدير العام وحدَه ════'

DO $$
DECLARE r record; n bigint; denied int := 0;
BEGIN
  FOR r IN SELECT id FROM roles WHERE id <> 'admin' ORDER BY sort LOOP
    n := seen('sync_log', 'probe_' || r.id);
    IF n <> 0 THEN RAISE EXCEPTION '  ✘ الدور «%» يقرأ sync_log', r.id; END IF;
    denied := denied + 1;
  END LOOP;
  RAISE NOTICE '  ✔ % دورًا مُنعت من sync_log', denied;

  -- والنقضُ الموجب: المديرُ يقرؤه فعلًا (وإلّا فالمنعُ ليس منعًا بل عطب).
  INSERT INTO sync_log (cycle_id, path, mode, ok, started_at)
  VALUES ('rls-probe', 'items', 'full', TRUE, now());
  n := seen('sync_log', 'probe_admin');
  IF n < 1 THEN RAISE EXCEPTION '  ✘ المديرُ لا يقرأ sync_log — منعٌ شاملٌ لا سياسة'; END IF;
  RAISE NOTICE '  ✔ والمديرُ يقرؤه (% صفًّا) — فالمنعُ سياسةٌ لا عطب', n;
END $$;


\echo ''
\echo '════ ٤ · تمهيدُ المدير العام بالبريد ════'

DO $$
DECLARE n bigint; total bigint;
BEGIN
  SELECT count(*) INTO total FROM users;

  -- هويّةٌ **بلا مستندِ دورٍ إطلاقًا**، لكنّ بريدَها بريدُ التمهيد.
  n := seen('users', 'uid_لا_وجود_له', 'albarshi.96@gmail.com');
  IF n <> total THEN
    RAISE EXCEPTION '  ✘ تمهيدُ المدير لا يعمل (% من %) — الحلقةُ المفرغةُ قائمة', n, total;
  END IF;
  RAISE NOTICE '  ✔ التمهيدُ بالبريد يكسر الحلقةَ المفرغة';

  -- والنقض: بريدٌ آخرُ بلا مستندِ دورٍ لا يرى إلّا لا شيء.
  n := seen('users', 'uid_غريب', 'someone.else@example.com');
  IF n <> 0 THEN RAISE EXCEPTION '  ✘ غريبٌ بلا مستندِ دورٍ يرى % مستخدمًا', n; END IF;
  RAISE NOTICE '  ✔ وغريبٌ بلا مستندِ دورٍ لا يرى أحدًا';
END $$;


ROLLBACK;

\echo ''
\echo '✔ بيّنةُ صلاحيّة القراءة تامّة — بالإيجاب وبالنقض، ولا أثرَ بقي.'
