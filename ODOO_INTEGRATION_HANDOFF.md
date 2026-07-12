# ملف تسليم: ربط موقع Brandzo التفاعلي بأودو
# Odoo Integration Handoff — Brandzo Warehouse System

> **لمن هذه الوثيقة / Audience:** مطوّر برمجي مكلَّف بربط واجهة Brandzo (Astro/React على GitHub Pages)
> بنظام **Odoo 19 Community** حيّ يعمل عليه موديول `brandzo_warehouse` المخصّص.
> **الرسالة الأساسية:** طبقة الربط في الواجهة **مكتوبة وجاهزة بالفعل**؛ المطلوب منك هو **نشر الوسيط
> (proxy) وتوصيله بأودو حقيقي وتوسيع قائمة الصلاحيات** — لا إعادة بناء.
>
> *This brief hands off the "wire it to a real Odoo" task. The frontend integration layer already
> exists; your job is to deploy the proxy, connect a live Odoo, and extend the allowlist.*

---

## 0. الخلاصة في ثلاثة أسطر / TL;DR

1. الواجهة الثابتة (GitHub Pages) تنادي عميل Odoo مجرّدًا ← يرسل RPC إلى **وسيط خادمي** ← الوسيط يحقن الأسرار
   ويستدعي `execute_kw` في أودو ← الموديول `brandzo_warehouse` يفرض القواعد.
2. كل الكود موجود: `src/services/odoo/**` (العميل) + `odoo-proxy/**` (وسيطان مرجعيان: Cloudflare/Firebase).
3. عملك = **نشر الوسيط بأسراره + توسيع الـ allowlist + قلب المتغيّر `PUBLIC_ODOO_MODE=production`**.

---

## 1. المعمارية / Architecture

```
[ المتصفّح / Browser ]            الموقع الثابت على GitHub Pages (Astro/React)
        │  import { odoo } from 'src/services/odoo'
        │  odoo.searchRead / create / write / unlink / authenticate
        ▼
[ المُبدّل / Switch ]             src/services/odoo/index.js
        │  PUBLIC_ODOO_MODE=training   → mockOdooClient  (offline, الافتراضي)
        │  PUBLIC_ODOO_MODE=production → realOdooClient
        ▼
[ عميل أودو / Real client ]       src/services/odoo/odooClient.js
        │  POST {PUBLIC_ODOO_PROXY_URL}
        │  body: { model, method, args, kwargs }
        ▼
[ الوسيط / Proxy ]  ★مهمتك★       odoo-proxy/cloudflare-worker/worker.js  (أو firebase-function/)
        │  1) يحقن الأسرار (DB/user/API key)  2) يصادق  3) allowlist  4) CORS
        │  Odoo JSON-RPC: POST {ODOO_URL}/jsonrpc  → object.execute_kw
        ▼
[ أودو / Odoo 19 ]                نظامك الحيّ + موديول brandzo_warehouse
                                  ← يفرض القواعد الذهبية (QC · FEFO · Gate Pass · 3-Way · التسويات)
```

**لماذا وسيط ولا نتّصل بأودو مباشرة؟ / Why a proxy?**
- المتصفّح **يجب ألّا يحمل أسرار أودو** (DB / API key) — أي شيء في الواجهة مكشوف للعميل.
- نقطة `/jsonrpc` في أودو **لا تُصدِر ترويسات CORS**، فالمتصفّح لا يستطيع مناداتها مباشرة.
- الوسيط يحلّ الاثنين: يحفظ الأسرار على الخادم، ويضيف CORS، ويفرض **قائمة سماح (allowlist)**
  تمنع أي (model, method) غير مصرّح به.

---

## 2. ما هو مبنيّ بالفعل — لا تُعِد بناءه / Already built — do NOT rebuild

