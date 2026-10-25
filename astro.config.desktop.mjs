import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// بناءُ سطح المكتب (desktop-local) — يُحزَم في مثبّت Tauri ويُخدَم من جذر التطبيق.
// منفصلٌ تمامًا عن astro.config.mjs فلا يمسّ نشرَ GitHub Pages:
//  • base الجذر '/' (لا مسار /warehouse-system) — والكودُ يشتقّ base='' من BASE_URL
//    فتعمل الروابطُ والأصولُ من جذر التطبيق داخل المثبّت (لا مسارُ الصفحات البعيد).
//  • بلا site: لا نشرَ ويب من هذا البناء.
//  • بلا عاملٍ خفيّ (Service Worker): قرار الخطّة §4 — لئلّا يُثبَّت إصدارُ واجهةٍ
//    لا يطابق مخطّطَ القاعدة؛ فلا sw.js يُولَّد هنا ولا كاشٍ قديمٌ يَعلَق.
//  • المخرَج في dist-desktop، مستقلٌّ عن dist الويب.
export default defineConfig({
  base: '/',
  outDir: './dist-desktop',
  integrations: [react()],
});
