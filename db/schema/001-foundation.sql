-- ═══════════════════════════════════════════════════════════════════════════
--  الأساس — سجلُّ الترحيلات وأدواتٌ مشتركة
-- ═══════════════════════════════════════════════════════════════════════════
--  PostgreSQL قياسيٌّ بحت: لا خاصّيّةَ واحدةً من خواصّ مزوّدٍ بعينه.
--  ما يعمل هنا يعمل حرفيًّا على Neon وعلى سيرفر الشركة.
-- ═══════════════════════════════════════════════════════════════════════════

-- سجلُّ ما طُبِّق — كي لا يُطبَّق ترحيلٌ مرّتين ولا يُنسى واحد.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────────────────
--  ختمُ التعديل — يقابل `serverTimestamp()` في Firestore.
--  الفرق لصالحنا: الساعةُ ساعةُ الخادم دائمًا، فلا يزوّرها جهازٌ مضبوطٌ خطأً.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ───────────────────────────────────────────────────────────────────────────
--  حارسُ الإلحاق-فقط.
--
--  `AGENTS.md` ينصّ: «المجموعات الملحقة-فقط **مقدّسة**» — `audit` · `scans` ·
--  `events` · `stock_moves` · `assignments` · `control` · `attachments`:
--  لا تعديلَ ولا حذفَ على سجلّاتها.
--
--  ★ وهنا يصير النصُّ حديدًا: في Firestore القاعدةُ تُنشر يدويًّا من الكونسول
--    وتحمي المسارَ الذي تعرفه وحده. وهنا المنعُ في القاعدة نفسها، فيسقط
--    التعديلُ ولو جاء من psql مباشرةً أو من سكربتٍ لم يكتبه أحدُنا.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION deny_write() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'الجدول «%» ملحَقٌ-فقط: لا تعديلَ ولا حذفَ على سجلّاته (%).',
    TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

-- ───────────────────────────────────────────────────────────────────────────
--  حارسُ «يُكتب مرّةً واحدة» — يقابل `numberWriteOnce` و`immutableKept`
--  و`originKept` و`identityKept` في `firestore.rules`.
--
--  الاستعمال:  CREATE TRIGGER … EXECUTE FUNCTION write_once('number', 'type');
--  حقلٌ فارغ (NULL أو '') يجوز ملؤه مرّةً؛ وبعد أن يُملأ لا يتغيّر ولا يُفرَّغ.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION write_once() RETURNS trigger AS $$
DECLARE
  col  text;
  before_val text;
  after_val  text;
BEGIN
  FOREACH col IN ARRAY TG_ARGV LOOP
    EXECUTE format('SELECT ($1).%I::text', col) INTO before_val USING OLD;
    EXECUTE format('SELECT ($1).%I::text', col) INTO after_val  USING NEW;

    IF before_val IS NOT NULL AND before_val <> ''
       AND before_val IS DISTINCT FROM after_val THEN
      RAISE EXCEPTION
        'الحقل «%» في «%» يُكتب مرّةً واحدة: «%» ⇐ «%» مرفوض.',
        col, TG_TABLE_NAME, before_val, COALESCE(after_val, 'NULL');
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

INSERT INTO schema_migrations (version) VALUES ('001-foundation')
  ON CONFLICT (version) DO NOTHING;
