/**
 * محرّك المستندات — الشاشة الواحدة التي تخدم كل النماذج.
 *
 * لا يعرف هذا الملف شيئًا عن «الاستلام» ولا عن «تصريح البوابة»: يقرأ المخطّط
 * ويرسمه. إضافة نموذج جديد = ملف مخطّط، لا شاشة جديدة (ROADMAP §11.2).
 *
 * دورة الحياة:
 *   ?type=GRN            ← مستند جديد، يعيش محليًّا حتى أول حفظ
 *   ?type=GRN&id=abc123  ← مستند قائم، يُتابَع لحظيًّا
 *
 * لماذا لا يُنشَأ المستند في السحابة فور فتح الصفحة؟ لأن كل فتحة صفحة كانت
 * ستُخلّف مسودّة فارغة. المستند يولد عند أول حفظ حقيقي.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeAuth, fetchUserProfile, getBasePath } from '../../../services/auth/authService.js';
import { getSchema } from '../../../services/documents/schemas/index.js';
import {
  createDraft,
  saveDocument,
  transitionDocument,
  listenDocument,
  listenAudit,
} from '../../../services/documents/documentsService.js';
import { listenAttachments } from '../../../services/documents/attachmentsService.js';
import { listenReconciliations } from '../../../services/documents/controlService.js';
import { emptyDocument, emptyChecklist, missingRequired, isEmptyLine, applyItemToLine } from '../../../services/documents/schemaUtils.js';
import { mergeParentLink } from '../../../services/documents/chain.js';
import { lookupByBarcode, getItem, subscribeItems } from '../../../services/itemService.js';
import { canonicalLineSku } from '../../../services/items/itemIdentity.js';
import { lookupItemByPartnerCode } from '../../../services/partners/itemPartnerCatalogService.js';
import {
  buildItemIndexes,
  itemForLine,
  refreshLineBase,
  stampPartnerUom,
  unitForBarcode,
  defaultUomFor,
  uomOptionsForLine,
} from '../../../services/items/uomWiring.js';
import { uomLabel } from '../../../services/items/uomModel.js';
import { isEditable } from '../../../services/documents/states.js';
import FieldInput from './FieldInput.jsx';
import { listenSettings } from '../../../services/settings/settingsService.js';
import { evaluateHeaderDates } from '../../../services/documents/datingGuard.js';
import { itemTypeMap, documentItemProblems, OWNERSHIP_DOC_TYPES } from '../../../services/items/itemType.js';
import { listenPriceLists } from '../../../services/pricing/priceListService.js';
import { listForCustomer, priceDocument } from '../../../services/pricing/priceListModel.js';
import { subscribePartners } from '../../../services/partnerService.js';
import { subscribeWarehouses } from '../../../services/warehouseService.js';
import { listenVehicles } from '../../../services/vehicles/vehiclesService.js';
import { listUsers } from '../../../services/auth/usersService.js';
import { listenPartnerLedger } from '../../../services/ledger/partnerLedgerService.js';
import { creditCheck } from '../../../services/ledger/creditGuard.js';
import { documentScreenUrl } from '../../../services/documentNavigator.js';
import { approvalAuditCount } from '../../DocumentNavigatorModel.js';
import InlineCreateModal from './InlineCreateModal.jsx';
import LineItemsTable from './LineItemsTable.jsx';
import Checklist from './Checklist.jsx';
import StateBar from './StateBar.jsx';
import AuditTrail from './AuditTrail.jsx';
import DocumentPrint from './DocumentPrint.jsx';
import ChainBar from './ChainBar.jsx';
import CopyFromPanel from './CopyFromPanel.jsx';
import AttachmentsPanel from './AttachmentsPanel.jsx';
import ControlPanel from './ControlPanel.jsx';
import PromotionsPanel from './PromotionsPanel.jsx';
import DocumentNavigator from './DocumentNavigator.jsx';

/** يقرأ معاملات الرابط (الموقع ثابت — لا توجيه من الخادم). */
function readParams() {
  if (typeof window === 'undefined') return { type: 'GRN', id: null };
  const p = new URLSearchParams(window.location.search);
  return { type: p.get('type') || 'GRN', id: p.get('id') };
}

