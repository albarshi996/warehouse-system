-- ═══════════════════════════════════════════════════════════════════════════
--  ٠١٢ — طزاجةُ المرآة: سؤالٌ يملكه كلُّ مستخدمٍ داخل، لا المدير وحدَه
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ★★★ **لماذا هذا الملفُّ شرطٌ للهجين، لا تحسينٌ فيه:**
--
--      المحوَّلُ الهجينُ يقرأ الأصنافَ والمستنداتِ من المرآة. والمرآةُ تتأخّر
--      دقيقةً في الحال الطبيعيّة — وهذا مقبول. لكنّها تتأخّر **ساعاتٍ** حين
--      يُطفأ الحاسوبُ أو يتعثّر المزامن. وحينها تعرض البوّابةُ بياناتِ أمسِ
--      **بثقةٍ تامّةٍ وبلا رسالةِ تحذيرٍ واحدة** — وهذا هو الإفسادُ بعينه:
--      لا ينكسر شيءٌ يُرى، ويُتَّخذ قرارٌ على رقمٍ ميّت.
--
--      ⇒ فالمحوَّلُ يسأل عن الطزاجة قبل أن يثق، ويسقط إلى Firebase إن بَاتت.
--        **والسؤالُ يجب أن يملكه كلُّ من يستعمل البوّابة**، وإلّا سقط
--        المستخدمُ غيرُ المدير إلى Firebase دائمًا — فلا هجينَ أصلًا.
--
--  ★★ **ولماذا `SECURITY DEFINER` وليس سياسةً جديدةً على `sync_state`:**
--      لأنّ `sync_state` يحمل `watermark` — وهو علامةُ تقدّمِ المزامنة،
--      ومعرفتُه تكشف **متى يُقرأ ماذا**. والمطلوبُ هنا حرفان: المسارُ وعمرُه.
--      ففتحُ الجدول كلِّه لأجلهما **توسيعٌ لا داعيَ له**، وتعديلُ سياسةٍ قائمةٍ
--      مخاطرةٌ بما يعمل. فالدالّةُ تُعطي القدرَ المطلوب ولا تمسّ سياسةً.
--
--  ★ ولا تكتب شيئًا: `STABLE` وقراءةٌ واحدة. و`search_path` مثبَّتٌ كي لا
--    يُخطَف الاسمُ بجدولٍ في مخطَّطٍ آخر — وهو الفخُّ المعروف لدوالّ المُعرِّف.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.mirror_freshness()
RETURNS TABLE (path text, last_run_at timestamptz, age_seconds integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    s.path,
    s.last_run_at,
    CASE
      WHEN s.last_run_at IS NULL THEN NULL
      ELSE GREATEST(0, EXTRACT(EPOCH FROM (now() - s.last_run_at)))::integer
    END
  FROM sync_state s;
$$;

COMMENT ON FUNCTION public.mirror_freshness() IS
  'طزاجةُ المرآة لكلّ مسار — يقرؤها المحوَّلُ الهجين ليقرّر: من قاعدتنا أم من Firebase؟';

-- ★★★ والبابُ يُغلق أوّلًا ثمّ يُفتح لمن يستحقّ. و`REVOKE` من `PUBLIC`
--     ضروريٌّ لأنّ Postgres يمنح `EXECUTE` للجميع افتراضيًّا عند الإنشاء —
--     فإغفالُه يجعل الدالّةَ مفتوحةً لـ`web_anon` أيضًا، وهو ما تحرسه
--     البيّنةُ في `proof-rls-read.sql` بالنقض.
REVOKE ALL ON FUNCTION public.mirror_freshness() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mirror_freshness() TO web_user;

INSERT INTO schema_migrations (version) VALUES ('012-mirror-freshness')
  ON CONFLICT (version) DO NOTHING;
