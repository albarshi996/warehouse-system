# -*- coding: utf-8 -*-
"""اختبارات قبول للمرحلة 08 — حوكمة المرتجعات (لا ترحيل إرجاع دون اعتماد)."""
from odoo.tests import TransactionCase, tagged
from odoo.exceptions import UserError, ValidationError


@tagged('post_install', '-at_install')
class TestBzReturnsGuard(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.product = cls.env['product.product'].create({
            'name': 'Return Product', 'type': 'consu'})
        cls.stock_loc = cls.env.ref('stock.stock_location_stock')
        cls.supplier_loc = cls.env.ref('stock.stock_location_suppliers')
        cls.in_type = cls.env['stock.picking.type'].search(
            [('code', '=', 'incoming')], limit=1)
        cls.out_type = cls.env['stock.picking.type'].search(
            [('code', '=', 'outgoing')], limit=1)
        # الاستلام الأصلي الذي يشير إليه الإرجاع
        cls.original = cls.env['stock.picking'].create({
            'picking_type_id': cls.in_type.id,
            'location_id': cls.supplier_loc.id,
            'location_dest_id': cls.stock_loc.id,
        })

    def _make_return(self, qty=3.0):
        picking = self.env['stock.picking'].create({
            'picking_type_id': self.out_type.id,
            'location_id': self.stock_loc.id,
            'location_dest_id': self.supplier_loc.id,
            'return_id': self.original.id,   # يجعله إذن إرجاع
            'move_ids': [(0, 0, {
                'name': self.product.name,
                'product_id': self.product.id,
                'product_uom_qty': qty,
                'product_uom': self.product.uom_id.id,
                'location_id': self.stock_loc.id,
                'location_dest_id': self.supplier_loc.id,
            })],
        })
        picking.action_confirm()
        for move in picking.move_ids:
            move.quantity = qty
            move.picked = True
        return picking

    def test_flagged_as_return(self):
        r = self._make_return()
        self.assertTrue(r.bz_is_return)
        self.assertEqual(r.bz_return_state, 'draft')

    def test_validate_blocked_without_approval(self):
        r = self._make_return()
        with self.assertRaises(UserError):
            r.button_validate()
        self.assertNotEqual(r.state, 'done')

    def test_validate_allowed_after_approval(self):
        r = self._make_return()
        r.action_bz_return_approve()
        self.assertEqual(r.bz_return_state, 'approved')
        self.assertTrue(r.bz_return_approver_id)
        r.button_validate()
        self.assertEqual(r.state, 'done')

    def test_hard_constraint_blocks_unapprove_after_done(self):
        r = self._make_return()
        r.action_bz_return_approve()
        r.button_validate()
        self.assertEqual(r.state, 'done')
        with self.assertRaises(ValidationError):
            r.action_bz_return_reset()   # يكتب draft بينما done → يُرفض
