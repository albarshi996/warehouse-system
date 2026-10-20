/**
 * اختباراتُ صور أصول فينسيا.
 *
 * وأثقلُ ما هنا حارسُ **المصغَّرة**: هي وحدَها ما يُقرأ مع كلّ أصلٍ في كلّ
 * لقطة، فتضخّمُها يُعيد العطبَ الذي فُرّ منه. وما سواه تفاصيل.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MAX_ATTACHMENT_BYTES, dataUrlBytes } from '../documents/attachmentFile.js';
import {
  PHOTO_KIND,
  PHOTO_LIMITS,
  VENECIA_ENTITY_KIND,
  assetPhotoPatch,
  duplicateOf,
  encodedVerdict,
  fitWithin,
  photoPayload,
  photoSummary,
  photoVerdict,
  quotaEstimate,
  thumbVerdict,
} from './veneciaPhotos.js';

/** dataURL بحجمٍ تقريبيٍّ مطلوب (بالبايت). */
const dataUrlOf = (bytes) => 'data:image/webp;base64,' + 'A'.repeat(Math.ceil(bytes / 3) * 4);

const file = (over = {}) => ({ name: 'IMG_0001.jpg', size: 3 * 1024 * 1024, type: 'image/jpeg', ...over });

// ── الثوابت ──────────────────────────────────────────────────────────────

test('الصنفُ والتصنيفُ من مفردات البوّابة القائمة', () => {
  assert.equal(VENECIA_ENTITY_KIND, 'venecia_asset');
  assert.equal(PHOTO_KIND, 'goods');
  assert.equal(PHOTO_LIMITS.maxBytes, MAX_ATTACHMENT_BYTES, 'السقفُ هو سقفُ المرفقات نفسُه لا ثانٍ ينحرف');
  assert.equal(PHOTO_LIMITS.maxPerAsset, 6);
  assert.ok(Object.isFrozen(PHOTO_LIMITS), 'الحدودُ مجمّدةٌ فلا تُعدَّل في زمن التشغيل');
});

test('★★★ وصنفُ الكيان مسموحٌ في القاعدة كما في الكود — فلا تنحرف قائمتان', () => {
  // تُقرأ القائمتان **نصًّا من مصدرَيهما**: استيرادُ الخدمة يجرّ Firebase
  // فيسقط في Node، والمرساةُ تُقاس على ما في الملفّين لا على ما نظنّه.
  const here = new URL('./', import.meta.url);
  const svc = readFileSync(new URL('../documents/attachmentsService.js', here), 'utf8');
  const codeList = svc.match(/ATTACHMENT_ENTITY_KINDS = \[([^\]]+)\]/);
  assert.ok(codeList, 'لم تُعثَر قائمةُ الأصناف في attachmentsService.js');
  const kinds = codeList[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean);

  const rules = readFileSync(new URL('../../../firestore.rules', here), 'utf8');
  const ruleList = rules.match(/entityKind in \[([^\]]+)\]/);
  assert.ok(ruleList, 'لم تُعثَر قائمةُ أصناف الكيان في firestore.rules');
  const allowed = ruleList[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean);

  for (const kind of kinds) {
    assert.ok(
      allowed.includes(kind),
      `الصنفُ «${kind}» في الكود وليس في القاعدة — سيُرفض الرفعُ بـpermission-denied بلا سببٍ ظاهر`
    );
  }
  assert.ok(kinds.includes(VENECIA_ENTITY_KIND), 'صنفُ فينسيا غائبٌ عن الكود');
  assert.ok(allowed.includes(VENECIA_ENTITY_KIND), 'صنفُ فينسيا غائبٌ عن القاعدة');
});

// ── الأبعاد ──────────────────────────────────────────────────────────────

test('الأبعادُ تُدخَل في المربّع بحفظ النسبة', () => {
  assert.deepEqual(fitWithin(4000, 3000, 1280), { width: 1280, height: 960 });
  assert.deepEqual(fitWithin(3000, 4000, 1280), { width: 960, height: 1280 });
  assert.deepEqual(fitWithin(1000, 1000, 1280), { width: 1000, height: 1000 });
});

test('★ وما كان أصغرَ لا يُكبَّر — فالتكبيرُ يزيد البايتات لا المعلومات', () => {
  assert.deepEqual(fitWithin(300, 200, 1280), { width: 300, height: 200 });
  assert.deepEqual(fitWithin(96, 96, 1280), { width: 96, height: 96 });
});

