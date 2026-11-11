import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// ★★★ نسخةُ أندرويد (Tauri موبايل، أوفلاين) — نفسُ الوضع المحلّيّ لسطح المكتب:
//     دخولٌ محلّيّ + بياناتٌ من SQLite المحلّيّة (لا قوقل). الفرقُ الوحيد رايةٌ
//     إضافيّة `PUBLIC_IS_ANDROID` ليعرض محدّثَ أندرويد المخصّص (تنزيلُ APK من
//     GitHub Releases) بدل محدّث سطح المكتب (مُلحق Tauri غير المدعوم على الموبايل).
//     الويبُ وملفُّ المكتب لا يُمسّان — هذا ملفُّ إعدادٍ منفصل.
process.env.PUBLIC_AUTH_BACKEND = 'local';
process.env.PUBLIC_DB_BACKEND = 'local-sqlite';
process.env.PUBLIC_IS_DESKTOP = 'true';
process.env.PUBLIC_IS_ANDROID = 'true';
// إصدارُ التطبيق — يقارنه محدّثُ أندرويد بـ android-latest.json. يطابق
// tauri.conf.json و APP_VERSION في ورك-فلو البناء (يُبمَّن معًا عند الترقية).
process.env.PUBLIC_APP_VERSION = '1.0.18';

export default defineConfig({
  base: '/',
  outDir: './dist-desktop',
  integrations: [react()],
});
