-- ═══════════════════════════════════════════════════════════════════════════
--  الخزينة والتسكير (§7) — تخزينٌ محلّيٌّ على PostgreSQL، موازٍ للقيد (014/015).
--  يُخزّن ما يحسبه محرّكُ `src/services/accounting/cashSession.js` الخالص.
-- ═══════════════════════════════════════════════════════════════════════════
--
--  العقودُ من نصّ الخطّة، مفروضةٌ في القاعدة:
--   • **المتوقَّع = البداية + واردٌ نقديّ − صادرٌ نقديّ**، والبطاقةُ والبنكُ خارج الدرج.
--   • **حركاتُ الخزينة ملحقة-فقط** (حارسٌ يمنع UPDATE/DELETE).
--   • **التسكير بابٌ واحد** (`close_cash_session`): يتحقّق ثمّ يُغلق ذرّيًّا؛ الفرقُ
--     يحتاج سببًا ولا يتحوّل دَينًا تلقائيًّا، ولا إغلاقان متزامنان (`FOR UPDATE`).
--   • **الوردية المُسكَّرةُ نهائيّة** (لا إعادةَ فتح)، وهويّتُها ورصيدُ بدايتها لا يتبدّلان.
--
--  المبالغُ BIGINT بالوحدة الصغرى. ولا جدولَ بلا RLS (يُعاد الفحص آخرَ الملفّ).
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
--  الوردية — تُفتح، ثمّ تُسكَّر مرّةً واحدةً فتصير نهائيّة.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE cash_sessions (
  id              text PRIMARY KEY CHECK (btrim(id) <> ''),
  shift           text NOT NULL DEFAULT '',
  opening_balance bigint NOT NULL CHECK (opening_balance >= 0),
  opened_by       text NOT NULL DEFAULT '',
  opened_at       timestamptz NOT NULL DEFAULT now(),
  state           text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'closed')),

  -- حقولُ التسكير (تُملأ عند الإغلاق).
  counted_cash    bigint CHECK (counted_cash IS NULL OR counted_cash >= 0),
  variance        bigint,            -- المعدود − المتوقَّع (قد يكون سالبًا: عجز)
  close_reason    text NOT NULL DEFAULT '',
  closed_by       text NOT NULL DEFAULT '',
  closed_at       timestamptz,

  extra           jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX cash_sessions_state ON cash_sessions (state, opened_at DESC);


-- ───────────────────────────────────────────────────────────────────────────
--  حركاتُ الوردية — ملحقة-فقط. النوعُ واتّجاهُه ووسيلتُه تضبط أثرَ الدرج.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE cash_movements (
  session_id  text NOT NULL REFERENCES cash_sessions (id),
  seq         integer NOT NULL CHECK (seq >= 0),
  kind        text NOT NULL CHECK (kind IN (
                'customer_receipt', 'cash_sale', 'deposit_in',
                'expense', 'supplier_payment', 'withdrawal', 'transfer_out', 'bank_deposit')),
  method      text NOT NULL CHECK (method IN ('cash', 'bank', 'card')),
  amount      bigint NOT NULL CHECK (amount > 0),
  memo        text NOT NULL DEFAULT '',
  at          timestamptz NOT NULL DEFAULT now(),
  by_uid      text NOT NULL DEFAULT '',
  extra       jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (session_id, seq)
);

CREATE INDEX cash_movements_session ON cash_movements (session_id);


-- ───────────────────────────────────────────────────────────────────────────
--  حركاتُ الخزينة ملحقة-فقط — لا تعديلَ ولا حذف (نظيرُ accounting_append_only).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION treasury_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'حركاتُ الخزينة ملحقة-فقط: لا % — التصحيحُ حركةٌ مضادّةٌ لا محوٌ للتاريخ.', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cash_movements_append_only BEFORE UPDATE OR DELETE ON cash_movements
  FOR EACH ROW EXECUTE FUNCTION treasury_append_only();


