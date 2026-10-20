/**
 * هدفُ النشر — مشتقٌّ من بطاقة المكان، لا مكتوبٌ بيد.
 *
 * ── ما كان هنا، ولماذا زال ──────────────────────────────────────────────
 * كان هذا الملفُّ (٤٨٢ سطرًا) آلةَ الهويّة بين مستودعَين شقيقَين: جدولُ مواضع
 * يُختم، وحارسُ تسرُّبٍ يمنع رمزَ أحدهما أن يظهر في الآخر، ومولّدا `AGENTS.md`
 * و`WORKSPACE.md`، وقياسُ ما سيمحوه الدمج. **وفُكّ الارتباطُ بأمر المالك
 * 2026-10-18** — فمستودع الشركة صار مستقلًّا بحسابه وقاعدة بياناته، ولم تعد
 * بينهما مزامنة. فزالت الآلةُ كلُّها: لا شقيقَ يُقاس به، ولا رمزَ يتسرّب.
 *
 * ── ولماذا بقي هذا السطر الواحد ─────────────────────────────────────────
 * `tokensOf` ليست من آلة المزامنة. هي **المصدرُ الوحيد لعنوان النشر ومساره**،
 * يستعملها `scripts/build-usage-guide.mjs` — وهو في `prebuild`، أي يعمل في
 * كلّ بناء. وكان العنوانُ مثبَّتًا نصًّا من قبل فأوقف المزامنةَ يومين وعلّق ٧٥
 * كوميتًا (رُصد 2026-08-28). فالدرسُ باقٍ وإن زال الشقيق: **عنوانُ النشر
 * يُشتقّ من `workspace.json` ولا يُكتب في ملفَّين.**
 */

/**
 * يشتقّ عنوان النشر ومساره من بطاقة المكان.
 * @param {{repo:string, pages?:string}} card
 * @returns {{slug:string, host:string, base:string, name:string}}
 */
export function tokensOf(card) {
  const repo = String(card?.repo ?? '').trim();
  const parts = repo.split('/');
  const [owner, name] = parts;
  if (parts.length !== 2 || !owner || !name) {
    throw new Error(`بطاقة هويّة بلا عنوان صالح «owner/repo»: ${JSON.stringify(card?.repo)}`);
  }
  // الافتراض صفحةُ مشروعٍ على GitHub Pages، و`pages` يتجاوزه إن اعتُمد نطاقٌ مستقلّ.
  const pages = String(card.pages ?? `https://${owner}.github.io/${name}/`);
  const url = new URL(pages);
  const base = url.pathname.replace(/\/+$/, '');
  if (!base) {
    throw new Error(`رابط نشرٍ بلا مسارٍ فرعيّ (${pages}) — الختم بمسارٍ فارغ يمحو ما لا يقصده.`);
  }
  return { slug: `${owner}/${name}`, host: url.origin, base, name };
}
