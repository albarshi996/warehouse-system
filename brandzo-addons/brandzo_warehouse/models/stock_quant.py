# -*- coding: utf-8 -*-
"""المرحلة 10 — حارس اعتماد التسويات على أرصدة المخزون.

القاعدة (المرجع §10): «لا يُعدَّل أي رصيد يدوياً بدون سند تسوية معتمد من
المدير المالي». طبقتان:

  (أ) ``action_apply_inventory`` (stock/models/stock_quant.py:433) — مدخل زر
      «Apply» في واجهة الجرد الفعلي حصراً؛ لا يستدعيه أي مسار برمجي في
      المصدر، فحجبه هنا صفر أثر جانبي.
  (ب) ``_apply_inventory`` (stock_quant.py:996) — حارس عمق مشروط بوضع الجرد
      اليدوي ``_is_inventory_mode()`` (1231).

⚠ فخّ R1 — المستدعون البرمجيون الأربعة لـ ``_apply_inventory`` (مؤكَّدون من
مصدر v19) والتعامل معهم:
  1. ``product.py:290``  (inverse لكمية المنتج) — يمرّر ``from_inverse_qty``
     ⇒ مستثنى صراحة.
  2. ``product.py:1177`` (تصحيح كسور UoM) — بلا ``inventory_mode``
     ⇒ لا يلمسه الحارس أصلاً.
  3. ``stock_quant.py:369`` (حذف رصيد = تصفيره) و4. ``:554`` (زر «تصفير»
     في تقرير الجرد) — تعديلان يدويان بروح القاعدة ⇒ يُحجبان عمداً لغير
     المدير المالي (سلوك مقصود وموثَّق في الاختبارات).
  * مسارات التثبيت/الاستيراد (``_load_records_*`` تفرض inventory_mode)
    تعمل بصلاحية superuser ⇒ يعبرها الحارس كي لا يكسر التثبيت والداتا.
"""
from odoo import models, _
from odoo.exceptions import UserError


class StockQuant(models.Model):
    _inherit = 'stock.quant'

    # ── الطبقة (أ): مدخل واجهة المستخدم ─────────────────────────────────
    def action_apply_inventory(self, date=None):
        self._bz_check_adjustment_approval()
        return super().action_apply_inventory(date=date)

    # ── الطبقة (ب): حارس العمق على وضع الجرد اليدوي ─────────────────────
    def _apply_inventory(self, date=None):
        if self._is_inventory_mode():
            self._bz_check_adjustment_approval()
        return super()._apply_inventory(date=date)

    def _bz_check_adjustment_approval(self):
        ctx = self.env.context
        if ctx.get('bz_adjustment_approved') or ctx.get('from_inverse_qty'):
            return  # مسار سند معتمد، أو المسار البرمجي الموثَّق (1)
        if self.env.su:
            return  # تثبيت/ترقية/استيراد بصلاحية النظام
        if self.env.user.has_group('brandzo_warehouse.group_bz_finance_manager'):
            return
        raise UserError(_(
            "🔒 قاعدة التسويات: لا يُعدَّل أي رصيد يدوياً بدون سند تسوية "
            "معتمد من المدير المالي.\n\n"
            "المسار الرسمي: Brandzo ‣ الجرد والتسويات ‣ جلسات الجرد الدوري — "
            "أنشئ جلسة، صادِق على ورقة العدّ، سجّل اعتماد المدير المالي، "
            "ثم طبّق التسوية من الجلسة نفسها."))
