# -*- coding: utf-8 -*-
"""توسعة إذن المستودع — حُرّاس المراحل 04 (QC) و06 (FEFO) و07 (Gate Pass).

كل قاعدة ذهبية مُطبَّقة بطبقتين: ``button_validate`` (تفاعلي) و``@api.constrains``
(صارم لا يُتجاوز حتى برمجياً). لا يُرحَّل الإذن إلى ``done`` ما لم تُستوفَ قاعدته:
استلامٌ يجتاز الجودة · صرفٌ يحترم FEFO · شحنٌ بتصريح بوابة معتمد.
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

    # ── تصريح البوابة للشحن الصادر (المرحلة 07 — Gate Pass) ───────────────
    bz_is_dispatch = fields.Boolean(
        related='picking_type_id.bz_is_dispatch', store=True,
        string='شحنة تتطلب تصريح بوابة')
    bz_gate_pass_ids = fields.One2many(
        'bz.gate.pass', 'picking_id', string='تصاريح البوابة')
    bz_gate_pass_count = fields.Integer(
        compute='_compute_bz_gate_pass', string='عدد التصاريح')
    bz_gate_pass_approved = fields.Boolean(
        compute='_compute_bz_gate_pass', store=True,
        string='تصريح بوابة معتمد')

    @api.depends('bz_gate_pass_ids.state')
    def _compute_bz_gate_pass(self):
        for picking in self:
            picking.bz_gate_pass_count = len(picking.bz_gate_pass_ids)
            picking.bz_gate_pass_approved = any(
                gp.state == 'approved' for gp in picking.bz_gate_pass_ids)

    def action_bz_open_gate_pass(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('تصاريح البوابة'),
            'res_model': 'bz.gate.pass',
            'view_mode': 'list,form',
            'domain': [('picking_id', '=', self.id)],
            'context': {'default_picking_id': self.id},
        }

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
        self._bz_check_gate_pass()   # المرحلة 07 — لا شحن دون تصريح بوابة معتمد
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

    def _bz_check_gate_pass(self):
        """المرحلة 07 — الحارس الذهبي الثالث (Gate Pass).

        لا يُرحَّل إذن شحن (bz_is_dispatch) إلى Done قبل اعتماد تصريح بوابة
        مربوط به (state = approved).
        """
        for picking in self:
            if picking.bz_is_dispatch and not picking.bz_gate_pass_approved:
                raise UserError(_(
                    "لا يمكن ترحيل الشحن «%s» إلى Done: لا يوجد تصريح بوابة معتمد "
                    "(Approved) مربوط بهذا الإذن.", picking.display_name))

    @api.constrains('state', 'bz_is_dispatch', 'bz_gate_pass_approved')
    def _bz_check_gate_pass_before_done(self):
        for picking in self:
            if (picking.state == 'done' and picking.bz_is_dispatch
                    and not picking.bz_gate_pass_approved):
                raise ValidationError(_(
                    "خرقٌ للقاعدة الذهبية (Gate Pass): الشحن «%s» لا يُرحَّل دون "
                    "تصريح بوابة معتمد.", picking.display_name))
