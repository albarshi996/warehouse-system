-- ═══════════════════════════════════════════════════════════════════════════
--  تقريرُ الوردية — ملخّصٌ مُستعلَم: البداية والواردُ والصادرُ النقديّان والمتوقَّع،
--  والبنكُ والبطاقةُ منفصلَين. نظيرُ تقارير القيد (022).
--
--  ★ SECURITY INVOKER: تُطبَّق RLS على القارئ (عضوُ المحلّ يرى ورديّاتِ محلِّه).
--  المبالغُ بالوحدة الصغرى.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION session_summary(p_id text)
  RETURNS TABLE(opening bigint, cash_in bigint, cash_out bigint, expected bigint, net_bank bigint, net_card bigint) AS $$
  SELECT
    s.opening_balance,
    COALESCE(SUM(CASE WHEN m.method = 'cash' AND m.kind IN ('customer_receipt', 'cash_sale', 'deposit_in') THEN m.amount ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN m.method = 'cash' AND m.kind NOT IN ('customer_receipt', 'cash_sale', 'deposit_in') THEN m.amount ELSE 0 END), 0)::bigint,
    cash_session_expected(s.id),
    COALESCE(SUM(CASE WHEN m.method = 'bank' THEN (CASE WHEN m.kind IN ('customer_receipt', 'cash_sale', 'deposit_in') THEN m.amount ELSE -m.amount END) ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN m.method = 'card' THEN (CASE WHEN m.kind IN ('customer_receipt', 'cash_sale', 'deposit_in') THEN m.amount ELSE -m.amount END) ELSE 0 END), 0)::bigint
  FROM cash_sessions s
  LEFT JOIN cash_movements m ON m.session_id = s.id
  WHERE s.id = p_id
  GROUP BY s.id, s.opening_balance;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION session_summary(text) TO web_user;


INSERT INTO schema_migrations (version) VALUES ('023-treasury-reports')
  ON CONFLICT (version) DO NOTHING;
