-- ═══════════════════════════════════════════════════════════════════════════
--  خ٨ (ب) — آلةُ حالات المستند: التعديلُ المحكوم
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ★★★ **ولماذا مشغّلٌ لا سياسةُ RLS؟ ثقبٌ قِيس ولم يُفترض.**
--      في RLS: `USING` ترى الصفَّ **القديم** و`WITH CHECK` ترى **الجديد**،
--      ولا تعبيرَ يرى الاثنين معًا. والأسوأ: مع عدّة سياساتٍ تُجمع `USING`
--      بـOR وتُجمع `WITH CHECK` بـOR **كلٌّ على حدة** — فتنفتح نقلةٌ لا
--      يسمح بها أيُّ فرعٍ وحدَه. جُرّب على جدولٍ مختبريّ:
--
--        سياسةُ المعتمِد: USING(state='submitted') CHECK(state IN approved/rejected)
--        سياسةُ المنجِز : USING(state='approved')  CHECK(state IN done/closed)
--        ثمّ: UPDATE ... SET state='done' WHERE state='submitted'  ⟶  **UPDATE 1**
--
--      نجحت `submitted ⟶ done` لأنّ `USING` الأولى طابقت و`WITH CHECK`
--      الثانيةَ طابقت. **ولا فرعَ واحدٌ يسمح بها.**
--      ⇒ فالاقترانُ بين الحالة القديمة والجديدة **لا يُعبَّر عنه إلّا حيث
--        يُرى الاثنان**: مشغّلُ `BEFORE UPDATE`. والسياسةُ تبقى بوّابةً خشنة.
--
--  ★★ ويَسري على **مسار البوّابة وحدَه** (`current_user = 'web_user'`):
--     المزامنةُ تكتب بدور المالك، وهي **مرآةٌ تنقل ما وقع** في Firestore لا
--     فاعلٌ يُنشئ نقلة. ولو سرى عليها لرفض نقلَ مستندٍ اعتُمد أمس.
--     وهذا تمييزٌ بـ**الدور الأمنيّ** لا بعَلَمِ بيئةٍ يكذب في إحدى البيئتين.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
--  ما الذي تغيّر؟ — أسماءُ الأعمدة، و`extra` **مفتوحةٌ إلى مفاتيحَ فرعيّة**.
--
--  ★★★ ولولا الفتحُ لانفتح بابٌ واسع: `soAllocation` و`amended` و`dating`
--      كلُّها تعيش داخل `extra`. فلو عُدَّت `extra` مفتاحًا واحدًا، لكان
--      السماحُ بـ`soAllocation` **سماحًا بكلّ ما في `extra`** — ومنه
--      `amended` نفسُه. فتُفتح أبوابٌ باسم بابٍ واحد.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION changed_doc_keys(o jsonb, n jsonb) RETURNS text[] AS $fn$
  SELECT coalesce(array_agg(k ORDER BY k), ARRAY[]::text[]) FROM (
    SELECT key AS k FROM jsonb_object_keys(o || n) AS key
    WHERE key <> 'extra' AND (o -> key) IS DISTINCT FROM (n -> key)
    UNION
    SELECT 'extra.' || key FROM jsonb_object_keys(
             coalesce(o -> 'extra', '{}'::jsonb) || coalesce(n -> 'extra', '{}'::jsonb)) AS key
    WHERE (coalesce(o -> 'extra', '{}'::jsonb) -> key)
          IS DISTINCT FROM (coalesce(n -> 'extra', '{}'::jsonb) -> key)
  ) s;
$fn$ LANGUAGE sql IMMUTABLE;


-- ───────────────────────────────────────────────────────────────────────────
--  آلةُ الحالات — نقلًا عن `allow update` في `firestore.rules` (٤٧٥–٥١٢)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION documents_transition_guard() RETURNS trigger AS $fn$
DECLARE
  o jsonb := to_jsonb(OLD);
  n jsonb := to_jsonb(NEW);
  changed   text[];
  r         text;
  approve   text[];
  complete  text[];
  same      boolean;   -- المحتوى (البنود والرأس) لم يتغيّر
  ok        boolean := false;
  why       text;
