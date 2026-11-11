# نسخة أندرويد من BHOME — APK أوفلاين يحدّث نفسه

نسخةُ الموبايل تُبنى من **نفس مشروع Tauri** (Tauri 2 يدعم أندرويد)، بنفس فكرة الـexe:
بياناتٌ محليّةٌ أوفلاين (SQLite على الجهاز) وتحديثٌ ذاتيّ من GitHub Releases.
البناءُ في CI (الورك-فلو `.github/workflows/android-build.yml`) لأنّ Rust/Android لا
يُصرَّفان على جهاز المالك.

## التنزيل والتثبيت

- صفحة الإصدار (وسم ثابت): `https://github.com/albarshi996/warehouse-system/releases/tag/android-latest`
- الملفّ: **`BHOME-android-arm64.apk`** (~68 م.ب · معماريّة arm64 تستوعب كلّ هواتف أندرويد الحديثة).
- على الهاتف: حمّل الملفّ، ثمّ اسمح بـ«تثبيت تطبيقات من مصدر غير معروف» للمتصفّح عند الطلب، ثمّ ثبّت.
- أوّلُ تشغيلٍ يحتاج اتصالًا (دخول + مزامنة أولى إن لزمت)، ثمّ يعمل أوفلاين من قاعدة الجهاز.

## التحديثُ الذاتيّ

- التطبيقُ يفحص `android-latest.json` عند الإقلاع ويقارن إصدارَه؛ وإن توفّر أحدثُ عرض
  بانرًا «تحديثٌ متاح» يفتح رابطَ تنزيل الـAPK الجديد (المكوّن `AndroidUpdater.jsx`).
- **لكي يُثبَّت التحديثُ فوق النسخة القائمة** لا بدّ أن تُوقَّع كلُّ الإصدارات **بنفس المفتاح**.
  النسخةُ المنشورةُ الآن وُقِّعت بمفتاحٍ لحظيٍّ (قابلةٌ للتثبيت، لكنّ التحديثَ فوقها يطلب إزالةً أولًا).

### تفعيلُ التوقيع الثابت (خطوةٌ واحدةٌ منك — آمنة)

لم أضع مفتاحَ التوقيع في المستودع (عامّ) ولم أضع أسرارًا نيابةً عنك (محجوبٌ أمنيًّا).
المفتاحُ مُولَّدٌ ومحفوظٌ محليًّا: `C:\Users\DELL\bhome-android-signing\`
(الملفّ `bhome-release.jks`، وكلمةُ المرور في `README-signing.txt` — **احتفظ بهما، فقدُهما يمنع كلَّ تحديثٍ لاحق**).

شغّل هذه الأوامر مرّةً واحدة (في مجلّد التوقيع) فيصير كلُّ بناءٍ موقَّعًا بنفس المفتاح:

```bash
cd ~/bhome-android-signing   # أو C:\Users\DELL\bhome-android-signing
base64 -w0 bhome-release.jks | gh secret set ANDROID_KEYSTORE_BASE64
gh secret set ANDROID_KEY_ALIAS --body bhome
gh secret set ANDROID_KEYSTORE_PASSWORD   # الصق كلمة المرور من README-signing.txt
```

ثمّ أعد تشغيل البناء: `gh workflow run android-build.yml --ref claude/plan-review-bhome-rename-68b5af`
— سيوقّع الورك-فلو بالمفتاح الثابت تلقائيًّا، ومن بعده تعمل التحديثاتُ فوق القائم بلا إزالة.

## ترقيةُ الإصدار

عند إصدار نسخةٍ أحدث، ارفع الرقم في **ثلاثة مواضع معًا** (كالمكتب):
`src-tauri/tauri.conf.json` · `APP_VERSION` في `android-build.yml` · `PUBLIC_APP_VERSION` في `astro.config.mobile.mjs`.
ثمّ ادفع الفرع (أو شغّل الورك-فلو) — يُبنى APK جديد ويُنشر على `android-latest`، فيكتشفه المثبَّتون.

## ما الذي تغيّر في الكود (مرجع)

- `src-tauri/src/lib.rs`: نقطةُ تشغيلٍ مشتركة (`mobile_entry_point`)؛ `main.rs` يناديها.
- `src-tauri/Cargo.toml`: `[lib]` (cdylib)، ومُلحقُ المُحدّث خاصٌّ بسطح المكتب (`cfg` desktop)، ومُلحق `opener`.
- `capabilities/`: فصلُ صلاحيّة المُحدّث (المكتب) عن القلب (كلّ المنصّات) + إذن `opener`.
- `tauri.android.conf.json` + `astro.config.mobile.mjs` + `build:mobile`: بناءُ أندرويد براية `PUBLIC_IS_ANDROID`.
- `src/services/updater/androidUpdate.js` (+اختبار) و`src/components/pwa/AndroidUpdater.jsx`.
- iOS مؤجّل: يحتاج ماك + حساب أبل سنويّ ولا يحدّث نفسه (قاعدة أبل) — TestFlight أقصاه.
