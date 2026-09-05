-- ═══════════════════════════════════════════════════════════════════════════
--  الحرّاس — تثبيتُ ما ينصّ عليه الدستور في القاعدة نفسها
-- ═══════════════════════════════════════════════════════════════════════════
--  `AGENTS.md`: «المجموعاتُ الملحقة-فقط **مقدّسة**: لا تعديلَ ولا حذفَ.»
--
--  ★ الفرقُ عن اليوم ليس شكليًّا: في Firestore الحمايةُ قاعدةٌ **ينشرها المالك
--    يدويًّا من الكونسول**، فبينها وبين الريبو فجوةٌ زمنيّةٌ دائمًا، وتحمي
--    المسارَ الذي تعرفه وحدَه. وهنا المنعُ في القاعدة: يسقط التعديلُ ولو جاء
--    من psql أو من سكربتٍ لم يكتبه أحدُنا أو من مسارٍ نُسي.
--
--  والإدراجُ مسموحٌ دائمًا — «ملحَق-فقط» تعني: يُكتب ولا يُمحى.
-- ═══════════════════════════════════════════════════════════════════════════

-- الدفترُ لا يُعدَّل ولا يُحذف. حركةٌ خاطئةٌ تُعالَج **بحركةٍ عكسيّة** لا بمحوٍ —
-- وهذا ما يجعل الدفترَ دفترًا: أثرٌ لا يُنكَر.
CREATE TRIGGER stock_moves_append_only
  BEFORE UPDATE OR DELETE ON stock_moves
  FOR EACH ROW EXECUTE FUNCTION deny_write();

-- المستندُ المقيَّد لا يُقيَّد مرّتين (يقابل فحصَ `fresh.posted` في ledgerService).
CREATE OR REPLACE FUNCTION documents_no_double_post() RETURNS trigger AS $$
BEGIN
  IF OLD.posted AND NEW.posted AND OLD.posted_at IS DISTINCT FROM NEW.posted_at THEN
    RAISE EXCEPTION 'المستند «%» قُيّد من قبل — لا يُقيَّد مرّتين.', OLD.id;
  END IF;
  IF OLD.posted AND NOT NEW.posted THEN
    RAISE EXCEPTION 'المستند «%» مقيَّد — لا يُفكّ قيدُه.', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER documents_post_guard BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION documents_no_double_post();

INSERT INTO schema_migrations (version) VALUES ('004-guards')
  ON CONFLICT (version) DO NOTHING;
