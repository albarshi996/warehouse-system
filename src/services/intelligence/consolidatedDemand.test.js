/**
 * حارس الطلب المجمَّع وقنواته ‹FNB-304 · FNB-305›.
 *
 * أخطر ما يحرسه: **التجميع عرضٌ مشتقّ لا يبتلع مستند الفرع**، و**التوازن**
 * (مجموع أيّ وجهٍ = مجموع الطلبات بلا ازدواجٍ ولا فقد)، و**الرقم المجمَّع
 * يُفتَح** إلى مصادره.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMAND_FACETS, demandRows, consolidate, consolidateAll, drillDemand,
  demandBalance, netSectorRequirement,
  DEMAND_CHANNELS, DEFAULT_CHANNEL, normalizeChannel, channelOf, isInternalChannel, byChannel,
} from './consolidatedDemand.js';
import { indexLocations } from '../org/orgLocations.js';

const TREE = indexLocations([
  { code: 'FNB', nameAr: 'قطاع الأغذية', level: 'sector' },
  { code: 'BRD1', nameAr: 'براند أ', level: 'brand', parentCode: 'FNB' },
  { code: 'BRD2', nameAr: 'براند ب', level: 'brand', parentCode: 'FNB' },
  { code: 'BR01', nameAr: 'فرع ١', level: 'branch', parentCode: 'BRD1', profile: { city: 'بنغازي' } },
  { code: 'BR02', nameAr: 'فرع ٢', level: 'branch', parentCode: 'BRD1', profile: { city: 'طرابلس' } },
  { code: 'BR03', nameAr: 'فرع ٣', level: 'branch', parentCode: 'BRD2', profile: { city: 'بنغازي' } },
]);

const ORDERS = [
  {
    id: 'D1', number: 'TR-001',
    header: { toWarehouse: 'BR01', requestDate: '2026-08-20' },
    lines: [{ sku: 'CHICKEN', qty: 100, suggestedQty: 100 }, { sku: 'RICE', qty: 50 }],
  },
  {
    id: 'D2', number: 'TR-002',
    header: { toWarehouse: 'BR02', requestDate: '2026-08-20' },
    lines: [{ sku: 'CHICKEN', qty: 60 }],
  },
  {
    id: 'D3', number: 'TR-003',
    header: { toWarehouse: 'BR03', requestDate: '2026-08-21' },
    lines: [{ sku: 'CHICKEN', qty: 40 }, { sku: 'OIL', qty: 20 }],
  },
];

test('★ الأبعاد تُشتقّ من الشجرة — والمدينة صفةُ الفرع لا حقلٌ على المستند', () => {
  const rows = demandRows(ORDERS, TREE);
  const first = rows.find((r) => r.branch === 'BR01' && r.sku === 'CHICKEN');
  assert.equal(first.brand, 'BRD1');
  assert.equal(first.sector, 'FNB');
  assert.equal(first.city, 'بنغازي');
  // والمرجع إلى المستند محفوظ — الرقم المجمَّع يُفتَح.
  assert.equal(first.docNumber, 'TR-001');
});

test('★★ الأوجه الستّة كلّها — والقطاع مجموع براندَيه', () => {
  const rows = demandRows(ORDERS, TREE);
  const all = consolidateAll(rows);
  assert.deepEqual(Object.keys(all).sort(), Object.keys(DEMAND_FACETS).sort());

  assert.equal(all.branch.find((g) => g.key === 'BR01').qty, 150);
  assert.equal(all.brand.find((g) => g.key === 'BRD1').qty, 210); // 150 + 60
  assert.equal(all.sector.find((g) => g.key === 'FNB').qty, 270);
  assert.equal(all.item.find((g) => g.key === 'CHICKEN').qty, 200); // 100+60+40
  assert.equal(all.city.find((g) => g.key === 'بنغازي').qty, 210); // BR01 + BR03
  assert.equal(all.deliveryDate.find((g) => g.key === '2026-08-20').qty, 210);
});

test('★★ التوازن: مجموع أيّ وجهٍ = مجموع الطلبات — بلا ازدواجٍ ولا فقد', () => {
  const balance = demandBalance(demandRows(ORDERS, TREE));
  assert.equal(balance.ok, true, balance.problems.join(' · '));
  assert.equal(balance.total, 270);
});

test('★ التجميع عرضٌ مشتقّ: مستندات الفروع لا تُمسّ ولا تُدمج', () => {
  const before = JSON.stringify(ORDERS);
  const rows = demandRows(ORDERS, TREE);
  consolidateAll(rows);
  assert.equal(JSON.stringify(ORDERS), before, 'المستندات الأصليّة تغيّرت');
  // وكلّ سطرٍ يبقى منسوبًا لفرعه — لا كمّيّةَ بلا مسؤول.
  assert.ok(rows.every((r) => r.branch));
});

test('★ الرقم المجمَّع يُفتَح إلى مصادره — لا رقمٌ مغلق', () => {
  const rows = demandRows(ORDERS, TREE);
  const chicken = consolidate(rows, 'item').find((g) => g.key === 'CHICKEN');
  assert.equal(chicken.branches, 3);
  assert.deepEqual(chicken.refs, ['TR-001', 'TR-002', 'TR-003']);
  const drilled = drillDemand(rows, 'item', 'CHICKEN');
  assert.equal(drilled.length, 3);
  assert.equal(drilled.reduce((s, r) => s + r.qty, 0), chicken.qty, 'التفصيل يفسّر المجمَل');
});

test('فرعٌ خارج الشجرة يُحصى «غير محدَّد» ولا يذوب', () => {
  const rows = demandRows([{ id: 'X', header: { toWarehouse: 'GHOST' }, lines: [{ sku: 'A', qty: 7 }] }], TREE);
  const byBrand = consolidate(rows, 'brand');
  assert.equal(byBrand[0].label, 'غير محدَّد');
  assert.equal(byBrand[0].qty, 7);
  assert.equal(demandBalance(rows).ok, true, 'ويظلّ التوازن سليمًا');
});

test('الاحتياج الصافي للقطاع = الطلب − المتاح مركزيًّا (مدخل FNB-601)', () => {
  const rows = demandRows(ORDERS, TREE);
  const net = netSectorRequirement(rows, { centralStockBySku: new Map([['CHICKEN', 150], ['RICE', 999]]) });
  const chicken = net.find((r) => r.sku === 'CHICKEN');
  assert.equal(chicken.demand, 200);
  assert.equal(chicken.netRequirement, 50); // 200 − 150
  assert.equal(net.find((r) => r.sku === 'RICE').covered, true); // مغطًّى بالكامل
  assert.equal(net.find((r) => r.sku === 'OIL').netRequirement, 20); // بلا رصيدٍ مركزيّ
});

/* ═══════════ ‹FNB-305› قناة الطلب ═══════════ */

