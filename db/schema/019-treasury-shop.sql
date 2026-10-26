-- ═══════════════════════════════════════════════════════════════════════════
--  ربطُ الخزينة بالمحل (§5 × §7) — وردية كلِّ محلٍّ لأعضائه، والمديرُ يرى الكلّ.
--  يُطبّق النطاقَ صفًّا صفًّا (018) على بياناتِ تشغيلٍ حقيقيّة لا على مرجعٍ فقط.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS shop_id text REFERENCES shops (id);
CREATE INDEX IF NOT EXISTS cash_sessions_shop ON cash_sessions (shop_id) WHERE shop_id IS NOT NULL;


-- محلُّ وردية — `SECURITY DEFINER` فلا تتعاود سياسةُ الحركات على سياسة الورديّات.
CREATE OR REPLACE FUNCTION session_shop(p_id text) RETURNS text AS $$
  SELECT shop_id FROM cash_sessions WHERE id = p_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION session_shop(text) TO web_user;


-- ── RLS مقيَّدةٌ بالمحل (بدل «للمديرين وحدهم») ──
-- وردية بلا محلٍّ (`shop_id IS NULL`) تبقى للمديرين وحدهم — افتراضٌ آمن.
DROP POLICY IF EXISTS cash_sessions_read_manager ON cash_sessions;
DROP POLICY IF EXISTS cash_sessions_read_scope ON cash_sessions;
CREATE POLICY cash_sessions_read_scope ON cash_sessions FOR SELECT TO web_user
  USING (is_manager() OR (shop_id IS NOT NULL AND is_shop_member(shop_id)));

DROP POLICY IF EXISTS cash_movements_read_manager ON cash_movements;
DROP POLICY IF EXISTS cash_movements_read_scope ON cash_movements;
CREATE POLICY cash_movements_read_scope ON cash_movements FOR SELECT TO web_user
  USING (is_manager() OR is_shop_member(session_shop(session_id)));


-- ── بابُ الفتح يقبل المحل (الدالّةُ 5 معاملات؛ الرابعُ يبقى متوافقًا بالافتراض) ──
DROP FUNCTION IF EXISTS open_cash_session(text, text, bigint, text);
CREATE OR REPLACE FUNCTION open_cash_session(
  p_id text, p_shift text DEFAULT '', p_opening bigint DEFAULT 0, p_opened_by text DEFAULT '', p_shop text DEFAULT NULL
) RETURNS text AS $$
BEGIN
  IF is_manager() IS NOT TRUE THEN
    RAISE EXCEPTION 'غير مخوَّل: فتحُ الوردية للمديرين وحدهم.';
  END IF;
  IF btrim(coalesce(p_id, '')) = '' THEN RAISE EXCEPTION 'وردية بلا معرّف.'; END IF;
  IF p_opening IS NULL OR p_opening < 0 THEN RAISE EXCEPTION 'رصيدُ البداية غير سالب.'; END IF;

  IF EXISTS (SELECT 1 FROM cash_sessions WHERE id = p_id) THEN RETURN p_id; END IF;

  INSERT INTO cash_sessions (id, shift, opening_balance, opened_by, shop_id)
    VALUES (p_id, coalesce(p_shift, ''), p_opening, coalesce(nullif(p_opened_by, ''), auth_uid(), ''), nullif(p_shop, ''));
  RETURN p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION open_cash_session(text, text, bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION open_cash_session(text, text, bigint, text, text) TO web_user;


-- الحارسُ الأخير — لا جدولَ بلا RLS.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO missing
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'جداولٌ بلا RLS: %', missing;
  END IF;
  RAISE NOTICE 'كلُّ جداول public محروسةٌ بـRLS بعد ربط الخزينة بالمحل.';
END $$;


INSERT INTO schema_migrations (version) VALUES ('019-treasury-shop')
  ON CONFLICT (version) DO NOTHING;
