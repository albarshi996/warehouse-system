# -*- coding: utf-8 -*-
"""اختبارات قبول للمرحلة 07 — الحارس الذهبي الثالث (تصريح البوابة)."""
from odoo.tests import TransactionCase, tagged
from odoo.exceptions import UserError


@tagged('post_install', '-at_install')
class TestBzGatePassGuard(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.product = cls.env['product.product'].create({
            'name': 'Gate Pass Product', 'type': 'consu'})
        cls.stock_loc = cls.env.ref('stock.stock_location_stock')
        cls.customer_loc = cls.env.ref('stock.stock_location_customers')
        cls.out_type = cls.env['stock.picking.type'].search(
            [('code', '=', 'outgoing')], limit=1)
        cls.out_type.bz_is_dispatch = True

    def _make_dispatch(self, qty=5.0):
        picking = self.env['stock.picking'].create({
            'picking_type_id': self.out_type.id,
            'location_id': self.stock_loc.id,
            'location_dest_id': self.customer_loc.id,
            'move_ids': [(0, 0, {
                'name': self.product.name,
                'product_id': self.product.id,
                'product_uom_qty': qty,
                'product_uom': self.product.uom_id.id,
                'location_id': self.stock_loc.id,
                'location_dest_id': self.customer_loc.id,
            })],
        })
        picking.action_confirm()
        for move in picking.move_ids:
            move.quantity = qty
            move.picked = True
        return picking

    def test_dispatch_blocked_without_gate_pass(self):
        """شحن دون أي تصريح بوابة → UserError."""
        picking = self._make_dispatch()
        self.assertTrue(picking.bz_is_dispatch)
        with self.assertRaises(UserError):
            picking.button_validate()

    def test_dispatch_blocked_with_draft_gate_pass(self):
        """تصريح بحالة مسودة لا يكفي للشحن."""
        picking = self._make_dispatch()
        self.env['bz.gate.pass'].create({
            'picking_id': picking.id,
            'vehicle_plate': 'ABC-1234', 'driver_name': 'سائق تجريبي'})
        self.assertFalse(picking.bz_gate_pass_approved)
        with self.assertRaises(UserError):
            picking.button_validate()

    def test_approval_requires_vehicle_and_driver(self):
        """لا يُعتمد التصريح دون لوحة مركبة واسم سائق."""
        picking = self._make_dispatch()
        gp = self.env['bz.gate.pass'].create({'picking_id': picking.id})
        with self.assertRaises(UserError):
            gp.action_approve()

    def test_dispatch_allowed_after_approval(self):
        """بعد اعتماد التصريح ينجح ترحيل الشحن."""
        picking = self._make_dispatch()
        gp = self.env['bz.gate.pass'].create({
            'picking_id': picking.id,
            'vehicle_plate': 'ABC-1234', 'driver_name': 'سائق تجريبي'})
        gp.action_approve()
        self.assertEqual(gp.state, 'approved')
        self.assertTrue(picking.bz_gate_pass_approved)
        picking.button_validate()
        self.assertEqual(picking.state, 'done')

    def test_gate_pass_gets_sequence_number(self):
        """التصريح ينال رقماً تسلسلياً بالبادئة GP-."""
        picking = self._make_dispatch()
        gp = self.env['bz.gate.pass'].create({'picking_id': picking.id})
        self.assertTrue(gp.name.startswith('GP-'))
