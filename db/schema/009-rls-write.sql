-- ═══════════════════════════════════════════════════════════════════════════
--  خ٨ — صلاحيّةُ الكتابة داخل القاعدة نفسها (RLS)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ★★★ **والقياسُ قسم العملَ نصفين، ونصفُه مبنيٌّ منذ 001–004.** قواعدُ
--      الكتابة في `firestore.rules` تخلط شرطَين في جملةٍ واحدة: **من يكتب**
--      و**ماذا يُكتب**. والثاني موجودٌ في القاعدة فعلًا ولا يعرف المستدعي:
--
--        balances      CHECK (qty >= 0) · CHECK (qty_reserved >= 0)
--        counters      مشغّلُ counters_forward_only — seq يتقدّم ولا يرجع
--        stock_moves   مشغّلُ stock_moves_append_only — لا تعديلَ ولا حذف
--        documents     documents_write_once (الرقمُ مرّةً) · no_double_post
--        items         items_barcode_unique · items_identity
--
--      فهذا الملفُّ **نصفُ الهويّة وحدَه**. وما كان في Firestore شرطًا يتكرّر
--      في كلّ قاعدةٍ صار هنا قيدًا يُفحص مرّةً على كلّ مسار — **حتّى من
--      psql مباشرةً**، وهو ما لم تستطعه القواعد.
--
--  ★★ ولهذا لا تُعاد كتابةُ qty >= 0 في السياسة: شرطٌ مكرّرٌ في موضعين
--     يفترقان يومًا، وأحدُهما يكذب. **القيدُ أصدقُ موضعٍ له لأنّه لا يُلتفّ.**
--
--  ⚠️ **وما لا يشمله هذا الملفّ — مُعلَنٌ لا منسيّ:** UPDATE على
--     documents (آلةُ الحالات: عشرةُ فروعٍ وapproveRoles/completeRoles
--     لكلّ نوعِ مستند). تبقى بلا سياسةٍ **فتُمنع افتراضًا** — وهذا أسلمُ من
--     سياسةٍ ناقصةٍ تفتح ما لا تقصد. وهي دفعةٌ مستقلّةٌ ببيّنتها.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
--  مجموعاتُ الأدوار — نقلًا حرفيًّا عن firestore.rules (٢٥–١٤٣)
--
--  ★ والنمطُ واحدٌ في كلّ دالّة: مديرُ التمهيد، أو مصادَقٌ **له ملفٌّ ونشِط**
--    ودورُه في القائمة. فجُمع في in_roles() كي لا يُكتب خمسَ مرّاتٍ فتُنسى
--    is_active() في إحداها — وهذا بالضبط ما يقع حين يُكرَّر الشرط.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION in_roles(VARIADIC names text[]) RETURNS boolean AS $fn$
  SELECT is_bootstrap_admin()
      OR (signed_in() AND has_profile() AND is_active() AND my_role() = ANY(names));
$fn$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION is_fleet_writer() RETURNS boolean AS $fn$
  SELECT in_roles('admin', 'warehouse_manager', 'fleet');
$fn$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION is_labor_writer() RETURNS boolean AS $fn$
  SELECT in_roles('admin', 'warehouse_manager', 'labor_supervisor');
$fn$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION is_stock_actor() RETURNS boolean AS $fn$
  SELECT in_roles('admin', 'warehouse_manager', 'storekeeper', 'qc_inspector',
                  'gate_officer', 'purchase_officer', 'return_manager',
                  'inventory_auditor', 'finance_manager', 'fleet',
                  'scm_manager', 'receiving_unit', 'putaway_unit', 'picking_unit');
$fn$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION is_van_sales_writer() RETURNS boolean AS $fn$
  SELECT in_roles('admin', 'warehouse_manager', 'sales_rep', 'sales_supervisor');
$fn$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION is_procurement_actor() RETURNS boolean AS $fn$
  SELECT in_roles('admin', 'warehouse_manager', 'department_user',
                  'purchase_officer', 'finance_manager', 'treasury');
$fn$ LANGUAGE sql STABLE;

-- من يحجز رقمًا رسميًّا. والمشاهدُ وحدَه خارجها فلا يحرق أرقامًا.
CREATE OR REPLACE FUNCTION can_reserve_number() RETURNS boolean AS $fn$
  SELECT is_stock_actor() OR is_fleet_writer()
      OR is_procurement_actor() OR is_van_sales_writer();
