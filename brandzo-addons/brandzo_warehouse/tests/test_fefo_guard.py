# -*- coding: utf-8 -*-
"""اختبارات قبول للمرحلة 06 — الحارس الذهبي الثاني (FEFO).

تُثبت أن صرف تشغيلة أحدث انتهاءً بينما تشغيلة أقدم متاحة يُرفض، وأن صرف الأقدم
انتهاءً ينجح — بما يطابق سيناريو المحاكي (LOT-2409 أقدم من LOT-2411).
"""
from odoo.tests import TransactionCase, tagged
from odoo.exceptions import UserError


@tagged('post_install', '-at_install')
class TestBzFefoGuard(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.product = cls.env['product.product'].create({
            'name': 'FEFO Serum',
            'type': 'consu',
            'is_storable': True,
            'tracking': 'lot',
            'use_expiration_date': True,
        })
        cls.stock_loc = cls.env.ref('stock.stock_location_stock')
        cls.customer_loc = cls.env.ref('stock.stock_location_customers')
        cls.out_type = cls.env['stock.picking.type'].search(
            [('code', '=', 'outgoing')], limit=1)

        # تشغيلتان بتاريخي انتهاء مختلفين — الأقدم يجب أن يخرج أولاً (FEFO).
        cls.lot_early = cls.env['stock.lot'].create({
            'name': 'LOT-2409', 'product_id': cls.product.id,
            'expiration_date': '2026-09-30 00:00:00',
        })
        cls.lot_late = cls.env['stock.lot'].create({
            'name': 'LOT-2411', 'product_id': cls.product.id,
            'expiration_date': '2026-11-30 00:00:00',
        })
        Quant = cls.env['stock.quant']
        Quant._update_available_quantity(cls.product, cls.stock_loc, 100, lot_id=cls.lot_early)
        Quant._update_available_quantity(cls.product, cls.stock_loc, 100, lot_id=cls.lot_late)

    def _make_delivery(self, lot, qty=10.0):
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
        move = picking.move_ids
        move.move_line_ids.unlink()
        self.env['stock.move.line'].create({
            'move_id': move.id,
            'picking_id': picking.id,
            'product_id': self.product.id,
            'product_uom_id': self.product.uom_id.id,
            'lot_id': lot.id,
            'quantity': qty,
            'location_id': self.stock_loc.id,
            'location_dest_id': self.customer_loc.id,
        })
        move.picked = True
        return picking

    def test_dispatch_later_lot_is_blocked(self):
        """صرف التشغيلة الأحدث انتهاءً بينما الأقدم متاحة → UserError."""
        picking = self._make_delivery(self.lot_late)
        with self.assertRaises(UserError):
            picking.button_validate()
        self.assertNotEqual(picking.state, 'done')

    def test_dispatch_earliest_lot_is_allowed(self):
        """صرف التشغيلة الأقدم انتهاءً → يمرّ ويكتمل."""
        picking = self._make_delivery(self.lot_early)
        picking.button_validate()
        self.assertEqual(picking.state, 'done')

    def test_dispatch_badge_reflects_earliest_expiry(self):
        """شارة المستند تعرض أقرب صلاحية تُصرف."""
        picking = self._make_delivery(self.lot_early)
        self.assertTrue(picking.bz_dispatch_expiry)
