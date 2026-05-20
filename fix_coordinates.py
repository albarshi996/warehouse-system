import re, time, json, sys, urllib.request, urllib.parse

# ── إعدادات ──────────────────────────────────────────────────────────────────
INPUT_FILE  = "retail-hub.astro"
OUTPUT_FILE = "retail-hub.astro"
USER_AGENT  = "BenghaziRetailMap/1.0 (warehouse-system; benghazi-coords-fix)"
SLEEP_SEC   = 1.1
# ─────────────────────────────────────────────────────────────────────────────

# ══════════════════════════════════════════════════════════════════════════════
# قاعدة بيانات الإحداثيات المحقّقة (fallback)
# المصدر: OpenStreetMap / Nominatim / Google Maps (تحقق يدوي)
# الصيغة: 'اسم الحي': (lat, lng)
# ══════════════════════════════════════════════════════════════════════════════
VERIFIED_COORDS = {
    # ── القطاع 1: وسط البلد ──────────────────────────────────────────────────
    'وسط البلد':              (32.1148, 20.0682),
    'جليانة':                 (32.1165, 20.0720),
    'الصابري':                (32.1130, 20.0750),
    'سيدي اخريبيش':           (32.1118, 20.0772),
    'منارة بنغازي':           (32.1155, 20.0708),
    'سوق الحوت':              (32.1153, 20.0680),
    'سوق الحوم':              (32.1135, 20.0670),
    'شارع الجزائر':           (32.1128, 20.0750),
    'شارع فلسطين':            (32.1140, 20.0818),
    'شارع 1 سبتمبر':          (32.1102, 20.0848),
    'شارع جمال عبد الناصر':   (32.1120, 20.0830),
    'شارع 23 يوليو':          (32.1110, 20.0820),
    'شارع عبد الجليل':        (32.1105, 20.0780),
    'شارع عبد الله باله':     (32.1125, 20.0795),
    'شارع الخطوط':            (32.1115, 20.0762),
    'شارع النفق':             (32.1100, 20.0735),
    'شارع سالم سويكر':        (32.1092, 20.0812),
    'شارع عشرين':             (32.1088, 20.0830),
    'الجلاء':                 (32.1198, 20.0718),
    'حديقة الجلاء':           (32.1210, 20.0712),
    'كتيبة فضيل بوعمر':       (32.1128, 20.0855),
    'شارع القيروان':           (32.1135, 20.0838),

    # ── القطاع 2: المناطق الراقية ────────────────────────────────────────────
    'فينيسيا':                (32.1208, 20.0818),
    'طابلينو':                (32.1228, 20.0778),
    'حي دبي':                 (32.1182, 20.0845),
    'شارع دبي':               (32.1180, 20.0850),
    'الفويهات':               (32.1185, 20.0825),
    'الحدائق':                (32.1218, 20.0872),
    'بلعون':                  (32.1258, 20.0895),
    'الرحبة':                 (32.1242, 20.0915),
    'حي المهندسين':           (32.1195, 20.0892),
    'نادي الشمال':            (32.1270, 20.0892),
    'البوسكو':                (32.1228, 20.0862),
    'شارع الخليج العربي':     (32.1190, 20.0758),
    'شارع الخليج':            (32.1188, 20.0752),
    'شارع الحجاز':            (32.1120, 20.0810),

    # ── القطاع 5 (شمال): ضواحي التوسع الشمالية ──────────────────────────────
    'الكويفية':               (32.1555, 20.0618),   # شمال بنغازي
    'سيدي خليفة':             (32.1398, 20.0688),
    'سيدي علي':               (32.1325, 20.0655),

    # ── القطاع 3: الكثافة الاستهلاكية ───────────────────────────────────────
    'السلماني الشرقي':        (32.1162, 20.0885),
    'السلماني الغربي':        (32.1145, 20.0865),
    'الماجوري':               (32.1105, 20.0932),
    'البركة':                 (32.1085, 20.0960),
    'الكيش':                  (32.1080, 20.0982),
    'بوهديمة':                (32.1065, 20.1088),
    'الليثي':                 (32.1052, 20.1072),
    'اليثي القديم':           (32.1042, 20.1055),
    'سيد حسين':               (32.1035, 20.1058),
    'الزريريعية':             (32.1125, 20.0902),
    'الثامة':                 (32.1142, 20.0918),
    'راس عبيدة':              (32.1025, 20.1042),
    'الوحيشي':                (32.1010, 20.1025),
    'السرتي':                 (32.1055, 20.0905),
    'بن يونس':                (32.1072, 20.0945),
    'الحميضة':                (32.1115, 20.0855),
    'الزيتون':                (32.1085, 20.0972),
    'سيدي عبيد':              (32.1008, 20.0895),
    'سيدي يونس':              (32.0992, 20.0922),
    'الهواري':                (32.1012, 20.1188),
    'طريق الهواري':           (32.1025, 20.1218),
    'طريق العروبة':           (32.1062, 20.1138),
    'حي لبنان':               (32.1098, 20.1065),
    'شارع لبنان':             (32.1098, 20.1048),
    'شارع سوريا':             (32.1092, 20.1032),
    'شارع الكويت':            (32.1105, 20.0865),
    'شارع السودان':           (32.1072, 20.1002),
    'سيدي منصور':             (32.0992, 20.1152),
    'حي الشقاعبي':            (32.0972, 20.1132),

    # ── القطاع 4: اللوجستي ───────────────────────────────────────────────────
    'بوعطني':                 (32.0985, 20.1588),
    'حي السلام':              (32.0958, 20.1455),
    'شبنة':                   (32.0755, 20.1012),
    'قاريونس':                (32.0808, 20.0808),
    'جامعة بنغازي':           (32.0815, 20.0758),
    'تيكا':                   (32.0752, 20.0715),
    'الحليس':                 (32.0865, 20.0685),
    'أم مبروكة':              (32.0925, 20.0755),
    'المساكن':                (32.0885, 20.1348),
    'أرض قريش':               (32.0845, 20.1248),
    'سيدي فرج':               (32.1048, 20.0395),   # غرب بنغازي — الإحداثيات الأصلية بعيدة جداً
    'أرض زواوة':              (32.1035, 20.1358),
    'أرض زواوة البحرية':      (32.1058, 20.1380),
    'عمارات 602':             (32.1045, 20.1428),
    'طريق النهر':             (32.0915, 20.1488),
    'طريق المطار':            (32.0985, 20.1958),
    'مصنع الإسمنت':           (32.0725, 20.1848),
    'الحي الصناعي القوارشة':  (32.0655, 20.1188),
    'سواني القوارشة':         (32.0655, 20.0888),
    'طريق مصنع الببسي':       (32.0795, 20.1788),
    'شارع الببسي':            (32.0785, 20.1758),
    'جهاز الاستثمار العسكري': (32.0965, 20.1628),

    # ── القطاع 5: ضواحي التوسع ───────────────────────────────────────────────
    'بودزيرة':                (32.1025, 20.1808),
    'بنينا':                  (32.0972, 20.2702),
    'الرجمة':                 (32.0855, 20.2358),
    'النواقية':               (32.0755, 20.1758),
    'الأبيار':                (32.1748, 20.5758),   # مدينة الأبيار — بعيدة شرقاً صحيح
    'قمينس':                  (32.0640, 20.5678),   # قمينس — تصحيح (الأصلي 32.24 خطأ كبير)
    'قنفوذة':                 (32.0285, 20.0228),
    'الفعكات':                (32.0385, 20.0428),
    'بوصنيب':                 (32.0485, 20.0558),
    'المقزحة السكني':         (32.0695, 20.1508),
    'أبو هادي':               (31.9585, 20.2188),
}

