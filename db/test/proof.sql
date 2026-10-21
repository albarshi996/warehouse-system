-- ═══════════════════════════════════════════════════════════════════════════
--  بيّنةُ الحرّاس — كلُّ حارسٍ يُطلَق مرّةً، وإلّا فهو غيرُ موجود
-- ═══════════════════════════════════════════════════════════════════════════
--  درسٌ مسجَّل: «حارسٌ يقرأ حقلًا لا يُكتب أبدًا فلا يُطلق ولو مرّة».
--  فلا يُقبل حارسٌ لم نره يرفض شيئًا بعينيه.
--
--  التشغيل:
--    docker exec -i warehouse-postgres psql -U warehouse -d warehouse -v ON_ERROR_STOP=1 < db/test/proof.sql
-- ═══════════════════════════════════════════════════════════════════════════

\set QUIET on
\pset format unaligned
\pset tuples_only on

-- ★ كلُّ ما يلي داخل معاملةٍ تُلغى في آخر الملفّ — فالبيّنةُ تُعاد ألفَ مرّةٍ
--   بلا أثرٍ واحد، ولا تلوّث قاعدةً فيها بيانات. (والدفترُ ملحَقٌ-فقط أصلًا
--   فلا يُنظَّف بالحذف — والإلغاءُ هو السبيلُ الوحيد.)
BEGIN;

-- يُشغّل جملةً يجب أن **تفشل**، ويطبع نجاحًا إن فشلت وفشلًا إن مرّت.
CREATE OR REPLACE FUNCTION must_fail(label text, stmt text) RETURNS void AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '  ✔ % — رُفض كما يجب (%)', label, left(SQLERRM, 60);
    RETURN;
  END;
  RAISE EXCEPTION '  ✘ % — مرّ ولم يُرفض! الحارس لا يعمل.', label;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION must_pass(label text, stmt text) RETURNS void AS $$
BEGIN
  EXECUTE stmt;
  RAISE NOTICE '  ✔ % — مرّ كما يجب', label;
END;
$$ LANGUAGE plpgsql;

\echo ''
\echo '════ ١ · الأصناف ════'
SELECT must_pass('إدراج صنف',
  $$INSERT INTO items (sku, name_ar, barcodes, base_uom)
    VALUES ('TEST-001', 'صنف تجريبي', ARRAY['6291000000001'], 'piece')$$);

SELECT must_fail('صنف بلا اسم عربي',
  $$INSERT INTO items (sku, name_ar) VALUES ('TEST-002', '   ')$$);

SELECT must_fail('تغيير كود صنف (الهويّة لا تتبدّل)',
  $$UPDATE items SET sku = 'TEST-999' WHERE sku = 'TEST-001'$$);

\echo ''
\echo '════ ٢ · العدّادات — تتقدّم ولا ترجع ════'
SELECT must_pass('إنشاء عدّاد',
  $$INSERT INTO counters (type, year, seq) VALUES ('GRN', 2026, 0)$$);

SELECT must_pass('حجز رقم (ذرّيّ بلا معاملة)',
  $$UPDATE counters SET seq = seq + 1 WHERE type='GRN' AND year=2026$$);

SELECT must_fail('تصفير العدّاد',
  $$UPDATE counters SET seq = 0 WHERE type='GRN' AND year=2026$$);

\echo ''
\echo '════ ٣ · المستندات — الرقم يُكتب مرّةً ════'
-- ★★★ كان هنا `warehouse` عمودًا مسطّحًا — ولا وجودَ له. المخطّطُ صُحّح إلى
--     `header jsonb` بعد قياس ١٧٥ مستندًا، **ولم تُصحَّح البيّنةُ معه**. فماتت
--     عند هذا السطر، وبقيت الأقسامُ الثلاثةُ بعده (الدفترُ والأرصدةُ والحرّاسُ
--     الملحقة-فقط) **لا تُشغَّل أصلًا** بينما يُقال «٢٤ فحصًا تمرّ».
--     ⇒ وهذا عينُ الدرس: حارسٌ لا يُطلق ليس حارسًا، وسقوطُه صامت.
SELECT must_pass('إنشاء مستند',
  $$INSERT INTO documents (id, type, state, header)
    VALUES ('DOC-1', 'GRN', 'done', '{"warehouse":"WH001"}'::jsonb)$$);

SELECT must_pass('حجز الرقم أوّل مرّة',
  $$UPDATE documents SET number = 'BFP-GRN-2026-0001' WHERE id = 'DOC-1'$$);

SELECT must_fail('تغيير الرقم بعد حجزه',
  $$UPDATE documents SET number = 'BFP-GRN-2026-0002' WHERE id = 'DOC-1'$$);

