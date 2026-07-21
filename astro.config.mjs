import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import pwaServiceWorker from './src/integrations/pwa-sw.mjs';

// https://astro.build/config
export default defineConfig({
  // الرابط الأساسي لموقعك على جيتهاب
  site: 'https://albarshi996.github.io',
  // اسم المستودع لكي تعمل الروابط الداخلية بشكل صحيح
  base: '/warehouse-system',

  // pwaServiceWorker يولّد sw.js بعد البناء (تثبيت + عمل دون اتصال + تحديث ذاتي).
  integrations: [react(), pwaServiceWorker()],
});
