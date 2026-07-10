# brandzo_warehouse — موديول Odoo 19

موديول Backend حقيقي يجسّد الدورة المستندية اللوجستية لـ Brandzo (12 مرحلة / 21 نموذجاً)
وقواعدها الذهبية الأربع كحُرّاس صارمين. الخطة المرجعية الكاملة في
[`ODOO_BACKEND_DEVELOPMENT_PLAN.md`](../../ODOO_BACKEND_DEVELOPMENT_PLAN.md) بجذر المستودع.

## الحالة الحالية — S0 + S1

| المرحلة | النطاق | الكائن |
|---|---|---|
| **S0** | سقالة الموديول القابلة للتثبيت النظيف | — |
| **01 — PR** | حوكمة اعتماد (مسودة → قيد الموافقة → معتمد) + منع التأكيد قبل الاعتماد | `purchase.requisition` |
| **02 — PO** | ربط تأكيد أمر الشراء باعتماد طلبه المصدر | `purchase.order` |

## التبعيات (كلها Odoo 19 Community)
`purchase_stock` · `stock_account` · `purchase_requisition` · `product_expiry` · `account` · `barcodes`

## التثبيت / الاختبار

```bash
# 1) ضع المجلد الحاوي ضمن addons_path
./odoo-bin -c odoo.conf \
    --addons-path=/path/to/odoo/addons,/path/to/warehouse-system-main/brandzo-addons \
    -d brandzo_test -i brandzo_warehouse --stop-after-init

# 2) اختبار الدخان: تثبيت + ترقية دون أخطاء
./odoo-bin ... -u brandzo_warehouse --test-enable --stop-after-init
```

## التحقق اليدوي من الحارس (S1)
1. أنشئ اتفاقية شراء (Purchase Agreement) وأضف صنفاً.
2. اضغط **رفع للموافقة** → الحالة "قيد الموافقة" (ذهبي).
3. بحساب بلا صلاحية مدير المشتريات: زر **اعتماد الطلب** غير ظاهر.
4. اضغط **تأكيد** قبل الاعتماد → يُرفض برسالة `UserError`. ✅ الحارس يعمل.
5. اعتمد الطلب ثم أكّده → ينجح ويولّد طلبات عروض الأسعار.

## القادم
S2 (الاستلام + حارس QC على `stock.picking`) — انظر خارطة الطريق في الخطة المرجعية.
