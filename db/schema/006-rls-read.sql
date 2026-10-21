-- ═══════════════════════════════════════════════════════════════════════════
--  خ٥أ — صلاحيّةُ القراءة داخل القاعدة نفسها (RLS)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ★★★ **٩٨ قاعدةَ قراءةٍ تنطوي في تسعةِ أنماطٍ لا غير** — قِيست سطرًا سطرًا
--      من `firestore.rules` (2026-09-09). و**٨٨ منها `signedIn()` وحدَها**:
--      أيُّ مستخدمٍ مصادَقٍ يقرأ. والبقيّةُ تسعُ حالاتٍ مسمّاة.
--      فالخطّةُ قدّرت «٩٩ قاعدةً = أقلُّ من ثلث العمل»، والحقيقةُ **تسعُ
--      سياساتٍ**. والقياسُ هو الفرق.
--
--  ★★ ولماذا RLS لا خادمٌ يُكتب يدًا؟ لأنّ الصلاحيّةَ حينها تصير كودًا يسهل
--     تجاوزُه بمسارٍ نُسي. وهنا: لا يتجاوزها سكربتٌ لم نكتبه، ولا `psql`
--     مباشرةً، ولا مسارٌ جديدٌ في التطبيق. وهذا نظيرُ `firestore.rules` بعينه.
--
--  ⚠️ **هذه الخطوةُ قراءةٌ فقط.** لا `INSERT` ولا `UPDATE` ولا `DELETE` يُمنح
--     لأيّ دورِ ويب هنا. الكتابةُ خطوةٌ مستقلّة (خ٨) بسياساتها ونقضِها.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
--  دورا الويب — والفصلُ بينهما هو الفصلُ بين «داخل» و«خارج».
--
--  `web_anon`: بلا رمزٍ صالح. لا يقرأ شيئًا — ولا حتّى قائمةَ الأدوار.
--  `web_user`: برمزٍ صالح. تُطبَّق عليه السياسات صفًّا صفًّا.
--
--  ★ و`NOLOGIN`: لا يدخل بهما أحدٌ مباشرةً؛ الخادمُ وحدَه يتقمّصهما.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_anon') THEN
    CREATE ROLE web_anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_user') THEN
    CREATE ROLE web_user NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO web_anon, web_user;


-- ───────────────────────────────────────────────────────────────────────────
--  الهويّة — تُقرأ من دعاوى الرمز، لا من وسيطٍ يمرّره المستدعي.
--
--  ★★★ **`SECURITY DEFINER` ضرورةٌ لا تسهيل.** سياسةُ `users` تستدعي
--      `my_role()`، و`my_role()` يقرأ `users`. فلو نُفّذت بصلاحيّة المستدعي
--      لاستدعت السياسةَ نفسَها — تعاودٌ لا نهائيّ ترفضه القاعدة. والتنفيذُ
--      بصلاحيّة المالك يتجاوز RLS **لقراءة سطر الهويّة وحدَه**، وهو ما يفعله
--      Firestore حرفيًّا في `get(/users/$(uid))` داخل قواعده.
--
--  ★★ و`STABLE`: تُحسب مرّةً في الاستعلام لا لكلّ صفّ. الفرقُ بين مسحٍ واحدٍ
--     ومسحٍ لكلّ صفٍّ في جدولٍ بألفٍ ومئةٍ وثلاثةٍ وسبعين صنفًا.
--
--  ★ و`search_path` مثبَّتٌ في كلّ دالّةِ `SECURITY DEFINER`: بدونه يستطيع
--    مستدعٍ أن يزرع جدولَ `users` في مخطّطٍ يسبق `public` فيخدع الدالّة.
-- ───────────────────────────────────────────────────────────────────────────

/** معرّفُ المستخدم من دعوى `sub` — و NULL إن لم يكن ثمّة رمز. */
CREATE OR REPLACE FUNCTION auth_uid() RETURNS text AS $$
  SELECT nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    ''
  );
$$ LANGUAGE sql STABLE;

/** بريدُ المستخدم من الرمز — يلزم لتمهيد المدير العام. */
CREATE OR REPLACE FUNCTION auth_email() RETURNS text AS $$
  SELECT nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'email',
    ''
  );
$$ LANGUAGE sql STABLE;

/** يقابل `signedIn()`. */
CREATE OR REPLACE FUNCTION signed_in() RETURNS boolean AS $$
  SELECT auth_uid() IS NOT NULL;
$$ LANGUAGE sql STABLE;

/** يقابل `hasProfile()`. */
CREATE OR REPLACE FUNCTION has_profile() RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE uid = auth_uid());
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

/** يقابل `myRole()`. */
CREATE OR REPLACE FUNCTION my_role() RETURNS text AS $$
  SELECT role FROM users WHERE uid = auth_uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

/**
 * يقابل `isActive()` — وغيابُ الحقل يُعامَل تفعيلًا (`active != false`)
 * كما في القواعد حرفيًّا، فلا ينكسر مستخدمٌ قديم.
 */
CREATE OR REPLACE FUNCTION is_active() RETURNS boolean AS $$
  SELECT coalesce((SELECT active FROM users WHERE uid = auth_uid()), true);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

