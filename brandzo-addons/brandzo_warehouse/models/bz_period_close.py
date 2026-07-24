# -*- coding: utf-8 -*-
"""المرحلة 12 — الإغلاق المالي الشهري ``bz.period.close`` (آخر مراحل الدورة).

تُغلق فترة مالية (شهر) بعد التأكّد من أن كل مستنداتها مُنجَزة عبر **قائمة تحقّق
مشتقّة** من بيانات النظام الحيّة — لا حقول يدوية:

    open ── (اكتملت قائمة التحقّق + اعتماد المدير المالي) ──► closed

قاعدة الإغلاق (المرجع §12 · نفس منطق ``CloseView`` في المحاكي مصدرًا للحقيقة):
«لا تُغلق فترة وبنودها ناقصة». وبعد الإغلاق يُطبَّق قفل فترة على ``res.company``،
ويمنع حارس ``account.move._post`` ترحيل أي قيد بتاريخ داخل فترة مقفلة.

قائمة التحقّق الستّة — مشتقّة من الحالة الفعلية للفترة [date_from, date_to] لكل
شركة، والبند ``ok`` حين لا مانع مفتوح من نوعه:
  1) فواتير الموردين مرحّلة        — لا فاتورة ``in_invoice`` في مسودّة.
  2) دفعات الموردين مسجّلة         — لا فاتورة مرحّلة غير مدفوعة (not_paid/partial).
  3) الإشعارات الدائنة مرحّلة      — لا إشعار ``in_refund`` في مسودّة.
  4) جلسات الجرد مُصادَقة          — لا ``bz.cycle.count`` في draft/in_progress.
  5) سندات التسوية معتمدة ومطبَّقة — لا ``bz.cycle.count`` عالقة في validated.
  6) المرتجعات مُقفلة              — لا إذن إرجاع ``stock.picking`` غير منجَز.

القراءة كلّها بـ ``sudo``: القائمة اشتقاق للقراءة فقط، فلا تتعطّل عند فتح مستخدمٍ
بلا صلاحيات محاسبية.
"""
from datetime import datetime, time

from markupsafe import Markup

from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError

# حقول قفل فترة المحاسبة على res.company تغيّرت أسماؤها عبر إصدارات أودو؛
# نكتشف أوّل متوفّر منها بدل تثبيت اسمٍ قد يغيب في v19.
_LOCK_FIELD_CANDIDATES = (
    'fiscalyear_lock_date',
    'period_lock_date',
    'hard_lock_date',
    'user_fiscalyear_lock_date',
)


