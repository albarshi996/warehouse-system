-- ═══════════════════════════════════════════════════════════════════════════
--  الدفتر — العدّادات والمستندات والحركات والأرصدة
-- ═══════════════════════════════════════════════════════════════════════════
--  ⚠️ هذه الجداولُ **فارغةٌ في Firestore اليوم** (قياس 2026-09-02):
--       balances 0 · stock_moves 0 · counters 2 · documents 175 (تجريبيّة
--       بإقرار المالك). فبناؤها استعدادٌ لا هجرة.
--
--  ★ ومفارقةٌ تستحقّ التسجيل: ٥١ مستندًا مكتوبٌ عليها `posted: true` وتُعلن
--    ٩٦ حركةً — والدفترُ صفر. أي أنّ الحركاتِ حُذفت من خارج التطبيق (القواعدُ
--    تمنع الحذفَ من داخله). ولذلك **لا تُنقل هذه الـ٥١ بحالها**: لو نُقلت
--    بقيت عالقةً أبدًا — يرفض النظامُ تقييدَها لأنّها «مقيَّدةٌ سلفًا»،
--    والمخزنُ لا يراها.
--
--  ★★★ وفي كلّ جدولٍ عمودان يحرسان الهجرة:
--     `firebase_id` — معرّفُ المستند الأصليّ (البند ٧): تُطابَق به القاعدتان.
--     `extra jsonb` — **كلُّ حقلٍ في Firestore لم يذكره الكود**. فالهجرةُ بلا
--       فقدٍ **بالبرهان لا بالثقة**: ما لم نعرفه يُحفظ ولا يُرمى، ويُفحص لاحقًا.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
--  العدّادات — أرقامُ المستندات الرسميّة
--
--  في Firestore: `counters/{TYPE}-{YEAR}` بـ`runTransaction` لضمان الذرّيّة،
--  وقاعدةٌ في `firestore.rules` تمنع التصفير (`canReserveNumber`).
--
--  ★ وهنا الذرّيّةُ أصليّة: `UPDATE … SET seq = seq + 1 RETURNING seq` ذرّيّةٌ
--    بطبعها، ولا تحتاج معاملةً ولا قراءةً قبل الكتابة. وأبسطُ وأسرع.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE counters (
  type        text NOT NULL,
  year        integer NOT NULL CHECK (year BETWEEN 2000 AND 2200),
  seq         integer NOT NULL DEFAULT 0 CHECK (seq >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  extra       jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (type, year)
);

-- العدّادُ يتقدّم ولا يرجع — لا تصفيرَ ولا نقصان، ولو من psql مباشرةً.
CREATE OR REPLACE FUNCTION counters_forward_only() RETURNS trigger AS $$
BEGIN
  IF NEW.seq < OLD.seq THEN
    RAISE EXCEPTION
      'العدّاد «%-%» يتقدّم ولا يرجع: % ⇐ % مرفوض.',
      OLD.type, OLD.year, OLD.seq, NEW.seq;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER counters_guard BEFORE UPDATE ON counters
  FOR EACH ROW EXECUTE FUNCTION counters_forward_only();


-- ───────────────────────────────────────────────────────────────────────────
--  المستندات — رأسُ كلّ عمليّة (شراء · استلام · نقل · بيع · مرتجع · جرد…)
--  البنودُ تبقى في `lines jsonb` كما هي اليوم في Firestore؛ فصلُها إلى جدول
--  بنودٍ خطوةٌ لاحقةٌ **بعد** أن تثبت المطابقة — هجرةٌ واحدةٌ في المرّة.
-- ───────────────────────────────────────────────────────────────────────────
-- ★★ الشكلُ **مقيسٌ من ١٧٥ مستندًا حقيقيًّا** (2026-09-02)، لا مفترَضًا.
--    وأوّلُ ظنٍّ كان خاطئًا: افترضتُ أعمدةً مسطّحةً `warehouse`/`from_warehouse`،
--    والواقعُ أنّها كلَّها داخل كائن `header`. ولو بنيتُ على الظنّ لسقط الرأسُ
--    كلُّه في `extra` بصمت.
--
--    و٣٤ نوعَ مستندٍ في الاستعمال: PO · GRN · TR · TRN · PICK · PUTAWAY · QC ·
--    SO · DN · RET · ADJ · CC … ولذلك `type` نصٌّ لا قائمةٌ مغلقة.
CREATE TABLE documents (
  id          text PRIMARY KEY,
  type        text NOT NULL CHECK (btrim(type) <> ''),
  number      text,                         -- يُحجز مرّةً ولا يتغيّر
  state       text NOT NULL DEFAULT 'draft',
  stage       integer,
  posted      boolean NOT NULL DEFAULT false,

  -- رأسُ المستند كما هو: المخزنُ والطرفُ والمرجعُ ورمزُ المنشأة… يبقى كائنًا
  -- لأنّه يختلف باختلاف النوع. تفكيكُه إلى أعمدةٍ خطوةٌ لاحقةٌ **لأنواعٍ بعينها**
  -- حين يثبت أنّها تُستعلَم، لا اليومَ تخمينًا.
  header      jsonb NOT NULL DEFAULT '{}'::jsonb,
  lines       jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- ربطُ المستندات بعضِها ببعض: { "SO": { "id": "…", "number": "SO-2026-0004" } }
  links       jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by_uid    text NOT NULL DEFAULT '',
  created_by_name   text NOT NULL DEFAULT '',
  created_by_role   text NOT NULL DEFAULT '',

  numbered_at       timestamptz,

  approved_at       timestamptz,
  approved_by_uid   text NOT NULL DEFAULT '',
  approved_by_name  text NOT NULL DEFAULT '',
  approved_by_role  text NOT NULL DEFAULT '',

  posted_at         timestamptz,
  posted_by_uid     text NOT NULL DEFAULT '',
  posted_moves      integer NOT NULL DEFAULT 0,

  firebase_id text UNIQUE,
  extra       jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX documents_header_gin ON documents USING gin (header jsonb_path_ops);

CREATE UNIQUE INDEX documents_number_unique ON documents (number)
  WHERE number IS NOT NULL AND number <> '';
CREATE INDEX documents_type_state ON documents (type, state);
CREATE INDEX documents_created_at ON documents (created_at DESC);

CREATE TRIGGER documents_touch BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- رقمُ المستند ونوعُه يُكتبان مرّةً — يقابل `numberWriteOnce` و`immutableKept`.
CREATE TRIGGER documents_write_once BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION write_once('number', 'type');


-- ───────────────────────────────────────────────────────────────────────────
--  الحركات — الدفترُ الملحَق-فقط. **أخطرُ جدولٍ في النظام.**
--
--  ثلاثُ ضماناتٍ ينصّ عليها `movements.js`، وكلُّها تصير قيدًا في القاعدة:
--    ١. الكمّيّةُ دائمًا موجبة — الاتّجاهُ يحمله from/to لا إشارةُ الرقم.
--    ٢. المعرّفُ حتميّ `docId__lineIndex` — فإعادةُ القيد تكتب فوق نفسها.
--       ★ وهنا يصير مفتاحًا أوّليًّا مركّبًا حقيقيًّا: `(doc_id, line_index)`.
--         وبه تصير **الهجرةُ idempotent ببنيتها** (البند ٩) — بلا حيلة.
--    ٣. لا حركةَ بلا هويّةِ صنفٍ وموقعٍ صالح.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE stock_moves (
  doc_id      text NOT NULL,
  line_index  integer NOT NULL CHECK (line_index >= 0),

  doc_type    text NOT NULL DEFAULT '',
  doc_number  text,

  sku         text NOT NULL DEFAULT '',
  barcode     text NOT NULL DEFAULT '',
  name_ar     text NOT NULL DEFAULT '',
  batch       text NOT NULL DEFAULT '',
  expiry      text NOT NULL DEFAULT '',

  -- طرفا الحركة. `NULL` تعني «خارج المنشأة» وهي **قيمةٌ صالحةٌ لا غياب**.
  from_loc    text,
  to_loc      text,
  from_bin    text NOT NULL DEFAULT '',
  to_bin      text NOT NULL DEFAULT '',
  bin         text NOT NULL DEFAULT '',

  stock_status text NOT NULL DEFAULT 'OK',

  -- الكمّيّةُ موجبةٌ أبدًا (الضمانة ١). السالبُ يُخفي الخطأ؛ والاتّجاهُ يفضحه.
  qty         numeric(18,4) NOT NULL CHECK (qty > 0),
  entry_qty   numeric(18,4) NOT NULL DEFAULT 0,
  entry_uom   text NOT NULL DEFAULT '',
  base_uom    text NOT NULL DEFAULT '',
  unit_cost   numeric(18,4) NOT NULL DEFAULT 0,
  value       numeric(18,4) NOT NULL DEFAULT 0,

  reason       text NOT NULL DEFAULT '',
  reason_label text NOT NULL DEFAULT '',

  trip_ref    text NOT NULL DEFAULT '',
  rep_name    text NOT NULL DEFAULT '',

  -- البُعدُ التنظيميّ مختومًا وقتَ القيد ‹FNB-104› — فيُجاب من الدفتر بلا اشتقاق.
  org_code    text NOT NULL DEFAULT '',
  org_matched boolean NOT NULL DEFAULT false,
  org_branch  text NOT NULL DEFAULT '',
  org_brand   text NOT NULL DEFAULT '',
  org_sector  text NOT NULL DEFAULT '',

  posted_at        timestamptz NOT NULL DEFAULT now(),
  posted_by_uid    text NOT NULL DEFAULT '',
  posted_by_name   text NOT NULL DEFAULT '',
  posted_by_role   text NOT NULL DEFAULT '',

  firebase_id text UNIQUE,
  extra       jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- ★ المعرّفُ الحتميّ صار مفتاحًا: لا ازدواجَ ولو أُعيد القيدُ ألفَ مرّة.
  PRIMARY KEY (doc_id, line_index),

  -- الضمانة ٣: لا حركةَ بلا هويّةِ صنف.
  CONSTRAINT stock_moves_has_identity
    CHECK (btrim(sku) <> '' OR btrim(barcode) <> ''),

  -- حركةٌ بلا طرفين ليست حركة.
  CONSTRAINT stock_moves_has_direction
    CHECK (from_loc IS NOT NULL OR to_loc IS NOT NULL)
);

CREATE INDEX stock_moves_sku       ON stock_moves (sku, posted_at DESC);
CREATE INDEX stock_moves_doc       ON stock_moves (doc_id);
CREATE INDEX stock_moves_posted_at ON stock_moves (posted_at DESC);
CREATE INDEX stock_moves_from      ON stock_moves (from_loc) WHERE from_loc IS NOT NULL;
CREATE INDEX stock_moves_to        ON stock_moves (to_loc)   WHERE to_loc   IS NOT NULL;


-- ───────────────────────────────────────────────────────────────────────────
--  الأرصدة — المفتاحُ المركّب صار مفتاحًا حقيقيًّا
--
--  في Firestore: معرّفٌ نصّيٌّ يبنيه `balanceId()` بدالّة `safe()` تُنظّف «/»
--  و«.» — **حيلةٌ فرضها قيدُ معرّفات Firestore لا حاجةُ العمل**.
--  وهنا تسقط الحيلةُ ويصير المفتاح ما هو في الحقيقة: قيدَ تفرّدٍ على أعمدة.
--
--  ★★ وحارسُ الرصيد السالب: اليوم `findNegativeBalance` يقرأ **كلَّ** رصيدٍ
--     ناقصٍ داخل المعاملة قبل أيّ كتابة (لأنّ Firestore يشترط ذلك). وهنا
--     `CHECK (qty >= 0)` — أبسطُ وأقوى: **لا يمرّ سالبٌ ولو من مسارٍ لم نكتبه**،
--     ولا من سكربتِ استيرادٍ ولا من psql. الحمايةُ في القاعدة لا في المستدعي.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE balances (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  sku           text NOT NULL DEFAULT '',
  barcode       text NOT NULL DEFAULT '',
  name_ar       text NOT NULL DEFAULT '',
  warehouse     text NOT NULL CHECK (btrim(warehouse) <> ''),
  batch         text NOT NULL DEFAULT '',
  bin           text NOT NULL DEFAULT '',
  expiry        date,
  stock_status  text NOT NULL DEFAULT 'OK',

  qty           numeric(18,4) NOT NULL DEFAULT 0 CHECK (qty >= 0),
  qty_reserved  numeric(18,4) NOT NULL DEFAULT 0 CHECK (qty_reserved >= 0),
  unit_cost     numeric(18,4) NOT NULL DEFAULT 0,

  updated_at    timestamptz NOT NULL DEFAULT now(),

  firebase_id   text UNIQUE,
  extra         jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- هويّةُ الصنف: الكودُ أوّلًا فالباركود (توافقٌ رجعيٌّ لأرصدةٍ سابقةٍ على
  -- اعتماد «الكود هو الهويّة»). مطابقٌ لقاعدة `balanceId`.
  CONSTRAINT balances_has_identity
    CHECK (btrim(sku) <> '' OR btrim(barcode) <> '')
);

-- ★★★ هذا هو `balanceId()` — لا مبنيًّا بالنصّ، بل مفروضًا في القاعدة.
--     الهويّة: (الصنف × المخزن × التشغيلة × الموقع × الصلاحية × الحالة)
CREATE UNIQUE INDEX balances_identity ON balances
  (sku, barcode, warehouse, batch, bin, COALESCE(expiry, 'infinity'::date), stock_status);

CREATE INDEX balances_sku       ON balances (sku)       WHERE qty > 0;
CREATE INDEX balances_warehouse ON balances (warehouse) WHERE qty > 0;
-- ترتيبُ FEFO — الأقربُ انتهاءً أوّلًا (`fefoSort` في balanceKey.js).
CREATE INDEX balances_fefo      ON balances (sku, warehouse, expiry NULLS LAST) WHERE qty > 0;

CREATE TRIGGER balances_touch BEFORE UPDATE ON balances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ⚠️ لا مفتاحَ أجنبيٌّ من `balances.sku` إلى `items.sku` بعد — **عمدًا**.
--    `balanceKey.js` ينصّ أنّ أرصدةً قديمةً مفتاحُها الباركودُ بلا كود، وإضافةُ
--    القيد الآن ترفض بياناتٍ حقيقيّة. يُشدَّد **بعد** أن تُثبت المطابقةُ نظافةَ
--    البيانات — قياسٌ قبل إحكام، لا العكس.

INSERT INTO schema_migrations (version) VALUES ('003-ledger')
  ON CONFLICT (version) DO NOTHING;