SELECT must_fail('تغيير نوع المستند',
  $$UPDATE documents SET type = 'PO' WHERE id = 'DOC-1'$$);

SELECT must_fail('رقم مستند مكرَّر',
  $$INSERT INTO documents (id, type, number) VALUES ('DOC-2','GRN','BFP-GRN-2026-0001')$$);

\echo ''
\echo '════ ٤ · الدفتر — ملحَقٌ-فقط ومعرّفٌ حتميّ ════'
SELECT must_pass('قيد حركة',
  $$INSERT INTO stock_moves (doc_id, line_index, sku, qty, to_loc, doc_type)
    VALUES ('DOC-1', 0, 'TEST-001', 100, 'WH001', 'GRN')$$);

SELECT must_fail('كمّيّة سالبة (الاتّجاه يحمله from/to)',
  $$INSERT INTO stock_moves (doc_id, line_index, sku, qty, to_loc)
    VALUES ('DOC-1', 1, 'TEST-001', -5, 'WH001')$$);

SELECT must_fail('حركة بلا هويّة صنف',
  $$INSERT INTO stock_moves (doc_id, line_index, qty, to_loc)
    VALUES ('DOC-1', 2, 10, 'WH001')$$);

SELECT must_fail('حركة بلا طرفين',
  $$INSERT INTO stock_moves (doc_id, line_index, sku, qty)
    VALUES ('DOC-1', 3, 'TEST-001', 10)$$);

SELECT must_fail('تعديل حركة مقيَّدة',
  $$UPDATE stock_moves SET qty = 999 WHERE doc_id='DOC-1' AND line_index=0$$);

SELECT must_fail('حذف حركة مقيَّدة',
  $$DELETE FROM stock_moves WHERE doc_id='DOC-1' AND line_index=0$$);

-- ★ البند ٩: إعادةُ التشغيل لا تُكرّر. هذا هو `moveId` الحتميّ مفتاحًا.
SELECT must_pass('إعادة إدراج نفس الحركة (idempotent)',
  $$INSERT INTO stock_moves (doc_id, line_index, sku, qty, to_loc)
    VALUES ('DOC-1', 0, 'TEST-001', 100, 'WH001')
    ON CONFLICT (doc_id, line_index) DO NOTHING$$);

\echo ''
\echo '════ ٥ · الأرصدة — لا رصيدَ سالبًا، ولا مفتاحَ مكرَّرًا ════'
SELECT must_pass('إنشاء رصيد',
  $$INSERT INTO balances (sku, warehouse, batch, qty, name_ar)
    VALUES ('TEST-001', 'WH001', 'LOT-A', 100, 'صنف تجريبي')$$);

SELECT must_fail('مفتاح رصيد مكرَّر (صنف×مخزن×تشغيلة×موقع×صلاحية×حالة)',
  $$INSERT INTO balances (sku, warehouse, batch, qty)
    VALUES ('TEST-001', 'WH001', 'LOT-A', 50)$$);

SELECT must_pass('نفس الصنف بتشغيلة أخرى = رصيد مستقلّ',
  $$INSERT INTO balances (sku, warehouse, batch, qty)
    VALUES ('TEST-001', 'WH001', 'LOT-B', 30)$$);

SELECT must_pass('سحب ٤٠ من ١٠٠',
  $$UPDATE balances SET qty = qty - 40 WHERE sku='TEST-001' AND batch='LOT-A'$$);

-- ★★ أهمّ سطرٍ في الملفّ: البيعُ الزائد يُرفض في القاعدة لا في المستدعي.
SELECT must_fail('سحب ١٠٠ من ٦٠ المتبقّية (رصيد سالب)',
  $$UPDATE balances SET qty = qty - 100 WHERE sku='TEST-001' AND batch='LOT-A'$$);

SELECT must_fail('رصيد بلا مخزن',
  $$INSERT INTO balances (sku, warehouse, qty) VALUES ('TEST-001', '  ', 10)$$);

\echo ''
\echo '════ الحصيلة ════'
SELECT
  (SELECT count(*) FROM items)       AS "أصناف",
  (SELECT count(*) FROM documents)   AS "مستندات",
  (SELECT count(*) FROM stock_moves) AS "حركات",
  (SELECT count(*) FROM balances)    AS "أرصدة",
  (SELECT qty FROM balances WHERE batch='LOT-A') AS "رصيد LOT-A";

-- ★ الإلغاء: لا يبقى من هذه البيّنة صفٌّ واحد.
ROLLBACK;

\echo ''
\echo '✔ كلُّ الحرّاس أُطلقوا ورُفضوا كما يجب — ولم يبقَ أثرٌ في القاعدة.'
