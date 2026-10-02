-- ═══════════════════════════════════════════════════════════════════════════
--  بيّنةُ صلاحيّة الكتابة — كلُّ سياسةٍ بالإيجاب **وبالنقض**
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ★★★ **ومزلقٌ يُبطل البيّنةَ كلَّها:** مالكُ الجدول يتجاوز RLS. فبيّنةٌ
--      تُشغَّل بحساب `warehouse` تكتب دائمًا وتمرّ خضراءَ ولو لم تكن ثمّة
--      سياسةٌ واحدة. ولهذا يبدأ الملفُّ بإثبات أنّ **عاريَ الرمز لا يكتب**.
--
--  ★★ **ومزلقٌ ثانٍ خاصٌّ بالكتابة:** محاولةٌ تفشل لأنّ **جملتي خاطئة**
--      تبدو «منعًا ناجحًا». ولهذا كلُّ نقضٍ يقابله **إيجابٌ بنفس الجملة**
--      تقريبًا: فلو كانت الجملةُ معطوبةً سقط الإيجابُ وانكشف الزيف.
--      **فالنقضُ وحدَه لا يُصدَّق — يُقرأ مع توأمه.**
--
--  ★ وكلُّ محاولةٍ تُلغى بعدها (`ROLLBACK_PROBE`) فلا تلوّث ما يليها.
--
--  التشغيل:
--    docker exec -i warehouse-postgres psql -U warehouse -d warehouse -v ON_ERROR_STOP=1 < db/test/proof-rls-write.sql
-- ═══════════════════════════════════════════════════════════════════════════

\set QUIET on
\pset format unaligned
\pset tuples_only on

BEGIN;

INSERT INTO users (uid, name, role, active)
SELECT 'w_' || id, 'كاتب ' || label_ar, id, true FROM roles;
INSERT INTO users (uid, name, role, active)
VALUES ('w_suspended', 'مدير موقوف', 'warehouse_manager', false);

INSERT INTO items (sku, name_ar, base_uom) VALUES ('WPROBE-1', 'صنف بيّنة', 'piece');
INSERT INTO documents (id, type, state, created_by_uid)
VALUES ('WPROBE-DRAFT', 'GRN', 'draft', 'w_storekeeper');
INSERT INTO documents (id, type, state, number, created_by_uid)
VALUES ('WPROBE-NUMBERED', 'GRN', 'draft', 'GRN-2026-9999', 'w_storekeeper');
INSERT INTO documents (id, type, state, posted, created_by_uid)
VALUES ('WPROBE-POSTED', 'GRN', 'draft', true, 'w_storekeeper');

-- صفوفُ هدفٍ للتعديل والحذف. **وجودُها شرطُ صحّةِ المِسبار** (انظر tried).
INSERT INTO warehouses (code, name) VALUES ('WPRB', 'مخزن بيّنة');
INSERT INTO balances (sku, warehouse, qty) VALUES ('WPROBE-1', 'WPRB', 7);
INSERT INTO stock_moves (doc_id, line_index, sku, qty, to_loc, posted_by_uid)
VALUES ('WPROBE-DRAFT', 9, 'WPROBE-1', 1, 'WPRB', 'w_storekeeper');

/**
 * هل كانت هذه الكتابةُ ستنجح بهذه الهويّة؟ — وتُلغى دائمًا بعدها.
 *
 * ★★★ **ومزلقٌ أسقط النسخةَ الأولى من هذا المِسبار:** INSERT المخالفُ لسياسةٍ
 *     **يرمي** خطأً، أمّا UPDATE وDELETE **فلا يرميان**: ترشّح USING الصفوفَ
 *     فيصيب الأمرُ **صفرَ صفوفٍ وينجح بهدوء**. فمِسبارٌ يقرأ الاستثناءَ وحدَه
 *     **يقرأ المنعَ نجاحًا** — وقد وقع فعلًا: قرأ أنّ أمينَ مخزنٍ حذف مخزنًا،
 *     وهو لم يحذف شيئًا.
 *     ⇒ فالحكمُ **بعدد الصفوف المتأثّرة** لا بغياب الخطأ. وشرطُه أن يكون
 *       الصفُّ المستهدَفُ موجودًا — ولهذا تُزرع صفوفُ الهدف أعلاه بأسمائها.
 *     **فأداةُ القياس تُقاس قبل أن يُقاس بها.**
 */