class BzPeriodClose(models.Model):
    _name = 'bz.period.close'
    _description = 'إغلاق فترة مالية'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'date_to desc, id desc'

    name = fields.Char(
        string='رقم الإغلاق', required=True, copy=False, readonly=True,
        index=True, default=lambda self: _('New'))
    date_from = fields.Date(
        string='بداية الفترة', required=True, tracking=True,
        default=lambda self: fields.Date.start_of(
            fields.Date.context_today(self), 'month'))
    date_to = fields.Date(
        string='نهاية الفترة', required=True, tracking=True,
        default=lambda self: fields.Date.end_of(
            fields.Date.context_today(self), 'month'))
    company_id = fields.Many2one(
        'res.company', string='الشركة', required=True,
        default=lambda self: self.env.company)
    state = fields.Selection(
        selection=[('open', 'مفتوحة'), ('closed', 'مُغلقة')],
        string='الحالة', default='open', required=True,
        copy=False, tracking=True, index=True)

    closed_by_id = fields.Many2one(
        'res.users', string='أغلق الفترة', readonly=True, copy=False)
    closed_on = fields.Datetime(string='تاريخ الإغلاق', readonly=True, copy=False)
    lock_date_applied = fields.Date(
        string='قفل الفترة المطبَّق', readonly=True, copy=False,
        help='تاريخ قفل الفترة الذي كُتب على الشركة عند الإغلاق.')
    lock_date_before = fields.Date(
        string='قفل الفترة قبل الإغلاق', readonly=True, copy=False,
        help='قيمة قفل الشركة قبل هذا الإغلاق — تُستعاد عند إعادة الفتح.')

    is_ready = fields.Boolean(
        string='جاهزة للإغلاق', compute='_compute_checklist')
    blocker_count = fields.Integer(
        string='عدد الموانع', compute='_compute_checklist')
    checklist_html = fields.Html(
        string='قائمة تحقّق الإغلاق', compute='_compute_checklist',
        sanitize=False)
    note = fields.Text(string='ملاحظات')

    # ── الإنشاء والقيود ──────────────────────────────────────────────────
    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('name', _('New')) == _('New'):
                vals['name'] = self.env['ir.sequence'].next_by_code(
                    'bz.period.close') or _('New')
        return super().create(vals_list)

    @api.constrains('date_from', 'date_to')
    def _check_period_bounds(self):
        for rec in self:
            if rec.date_from and rec.date_to and rec.date_to < rec.date_from:
                raise ValidationError(_(
                    "نهاية الفترة (%(to)s) تسبق بدايتها (%(from_)s) — صحّح التواريخ.",
                    to=rec.date_to, from_=rec.date_from))

    # ── اشتقاق قائمة التحقّق ─────────────────────────────────────────────
    def _period_bounds_dt(self):
        """حدود الفترة كـ ``datetime`` (للحقول من نوع Datetime مثل create_date)."""
        self.ensure_one()
        return (datetime.combine(self.date_from, time.min),
                datetime.combine(self.date_to, time.max))

    def _bz_checklist(self):
        """يشتقّ بنود قائمة الإغلاق الستّة من الحالة الفعلية للفترة.

        يعيد قائمة قواميس ``{code, label, ok, detail, count}`` — القراءة بـ
        ``sudo`` لأنها اشتقاق للقراءة فقط. البند ``ok`` حين لا مانع مفتوح من نوعه.
        """
        self.ensure_one()
        dt_from, dt_to = self._period_bounds_dt()
        company = self.company_id
        Move = self.env['account.move'].sudo()
        Count = self.env['bz.cycle.count'].sudo()
        Picking = self.env['stock.picking'].sudo()

        def item(code, label, records):
            first = records[:1]
            return {
                'code': code,
                'label': label,
                'ok': not records,
                'detail': first.display_name if first else '',
                'count': len(records),
            }

        # (1) فواتير الموردين مرحّلة — لا مسودّة in_invoice داخل الفترة
        draft_bills = Move.search([
            ('company_id', '=', company.id),
            ('move_type', '=', 'in_invoice'),
            ('state', '=', 'draft'),
            ('date', '>=', self.date_from), ('date', '<=', self.date_to),
        ], order='date, id')

        # (2) دفعات الموردين مسجّلة — لا فاتورة مرحّلة غير مدفوعة
        unpaid_bills = Move.search([
            ('company_id', '=', company.id),
            ('move_type', '=', 'in_invoice'),
            ('state', '=', 'posted'),
            ('payment_state', 'in', ('not_paid', 'partial')),
            ('date', '>=', self.date_from), ('date', '<=', self.date_to),
        ], order='date, id')

        # (3) الإشعارات الدائنة مرحّلة — لا مسودّة in_refund داخل الفترة
        draft_refunds = Move.search([
            ('company_id', '=', company.id),
            ('move_type', '=', 'in_refund'),
            ('state', '=', 'draft'),
            ('date', '>=', self.date_from), ('date', '<=', self.date_to),
        ], order='date, id')

        # (4) جلسات الجرد مُصادَقة — لا عدّ مفتوح (draft/in_progress) داخل الفترة
        open_counts = Count.search([
            ('company_id', '=', company.id),
            ('state', 'in', ('draft', 'in_progress')),
            ('create_date', '>=', dt_from), ('create_date', '<=', dt_to),
        ], order='create_date, id')

        # (5) سندات التسوية معتمدة ومطبَّقة — لا جلسة عالقة في validated
        pending_adj = Count.search([
            ('company_id', '=', company.id),
            ('state', '=', 'validated'),
            ('create_date', '>=', dt_from), ('create_date', '<=', dt_to),
        ], order='create_date, id')

        # (6) المرتجعات مُقفلة — لا إذن إرجاع غير منجَز داخل الفترة
        open_returns = Picking.search([
            ('company_id', '=', company.id),
            ('return_id', '!=', False),
            ('state', 'not in', ('done', 'cancel')),
            ('scheduled_date', '>=', dt_from), ('scheduled_date', '<=', dt_to),
        ], order='scheduled_date, id')

        return [
            item('bills_posted',
                 _('فواتير الموردين مرحّلة (لا مسودّات)'), draft_bills),
            item('payments_registered',
                 _('دفعات الموردين مسجّلة (لا فاتورة غير مدفوعة)'), unpaid_bills),
            item('credit_notes_posted',
                 _('الإشعارات الدائنة مرحّلة (لا مسودّات)'), draft_refunds),
            item('counts_validated',
                 _('جلسات الجرد مُصادَقة (لا عدّ مفتوح)'), open_counts),
            item('adjustments_applied',
                 _('سندات التسوية معتمدة ومطبَّقة (لا تسوية معلّقة)'), pending_adj),
            item('returns_closed',
                 _('المرتجعات مُقفلة (لا إرجاع مفتوح)'), open_returns),
        ]

    @api.depends('date_from', 'date_to', 'company_id')
    def _compute_checklist(self):
        for rec in self:
            checks = rec._bz_checklist() if (
                rec.date_from and rec.date_to and rec.company_id) else []
            rec.blocker_count = sum(1 for c in checks if not c['ok'])
            rec.is_ready = bool(checks) and rec.blocker_count == 0
            rec.checklist_html = rec._render_checklist_html(checks)

    def _render_checklist_html(self, checks):
        """يبني قائمة التحقّق HTML بأمان (Markup يهرّب أسماء المستندات)."""
        if not checks:
            return Markup(
                '<p class="text-muted">حدّد بداية الفترة ونهايتها لعرض '
                'قائمة التحقّق.</p>')
        items = Markup('')
        for c in checks:
            if c['ok']:
                items += Markup(
                    '<li style="margin:4px 0;color:#1a7f37">'
                    '<b>✔</b> %s</li>') % c['label']
            elif c.get('detail'):
                items += Markup(
                    '<li style="margin:4px 0;color:#cf222e"><b>✘</b> '
                    '%s — %s مانع (أوّلها: %s)</li>') % (
                        c['label'], c['count'], c['detail'])
            else:
                items += Markup(
                    '<li style="margin:4px 0;color:#cf222e">'
                    '<b>✘</b> %s</li>') % c['label']
        return (
            Markup('<div style="padding:6px 0"><b>🔒 قائمة تحقّق الإغلاق '
                   'الشهري لمستندات المخازن</b></div>')
            + Markup('<ul style="list-style:none;padding-inline-start:0">')
            + items + Markup('</ul>'))

    # ── قفل الفترة على الشركة (تكامل أودو القياسي) ───────────────────────
    @api.model
    def _bz_lock_field(self):
        """أول حقل قفل فترة متوفّر على ``res.company`` (يختلف بين الإصدارات)."""
        company_fields = self.env['res.company']._fields
        for fname in _LOCK_FIELD_CANDIDATES:
            if fname in company_fields:
                return fname
        return False

    def _apply_company_lock(self):
        """يكتب قفل الفترة على الشركة إن توفّر حقلٌ معروف؛ يعيد (المطبَّق، السابق).

        دفاعيّ: قد يغيب حقل القفل أو ترفض المحاسبة الكتابة — عندها نكتفي بحارس
        Brandzo على الترحيل ونُثبت السبب في المحادثة، دون إسقاط الإغلاق.
        """
        self.ensure_one()
        fname = self._bz_lock_field()
        if not fname:
            self.message_post(body=_(
                "لا حقل قفل فترة قياسي في هذا الإصدار — الاعتماد على حارس "
                "Brandzo لمنع الترحيل داخل الفترة المقفلة."))
            return False, False
        company = self.company_id
        previous = company[fname]
        # لا نُرجع القفل للخلف: نُبقي الأبعد بين نهاية فترتنا والقفل القائم
        new_lock = self.date_to
        if previous and previous >= self.date_to:
            new_lock = previous
        try:
            company.sudo().write({fname: new_lock})
        except Exception as exc:  # القياسي قد يرفض؛ حارس Brandzo يكفي — لا نُسقط الإغلاق
            self.message_post(body=_(
                "تعذّر ضبط قفل الفترة القياسي (%(field)s): %(err)s — يبقى حارس "
                "Brandzo نافذًا.", field=fname, err=exc))
            return False, previous
        return new_lock, previous

    # ── انتقالات الحالة ──────────────────────────────────────────────────
    def action_close(self):
        """إغلاق الفترة — حكرٌ على المدير المالي، ومحجوب ما لم تكتمل القائمة."""
        self.ensure_one()
        if self.state == 'closed':
            raise UserError(_("الفترة مُغلقة أصلاً."))
        if not self.env.user.has_group(
                'brandzo_warehouse.group_bz_finance_manager'):
            raise UserError(_(
                "إغلاق الفترة المالية صلاحية «المدير المالي» حصراً."))
        missing = [c for c in self._bz_checklist() if not c['ok']]
        if missing:
            raise UserError(_(
                "🔒 لا تُغلق الفترة وبنودها ناقصة — أكمل المتطلّبات أولاً:\n\n%s",
                "\n".join(
                    "• " + c['label'] + (
                        _(" (أوّلها: %s)", c['detail']) if c.get('detail') else '')
                    for c in missing)))
        applied, previous = self._apply_company_lock()
        self.write({
            'state': 'closed',
            'closed_by_id': self.env.uid,
            'closed_on': fields.Datetime.now(),
            'lock_date_applied': applied,
            'lock_date_before': previous,
        })
        self.message_post(body=_(
            "🏁 أُغلقت الفترة %(start)s → %(end)s. اكتملت الدورة المستندية "
            "الكاملة (12 مرحلة).", start=self.date_from, end=self.date_to))

    def action_reopen(self):
        """إعادة فتح فترة مغلقة — للمدير المالي، وتستعيد قفل الشركة السابق."""
        self.ensure_one()
        if self.state != 'closed':
            raise UserError(_("الفترة مفتوحة أصلاً — لا شيء لإعادته."))
        if not self.env.user.has_group(
                'brandzo_warehouse.group_bz_finance_manager'):
            raise UserError(_(
                "إعادة فتح الفترة المالية صلاحية «المدير المالي» حصراً."))
        fname = self._bz_lock_field()
        if fname and self.lock_date_applied:
            try:
                self.company_id.sudo().write(
                    {fname: self.lock_date_before or False})
            except Exception as exc:  # قد يكون القفل صلبًا غير قابل للتراجع
                self.message_post(body=_(
                    "تعذّرت استعادة قفل الفترة السابق (%(field)s): %(err)s.",
                    field=fname, err=exc))
        self.write({
            'state': 'open', 'closed_by_id': False, 'closed_on': False,
            'lock_date_applied': False, 'lock_date_before': False,
        })
        self.message_post(body=_(
            "أُعيد فتح الفترة %(start)s → %(end)s.",
            start=self.date_from, end=self.date_to))


class AccountMove(models.Model):
    """حارس المرحلة 12: لا يُرحَّل قيدٌ بتاريخ يقع داخل فترة Brandzo مقفلة.

    ينضمّ إلى تعميم ``_post`` المعرَّف في المرحلة 11 (المطابقة الثلاثية) عبر
    ``super()`` — كلاهما فحصٌ سابق للترحيل ويعملان معًا.
    """
    _inherit = 'account.move'

    def _post(self, soft=True):
        self._bz_assert_period_open()
        return super()._post(soft=soft)

    def _bz_assert_period_open(self):
        Close = self.env['bz.period.close'].sudo()
        for move in self:
            move_date = move.date or fields.Date.context_today(move)
            closed = Close.search([
                ('company_id', '=', move.company_id.id),
                ('state', '=', 'closed'),
                ('date_from', '<=', move_date),
                ('date_to', '>=', move_date),
            ], limit=1)
            if closed:
                raise UserError(_(
                    "🔒 الفترة المالية «%(name)s» (%(start)s → %(end)s) مُغلقة "
                    "— لا يُرحَّل قيد بتاريخ %(d)s داخلها.",
                    name=closed.name, start=closed.date_from,
                    end=closed.date_to, d=move_date))
