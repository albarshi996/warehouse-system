-- ═══════════════════════════════════════════════════════════════════════════
--  الصفوفُ المرفوضة — لأنّ صفًّا فاسدًا لا يجوز أن يُسقط ألفًا سليمًا
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ★★★ **العطبُ الذي أنشأ هذا الجدول، وقع في أوّل تشغيلٍ حيٍّ (2026-09-09):**
--      باركودٌ واحدٌ مكرَّرٌ في Firestore رفضته القاعدة، **فسقطت الدفعةُ كلُّها
--      وبقيت ١١٧٣ صنفًا خارج المرآة**. ورقمُ مستندٍ واحدٌ مكرَّرٌ أسقط ١٧٥
--      مستندًا. أي أنّ **صفًّا فاسدًا واحدًا كان يُعطّل المزامنةَ إلى الأبد** —
--      وهي تُعيد المحاولةَ كلَّ دقيقتين وتفشل الفشلَ نفسَه.
--
--  ★★ والحلُّ ليس تجاهلَ الفاسد: **يُسمّى ويُخزَّن**. الصفُّ المرفوض يبقى
--     مذكورًا بمعرّفه وسببِه هنا حتّى يُصلَح في المصدر — فلا هو ضاع صامتًا،
--     ولا هو حبس الباقي.
--
--  ★ والعلامةُ المائيّةُ تتقدّم رغم الرفض. ولولا هذا الجدول لكان ذلك فقدًا
--    صامتًا؛ ومعه يصير **دَينًا معلومًا يُقرأ باستعلامٍ واحد**.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sync_rejects (
  path        text NOT NULL,
  doc_id      text NOT NULL,
  reason      text NOT NULL,
  first_seen  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now(),
  attempts    integer NOT NULL DEFAULT 1,
  PRIMARY KEY (path, doc_id)
);

CREATE INDEX IF NOT EXISTS sync_rejects_seen ON sync_rejects (last_seen DESC);

ALTER TABLE sync_rejects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sync_rejects_read_admin ON sync_rejects;
CREATE POLICY sync_rejects_read_admin ON sync_rejects
  FOR SELECT TO web_user USING (is_admin());
GRANT SELECT ON sync_rejects TO web_user;

-- ★ ولا يُنسى: صفٌّ يُصلَح في المصدر يُحذف من هنا في الدورة التالية، فالجدولُ
--   الفارغُ هو الحالةُ السليمة — وامتلاؤه سؤالٌ يُطرح لا سجلٌّ يُؤرشَف.
COMMENT ON TABLE sync_rejects IS
  'صفوفٌ رفضتها قيودُ القاعدة أثناء المزامنة. الجدولُ الفارغُ = صفرُ دَين.';


INSERT INTO schema_migrations (version) VALUES ('007-sync-rejects')
  ON CONFLICT (version) DO NOTHING;