test('وأبعادٌ مشوّهةٌ تُعيد صفرًا ولا ترمي', () => {
  assert.deepEqual(fitWithin(0, 500, 1280), { width: 0, height: 0 });
  assert.deepEqual(fitWithin('كثير', 'كثير', 1280), { width: 0, height: 0 });
});

// ── حكمُ الملفّ ──────────────────────────────────────────────────────────

test('ملفٌّ سليمٌ يمرّ', () => {
  assert.deepEqual(photoVerdict(file(), { count: 0 }), { ok: true, problems: [] });
});

test('★ وPDF يُرفض هنا — يُرفق بالمستندات لا بالأصل', () => {
  const v = photoVerdict(file({ type: 'application/pdf', name: 'a.pdf' }), { count: 0 });
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /الصورُ فقط/);
});

test('وصيغةٌ غيرُ مقبولةٍ أو ملفٌّ عملاقٌ يُرفض قبل أن يُقرأ', () => {
  assert.equal(photoVerdict(file({ type: 'image/gif' }), {}).ok, false);
  assert.equal(photoVerdict(file({ size: 30 * 1024 * 1024 }), {}).ok, false);
  assert.equal(photoVerdict(null, {}).ok, false);
});

test('★★★ وسقفُ الصور يُمنع عند بلوغه لا بعد تجاوزه', () => {
  assert.equal(photoVerdict(file(), { count: 5 }).ok, true);
  const v = photoVerdict(file(), { count: 6 });
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /سقفُ الصور 6/);
});

// ── حكمُ المضغوط ─────────────────────────────────────────────────────────

test('الصورةُ بعد الضغط تمرّ تحت السقف وتُرفض فوقه', () => {
  assert.equal(encodedVerdict(dataUrlOf(130 * 1024)).ok, true);
  const big = encodedVerdict(dataUrlOf(900 * 1024));
  assert.equal(big.ok, false);
  assert.match(big.problems[0], /700KB/);
  assert.equal(encodedVerdict('').ok, false);
});

test('★★★ والحكمُ يُعيد الحجمَ معه — وإلّا عرضت الشاشةُ «٠ ك.ب بعد الضغط»', () => {
  const url = dataUrlOf(68 * 1024);
  const v = encodedVerdict(url);
  assert.equal(v.bytes, dataUrlBytes(url));
  assert.ok(v.bytes > 0, 'رقمٌ مخترَعٌ في رسالةٍ يُفقد الثقةَ بكلّ ما سواه');
  // وحتّى المرفوضةُ تقول حجمَها — فالمستخدمُ يحتاجه ليعرف كم يُنقص.
  assert.ok(encodedVerdict(dataUrlOf(900 * 1024)).bytes > 0);
  assert.equal(encodedVerdict('').bytes, 0);
});

// ── ★★★ حارسُ المصغَّرة ──────────────────────────────────────────────────

test('★★★ المصغَّرةُ تُرفض فوق ثمانيةِ كيلوبايت — وهي ما يُقرأ مع كلّ أصل', () => {
  const small = thumbVerdict(dataUrlOf(3 * 1024));
  assert.equal(small.ok, true);
  assert.ok(small.bytes > 0);
  const fat = thumbVerdict(dataUrlOf(20 * 1024));
  assert.equal(fat.ok, false);
  assert.match(fat.problems[0], /المصغَّرة 20 ك\.ب والحدّ 8 ك\.ب/);
});

test('★★★ ومصغَّرةٌ مرفوضةٌ تُكتب فراغًا — فلا تبقى قديمةٌ تكذب على القائمة', () => {
  const photos = [{ hash: 'a', bytes: 100 }];
  assert.deepEqual(assetPhotoPatch(photos, dataUrlOf(3 * 1024)).photoCount, 1);
  assert.ok(assetPhotoPatch(photos, dataUrlOf(3 * 1024)).thumbPhoto.length > 0);
  assert.equal(assetPhotoPatch(photos, dataUrlOf(20 * 1024)).thumbPhoto, '', 'المتضخّمةُ لا تُخزَّن');
  assert.equal(assetPhotoPatch([], '').thumbPhoto, '');
  assert.equal(assetPhotoPatch([], '').photoCount, 0, 'وحذفُ آخرِ صورةٍ يُصفّر العدّاد');
});

// ── التكرار والملخّص ─────────────────────────────────────────────────────

