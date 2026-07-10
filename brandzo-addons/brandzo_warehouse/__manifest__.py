# -*- coding: utf-8 -*-
{
    'name': 'Brandzo Warehouse — Document Cycle & Golden Rules',
    'version': '19.0.1.0.0',
    'category': 'Inventory/Inventory',
    'summary': 'دورة مستندية من 12 مرحلة و21 نموذجاً مع 4 قواعد ذهبية كحُرّاس صارمين',
    'description': """
Brandzo Warehouse
=================
ينقل المنطق اللوجستي من محاكي الواجهة (Astro/React) إلى Backend حقيقي على Odoo 19.

المرحلة الحالية (S0 + S1):
  * سقالة الموديول القابلة للتثبيت النظيف.
  * المرحلة 01 — طلب الشراء (PR): حوكمة اعتماد Brandzo فوق ``purchase.requisition``.
  * المرحلة 02 — أمر الشراء (PO): ربط التأكيد باعتماد طلب الشراء المصدر.

القرارات المعمارية موثّقة في ``ODOO_BACKEND_DEVELOPMENT_PLAN.md`` بجذر المستودع.
""",
    'author': 'Brandzo HUB',
    'website': 'https://github.com/albarshi996/warehouse-system',
    'license': 'LGPL-3',

    # التبعيات المؤكَّدة من فحص المصدر (كلها حاضرة في Odoo 19 Community).
    # purchase_stock ← purchase + stock ؛ stock_account ← stock + account.
    'depends': [
        'purchase_stock',        # purchase.order._create_picking (الربط PO→GRN لاحقاً)
        'stock_account',         # التقييم على stock.move (بديل SVL المُزال في v19)
        'purchase_requisition',  # purchase.requisition (أساس مرحلة PR)
        'product_expiry',        # removal_date + استراتيجية FEFO (لاحقاً)
        'account',               # فواتير الموردين والمطابقة الثلاثية (لاحقاً)
        'barcodes',              # مسح الباركود في GRN (لاحقاً)
    ],

    # يُحمَّل بالترتيب: الأمان أولاً، ثم الواجهات، ثم القوائم.
    'data': [
        'security/brandzo_security.xml',
        'security/ir.model.access.csv',
        'data/ir_sequence_data.xml',
        'views/purchase_requisition_views.xml',
        'views/purchase_order_views.xml',
        'views/stock_picking_views.xml',
        'views/gate_pass_views.xml',
        'views/brandzo_menus.xml',
    ],

    # يمنح السجلات التاريخية (المؤكَّدة قبل التثبيت) حالة "معتمد" حتى لا يحجبها الحارس.
    'post_init_hook': '_bz_post_init',

    'application': True,
    'installable': True,
    'auto_install': False,
}