-- ───────────────────────────────────────────────────────────────────────────
--  الوردية المُسكَّرةُ نهائيّة، وهويّتُها ورصيدُ بدايتها لا يتبدّلان. ويُسمَح
--  بانتقالٍ واحدٍ فقط: open ⟵ closed (يجريه `close_cash_session`).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cash_session_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.state = 'closed' THEN
    RAISE EXCEPTION 'وردية مُسكَّرة لا تُعدَّل ولا تُعاد فتحًا.';
  END IF;
  IF NEW.id <> OLD.id OR NEW.opening_balance <> OLD.opening_balance THEN
    RAISE EXCEPTION 'هويّةُ الوردية ورصيدُ البداية لا يتبدّلان.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cash_sessions_guard BEFORE UPDATE ON cash_sessions
  FOR EACH ROW EXECUTE FUNCTION cash_session_guard();


-- ───────────────────────────────────────────────────────────────────────────
--  المتوقَّع في الدرج = البداية + كلُّ واردٍ نقديّ − كلُّ صادرٍ نقديّ.
--  **البطاقةُ والبنكُ لا يدخلان الدرج** — يُتابَعان خارجَه.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cash_session_expected(p_id text) RETURNS bigint AS $$
  SELECT s.opening_balance + COALESCE((
    SELECT SUM(
      CASE
        WHEN m.method <> 'cash' THEN 0
        WHEN m.kind IN ('customer_receipt', 'cash_sale', 'deposit_in') THEN m.amount
        ELSE -m.amount
      END)
    FROM cash_movements m WHERE m.session_id = s.id
  ), 0)
  FROM cash_sessions s WHERE s.id = p_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;


-- ───────────────────────────────────────────────────────────────────────────
--  بابُ التسكير — مخوَّلٌ وذرّيّ. يُعيد الفرق (موجبٌ فائضٌ، سالبٌ عجز).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION close_cash_session(
  p_id text, p_counted bigint, p_reason text DEFAULT '', p_closed_by text DEFAULT ''
) RETURNS bigint AS $$
DECLARE v_state text; v_expected bigint; v_variance bigint;
BEGIN
  IF is_manager() IS NOT TRUE THEN
    RAISE EXCEPTION 'غير مخوَّل: التسكير للمديرين وحدهم.';
  END IF;

  -- `FOR UPDATE` يقفل الصفَّ فيمنع إغلاقَين متزامنَين على وردية واحدة.
  SELECT state INTO v_state FROM cash_sessions WHERE id = p_id FOR UPDATE;
  IF v_state IS NULL THEN RAISE EXCEPTION 'وردية غير موجودة: %.', p_id; END IF;
  IF v_state <> 'open' THEN RAISE EXCEPTION 'لا تُسكَّر وردية غير مفتوحة — ولا إغلاقان.'; END IF;
  IF p_counted IS NULL OR p_counted < 0 THEN RAISE EXCEPTION 'النقدُ المعدود غير سالب.'; END IF;

  v_expected := cash_session_expected(p_id);
  v_variance := p_counted - v_expected;
  IF v_variance <> 0 AND btrim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'الفرقُ يحتاج سببًا — ولا يتحوّل تلقائيًّا دَينًا على الموظّف.';
  END IF;

  UPDATE cash_sessions SET
    state = 'closed', counted_cash = p_counted, variance = v_variance,
    close_reason = coalesce(p_reason, ''), closed_by = coalesce(nullif(p_closed_by, ''), auth_uid(), ''),
    closed_at = now()
  WHERE id = p_id AND state = 'open';

  RETURN v_variance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION close_cash_session(text, bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION close_cash_session(text, bigint, text, text) TO web_user;
GRANT EXECUTE ON FUNCTION cash_session_expected(text) TO web_user;


-- ───────────────────────────────────────────────────────────────────────────
--  RLS — قراءةٌ للمديرين، ولا كتابةَ ويبٍ (الكتابةُ بابُها الدالّة/الخدمة).
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cash_sessions', 'cash_movements']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_read_manager', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO web_user USING (is_manager())', t || '_read_manager', t);
    EXECUTE format('GRANT SELECT ON %I TO web_user', t);
  END LOOP;
END $$;


-- ───────────────────────────────────────────────────────────────────────────
--  ★★★ الحارسُ الأخير — لا جدولَ بلا RLS.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO missing
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'جداولٌ بلا RLS: % — كلُّ جدولٍ يُحرَس أو يُستثنى بقرارٍ مكتوب.', missing;
  END IF;
  RAISE NOTICE 'كلُّ جداول public محروسةٌ بـRLS بعد الخزينة.';
END $$;


INSERT INTO schema_migrations (version) VALUES ('016-treasury')
  ON CONFLICT (version) DO NOTHING;
