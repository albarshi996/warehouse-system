-- ═══════════════════════════════════════════════════════════════════════════
--  أبوابُ كتابة الخزينة — الفتحُ والإضافة (مخوَّلةٌ وذرّيّة)، نظيرُ post_journal.
--  لا INSERT مباشرٌ لدور الويب (016)؛ الكتابةُ بابُها دالّةٌ تتحقّق ثمّ تكتب.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
--  فتحُ وردية — مخوَّلٌ، idempotent على المعرّف (القفزُ لا الرفض).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION open_cash_session(
  p_id text, p_shift text DEFAULT '', p_opening bigint DEFAULT 0, p_opened_by text DEFAULT ''
) RETURNS text AS $$
BEGIN
  IF is_manager() IS NOT TRUE THEN
    RAISE EXCEPTION 'غير مخوَّل: فتحُ الوردية للمديرين وحدهم.';
  END IF;
  IF btrim(coalesce(p_id, '')) = '' THEN RAISE EXCEPTION 'وردية بلا معرّف.'; END IF;
  IF p_opening IS NULL OR p_opening < 0 THEN RAISE EXCEPTION 'رصيدُ البداية غير سالب.'; END IF;

  -- ★ القفزُ لا الرفض: وردية بالمعرّف نفسِه تُعاد كما هي.
  IF EXISTS (SELECT 1 FROM cash_sessions WHERE id = p_id) THEN RETURN p_id; END IF;

  INSERT INTO cash_sessions (id, shift, opening_balance, opened_by)
    VALUES (p_id, coalesce(p_shift, ''), p_opening, coalesce(nullif(p_opened_by, ''), auth_uid(), ''));
  RETURN p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ───────────────────────────────────────────────────────────────────────────
--  إضافةُ حركةٍ لوردية مفتوحة — ترقيمٌ ذرّيّ (`FOR UPDATE` يسلسل الإضافات).
--  النوعُ والوسيلةُ يحرسهما قيدُ الجدول (016)، فمدخلٌ خبيثٌ يُرفض عند الإدراج.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION add_cash_movement(
  p_session text, p_kind text, p_method text, p_amount bigint, p_memo text DEFAULT ''
) RETURNS integer AS $$
DECLARE v_state text; v_seq integer;
BEGIN
  IF is_manager() IS NOT TRUE THEN
    RAISE EXCEPTION 'غير مخوَّل: حركةُ الخزينة للمديرين وحدهم.';
  END IF;

  -- قفلُ صفّ الوردية: يمنع سباقَ الترقيم ويضمن أنّها ما زالت مفتوحةً وقتَ الإضافة.
  SELECT state INTO v_state FROM cash_sessions WHERE id = p_session FOR UPDATE;
  IF v_state IS NULL THEN RAISE EXCEPTION 'وردية غير موجودة: %.', p_session; END IF;
  IF v_state <> 'open' THEN RAISE EXCEPTION 'لا حركةَ على وردية مُسكَّرة.'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'مبلغُ الحركة موجب.'; END IF;

  SELECT coalesce(max(seq), -1) + 1 INTO v_seq FROM cash_movements WHERE session_id = p_session;
  INSERT INTO cash_movements (session_id, seq, kind, method, amount, memo, by_uid)
    VALUES (p_session, v_seq, p_kind, p_method, p_amount, coalesce(p_memo, ''), coalesce(auth_uid(), ''));
  RETURN v_seq;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


REVOKE ALL ON FUNCTION open_cash_session(text, text, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION add_cash_movement(text, text, text, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION open_cash_session(text, text, bigint, text) TO web_user;
GRANT EXECUTE ON FUNCTION add_cash_movement(text, text, text, bigint, text) TO web_user;


INSERT INTO schema_migrations (version) VALUES ('017-treasury-write')
  ON CONFLICT (version) DO NOTHING;
