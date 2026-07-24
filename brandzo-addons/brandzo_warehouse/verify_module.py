# -*- coding: utf-8 -*-
"""تحقّق ساكن لموديول brandzo_warehouse دون بيئة أودو حيّة.

يفحص ما يمكن فحصه بلا تشغيل أودو:
  (1) نحو كل ملفات .py         — ``compile`` (بناء الجملة).
  (2) سلامة كل ملفات .xml      — ``ElementTree`` (XML جيّد التكوين).
  (3) سلامة ir.model.access.csv — أعمدة صحيحة + كل نموذج معرَّف في .py.
  (4) وجود كل ملفات ``data``    — من المانفست فعليًّا على القرص.
  (5) ترابط المراجع            — كل إجراء في القوائم معرَّف · كل مجموعة في
                                  العروض/القوائم معرَّفة في ملف الأمان.
  (6) فحوص المرحلة 12          — نموذج/تسلسل/أمان/عرض/قائمة الإغلاق موصولة.

الاستخدام:  ``python verify_module.py``  (يرجع 0 عند النجاح، 1 عند أول فشل).
"""
import ast
import csv
import os
import re
import sys
import xml.etree.ElementTree as ET

# كونسول ويندوز الافتراضي cp1256 لا يطبع العربية/الإيموجي — نُجبر UTF-8.
try:
    sys.stdout.reconfigure(encoding='utf-8')
except (AttributeError, ValueError):
    pass

ROOT = os.path.dirname(os.path.abspath(__file__))
EXTERNAL_PREFIXES = ('base.', 'mail.', 'stock.', 'purchase.', 'account.',
                     'product.', 'uom.', 'web.', 'barcodes.', 'purchase_stock.',
                     'stock_account.', 'purchase_requisition.', 'product_expiry.')

errors = []
stats = {'py': 0, 'xml': 0, 'csv_rows': 0, 'data_files': 0,
         'actions': 0, 'groups': 0, 'checks': 0}


def fail(msg):
    errors.append(msg)


def walk(ext):
    for base, _dirs, files in os.walk(ROOT):
        for f in sorted(files):
            if f.endswith(ext):
                yield os.path.join(base, f)


def read(path):
    with open(path, encoding='utf-8') as fh:
        return fh.read()


# ── (1) نحو Python ────────────────────────────────────────────────────────
py_models = set()   # كل _name المعرّفة
py_inherits = set()  # كل _inherit
for path in walk('.py'):
    if os.path.basename(path) == 'verify_module.py':
        continue
    src = read(path)
    try:
        compile(src, path, 'exec')
        stats['py'] += 1
    except SyntaxError as exc:
        fail("نحو Python: %s — %s" % (os.path.relpath(path, ROOT), exc))
        continue
    for m in re.finditer(r"_name\s*=\s*['\"]([\w.]+)['\"]", src):
        py_models.add(m.group(1))
    for m in re.finditer(r"_inherit\s*=\s*['\"]([\w.]+)['\"]", src):
        py_inherits.add(m.group(1))

# ── (2) سلامة XML + جمع السجلات ─────────────────────────────────────────────
act_window_ids = set()   # ids لإجراءات ir.actions.act_window المحلية
group_ids = set()        # ids لمجموعات res.groups المحلية
menu_action_refs = []    # (ملف, action) لكل menuitem
groups_attr_refs = []    # (ملف, قيمة groups) لكل عنصر يحملها
seq_codes = set()        # أكواد ir.sequence
for path in walk('.xml'):
    rel = os.path.relpath(path, ROOT)
    try:
        tree = ET.parse(path)
        stats['xml'] += 1
    except ET.ParseError as exc:
        fail("XML غير سليم: %s — %s" % (rel, exc))
        continue
    root = tree.getroot()
    for rec in root.iter('record'):
        model = rec.get('model')
        rid = rec.get('id')
        if model == 'ir.actions.act_window' and rid:
            act_window_ids.add(rid)
        elif model == 'res.groups' and rid:
            group_ids.add(rid)
        elif model == 'ir.sequence':
            for fld in rec.findall('field'):
                if fld.get('name') == 'code' and fld.text:
                    seq_codes.add(fld.text.strip())
    for mi in root.iter('menuitem'):
        if mi.get('action'):
            menu_action_refs.append((rel, mi.get('action')))
        if mi.get('groups'):
            groups_attr_refs.append((rel, mi.get('groups')))
    # سمة groups على أزرار/حقول العروض
    for el in root.iter():
        g = el.get('groups')
        if g and el.tag not in ('menuitem',):
            groups_attr_refs.append((rel, g))

# ── (3) ir.model.access.csv ────────────────────────────────────────────────
csv_path = os.path.join(ROOT, 'security', 'ir.model.access.csv')
if not os.path.exists(csv_path):
    fail("مفقود: security/ir.model.access.csv")
