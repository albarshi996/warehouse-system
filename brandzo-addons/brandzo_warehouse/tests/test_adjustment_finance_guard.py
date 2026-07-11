# -*- coding: utf-8 -*-
"""اختبارات قبول للمرحلة 10 — حارس اعتماد المدير المالي على التسويات.

تُثبّت أيضاً سلامة فخّ R1: المسارات البرمجية لـ ``_apply_inventory``
(inverse كمية المنتج، والنداء بلا ``inventory_mode``) تعمل دون حجب.
"""
from odoo.tests import TransactionCase, tagged
from odoo.exceptions import UserError


@tagged('post_install', '-at_install')
class TestBzAdjustmentFinanceGuard(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.stock_loc = cls.env.ref('stock.stock_location_stock')
        cls.product = cls.env['product.product'].create({
            'name': 'Adjustment Guard Product',
            'type': 'consu',
            'is_storable': True,
        })
        cls.env['stock.quant']._update_available_quantity(
            cls.product, cls.stock_loc, 100.0)
        cls.quant = cls.env['stock.quant'].search([
            ('product_id', '=', cls.product.id),
            ('location_id', '=', cls.stock_loc.id)], limit=1)

        stock_mgr = cls.env.ref('stock.group_stock_manager').id
        cls.warehouse_mgr = cls.env['res.users'].create({
            'name': 'BZ Warehouse Manager', 'login': 'bz_wh_mgr',
            'group_ids': [(6, 0, [stock_mgr])],
        })
        cls.finance = cls.env['res.users'].create({
            'name': 'BZ Finance User', 'login': 'bz_finance_adj',
            'group_ids': [(6, 0, [
                stock_mgr,
                cls.env.ref('brandzo_warehouse.group_bz_finance_manager').id])],
        })

    def test_manual_apply_blocked_for_non_finance(self):
        """🔒 مدير مستودع (غير مالي) يعدّل من واجهة الجرد → محجوب."""
        quant = self.quant.with_user(self.warehouse_mgr).with_context(
            inventory_mode=True)
        quant.write({'inventory_quantity': 90.0})
        with self.assertRaises(UserError):
            quant.action_apply_inventory()
        # الطبقة الثانية (حارس العمق) تحجب النداء المباشر أيضاً
        with self.assertRaises(UserError):
            quant._apply_inventory()

    def test_manual_apply_allowed_for_finance_manager(self):
        """عضو «المدير المالي» يطبّق التسوية اليدوية مباشرة."""
        quant = self.quant.with_user(self.finance).with_context(
            inventory_mode=True)
        quant.write({'inventory_quantity': 90.0})
        quant.action_apply_inventory()
        self.assertEqual(self.quant.quantity, 90.0)

    def test_approved_voucher_flag_passes(self):
        """علَم سند التسوية المعتمد (تمرّره جلسة الجرد) يعبر الحارس."""
        quant = self.quant.with_user(self.warehouse_mgr).with_context(
            inventory_mode=True, bz_adjustment_approved=True)
        quant.write({'inventory_quantity': 95.0})
        quant._apply_inventory()
        self.assertEqual(self.quant.quantity, 95.0)

    def test_r1_product_inverse_qty_not_broken(self):
        """R1 (المستدعي 1): ضبط كمية المنتج من بطاقته (from_inverse_qty) يعمل."""
        product = self.env['product.product'].with_user(
            self.warehouse_mgr).create({
                'name': 'Inverse Qty Product',
                'type': 'consu',
                'is_storable': True,
            })
        product.qty_available = 50.0  # يستدعي ‎_apply_inventory‎ داخلياً
        self.assertEqual(product.qty_available, 50.0)

    def test_r1_programmatic_apply_without_inventory_mode_not_broken(self):
        """R1 (المستدعي 2): نداء برمجي بلا inventory_mode لا يلمسه الحارس."""
        self.quant.inventory_quantity = 97.0
        quant = self.quant.with_user(self.warehouse_mgr)  # بلا inventory_mode
        quant._apply_inventory()
        self.assertEqual(self.quant.quantity, 97.0)