$fn$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION
  in_roles(text[]), is_fleet_writer(), is_labor_writer(), is_stock_actor(),
  is_van_sales_writer(), is_procurement_actor(), can_reserve_number()
TO web_anon, web_user;


-- ───────────────────────────────────────────────────────────────────────────
--  النمطُ الأوّل — جداولُ المرجع: المديرُ يكتب، والمشرفُ العامُّ للمستخدمين.
--  (Items_Master/warehouses: allow write: if isManager() · users: isAdmin())
--
--  ★ وallow write في Firestore تشمل الإنشاءَ والتعديلَ **والحذف** معًا —
--    فتُفتح الثلاثةُ هنا بنفس الشرط لا الاثنتان. وWarehouseManager.jsx يحذف
--    مخزنًا فعلًا، فلو مُنع الحذفُ لانكسرت شاشةٌ قائمة.
-- ───────────────────────────────────────────────────────────────────────────
DO $do$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('items', 'is_manager()'),
                                 ('warehouses', 'is_manager()'),
                                 ('users', 'is_admin()')) AS v(t, guard)
  LOOP
    EXECUTE format('GRANT INSERT, UPDATE, DELETE ON %I TO web_user', r.t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.t || '_insert', r.t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.t || '_update', r.t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.t || '_delete', r.t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO web_user WITH CHECK (%s)',
                   r.t || '_insert', r.t, r.guard);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO web_user USING (%s) WITH CHECK (%s)',
                   r.t || '_update', r.t, r.guard, r.guard);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO web_user USING (%s)',
                   r.t || '_delete', r.t, r.guard);
  END LOOP;
END $do$;


-- ───────────────────────────────────────────────────────────────────────────
--  النمطُ الثاني — counters: حجزُ رقمٍ ذرّيّ.
--
--  الأصل: create: canReserveNumber() && seq == 1
--         update: canReserveNumber() && seq == resource.seq + 1
--
--  ★★ و«+١» **لا تُكتب هنا**: مشغّلُ counters_forward_only يحرسها على كلّ
--     مسار. فالسياسةُ تسأل عن الهويّة وحدَها، والمشغّلُ عن التسلسل.
--     وازدواجُ الشرط في موضعين هو ما يفترق يومًا.
-- ───────────────────────────────────────────────────────────────────────────
GRANT INSERT, UPDATE ON counters TO web_user;
DROP POLICY IF EXISTS counters_insert ON counters;
DROP POLICY IF EXISTS counters_update ON counters;
CREATE POLICY counters_insert ON counters FOR INSERT TO web_user
  WITH CHECK (can_reserve_number() AND seq = 1);
CREATE POLICY counters_update ON counters FOR UPDATE TO web_user
  USING (can_reserve_number()) WITH CHECK (can_reserve_number());


-- ───────────────────────────────────────────────────────────────────────────
--  النمطُ الثالث — balances: الفاعلُ المخزنيُّ أو بائعُ الشاحنة.
--
--  ★★★ وقيدا qty >= 0 وqty_reserved >= 0 **ليسا هنا وهذا مقصود**: هما CHECK
--      في 003/004. والثاني يُغلق عطبًا سمّاه الكودُ بنفسه «بيعٌ مزدوج» —
--      وكان في Firestore بلا حارسٍ إطلاقًا في applyReservation.
--  ★ ولا حذف: allow delete: if false — فلا سياسةَ حذفٍ ولا GRANT.
-- ───────────────────────────────────────────────────────────────────────────
GRANT INSERT, UPDATE ON balances TO web_user;
DROP POLICY IF EXISTS balances_insert ON balances;
DROP POLICY IF EXISTS balances_update ON balances;
CREATE POLICY balances_insert ON balances FOR INSERT TO web_user
  WITH CHECK (is_stock_actor() OR is_van_sales_writer());
CREATE POLICY balances_update ON balances FOR UPDATE TO web_user
  USING (is_stock_actor() OR is_van_sales_writer())
  WITH CHECK (is_stock_actor() OR is_van_sales_writer());


