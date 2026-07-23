# خطة التطوير والتنفيذ الاحترافية — موديول `brandzo_warehouse` على Odoo 19

> الانتقال بالمنطق اللوجستي من محاكي الواجهة الأمامية (Astro/React) إلى **Backend Modules** حقيقية بلغة Python و XML.
> **مبنيّة على فحص فعلي** لمصدر Odoo 19 المحلي (627 موديولاً) ومصفوفة الـ12 مرحلة / 21 نموذجاً المُبرمجة في الواجهة.
> جميع مسارات Odoo أدناه نسبةً إلى: `تطوير الموقع/odoo-19.0/odoo-19.0/addons/`

---

## 0. قرارات معمارية حاسمة (مستنبطة من الفحص — تُغيّر مسار التنفيذ كله)

| # | الاكتشاف من المصدر | الأثر على الخطة |
|---|---|---|
| **أ** | النسخة **Community** — لا يوجد موديول `quality` / `quality_control` (مؤسسي فقط) | **فحص الجودة (QC) نبنيه نحن** كحقول + حالة + قيد على `stock.picking` |
| **ب** | لا يوجد `account_3way_match` (مؤسسي فقط)، لكن Community يوفّر `purchase.bill.line.match` (SQL view) + العلم `is_purchase_matched` | **المطابقة الثلاثية نبنيها نحن** فوق هذه الأدوات كقيد على `account.move._post` |
| **ج** | 🔴 `stock.valuation.layer` **أُزيل نهائياً في Odoo 19** — التقييم انتقل مباشرةً إلى `stock.move` (`value`, `remaining_qty`, `account_move_id`) | نستهدف **`stock.move` للتقييم** وليس SVL. المتطلب الأصلي (SVL) قديم |
| **د** | `purchase_requisition` **موجود** (`purchase.requisition`: draft→confirmed→done) | نبنيه كأساس لمرحلة **طلب الشراء (PR)** بدل اختراع نموذج جديد |
| **هـ** | `product_expiry` **موجود** ويضيف `removal_date` + استراتيجية **FEFO** الحقيقية | نُثبّته كتبعية ونبني حارس FEFO **فوق** استراتيجيته لا بدلاً منها |
| **و** | في v19: `qty_done` على `stock.move.line` **أُعيدت تسميته إلى `quantity`** | كل كودنا يستخدم `quantity` وليس `qty_done` |

**الفلسفة الحاكمة:** التوسيع بالوراثة (`_inherit`) لا إعادة الاختراع. المنطق القياسي لـ Odoo (تدفق الحالات، إنشاء الإذون، القيود المحاسبية) نتركه يعمل، ونضيف فوقه **أربعة حُرّاس صارمين (Hard Guards)** يعكسون القواعد الذهبية الأربع.

---

## 1. هيكلة المجلدات (Module Structure)

الموديول يُوضَع في مجلد addons مخصّص (مثلاً `brandzo-addons/`) يُضاف إلى `addons_path`:

```
brandzo_warehouse/
├── __init__.py                      # from . import models, wizards
├── __manifest__.py                  # التعريف والتبعيات
│
├── models/
│   ├── __init__.py
│   ├── purchase_requisition.py      # PR  — المرحلة 01
│   ├── purchase_order.py            # PO  — المرحلة 02
│   ├── stock_picking_type.py        # أعلام bz_qc_required / bz_is_dispatch
│   ├── stock_picking.py             # ASN·GRN·Putaway·Picking·Dispatch (03–07) + حُرّاس QC/FEFO/GatePass
│   ├── stock_move_line.py           # مساعِدات FEFO على سطر الحركة
│   ├── stock_lot.py                 # تشغيلات + صلاحية (فوق product_expiry)
│   ├── stock_quant.py               # الجرد الدوري والتسويات (09–10)
│   ├── gate_pass.py                 # نموذج bz.gate.pass المستقل (07)
│   ├── account_move.py              # المطابقة الثلاثية (11) على _post
│   └── res_config_settings.py       # سماحية المطابقة / إجبار QC عامّةً
│
├── views/
│   ├── purchase_requisition_views.xml
│   ├── purchase_order_views.xml
│   ├── stock_picking_views.xml      # statusbar + tabs QC/GatePass + decorations
│   ├── gate_pass_views.xml
│   ├── stock_quant_views.xml        # شاشة الجرد الدوري
│   ├── account_move_views.xml       # لوحة المطابقة الثلاثية
│   ├── brandzo_menus.xml            # قائمة Brandzo الجذر + الأصناف الفرعية
│   └── assets.xml                   # حقن SCSS الخاص بألوان الحالات
│
├── security/
│   ├── brandzo_security.xml         # مجموعات: مستخدم مخزون / مشرف QC / مدير مالي
│   └── ir.model.access.csv          # أذونات CRUD لكل نموذج × مجموعة
│
├── data/
│   ├── ir_sequence_data.xml         # ترقيم PR/GRN/GatePass...
│   ├── removal_strategy_data.xml    # ربط FEFO بفئات المنتجات المبردة
│   └── mail_template_data.xml       # إشعارات ASN / فشل QC
│
├── reports/
│   ├── grn_report.xml               # QWeb — يطابق form_GRN.html
│   ├── gate_pass_report.xml         # QWeb — يطابق form_GatePass.html
│   └── report_paperformat.xml
│
├── wizards/
│   ├── __init__.py
│   └── qc_inspection_wizard.py      # تسجيل نتيجة الفحص + التوقيع
│
└── static/
    └── src/scss/brandzo_status.scss # الذهبي/الأخضر/الأحمر للحالات
```

### `__manifest__.py`

```python
{
    'name': 'Brandzo Warehouse — Document Cycle & Golden Rules',
    'version': '19.0.1.0.0',
    'category': 'Inventory/Inventory',
    'summary': 'دورة مستندية 12 مرحلة + 21 نموذجاً + 4 قواعد ذهبية كحُرّاس صارمين',
    'author': 'Brandzo HUB',
    'license': 'LGPL-3',
    # التبعيات تجرّ تلقائياً purchase + stock + account
    'depends': [
        'purchase_stock',        # purchase.order._create_picking (الربط PO→GRN)
        'stock_account',         # التقييم على stock.move (بديل SVL في v19)
        'purchase_requisition',  # purchase.requisition (مرحلة PR)
        'product_expiry',        # removal_date + استراتيجية FEFO
        'account',               # فواتير الموردين والإشعارات الدائنة
        'barcodes',              # مسح الباركود في GRN (Community)
    ],
    'data': [
        'security/brandzo_security.xml',
        'security/ir.model.access.csv',
        'data/ir_sequence_data.xml',
        'data/removal_strategy_data.xml',
        'data/mail_template_data.xml',
        'views/purchase_requisition_views.xml',
        'views/purchase_order_views.xml',
        'views/stock_picking_views.xml',
        'views/gate_pass_views.xml',
        'views/stock_quant_views.xml',
        'views/account_move_views.xml',
        'views/brandzo_menus.xml',
        'reports/report_paperformat.xml',
        'reports/grn_report.xml',
        'reports/gate_pass_report.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'brandzo_warehouse/static/src/scss/brandzo_status.scss',
        ],
    },
    'application': True,
    'installable': True,
}
```

**ملاحظة تكامل مع الواجهة الحالية:** طبقة `odooMapper.js` تقرأ حقولاً باسم `x_name_en` / `x_min_stock` / `x_category_label` (اصطلاح Studio). للحفاظ على توافق الواجهة، نُبقي هذه الأسماء لحقول المنتج، ونستخدم البادئة `bz_` لكل حقول الدورة الجديدة (منعاً للتضارب ولوضوح المصدر).

---

## 2. وراثة كائنات Odoo القياسية (Models Inheritance)

الجدول يربط كل كائن قياسي بملفه المصدري الحقيقي، وما نضيفه، ونقطة الربط المؤكَّدة بالسطر:

