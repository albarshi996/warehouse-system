/**
 * 🔒 حارس خدمة الشحنات — فحصٌ ساكن بلا شبكة (نمط `lpnService.guard`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(DIR, 'shippingService.js'), 'utf8');
const RULES = fs.readFileSync(path.join(DIR, '..', '..', '..', 'firestore.rules'), 'utf8');

test('🔒 لا دالّة حذفٍ — الإلغاء حالةٌ لا محو', () => {
  assert.doesNotMatch(SRC, /deleteDoc|deleteField|\.delete\(/);
});

test('🔒 الحكم مستورَدٌ من المنطق الخالص — لا قاعدةَ تعبئةٍ تُكتب في طبقة التخزين', () => {
  assert.match(SRC, /from '\.\/packingFlow\.js'/);
  assert.match(SRC, /from '\.\/shipmentCode\.js'/);
  for (const fn of ['openPacking', 'setParcelCount', 'packLine', 'closeParcel', 'reopenParcel', 'cancelParcel', 'closePacking']) {
    assert.match(SRC, new RegExp(`${fn}\\(`), `${fn} تُستدعى ولا تُكرَّر`);
  }
});

test('🔒 كلّ دالّةٍ تقرأ الحيّ قبل أن تحكم — لا حكمَ على نسخة الشاشة', () => {
  const live = SRC.match(/await liveShipment\(code\)/g) ?? [];
  assert.ok(live.length >= 7, `القراءة الحيّة في كلّ دالّةٍ تكتب — وُجد ${live.length}`);
});

test('★★ 🔒 إعادةُ فتح طردٍ تُبطل ملصقه — الشرط الذي نصّ عليه الطلب', () => {
  assert.match(SRC, /out\.voidLabel/);
  assert.match(SRC, /setBarcodeStatus\(out\.voidLabel, 'DAMAGED'/);
  assert.match(SRC, /setBarcodeStatus\(out\.voidLabel, 'VOID'/);
});

test('🔒 كلّ طردٍ يُقيَّد باركودًا مستقلًّا في السجلّ الموحّد', () => {
  assert.match(SRC, /registerBatch\(/);
  assert.match(SRC, /BARCODE_KINDS\.PARCEL\.id/);
  assert.match(SRC, /BARCODE_KINDS\.SHIPMENT\.id/);
});

test('🔒 الرقم يُحجز بعدّادٍ ذرّيّ لا يُكتب بيد', () => {
  assert.match(SRC, /reserveSequence\(key\)/);
  assert.match(SRC, /formatShipmentCode\(/);
});

test('🔒 هويّة الكاتب من Auth — شرط القواعد', () => {
  assert.match(SRC, /auth\?\.currentUser\?\.uid/);
  assert.match(SRC, /openedByUid: currentUid\(\)/);
});

test('🔒 القواعد تحرس الشحنات وأحداثها — ولا حذفَ فيهما، و«محمَّلة» ختاميّة', () => {
  assert.match(RULES, /match \/shipments\/\{shipmentCode\}/);
  const block = RULES.slice(RULES.indexOf('match /shipments/{shipmentCode}'));
  const scoped = block.slice(0, block.indexOf('// عدّادات تسلسل الباركود'));
  assert.match(scoped, /shipmentCode\.matches\('SHP-/, 'النحو محروسٌ في القاعدة كنحو الطبلية');
  assert.match(scoped, /resource\.data\.state != 'LOADED'/, 'شحنةٌ خرجت لا تُعدَّل بأثرٍ رجعيّ');
  const deletes = scoped.match(/allow delete: if ([^;]+);/g) ?? [];
  assert.ok(deletes.length >= 2);
  for (const d of deletes) assert.match(d, /if false/);
});

test('★ 🔒 مسحةٌ ثانيةٌ لشحنةٍ محمَّلة تُعلن ولا تكتب — فلا ترتدّ القاعدة خطأً على العامل', () => {
  assert.match(SRC, /if \(live\.state === 'LOADED'\) return \{ already: true/);
});