| المكوّن | الملف | الدور |
|---|---|---|
| نقطة الدخول + المُبدّل | `src/services/odoo/index.js` | يصدّر `odoo` ويختار mock/real حسب الوضع |
| العميل الحقيقي | `src/services/odoo/odooClient.js` | 5 دوال: `authenticate/searchRead/create/write/unlink` |
| العميل الوهمي | `src/services/odoo/mockOdooClient.js` | يعمل دون اتصال (وضع التدريب) |
| الإعدادات | `src/services/odoo/odooConfig.js` | يقرأ `PUBLIC_ODOO_MODE` و`PUBLIC_ODOO_PROXY_URL` |
| مُترجِم الحقول | `src/services/odoo/odooMapper.js` | يحوّل سجلّات أودو ↔ شكل بيانات الموقع |
| الوسيط (Cloudflare) | `odoo-proxy/cloudflare-worker/worker.js` | تنفيذ مرجعي كامل للعقد + allowlist + CORS |
| الوسيط (Firebase) | `odoo-proxy/firebase-function/index.js` | بديل على Firebase Functions |
| الموديول الخلفي | `brandzo-addons/brandzo_warehouse/` | القيود الصارمة (S1–S6 + S5a + S5b) |

> ملاحظة: صفحة التدريب `src/pages/dashboard/training.astro` تستورد `mockOdooClient` **مباشرة** عمدًا،
> فتبقى دون اتصال حتى لو حوّلت التطبيق كلّه للإنتاج.

---

## 3. عقد الاتصال / The wire contract (browser ↔ proxy)

الوسيط شبه ممرّ (near pass-through) يعكس `execute_kw(db, uid, pwd, model, method, args, kwargs)`.

**الطلب / Request** — `POST {PUBLIC_ODOO_PROXY_URL}` · `Content-Type: application/json`
```json
{ "model": "product.product", "method": "search_read",
  "args": [[["default_code","=","BZ-VCS-30"]]],
  "kwargs": { "fields": ["default_code","name","qty_available"], "limit": 20 } }
```
حالة خاصة لفحص الاتصال: `{ "method": "authenticate" }` → يعيد `uid`.

**الرد / Reply**
```json
{ "result": [ /* ... */ ] }          // نجاح
{ "error": { "message": "…" } }      // فشل (يرميه العميل كـ Error برسالته)
```

---

## 4. خطوات التنفيذ (هذا هو العمل المطلوب) / Implementation steps

### الخطوة ١ — تجهيز أودو / Provision Odoo
- [ ] نسخة **Odoo 19 Community** حيّة (سحابية أو ذاتية الاستضافة).
- [ ] تثبيت الموديول: انسخ `brandzo-addons/brandzo_warehouse/` إلى مسار `addons`، فعّل «وضع المطوّر»،
      حدّث قائمة التطبيقات، ثبّت **Brandzo Warehouse**. تبعيّاته:
      `purchase_stock, stock_account, purchase_requisition, product_expiry, account, barcodes`.
- [ ] شغّل اختبارات القبول للتأكّد (بيئة أودو، لا مفسّر محلي): `odoo -d <db> -i brandzo_warehouse --test-enable --stop-after-init`.

### الخطوة ٢ — مستخدم تكامل ومفتاح API / Integration user + API key
- [ ] أنشئ مستخدم أودو مخصّصًا للتكامل (least-privilege) واضبط مجموعاته من مجموعات Brandzo حسب الحاجة
      (`group_bz_warehouse_user`، وربما `group_bz_inventory_auditor` … إلخ).
- [ ] وَلِّد مفتاح API: **Settings → Account Security → New API Key** (يُستخدم بدل كلمة المرور).

### الخطوة ٣ — الحقول المخصّصة على المنتج / Custom product fields
المُترجِم يتوقّع حقولًا مخصّصة على `product.product`. اختر أحد مسارين:
- **(أ)** أنشئها عبر Studio أو موديول صغير: `x_name_en` (Char)، `x_min_stock` (Float)، `x_category_label` (Char)، أو
- **(ب)** احذف هذه الحقول من `odooMapper.js` إن لم تكن مطلوبة (المُترجِم يتحمّل غيابها بأمان أصلًا).

