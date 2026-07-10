# -*- coding: utf-8 -*-
"""نوع عملية المستودع — علم اشتراط فحص الجودة على إذون الاستلام."""
from odoo import fields, models


class StockPickingType(models.Model):
    _inherit = 'stock.picking.type'

    bz_qc_required = fields.Boolean(
        string='يتطلب فحص جودة (QC)',
        help="عند تفعيله على نوع استلام (incoming): لا يُرحَّل الإذن إلى Done "
             "إلا بنتيجة فحص جودة = «اجتاز». هذا يفعّل القاعدة الذهبية الأولى.",
    )
