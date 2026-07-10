# -*- coding: utf-8 -*-
"""المرحلة 02 — أمر الشراء (Purchase Order).

حالات Odoo القياسية تطابق تدفق الواجهة مباشرةً:
    draft (RFQ) → sent (RFQ Sent) → purchase (أمر شراء مؤكَّد)
لذا لا نغيّر آلة الحالة. نضيف فقط ضماناً بأن أمر الشراء المتفرّع عن طلب شراء
لا يُؤكَّد قبل اعتماد طلبه المصدر (تكامل بين المرحلتين 01 و02).
"""
from odoo import fields, models, _
from odoo.exceptions import UserError


class PurchaseOrder(models.Model):
    _inherit = 'purchase.order'

    # ``requisition_id`` يضيفه موديول purchase_requisition (تبعية مؤكَّدة).
    bz_requisition_approval = fields.Selection(
        related='requisition_id.bz_approval_state',
        string='اعتماد طلب الشراء المصدر', store=True, readonly=True,
    )

    def button_confirm(self):
        for order in self:
            req = order.requisition_id
            if (req and req.requisition_type != 'purchase_template'
                    and req.bz_approval_state != 'approved'):
                raise UserError(_(
                    "لا يمكن تأكيد أمر الشراء «%(po)s»: طلب الشراء المصدر "
                    "«%(pr)s» غير معتمد.",
                    po=order.display_name, pr=req.display_name))
        return super().button_confirm()
