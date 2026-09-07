-- ═══════════════════════════════════════════════════════════════════════════
--  المزامنةُ الدوريّة — حالتُها وسجلُّها، وإصلاحُ حارسٍ يفسد المرآة
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ترحيلٌ لا تعديلَ لملفٍّ سابق: ملفّاتُ `schema/` تُنفَّذ **مرّةً واحدةً عند
--  أوّل إنشاء**، وقاعدةُ المالك قائمةٌ فعلًا بـ١١٧٣ صنفًا. فما يُغيَّر يُغيَّر
--  هنا — ويعمل في الحالتين: على قاعدةٍ قائمةٍ بـ`psql -f`، وعلى قاعدةٍ جديدةٍ
--  لأنّ الترتيبَ بالاسم يضع 005 بعد 001.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
--  ★★★ إصلاحُ `set_updated_at` — الحارسُ الذي كان سيكذب في كلّ صفٍّ مرآة
--
--  النسخةُ السابقة: `NEW.updated_at := now()` بلا شرط. ومعناها أنّ كلَّ كتابةٍ
--  من المزامنة **تدهس ختمَ Firestore بساعة الحاوية**. والنتيجةُ عطبان:
--
--    ١. `reconcile` لا يبلغ «صفرَ فرقٍ» أبدًا على هذا العمود — فيصير الفرقُ
--       المزمنُ ضجيجًا يُعتاد عليه، وتحته يختبئ الفرقُ الحقيقيّ.
--    ٢. و`documents.updated_at` يصير «متى لمستها المزامنة» لا «متى تغيّر
--       المستند» — فيكذب على كلّ من يقرؤه بعد التحويل.
--
--  والإصلاحُ **يشدّ الحارسَ ولا يُرخيه**: يبقى الختمُ تلقائيًّا لمن لم يذكره
--  (وهو كلُّ كودِ البوّابة)، ويُحترم لمن ذكره صراحةً (وهي المزامنةُ وحدَها).
--  وهذا هو معنى «المرآةُ تعكس ولا تخترع».
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ───────────────────────────────────────────────────────────────────────────
--  حالةُ المزامنة — العلامةُ المائيّةُ لكلّ مسار.
--
--  ★ تُحفظ **في القاعدة لا في ملفٍّ داخل الحاوية**: الحاويةُ تُعاد وتُحذف،
--    والعلامةُ الضائعةُ تعني إعادةَ قراءةِ كلّ شيءٍ من Firestore — أي بالضبط
--    فاتورةَ القراءة التي نهرب منها.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_state (
  path        text PRIMARY KEY,
  -- نمطُ القراءة الذي قُرّر لهذا المسار: incremental | full
  mode        text NOT NULL,
  -- حقلُ العلامة (`updatedAt` · `at`) — و NULL للمسحِ الكامل.
  mark_field  text,
  -- أقصى قيمةٍ **قُرئت فعلًا**، لا وقتُ التشغيل. NULL = لم يُقرأ بعد.
  watermark   timestamptz,
  last_run_at timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER sync_state_touch BEFORE UPDATE ON sync_state
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ───────────────────────────────────────────────────────────────────────────
--  سجلُّ الدورات — البيّنةُ التي بلا مثلِها لا تُغلق الخطوة.
--
--  ★★ **الفشلُ يُسمّى ولا يُبتلع.** سطرٌ لكلّ مسارٍ في كلّ دورة: ماذا قُرئ،
--     وماذا كُتب، وكم استعلامًا كلّف، وإن فشل فبأيّ رسالة. ومزامنةٌ تفشل
--     صامتةً تُنتج فرقًا لا يُكتشف إلّا حين يُسأل المخزنُ عن رصيدٍ لا يجده.
--
--  ★ وملحقٌ-فقط بحارسٍ أصليّ: السجلُّ الذي يُنقَّح ليس سجلًّا.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_log (
  id           bigserial PRIMARY KEY,
  -- معرّفُ الدورة — كلُّ مسارات الدورة الواحدة تحمله، فتُقرأ الدورةُ جملةً.
  cycle_id     text NOT NULL,
  path         text NOT NULL,
  mode         text NOT NULL,
  mark_field   text,

  -- نافذةُ القراءة الفعليّة (العلامةُ ناقصَ التداخل) — تُسجَّل كي يُعاد بناءُ
  -- ما قرأناه بالضبط عند تحقيقِ أيّ فرق.
  window_start timestamptz,
  watermark_before timestamptz,
  watermark_after  timestamptz,

  -- ★ الكلفةُ تُسجَّل صراحةً: `queries` هو ما تحاسبنا عليه Firestore
  --   (قراءةٌ لكلّ استعلامٍ ولو عاد فارغًا)، و`docs_read` ما عاد فعلًا.
  queries      integer NOT NULL DEFAULT 0,
  docs_read    integer NOT NULL DEFAULT 0,
  rows_written integer NOT NULL DEFAULT 0,

  ok           boolean NOT NULL,
  error        text,

  started_at   timestamptz NOT NULL,
  finished_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sync_log_cycle ON sync_log (cycle_id);
CREATE INDEX IF NOT EXISTS sync_log_started ON sync_log (started_at DESC);
CREATE INDEX IF NOT EXISTS sync_log_failures ON sync_log (started_at DESC) WHERE NOT ok;

CREATE OR REPLACE TRIGGER sync_log_append_only
  BEFORE UPDATE OR DELETE ON sync_log
  FOR EACH ROW EXECUTE FUNCTION deny_write();


-- ───────────────────────────────────────────────────────────────────────────
--  عرضٌ يجيب السؤالَ الوحيد الذي يُسأل يوميًّا: كم كلّفتنا المزامنةُ أمس؟
--  ★ ويُقارن بـ٥٠٬٠٠٠ (الحصّةُ المجّانيّة) وبـ٢٠٬٠٠٠ (السقفُ الذي التزمناه).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW sync_cost_daily AS
SELECT
  date_trunc('day', started_at)          AS day,
  sum(queries)                           AS firestore_reads,
  sum(docs_read)                         AS docs_read,
  sum(rows_written)                      AS rows_written,
  count(*) FILTER (WHERE NOT ok)         AS failures,
  count(DISTINCT cycle_id)               AS cycles
FROM sync_log
GROUP BY 1
ORDER BY 1 DESC;


INSERT INTO schema_migrations (version) VALUES ('005-sync')
  ON CONFLICT (version) DO NOTHING;