CREATE OR REPLACE FUNCTION tried(stmt text, uid text, email text DEFAULT NULL)
RETURNS boolean AS $fn$
DECLARE claims text; ok boolean := false;
BEGIN
  claims := CASE WHEN uid IS NULL AND email IS NULL THEN '{}'
                 ELSE json_build_object('sub', uid, 'email', email)::text END;
  PERFORM set_config('request.jwt.claims', claims, true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE web_user';
    EXECUTE stmt;
    DECLARE rc bigint;
    BEGIN
      GET DIAGNOSTICS rc = ROW_COUNT;
      RAISE EXCEPTION 'ROLLBACK_PROBE:%', rc;
    END;
  EXCEPTION WHEN OTHERS THEN
    ok := (SQLERRM LIKE 'ROLLBACK_PROBE:%')
          AND (split_part(SQLERRM, ':', 2)::bigint > 0);
  END;
  EXECUTE 'RESET ROLE';
  RETURN ok;
END;
$fn$ LANGUAGE plpgsql;

/** يؤكّد نتيجةً متوقّعة ويعدّ الفحص. */
CREATE OR REPLACE FUNCTION expect(label text, got boolean, want boolean)
RETURNS void AS $fn$
BEGIN
  IF got <> want THEN
    RAISE EXCEPTION '  ✘ % — توقّعتُ % فجاء %', label, want, got;
  END IF;
END;
$fn$ LANGUAGE plpgsql;


\echo ''
\echo '════ ٠ · البيّنةُ تقيس شيئًا أصلًا ════'

DO $do$
BEGIN
  -- عاري الرمز لا يكتب شيئًا — ولو كتب فكلُّ ما بعده كذبٌ مطمئنّ.
  PERFORM expect('بلا رمز ⟶ صنف',
    tried($s$INSERT INTO items (sku, name_ar, base_uom) VALUES ('X1','س','piece')$s$, NULL), false);
  -- ومديرٌ يكتب — وإلّا فالمنعُ أعلاه قد يكون عطبًا لا سياسة.
  PERFORM expect('مديرُ مستودع ⟶ صنف',
    tried($s$INSERT INTO items (sku, name_ar, base_uom) VALUES ('X2','س','piece')$s$, 'w_warehouse_manager'), true);
  RAISE NOTICE '  ✔ عاريُ الرمز ممنوع والمديرُ مسموح — القياسُ حقيقيّ (٢)';
END $do$;


\echo ''
\echo '════ ١ · جداولُ المرجع — المديرُ يكتب ومن دونه يُردّ ════'

DO $do$
DECLARE r record; n int := 0; allowed int := 0; denied int := 0;
BEGIN
  -- كلُّ دورٍ من الأربعة والعشرين يُجرَّب على `items`: الإيجابُ للمدير وحدَه.
  FOR r IN SELECT id FROM roles ORDER BY sort LOOP
    n := n + 1;
    IF tried(format($s$INSERT INTO items (sku,name_ar,base_uom) VALUES ('T%s','س','piece')$s$, n),
             'w_' || r.id)
    THEN allowed := allowed + 1;
      IF r.id NOT IN ('admin','warehouse_manager') THEN
        RAISE EXCEPTION '  ✘ الدور «%» كتب صنفًا وليس مديرًا!', r.id;
      END IF;
    ELSE denied := denied + 1;
      IF r.id IN ('admin','warehouse_manager') THEN
        RAISE EXCEPTION '  ✘ الدور «%» مُنع من كتابة صنفٍ وهو مدير!', r.id;
      END IF;
    END IF;
  END LOOP;
  RAISE NOTICE '  ✔ items: % دورًا — % مسموحٌ و% ممنوع', n, allowed, denied;

  -- والموقوفُ بدور مديرٍ يسقط إلى نفسه — برهانُ أنّ is_active() موصولة.
  PERFORM expect('مديرٌ موقوف ⟶ صنف',
    tried($s$INSERT INTO items (sku,name_ar,base_uom) VALUES ('TS','س','piece')$s$, 'w_suspended'), false);

  -- users: المشرفُ العامُّ وحدَه — ومديرُ المستودع **لا**.
  PERFORM expect('admin ⟶ مستخدم',
    tried($s$INSERT INTO users (uid,name,role) VALUES ('nu','ن','storekeeper')$s$, 'w_admin'), true);
  PERFORM expect('مديرُ مستودع ⟶ مستخدم',
    tried($s$INSERT INTO users (uid,name,role) VALUES ('nu2','ن','storekeeper')$s$, 'w_warehouse_manager'), false);

  -- warehouses: المديرُ يكتب ويحذف (allow write تشمل الحذف).
  PERFORM expect('مديرٌ ⟶ حذفُ مخزن',
    tried($s$DELETE FROM warehouses WHERE code = 'WPRB'$s$, 'w_warehouse_manager'), true);
  PERFORM expect('أمينُ مخزن ⟶ حذفُ مخزن',
    tried($s$DELETE FROM warehouses WHERE code = 'WPRB'$s$, 'w_storekeeper'), false);
  RAISE NOTICE '  ✔ users وwarehouses: الإيجابُ والنقضُ لكلٍّ (٥)';
END $do$;


\echo ''
\echo '════ ٢ · counters — الهويّةُ في السياسة والتسلسلُ في المشغّل ════'

DO $do$
BEGIN
  PERFORM expect('أمينُ مخزن ⟶ عدّادٌ جديدٌ بـseq=1',
    tried($s$INSERT INTO counters (type,year,seq) VALUES ('PRB',2026,1)$s$, 'w_storekeeper'), true);
  -- ★ والمشاهدُ ممنوعٌ فلا يحرق أرقامًا — وهذا خرقٌ أُغلق سابقًا.
  PERFORM expect('مشاهدٌ ⟶ عدّاد',
    tried($s$INSERT INTO counters (type,year,seq) VALUES ('PRB2',2026,1)$s$, 'w_viewer'), false);
  -- ★★ وseq=5 يُردّ بالسياسة نفسها: العدّادُ يبدأ من واحد لا من حيث شاء.
  PERFORM expect('أمينُ مخزن ⟶ عدّادٌ يبدأ بـ5',
    tried($s$INSERT INTO counters (type,year,seq) VALUES ('PRB3',2026,5)$s$, 'w_storekeeper'), false);
  RAISE NOTICE '  ✔ counters: مسموحٌ وممنوعان (٣)';
END $do$;


\echo ''
\echo '════ ٣ · balances — والرصيدُ السالب يُردّ من القيد لا من السياسة ════'

DO $do$
BEGIN
  PERFORM expect('أمينُ مخزن ⟶ رصيد',
    tried($s$INSERT INTO balances (sku,warehouse,qty) VALUES ('WPROBE-1','WH001',5)$s$, 'w_storekeeper'), true);
  PERFORM expect('مشاهدٌ ⟶ رصيد',
    tried($s$INSERT INTO balances (sku,warehouse,qty) VALUES ('WPROBE-1','WH001',5)$s$, 'w_viewer'), false);
  -- ★★★ والعطبان اللذان سمّاهما القياس: رصيدٌ سالب، ومحجوزٌ سالبٌ = «بيعٌ مزدوج».
  PERFORM expect('أمينُ مخزن ⟶ رصيدٌ سالب',
    tried($s$INSERT INTO balances (sku,warehouse,qty) VALUES ('WPROBE-1','WH002',-1)$s$, 'w_storekeeper'), false);
  PERFORM expect('أمينُ مخزن ⟶ محجوزٌ سالب',
    tried($s$INSERT INTO balances (sku,warehouse,qty,qty_reserved) VALUES ('WPROBE-1','WH003',5,-1)$s$, 'w_storekeeper'), false);
  -- ولا حذفَ لأحد.
  PERFORM expect('مديرٌ ⟶ حذفُ رصيد',
    tried($s$DELETE FROM balances WHERE warehouse = 'WPRB'$s$, 'w_admin'), false);
  RAISE NOTICE '  ✔ balances: مسموحٌ وأربعةُ نقوضٍ منها السالبان (٥)';
END $do$;


\echo ''
\echo '════ ٤ · stock_moves — باسم فاعله، وملحَقٌ فقط ════'

DO $do$
BEGIN
  PERFORM expect('أمينُ مخزن ⟶ حركةٌ باسمه',
    tried($s$INSERT INTO stock_moves (doc_id,line_index,sku,qty,to_loc,posted_by_uid)
            VALUES ('WPROBE-DRAFT',1,'WPROBE-1',3,'WH001','w_storekeeper')$s$, 'w_storekeeper'), true);
  -- ★★★ وحركةٌ باسم غيره تُردّ — وهذا ما يمنع نسبةَ قيدٍ إلى بريء.
  PERFORM expect('أمينُ مخزن ⟶ حركةٌ باسم غيره',
    tried($s$INSERT INTO stock_moves (doc_id,line_index,sku,qty,to_loc,posted_by_uid)
            VALUES ('WPROBE-DRAFT',2,'WPROBE-1',3,'WH001','w_admin')$s$, 'w_storekeeper'), false);
  PERFORM expect('مشاهدٌ ⟶ حركة',
    tried($s$INSERT INTO stock_moves (doc_id,line_index,sku,qty,to_loc,posted_by_uid)
            VALUES ('WPROBE-DRAFT',3,'WPROBE-1',3,'WH001','w_viewer')$s$, 'w_viewer'), false);
  -- ★★ والملحَقُ-فقط: لا تعديلَ ولا حذفَ ولو كان مشرفًا عامًّا.
  PERFORM expect('admin ⟶ تعديلُ حركة',
    tried($s$UPDATE stock_moves SET qty = 99 WHERE to_loc = 'WPRB'$s$, 'w_admin'), false);
  PERFORM expect('admin ⟶ حذفُ حركة',
    tried($s$DELETE FROM stock_moves WHERE to_loc = 'WPRB'$s$, 'w_admin'), false);
  RAISE NOTICE '  ✔ stock_moves: مسموحٌ وأربعةُ نقوض (٥)';
END $do$;


\echo ''
\echo '════ ٥ · documents — الإنشاءُ مسوّدةً بلا رقم، والمحوُ لما لا أثرَ له ════'

DO $do$
BEGIN
  PERFORM expect('أمينُ مخزن ⟶ مسوّدةٌ باسمه',
    tried($s$INSERT INTO documents (id,type,state,created_by_uid)
            VALUES ('N1','GRN','draft','w_storekeeper')$s$, 'w_storekeeper'), true);
  -- ★ وبرقمٍ عند الولادة: رقمٌ لم يُحجز من العدّاد = تسلسلٌ مكسور.
  PERFORM expect('أمينُ مخزن ⟶ مستندٌ يولد برقم',
    tried($s$INSERT INTO documents (id,type,state,number,created_by_uid)
            VALUES ('N2','GRN','draft','GRN-2026-1','w_storekeeper')$s$, 'w_storekeeper'), false);
  -- ★ ويولد معتمَدًا — قفزٌ فوق آلة الحالات.
  PERFORM expect('أمينُ مخزن ⟶ مستندٌ يولد معتمَدًا',
    tried($s$INSERT INTO documents (id,type,state,created_by_uid)
            VALUES ('N3','GRN','approved','w_storekeeper')$s$, 'w_storekeeper'), false);
  -- ★★★ وباسم غيره — انتحالُ هويّةٍ في سجلٍّ ماليّ.
  PERFORM expect('أمينُ مخزن ⟶ مسوّدةٌ باسم غيره',
    tried($s$INSERT INTO documents (id,type,state,created_by_uid)
            VALUES ('N4','GRN','draft','w_admin')$s$, 'w_storekeeper'), false);
  PERFORM expect('مشاهدٌ ⟶ مسوّدة',
    tried($s$INSERT INTO documents (id,type,state,created_by_uid)
            VALUES ('N5','GRN','draft','w_viewer')$s$, 'w_viewer'), false);

  -- المحو: مسوّدتُه هو ⟵ نعم.
  PERFORM expect('منشئُه ⟶ محوُ مسوّدته',
    tried($s$DELETE FROM documents WHERE id = 'WPROBE-DRAFT'$s$, 'w_storekeeper'), true);
  -- ★★★ والمرقَّمُ لا يُمحى ولو كان مسوّدةً — ثغرةُ التسلسل أوّلُ ما يسأل عنها مدقّق.
  PERFORM expect('منشئُه ⟶ محوُ مرقَّم',
    tried($s$DELETE FROM documents WHERE id = 'WPROBE-NUMBERED'$s$, 'w_storekeeper'), false);
  -- ★★★ والمقيَّدُ لا يُمحى — له أثرٌ في المخزون.
  PERFORM expect('منشئُه ⟶ محوُ مقيَّد',
    tried($s$DELETE FROM documents WHERE id = 'WPROBE-POSTED'$s$, 'w_storekeeper'), false);
  -- وغيرُ منشئه يُردّ، والمشرفُ العامُّ يمرّ.
  PERFORM expect('غيرُ منشئه ⟶ محوُ مسوّدة',
    tried($s$DELETE FROM documents WHERE id = 'WPROBE-DRAFT'$s$, 'w_qc_inspector'), false);
  PERFORM expect('admin ⟶ محوُ مسوّدةِ غيره',
    tried($s$DELETE FROM documents WHERE id = 'WPROBE-DRAFT'$s$, 'w_admin'), true);
  RAISE NOTICE '  ✔ documents: إنشاءٌ ومحوٌ — إيجابان وثمانيةُ نقوض (١٠)';
END $do$;


\echo ''
\echo '════ ٦ · التأجيلُ المُعلَن — تعديلُ المستند ممنوعٌ افتراضًا ════'

-- ★★★ وهذا فحصٌ **يُثبّت نقصًا مقصودًا** لا كمالًا: آلةُ الحالات لم تُترجَم
--     بعد، والجدولُ بلا سياسةِ UPDATE. فالمنعُ قائمٌ افتراضًا — وهو أسلمُ من
--     سياسةٍ ناقصة. **ويوم تُترجَم، يسقط هذا الفحصُ فيُحذف عمدًا** — فلا
--     يبقى حارسٌ يحرس غيابًا صار حضورًا.
DO $do$
BEGIN
  PERFORM expect('admin ⟶ تعديلُ مستند',
    tried($s$UPDATE documents SET stage = 'x' WHERE id = 'WPROBE-DRAFT'$s$, 'w_admin'), false);
  PERFORM expect('منشئُه ⟶ تعديلُ مسوّدته',
    tried($s$UPDATE documents SET stage = 'x' WHERE id = 'WPROBE-DRAFT'$s$, 'w_storekeeper'), false);
  RAISE NOTICE '  ✔ تعديلُ المستند ممنوعٌ للجميع — تأجيلٌ مُعلَنٌ لا ثغرة (٢)';
END $do$;


\echo ''
\echo '════ الحصيلة ════'
\echo '  ✔ ٣٢ فحصًا + ٢٤ دورًا على items — كلُّها بالإيجاب والنقض'

ROLLBACK;
