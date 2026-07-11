# -*- coding: utf-8 -*-
"""المرحلتان 09–10 — جلسة الجرد الدوري وسند التسوية.

لا يوجد في Odoo 19 Community كائن جلسة جرد (`stock.inventory` أُزيل)، لذا يلفّ
هذا النموذج أرصدة ``stock.quant`` بجلسة ``bz.cycle.count``:

    draft ── (بدء وتجميد لقطة الأرصدة) ──► in_progress
          ── (عدّ فعلي لكل السطور + تصديق) ──► validated
          ── (تطبيق الفروقات كتسوية) ──► done

قاعدة التسويات الذهبية (المرجع §10): «لا يُعدَّل أي رصيد يدوياً بدون سند تسوية
معتمد من المدير المالي» — التطبيق هنا يمرّر علَم ``bz_adjustment_approved`` بعد
تسجيل اعتماد المدير المالي، وحارس ``stock_quant.py`` يحجب كل ما عداه.
"""
from odoo import api, fields, models, _
from odoo.exceptions import UserError


class BzCycleCount(models.Model):
    _name = 'bz.cycle.count'
    _description = 'جلسة الجرد الدوري'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'create_date desc, id desc'

    name = fields.Char(
        string='رقم الجلسة', required=True, copy=False, readonly=True,
        index=True, default=lambda self: _('New'))
    location_id = fields.Many2one(
        'stock.location', string='موقع الجرد', required=True,
        domain="[('usage', '=', 'internal')]", tracking=True)
    company_id = fields.Many2one(
        'res.company', string='الشركة', required=True,
        default=lambda self: self.env.company)
    state = fields.Selection(
        selection=[
            ('draft', 'مسودة'),
            ('in_progress', 'قيد العدّ'),
            ('validated', 'مُصادَق'),
            ('done', 'مكتمل'),
            ('cancel', 'ملغاة'),
        ],
        string='الحالة', default='draft', required=True,
        copy=False, tracking=True, index=True)
    line_ids = fields.One2many(
        'bz.cycle.count.line', 'count_id', string='بنود العدّ', copy=False)

    started_by_id = fields.Many2one(
        'res.users', string='بدأ الجرد', readonly=True, copy=False)
    started_on = fields.Datetime(string='تاريخ البدء', readonly=True, copy=False)
    validated_by_id = fields.Many2one(
        'res.users', string='صادَق على الورقة', readonly=True, copy=False)
    validated_on = fields.Datetime(string='تاريخ المصادقة', readonly=True, copy=False)

    # اعتماد المدير المالي — شرط تطبيق أي فارق (المرحلة 10)
    finance_approver_id = fields.Many2one(
        'res.users', string='اعتماد المدير المالي', readonly=True,
        copy=False, tracking=True)
    finance_approval_date = fields.Datetime(
        string='تاريخ الاعتماد المالي', readonly=True, copy=False)

    diff_line_count = fields.Integer(
        string='بنود بفوارق', compute='_compute_diff_line_count')
    note = fields.Text(string='ملاحظات')

    @api.depends('line_ids.difference', 'line_ids.is_counted')
    def _compute_diff_line_count(self):
        for count in self:
            count.diff_line_count = len(count.line_ids.filtered(
                lambda l: l.is_counted and not l.product_uom_id.is_zero(l.difference)))

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('name', _('New')) == _('New'):
                vals['name'] = self.env['ir.sequence'].next_by_code(
                    'bz.cycle.count') or _('New')
        return super().create(vals_list)

    # ── انتقالات الحالة ──────────────────────────────────────────────────
    def action_start(self):
        """تجميد لقطة الأرصدة الحالية في الموقع وفتح العدّ."""
        self.ensure_one()
        if self.state != 'draft':
            raise UserError(_("لا يُبدأ الجرد إلا من جلسة في حالة «مسودة»."))
        quants = self.env['stock.quant'].search([
            ('location_id', 'child_of', self.location_id.id),
            ('quantity', '!=', 0),
        ])
        if not quants:
            raise UserError(_(
                "لا توجد أرصدة للجرد في الموقع «%s».", self.location_id.display_name))
        self.line_ids = [(0, 0, {
            'quant_id': quant.id,
            'product_id': quant.product_id.id,
            'lot_id': quant.lot_id.id,
            'location_id': quant.location_id.id,
            'theoretical_qty': quant.quantity,
        }) for quant in quants]
        self.write({
            'state': 'in_progress',
            'started_by_id': self.env.uid,
            'started_on': fields.Datetime.now(),
        })

    def action_validate(self):
        """مصادقة ورقة الجرد — تتطلب عدّاً فعلياً مُدخلاً لكل بند."""
        self.ensure_one()
        if self.state != 'in_progress':
            raise UserError(_("تُصادَق ورقة جرد في حالة «قيد العدّ» فقط."))
        uncounted = self.line_ids.filtered(lambda l: not l.is_counted)
        if uncounted:
            raise UserError(_(
                "لا مصادقة وورقة العدّ ناقصة: %(count)s بند بلا عدّ فعلي "
                "(أوّلها: %(first)s).",
                count=len(uncounted),
                first=uncounted[0].product_id.display_name))
        self.write({
            'state': 'validated',
            'validated_by_id': self.env.uid,
            'validated_on': fields.Datetime.now(),
        })

    def action_finance_approve(self):
        """اعتماد المدير المالي لسند التسوية (يظهر فقط عند وجود فوارق)."""
        self.ensure_one()
        if self.state != 'validated':
            raise UserError(_("يُعتمد السند بعد مصادقة ورقة الجرد أولاً."))
        if not self.env.user.has_group('brandzo_warehouse.group_bz_finance_manager'):
            raise UserError(_(
                "اعتماد سندات التسوية صلاحية «المدير المالي» حصراً "
                "(القاعدة: لا تعديل رصيد بلا سند معتمد)."))
        self.write({
            'finance_approver_id': self.env.uid,
            'finance_approval_date': fields.Datetime.now(),
        })

    def action_apply(self):
        """تطبيق الفوارق كتسوية مخزون وإقفال الجلسة.

        يمرّر ``bz_adjustment_approved`` لحارس ``stock.quant`` — العلَم لا
        يُمنح إلا هنا وبعد التحقق من الاعتماد المالي.
        """
        self.ensure_one()
        if self.state != 'validated':
            raise UserError(_("تُطبَّق التسويات بعد مصادقة ورقة الجرد أولاً."))
        diff_lines = self.line_ids.filtered(
            lambda l: not l.product_uom_id.is_zero(l.difference))
        if diff_lines and not self.finance_approver_id:
            raise UserError(_(
                "🔒 قاعدة التسويات: لا يُعدَّل أي رصيد يدوياً بدون سند تسوية "
                "معتمد من المدير المالي — سجّل «اعتماد المدير المالي» ثم أعد "
                "المحاولة (%s بند بفارق).", len(diff_lines)))
        for line in diff_lines:
            quant = line._get_or_make_quant()
            quant.with_context(inventory_mode=True, bz_adjustment_approved=True).write(
                {'inventory_quantity': line.counted_qty})
            quant.with_context(inventory_mode=True, bz_adjustment_approved=True)._apply_inventory()
        self.write({'state': 'done'})
        if diff_lines:
            self.message_post(body=_(
                "طُبّقت التسوية على %s بند وأُنشئت حركات الجرد المقابلة.",
                len(diff_lines)))
        else:
            self.message_post(body=_("جرد مطابق — لا فوارق ولا حاجة لسند تسوية."))

    def action_reset_draft(self):
        self.ensure_one()
        if self.state not in ('in_progress', 'cancel'):
            raise UserError(_("تُعاد للمسودة جلسة «قيد العدّ» أو ملغاة فقط."))
        self.line_ids.unlink()
        self.write({
            'state': 'draft', 'started_by_id': False, 'started_on': False,
            'validated_by_id': False, 'validated_on': False,
            'finance_approver_id': False, 'finance_approval_date': False,
        })

    def action_cancel(self):
        for count in self:
            if count.state == 'done':
                raise UserError(_("لا تُلغى جلسة مكتملة — سجلّها التاريخي محفوظ."))
        self.write({'state': 'cancel'})


