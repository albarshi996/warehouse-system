-- ═══════════════════════════════════════════════════════════════════════════
--  ربطُ القيد بالمحل (§5 × §6) — قيدُ كلِّ محلٍّ لأعضائه؛ المحاسبةُ متعدّدةُ المحلات.
--  نظيرُ ربط الخزينة (019)، فيكتمل النطاقُ صفًّا صفًّا على القيد والخزينة معًا.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS shop_id text REFERENCES shops (id);
CREATE INDEX IF NOT EXISTS journal_entries_shop ON journal_entries (shop_id) WHERE shop_id IS NOT NULL;


-- محلُّ القيد — `SECURITY DEFINER` فلا تتعاود سياسةُ السطور على سياسة الرؤوس.
CREATE OR REPLACE FUNCTION entry_shop(p_key text) RETURNS text AS $$
  SELECT shop_id FROM journal_entries WHERE key = p_key;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION entry_shop(text) TO web_user;


-- ── RLS مقيَّدةٌ بالمحل (قيدٌ بلا محلٍّ للمديرين وحدهم) ──
DROP POLICY IF EXISTS journal_entries_read_manager ON journal_entries;
DROP POLICY IF EXISTS journal_entries_read_scope ON journal_entries;
CREATE POLICY journal_entries_read_scope ON journal_entries FOR SELECT TO web_user
  USING (is_manager() OR (shop_id IS NOT NULL AND is_shop_member(shop_id)));

DROP POLICY IF EXISTS journal_lines_read_manager ON journal_lines;
DROP POLICY IF EXISTS journal_lines_read_scope ON journal_lines;
CREATE POLICY journal_lines_read_scope ON journal_lines FOR SELECT TO web_user
  USING (is_manager() OR is_shop_member(entry_shop(entry_key)));


-- ── بابُ الترحيل يقبل المحل (الدالّةُ 9 معاملات؛ ذو الثمانية يبقى متوافقًا) ──
DROP FUNCTION IF EXISTS post_journal(text, date, bigint, jsonb, text, text, text, text);
CREATE OR REPLACE FUNCTION post_journal(
  p_key text, p_date date, p_amount bigint, p_lines jsonb,
  p_memo text DEFAULT '', p_source_type text DEFAULT '', p_source_id text DEFAULT '',
  p_reverses text DEFAULT NULL, p_shop text DEFAULT NULL
) RETURNS text AS $$
DECLARE v_line jsonb; v_dr bigint := 0; v_cr bigint := 0; v_idx integer := 0; d bigint; c bigint;
BEGIN
  IF is_manager() IS NOT TRUE THEN RAISE EXCEPTION 'غير مخوَّل: ترحيلُ القيد للمديرين وحدهم.'; END IF;
  IF btrim(coalesce(p_key, '')) = '' THEN RAISE EXCEPTION 'قيدٌ بلا مفتاحٍ فريد.'; END IF;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE key = p_key) THEN RETURN p_key; END IF;
  IF p_date < DATE '2026-10-20' THEN RAISE EXCEPTION 'فترةٌ مقفلة: % قبل حدّ الافتتاح 2026-10-20.', p_date; END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 2 THEN RAISE EXCEPTION 'القيدُ المزدوج سطران فأكثر.'; END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) AS t(value) LOOP
    d := coalesce((v_line ->> 'debit')::bigint, 0);
    c := coalesce((v_line ->> 'credit')::bigint, 0);
    IF d < 0 OR c < 0 THEN RAISE EXCEPTION 'السطر %: لا مبلغَ سالب.', v_idx; END IF;
    IF (d > 0) = (c > 0) THEN RAISE EXCEPTION 'السطر %: إمّا مدينٌ وإمّا دائن.', v_idx; END IF;
    v_dr := v_dr + d; v_cr := v_cr + c; v_idx := v_idx + 1;
  END LOOP;
  IF v_dr <> v_cr THEN RAISE EXCEPTION 'قيدٌ غير متوازن: مدين % ≠ دائن %.', v_dr, v_cr; END IF;
  IF v_dr <> p_amount THEN RAISE EXCEPTION 'مجموعُ السطور % لا يطابق المعلَن %.', v_dr, p_amount; END IF;

  INSERT INTO journal_entries
    (key, entry_date, amount, memo, source_type, source_id, reverses, shop_id, created_by_uid, created_by_role)
  VALUES
    (p_key, p_date, p_amount, coalesce(p_memo, ''), coalesce(p_source_type, ''), coalesce(p_source_id, ''),
     p_reverses, nullif(p_shop, ''), coalesce(auth_uid(), ''), coalesce(my_role(), ''));

  v_idx := 0;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) AS t(value) LOOP
    INSERT INTO journal_lines (entry_key, line_index, account, party, debit, credit)
    VALUES (p_key, v_idx, v_line ->> 'account', coalesce(v_line ->> 'party', ''),
            coalesce((v_line ->> 'debit')::bigint, 0), coalesce((v_line ->> 'credit')::bigint, 0));
    v_idx := v_idx + 1;
  END LOOP;
  RETURN p_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION post_journal(text, date, bigint, jsonb, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION post_journal(text, date, bigint, jsonb, text, text, text, text, text) TO web_user;


DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO missing
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'جداولٌ بلا RLS: %', missing; END IF;
  RAISE NOTICE 'كلُّ جداول public محروسةٌ بـRLS بعد ربط القيد بالمحل.';
END $$;


INSERT INTO schema_migrations (version) VALUES ('021-ledger-shop')
  ON CONFLICT (version) DO NOTHING;