| الكائن القياسي | الملف المصدري (سطر) | نقطة الربط المؤكَّدة | ما نضيفه في `brandzo_warehouse` |
|---|---|---|---|
| `purchase.requisition` | `purchase_requisition/models/purchase_requisition.py:8` | state: draft→confirmed→done (34-42) | حقل `bz_approval_state` لمحاكاة draft→to_approve→approved |
| `purchase.order` | `purchase/models/purchase_order.py:21` | `button_confirm` (625)، state (105) | لا تعديل جوهري — الحالات rfq/sent/purchase تطابق الواجهة |
| `stock.picking.type` | `stock/models/stock_picking.py:20` | `code` (42): incoming/outgoing/internal | `bz_qc_required` (bool)، `bz_is_dispatch` (bool) لتصنيف الإذون |
| `stock.picking` | `stock/models/stock_picking.py:539` | **`button_validate` (1399)**، state (575) | حقول QC + GatePass + الحُرّاس الثلاثة |
| `stock.move.line` | `stock/models/stock_move_line.py:16` | `quantity` (37)، `lot_id` (48) | مساعِدات فحص FEFO (`expiration_date` من product_expiry) |
| `stock.lot` | `stock/models/stock_lot.py:25` (+`product_expiry`) | `removal_date` (production_lot.py:17) | لا شيء — نستهلك `removal_date` كمفتاح FEFO |
| `stock.quant` | `stock/models/stock_quant.py` | `inventory_quantity` (97)، `action_apply_inventory` (433) | جلسة جرد دوري `bz.cycle.count` تلفّ الأرصدة |
| `account.move` | `account/models/account_move.py:5526` | **`_post()` (5526)**، `is_purchase_matched` (account_invoice.py:27) | حارس المطابقة الثلاثية |

### 🔑 نقاط الربط الحرجة (Override Hooks) — مؤكَّدة من الفحص

- **حُرّاس المخزون (GRN/Picking/Dispatch):** `stock.picking.button_validate` — `stock/models/stock_picking.py:1399`. يستدعي `_sanity_check` (1352) ثم `_pre_action_done_hook` (1474) ثم `_action_done` (1256). نضع فحوصنا **قبل** `super()`.
- **قاعدة FEFO (المرساة):** الترتيب الفعلي في `product_expiry/models/stock_quant.py:24-28` →
  `return 'removal_date, in_date, id'`. مطبَّق داخل `stock.quant._gather` (`stock/models/stock_quant.py:771`). حارسنا يتحقق أن ما سُحب فعلاً يطابق هذا الترتيب.
- **حارس المطابقة الثلاثية:** `account.move._post` — `account/models/account_move.py:5526` (وليس `action_post` 6116، لأن الترحيل البرمجي يتجاوزه). أسلوب البيت: تجميع الرسائل في `set` ثم `raise UserError` مرة واحدة (5638-5640).

---

## 3. خريطة المراحل الـ12 ↔ كائنات Odoo (مصدر الحقيقة: `trainingCycleData.js`)

| # | المرحلة | تدفق الواجهة (`flow`) | الكائن المستهدف | نوع الإذن (`code`) | الحارس | النموذج (من 21) |
|---|---|---|---|---|---|---|
| 01 | PR طلب الشراء | draft→to_approve→approved | `purchase.requisition` | — | — | 1 |
| 02 | PO أمر الشراء | rfq→rfq_sent→confirmed | `purchase.order` | — | — | 2 |
| 03 | ASN إشعار الشحن | scheduled | `stock.picking` | incoming | — | 3 |
| 04 | GRN الاستلام+الجودة | ready→in_progress→waiting_qc→done | `stock.picking` | incoming | **QC** | 4، 5 |
| 05 | Putaway التخزين | ready→done | `stock.picking` + `stock.putaway.rule` | internal | — | 6، 7 |
| 06 | Picking التحضير | ready→in_progress→done | `stock.picking` | outgoing | **FEFO** | 8، 9، 10 |
| 07 | Dispatch الشحن | ready→done | `stock.picking` + `bz.gate.pass` | outgoing | **GatePass** | 11، 12، 13 |
| 08 | Returns المرتجعات | draft→approved→done | `stock.return.picking` + `account.move`(in_refund) + `stock.scrap` | — | — | 14، 15، 17 |
| 09 | Cycle Count الجرد | draft→in_progress→validated→done | `stock.quant`(inventory) + `bz.cycle.count` | — | — | 18 |
| 10 | Adjustment التسويات | draft→validated | `stock.quant` + `stock.move.value` | inventory | — | 16 |
| 11 | Match المطابقة+الفاتورة | draft→posted→in_payment→paid | `account.move` (in_invoice) | — | **3-Way** | — |
| 12 | Close الإغلاق المالي | open→closed | `res.company` lock dates + `bz.period.close` | — | — | — |

