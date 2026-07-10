# -*- coding: utf-8 -*-
"""المرحلة 04 — الاستلام وفحص الجودة (GRN + QC).

القاعدة الذهبية الأولى في المخازن: لا يُعتمد إيصال الاستلام (تتحوّل حالته إلى
``done``) إلا إذا كانت نتيجة فحص الجودة «اجتاز» (passed) بالكامل. يُطبَّق الحارس
بطبقتين: ``button_validate`` (تفاعلي) و ``@api.constrains`` (صارم لا يُتجاوز).
"""
from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError


class StockPicking(models.Model):
    _inherit = 'stock.picking'

    bz_qc_required = fields.Boolean(
        related='picking_type_id.bz_qc_required', store=True,
        string='يتطلب فحص جودة')
    bz_qc_state = fields.Selection(
        selection=[
            ('pending', 'بانتظار الفحص'),
            ('passed', 'اجتاز الفحص'),
            ('failed', 'فشل الفحص'),
        ],
        string='نتيجة فحص الجودة',
        default='pending', copy=False, tracking=True, index=True)
    bz_qc_inspector_id = fields.Many2one(
        'res.users', string='مفتش الجودة', readonly=True, copy=False)
    bz_qc_date = fields.Datetime(string='تاريخ الفحص', readonly=True, copy=False)
    bz_qc_note = fields.Char(string='ملاحظات الفحص', copy=False)

    # ── إجراءات الفحص (تُقيَّد بمجموعة مفتش الجودة عبر الواجهة) ───────────
    def action_bz_qc_pass(self):
        self._bz_stamp_qc('passed')

    def action_bz_qc_fail(self):
        self._bz_stamp_qc('failed')

    def action_bz_qc_reset(self):
        self.write({
            'bz_qc_state': 'pending',
            'bz_qc_inspector_id': False,
            'bz_qc_date': False,
        })

    def _bz_stamp_qc(self, result):
        for picking in self:
            if picking.picking_type_id.code != 'incoming':
                raise UserError(_("فحص الجودة يخصّ إذون الاستلام فقط."))
        self.write({
            'bz_qc_state': result,
            'bz_qc_inspector_id': self.env.uid,
            'bz_qc_date': fields.Datetime.now(),
        })

    # ── الحارس التفاعلي: لا Validate إلى Done قبل اجتياز الفحص ───────────
    def button_validate(self):
        for picking in self:
            if (picking.picking_type_id.code == 'incoming'
                    and picking.bz_qc_required
                    and picking.bz_qc_state != 'passed'):
                label = dict(self._fields['bz_qc_state'].selection).get(
                    picking.bz_qc_state, picking.bz_qc_state)
                raise UserError(_(
                    "لا يمكن ترحيل الاستلام «%(name)s» إلى Done: نتيجة فحص الجودة "
                    "«%(qc)s» بينما القاعدة الذهبية تتطلب «اجتاز الفحص».",
                    name=picking.display_name, qc=label))
        return super().button_validate()

    # ── الحارس الصارم: يمنع بقاء استلام done دون Passed ولو برمجياً ──────
    @api.constrains('state', 'bz_qc_state', 'bz_qc_required')
    def _bz_check_qc_before_done(self):
        for picking in self:
            if (picking.state == 'done'
                    and picking.picking_type_id.code == 'incoming'
                    and picking.bz_qc_required
                    and picking.bz_qc_state != 'passed'):
                raise ValidationError(_(
                    "خرقٌ للقاعدة الذهبية (QC): الاستلام «%s» لا يُعتمد قبل "
                    "اجتياز فحص الجودة (Passed).", picking.display_name))