export default function DocumentEngine() {
  const [{ type, id }, setParams] = useState(readParams);
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [docId, setDocId] = useState(id);
  const [doc, setDoc] = useState(null);
  const [audit, setAudit] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [reconciliations, setReconciliations] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [createFor, setCreateFor] = useState(null); // طلب إنشاء أبٍ مباشر (المرحلة ب٢)
  const [settings, setSettings] = useState(null); // سياسات التشغيل (م١-ج) — تحكم حارس التاريخ
  const [backdateReason, setBackdateReason] = useState(''); // سبب التأريخ للماضي (م٢-ب)
  const [items, setItems] = useState([]); // ماستر الأصناف — لأنواعها (م٣-أ)
  const [priceLists, setPriceLists] = useState([]); // قوائم الأسعار (م٣-ج)
  const [customers, setCustomers] = useState([]); // لربط العميل بقائمته
  const [ledger, setLedger] = useState([]); // سطور دفتر الذمم (م٤-د)

  const schema = useMemo(() => getSchema(type), [type]);

  /**
   * `dirty` في مرجع لا في متغيّر مُلتقَط.
   * السبب: مستمع Firestore يُنشَأ مرّة واحدة، فيلتقط قيمة `dirty` وقت إنشائه
   * ويبقى عليها. لو قرأناها منه مباشرةً لرأى `false` أبدًا، فابتلع أي تحديث
   * قادم من السحابة تعديلاتِ الموظّف وهو يكتب. المرجع يقرأ القيمة الحيّة.
   */
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      setMe(user ? await fetchUserProfile(user) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  // مستند جديد: هيكل فارغ محليًّا. مستند قائم: متابعة لحظيّة.
  useEffect(() => {
    if (!schema) return;
    if (!docId) {
      setDoc({ type: schema.type, state: 'draft', ...emptyDocument(schema) });
      setAttachments([]);
      setReconciliations([]);
      return;
    }
    const unsubDoc = listenDocument(docId, (d) => {
      if (!d) return;
      setDoc((prev) => {
        // لا نسحب البساط من تحت من يكتب الآن.
        if (dirtyRef.current && prev) return prev;
        // مستندات قديمة قد تسبق إضافة قائمة الفحص — نملأ الناقص لا نُسقطه.
        return { ...d, header: { _checklist: emptyChecklist(schema), ...d.header } };
      });
    });
    const unsubAudit = listenAudit(docId, setAudit);
    const unsubAtt = listenAttachments(docId, setAttachments);
    const unsubCtrl = schema.control ? listenReconciliations(docId, setReconciliations) : null;
    return () => {
      unsubDoc();
      unsubAudit();
      unsubAtt();
      if (unsubCtrl) unsubCtrl();
    };
  }, [docId, schema]);

  // سياسات التشغيل حيّةً: تغييرُ المالك للمدى يسري هنا بلا إعادة تحميل.
  useEffect(() => listenSettings(setSettings), []);

  // ماستر الأصناف: منه تُقرأ الأنواع (م٣-أ). وفشلُ القراءة يعني قائمةً فارغة
  // ⇒ خريطةً معدومة ⇒ **سلوك اليوم**: لا نمنع بندًا لأنّنا عجزنا عن معرفة نوعه.
  useEffect(() => subscribeItems(setItems, () => setItems([])), []);

  // قوائم الأسعار والعملاء (م٣-ج). الفشل ⇒ قائمةٌ فارغة ⇒ **لا قائمة** ⇒
  // الكتابة اليدوية كما كانت. التدرّج نفسه: لا تعطيل بسبب غياب بيانات.
  useEffect(() => listenPriceLists(setPriceLists), []);
  useEffect(() => subscribePartners('customer', setCustomers, () => setCustomers([])), []);

  // قوائم حقول الطرف (SAP-20 · طلب المالك): المورد والمخزن والمركبة والمندوب
  // تُختار من قوائم النظام لا كتابةً حرّة. الفشل (كقارئ المندوبين المحصور
  // بالمديرَين) ⇒ قائمةٌ فارغة ⇒ الحقل نصٌّ حرّ كسلوك اليوم — لا تعطيل.
  const [suppliers, setSuppliers] = useState([]);
  const [warehousesList, setWarehousesList] = useState([]);
  const [vehiclesList, setVehiclesList] = useState([]);
  const [repsList, setRepsList] = useState([]);
  useEffect(() => subscribePartners('supplier', setSuppliers, () => setSuppliers([])), []);
  useEffect(() => subscribeWarehouses(setWarehousesList, () => setWarehousesList([])), []);
  useEffect(() => listenVehicles(setVehiclesList), []);
  useEffect(() => {
    listUsers().then(setRepsList).catch(() => setRepsList([]));
  }, []);
  const partyLists = useMemo(
    () => ({ suppliers, customers, warehouses: warehousesList, reps: repsList, vehicles: vehiclesList }),
    [suppliers, customers, warehousesList, repsList, vehiclesList]
  );

  // دفتر الذمم (م٤-د): منه الرصيد الحقيقيّ. والفشل ⇒ سطورٌ فارغة ⇒ رصيدُ صفرٍ
  // ⇒ **لا منع** — نظامٌ يمنع بيعًا لأنّه يجهل رصيدًا يوقف تجارةً بلا سبب.
  useEffect(() => listenPartnerLedger('', setLedger, () => setLedger([])), []);

  const flash = useCallback((text, tone = 'ok') => {
    setMsg({ text, tone });
    setTimeout(() => setMsg(null), 4000);
  }, []);

  const editable = isEditable(doc?.state) && (!docId || doc?.createdByUid === me?.uid || me?.role === 'admin');
  const canCreate = me && (me.role === 'admin' || (schema?.roles?.create || []).includes(me.role));
  const violations = useMemo(() => (schema?.warnings && doc ? schema.warnings(doc) : []), [schema, doc]);

  // حكم التاريخ يُحسب مع كلّ ضغطة — فيُرى القيد وهو يقع لا عند الحفظ.
  const dating = useMemo(
    () =>
      schema && doc
        ? evaluateHeaderDates({
            docType: schema.type,
            header: doc.header || {},
            schema,
            settings,
            today: new Date().toISOString().slice(0, 10),
            role: me?.role || '',
          })
        : null,
    [schema, doc, settings, me]
  );

  // حارس أنواع الأصناف (م٣-أ): الداخليّ لا يُباع، والخدمة لا تُحمَّل.
  const itemGuard = useMemo(() => {
    const map = items.length ? itemTypeMap(items) : null;
    return schema && doc
      ? documentItemProblems(schema.type, doc.lines || [], map, settings, me?.role || '')
      : { ok: true, problems: [], warnings: [] };
  }, [schema, doc, items, settings, me]);

  /**
   * التسعير (م٣-ج): يملأ الأسعار الغائبة من قائمة العميل، ويحكم على المكتوبة.
   * لا يعمل إلّا في مستندٍ يُخرج الملكيّة ولعميلٍ له قائمة — وإلّا فالكتابة
   * اليدوية كما كانت. وهذا هو التدرّج الذي يمنع التعطيل.
   */
  const pricing = useMemo(() => {
    const idle = { ok: true, problems: [], warnings: [], lines: null, list: null };
    if (!schema || !doc || !OWNERSHIP_DOC_TYPES.includes(schema.type)) return idle;
    const code = String(doc.header?.customerCode || '').trim().toUpperCase();
    const customer = customers.find((c) => String(c.code || '').toUpperCase() === code) || null;
    const list = listForCustomer(priceLists, customer, doc.header?.saleDate || doc.header?.orderDate || '');
    if (!list) return idle;
    const r = priceDocument({ list, lines: doc.lines || [], settings, role: me?.role || '' });
    return { ...r, list };
  }, [schema, doc, priceLists, customers, settings, me]);

  /**
   * حدّ الائتمان (م٤-د): رصيدٌ حقيقيّ من الدفتر + سقف العميل + سياسة الإعدادات.
   * يُحسب مع كلّ ضغطة فيُرى الحاجز وهو يقترب، لا عند الإرسال فجأةً.
   */
  const credit = useMemo(() => {
    const code = String(doc?.header?.customerCode || doc?.header?.customer || '').trim().toUpperCase();
    const partner = customers.find((c) => String(c.code || '').toUpperCase() === code) || null;
    return creditCheck({ doc, entries: ledger, partner, settings, role: me?.role || '' });
  }, [doc, ledger, customers, settings, me]);

  const navigatorActionCounts = useMemo(() => ({
    relationCount: Object.values(doc?.links || {}).filter((link) => link?.id).length,
    attachmentCount: attachments.length,
    auditCount: audit.length,
    approvalCount: approvalAuditCount(audit),
    stockMoveCount: Number(doc?.postedMoves) || 0,
    financialEntryCount: ledger.filter((entry) => entry.docId === docId).length,
  }), [doc, attachments, audit, ledger, docId]);

  /** يطبّق أسعار القائمة على البنود — بضغطةٍ لا تلقائيًّا، فلا يُدهس ما كُتب. */
  function applyListPrices() {
    if (!pricing.lines) return;
    setDoc((d) => ({ ...d, lines: pricing.lines }));
    setDirty(true);
    flash(`مُلئت الأسعار من قائمة «${pricing.list.name || pricing.list.id}».`);
  }

  function patchHeader(key, value) {
    setDoc((d) => ({ ...d, header: { ...d.header, [key]: value } }));
    setDirty(true);
  }

  /**
   * SAP-3 (ف‑١١ · §10.1 ‹234›): كلّ تعديل بندٍ يُثري السطر بالمعامل
   * والكمّيّة الأساسيّة من `uomWiring` — فالسطر يحفظ الأربعة (كمّيّة ·
   * وحدة · معامل · أساس) ولا يُعاد حسابها يوم الترحيل من تقدير.
   */
  const itemIndexes = useMemo(() => buildItemIndexes(items), [items]);

  function patchLines(lines) {
    const enriched = lines.map((line) => refreshLineBase(line, itemForLine(line, itemIndexes)));
    setDoc((d) => ({ ...d, lines: enriched }));
    setDirty(true);
  }

  /**
   * استدعاء الماستر من بند (I-ب/2): باركود مكتمل ⇒ يتعبّأ الكود والوصف.
   * الفارغ فقط يُملأ — ما كتبه الموظّف بيده لا يُدهس. والمجهول لا يوقف
   * العمل (قرار المالك): تنبيه، ويُكمل البند يدويًّا.
   *
   * SAP-1 (ف‑٤٣): عمود الكود مرجعيٌّ أيضًا — يسأل بالهويّة أولًا (الكود هو
   * الهويّة §9.1) ثم بالباركود احتياطًا، وما استُبين يُثبَّت كوده بصيغة
   * الماستر القانونيّة (itm-1 ⇒ ITM-1) — فهويّة السطر مرجعٌ لا نصّ.
   *
   * SAP-2 (§21-٤): وإن لم يُجب الكود ولا الباركود، يُسأل **كتالوج
   * الطرف‑الصنف** بطرف المستند نفسه — فكود المورّد يعيد الصنف الداخليّ
   * الصحيح ولا يُنشئ صنفًا مكرّرًا (SR-50)، وكود الطرف يبقى على السطر
   * (`partnerItemCode`) عرضًا في مستنده (§10 ‹257›).
   */
  async function handleLineLookup(kind, value, index, columnKey = 'barcode') {
    if (kind !== 'item') return;
    try {
      let item = columnKey === 'sku'
        ? (await getItem(value)) || (await lookupByBarcode(value))
        : await lookupByBarcode(value);
      let viaPartner = null;
      if (!item) {
        const header = doc?.header || {};
        const partner = header.supplierCode
          ? { partnerType: 'supplier', partnerCode: header.supplierCode }
          : header.customerCode
            ? { partnerType: 'customer', partnerCode: header.customerCode }
            : null;
        if (partner) {
          const hit = await lookupItemByPartnerCode({ ...partner, code: value }).catch(() => null);
          if (hit) {
            item = hit.item;
            viaPartner = hit.entry;
          }
        }
      }
      if (!item) {
        flash(
          columnKey === 'sku'
            ? `⚠️ الكود ${value} غير معرّف في الماستر ولا في كتالوج الطرف — أكمل البند يدويًّا وسجِّل الصنف لاحقًا.`
            : `⚠️ الباركود ${value} غير معرّف في الماستر — أكمل البند يدويًّا وسجِّل الصنف لاحقًا.`,
          'err'
        );
        return;
      }
      // SAP-3: باركود الوحدة يحدّد الصنف **والوحدة والمعامل** معًا (§10.1 ‹238›).
      const unitFromBarcode = columnKey === 'sku' ? '' : unitForBarcode(item, value);
      setDoc((d) => {
        const current = d.lines?.[index];
        if (!current) return d;
        const { line } = applyItemToLine(current, item);
        let next = { ...line, sku: canonicalLineSku(line, item) };
        // كود الطرف يظهر في مستنده بينما يبقى التخزين على الهويّة الداخليّة.
        if (viaPartner) {
          next.partnerItemCode = viaPartner.partnerItemCode;
          next = stampPartnerUom(next, viaPartner); // تعبئة هذا المورّد لا غيره (§10 ‹256›)
        }
        if (unitFromBarcode) next.uom = unitFromBarcode;
        // وحدةٌ فارغة تأخذ افتراض عائلة المستند: شراءً بوحدة الشراء وبيعًا بوحدة البيع (ف‑٩).
        if (!String(next.uom ?? '').trim()) next.uom = defaultUomFor(item, type);
        next = refreshLineBase(next, item); // السطر يحفظ المعامل والأساس (§10.1 ‹234›)
        const lines = d.lines.map((l, i) => (i === index ? next : l));
        return { ...d, lines };
      });
      setDirty(true);
      flash(viaPartner
        ? `☁️ ${item.nameAr} — استُبين من كود الطرف ${viaPartner.partnerItemCode} (التخزين على ${item.sku}).`
        : unitFromBarcode
          ? `☁️ ${item.nameAr} — باركود وحدة: ${uomLabel(unitFromBarcode)}.`
          : `☁️ ${item.nameAr} — استُدعي من الماستر.`);
    } catch {
      // شبكة/صلاحية — لا نعطّل الإدخال اليدوي.
      flash('تعذّر سؤال الماستر — أكمل يدويًّا.', 'err');
    }
  }

  function patchChecklist(next) {
    setDoc((d) => ({ ...d, header: { ...d.header, _checklist: next } }));
    setDirty(true);
  }

  /**
   * تعرّف تلقائيّ على أبٍ برقمه (حقل docref): يثبّت الرقم الرسميّ في الحقل
   * ويربط الأب تراكميًّا في `links` — فتعمل المطابقة الثلاثية وشريط السلسلة
   * كأنّه اشتقاق. الأثر يُختم في التدقيق عند أوّل حفظ (saveDocument يكتب links).
   */
  function resolveParent(field, parentDoc) {
    setDoc((d) => ({
      ...d,
      header: { ...d.header, [field.key]: parentDoc.number || '' },
      links: mergeParentLink(d.links, parentDoc),
    }));
    setDirty(true);
    flash(`🔗 رُبِط بـ${parentDoc.type} ${parentDoc.number || ''} — تعمل المطابقة والسلسلة الآن.`);
  }

  /** طلب إنشاء الأب المفقود مباشرةً (المرحلة ب٢) — يفتح المعالج المصغّر. */
  function requestCreateParent(field, typedNumber) {
    setCreateFor({ field, parentType: field.docType, suggestedNumber: typedNumber });
  }

  /** نتيجة الإنشاء المباشر: إن أخذ الأب رقمًا شرعيًّا رُبِط فورًا. */
  function onParentCreated(parentDoc, warnMsg) {
    setCreateFor(null);
    if (parentDoc?.number) {
      resolveParent(createFor.field, parentDoc);
    } else {
      flash(warnMsg || `أُنشئ ${parentDoc?.type || ''} كمسودّة — يحتاج تقديمًا ثم ربطًا.`, 'err');
    }
  }

  /** يحفظ ويُعيد معرّف المستند (يُنشئه إن كان جديدًا). */
  async function persist() {
    const lines = (doc.lines || []).filter((l) => !isEmptyLine(l));
    const payload = { header: doc.header, lines: lines.length ? lines : doc.lines.slice(0, 1) };

    if (!docId) {
      const newId = await createDraft({ type: schema.type, stage: schema.stage, profile: me, ...payload });
      setDocId(newId);
      setParams((p) => ({ ...p, id: newId }));
      // نُثبّت المعرّف في الرابط ليصمد التحديث ويصير قابلًا للمشاركة.
      const url = new URL(window.location.href);
      url.searchParams.set('id', newId);
      window.history.replaceState({}, '', url);
      return newId;
    }
    await saveDocument(docId, { ...payload, settings, reason: backdateReason, profile: me });
    return docId;
  }

  /**
   * يضمن وجود مستندٍ محفوظ ليُرفق عليه دليلٌ أو تُسجَّل مطابقة. المستند الجديد
   * يولد عند أوّل فعلٍ حقيقيّ (إرفاق دليل فعلٌ حقيقيّ لا فتحةُ صفحة) — فتظهر
   * أزرار الإرفاق دائمًا وتحفظ المسودّة تلقائيًّا عند أوّل استخدام. يُعيد المعرّف.
   */
  async function ensureSaved() {
    if (docId) return docId;
    const id = await persist();
    setDirty(false);
    flash('حُفظت المسودّة تلقائيًّا.');
    return id;
  }

  async function handleSave() {
    setSaving(true);
    try {
      await persist();
      setDirty(false);
      flash('حُفظت المسودّة.');
    } catch (e) {
      flash(e.message || 'تعذّر الحفظ.', 'err');
    } finally {
      setSaving(false);
    }
  }

  async function handleTransition(to, note) {
    setSaving(true);
    try {
      if (to === 'submitted') {
        const missing = missingRequired(schema, doc);
        if (missing.length) {
          flash(`أكمل الحقول الإلزامية: ${missing.join(' · ')}`, 'err');
          return;
        }
        // نوع الصنف يُفحص عند الإرسال لا عند القيد: المنعُ بعد أن تتحرّك
        // البضاعة تصحيحٌ متأخّر، والمنعُ قبلها حراسة.
        if (!itemGuard.ok) {
          flash(itemGuard.problems.join(' · '), 'err');
          return;
        }
        // سعرٌ يدويٌّ ممنوع لا يُرسَل — والوسم يُكتب حين يُسمح به.
        if (!pricing.ok) {
          flash(pricing.problems.join(' · '), 'err');
          return;
        }
        // حدّ الائتمان (م٤-د): المنع قبل الإرسال — فبعده تصير الذمّة أمرًا واقعًا.
        if (!credit.ok) {
          flash(credit.message, 'err');
          return;
        }
      }
      const targetId = dirty || !docId ? await persist() : docId;
      setDirty(false);
      const number = await transitionDocument(targetId, to, { note, profile: me, schema });
      flash(to === 'submitted' && number ? `أُرسل للاعتماد برقم ${number}` : 'تمّ الإجراء.');
    } catch (e) {
      flash(e.message || 'تعذّر تنفيذ الإجراء.', 'err');
    } finally {
      setSaving(false);
    }
  }

  function navigateToDocument(target = null) {
    if (dirty && !window.confirm('لديك تغييرات غير محفوظة. هل تريد مغادرة المستند دون حفظها؟')) return;
    const url = documentScreenUrl({
      type: schema.type,
      id: target?.id || null,
      base: `${getBasePath()}/dashboard/document`,
    });
    if (url) window.location.assign(url);
  }

  if (!schema) {
    return (
      <Notice tone="err" title="نوع مستند غير معروف">
        لا يوجد مخطّط للنوع «{type}». الأنواع المحكومة اليوم ستة وعشرون: الوارد (PR · PO · GRN · QC · PUTAWAY · SRN) · المبيعات والصرف (SO · PICK · PACK · DN · POD · GP) · الفوترة (INV) · النقل (TR · TRN · TRC) · المرتجعات (RET · CN) · الجرد (CC · ADJ) · التالف (DMG) · والمشتريات الداخلية (IPR · RFQ · IPO · PV · DLV).
      </Notice>
    );
  }
  if (!ready || !doc) return <p className="text-ink-2 text-sm py-10 text-center">جارٍ التحميل…</p>;
  if (!me) return <Notice tone="err" title="🔒 يلزم تسجيل الدخول">افتح المستند بعد الدخول لتُسجَّل هويتك على كل إجراء.</Notice>;
  if (!docId && !canCreate) {
    return (
      <Notice tone="err" title="🚫 غير مصرّح">
        إنشاء «{schema.titleAr}» متاح لأصحاب الأدوار المخوّلة به وحدهم — ودورك الحالي ليس منها.
      </Notice>
    );
  }

  return (
    <>
      <div className="doc-screen space-y-5" dir="rtl">
        {msg && (
          <div
            className={`rounded-xl px-4 py-2.5 text-sm text-center border ${
              msg.tone === 'err'
                ? 'bg-brand-red/10 border-brand-red/40 text-red-200'
                : 'bg-accent/15 border-accent/40 text-accent'
            }`}
          >
            {msg.text}
          </div>
        )}

        <DocumentNavigator
          type={schema.type}
          currentId={docId}
          canCreate={Boolean(canCreate)}
          actionCounts={navigatorActionCounts}
          onNavigate={navigateToDocument}
          onNew={() => navigateToDocument(null)}
        />

        <div id="document-approvals">
          <StateBar
            doc={doc}
            schema={schema}
            me={me}
            saving={saving}
            dirty={dirty}
            onSave={editable ? handleSave : null}
            onTransition={handleTransition}
            onPrint={() => window.print()}
          />
        </div>

        {/* «جلب من مستند سابق» (SAP-5) — على المستند الجديد وحده.
            بعد الحفظ يصير المسار «إنشاء مستند لاحق» من `ChainBar`، فلا
            يُعرض الاثنان معًا ولا يختلط على الموظّف أيّهما يستعمل. */}
        {!docId && (
          <div id="document-copy-from">
            <CopyFromPanel targetType={type} me={me} onFlash={flash} />
          </div>
        )}

        {/* سلسلة الشراء والمطابقة الثلاثية (F2) — تظهر للأنواع المترابطة فقط */}
        <div id="document-relations">
          <ChainBar doc={doc} me={me} onFlash={flash} />
        </div>

        {violations.length > 0 && (
          <div className="bg-brand-red/10 border border-brand-red/40 rounded-xl px-4 py-3">
            <p className="text-sm font-bold text-red-200 mb-1">⚠️ خرق نقطة التحكّم الحرجة CCP1</p>
            {violations.map((v) => (
              <p key={v} className="text-xs text-red-300">
                · {v}
              </p>
            ))}
            <p className="text-[11px] text-red-400/80 mt-1.5">
              الورق كان يكتب هذا الحدّ ولا يفحصه. لا يزال بوسعك الإرسال — والقرار يُوثَّق باسمك.
            </p>
          </div>
        )}

        {!editable && doc.state !== 'draft' && (
          <p className="text-xs text-muted bg-chip border border-line rounded-lg px-3 py-2">
            🔒 المستند خرج من طور التحرير — الحقول للقراءة فقط.
          </p>
        )}

        {/* حدّ الائتمان (م٤-د): مديونيّة العميل تُرى قبل البيع لا بعده. */}
        {editable && credit.verdict !== 'ok' && (
          <div className="rounded-lg border border-line bg-chip px-3 py-2">
            <p className={credit.verdict === 'block' ? 'text-sm text-brand-red' : 'text-sm text-ink'}>
              {credit.message}
              {credit.verdict === 'block' && !credit.canUnlock ? ` — يفكّه ${credit.unlockRole}.` : ''}
              {credit.verdict === 'block' && credit.canUnlock ? ' — لك فكّه، ويُسجَّل باسمك.' : ''}
            </p>
          </div>
        )}

        {/* التسعير (م٣-ج): القائمة السارية وأثرها — والملء بضغطةٍ لا تلقائيًّا. */}
        {editable && pricing.list && (
          <div className="rounded-lg border border-line bg-chip px-3 py-2 space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-ink">
                قائمة الأسعار السارية: <span className="font-bold">{pricing.list.name || pricing.list.id}</span>
              </span>
              <button
                className="rounded-lg px-3 py-1.5 text-xs border border-line text-ink bg-surface"
                onClick={applyListPrices}
              >
                املأ الأسعار من القائمة
              </button>
            </div>
            {pricing.problems.map((p) => <p key={p} className="text-sm text-brand-red">{p}</p>)}
            {pricing.warnings.map((w) => <p key={w} className="text-sm text-ink-2">{w}</p>)}
          </div>
        )}

        {/* حارس أنواع الأصناف (م٣-أ): يُرى قبل الإرسال لا بعد القيد. */}
        {editable && (itemGuard.problems.length > 0 || itemGuard.warnings.length > 0) && (
          <div className="rounded-lg border border-line bg-chip px-3 py-2">
            {itemGuard.problems.map((p) => (
              <p key={p} className="text-sm text-brand-red">{p}</p>
            ))}
            {itemGuard.warnings.map((w) => (
              <p key={w} className="text-sm text-ink">{w}</p>
            ))}
          </div>
        )}

        {/* الوسم دائم (م٢-ب): يرافق المستند ولا يُمحى، فيراه كلّ من يقرؤه. */}
        {doc.dating?.backdated && (
          <p className="text-xs text-ink bg-chip border border-line rounded-lg px-3 py-2">
            <span className="font-bold">مؤرَّخ للماضي</span> — {doc.dating.daysBack} يومًا
            {doc.dating.reason ? ` · السبب: ${doc.dating.reason}` : ''}
            {doc.dating.byName ? ` · بيد: ${doc.dating.byName}` : ''}
          </p>
        )}

        {schema.sections.map((section) => (
          <section key={section.key} className="bg-chip border border-line rounded-2xl p-4 sm:p-5">
            <h2 className="text-base font-bold text-ink mb-3">{section.title}</h2>
            {section.note && section.kind !== 'table' && (
              <p className="text-[11px] text-accent/80 mb-3 leading-relaxed">{section.note}</p>
            )}

            {/* ═══ نزاهة التاريخ (م٢-ب): القيد يُرى وهو يقع لا عند الحفظ ═══ */}
            {section.kind === 'fields' && editable && dating && !dating.ok && (
              <div className="mb-4 rounded-lg border border-line bg-chip p-3">
                {dating.blocked.length > 0 && (
                  <p className="text-sm text-brand-red mb-2">
                    {dating.blocked.map((f) => f.label).join('، ')}: لا واقعة في المستقبل — التاريخ بعد اليوم يُرفض.
                  </p>
                )}
                {dating.needsApproval.length > 0 && (
                  <>
                    <p className="text-sm text-ink mb-1">
                      {dating.needsApproval.map((f) => f.label).join('، ')}: تأريخٌ لما قبل {dating.backdateDays} يومًا.
                      {dating.canApprove ? ' لك اعتماده.' : ` يعتمده ${dating.approver} وحده.`}
                    </p>
                    {dating.requireReason && (
                      <label className="block mt-2">
                        <span className="block text-xs font-bold text-ink-2 mb-1.5">سبب التأريخ للماضي (إلزاميّ — يُوسَم به المستند دائمًا)</span>
                        <input
                          className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink"
                          value={backdateReason}
                          onChange={(e) => setBackdateReason(e.target.value)}
                          placeholder="مثال: وصلت الفاتورة متأخّرة من المورّد"
                        />
                      </label>
                    )}
                  </>
                )}
              </div>
            )}

            {section.kind === 'fields' && (
              <>
                <div
                  className="grid gap-4"
                  style={{ gridTemplateColumns: `repeat(auto-fit, minmax(190px, 1fr))`, maxWidth: `${(section.columns || 3) * 320}px` }}
                >
                  {(section.fields || []).map((f) => (
                    <FieldInput
                      key={f.key}
                      field={f}
                      doc={doc}
                      disabled={!editable}
                      onChange={patchHeader}
                      onResolveParent={resolveParent}
                      onRequestCreate={requestCreateParent}
                      violation={violationFor(f, violations)}
                      partyLists={partyLists}
                    />
                  ))}
                </div>
                {section.extraFields?.length > 0 && (
                  <div className="grid gap-4 mt-4 md:grid-cols-2">
                    {section.extraFields.map((f) => (
                      <FieldInput key={f.key} field={f} doc={doc} disabled={!editable} onChange={patchHeader} onResolveParent={resolveParent} onRequestCreate={requestCreateParent} partyLists={partyLists} />
                    ))}
                  </div>
                )}
              </>
            )}

            {section.kind === 'table' && (
              <LineItemsTable
                schema={schema}
                section={section}
                lines={doc.lines || []}
                disabled={!editable}
                onChange={patchLines}
                onLookup={handleLineLookup}
                uomOptions={(line) => uomOptionsForLine(line, itemForLine(line, itemIndexes))}
              />
            )}

            {section.kind === 'checklist' && (
              <Checklist
                section={section}
                state={doc.header?._checklist}
                disabled={!editable}
                onChange={patchChecklist}
              />
            )}
          </section>
        ))}

        {/* العروض تُطبَّق قبل المرفقات: البنود تُبنى أوّلًا ثمّ يُوثَّق عليها. */}
        <PromotionsPanel schema={schema} doc={doc} disabled={!editable} onApplyLines={patchLines} />

        <div id="document-attachments">
          <AttachmentsPanel docId={docId} schema={schema} me={me} attachments={attachments} onEnsureDoc={ensureSaved} />
        </div>

        {schema.control && (
          <ControlPanel
            docId={docId}
            schema={schema}
            me={me}
            doc={doc}
            attachments={attachments}
            reconciliations={reconciliations}
            onEnsureDoc={ensureSaved}
          />
        )}

        {docId && (
          <section id="document-audit" className="bg-chip border border-line rounded-2xl p-4 sm:p-5">
            <h2 className="text-base font-bold text-ink mb-1">🔏 سجلّ التدقيق</h2>
            <p className="text-[11px] text-gray-500 mb-3">قيود دائمة — لا تُعدَّل ولا تُحذف.</p>
            <AuditTrail entries={audit} />
          </section>
        )}
      </div>

      <DocumentPrint schema={schema} doc={doc} attachments={attachments} reconciliations={reconciliations} basePath={getBasePath()} />

      {createFor && (
        <InlineCreateModal
          parentType={createFor.parentType}
          suggestedNumber={createFor.suggestedNumber}
          profile={me}
          onCreated={onParentCreated}
          onClose={() => setCreateFor(null)}
        />
      )}
    </>
  );
}

/** يربط تحذير CCP1 بحقله ليظهر تحته مباشرة. */
function violationFor(field, violations) {
  if (field.key === 'tempChilled') return violations.find((v) => v.includes('المبردات'));
  if (field.key === 'tempFrozen') return violations.find((v) => v.includes('المجمدات'));
  return null;
}

function Notice({ tone, title, children }) {
  const err = tone === 'err';
  return (
    <div
      dir="rtl"
      className={`rounded-2xl p-6 text-center border ${
        err ? 'bg-brand-red/10 border-brand-red/40 text-red-200' : 'bg-chip border-line text-ink-2'
      }`}
    >
      <p className="font-bold text-lg mb-1">{title}</p>
      <p className="text-sm">{children}</p>
    </div>
  );
}
