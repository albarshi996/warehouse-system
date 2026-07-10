# -*- coding: utf-8 -*-
"""المرحلة 11 — المطابقة الثلاثية (3-Way Match) على فاتورة المورد.

القاعدة الذهبية الرابعة: لا تُرحَّل فاتورة مورد مرتبطة بأمر شراء إلا إذا تطابقت
أركانها الثلاثة — المطلوب في أمر الشراء (PO) والمستلَم فعلياً (GRN) والمفوتر
(Bill) — مع تطابق الأسعار. أي تعارض يوقف الترحيل بـ ``UserError``.

نقطة الربط: ``account.move._post`` (وليس ``action_post``؛ الترحيل البرمجي
يتجاوز الأخير). الربط الدائم بين سطر الفاتورة وسطر أمر الشراء هو
``account.move.line.purchase_line_id`` الذي يضيفه موديول ``purchase``.
"""
from odoo import api, fields, models, _
from odoo.exceptions import UserError
from odoo.tools import float_compare


class AccountMove(models.Model):
    _inherit = 'account.move'

    bz_match_state = fields.Selection(
        selection=[
            ('na', 'غير منطبق'),
            ('matched', 'مطابقة سليمة'),
            ('mismatch', 'تعارض في المطابقة'),
        ],
        string='حالة المطابقة الثلاثية',
        compute='_compute_bz_match_state')

    @api.depends('move_type', 'state',
                 'invoice_line_ids.quantity', 'invoice_line_ids.price_unit',
                 'invoice_line_ids.purchase_line_id',
                 'invoice_line_ids.purchase_line_id.qty_received',
                 'invoice_line_ids.purchase_line_id.product_qty')
    def _compute_bz_match_state(self):
        for move in self:
            po_lines = move.invoice_line_ids.filtered(
                lambda l: l.display_type == 'product' and l.purchase_line_id)
            if move.move_type != 'in_invoice' or not po_lines:
                move.bz_match_state = 'na'
            else:
                move.bz_match_state = (
                    'matched' if not move._bz_three_way_messages() else 'mismatch')

    def _bz_three_way_messages(self):
        """يعيد مجموعة رسائل تعارض المطابقة الثلاثية (فارغة = مطابقة سليمة)."""
        self.ensure_one()
        msgs = set()
        if self.move_type != 'in_invoice':
            return msgs
        po_bill_lines = self.invoice_line_ids.filtered(
            lambda l: l.display_type == 'product' and l.purchase_line_id)
        if not po_bill_lines:
            return msgs  # لا ارتباط بأمر شراء → المطابقة الثلاثية غير منطبقة
        tol = float(self.env['ir.config_parameter'].sudo().get_param(
            'brandzo_warehouse.match_price_tolerance', 0.0) or 0.0)

        # (1) مطابقة السعر لكل سطر فاتورة مقابل سطر أمر الشراء
        for line in po_bill_lines:
            pol = line.purchase_line_id
            if (float_compare(line.price_unit, pol.price_unit, precision_digits=2) != 0
                    and abs(line.price_unit - pol.price_unit) > tol):
                msgs.add(_(
                    "تعارض سعر في «%(p)s»: سعر الفاتورة %(b).2f ≠ سعر أمر الشراء %(o).2f.",
                    p=line.product_id.display_name,
                    b=line.price_unit, o=pol.price_unit))

        # (2) مطابقة الكمية تراكمياً على مستوى سطر أمر الشراء
        for pol in po_bill_lines.mapped('purchase_line_id'):
            rounding = pol.product_uom.rounding or 0.01
            billed = sum(
                (l.quantity if l.move_id.move_type == 'in_invoice' else -l.quantity)
                for l in pol.invoice_lines
                if l.move_id.state in ('draft', 'posted')
                and l.move_id.move_type in ('in_invoice', 'in_refund'))
            if float_compare(billed, pol.qty_received, precision_rounding=rounding) > 0:
                msgs.add(_(
                    "تعارض كمية في «%(p)s»: المفوتر %(b)s يتجاوز المستلَم فعلياً (GRN) %(r)s.",
                    p=pol.product_id.display_name, b=billed, r=pol.qty_received))
            if float_compare(billed, pol.product_qty, precision_rounding=rounding) > 0:
                msgs.add(_(
                    "تعارض كمية في «%(p)s»: المفوتر %(b)s يتجاوز المطلوب في أمر الشراء %(o)s.",
                    p=pol.product_id.display_name, b=billed, o=pol.product_qty))
        return msgs

    def _post(self, soft=True):
        for move in self.filtered(lambda m: m.move_type == 'in_invoice'):
            msgs = move._bz_three_way_messages()
            if msgs:
                raise UserError(_(
                    "تعذّر ترحيل فاتورة المورد «%(name)s» — فشل المطابقة الثلاثية "
                    "(PO ↔ GRN ↔ Bill):\n\n%(msgs)s",
                    name=move.display_name,
                    msgs="\n".join("• " + m for m in sorted(msgs))))
        return super()._post(soft=soft)
