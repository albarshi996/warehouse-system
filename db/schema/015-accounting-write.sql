-- ═══════════════════════════════════════════════════════════════════════════
--  بابُ الكتابة — دالّةُ ترحيلِ قيدٍ واحدةٌ مخوَّلةٌ وذرّيّة.
-- ═══════════════════════════════════════════════════════════════════════════
--
--  خطّة §2/§3: «أوامرُ العمل الأصليّة هي بابُ الكتابة» — لا INSERT مباشرٌ لدور
--  الويب (منعناه في 014)، بل دالّةٌ واحدةٌ تتحقّق ثمّ تكتب الرأسَ والسطورَ في
--  معاملةٍ واحدة. فلا رأسٌ بلا سطور، ولا قيدٌ غيرُ متوازن، ولا تكرار.
--
--  `SECURITY DEFINER`: تُنفَّذ بصلاحيّة المالك فتتجاوز RLS لتكتب — لكنّها تحرس
--  التخويلَ بنفسها (`is_manager()`) و`search_path` مثبَّت (كدوالّ 006).
--
--  ★ القفزُ لا الرفض: مفتاحٌ موجودٌ يُعاد كما هو — فإعادةُ المحاولة لا تُضاعف
--    ولا ترمي (نظيرُ `writeOnce`/العدّاد). والتوازنُ يُفحص قبل الكتابة، والحارسُ
--    المؤجّلُ في 014 شبكةُ أمانٍ أخيرة.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION post_journal(
  p_key         text,
  p_date        date,
  p_amount      bigint,
  p_lines       jsonb,
  p_memo        text DEFAULT '',
  p_source_type text DEFAULT '',
  p_source_id   text DEFAULT '',
  p_reverses    text DEFAULT NULL
) RETURNS text AS $$
DECLARE
  v_line jsonb;
  v_dr   bigint := 0;
  v_cr   bigint := 0;
  v_idx  integer := 0;
  d      bigint;
  c      bigint;
BEGIN
  -- التخويل: القيدُ يكتبه المديرون (بابُ العمل لا الواجهة المفتوحة).
  -- ★ `IS NOT TRUE` لا `NOT`: بلا رمزٍ تعيد `is_manager()` قيمةَ NULL (لا false)،
  --   و`NOT NULL` تبقى NULL فلا تُطلق الرفض. والـNULL هنا منعٌ لا سماح.
  IF is_manager() IS NOT TRUE THEN
    RAISE EXCEPTION 'غير مخوَّل: ترحيلُ القيد للمديرين وحدهم.';
  END IF;

  IF btrim(coalesce(p_key, '')) = '' THEN
    RAISE EXCEPTION 'قيدٌ بلا مفتاحٍ فريد.';
  END IF;

  -- ★ القفزُ لا الرفض: المفتاحُ الموجودُ يُعاد — منعُ تكرارٍ idempotent.
  IF EXISTS (SELECT 1 FROM journal_entries WHERE key = p_key) THEN
    RETURN p_key;
  END IF;

  IF p_date < DATE '2026-10-20' THEN
    RAISE EXCEPTION 'فترةٌ مقفلة: % قبل حدّ الافتتاح 2026-10-20.', p_date;
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'القيدُ المزدوج سطران فأكثر.';
  END IF;

  -- التحقّقُ قبل الكتابة: كلُّ سطرٍ جهةٌ واحدة، والمجموعُ متوازنٌ ويطابق المعلَن.
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) AS t(value) LOOP
    d := coalesce((v_line ->> 'debit')::bigint, 0);
    c := coalesce((v_line ->> 'credit')::bigint, 0);
    IF d < 0 OR c < 0 THEN
      RAISE EXCEPTION 'السطر %: لا مبلغَ سالب.', v_idx;
    END IF;
    IF (d > 0) = (c > 0) THEN
      RAISE EXCEPTION 'السطر %: إمّا مدينٌ وإمّا دائن، لا كلاهما ولا صفرُهما.', v_idx;
    END IF;
    v_dr := v_dr + d;
    v_cr := v_cr + c;
    v_idx := v_idx + 1;
  END LOOP;

  IF v_dr <> v_cr THEN
    RAISE EXCEPTION 'قيدٌ غير متوازن: مدين % ≠ دائن %.', v_dr, v_cr;
  END IF;
  IF v_dr <> p_amount THEN
    RAISE EXCEPTION 'مجموعُ السطور % لا يطابق المعلَن %.', v_dr, p_amount;
  END IF;

  -- الكتابةُ الذرّيّة: الرأسُ ثمّ السطور، في معاملةٍ واحدة.
  INSERT INTO journal_entries
    (key, entry_date, amount, memo, source_type, source_id, reverses,
     created_by_uid, created_by_role)
  VALUES
    (p_key, p_date, p_amount, coalesce(p_memo, ''), coalesce(p_source_type, ''),
     coalesce(p_source_id, ''), p_reverses, coalesce(auth_uid(), ''), coalesce(my_role(), ''));

  v_idx := 0;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) AS t(value) LOOP
    INSERT INTO journal_lines (entry_key, line_index, account, party, debit, credit)
    VALUES (
      p_key, v_idx, v_line ->> 'account', coalesce(v_line ->> 'party', ''),
      coalesce((v_line ->> 'debit')::bigint, 0), coalesce((v_line ->> 'credit')::bigint, 0)
    );
    v_idx := v_idx + 1;
  END LOOP;

  RETURN p_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- بابٌ واحد: يُمنح لدور الويب تنفيذُ الدالّة، ولا يُمنح INSERT مباشرٌ (بقي ممنوعًا).
REVOKE ALL ON FUNCTION post_journal(text, date, bigint, jsonb, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION post_journal(text, date, bigint, jsonb, text, text, text, text) TO web_user;


INSERT INTO schema_migrations (version) VALUES ('015-accounting-write')
  ON CONFLICT (version) DO NOTHING;