### الخطوة ٤ — نشر الوسيط / Deploy the proxy (اختر واحدًا)
**Cloudflare Worker** (المرجع الأساسي):
```bash
cd odoo-proxy/cloudflare-worker
cp wrangler.toml.example wrangler.toml   # اضبط ALLOWED_ORIGIN = https://albarshi996.github.io
npm i -g wrangler
wrangler secret put ODOO_URL      # https://yourcompany.odoo.com
wrangler secret put ODOO_DB       # اسم قاعدة البيانات
wrangler secret put ODOO_USER     # بريد الدخول
wrangler secret put ODOO_API_KEY  # مفتاح API من الخطوة ٢
wrangler deploy                   # يعطيك رابط الـ worker
```
**أو Firebase Function**: انشر `odoo-proxy/firebase-function/` واضبط نفس الأسرار عبر `firebase functions:config` / بيئة التشغيل.

> ⚠️ الأسرار (`ODOO_URL/DB/USER/API_KEY`) تعيش **فقط** في مخزن أسرار الوسيط — لا في `.env` الواجهة ولا بأي بادئة `PUBLIC_`.

### الخطوة ٥ — توسيع قائمة السماح / Extend the allowlist
`ALLOWLIST` في `worker.js` حاليًا للقراءة أساسًا. أضِف ما تتطلّبه الشاشات فعليًا، وبأقل صلاحية. أمثلة محتملة:
```js
const ALLOWLIST = {
  'product.product':      ['search_read','read','create','write'],
  'product.template':     ['search_read','read'],
  'stock.quant':          ['search_read','read'],
  'stock.move':           ['search_read','read','create'],
  'stock.picking':        ['search_read','read','button_validate'], // فرض حرّاس GRN/FEFO/GatePass
  'purchase.order':       ['search_read','read','button_confirm'],
  'purchase.requisition': ['search_read','read'],
  'account.move':         ['search_read','read'],                   // المطابقة الثلاثية
  'bz.gate.pass':         ['search_read','read','create','action_approve'],
  'bz.cycle.count':       ['search_read','read','create','action_start','action_validate','action_apply'],
  'res.partner':          ['search_read','read'],
};
```
> كل إضافة توسّع سطح الهجوم — أضِف بوعي، ولا تفتح `unlink` إلا عند ضرورة حقيقية.

### الخطوة ٦ — تشغيل وضع الإنتاج / Flip to production
- [ ] في بيئة بناء الموقع اضبط: `PUBLIC_ODOO_MODE=production` و`PUBLIC_ODOO_PROXY_URL=<رابط الوسيط>`.
- [ ] **أعد البناء والنشر** (`npm run build` ثم دفع إلى `main`). ⚠️ متغيّرات `PUBLIC_` تُدمَج وقت **البناء**،
      فتغييرها يستلزم إعادة بناء — لا يكفي تغييرها بعد النشر.

### الخطوة ٧ — الاختبار / Test
- [ ] «اختبار الاتصال»: نادِ `odoo.authenticate()` → يجب أن يعيد `uid`.
- [ ] قراءة: `odoo.searchRead('product.product', [], ['default_code','name','qty_available'], {limit:10})`.
- [ ] تدفّق كتابة واحد من طرف إلى طرف (مثلًا إنشاء منتج) وتأكّد من ظهوره في أودو.
- [ ] تدفّق يفرض حارسًا (مثلًا `button_validate` على استلام قبل الجودة) وتأكّد أن الرسالة (UserError) تصل للواجهة وتُعرَض.

### الخطوة ٨ — التبنّي التدريجي / Gradual page-by-page adoption
الموقع اليوم يعمل على Firestore/المحاكي. حوّل الشاشات إلى أودو **واحدة تلو الأخرى** (المنتجات أولًا ثم الحركات)
باستبدال نداءات الخدمة بنداء `odoo.*` عبر المُترجِم — لا حاجة لإعادة كتابة الصفحات دفعة واحدة.