**ملاحظات على المطابقة:**
- الحالة `waiting_qc` (مرحلة 04) و`in_progress` غير موجودتين في `stock.picking` القياسي (حالاته: draft/waiting/confirmed/assigned/done/cancel). نُمثّلهما بحقل فرعي `bz_qc_state` = pending، فالحالة القياسية تبقى `assigned` حتى `button_validate`.
- المرحلة 09 (الجرد) في Community لا يوجد فيها كائن جلسة `stock.inventory` (أُزيل)؛ نلفّ `stock.quant` بنموذج جلسة `bz.cycle.count` لتجميد وإدخال العدّ.

---

## 4. القيود الحاكمة (Business Constraints) — الحُرّاس الأربعة

كل حارس يُنفَّذ بطبقتين: **(أ) `button_validate`/`_post` override** لتجربة مستخدم فورية، و**(ب) `@api.constrains`** كحارس صارم لا يمكن تجاوزه حتى برمجياً (دفاع في العمق). هذا ما طلبته حرفياً.

### 4.1 الحارس الأول — لا Done قبل الجودة (QC Gate على GRN)

`models/stock_picking_type.py`:
```python
from odoo import fields, models

class StockPickingType(models.Model):
    _inherit = 'stock.picking.type'

    bz_qc_required = fields.Boolean(
        string='Requires Quality Control',
        help="عند التفعيل: لا يُرحَّل الاستلام إلا بنتيجة QC = Passed.")
    bz_is_dispatch = fields.Boolean(string='Gate-Pass Dispatch')
```

`models/stock_picking.py`:
```python
from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError

class StockPicking(models.Model):
    _inherit = 'stock.picking'

    bz_qc_state = fields.Selection([
        ('none', 'غير مطلوب'),
        ('pending', 'بانتظار الفحص'),
        ('passed', 'اجتاز الفحص'),
        ('failed', 'فشل الفحص'),
    ], string='نتيجة فحص الجودة', default='none', copy=False, tracking=True)
    bz_qc_inspector_id = fields.Many2one('res.users', string='مفتش الجودة', copy=False)
    bz_qc_date = fields.Datetime(string='تاريخ الفحص', copy=False)
    bz_qc_required = fields.Boolean(related='picking_type_id.bz_qc_required', store=True)

    # (أ) الحارس التفاعلي — يمنع الزر ويشرح السبب
    def button_validate(self):
        for picking in self:
            if (picking.picking_type_id.code == 'incoming'
                    and picking.bz_qc_required
                    and picking.bz_qc_state != 'passed'):
                raise UserError(_(
                    "لا يمكن إتمام الاستلام %(name)s: نتيجة فحص الجودة '%(qc)s' "
                    "بينما القاعدة الذهبية تتطلب 'اجتاز الفحص'.",
                    name=picking.name,
                    qc=dict(self._fields['bz_qc_state'].selection).get(picking.bz_qc_state)))
        return super().button_validate()

    # (ب) الحارس الصارم — يمنع أي وصول للحالة done ولو برمجياً
    @api.constrains('state', 'bz_qc_state', 'bz_qc_required')
    def _bz_check_qc_before_done(self):
        for picking in self:
            if (picking.state == 'done'
                    and picking.picking_type_id.code == 'incoming'
                    and picking.bz_qc_required
                    and picking.bz_qc_state != 'passed'):
                raise ValidationError(_(
                    "خرقٌ للقاعدة الذهبية (QC): الاستلام %s لا يُعتمد قبل توقيع الجودة (Passed).",
                    picking.name))
```

### 4.2 الحارس الثاني — FEFO إلزامي عند التحضير (Picking)

المرساة: الترتيب `removal_date, in_date, id` (من `product_expiry/models/stock_quant.py:24`). الحارس يمنع تمرير سطر يحمل تشغيلة أحدث صلاحيةً بينما تشغيلة أقرب انتهاءً ما تزال متاحة في موقع المصدر.

