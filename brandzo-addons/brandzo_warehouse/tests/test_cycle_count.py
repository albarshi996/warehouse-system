# -*- coding: utf-8 -*-
"""اختبارات قبول للمرحلة 09 — جلسة الجرد الدوري ``bz.cycle.count``."""
from odoo.tests import TransactionCase, tagged
from odoo.exceptions import UserError


@tagged('post_install', '-at_install')
class TestBzCycleCount(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # موقع فرعي معزول حتى لا تتسرّب أرصدة الديمو إلى لقطة الجرد
        cls.count_loc = cls.env['stock.location'].create({
            'name': 'BZ Count Zone',
            'usage': 'internal',
            'location_id': cls.env.ref('stock.stock_location_stock').id,
        })
        cls.product = cls.env['product.product'].create({
            'name': 'Cycle Count Product',
            'type': 'consu',
            'is_storable': True,
        })
        cls.env['stock.quant']._update_available_quantity(
            cls.product, cls.count_loc, 100.0)

        group_ids = [
            cls.env.ref('stock.group_stock_manager').id,
            cls.env.ref('brandzo_warehouse.group_bz_inventory_auditor').id,
        ]
        cls.auditor = cls.env['res.users'].create({
            'name': 'BZ Auditor', 'login': 'bz_auditor',
            'group_ids': [(6, 0, group_ids)],
        })
        cls.finance = cls.env['res.users'].create({
            'name': 'BZ Finance Manager', 'login': 'bz_finance_cc',
            'group_ids': [(6, 0, group_ids + [
                cls.env.ref('brandzo_warehouse.group_bz_finance_manager').id])],
        })

    def _make_session(self):
        return self.env['bz.cycle.count'].with_user(self.auditor).create({
            'location_id': self.count_loc.id})

    def test_start_freezes_snapshot(self):
        """البدء يلتقط لقطة الأرصدة الحالية كبنود عدّ."""
        session = self._make_session()
        session.action_start()
        self.assertEqual(session.state, 'in_progress')
        line = session.line_ids.filtered(
            lambda l: l.product_id == self.product)
        self.assertTrue(line, "يجب أن يظهر رصيد المنتج ضمن بنود اللقطة")
        self.assertEqual(line.theoretical_qty, 100.0)
        self.assertTrue(session.name.startswith('CC-'))

    def test_validate_requires_full_count(self):
        """لا مصادقة وورقة العدّ ناقصة؛ وبعد العدّ يُحسب الفارق."""
        session = self._make_session()
        session.action_start()
        with self.assertRaises(UserError):
            session.action_validate()
        line = session.line_ids.filtered(
            lambda l: l.product_id == self.product)
        session.line_ids.filtered(lambda l: l != line).write(
            {'is_counted': True})
        line.write({'counted_qty': 98.0, 'is_counted': True})
        session.action_validate()
        self.assertEqual(session.state, 'validated')
        self.assertEqual(line.difference, -2.0)

    def test_apply_blocked_without_finance_approval(self):
        """🔒 فارق بلا اعتماد مالي → التطبيق محجوب (قاعدة التسويات)."""
        session = self._make_session()
        session.action_start()
        session.line_ids.write({'is_counted': True})
        line = session.line_ids.filtered(
            lambda l: l.product_id == self.product)
        line.write({'counted_qty': 98.0})
        session.action_validate()
        with self.assertRaises(UserError):
            session.action_apply()

    def test_finance_approve_requires_group(self):
        """اعتماد السند صلاحية المدير المالي حصراً."""
        session = self._make_session()
        session.action_start()
        session.line_ids.write({'is_counted': True})
        session.action_validate()
        with self.assertRaises(UserError):
            session.action_finance_approve()  # المدقق ليس مديراً مالياً

    def test_apply_with_finance_approval_adjusts_stock(self):
        """الدورة الكاملة: عدّ 98 → اعتماد مالي → تطبيق → الرصيد يصبح 98."""
        session = self._make_session()
        session.action_start()
        session.line_ids.write({'is_counted': True})
        line = session.line_ids.filtered(
            lambda l: l.product_id == self.product)
        line.write({'counted_qty': 98.0})
        session.action_validate()
        session.with_user(self.finance).action_finance_approve()
        self.assertEqual(session.finance_approver_id, self.finance)
        session.action_apply()
        self.assertEqual(session.state, 'done')
        qty = self.env['stock.quant']._get_available_quantity(
            self.product, self.count_loc)
        self.assertEqual(qty, 98.0)

    def test_apply_matching_count_needs_no_approval(self):
        """جرد مطابق (صفر فوارق) يُقفل دون أي اعتماد مالي."""
        session = self._make_session()
        session.action_start()
        for line in session.line_ids:
            line.write({'counted_qty': line.theoretical_qty,
                        'is_counted': True})
        session.action_validate()
        session.action_apply()  # لا فارق → لا سند → لا اعتماد
        self.assertEqual(session.state, 'done')