else:
    with open(csv_path, encoding='utf-8', newline='') as fh:
        rows = list(csv.DictReader(fh))
    expected_cols = {'id', 'name', 'model_id:id', 'group_id:id',
                     'perm_read', 'perm_write', 'perm_create', 'perm_unlink'}
    if rows and set(rows[0].keys()) != expected_cols:
        fail("أعمدة CSV غير متوقّعة: %s" % sorted(rows[0].keys()))
    for row in rows:
        stats['csv_rows'] += 1
        model_xmlid = (row.get('model_id:id') or '').strip()
        # model_bz_period_close → bz.period.close
        if model_xmlid.startswith('model_'):
            model_name = model_xmlid[len('model_'):].replace('_', '.')
            if model_name not in py_models and model_name not in py_inherits:
                fail("CSV يشير لنموذج غير معرَّف: %s (الصف %s)"
                     % (model_name, row.get('id')))
        grp = (row.get('group_id:id') or '').strip()
        if grp.startswith('brandzo_warehouse.'):
            short = grp.split('.', 1)[1]
            if short not in group_ids:
                fail("CSV يشير لمجموعة غير معرَّفة: %s" % grp)

# ── (4) وجود ملفات data من المانفست ────────────────────────────────────────
manifest_src = read(os.path.join(ROOT, '__manifest__.py'))
manifest = None
for node in ast.walk(ast.parse(manifest_src)):
    if isinstance(node, ast.Dict):
        manifest = ast.literal_eval(node)
        break
if manifest is None:
    fail("تعذّر قراءة قاموس المانفست")
else:
    for rel in manifest.get('data', []):
        stats['data_files'] += 1
        if not os.path.exists(os.path.join(ROOT, rel)):
            fail("ملف data مفقود على القرص: %s" % rel)

# ── (5) ترابط المراجع ──────────────────────────────────────────────────────
for rel, action in menu_action_refs:
    stats['actions'] += 1
    if '.' in action:
        continue  # إجراء خارجي (module.xmlid) — خارج نطاق الفحص الساكن
    if action not in act_window_ids:
        fail("قائمة تشير لإجراء غير معرَّف محليًّا: %s (%s)" % (action, rel))

for rel, gval in groups_attr_refs:
    for token in gval.split(','):
        token = token.strip()
        if not token:
            continue
        stats['groups'] += 1
        if token.startswith('brandzo_warehouse.'):
            short = token.split('.', 1)[1]
            if short not in group_ids:
                fail("عرض/قائمة تشير لمجموعة غير معرَّفة: %s (%s)" % (token, rel))
        elif not token.startswith(EXTERNAL_PREFIXES):
            fail("مرجع مجموعة مجهول: %s (%s)" % (token, rel))

# ── (6) فحوص المرحلة 12 ────────────────────────────────────────────────────
def check(cond, msg):
    stats['checks'] += 1
    if not cond:
        fail("فحص المرحلة 12: %s" % msg)


check('bz.period.close' in py_models, "نموذج bz.period.close غير معرَّف")
check('account.move' in py_inherits, "امتداد account.move (حارس الترحيل) غائب")
check('bz.period.close' in seq_codes, "تسلسل bz.period.close غائب")
check('action_bz_period_close' in act_window_ids,
      "إجراء action_bz_period_close غير معرَّف")
csv_text = read(csv_path) if os.path.exists(csv_path) else ''
check('model_bz_period_close' in csv_text,
      "صفوف أمان bz.period.close غائبة عن CSV")
check(manifest and 'views/bz_period_close_views.xml' in manifest.get('data', []),
      "عرض الإغلاق غير مسجَّل في المانفست")
menu_text = read(os.path.join(ROOT, 'views', 'brandzo_menus.xml'))
check('menu_bz_period_close' in menu_text and
      'action_bz_period_close' in menu_text, "قائمة الإغلاق غير موصولة")
model_src = read(os.path.join(ROOT, 'models', 'bz_period_close.py'))
for needed in ('def action_close', 'def action_reopen', 'def _bz_checklist',
               'def _bz_assert_period_open', 'def _post'):
    check(needed in model_src, "دالة مفقودة في النموذج: %s" % needed)
# البنود الستّة للقائمة حاضرة بالرموز
for code in ('bills_posted', 'payments_registered', 'credit_notes_posted',
             'counts_validated', 'adjustments_applied', 'returns_closed'):
    check("'%s'" % code in model_src, "بند قائمة تحقّق مفقود: %s" % code)
# الاختبار مسجَّل
tests_init = read(os.path.join(ROOT, 'tests', '__init__.py'))
check('test_period_close' in tests_init, "اختبار المرحلة 12 غير مسجَّل")

# ── التقرير ────────────────────────────────────────────────────────────────
total = sum(stats.values())
print("=" * 60)
print("تحقّق brandzo_warehouse الساكن")
print("-" * 60)
print("ملفات Python سليمة نحويًّا : %d" % stats['py'])
print("ملفات XML سليمة التكوين   : %d" % stats['xml'])
print("صفوف الأمان (CSV)         : %d" % stats['csv_rows'])
print("ملفات data في المانفست    : %d" % stats['data_files'])
print("مراجع إجراءات القوائم     : %d" % stats['actions'])
print("مراجع المجموعات           : %d" % stats['groups'])
print("فحوص المرحلة 12           : %d" % stats['checks'])
print("النماذج المعرَّفة          : %s" % ', '.join(sorted(py_models)))
print("-" * 60)
if errors:
    print("❌ فشل — %d مشكلة:" % len(errors))
    for e in errors:
        print("   • " + e)
    sys.exit(1)
print("✅ نجح — %d عنصرًا مفحوصًا بلا أخطاء." % total)
sys.exit(0)