`models/stock_picking.py` (تكملة):
```python
    def _bz_check_fefo(self):
        """يرفض إتمام السحب إذا خالف المستخدم ترتيب FEFO (تلاعب بالتشغيلة)."""
        Quant = self.env['stock.quant']
        for picking in self.filtered(lambda p: p.picking_type_id.code == 'outgoing'):
            for move in picking.move_ids:
                if not move.product_id.use_expiration_date:
                    continue
                picked = move.move_line_ids.filtered(lambda ml: ml.lot_id and ml.quantity > 0)
                if not picked:
                    continue
                picked_removal = min(picked.mapped('lot_id.removal_date'))
                # هل توجد تشغيلة أقرب انتهاءً ما تزال على الرصيد في موقع المصدر؟
                earlier = Quant.search([
                    ('product_id', '=', move.product_id.id),
                    ('location_id', 'child_of', move.location_id.id),
                    ('quantity', '>', 0),
                    ('removal_date', '<', picked_removal),
                ], order='removal_date asc', limit=1)
                if earlier:
                    raise UserError(_(
                        "خرقٌ لقاعدة FEFO في المنتج %(p)s: سُحبت التشغيلة %(bad)s بينما "
                        "التشغيلة %(good)s الأقرب انتهاءً (%(d)s) ما تزال متاحة. اسحب الأقدم أولاً.",
                        p=move.product_id.display_name,
                        bad=picked[0].lot_id.name,
                        good=earlier.lot_id.name, d=earlier.removal_date))

    def button_validate(self):
        # يُدمج مع فحص QC أعلاه في نفس الدالة
        self._bz_check_fefo()
        return super().button_validate()
```

`data/removal_strategy_data.xml` — تفعيل FEFO على فئة المنتجات المبردة:
```xml
<odoo>
  <record id="categ_cold_cosmetics" model="product.category">
    <field name="name">مستحضرات تجميل (تخزين مبرّد)</field>
    <!-- removal_fefo مُعرّف في product_expiry/data/product_expiry_data.xml -->
    <field name="removal_strategy_id" ref="product_expiry.removal_fefo"/>
  </record>
</odoo>
```

### 4.3 الحارس الثالث — لا خروج بلا تصريح بوابة (Gate Pass على Dispatch)

`models/gate_pass.py`:
```python
from odoo import api, fields, models, _

class BzGatePass(models.Model):
    _name = 'bz.gate.pass'
    _description = 'تصريح خروج البوابة'
    _inherit = ['mail.thread']

    name = fields.Char(default=lambda s: _('New'), copy=False, readonly=True)
    picking_id = fields.Many2one('stock.picking', string='إذن التسليم', required=True)
    vehicle_plate = fields.Char(string='لوحة المركبة')
    driver_name = fields.Char(string='السائق')
    state = fields.Selection([('draft', 'مسودة'), ('approved', 'معتمد')],
                             default='draft', tracking=True)
    approver_id = fields.Many2one('res.users', string='المعتمِد', copy=False)

    def action_approve(self):
        self.write({'state': 'approved', 'approver_id': self.env.uid})

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('name', _('New')) == _('New'):
                vals['name'] = self.env['ir.sequence'].next_by_code('bz.gate.pass')
        return super().create(vals_list)
```

`models/stock_picking.py` (تكملة):
```python
    bz_gate_pass_id = fields.Many2one('bz.gate.pass', string='تصريح البوابة', copy=False)
    bz_gate_pass_state = fields.Selection(
        related='bz_gate_pass_id.state', string='حالة التصريح', store=True)

    @api.constrains('state', 'bz_gate_pass_state')
    def _bz_check_gate_pass_before_dispatch(self):
        for picking in self:
            if (picking.state == 'done'
                    and picking.picking_type_id.bz_is_dispatch
                    and picking.bz_gate_pass_state != 'approved'):
                raise ValidationError(_(
                    "خرقٌ للقاعدة الذهبية (Gate Pass): لا تخرج مركبة على إذن التسليم %s "
                    "دون تصريح بوابة معتمد.", picking.name))
```

### 4.4 الحارس الرابع — المطابقة الثلاثية (3-Way Match على فاتورة المورد)

الربط الدائم بين سطر الفاتورة وسطر أمر الشراء: `account.move.line.purchase_line_id` (`purchase/models/account_invoice.py:528`). نستخدم العلم الأصلي `is_purchase_matched` كفحص أولي سريع، ثم نطابق الكمية والسعر.