BEGIN
  -- ★ مسارُ البوّابة وحدَه. المزامنةُ مرآةٌ لا فاعل.
  IF current_user <> 'web_user' THEN RETURN NEW; END IF;

  IF NOT signed_in() THEN
    RAISE EXCEPTION 'تعديلُ المستند «%» بلا هويّة.', OLD.id;
  END IF;

  changed := changed_doc_keys(o, n);
  same := (o -> 'lines' IS NOT DISTINCT FROM n -> 'lines')
      AND (o -> 'header' IS NOT DISTINCT FROM n -> 'header');
  r := my_role();
  SELECT approve_roles, complete_roles INTO approve, complete
    FROM doc_type_roles WHERE doc_type = OLD.type;
  approve  := coalesce(approve,  ARRAY[]::text[]);
  complete := coalesce(complete, ARRAY[]::text[]);

  -- ★ ختمُ التأريخ: إن حمل القديمُ وسمًا وجب أن يبقى وسمًا بأثرٍ رجعيّ.
  IF (o -> 'extra' ? 'dating')
     AND NOT ((n -> 'extra' ? 'dating')
              AND (n -> 'extra' -> 'dating' ->> 'backdated') = 'true') THEN
    RAISE EXCEPTION 'وسمُ التأريخ الرجعيّ لا يُنزع عن المستند «%».', OLD.id;
  END IF;
  -- ★★ والوسمُ الجديد يُنسب لصاحبه. و«at == request.time» لا نظيرَ له هنا،
  --    فالخادمُ **يختمه بنفسه** — وهو أقوى من التحقّق ممّا أرسله العميل.
  IF (n -> 'extra' ? 'dating')
     AND (n -> 'extra' -> 'dating') IS DISTINCT FROM (o -> 'extra' -> 'dating') THEN
    IF (n -> 'extra' -> 'dating' ->> 'byUid') IS DISTINCT FROM auth_uid() THEN
      RAISE EXCEPTION 'وسمُ التأريخ يُنسب لمن وضعه.';
    END IF;
    NEW.extra := jsonb_set(NEW.extra, '{dating,at}', to_jsonb(now()));
  END IF;

  IF is_admin() THEN
    ok := true;                                           -- المشرفُ العامّ

  -- ★ ختمُ الأثر الجانبيّ: القيدُ المخزنيّ يكتب حقولَه ولا يحرّك الحالة.
  ELSIF is_stock_actor()
    AND OLD.state IN ('approved', 'done')
    AND NEW.state = OLD.state
    AND changed <@ ARRAY['posted','posted_at','posted_by_uid','posted_moves','updated_at',
                         'extra.soAllocation','extra.soShortfall','extra.soReserved',
                         'extra.soReleased','extra.soReleasedByKey','extra.soReleaseLog']
  THEN ok := true;

  -- ★★ التعديلُ المحكوم: مديرُ المستودع يصحّح محتوًى بسببٍ مكتوب، بلا نقلِ حالة.
  ELSIF r = 'warehouse_manager' AND has_profile() AND is_active()
    AND OLD.state IN ('submitted', 'approved')
    AND NEW.state = OLD.state
    AND OLD.posted IS NOT TRUE
    AND changed <@ ARRAY['header','lines','updated_at','extra.amended']
    AND (n -> 'extra' ? 'amended')
    AND (n -> 'extra' -> 'amended' ->> 'byUid') = auth_uid()
    AND coalesce(length(n -> 'extra' -> 'amended' ->> 'reason'), 0) > 0
  THEN ok := true;

  -- المنشئُ يحرّر مسوّدتَه أو يرفعها.
  ELSIF OLD.created_by_uid = auth_uid()
    AND OLD.state IN ('draft', 'rejected')
    AND NEW.state IN ('draft', 'submitted')
  THEN ok := true;

  -- المعتمِد: مرفوعٌ ⟶ معتمَدٌ أو مرفوض، بلا مسٍّ للمحتوى.
  ELSIF has_profile() AND OLD.state = 'submitted'
    AND r = ANY(approve) AND NEW.state IN ('approved', 'rejected') AND same
  THEN ok := true;

  -- المنجِز: معتمَدٌ ⟶ منجَزٌ أو مغلقٌ أو ملغًى.
  ELSIF has_profile() AND OLD.state = 'approved'
    AND r = ANY(complete) AND NEW.state IN ('done', 'closed', 'canceled') AND same
  THEN ok := true;

  -- والمنجَزُ يُغلق.
  ELSIF has_profile() AND OLD.state = 'done'
    AND r = ANY(complete) AND NEW.state = 'closed' AND same
  THEN ok := true;

  -- والمنشئُ يلغي مسوّدتَه.
  ELSIF OLD.created_by_uid = auth_uid()
    AND OLD.state IN ('draft', 'rejected') AND NEW.state = 'canceled' AND same
  THEN ok := true;
  END IF;

  IF NOT ok THEN
    why := format('المستند «%s» (%s): نقلةٌ غيرُ مسموحة %s ⟶ %s للدور «%s». المتغيّر: %s',
                  OLD.id, OLD.type, OLD.state, NEW.state, coalesce(r, 'بلا ملفّ'),
                  array_to_string(changed, ', '));
    RAISE EXCEPTION '%', why;
  END IF;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;


