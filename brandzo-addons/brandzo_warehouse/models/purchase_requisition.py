# -*- coding: utf-8 -*-
"""المرحلة 01 — طلب الشراء (Purchase Requisition).

نوسّع ``purchase.requisition`` القياسي (اتفاقيات الشراء) بحوكمة اعتماد Brandzo
ذات المراحل الثلاث المطابقة لتدفق الواجهة:  مسودة → قيد الموافقة → معتمد.
القاعدة الحاكمة: لا يُؤكَّد الطلب (ولا يتحوّل إلى RFQ/أوامر شراء) قبل اعتماده رسمياً.
"""
from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError


class PurchaseRequisition(models.Model):
    _inherit = 'purchase.requisition'

    bz_approval_state = fields.Selection(
        selection=[
            ('draft', 'مسودة'),
            ('to_approve', 'قيد الموافقة'),
            ('approved', 'معتمد'),
        ],
        string='حالة اعتماد Brandzo',
        default='draft', copy=False, tracking=True, index=True,
        help="حوكمة الاعتماد الداخلية قبل تحويل الطلب إلى طلبات عروض أسعار.",
    )
    bz_approved_by = fields.Many2one(
        'res.users', string='اعتمده', readonly=True, copy=False)
    bz_approval_date = fields.Datetime(
        string='تاريخ الاعتماد', readonly=True, copy=False)

    # ── انتقالات الاعتماد ────────────────────────────────────────────────
    def action_bz_submit(self):
        """رفع الطلب من مسودة إلى قيد الموافقة."""
        for req in self:
            if req.bz_approval_state != 'draft':
                continue
            if not req.line_ids:
                raise UserError(_(
                    "لا يمكن رفع طلب الشراء «%s» للموافقة وهو بلا أصناف.",
                    req.display_name))
            req.bz_approval_state = 'to_approve'

    def action_bz_approve(self):
        """اعتماد الطلب (يقتصر على مدير المشتريات عبر أذونات الواجهة)."""
        for req in self:
            if req.bz_approval_state != 'to_approve':
                raise UserError(_(
                    "طلب الشراء «%s» ليس قيد الموافقة.", req.display_name))
        self.write({
            'bz_approval_state': 'approved',
            'bz_approved_by': self.env.uid,
            'bz_approval_date': fields.Datetime.now(),
        })

    def action_bz_reset_approval(self):
        """إعادة الطلب إلى مسودة (سحب الاعتماد)."""
        self.write({
            'bz_approval_state': 'draft',
            'bz_approved_by': False,
            'bz_approval_date': False,
        })

    # ── الحارس التفاعلي: لا تأكيد قبل الاعتماد ───────────────────────────
    def action_confirm(self):
        for req in self:
            if (req.requisition_type != 'purchase_template'
                    and req.bz_approval_state != 'approved'):
                raise UserError(_(
                    "طلب الشراء «%s» لم يُعتمد بعد — يلزم اعتماده (معتمد) قبل "
                    "التأكيد وإنشاء طلبات عروض الأسعار.", req.display_name))
        return super().action_confirm()

    # ── الحارس الصارم: يمنع بلوغ confirmed/done دون اعتماد ولو برمجياً ────
    @api.constrains('state', 'bz_approval_state', 'requisition_type')
    def _bz_check_approved_before_confirm(self):
        for req in self:
            if (req.requisition_type != 'purchase_template'
                    and req.state in ('confirmed', 'done')
                    and req.bz_approval_state != 'approved'):
                raise ValidationError(_(
                    "خرقٌ لحوكمة الاعتماد: طلب الشراء «%s» لا يُؤكَّد قبل اعتماده.",
                    req.display_name))
