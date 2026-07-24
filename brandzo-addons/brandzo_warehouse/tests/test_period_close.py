# -*- coding: utf-8 -*-
"""اختبارات قبول للمرحلة 12 — الإغلاق المالي ``bz.period.close``.

نستخدم ``AccountTestInvoicingCommon`` لتوفير شجرة حسابات وشركة اختبار معزولة،
فلا تتسرّب مستندات اختباراتٍ أخرى إلى قائمة تحقّق الفترة. الفترة = الشهر الجاري
حتى يقع ``create_date`` للمستندات المُنشأة في الاختبار داخلها.
"""
from odoo import fields
from odoo.tests import tagged
from odoo.exceptions import UserError, ValidationError
from odoo.addons.account.tests.common import AccountTestInvoicingCommon


@tagged('post_install', '-at_install')
class TestBzPeriodClose(AccountTestInvoicingCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.vendor = cls.partner_a
        cls.PeriodClose = cls.env['bz.period.close']

        cls.finance = cls.env['res.users'].create({
            'name': 'BZ Finance Close', 'login': 'bz_finance_close',
            'group_ids': [(6, 0, [
                cls.env.ref('brandzo_warehouse.group_bz_warehouse_user').id,
                cls.env.ref('brandzo_warehouse.group_bz_finance_manager').id,
                cls.env.ref('account.group_account_manager').id,
            ])],
        })
        cls.plain = cls.env['res.users'].create({
            'name': 'BZ Plain Close', 'login': 'bz_plain_close',
            'group_ids': [(6, 0, [
                cls.env.ref('brandzo_warehouse.group_bz_warehouse_user').id])],
        })
        # صنف خدمي بلا ضرائب لتبسيط ترحيل الفاتورة
        cls.service = cls.env['product.product'].create({
            'name': 'Close Service', 'type': 'service',
            'standard_price': 100.0, 'list_price': 100.0,
            'property_account_expense_id':
                cls.company_data['default_account_expense'].id,
            'supplier_taxes_id': [(6, 0, [])],
        })
        # الفترة = الشهر الجاري (ليقع create_date للمستندات داخلها)
        today = fields.Date.context_today(cls.PeriodClose)
        cls.p_from = fields.Date.start_of(today, 'month')
        cls.p_to = fields.Date.end_of(today, 'month')
        cls.in_period = today

    # ── أدوات مساعدة ─────────────────────────────────────────────────────
    def _new_close(self, user=None):
        # بلا مستخدم = دعامة تُنشأ بـ sudo (admin قد لا يملك دور المدير المالي)
        model = self.PeriodClose.with_user(user) if user else self.PeriodClose.sudo()
        return model.create({'date_from': self.p_from, 'date_to': self.p_to})

    def _make_bill(self, post=True, pay=False, dat=None):
        bill = self.env['account.move'].create({
            'move_type': 'in_invoice',
            'partner_id': self.vendor.id,
            'invoice_date': dat or self.in_period,
            'date': dat or self.in_period,
            'invoice_line_ids': [(0, 0, {
                'product_id': self.service.id,
                'quantity': 1.0, 'price_unit': 100.0,
            })],
        })
        if post:
            bill.action_post()
        if post and pay:
            self.env['account.payment.register'].with_context(
                active_model='account.move', active_ids=bill.ids,
            ).create({}).action_create_payments()
        return bill

    def _draft_count(self):
        """جلسة جرد مفتوحة (draft) داخل الشركة والفترة — مانع للبند الرابع.

        تُنشأ بـ sudo: إنشاء الجرد يتطلّب دور «مدقّق الجرد» الذي لا يملكه admin،
        وهي هنا دعامة لا موضوع الاختبار.
        """
        return self.env['bz.cycle.count'].sudo().create({
            'location_id': self.env.ref('stock.stock_location_stock').id,
            'company_id': self.env.company.id,
        })

    # ── الاشتقاق ─────────────────────────────────────────────────────────
    def test_checklist_has_six_items(self):
        """القائمة ستّة بنودٍ بالرموز المتوقّعة."""
        checks = self._new_close()._bz_checklist()
        self.assertEqual(len(checks), 6)
        self.assertEqual(
            {c['code'] for c in checks},
            {'bills_posted', 'payments_registered', 'credit_notes_posted',
             'counts_validated', 'adjustments_applied', 'returns_closed'})

    def test_empty_period_is_ready(self):
        """فترة بلا مستندات مفتوحة = لا موانع = جاهزة للإغلاق."""
        rec = self._new_close()
        self.assertTrue(all(c['ok'] for c in rec._bz_checklist()))
        self.assertTrue(rec.is_ready)
        self.assertEqual(rec.blocker_count, 0)

    def test_draft_bill_flags_bills_item(self):
        """مسودّة فاتورة مورّد داخل الفترة → بند «الفواتير مرحّلة» مانع."""
        self._make_bill(post=False)
        checks = {c['code']: c for c in self._new_close()._bz_checklist()}
        self.assertFalse(checks['bills_posted']['ok'])

    def test_unpaid_posted_bill_flags_payment_item(self):
        """فاتورة مرحّلة غير مدفوعة → بند «الدفعات مسجّلة» مانع لا «الفواتير»."""
        self._make_bill(post=True, pay=False)
        checks = {c['code']: c for c in self._new_close()._bz_checklist()}
        self.assertTrue(checks['bills_posted']['ok'])
        self.assertFalse(checks['payments_registered']['ok'])

    def test_paid_bill_satisfies_all_money_items(self):
        """فاتورة مرحّلة ومدفوعة → بنود المال الثلاثة سليمة."""
        self._make_bill(post=True, pay=True)
        checks = {c['code']: c for c in self._new_close()._bz_checklist()}
        self.assertTrue(checks['bills_posted']['ok'])
        self.assertTrue(checks['payments_registered']['ok'])
        self.assertTrue(checks['credit_notes_posted']['ok'])

    # ── الحارس: محجوب → مسموح ────────────────────────────────────────────
    def test_close_blocked_then_allowed(self):
        """🔒 محجوب ببندٍ ناقص (جرد مفتوح) → مسموح بعد رفع المانع."""
        rec = self._new_close(user=self.finance)
        count = self._draft_count()
        with self.assertRaises(UserError):
            rec.action_close()
        self.assertEqual(rec.state, 'open')
        count.action_cancel()          # يرفع المانع (خرجت من draft/in_progress)
        rec.action_close()
        self.assertEqual(rec.state, 'closed')
        self.assertEqual(rec.closed_by_id, self.finance)
        self.assertTrue(rec.closed_on)

    def test_close_requires_finance_manager(self):
        """الإغلاق حكرٌ على المدير المالي."""
        rec = self._new_close()        # أُنشئت كمشرف
        with self.assertRaises(UserError):
            rec.with_user(self.plain).action_close()

    # ── لا كتابة على فترة مقفلة ──────────────────────────────────────────
    def test_no_posting_in_closed_period(self):
        """بعد الإغلاق: ترحيل قيدٍ بتاريخ داخل الفترة محجوب (حارس _post)."""
        rec = self._new_close(user=self.finance)
        rec.action_close()
        self.assertEqual(rec.state, 'closed')
        late_bill = self._make_bill(post=False)      # مسودّة داخل الفترة
        with self.assertRaises(UserError):
            late_bill.action_post()
        self.assertNotEqual(late_bill.state, 'posted')

    def test_reopen_returns_to_open(self):
        """إعادة الفتح تُعيد الحالة وتُفرّغ سجلّ الإغلاق."""
        rec = self._new_close(user=self.finance)
        rec.action_close()
        rec.with_user(self.finance).action_reopen()
        self.assertEqual(rec.state, 'open')
        self.assertFalse(rec.closed_by_id)
        self.assertFalse(rec.closed_on)

    # ── قيد الحدود ───────────────────────────────────────────────────────
    def test_invalid_period_bounds(self):
        """نهاية الفترة قبل بدايتها → ValidationError (لا AccessError: sudo)."""
        with self.assertRaises(ValidationError):
            self.PeriodClose.sudo().create({
                'date_from': self.p_to, 'date_to': self.p_from})