`models/account_move.py`:
```python
from odoo import api, models, _
from odoo.exceptions import UserError
from odoo.tools import float_compare

class AccountMove(models.Model):
    _inherit = 'account.move'

    def _post(self, soft=True):
        # نقطة الربط الصحيحة: _post وليس action_post (الترحيل البرمجي يتجاوز الأخير)
        self._bz_check_three_way_match()
        return super()._post(soft=soft)

    def _bz_check_three_way_match(self):
        tol = float(self.env['ir.config_parameter'].sudo()
                    .get_param('brandzo_warehouse.match_price_tolerance', 0.0))
        for move in self.filtered(lambda m: m.move_type == 'in_invoice'):
            msgs = set()
            product_lines = move.invoice_line_ids.filtered(
                lambda l: l.display_type == 'product')
            # 1) لا فاتورة بلا أمر شراء مرتبط
            if product_lines and not move.is_purchase_matched:
                msgs.add(_("فاتورة المورد %s غير مرتبطة بالكامل بأمر شراء — تعذّرت المطابقة الثلاثية.",
                           move.name))
            for line in product_lines.filtered(lambda l: l.purchase_line_id):
                pol = line.purchase_line_id
                # 2) ساق الكمية: المفوتر ≤ المستلَم فعلياً (GRN)
                already = pol.qty_invoiced - line.quantity
                if float_compare(line.quantity, pol.qty_received - already,
                                 precision_rounding=pol.product_uom.rounding) > 0:
                    msgs.add(_("تعارض كمية في %(p)s: المفوتر %(b)s > المستلَم %(r)s.",
                               p=line.product_id.display_name,
                               b=line.quantity, r=pol.qty_received))
                # 3) ساق السعر: سعر الفاتورة = سعر أمر الشراء (ضمن السماحية)
                if float_compare(line.price_unit, pol.price_unit,
                                 precision_digits=2) != 0 and \
                   abs(line.price_unit - pol.price_unit) > tol:
                    msgs.add(_("تعارض سعر في %(p)s: الفاتورة %(b)s ≠ أمر الشراء %(o)s.",
                               p=line.product_id.display_name,
                               b=line.price_unit, o=pol.price_unit))
            if msgs:
                # أسلوب البيت (account_move.py:5638): تجميع ثم رفع واحد
                raise UserError("\n".join(sorted(msgs)))
```

`models/res_config_settings.py` — سماحية المطابقة قابلة للضبط:
```python
from odoo import fields, models

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    bz_match_price_tolerance = fields.Float(
        string='سماحية فرق السعر (3-Way)',
        config_parameter='brandzo_warehouse.match_price_tolerance')
```

---

## 5. تصميم واجهات العرض (XML Views)

### 5.1 ترميز ألوان الحالات (مطابقة `STATUS_META.tone` في الواجهة)

خريطة اللون من الواجهة → `decoration-*` في Odoo:

| tone (الواجهة) | الدلالة | اللون | `decoration-*` في القوائم | `widget="badge"` |
|---|---|---|---|---|
| `pending` | معلّق | ذهبي 🟡 | `decoration-warning` | badge كهرماني |
| `done` | منجز | أخضر 🟢 | `decoration-success` | badge أخضر |
| `reject` | مرفوض/فاشل | أحمر 🔴 | `decoration-danger` | badge أحمر |
| `locked` | مقفل | رمادي ⚪ | `decoration-muted` | badge رمادي |

### 5.2 شريط الحالة (statusbar) + بطاقة الحالة الملوّنة — `stock.picking`