-- ───────────────────────────────────────────────────────────────────────────
--  الثوابتُ الثلاثة (`immutableKept`) — بإضافةِ عمودين لحارسٍ قائم.
--
--  ★ `write_once('number','type')` موجودٌ منذ 004 ويغطّي اثنين من ثلاثة.
--    فيُوسَّع ولا يُكتب حارسٌ ثانٍ بجانبه: حارسان لنفس المعنى يفترقان يومًا.
-- ───────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS documents_write_once ON documents;
CREATE TRIGGER documents_write_once BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION write_once('number', 'type', 'created_by_uid', 'created_at');


-- ───────────────────────────────────────────────────────────────────────────
--  المشغّل — بعد `set_updated_at` كي يرى الختمَ الجديد ضمن المتغيّرات.
--
--  ★★ والترتيبُ أبجديٌّ في PostgreSQL: `documents_touch` ثمّ
--     `documents_transition_guard`? لا — `t` بعد `p` وقبل `w`. فسُمّي
--     بما يضعه **بعد** `documents_touch`: الاسمُ هو الترتيب.
-- ───────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS documents_transitions ON documents;
CREATE TRIGGER documents_transitions BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION documents_transition_guard();


-- ───────────────────────────────────────────────────────────────────────────
--  السياسةُ — بوّابةٌ خشنةٌ واحدة، والتفصيلُ في المشغّل.
--
--  ★★★ **وواحدةٌ عمدًا لا عدّة:** الثقبُ المقيس أعلاه يولد من **تعدّد**
--      السياسات (USING تُجمع وحدَها وWITH CHECK وحدَها). فسياسةٌ واحدةٌ
--      بشرطٍ واحدٍ لا اقترانَ فيها يُكسر. والحكمُ الحقيقيُّ في المشغّل،
--      وهو يسبق الكتابةَ ويرفعُ خطأً مسمّى.
-- ───────────────────────────────────────────────────────────────────────────
GRANT UPDATE ON documents TO web_user;
DROP POLICY IF EXISTS documents_update ON documents;
CREATE POLICY documents_update ON documents FOR UPDATE TO web_user
  USING (signed_in()) WITH CHECK (signed_in());


INSERT INTO schema_migrations (version) VALUES ('011-doc-transitions')
  ON CONFLICT (version) DO NOTHING;