---

## 5. جدول ربط الحقول / Field mapping (المصدر: `odooMapper.js`)

**`product.product` ↔ `Items_Master`**
| Odoo | التطبيق / App | ملاحظة |
|---|---|---|
| `default_code` | `sku` | كود الصنف |
| `name` | `nameAr` | الاسم المعروض |
| `x_name_en` | `nameEn` | حقل مخصّص (اختياري) |
| `categ_id` (m2o) | `category` | يُقرأ من `[id,"name"]` |
| `uom_id` (m2o) | `unit` | وحدة القياس |
| `qty_available` | `balance` | **محسوب في أودو — للقراءة فقط** |
| `x_min_stock` | `minStock` | حقل مخصّص (اختياري) |

**`stock.move` ↔ سجلّ الإدخال/الإخراج / log**: `product_id → itemCode` (يُستخرج من `[CODE] Name`)، `product_uom_qty → qty`، `date → timestamp`.

---

## 6. نقاط انتباه حرجة / Critical gotchas

- **`qty_available` محسوب** ولا يُكتب مباشرة. الأرصدة تتغيّر عبر `stock.move` / `stock.picking` (والجرد عبر
  `bz.cycle.count`)، لا بالكتابة على المنتج. المُترجِم يحذفه من قيم الكتابة عمدًا.
- **حرّاس القواعد الذهبية ترمي `UserError`** عند المخالفة. العميل يرميها كـ `Error` برسالتها؛ الواجهة يجب أن
  **تعرضها للمستخدم** (Toast عربي) بدل ابتلاعها — القواعد تُفرض في أودو لا في الواجهة.
- **المتغيّرات `PUBLIC_` تُدمَج وقت البناء** (Astro) — أعد البناء بعد أي تغيير للبيئة.
- **CORS مقيّد** بأصل GitHub Pages في الوسيط (`ALLOWED_ORIGIN`) — حدّثه إن تغيّر النطاق.
- **الأسرار لا تُلمَس في الواجهة** — لا تضع أي مفتاح أودو في `.env` أو بأي بادئة `PUBLIC_`.

---

## 7. قائمة مهام جاهزة للإرسال / Copy-paste task checklist

```
[ ] Odoo 19 Community حيّ + تثبيت brandzo_warehouse (+ تبعيّاته) واجتياز الاختبارات
[ ] مستخدم تكامل least-privilege + مفتاح API + مجموعات Brandzo
[ ] الحقول المخصّصة x_name_en / x_min_stock / x_category_label (أو حذفها من المُترجِم)
[ ] نشر الوسيط (Cloudflare Worker أو Firebase) بالأسرار الأربعة + ALLOWED_ORIGIN
[ ] توسيع ALLOWLIST للنماذج/الدوال التي تحتاجها الشاشات (بأقل صلاحية)
[ ] ضبط PUBLIC_ODOO_MODE=production + PUBLIC_ODOO_PROXY_URL ثم إعادة بناء ونشر الموقع
[ ] اختبار: authenticate → قراءة منتجات → تدفّق كتابة → تدفّق يفرض حارسًا
[ ] تحويل الشاشات إلى أودو تدريجيًا (المنتجات ثم الحركات)
```

---

## 8. مراجع داخل المستودع / In-repo references
- طبقة الواجهة: `src/services/odoo/**`
- الوسطاء المرجعيّون + دليلهم: `odoo-proxy/**` (اقرأ `odoo-proxy/README.md`)
- الموديول الخلفي وحالته: `brandzo-addons/brandzo_warehouse/README.md`
- الخطة المعمارية الكاملة للموديول: `ODOO_BACKEND_DEVELOPMENT_PLAN.md`
- الوثيقة الجامعة للمشروع: `PROJECT_MEMORY.md`

*نهاية ملف التسليم — عند الشك، ثق بالكود الفعلي في `src/services/odoo/` و`odoo-proxy/` فهو مصدر الحقيقة.*