test('★★★ والبصمةُ تُقارَن بحقل `sha256` الذي تكتبه الخدمةُ فعلًا', () => {
  const photos = [{ id: '1', sha256: 'abc' }, { id: '2', sha256: 'def' }];
  assert.equal(duplicateOf('abc', photos).id, '1');
  assert.equal(duplicateOf('zzz', photos), null);
  assert.equal(duplicateOf('', photos), null, 'وبصمةٌ فارغةٌ ليست تكرارًا');
  // ★ والحقلُ `hash` **لا وجودَ له** في المستند المكتوب: كان الكاشفُ يقارن
  //   به فلا يُطلق أبدًا في السحابة وإن أطلق في المِشحذ.
  assert.equal(duplicateOf('abc', [{ id: '1', hash: 'abc' }]), null);
});

test('الملخّص: العددُ والحجمُ والمتبقّي من السقف', () => {
  const photos = [{ size: 100 }, { size: 200 }];
  assert.deepEqual(photoSummary(photos), { count: 2, bytes: 300, remaining: 4 });
  assert.deepEqual(photoSummary([]), { count: 0, bytes: 0, remaining: 6 });
});

test('والحجمُ من حقل `size`، وغيابُه يُحسب من المحتوى لا يُهمَل', () => {
  const url = dataUrlOf(1024);
  assert.equal(photoSummary([{ size: 4096 }]).bytes, 4096);
  assert.equal(photoSummary([{ dataUrl: url }]).bytes, dataUrlBytes(url));
});

// ── الجسم والحصّة ────────────────────────────────────────────────────────

test('★★★ وجسمُ المستند لا يحمل إلّا ما تقبله `attachmentBody` — وما سواه يُسقَط صامتًا', () => {
  const body = photoPayload({ dataUrl: dataUrlOf(50 * 1024), name: ' IMG.jpg ', mime: 'image/webp' });
  assert.equal(body.kind, PHOTO_KIND);
  assert.equal(body.name, 'IMG.jpg');
  assert.deepEqual(
    Object.keys(body).sort(),
    ['dataUrl', 'kind', 'mime', 'name', 'note', 'profile'].sort(),
    'حقلٌ زائدٌ يُمحى قبل أن يُكتب — فلا يُرسَل أصلًا'
  );
});

test('★★★ ومرساةٌ على عقد `attachmentBody`: الحقولُ المقبولةُ والمحسوبةُ كما هي', () => {
  const src = readFileSync(new URL('../documents/attachmentsService.js', import.meta.url), 'utf8');
  const sig = src.match(/async function attachmentBody\(\{([^}]+)\}/);
  assert.ok(sig, 'لم يُعثَر على توقيع attachmentBody');
  const accepted = sig[1]
    .split(',')
    .map((x) => x.trim().split('=')[0].trim())
    .filter(Boolean);
  const body = photoPayload({ dataUrl: dataUrlOf(1024) });
  for (const key of Object.keys(body)) {
    assert.ok(accepted.includes(key), `الحقلُ «${key}» لا تقبله attachmentBody — سيُسقَط صامتًا`);
  }
  // وهي تحسب البصمةَ والحجمَ بنفسها بهذين الاسمين — وعليهما يعتمد الكاشفُ والملخّص.
  assert.match(src, /sha256:\s*await sha256Hex/, 'اسمُ حقل البصمة تغيّر — سيعمى كاشفُ التكرار');
  assert.match(src, /size:\s*dataUrlBytes/, 'اسمُ حقل الحجم تغيّر — سيعرض الملخّصُ صفرًا');
});

test('★★★ وحسابُ الحصّة يُظهر أنّ العبءَ قراءاتٌ لا تخزين', () => {
  const assets = 104;
  const avgBytes = 130 * 1024;
  const q = quotaEstimate({ assets, perAsset: 6, avgBytes });
  assert.equal(q.photos, 624);
  assert.ok(q.percentOfGb > 7 && q.percentOfGb < 9, `النسبة ${q.percentOfGb}٪ من الجيجابايت`);

  // ★ والمقارنةُ التي تُسمّي الفائدة: ماذا تقرأ القائمةُ في كلّ لقطة؟
  //   · بالتصميم — المصغَّراتُ وحدَها، بحدٍّ أعلى ٨ ك.ب لكلّ أصل.
  //   · بدونه — الصورةُ على سجلّ الأصل، فتُنزَّل كاملةً مع كلّ لقطة.
  const withoutDesign = assets * avgBytes;
  assert.ok(q.listBytes < 1024 * 1024, `قراءةُ القائمة ${q.listBytes} بايت — دون الميغابايت`);
  assert.ok(
    q.listBytes * 15 < withoutDesign,
    `بالتصميم ${q.listBytes} وبدونه ${withoutDesign} — والفرقُ يجب أن يتجاوز خمسةَ عشرَ ضعفًا`
  );
});
