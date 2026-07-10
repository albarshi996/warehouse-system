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

    # ── حقول الصلاحية للتجهيز الصادر (المرحلة 06 — FEFO) ─────────────────
    bz_dispatch_expiry = fields.Datetime(
        string='أقرب صلاحية تُصرف', compute='_compute_bz_dispatch_expiry',
        help="أقرب تاريخ انتهاء بين التشغيلات المُجهَّزة للصرف على هذا الإذن.")
    bz_has_expired_line = fields.Boolean(
        string='يحوي صنفاً منتهي الصلاحية',
        compute='_compute_bz_dispatch_expiry')

    @api.depends('move_line_ids.expiration_date', 'move_line_ids.is_expired')
    def _compute_bz_dispatch_expiry(self):
        for picking in self:
            dated = picking.move_line_ids.filtered(
                lambda ml: ml.lot_id and ml.expiration_date)
            picking.bz_dispatch_expiry = (
                min(dated.mapped('expiration_date')) if dated else False)
            picking.bz_has_expired_line = any(
                picking.move_line_ids.mapped('is_expired'))

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

    # ── الحُرّاس التفاعلية على الترحيل ────────────────────────────────────
    def button_validate(self):
        self._bz_check_qc_passed()   # المرحلة 04 — لا Done قبل اجتياز الجودة
        self._bz_check_fefo()        # المرحلة 06 — لا صرف يخالف FEFO
        return super().button_validate()

    def _bz_check_qc_passed(self):
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

    def _bz_check_fefo(self):
        """المرحلة 06 — الحارس الذهبي الثاني (FEFO).

        على كل إذن صادر: لكل حركة صنفٍ خاضعٍ للصلاحية، إذا وُجدت في موقع المصدر
        تشغيلة أقدم انتهاءً (removal_date) ما تزال متاحة بينما يُصرَف ما هو أحدث
        منها — يُرفض الترحيل بـ UserError (منع التلاعب بالتواريخ).
        """
        Quant = self.env['stock.quant']
        for picking in self.filtered(lambda p: p.picking_type_id.code == 'outgoing'):
            for move in picking.move_ids:
                if not move.product_id.use_expiration_date:
                    continue
                picked = move.move_line_ids.filtered(
                    lambda ml: ml.lot_id and ml.quantity > 0)
                removals = [d for d in picked.mapped('lot_id.removal_date') if d]
                if not removals:
                    continue
                earliest_picked = min(removals)
                earlier = Quant.search([
                    ('product_id', '=', move.product_id.id),
                    ('location_id', 'child_of', move.location_id.id),
                    ('quantity', '>', 0),
                    ('removal_date', '!=', False),
                    ('removal_date', '<', earliest_picked),
                ], order='removal_date, id').filtered(
                    lambda q: q.available_quantity > 0)
                if earlier:
                    bad = picked.sorted(lambda ml: ml.lot_id.removal_date)[-1].lot_id
                    good = earlier[0]
                    raise UserError(_(
                        "خرقٌ لقاعدة FEFO في «%(p)s»: تُصرَف التشغيلة «%(bad)s» "
                        "(انتهاء %(bd)s) بينما التشغيلة الأقدم «%(good)s» (انتهاء "
                        "%(gd)s) ما تزال متاحة في «%(loc)s». اصرف الأقدم انتهاءً أولاً.",
                        p=move.product_id.display_name,
                        bad=bad.name, bd=bad.removal_date,
                        good=good.lot_id.name, gd=good.removal_date,
                        loc=move.location_id.display_name))

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