```xml
<record id="view_bz_receipt_form" model="ir.ui.view">
  <field name="name">bz.stock.picking.form</field>
  <field name="model">stock.picking</field>
  <field name="inherit_id" ref="stock.view_picking_form"/>
  <field name="arch" type="xml">

    <!-- شريط الحالة الرئيسي: يعرض التدفق ويلوّن الخطوة الحالية -->
    <field name="state" position="attributes">
      <attribute name="widget">statusbar</attribute>
      <attribute name="statusbar_visible">draft,assigned,done</attribute>
    </field>

    <!-- بطاقة نتيجة الجودة ملوّنة (ذهبي/أخضر/أحمر) بجانب الحالة -->
    <field name="state" position="after">
      <field name="bz_qc_state" widget="badge"
             decoration-warning="bz_qc_state == 'pending'"
             decoration-success="bz_qc_state == 'passed'"
             decoration-danger="bz_qc_state == 'failed'"
             invisible="picking_type_code != 'incoming'"/>
    </field>

    <!-- تبويب فحص الجودة (يظهر فقط للاستلام) -->
    <xpath expr="//notebook" position="inside">
      <page string="فحص الجودة" name="bz_qc"
            invisible="picking_type_code != 'incoming'">
        <group>
          <field name="bz_qc_required"/>
          <field name="bz_qc_state"/>
          <field name="bz_qc_inspector_id"/>
          <field name="bz_qc_date"/>
        </group>
        <button name="%(action_bz_qc_wizard)d" type="action"
                string="تسجيل نتيجة الفحص" class="btn-primary"
                invisible="bz_qc_state == 'passed'"/>
      </page>
      <page string="تصريح البوابة" name="bz_gate"
            invisible="not picking_type_id.bz_is_dispatch">
        <group>
          <field name="bz_gate_pass_id"/>
          <field name="bz_gate_pass_state" widget="badge"
                 decoration-warning="bz_gate_pass_state == 'draft'"
                 decoration-success="bz_gate_pass_state == 'approved'"/>
        </group>
      </page>
    </xpath>
  </field>
</record>
```

### 5.3 القوائم الملوّنة (List Decorations) — لوحة الإذون

```xml
<record id="view_bz_picking_tree" model="ir.ui.view">
  <field name="name">bz.picking.list</field>
  <field name="model">stock.picking</field>
  <field name="arch" type="xml">
    <list string="إذون Brandzo"
          decoration-warning="bz_qc_state == 'pending'"
          decoration-success="state == 'done' and bz_qc_state != 'failed'"
          decoration-danger="bz_qc_state == 'failed'"
          decoration-muted="state == 'cancel'">
      <field name="name"/>
      <field name="partner_id"/>
      <field name="scheduled_date"/>
      <field name="bz_qc_state" widget="badge"
             decoration-success="bz_qc_state == 'passed'"
             decoration-danger="bz_qc_state == 'failed'"/>
      <field name="state" widget="badge"
             decoration-success="state == 'done'"
             decoration-warning="state in ('assigned','confirmed')"/>
      <field name="picking_type_code" column_invisible="1"/>
    </list>
  </field>
</record>
```

### 5.4 ضبط الذهبي الدقيق لعلامة Brandzo — `static/src/scss/brandzo_status.scss`

`decoration-warning` في Odoo برتقالي؛ لمطابقة الذهبي المعتمد نُخصّص لون الشارة:

```scss
.o_field_badge.text-bg-warning,
.o_list_table .table-warning {
    // الذهبي المعتمد في التوثيق التشغيلي
    background-color: #C8A94B !important;
    color: #1a1a1a !important;
}
.o_field_badge.text-bg-success { background-color: #1E7A46 !important; }
.o_field_badge.text-bg-danger  { background-color: #B3261E !important; }
```

### 5.5 لوحة المطابقة الثلاثية — `account.move`

```xml
<record id="view_bz_bill_match" model="ir.ui.view">
  <field name="name">bz.account.move.match</field>
  <field name="model">account.move</field>
  <field name="inherit_id" ref="account.view_move_form"/>
  <field name="arch" type="xml">
    <field name="payment_state" position="before">
      <field name="is_purchase_matched" widget="badge"
             decoration-success="is_purchase_matched == True"
             decoration-danger="is_purchase_matched == False"
             invisible="move_type != 'in_invoice'"/>
    </field>
  </field>
</record>
```

---

## 6. الأمان (Security)

`security/brandzo_security.xml` — ثلاث مجموعات وظيفية:
```xml
<odoo>
  <record id="group_bz_warehouse_user" model="res.groups">
    <field name="name">Brandzo / مستخدم المستودع</field>
    <field name="category_id" ref="base.module_category_inventory_inventory"/>
  </record>
  <record id="group_bz_qc_inspector" model="res.groups">
    <field name="name">Brandzo / مفتش الجودة</field>
    <field name="implied_ids" eval="[(4, ref('group_bz_warehouse_user'))]"/>
  </record>
  <record id="group_bz_finance_manager" model="res.groups">
    <field name="name">Brandzo / المدير المالي</field>
  </record>
</odoo>
```

