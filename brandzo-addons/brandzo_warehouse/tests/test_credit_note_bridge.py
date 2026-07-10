# -*- coding: utf-8 -*-
"""اختبارات قبول للمرحلة 08 — جسر الإشعار الدائن (إرجاع مورد → in_refund).

يستخدم ``AccountTestInvoicingCommon`` لتهيئة شجرة حسابات صالحة، ويمرّ بالدورة
الكاملة: أمر شراء → استلام → فاتورة مورد مُرحَّلة → إرجاع → إشعار دائن.
"""
from odoo import fields
from odoo.tests import tagged
from odoo.exceptions import UserError
from odoo.addons.account.tests.common import AccountTestInvoicingCommon


@tagged('post_install', '-at_install')
class TestBzCreditNoteBridge(AccountTestInvoicingCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.warehouse = cls.env['stock.warehouse'].search(
            [('company_id', '=', cls.env.company.id)], limit=1)
        cls.stock_loc = cls.warehouse.lot_stock_id
        cls.supplier_loc = cls.env.ref('stock.stock_location_suppliers')
        cls.product = cls.env['product.product'].create({
            'name': 'CN Product',
            'type': 'consu',
            'is_storable': True,
            'property_account_expense_id':
                cls.company_data['default_account_expense'].id,
            'supplier_taxes_id': [(6, 0, [])],
        })
        # أمر شراء -> تأكيد -> استلام كامل -> فاتورة مورد مُرحَّلة
        cls.po = cls.env['purchase.order'].create({
            'partner_id': cls.partner_a.id,
            'order_line': [(0, 0, {
                'product_id': cls.product.id,
                'name': cls.product.name,
                'product_qty': 10.0,
                'price_unit': 50.0,
                'product_uom': cls.product.uom_id.id,
            })],
        })
        cls.po.button_confirm()
        cls.receipt = cls.po.picking_ids[:1]
        for move in cls.receipt.move_ids:
            move.quantity = move.product_uom_qty
            move.picked = True
        cls.receipt.button_validate()
        cls.po.action_create_invoice()
        cls.bill = cls.po.invoice_ids[:1]
        cls.bill.invoice_date = fields.Date.context_today(cls.bill)
        cls.bill.action_post()

    def _make_return(self, source):
        return self.env['stock.picking'].create({
            'picking_type_id': self.warehouse.out_type_id.id,
            'location_id': self.stock_loc.id,
            'location_dest_id': self.supplier_loc.id,
            'return_id': source.id,
        })

    def test_credit_note_created_from_return(self):
        """إرجاع استلام له فاتورة مُرحَّلة يُنشئ إشعاراً دائناً (in_refund)."""
        self.assertEqual(self.bill.state, 'posted')
        ret = self._make_return(self.receipt)
        ret.action_bz_create_credit_note()
        cn = ret.bz_credit_note_id
        self.assertTrue(cn)
        self.assertEqual(cn.move_type, 'in_refund')
        self.assertEqual(cn.reversed_entry_id, self.bill)

    def test_blocked_without_posted_bill(self):
        """إرجاع استلام بلا فاتورة مورد مُرحَّلة → UserError واضح."""
        bare_receipt = self.env['stock.picking'].create({
            'picking_type_id': self.warehouse.in_type_id.id,
            'location_id': self.supplier_loc.id,
            'location_dest_id': self.stock_loc.id,
        })
        ret = self._make_return(bare_receipt)
        with self.assertRaises(UserError):
            ret.action_bz_create_credit_note()

    def test_no_duplicate_credit_note(self):
        """لا يُنشأ إشعار دائن ثانٍ لنفس الإرجاع."""
        ret = self._make_return(self.receipt)
        ret.action_bz_create_credit_note()
        with self.assertRaises(UserError):
            ret.action_bz_create_credit_note()
