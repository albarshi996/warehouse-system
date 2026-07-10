# -*- coding: utf-8 -*-
"""المرحلة 08 (التالف) — حوكمة إتلاف البضاعة (stock.scrap).

بوابة اعتماد قبل تنفيذ الإتلاف: لا يُصادَق أمر الإتلاف (state=done) قبل اعتماد
مسؤول المرتجعات والتالف. حارس مزدوج: ``action_validate`` (تفاعلي) + ``@api.constrains``.
``stock.scrap`` يرث ``mail.thread`` (فالتتبّع يعمل) — stock/models/stock_scrap.py:12.
"""
from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError


class StockScrap(models.Model):
    _inherit = 'stock.scrap'

    bz_scrap_state = fields.Selection(
        selection=[('draft', 'مسودة'), ('approved', 'معتمد')],
        string='حالة اعتماد الإتلاف', default='draft',
        copy=False, tracking=True)
    bz_scrap_approver_id = fields.Many2one(
        'res.users', string='معتمِد الإتلاف', readonly=True, copy=False)
    bz_scrap_approval_date = fields.Datetime(
        string='تاريخ اعتماد الإتلاف', readonly=True, copy=False)
    bz_scrap_reason = fields.Text(string='بيان الإتلاف', copy=False)

    def action_bz_scrap_approve(self):
        for scrap in self:
            if scrap.state == 'done':
                raise UserError(_("لا يُعتمد إتلاف مُنفَّذ بالفعل."))
            if scrap.bz_scrap_state != 'draft':
                raise UserError(_("لا يُعتمد إلا إتلاف في حالة «مسودة»."))
        self.write({
            'bz_scrap_state': 'approved',
            'bz_scrap_approver_id': self.env.uid,
            'bz_scrap_approval_date': fields.Datetime.now(),
        })

    def action_bz_scrap_reset(self):
        self.write({
            'bz_scrap_state': 'draft',
            'bz_scrap_approver_id': False,
            'bz_scrap_approval_date': False,
        })

    # ── الحارس التفاعلي: لا تنفيذ إتلاف قبل الاعتماد ─────────────────────
    def action_validate(self):
        for scrap in self:
            if scrap.bz_scrap_state != 'approved':
                raise UserError(_(
                    "لا يمكن تنفيذ الإتلاف «%s»: يجب اعتماده أولاً من مسؤول "
                    "المرتجعات والتالف.", scrap.display_name))
        return super().action_validate()

    # ── الحارس الصارم: يمنع بلوغ done دون اعتماد ولو برمجياً ─────────────
    @api.constrains('state', 'bz_scrap_state')
    def _bz_check_scrap_approved(self):
        for scrap in self:
            if scrap.state == 'done' and scrap.bz_scrap_state != 'approved':
                raise ValidationError(_(
                    "خرقٌ لحوكمة التالف: الإتلاف «%s» لا يُنفَّذ دون اعتماد.",
                    scrap.display_name))