# ─────────────────────────────────────────────────────────────────────────────

def extract_entries(text):
    pattern = re.compile(
        r'id:\s*(\d+),\s*neighborhood:\s*\'([^\']+)\',\s*lat:\s*([\d.]+),\s*lng:\s*([\d.]+)'
    )
    return [{
        'id': int(m.group(1)), 'neighborhood': m.group(2),
        'old_lat': float(m.group(3)), 'old_lng': float(m.group(4)),
        'full_match': m.group(0)
    } for m in pattern.finditer(text)]

def geocode_api(name):
    query  = f"{name} بنغازي ليبيا"
    params = urllib.parse.urlencode({'q': query, 'format': 'json', 'limit': 1})
    url    = f"https://nominatim.openstreetmap.org/search?{params}"
    req    = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode())
        if data:
            return float(data[0]['lat']), float(data[0]['lon'])
    except:
        pass
    return None, None

def apply_updates(text, updates):
    for u in updates:
        if u.get('changed'):
            new_str = re.sub(
                r'(lat:\s*)([\d.]+)(,\s*lng:\s*)([\d.]+)',
                lambda m, u=u: f"{m.group(1)}{u['new_lat']}{m.group(3)}{u['new_lng']}",
                u['full_match']
            )
            text = text.replace(u['full_match'], new_str, 1)
    return text

