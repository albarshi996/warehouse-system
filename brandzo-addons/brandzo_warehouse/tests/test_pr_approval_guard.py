# -*- coding: utf-8 -*-
"""اختبارات قبول للمرحلة 01 — حارس اعتماد طلب الشراء.

تُثبت أن القاعدة الذهبية (لا تأكيد قبل الاعتماد) تعمل كحارس صارم على طبقتيها:
override تفاعلي على ``action_confirm`` + ``@api.constrains`` يمنع التجاوز البرمجي.
"""
from odoo.tests import TransactionCase, tagged
from odoo.exceptions import UserError, ValidationError


@tagged('post_install', '-at_install')
class TestBzRequisitionApprovalGuard(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.vendor = cls.env['res.partner'].create({
            'name': 'مختبرات الخليج للتجميل',
        })
        cls.product = cls.env['product.product'].create({
            'name': 'Vitamin C Serum 30ml',
            'type': 'consu',
            'purchase_ok': True,
        })

    def _make_requisition(self):
        return self.env['purchase.requisition'].create({
            'requisition_type': 'blanket_order',
            'vendor_id': self.vendor.id,
            'line_ids': [(0, 0, {
                'product_id': self.product.id,
                'product_qty': 10.0,
                'product_uom_id': self.product.uom_id.id,
            })],
        })

    def test_confirm_blocked_without_approval(self):
        """تأكيد طلب غير معتمد يجب أن يُرفض بـ UserError."""
        req = self._make_requisition()
        self.assertEqual(req.bz_approval_state, 'draft')
        with self.assertRaises(UserError):
            req.action_confirm()
        self.assertNotEqual(req.state, 'confirmed')

    def test_submit_requires_lines(self):
        """لا يُرفع طلب بلا أصناف للموافقة."""
        empty = self.env['purchase.requisition'].create({
            'requisition_type': 'blanket_order',
            'vendor_id': self.vendor.id,
        })
        with self.assertRaises(UserError):
            empty.action_bz_submit()

    def test_confirm_allowed_after_approval(self):
        """بعد الرفع ثم الاعتماد، ينجح التأكيد ويولّد الاتفاقية."""
        req = self._make_requisition()
        req.action_bz_submit()
        self.assertEqual(req.bz_approval_state, 'to_approve')
        req.action_bz_approve()
        self.assertEqual(req.bz_approval_state, 'approved')
        self.assertTrue(req.bz_approved_by)
        req.action_confirm()  # يجب ألا يرفع استثناءً
        self.assertEqual(req.state, 'confirmed')

    def test_hard_constraint_blocks_direct_write(self):
        """تجاوز الزر بكتابة الحالة مباشرةً يبقى ممنوعاً بالـ constrains."""
        req = self._make_requisition()
        with self.assertRaises(ValidationError):
            req.write({'state': 'confirmed'})
            req.flush_recordset()
