# -*- coding: utf-8 -*-
"""اختبارات قبول للمرحلة 11 — الحارس الذهبي الرابع (المطابقة الثلاثية).

نستخدم ``AccountTestInvoicingCommon`` لتهيئة شجرة حسابات صالحة، وصنفاً خدمياً
(كميته المستلَمة تُضبط يدوياً) لعزل منطق المطابقة عن آليات الاستلام المخزني.
"""
from odoo import fields
from odoo.tests import tagged
from odoo.exceptions import UserError
from odoo.addons.account.tests.common import AccountTestInvoicingCommon


@tagged('post_install', '-at_install')
class TestBzThreeWayMatch(AccountTestInvoicingCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.vendor = cls.partner_a
        # صنف خدمي: qty_received يدوي، بحساب مصروف صالح، دون ضرائب لتبسيط الترحيل.
        cls.service = cls.env['product.product'].create({
            'name': '3W Service',
            'type': 'service',
            'standard_price': 100.0,
            'list_price': 100.0,
            'property_account_expense_id':
                cls.company_data['default_account_expense'].id,
            'supplier_taxes_id': [(6, 0, [])],
        })
        cls.po = cls.env['purchase.order'].create({
            'partner_id': cls.vendor.id,
            'order_line': [(0, 0, {
                'product_id': cls.service.id,
                'name': cls.service.name,
                'product_qty': 10.0,
                'price_unit': 100.0,
                'product_uom': cls.service.uom_id.id,
            })],
        })
        cls.po.button_confirm()

    def _create_bill(self):
        self.po.action_create_invoice()
        bill = self.po.invoice_ids[:1]
        bill.invoice_date = fields.Date.context_today(bill)
        return bill

    def test_post_blocked_when_billed_exceeds_received(self):
        """المفوتر (10) يتجاوز المستلَم فعلياً (4) → منع الترحيل."""
        self.po.order_line.qty_received = 4.0
        bill = self._create_bill()             # كمية الفاتورة = المطلوب = 10
        with self.assertRaises(UserError):
            bill.action_post()
        self.assertNotEqual(bill.state, 'posted')

    def test_post_blocked_when_price_mismatch(self):
        """سعر الفاتورة (150) ≠ سعر أمر الشراء (100) → منع الترحيل."""
        self.po.order_line.qty_received = 10.0
        bill = self._create_bill()
        bill.invoice_line_ids.filtered(
            lambda l: l.purchase_line_id).price_unit = 150.0
        with self.assertRaises(UserError):
            bill.action_post()

    def test_post_succeeds_when_fully_matched(self):
        """تطابق الأركان الثلاثة (10=10=10) والسعر → ترحيل ناجح."""
        self.po.order_line.qty_received = 10.0
        bill = self._create_bill()
        bill.action_post()
        self.assertEqual(bill.state, 'posted')
        self.assertEqual(bill.bz_match_state, 'matched')

    def test_non_po_bill_is_not_applicable(self):
        """فاتورة بلا ارتباط بأمر شراء → المطابقة غير منطبقة (na)."""
        bill = self.env['account.move'].create({
            'move_type': 'in_invoice',
            'partner_id': self.vendor.id,
            'invoice_line_ids': [(0, 0, {
                'product_id': self.service.id,
                'quantity': 1.0,
                'price_unit': 50.0,
            })],
        })
        self.assertEqual(bill.bz_match_state, 'na')
