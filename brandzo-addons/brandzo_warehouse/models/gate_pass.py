# -*- coding: utf-8 -*-
"""المرحلة 07 — تصريح خروج البوابة (Gate Pass).

نموذج مستقل يوثّق خروج المركبة والسائق ويربطه بإذن الشحن الصادر. لا يُرحَّل إذن
الشحن إلى Done إلا بعد بلوغ تصريحه حالة الاعتماد التام (approved) — انظر الحارس
في ``stock_picking.py::_bz_check_gate_pass``.
"""
from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError


class BzGatePass(models.Model):
    _name = 'bz.gate.pass'
    _description = 'تصريح خروج البوابة'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'create_date desc, id desc'

    name = fields.Char(
        string='رقم التصريح', required=True, copy=False, readonly=True,
        index=True, default=lambda self: _('New'))
    picking_id = fields.Many2one(
        'stock.picking', string='إذن الشحن', required=True, ondelete='cascade',
        domain="[('picking_type_code', '=', 'outgoing')]", tracking=True)
    partner_id = fields.Many2one(
        'res.partner', string='الجهة المستلمة',
        related='picking_id.partner_id', store=True, readonly=True)
    scheduled_date = fields.Datetime(
        string='موعد الخروج', related='picking_id.scheduled_date', readonly=True)

    # حركة المركبة والسائق
    vehicle_plate = fields.Char(string='لوحة المركبة', tracking=True)
    driver_name = fields.Char(string='اسم السائق', tracking=True)
    driver_id_number = fields.Char(string='رقم هوية السائق')
    transporter = fields.Char(string='شركة النقل')
    note = fields.Text(string='ملاحظات')

    state = fields.Selection(
        selection=[
            ('draft', 'مسودة'),
            ('approved', 'معتمد'),
            ('cancel', 'ملغى'),
        ],
        string='الحالة', default='draft', required=True,
        copy=False, tracking=True, index=True)
    approver_id = fields.Many2one(
        'res.users', string='معتمِد التصريح', readonly=True, copy=False)
    approval_date = fields.Datetime(
        string='تاريخ الاعتماد', readonly=True, copy=False)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('name', _('New')) == _('New'):
                vals['name'] = self.env['ir.sequence'].next_by_code(
                    'bz.gate.pass') or _('New')
        return super().create(vals_list)

    # ── انتقالات الحالة ──────────────────────────────────────────────────
    def action_approve(self):
        for gp in self:
            if gp.state != 'draft':
                raise UserError(_("لا يُعتمد إلا تصريح في حالة «مسودة»."))
            if not gp.vehicle_plate or not gp.driver_name:
                raise UserError(_(
                    "لا يمكن اعتماد التصريح «%s» دون تحديد لوحة المركبة واسم "
                    "السائق.", gp.name))
        self.write({
            'state': 'approved',
            'approver_id': self.env.uid,
            'approval_date': fields.Datetime.now(),
        })

    def action_reset_draft(self):
        self.write({
            'state': 'draft', 'approver_id': False, 'approval_date': False})

    def action_cancel(self):
        self.write({'state': 'cancel'})

    @api.constrains('picking_id')
    def _bz_check_outgoing_only(self):
        for gp in self:
            if gp.picking_id.picking_type_id.code != 'outgoing':
                raise ValidationError(_(
                    "تصريح البوابة يُصدَر لإذون الشحن الصادرة فقط."))
