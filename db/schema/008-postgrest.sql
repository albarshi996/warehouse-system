-- ═══════════════════════════════════════════════════════════════════════════
--  خ٥ب — دورُ الخادم: من يتّصل، ومن يتقمّص
-- ═══════════════════════════════════════════════════════════════════════════
--
--  PostgREST يتّصل بالقاعدة بدورٍ واحدٍ (`authenticator`)، ثمّ **يتقمّص** الدورَ
--  المذكور في الرمز لكلّ طلب. فالاتّصالُ واحدٌ والهويّةُ تتبدّل.
--
--  ★★★ **و`authenticator` بلا صلاحيّةٍ إطلاقًا** — لا جدولَ يقرؤه ولا يكتبه.
--      كلُّ ما يملكه: أن يصير `web_anon` أو `web_user`. ولهذا **تسريبُ كلمته
--      وحدَها لا يكشف صفًّا واحدًا**؛ يحتاج المسرِّبُ رمزًا صالحًا فوقها.
--      وهذا هو الفرقُ بين حسابِ خدمةٍ يفتح كلَّ شيء وحسابٍ يفتح البابَ فقط.
--
--  ★★ و`NOINHERIT` شرطٌ لا زينة: بدونه يرث `authenticator` صلاحيّاتِ
--     `web_user` **تلقائيًّا** فيقرأ بلا رمزٍ أصلًا — ويسقط كلُّ ما بنيناه
--     في `006-rls-read.sql` بصمت.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    -- كلمةُ المرور تُضبط من البيئة عند النشر، لا تُكتب هنا.
    CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD NULL;
  END IF;
END $$;

-- ★ يُعاد التأكيدُ في كلّ ترحيل: دورٌ ورث صلاحيّةً بالخطأ يفتح البابَ كلَّه.
ALTER ROLE authenticator NOINHERIT;

GRANT web_anon, web_user TO authenticator;
GRANT USAGE ON SCHEMA public TO authenticator;


-- ───────────────────────────────────────────────────────────────────────────
--  ★★★ حارسٌ يُطلَق الآن — لا يُترك للثقة.
--
--  الخطرُ: `GRANT`ٌ عريضٌ يُكتب يومًا (`GRANT ALL ON ALL TABLES TO PUBLIC`)
--  فيقرأ المجهولُ كلَّ شيءٍ **بلا رسالةِ خطأٍ واحدة**. فيُفحص هنا صراحةً.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE leaked text;
BEGIN
  -- لا جدولَ يقرؤه `web_anon` ولا `authenticator` مباشرةً.
  SELECT string_agg(DISTINCT c.relname, ', ')
    INTO leaked
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND (
      has_table_privilege('web_anon', c.oid, 'SELECT')
      OR has_table_privilege('authenticator', c.oid, 'SELECT')
    );

  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION
      'تسريبُ صلاحيّة: «%» مقروءةٌ لدورٍ لا يجوز له ذلك.', leaked;
  END IF;
  RAISE NOTICE 'لا جدولَ مقروءٌ لـweb_anon ولا لـauthenticator — الباب مغلق.';
END $$;


INSERT INTO schema_migrations (version) VALUES ('008-postgrest')
  ON CONFLICT (version) DO NOTHING;
