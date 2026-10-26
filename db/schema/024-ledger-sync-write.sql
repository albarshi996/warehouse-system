-- ═══════════════════════════════════════════════════════════════════════════
--  بابُ كتابة الدفتر بالمزامنة — `post_journal_local`
--
--  الكاتبُ الواحد (§3): آلةُ المزامنة — لا البوّابة — هي التي تُغذّي الدفترَ
--  المحاسبيّ. وهي عمليّةُ خادمٍ موثوقةٌ تعمل عبر `psql` كمالك القاعدة، فلا رمزَ
--  JWT لها؛ ولذا لا يصلح لها `post_journal` (021) الذي يشترط `is_manager()`.
--
--  ★★★ **التخويلُ هنا بالمنح لا بالدعوى:** الدالّةُ تُمنح للمالك وحدَه (التنفيذُ
--      الافتراضيّ)، و**تُحجب صراحةً عن `web_user`/`web_anon`** — فلا تبلغها يدُ
--      مستخدمٍ عبر PostgREST أبدًا. هذا هو الفرقُ الوحيدُ عن `post_journal`:
--      كلُّ الحرّاس الباقية **كما هي حرفًا بحرف** — مفتاحٌ فريد، تَخَطٍّ لا رفضٌ
--      عند التكرار (القفزُ لا الرفض)، فترةٌ مقفلةٌ قبل حدّ الافتتاح، سطران
--      فأكثر، لا مبلغَ سالب، كلُّ سطرٍ مدينٌ أو دائنٌ لا كلاهما، توازنٌ تامّ،
--      ومجموعُ السطور يطابق المعلَن. والجدولان أصلًا ملحقان-فقط ومتوازنان
--      بمُحفِّزٍ مؤجَّل (014)، فيُفرضان ولو أُدرج مباشرةً.
--
--  ★★ **ويوسَم القيدُ المُولَّد آليًّا:** `created_by_uid='sync'` و
--     `created_by_role='system'` — فيُفرَّق قيدُ المزامنة من قيدِ يدٍ بشريّة.
--
--  ★ خاملٌ حتّى يُطلَب: لا يستدعيه شيءٌ في القاعدة؛ تستدعيه المزامنةُ فقط حين
--    تُرفع رايةُ `SYNC_LEDGER`. البيّنة: `db/test/proof-ledger-sync.sql`.
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS post_journal_local(text, date, bigint, jsonb, text, text, text, text, text);
CREATE OR REPLACE FUNCTION post_journal_local(
  p_key text, p_date date, p_amount bigint, p_lines jsonb,
  p_memo text DEFAULT '', p_source_type text DEFAULT '', p_source_id text DEFAULT '',
  p_reverses text DEFAULT NULL, p_shop text DEFAULT NULL
) RETURNS text AS $$
DECLARE v_line jsonb; v_dr bigint := 0; v_cr bigint := 0; v_idx integer := 0; d bigint; c bigint;
BEGIN
  -- لا فحصَ is_manager(): التخويلُ بمنح التنفيذ (المالك وحدَه)، لا بالدعوى.
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
     p_reverses, nullif(p_shop, ''), 'sync', 'system');

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

-- ★★★ التخويلُ بالمنح: المالكُ وحدَه (ومن ثمّ المزامنة). لا يدَ مستخدمٍ تبلغها.
REVOKE ALL ON FUNCTION post_journal_local(text, date, bigint, jsonb, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION post_journal_local(text, date, bigint, jsonb, text, text, text, text, text) FROM web_anon;
REVOKE ALL ON FUNCTION post_journal_local(text, date, bigint, jsonb, text, text, text, text, text) FROM web_user;


INSERT INTO schema_migrations (version) VALUES ('024-ledger-sync-write')
  ON CONFLICT (version) DO NOTHING;