class BzCycleCountLine(models.Model):
    _name = 'bz.cycle.count.line'
    _description = 'بند عدّ في جلسة الجرد الدوري'
    _order = 'count_id, id'

    count_id = fields.Many2one(
        'bz.cycle.count', string='الجلسة', required=True,
        ondelete='cascade', index=True)
    state = fields.Selection(related='count_id.state', store=True)
    quant_id = fields.Many2one(
        'stock.quant', string='الرصيد الأصلي', ondelete='set null')
    product_id = fields.Many2one(
        'product.product', string='المنتج', required=True)
    product_uom_id = fields.Many2one(
        'uom.uom', string='الوحدة', related='product_id.uom_id', readonly=True)
    lot_id = fields.Many2one('stock.lot', string='الدفعة/التسلسل')
    location_id = fields.Many2one(
        'stock.location', string='الموقع الدقيق', required=True)
    theoretical_qty = fields.Float(
        string='رصيد النظام', digits='Product Unit', readonly=True)
    counted_qty = fields.Float(string='العدّ الفعلي', digits='Product Unit')
    is_counted = fields.Boolean(string='عُدّ فعلياً', default=False)
    difference = fields.Float(
        string='الفارق', digits='Product Unit',
        compute='_compute_difference', store=True)

    @api.depends('theoretical_qty', 'counted_qty', 'is_counted')
    def _compute_difference(self):
        for line in self:
            line.difference = (
                line.counted_qty - line.theoretical_qty if line.is_counted else 0.0)

    @api.onchange('counted_qty')
    def _onchange_counted_qty(self):
        for line in self:
            line.is_counted = True

    def _get_or_make_quant(self):
        """يعيد رصيد البند، أو يعيد إيجاده/إنشاءه إن حُذف الرصيد الأصلي بعد اللقطة."""
        self.ensure_one()
        quant = self.quant_id
        if quant and quant.exists():
            return quant
        Quant = self.env['stock.quant'].with_context(inventory_mode=True)
        quant = Quant._gather(
            self.product_id, self.location_id, lot_id=self.lot_id, strict=True)
        if quant:
            return quant[0]
        return Quant.create({
            'product_id': self.product_id.id,
            'location_id': self.location_id.id,
            'lot_id': self.lot_id.id or False,
            'inventory_quantity': 0.0,
        })
