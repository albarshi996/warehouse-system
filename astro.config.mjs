import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  // الرابط الأساسي لموقعك على جيتهاب
  site: 'https://albarshi996.github.io',
  // اسم المستودع لكي تعمل الروابط الداخلية بشكل صحيح
  base: '/hub-documentation',

  integrations: [react()],
});