-- ───────────────────────────────────────────────────────────────────────────
--  النمطُ الرابع — stock_moves: إنشاءٌ باسم فاعله، ولا تعديلَ ولا حذف.
--
--  ★★ والقاعدةُ الأصل تعدّد **١٣ حقلًا يجب ألّا يتغيّر** في التعديل — وهي
--     طريقةُ Firestore في قول «ملحَقٌ فقط». وهنا تسقط كلُّها: لا GRANT
--     للتعديل أصلًا، ومشغّلُ stock_moves_append_only يرفض من أيّ مسار.
--     **ثلاثةَ عشرَ شرطًا تصير لا شيءَ لأنّ البنيةَ صارت تقول المعنى.**
-- ───────────────────────────────────────────────────────────────────────────
GRANT INSERT ON stock_moves TO web_user;
DROP POLICY IF EXISTS stock_moves_insert ON stock_moves;
CREATE POLICY stock_moves_insert ON stock_moves FOR INSERT TO web_user
  WITH CHECK (
    (is_stock_actor() OR is_van_sales_writer())
    AND posted_by_uid = auth_uid()
  );


-- ───────────────────────────────────────────────────────────────────────────
--  النمطُ الخامس — documents: الإنشاءُ والمحو. **والتعديلُ مؤجَّلٌ بإعلان.**
--
--  الإنشاء: فاعلٌ من الأربعة · باسمه · مسوّدةً · **بلا رقم**.
--  ★ و«بلا رقم» شرطٌ جوهريٌّ لا شكليّ: الرقمُ يُحجز من counters بمعاملةٍ
--    مستقلّة، فمستندٌ يولد برقمٍ يعني رقمًا لم يُحجز — أي تسلسلٌ مكسور.
--
--  المحو: نُقل حرفيًّا عن الرقعة التي أمر المالكُ بتطبيقها 2026-10-02 —
--  **بلا رقمٍ · مسوّدةٌ أو مرفوض · غيرُ مقيَّد · منشئُه أو مديرٌ**.
--
--  ⚠️ **وتبعةٌ مفتوحةٌ تُقرَّر قبل جدول الأحداث:** محوُ المستند في Firestore
--     **لا يمحو مجموعاتِه الفرعيّة** فيبقى قيدُ التدقيق يتيمًا — وهو مقصودٌ
--     هناك. وحين يُبنى جدولُ الأحداث الموحَّد بمفتاحٍ أجنبيّ: CASCADE يمحو
--     قيدَ تدقيقٍ يمنعه «الملحقة-فقط مقدّسة»، وRESTRICT يمنع المحوَ أصلًا.
--     **فلا نظيرَ مجّانيَّ لليتيم — يُقرَّر ولا يُفترض.**
-- ───────────────────────────────────────────────────────────────────────────
GRANT INSERT, DELETE ON documents TO web_user;
DROP POLICY IF EXISTS documents_insert ON documents;
DROP POLICY IF EXISTS documents_delete ON documents;
CREATE POLICY documents_insert ON documents FOR INSERT TO web_user
  WITH CHECK (
    (is_stock_actor() OR is_procurement_actor()
     OR is_labor_writer() OR is_van_sales_writer())
    AND created_by_uid = auth_uid()
    AND state = 'draft'
    AND number IS NULL
  );
CREATE POLICY documents_delete ON documents FOR DELETE TO web_user
  USING (
    signed_in()
    AND number IS NULL
    AND state IN ('draft', 'rejected')
    AND posted IS NOT TRUE
    AND (created_by_uid = auth_uid() OR is_admin())
  );


-- ───────────────────────────────────────────────────────────────────────────
--  حارسٌ ختاميّ — لا جدولَ يُمنح كتابةً بلا سياسةٍ تحكمها.
--
--  ★★★ لأنّ GRANT بلا سياسةٍ على جدولٍ مفعَّلٍ عليه RLS يعطي **صفرَ صفوف**
--      (فيبدو مقفلًا)، لكنّ GRANT على جدولٍ **غيرِ** مفعَّلٍ يعطي الكلَّ.
--      فالخطرُ أن يُنشأ جدولٌ جديدٌ ويُمنح ولا يُفعَّل — فيُفتح بابٌ صامت.
-- ───────────────────────────────────────────────────────────────────────────
DO $do$
DECLARE bad text;
BEGIN
  SELECT string_agg(DISTINCT g.table_name, ', ') INTO bad
  FROM information_schema.role_table_grants g
  JOIN pg_class c ON c.relname = g.table_name
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE g.grantee = 'web_user'
    AND g.privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
    AND NOT c.relrowsecurity;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'جداولُ كتابةٍ بلا RLS: %', bad;
  END IF;
  RAISE NOTICE 'كلُّ جدولٍ يُكتب محروسٌ بـRLS.';
END $do$;


INSERT INTO schema_migrations (version) VALUES ('009-rls-write')
  ON CONFLICT (version) DO NOTHING;
