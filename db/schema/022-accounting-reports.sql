-- ═══════════════════════════════════════════════════════════════════════════
--  تقاريرُ القيد — طبقةُ قراءةٍ تجعل الدفترَ مُستعلَمًا: رصيدُ حسابٍ، ميزانُ
--  مراجعةٍ، ورصيدُ طرف. تُثبت الثابتةَ المحاسبيّة: **ميزانُ المراجعة يساوي صفرًا**.
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ★ `SECURITY INVOKER` (الافتراض) عمدًا: تُطبَّق RLS على القارئ — فالموظّفُ يرى
--    ميزانَ محلِّه، والمديرُ الكلّ. لا تتجاوزُ الدوالُّ النطاقَ.
--  المبالغُ بالوحدة الصغرى (BIGINT).
-- ═══════════════════════════════════════════════════════════════════════════


-- رصيدُ حسابٍ (أساسًا كان أو فرعيًّا مثل AR:C-1): مدين − دائن.
CREATE OR REPLACE FUNCTION account_balance(p_account text) RETURNS bigint AS $$
  SELECT COALESCE(SUM(debit - credit), 0)::bigint FROM journal_lines WHERE account = p_account;
$$ LANGUAGE sql STABLE;


-- ميزانُ المراجعة: لكلّ حسابٍ مدينُه ودائنُه ورصيدُه. مجموعُ الأرصدة = صفرٌ في
-- دفترٍ متوازن (ثابتةُ القيد المزدوج).
CREATE OR REPLACE FUNCTION trial_balance()
  RETURNS TABLE(account text, total_debit bigint, total_credit bigint, balance bigint) AS $$
  SELECT account, SUM(debit)::bigint, SUM(credit)::bigint, SUM(debit - credit)::bigint
  FROM journal_lines
  GROUP BY account
  ORDER BY account;
$$ LANGUAGE sql STABLE;


-- رصيدُ طرفٍ من حساباته الفرعيّة (AR:code · AP:code): مدين − دائن.
CREATE OR REPLACE FUNCTION party_balance(p_party text) RETURNS bigint AS $$
  SELECT COALESCE(SUM(debit - credit), 0)::bigint
  FROM journal_lines
  WHERE party = p_party;
$$ LANGUAGE sql STABLE;


GRANT EXECUTE ON FUNCTION account_balance(text), trial_balance(), party_balance(text) TO web_user;


INSERT INTO schema_migrations (version) VALUES ('022-accounting-reports')
  ON CONFLICT (version) DO NOTHING;