/**
 * يقابل `isBootstrapAdmin()` — ويكسر الحلقةَ المفرغة نفسَها: بلا مستند دورٍ
 * لا صلاحيّة، وبلا صلاحيّةٍ لا يُنشأ مستندُ الدور.
 * ⚠️ والبريدُ مكرَّرٌ في ثلاثة مواضع (هنا · `firestore.rules` · `authService.js`)
 *    — يُغيَّر في الثلاثة معًا أو لا يُغيَّر.
 */
CREATE OR REPLACE FUNCTION is_bootstrap_admin() RETURNS boolean AS $$
  SELECT auth_email() = 'albarshi.96@gmail.com';
$$ LANGUAGE sql STABLE;

/** يقابل `isAdmin()`. */
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean AS $$
  SELECT is_bootstrap_admin()
      OR (signed_in() AND has_profile() AND is_active() AND my_role() = 'admin');
$$ LANGUAGE sql STABLE;

/** يقابل `isManager()`. */
CREATE OR REPLACE FUNCTION is_manager() RETURNS boolean AS $$
  SELECT is_bootstrap_admin()
      OR (signed_in() AND has_profile() AND is_active()
          AND my_role() IN ('admin', 'warehouse_manager'));
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION
  auth_uid(), auth_email(), signed_in(), has_profile(), my_role(),
  is_active(), is_bootstrap_admin(), is_admin(), is_manager()
TO web_anon, web_user;


-- ───────────────────────────────────────────────────────────────────────────
--  النمطُ الأوّل — «أيُّ مصادَقٍ يقرأ»: ٨٨ من ٩٨.
--
--  ⚠️ **ملاحظةٌ أمنيّةٌ تُنقل كما هي ولا تُصلَح هنا:** القواعدُ الحاليّة **لا
--     تشترط `isActive()` للقراءة** — فموظّفٌ أُوقف حسابُه يبقى قادرًا على
--     قراءة كلّ شيءٍ ما دام رمزُ دخوله صالحًا. نُقلت الحالُ كما هي عمدًا:
--     تشديدُها تغييرُ سلوكٍ يقرّره المالك، لا انزلاقٌ داخل هجرة.
--     (وتشديدُها لاحقًا سطرٌ واحد: `AND is_active()`.)
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['roles', 'warehouses', 'items', 'counters',
                           'documents', 'stock_moves', 'balances']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_read_signed_in', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO web_user USING (signed_in())',
      t || '_read_signed_in', t
    );
    EXECUTE format('GRANT SELECT ON %I TO web_user', t);
  END LOOP;
END $$;


-- ───────────────────────────────────────────────────────────────────────────
--  النمطُ الثاني — `users`: مديرٌ، أو مشرفُ مبيعات، أو صاحبُ السطر نفسُه.
--  (`isManager() || myRole() == 'sales_supervisor' || request.auth.uid == uid`)
--
--  ★ وهذا هو الجدولُ الوحيدُ في النواة الذي يرى فيه المستخدمُ **بعضَ** الصفوف
--    لا كلَّها — فهو الاختبارُ الحقيقيُّ لأنّ RLS يعمل صفًّا صفًّا لا جدولًا.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_read_self_or_manager ON users;
CREATE POLICY users_read_self_or_manager ON users
  FOR SELECT TO web_user
  USING (
    is_manager()
    OR my_role() = 'sales_supervisor'
    OR uid = auth_uid()
  );
GRANT SELECT ON users TO web_user;


-- ───────────────────────────────────────────────────────────────────────────
--  النمطُ الثالث — جداولُ التشغيل: للمدير العام وحدَه.
--
--  ★ `sync_log` يكشف وتيرةَ القراءة وأسماءَ المسارات وأخطاءَ الاتّصال —
--    معلوماتُ بنيةٍ لا معلوماتُ عمل. و`schema_migrations` كذلك.
--    ولا يقابلها شيءٌ في `firestore.rules` لأنّها لم توجد هناك أصلًا.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sync_state', 'sync_log', 'schema_migrations']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_read_admin', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO web_user USING (is_admin())',
      t || '_read_admin', t
    );
    EXECUTE format('GRANT SELECT ON %I TO web_user', t);
  END LOOP;
END $$;


-- ───────────────────────────────────────────────────────────────────────────
--  ★★★ الحارسُ الأخير — لا جدولَ يُضاف بلا سياسة.
--
--  الخطرُ الحقيقيُّ ليس سياسةً خاطئة؛ بل **جدولٌ جديدٌ يُنشأ غدًا ولا يُمنح
--  RLS**، فيبقى مفتوحًا لكلّ من يملك رمزًا — بلا خطأٍ ولا تحذير. فيُفحص
--  الأمرُ هنا صراحةً، ويسقط الترحيلُ إن نُسي جدول.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'جداولٌ بلا RLS: % — كلُّ جدولٍ يُحرَس أو يُستثنى بقرارٍ مكتوب.', missing;
  END IF;
  RAISE NOTICE 'كلُّ جداول public محروسةٌ بـRLS.';
END $$;


INSERT INTO schema_migrations (version) VALUES ('006-rls-read')
  ON CONFLICT (version) DO NOTHING;