test('★ القنوات الأربع معرَّفة — والداخليّ يفارق الخارجيّ', () => {
  for (const id of ['RESTAURANTS', 'CATERING', 'CORPORATE', 'AGGREGATORS']) {
    assert.ok(DEMAND_CHANNELS[id], `القناة «${id}» غائبة`);
  }
  assert.equal(isInternalChannel('RESTAURANTS'), true);
  assert.equal(isInternalChannel('CATERING'), false);
  assert.equal(normalizeChannel('ضيافة'), 'CATERING');
  assert.equal(normalizeChannel('delivery'), 'AGGREGATORS');
  assert.equal(normalizeChannel('قناةٌ مخترَعة'), ''); // المجهول يُعلَن.
});

test('★★ الترحيل صفر الأثر: مستندٌ بلا قناة يُقرأ «تزويد الفروع»', () => {
  assert.equal(channelOf({ header: {} }), DEFAULT_CHANNEL);
  assert.equal(channelOf({}), DEFAULT_CHANNEL);
  assert.equal(channelOf({ header: { channel: 'ضيافة' } }), 'CATERING');
  const rows = demandRows(ORDERS, TREE);
  assert.ok(rows.every((r) => r.channel === 'RESTAURANTS'));
});

test('القنوات تصبّ في محرّكٍ واحد وتظلّ مميَّزة', () => {
  const mixed = demandRows([
    ...ORDERS,
    { id: 'C1', number: 'SO-9', header: { toWarehouse: 'BR01', channel: 'CATERING' }, lines: [{ sku: 'CHICKEN', qty: 500 }] },
  ], TREE);
  const channels = byChannel(mixed);
  assert.equal(channels.length, 2);
  const catering = channels.find((c) => c.key === 'CATERING');
  assert.equal(catering.qty, 500);
  assert.equal(catering.internal, false);
  assert.match(catering.label, /الضيافة/);
  // والمحرّك واحد: الصنف يُجمع عبر القناتين.
  assert.equal(consolidate(mixed, 'item').find((g) => g.key === 'CHICKEN').qty, 700);
  assert.equal(demandBalance(mixed).ok, true);
});