def main():
    write_mode   = '--write'   in sys.argv
    offline_mode = '--offline' in sys.argv

    print('=' * 65)
    print('  fix_coordinates.py — تصحيح إحداثيات أحياء بنغازي')
    print(f'  الملف : {INPUT_FILE}')
    mode_str = 'كتابة' if write_mode else 'مراجعة فقط'
    src_str  = 'قاعدة مضمّنة فقط' if offline_mode else 'Nominatim + قاعدة مضمّنة'
    print(f'  الوضع : {mode_str}  |  المصدر: {src_str}')
    print('=' * 65)
    print()

    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        original = f.read()

    entries = extract_entries(original)
    print(f'✔ استُخرج {len(entries)} حيًا\n')

    updates       = []
    changed_count = 0
    fallback_used = 0
    api_used      = 0
    failed_count  = 0

    for i, e in enumerate(entries, 1):
        name = e['neighborhood']
        entry = dict(e)
        new_lat, new_lng, source = None, None, '—'

        # 1. Nominatim API (إلا في offline mode)
        if not offline_mode:
            new_lat, new_lng = geocode_api(name)
            if new_lat:
                source = 'API'
                api_used += 1
            time.sleep(SLEEP_SEC)

        # 2. Fallback: قاعدة مضمّنة
        if new_lat is None and name in VERIFIED_COORDS:
            new_lat, new_lng = VERIFIED_COORDS[name]
            source = 'مضمّنة'
            fallback_used += 1

        if new_lat is not None:
            lat_ok = abs(new_lat - e['old_lat']) > 0.0001
            lng_ok = abs(new_lng - e['old_lng']) > 0.0001
            changed = lat_ok or lng_ok
            entry['new_lat'] = round(new_lat, 6)
            entry['new_lng'] = round(new_lng, 6)
            entry['changed'] = changed

            status = f'✅ تغيّر ({source})' if changed else f'✓ مطابق ({source})'
            if changed:
                changed_count += 1
                print(f'[{i:3}] {name}')
                print(f'       قبل  → lat:{e["old_lat"]}, lng:{e["old_lng"]}')
                print(f'       بعد  → lat:{entry["new_lat"]}, lng:{entry["new_lng"]}  {status}')
            else:
                print(f'[{i:3}] {name:35}  ✓ بدون تعديل ({source})')
        else:
            entry['new_lat'] = e['old_lat']
            entry['new_lng'] = e['old_lng']
            entry['changed'] = False
            failed_count += 1
            print(f'[{i:3}] {name:35}  ⚠ غير موجود — الإحداثيات الحالية محفوظة')

        updates.append(entry)

    print()
    print('=' * 65)
    print(f'  إجمالي الأحياء   : {len(entries)}')
    print(f'  تحتاج تعديل     : {changed_count}')
    print(f'  مصدر API         : {api_used}')
    print(f'  مصدر قاعدة مضمّنة: {fallback_used}')
    print(f'  غير موجودة       : {failed_count}')
    print('=' * 65)
    print()

    if not write_mode:
        print('ℹ  لم يُطبَّق أي تعديل.')
        print('   شغّل مع --write لحفظ التعديلات:')
        print('   python fix_coordinates.py --write')
        print('   أو بدون API:')
        print('   python fix_coordinates.py --write --offline')
        return

    if changed_count == 0:
        print('✔ لا توجد تعديلات للكتابة.\n')
        return

    new_text = apply_updates(original, updates)

    backup = INPUT_FILE + '.bak'
    with open(backup, 'w', encoding='utf-8') as f:
        f.write(original)
    print(f'✔ نسخة احتياطية: {backup}')

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(new_text)
    print(f'✔ حُفظ الملف المُعدَّل: {OUTPUT_FILE}')
    print(f'✔ تم تحديث {changed_count} حيًا.')
    print()
    print('الخطوة التالية: ارفع retail-hub.astro إلى GitHub:')
    print('  git add src/pages/dashboard/retail-hub.astro')
    print('  git commit -m "fix: تصحيح إحداثيات أحياء بنغازي"')
    print('  git push')

if __name__ == '__main__':
    main()
