/**
 * تنفيذ الاستيراد على البيانات الحيّة — الغلاف السحابيّ لـ`sourceImport.js`.
 *
 *   source_imports/{بصمة السطر}   ← ملحقة-فقط، معرّفها **هو** البصمة
 *
 * لماذا المعرّف هو البصمة؟ لأنّه يجعل منع التكرار **بنيويًّا لا فحصًا قد يُنسى**:
 * الكتابة الثانية على البصمة نفسها تحلّ محلّ الأولى ولا تُنشئ سجلًّا ثانيًا،
 * حتى لو ضُغط الزرّ مرّتين أو تسابق مستخدمان.
 *
 * وهويّة المستورِد تُكتب هنا من الحساب المسجَّل لا من الشيت (قرار المالك
 * 2026-08-16): ما يُملأ باليد يُزوَّر باليد.
 */
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase.js';
import { importSheet } from '../excel/excelImport.js';
import { createDraft } from '../documents/documentsService.js';
import { buildPreview, toDocumentDraft } from './sourceImport.js';

const COL = 'source_imports';
const BATCH_LIMIT = 500;

/** نوع الاستيراد ⟵ ورقة الشيت ومجموعة البيانات. */
const KINDS = {
  receipt: { dataset: 'receipt', sheetName: 'Receipt', labelAr: 'أمر استلام', docType: 'PUTAWAY' },
  delivery: { dataset: 'delivery', sheetName: 'Delivery', labelAr: 'أمر تسليم', docType: 'PICK' },
};

/**
 * الاستيراد فعلٌ حوكميّ — لا يُخترع له دورٌ جديد (قرار المالك). المطابق من
 * الأدوار الستّة عشر القائمة: مدير المستودع ومدقّق الجرد والأدمن.
 * ⚠️ يطابق `isStockActor()` في القواعد **وأضيق منه** عمدًا: القاعدة تحرس
 * الكتابة، وهذه تحرس مَن يُظهر له الزرّ.
 */
export const IMPORT_ROLES = ['admin', 'warehouse_manager', 'inventory_auditor'];

export function canImportSource(role) {
  return IMPORT_ROLES.includes(role);
}

function whoami(profile) {
  return {
    importedByUid: auth?.currentUser?.uid || null,
    importedByName: profile?.name || auth?.currentUser?.email || 'غير معروف',
    importedByRole: profile?.role || '',
  };
}

/** يُنظّف البصمة لتصلح معرّف مستند Firestore. */
function fingerprintId(fp) {
  return String(fp ?? '')
    .replace(/[/.#$[\]]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 400);
}

/**
 * بصمات ما استُورد سابقًا لهذا النوع.
 *
 * ⚠️ حدٌّ مُعلَن: تُقرأ المجموعة كلّها لهذا النوع. مقبولٌ ما دامت بحجم
 * مستنداتِ أشهر؛ ويوم تكبر يُضاف حصرٌ بالتاريخ أو فهرسٌ مركّب.
 */
export async function fetchKnownFingerprints(kind) {
  const snap = await getDocs(query(collection(db, COL), where('kind', '==', kind)));
  return new Set(snap.docs.map((d) => d.data()?.fingerprint).filter(Boolean));
}

/**
 * يقرأ الملفّ ويبني المعاينة — **بلا أيّ كتابة**.
 * الفصل مقصود: المستخدم يرى ما سيحدث قبل أن يحدث.
 */
export async function analyzeSourceFile(file, kind) {
  const cfg = KINDS[kind];
  if (!cfg) throw new Error(`نوع استيراد غير معروف: ${kind}`);

  const result = await importSheet(file, cfg.dataset, { sheetName: cfg.sheetName });
  const known = await fetchKnownFingerprints(kind);
  const preview = buildPreview(result, known, kind);

  return {
    ...preview,
    kind,
    labelAr: cfg.labelAr,
    docType: cfg.docType,
    fileName: file?.name || '',
    sheetName: result?.summary?.sheetName || cfg.sheetName,
  };
}

/**
 * يعتمد المعاينة: يُنشئ مسودّة مستندٍ لكلّ مستندٍ مستورد، ثمّ يختم بصمات
 * سطوره حتى لا تُستورد ثانيةً.
 *
 * الترتيب مقصود: **المستند أوّلًا ثمّ البصمة**. لو انعكس وفشل إنشاء المستند
 * لبقيت البصمة مختومةً فتعذّر إعادة الاستيراد إلى الأبد — بضاعةٌ وصلت ولا
 * سبيل لتسجيلها.
 *
 * @returns {{created:Array<{docRef:string, documentId:string, lines:number}>}}
 */
export async function commitSourceImport(preview, profile) {
  if (!preview?.ok) {
    throw new Error('لا يُعتمد استيرادٌ فيه أخطاء أو تعارض رأس — صحّح المعلَّم أوّلًا.');
  }
  const stamp = whoami(profile);
  const created = [];

  for (const docItem of preview.documents) {
    const draft = toDocumentDraft(docItem, { type: preview.kind });
    const documentId = await createDraft({
      type: draft.type,
      profile,
      header: draft.header,
      lines: draft.lines,
    });
    created.push({ docRef: docItem.docRef, documentId, lines: docItem.lines.length });

    // ختم البصمات بعد نجاح الإنشاء وحده.
    const lines = docItem.lines.filter((l) => String(l.fingerprint ?? '').trim());
    for (let i = 0; i < lines.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const line of lines.slice(i, i + BATCH_LIMIT)) {
        batch.set(doc(db, COL, fingerprintId(line.fingerprint)), {
          fingerprint: line.fingerprint,
          kind: preview.kind,
          docRef: docItem.docRef,
          lineId: String(line.lineId ?? ''),
          sourceUpdatedAt: String(docItem.sourceUpdatedAt ?? ''),
          sourceSystem: String(docItem.sourceSystem ?? ''),
          sku: String(line.sku ?? ''),
          batch: String(line.batch ?? ''),
          qty: Number(line.qty) || 0,
          // الكمّيّة الأصليّة قبل التحرير — بها يُحسب الانحراف عن المصدر.
          ...(Object.hasOwn(line, '_originalQty') ? { sourceQty: Number(line._originalQty) || 0 } : {}),
          documentId,
          documentType: draft.type,
          fileName: preview.fileName || '',
          importedAt: serverTimestamp(),
          ...stamp,
        });
      }
      await batch.commit();
    }
  }

  return { created, documents: created.length };
}
