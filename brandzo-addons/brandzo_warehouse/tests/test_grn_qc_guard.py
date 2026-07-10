# -*- coding: utf-8 -*-
"""اختبارات قبول للمرحلة 04 — الحارس الذهبي الأول (لا Done قبل اجتياز الجودة)."""
from odoo.tests import TransactionCase, tagged
from odoo.exceptions import UserError, ValidationError


@tagged('post_install', '-at_install')
class TestBzGrnQcGuard(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.product = cls.env['product.product'].create({
            'name': 'QC Test Serum',
            'type': 'consu',
        })
        cls.receipt_type = cls.env['stock.picking.type'].search(
            [('code', '=', 'incoming')], limit=1)
        cls.receipt_type.bz_qc_required = True
        cls.supplier_loc = cls.env.ref('stock.stock_location_suppliers')
        cls.stock_loc = cls.env.ref('stock.stock_location_stock')

    def _make_receipt(self, qty=5.0):
        picking = self.env['stock.picking'].create({
            'picking_type_id': self.receipt_type.id,
            'location_id': self.supplier_loc.id,
            'location_dest_id': self.stock_loc.id,
            'move_ids': [(0, 0, {
                'name': self.product.name,
                'product_id': self.product.id,
                'product_uom_qty': qty,
                'product_uom': self.product.uom_id.id,
                'location_id': self.supplier_loc.id,
                'location_dest_id': self.stock_loc.id,
            })],
        })
        picking.action_confirm()
        for move in picking.move_ids:
            move.quantity = qty
            move.picked = True
        return picking

    def test_required_flag_flows_to_picking(self):
        """علم اشتراط الفحص ينتقل من نوع الإذن إلى الإذن نفسه."""
        picking = self._make_receipt()
        self.assertTrue(picking.bz_qc_required)
        self.assertEqual(picking.bz_qc_state, 'pending')

    def test_validate_blocked_when_qc_pending(self):
        """ترحيل استلام بانتظار الفحص يجب أن يُرفض بـ UserError."""
        picking = self._make_receipt()
        with self.assertRaises(UserError):
            picking.button_validate()
        self.assertNotEqual(picking.state, 'done')

    def test_validate_blocked_when_qc_failed(self):
        """ترحيل استلام فشل فحصه يجب أن يُرفض أيضاً."""
        picking = self._make_receipt()
        picking.action_bz_qc_fail()
        self.assertEqual(picking.bz_qc_state, 'failed')
        with self.assertRaises(UserError):
            picking.button_validate()

    def test_validate_succeeds_after_qc_pass(self):
        """بعد اعتماد الفحص (اجتاز) ينجح الترحيل ويُختم الفاحص والتاريخ."""
        picking = self._make_receipt()
        picking.action_bz_qc_pass()
        self.assertEqual(picking.bz_qc_state, 'passed')
        self.assertTrue(picking.bz_qc_inspector_id)
        self.assertTrue(picking.bz_qc_date)
        picking.button_validate()
        self.assertEqual(picking.state, 'done')

    def test_hard_constraint_blocks_qc_downgrade_after_done(self):
        """الطبقة الصارمة: لا يمكن تحويل نتيجة استلام مُعتمد إلى «فشل»."""
        picking = self._make_receipt()
        picking.action_bz_qc_pass()
        picking.button_validate()
        self.assertEqual(picking.state, 'done')
        with self.assertRaises(ValidationError):
            picking.bz_qc_state = 'failed'
            picking.flush_recordset()
