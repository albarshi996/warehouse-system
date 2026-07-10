# -*- coding: utf-8 -*-
"""اختبارات قبول للمرحلة 08 (التالف) — لا تنفيذ إتلاف دون اعتماد."""
from odoo.tests import TransactionCase, tagged
from odoo.exceptions import UserError, ValidationError


@tagged('post_install', '-at_install')
class TestBzScrapGuard(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.product = cls.env['product.product'].create({
            'name': 'Scrap Product', 'type': 'consu', 'is_storable': True})
        cls.stock_loc = cls.env.ref('stock.stock_location_stock')
        cls.env['stock.quant']._update_available_quantity(
            cls.product, cls.stock_loc, 50)

    def _make_scrap(self, qty=5.0):
        return self.env['stock.scrap'].create({
            'product_id': self.product.id,
            'scrap_qty': qty,
            'product_uom_id': self.product.uom_id.id,
            'location_id': self.stock_loc.id,
        })

    def test_validate_blocked_without_approval(self):
        s = self._make_scrap()
        self.assertEqual(s.bz_scrap_state, 'draft')
        with self.assertRaises(UserError):
            s.action_validate()
        self.assertNotEqual(s.state, 'done')

    def test_validate_allowed_after_approval(self):
        s = self._make_scrap()
        s.action_bz_scrap_approve()
        self.assertEqual(s.bz_scrap_state, 'approved')
        self.assertTrue(s.bz_scrap_approver_id)
        s.action_validate()
        self.assertEqual(s.state, 'done')

    def test_hard_constraint_blocks_unapprove_after_done(self):
        s = self._make_scrap()
        s.action_bz_scrap_approve()
        s.action_validate()
        self.assertEqual(s.state, 'done')
        with self.assertRaises(ValidationError):
            s.action_bz_scrap_reset()