`security/ir.model.access.csv`:
```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_bz_gate_pass_user,bz.gate.pass.user,model_bz_gate_pass,group_bz_warehouse_user,1,1,1,0
access_bz_gate_pass_mgr,bz.gate.pass.mgr,model_bz_gate_pass,group_bz_finance_manager,1,1,1,1
access_bz_cycle_count,bz.cycle.count,model_bz_cycle_count,group_bz_warehouse_user,1,1,1,0
```
> ملاحظة: تعديل نتيجة QC يُقيَّد بمجموعة مفتش الجودة عبر `groups="brandzo_warehouse.group_bz_qc_inspector"` على الحقل في الـ view، واعتماد تصريح البوابة كذلك.

---

## 7. البيانات الأولية (Data)

`data/ir_sequence_data.xml`:
```xml
<odoo>
  <record id="seq_bz_gate_pass" model="ir.sequence">
    <field name="name">Brandzo Gate Pass</field>
    <field name="code">bz.gate.pass</field>
    <field name="prefix">GP-%(year)s-</field>
    <field name="padding">4</field>
  </record>
</odoo>
```
- `removal_strategy_data.xml`: ربط `product_expiry.removal_fefo` بفئات المنتجات المبردة (البند 4.2).
- `mail_template_data.xml`: قالبا إشعار — وصول ASN، وفشل فحص الجودة (تنبيه المدير).

---

## 8. خارطة الطريق التنفيذية (Sprints)

| المرحلة | النطاق | الناتج المُختبَر |
|---|---|---|
| **S0 — التهيئة** | سقالة الموديول + `__manifest__` + التبعيات + التثبيت النظيف | الموديول يُثبَّت بلا أخطاء على قاعدة تجريبية |
| **S1 — الشراء (01-02)** | `purchase.requisition` + `purchase.order`، ترقيم PR، اعتماد | PR→approved يولّد RFQ→PO مؤكَّد |
| **S2 — الاستلام + QC (03-04)** | حقول QC + معالج الفحص + **الحارس الأول** | يستحيل Done دون QC=Passed (اختبار وحدة) |
| **S3 — التخزين والتحضير (05-06)** | putaway rules + **حارس FEFO** فوق product_expiry | رفض سحب تشغيلة أحدث صلاحيةً (اختبار) |
| **S4 — الشحن (07)** | `bz.gate.pass` + **الحارس الثالث** + تقرير QWeb للتصريح | لا Dispatch دون تصريح معتمد |
| **S5 — المرتجعات والجرد (08-10)** | return wizard + `bz.cycle.count` + تسويات + تقييم stock.move | قيد محاسبي تلقائي عند الفارق |
| **S6 — المالية (11-12)** | **حارس المطابقة الثلاثية** + إغلاق الفترة | رفض ترحيل فاتورة غير مطابقة |
| **S7 — الواجهات والأمان** | كل ملفات XML + الألوان + الأذونات + القوائم | مطابقة بصرية للترميز اللوني المعتمد |
| **S8 — التكامل** | ربط الوسيط (odoo-proxy) بالنماذج الحقيقية بدل المحاكي | الواجهة الحالية تقرأ/تكتب على Odoo فعلي |

### اختبارات القبول (Golden-Rule Tests) — إلزامية
لكل حارس اختبار `TransactionCase` يؤكّد أن الخرق يرفع الاستثناء الصحيح:
```python
from odoo.tests import TransactionCase
from odoo.exceptions import ValidationError

class TestGoldenRules(TransactionCase):
    def test_grn_blocked_without_qc(self):
        picking = self._make_receipt(qc_required=True)
        picking.bz_qc_state = 'pending'
        with self.assertRaises(ValidationError):
            picking._action_done()   # يجب أن يُرفض
```

---

**خلاصة:** الخطة تحوّل المحاكي إلى موديول إنتاجي عبر الوراثة على 8 كائنات قياسية، وتُثبّت القواعد الذهبية الأربع كحُرّاس مزدوجة الطبقة (تفاعلي + صارم)، وتربط الألوان بالترميز التصميمي المعتمد — مع تصحيح ثلاثة افتراضات قديمة كشفها فحص المصدر (QC والمطابقة مخصّصان، وSVL مُستبدَل بـ stock.move).
