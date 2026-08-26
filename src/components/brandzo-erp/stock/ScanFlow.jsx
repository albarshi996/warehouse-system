/**
 * العمليات المخزنية — شاشةٌ واحدة: امسح فتُعبَّأ، وجدولك تحت يدك (SAP-19).
 *
 * ═══ منطق التنفيذ (تصحيح 2026-08-13 بعد ملاحظة المالك) ═══
 * لا صفحةَ فوق صفحة: **شاشةٌ واحدة ومصدرُ حقيقةٍ واحد.**
 *   · المسح ثلاث خطوات: الوضع ⇒ المسح ⇒ خانة التعبئة ⇒ حفظ.
 *   · الجدول يُشتقّ من قيود العملية السحابيّة الملحقة-فقط مباشرةً — فجهازان
 *     على العمليّة نفسها يريان جدولًا واحدًا حيًّا بلا منطق توفيقٍ خاصّ
 *     (هذا ما احتاج في الأداة القديمة مئات الأسطر).
 *   · **ولا رصيد ولا فرق في هذه الشاشة** (CAP-101 · تحليل المالك 2026-08-23):
 *     الالتقاط لا يُحاسِب. والماستر يأتي لاسمٍ وهويّةٍ وقاعدةِ عملٍ لا لرصيد.
 *     والحساب كلّه لطبقة المطابقة — `docs/خطة-طبقة-الالتقاط.md`.
 *   · التصحيح والحذف **قيودُ فرقٍ** لا تعديل — التاريخ كامل: من عدّ ومن
 *     صحّح وبكم (نفس مبدأ دفتر الحركات).
 *
 * ═══ ولماذا لا تتجمّد؟ ═══
 * القديم فكّ الباركود على المعالج إطارًا إطارًا. هنا `BarcodeDetector`
 * العتاديّ (فحصٌ كلّ ٣٠٠م.ث) ولا فكّ برمجيّ — ومن لا دعم عنده (آيفون)
 * يمسح بلوحة المفاتيح أو يكتب.
 *
 * كلّ الحكم في `scanFlow.js` الخالص المُختبَر؛ هذه الشاشة عرضٌ له.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { lookupByBarcode, subscribeItems } from '../../../services/items/itemService.js';
import { registerPending } from '../../../services/items/pendingService.js';
import { buildItemIndexes } from '../../../services/items/uomWiring.js';
import { uomLabel } from '../../../services/items/uomModel.js';
import {
  createOperation,
  findOperationsByCode,
  setOperationCode,
  appendScan,
  closeOperation,
  getOperation,
  listenScans,
  updateOperationSummary,
} from '../../../services/stock/operationsService.js';
import {
  SCAN_MODES,
  panelForScan,
  resolveScanUom,
  barcodeCandidates,
  scanUomChoices,
  baseQtyPreview,
  scanEntryVerdict,
  sessionSummary,
  correctionEntry,
  exportRows,
  buildSessionRows,
  sessionProgress,
  filterRows,
  parseBulkBarcodes,
} from '../../../services/stock/scanFlow.js';
import { fiveStepItemSearch } from '../../../services/partners/itemPartnerCatalog.js';
import {
  formatOperationCode,
  isValidOperationCode,
  normalizeOperationCode,
  resolveOperationByCode,
} from '../../../services/stock/operationCode.js';
import {
  normalizeScope,
  scopeChoices,
  scopeLabel,
  scopeOf,
} from '../../../services/stock/operationScope.js';
import { fetchLocationsOnce } from '../../../services/locations/locationsService.js';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import Icon from '../../ui/Icon.jsx';
import Pager from '../../odoo/Pager.jsx';
import { pageSlice } from '../../../services/ui/pagination.js';
import { int, num } from '../../odoo/format.js';

const PAGE_SIZE = 50;

const OP_KEY = 'bzCloudOpId'; // مفتاح استئنافٍ واحد للجهاز — عمليةٌ واحدة لا تنقسم

export default function ScanFlow() {
  const [me, setMe] = useState(null);
  const [mode, setMode] = useState('');
  const [opId, setOpId] = useState(null);
  const [scans, setScans] = useState([]);
  const [items, setItems] = useState([]);
  const [panel, setPanel] = useState(null); // خانة التعبئة بعد المسح
  const [panelItem, setPanelItem] = useState(null);
  const [panelUom, setPanelUom] = useState(''); // الوحدة التي اختارها العادّ (CAP-104)
  const [collision, setCollision] = useState(null); // { code, candidates } — تصادمُ باركود (CAP-106)
  const [panelCollision, setPanelCollision] = useState(false);
  const [qty, setQty] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null); // { kind: 'ok'|'err', text }
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraErr, setCameraErr] = useState('');
  const [tableFilter, setTableFilter] = useState('all'); // all | scanned | unscanned | diff | unknown
  const [tableTerm, setTableTerm] = useState('');
  const [page, setPage] = useState(0);
  const [joinCode, setJoinCode] = useState('');
  const [opCode, setOpCode] = useState('');   // الرمز القصير للعملية الجارية
  // ‹CAP-201 · CAP-202› نطاق الجلسة — يُختار قبل أوّل مسحٍ ويُجمَّد بعده.
  const [locations, setLocations] = useState([]);
  const [scopeWh, setScopeWh] = useState('');
  const [scopeZone, setScopeZone] = useState('');
  const [openScope, setOpenScope] = useState(null); // نطاقُ الجلسة المفتوحة كما كُتب
  const [codeBusy, setCodeBusy] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const scanInputRef = useRef(null);
  const qtyInputRef = useRef(null);
  const nameInputRef = useRef(null);
  const videoRef = useRef(null);
  const cameraStopRef = useRef(null);

  const supportsCamera = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      setMe(user ? await fetchUserProfile(user) : null);
    });
    return () => unsub();
  }, []);

  // الماستر السحابيّ — مصدر الاسم والهويّة وقاعدة الجرد. ولا رصيد يُقرأ منه (CAP-101).
  useEffect(() => subscribeItems(setItems, () => setItems([])), []);
  /**
   * ‹CAP-202› شجرة المواقع — منها يُختار النطاق.
   *
   * ★ **قراءةٌ واحدة لا بثٌّ لحظيّ**: بنيةُ المستودع لا تتغيّر أثناء جردٍ
   * جارٍ، وبانيةُ المواقع تولّد آلافَ الرفوف — فاشتراكٌ حيٌّ عليها يبثّ
   * آلافَ المستندات إلى هاتف العادّ ويُعيد الرسم كلّما مسّها أحد. والعدّ
   * أَولى بالشبكة من شجرةٍ ساكنة.
   *
   * وتعذّرُ القراءة لا يعطّل الجرد: تبقى القائمة فارغةً والجلسة تُفتح بلا
   * نطاق (ق-٣).
   */
  useEffect(() => {
    let alive = true;
    fetchLocationsOnce()
      .then((rows) => { if (alive) setLocations(rows); })
      .catch(() => { if (alive) setLocations([]); });
    return () => { alive = false; };
  }, []);
  const itemIndexes = useMemo(() => buildItemIndexes(items), [items]);

  /** ‹CAP-202› خيارات النطاق من الشجرة — والحساب في المنطق الخالص لا هنا. */
  const choices = useMemo(() => scopeChoices(locations, { warehouse: scopeWh }), [locations, scopeWh]);
  /** النطاق المعروض: المكتوب على الجلسة إن فُتحت، وإلّا ما يختاره الآن. */
  const shownScope = useMemo(
    () => (opId ? openScope || normalizeScope({}) : normalizeScope({ warehouse: scopeWh, zone: scopeZone })),
    [opId, openScope, scopeWh, scopeZone]
  );

  /**
   * رابط الدعوة: `?op=H4K9TM` — الطريق الذي يسلكه عضو اللجنة.
   *
   * يسبق استئناف المحفوظ عمدًا: من يفتح دعوةً جديدة يقصدها هو، لا الجلسةَ
   * التي كان فيها أمس. وبعد الدخول يُنظَّف المعامل من شريط العنوان كي لا
   * تُعيده كلّ إعادة تحميلٍ إلى جلسةٍ تركها بقصد.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const invited = new URLSearchParams(window.location.search).get('op');
    if (!invited || !isValidOperationCode(invited)) return;
    let alive = true;
    findOperationsByCode(invited)
      .then((found) => {
        if (!alive) return;
        const verdict = resolveOperationByCode(found);
        if (verdict.ok) {
          enterOperation(verdict.operation);
        } else if (verdict.reason === 'closed') {
          flash('err', `دعوةٌ إلى جلسةٍ أُقفلت (${formatOperationCode(invited)}).`);
        } else if (verdict.reason === 'ambiguous') {
          flash('err', `جلستان مفتوحتان بالرمز ${formatOperationCode(invited)} — راجع المدير.`);
        } else {
          flash('err', `لا جلسة بالرمز ${formatOperationCode(invited)}.`);
        }
        const url = new URL(window.location.href);
        url.searchParams.delete('op');
        window.history.replaceState({}, '', url);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // استئناف عمليةٍ مفتوحة محفوظة — العمل الواحد لا ينقسم بين عمليتين.
  useEffect(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(OP_KEY) : null;
    if (!saved) return;
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('op')) return;
    getOperation(saved)
      .then((op) => {
        if (op && op.status === 'open') {
          setOpId(saved);
          setOpCode(op.code || '');
          if (op.type) setMode(op.type);
          setOpenScope(scopeOf(op)); // متسامحٌ مع جلسةٍ فُتحت قبل ‹CAP-201›
        } else {
          localStorage.removeItem(OP_KEY);
        }
      })
      .catch(() => {});
  }, []);

  // قيود العملية الحيّة — الجدول كلّه يُشتقّ منها، فكلّ جهازٍ يرى عمل البقيّة.
  useEffect(() => {
    if (!opId) {
      setScans([]);
      return undefined;
    }
    return listenScans(opId, setScans);
  }, [opId]);

  // إيقاف الكاميرا عند مغادرة الصفحة — لا تسريب تدفّق فيديو.
  useEffect(() => () => cameraStopRef.current?.(), []);

  const summary = useMemo(() => sessionSummary(scans), [scans]);

  // فهرسٌ واحد يعرف الباركودات **والأكواد** — فقيد تصحيحٍ كُتب بكود الصنف
  // (لصنفٍ بلا باركود) يعود لصفّ صاحبه لا لصفٍّ مجهولٍ جديد.
  const lookupMap = useMemo(() => {
    const m = new Map(itemIndexes.byBarcode);
    for (const [sku, it] of itemIndexes.bySku) if (!m.has(sku)) m.set(sku, it);
    return m;
  }, [itemIndexes]);

  // قاعدة الجرد من الماستر (تكامل الأداة القديمة): في الجرد يظهر ما لم
  // يُمسح بعد أيضًا — وفي الاستلام/الصرف الممسوح وحده.
  const withBaseline = mode === 'جرد';
  const rows = useMemo(
    () => buildSessionRows(scans, items, lookupMap, { withBaseline }),
    [scans, items, lookupMap, withBaseline]
  );
  const progress = useMemo(() => sessionProgress(rows), [rows]);
  // وحدات هذا الصنف ومعاينة الأساس — الحكم في النواة، والشاشة تعرضه (CAP-104).
  const uomChoices = useMemo(() => scanUomChoices(panelItem), [panelItem]);
  const basePreview = useMemo(() => baseQtyPreview(panelItem, qty, panelUom), [panelItem, qty, panelUom]);
  const filteredRows = useMemo(
    () => filterRows(rows, { tab: tableFilter, term: tableTerm }),
    [rows, tableFilter, tableTerm]
  );
  useEffect(() => setPage(0), [tableFilter, tableTerm, mode]);
  const pageRows = useMemo(() => pageSlice(filteredRows, page, PAGE_SIZE), [filteredRows, page]);

  const tabs = useMemo(() => {
    const t = [{ id: 'all', label: `الكلّ (${int(rows.length)})` }];
    if (withBaseline) {
      t.push(
        { id: 'scanned', label: `تمّ المسح (${int(progress.scanned)})` },
        { id: 'unscanned', label: `لم يُمسح (${int(progress.remaining)})` }
      );
    }
    // لا تبويب «فروقات» (CAP-101): الفرق حكمُ طبقة المطابقة لا شاشة العدّ.
    t.push({ id: 'unknown', label: `غير معرّف (${int(progress.unknown)})` });
    // ما يُحسم في المراجعة قبل الختم (ق-٢ · CAP-105) — يظهر حين يوجد فقط.
    if (progress.needsUom) t.push({ id: 'needsUom', label: `بلا وحدة (${int(progress.needsUom)})` });
    return t;
  }, [rows.length, progress, withBaseline]);

  function flash(kind, text) {
    setNote({ kind, text });
    setTimeout(() => setNote(null), 3500);
  }

  async function ensureOperation(forMode) {
    if (opId) return opId;
    // ‹CAP-201› النطاق يُكتب مع الرأس ويُجمَّد: جلسةٌ بدأ عدُّها لا يتغيّر
    // نطاقُها تحت العادّين، وإلّا صار الكشف يدّعي تغطيةَ ما لم يُعدّ.
    const { id, code, scope } = await createOperation({
      type: forMode,
      profile: me,
      warehouse: scopeWh,
      zone: scopeZone,
    });
    localStorage.setItem(OP_KEY, id);
    setOpId(id);
    setOpCode(code || '');
    setOpenScope(scope);
    // الملاحظات تُعرض في بطاقة النطاق نفسها — ولا تُطلق تنبيهًا أحمر: ما أُسقط
    // إعلانٌ لا خطأ، وإنذارٌ أحمر وسط عدٍّ جارٍ يُقلق بلا سبب.
    return id;
  }

  /**
   * المسح اكتمل (كاميرا أو لوحة مفاتيح أو كتابة): يستبين الصنف ويفتح خانة
   * التعبئة. الاستبانة بترتيب البحث الخماسيّ (SR-49): باركود/كود من
   * السحابة، وإن لم يُجب فبحثٌ محلّيّ بالاسم وجزئه — فكتابة «شامبو» تكفي
   * (تكامل «الإضافة اليدويّة» القديمة بلا نموذجٍ منفصل).
   */
  async function handleCode(raw) {
    const code = String(raw ?? '').trim();
    if (!code) return;
    if (!mode) {
      flash('err', 'اختر الوضع أوّلًا: جرد أو استلام أو صرف.');
      return;
    }
    // ★ التصادم يُكشف **قبل** أيّ حسم (CAP-106): باركودٌ يطابق أكثر من صنف
    //   يُعرض خيارًا، ولا يُختار عن العادّ أوّلُ مطابقةٍ صامتةً.
    const candidates = barcodeCandidates(code, items);
    if (candidates.length > 1) {
      setCollision({ code, candidates });
      setPanel(null);
      setPanelItem(null);
      if (scanInputRef.current) scanInputRef.current.value = '';
      return;
    }

    let item = null;
    try {
      item = await lookupByBarcode(code);
    } catch {
      // شبكة/صلاحية — نجرّب المحلّيّ ثم نُكمل كمجهول، ولا نوقف العمل.
    }
    if (!item && items.length) {
      item = fiveStepItemSearch(code, { items })?.item || null;
    }
    openPanel(code, item, false);
  }

  /** يفتح خانة التعبئة على صنفٍ محسوم — مسارٌ واحد للمسح ولفصل التصادم. */
  function openPanel(code, item, fromCollision) {
    // الاستبانة بالاسم تفتح الخانة بباركود الصنف الحقيقيّ لا بالنصّ المكتوب.
    const panelCode = item && !/^\d/.test(code) ? (item.barcodes?.[0] || item.sku) : code;
    const built = panelForScan(panelCode, item);
    setCollision(null);
    setPanel(built);
    setPanelItem(item);
    setPanelUom(built.unit); // الوحدة المحلولة من الباركود هي المقترحة
    setPanelCollision(Boolean(fromCollision));
    setQty('');
    setNewName('');
    if (scanInputRef.current) scanInputRef.current.value = '';
    // التركيز حيث الفراغ: المعروف ينقص كمّيّته، والمجهول ينقص اسمه.
    setTimeout(() => (item ? qtyInputRef.current : nameInputRef.current)?.focus(), 50);
  }

  /** لصق باركودات دفعةً (تكامل الأداة القديمة): كلّ باركودٍ قيدُ كمّيّةٍ ١. */
  async function applyBulk() {
    const { codes, count } = parseBulkBarcodes(bulkText);
    if (!count) {
      flash('err', 'لا باركود في اللصق.');
      return;
    }
    if (!mode) {
      flash('err', 'اختر الوضع أوّلًا.');
      return;
    }
    setBusy(true);
    try {
      const id = await ensureOperation(mode);
      let saved = 0;
      for (const code of codes) {
        const item = lookupMap.get(code) || null;
        const name = item ? [item.nameAr, item.shade].filter(Boolean).join(' — ') : '';
        // اللصق يمرّ بالوحدة نفسها التي يمرّ بها المسح (CAP-103): باركود
        // كرتونٍ ملصوقٌ يعني كرتونًا، ولو كُتب قيدُه بلا وحدةٍ لصار قطعةً.
        const { unit, factor } = resolveScanUom(code, item);
        await appendScan(id, {
          barcode: code,
          sku: item ? String(item.sku ?? '').trim() : '',
          name,
          qty: 1,
          uom: unit,
          factor,
          baseQty: factor === null ? null : factor, // الكمّيّة ١، فالأساس هو المعامل
          uomMissing: Boolean(item) && !unit,
          opType: mode,
          profile: me,
        });
        saved += 1;
      }
      setBulkText('');
      setBulkOpen(false);
      flash('ok', `أُلصق ${int(saved)} قيدًا — كلٌّ بكمّيّة ١، والتكرار تراكم.`);
    } catch (e) {
      flash('err', e?.message ?? 'توقّف اللصق — ما حُفظ حُفظ، أعد لصق الباقي.');
    } finally {
      setBusy(false);
    }
  }

  /** حفظ القيد: الحكم في scanFlow، والكتابة قيدُ appendScan الملحق-فقط نفسه. */
  async function save() {
    if (!panel || busy) return;
    const verdict = scanEntryVerdict({
      mode,
      barcode: panel.barcode,
      qty,
      name: newName,
      item: panelItem,
      uom: panelUom,
      collision: panelCollision,
    });
    if (!verdict.ok) {
      flash('err', verdict.problems.join(' · '));
      return;
    }
    setBusy(true);
    try {
      const id = await ensureOperation(mode);
      await appendScan(id, { ...verdict.entry, profile: me });
      // المجهول يدخل قائمة الاعتماد القائمة (I-د) باسمه الذي سمّاه الموظّف.
      if (!panelItem) {
        registerPending(
          { barcode: panel.barcode, name: verdict.entry.name, qty: verdict.entry.qty, operationType: mode },
          me
        ).catch(() => {});
      }
      const s = sessionSummary([...scans, verdict.entry]);
      updateOperationSummary(id, { itemCount: s.itemCount, scannedCount: s.scanCount }).catch(() => {});
      // التأكيد يقول ما حُفظ بوحدته وما يعادله بالأساس — فيُكشف الخطأ فورًا.
      const e = verdict.entry;
      const unit = e.uom ? ` ${uomLabel(e.uom)}` : '';
      const equiv =
        e.baseQty != null && e.uom && e.uom !== panel.baseUom
          ? ` (= ${num(e.baseQty)} ${uomLabel(panel.baseUom)})`
          : '';
      flash('ok', `حُفظ: ${e.name} × ${num(e.qty)}${unit}${equiv}`);
      setPanel(null);
      setPanelItem(null);
      setPanelUom('');
      setPanelCollision(false);
      setQty('');
      setNewName('');
      setTimeout(() => scanInputRef.current?.focus(), 50);
    } catch (e) {
      flash('err', e?.message ?? 'تعذّر الحفظ — أعد المحاولة، لا يضيع مسحٌ محفوظ.');
    } finally {
      setBusy(false);
    }
  }

  /** تصحيح كمّيّة صفّ (أو حذفه بكمّيّة ٠): قيدُ فرقٍ في الدفتر لا تعديل. */
  async function correctRow(row, targetQty) {
    const verdict = correctionEntry(row, targetQty, mode || 'جرد');
    if (!verdict.ok) {
      flash('err', verdict.problems.join(' · '));
      return;
    }
    try {
      const id = await ensureOperation(mode || 'جرد');
      await appendScan(id, { ...verdict.entry, profile: me });
      flash('ok', `صُحّح ${row.name || row.barcode}: قيد فرق ${num(verdict.entry.qty)}`);
    } catch (e) {
      flash('err', e?.message ?? 'تعذّر التصحيح');
    }
  }

  function askCorrection(row) {
    // التصحيح يُقال بوحدة الأساس — فتُسمّى في السؤال، لا يُترك رقمٌ بلا وحدة.
    const unit = row.baseUom ? ` ${uomLabel(row.baseUom)}` : '';
    const raw = window.prompt(
      `الكمّيّة الصحيحة لـ«${row.name || row.barcode}»؟ (المعدود الآن ${num(row.countedQty)}${unit})`,
      String(row.countedQty)
    );
    if (raw === null) return;
    correctRow(row, raw);
  }

  function askRemoval(row) {
    const unit = row.baseUom ? ` ${uomLabel(row.baseUom)}` : '';
    if (!window.confirm(`حذف «${row.name || row.barcode}» من الجلسة؟ يُكتب قيدُ عكسٍ (−${num(row.countedQty)}${unit}) ويبقى الأثر.`)) return;
    correctRow(row, 0);
  }

  /** تصدير إكسل — نفس أنماط الأداة القديمة: التبويب الظاهر هو المُصدَّر. */
  async function exportExcel() {
    if (!filteredRows.length) return;
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(exportRows(filteredRows));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الجلسة');
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Stock_${mode || 'Session'}_${tableFilter}_${stamp}.xlsx`);
  }

  /** الانضمام لعمليةٍ قائمة برمزها — العمل الجماعيّ: دفترٌ واحد لكلّ الأجهزة. */
  /** يفتح عمليةً بعد التثبّت منها — مسارٌ واحدٌ للرمز القصير وللمعرّف القديم. */
  function enterOperation(op) {
    localStorage.setItem(OP_KEY, op.id);
    setOpId(op.id);
    setOpCode(op.code || '');
    if (op.type) setMode(op.type);
    // المنضمُّ يرى نطاقَ الجلسة كما كُتب — لا نطاقَ اختاره هو.
    setOpenScope(scopeOf(op));
    setJoinCode('');
    flash('ok', 'انضممت — الجدول أدناه دفتر العملية المشترك.');
  }

  async function joinByCode() {
    const typed = joinCode.trim();
    if (!typed) return;
    try {
      // المسار الأوّل: رمزٌ قصيرٌ من ستّة محارف — وهو ما تُملى به اللجان.
      if (isValidOperationCode(typed)) {
        const verdict = resolveOperationByCode(await findOperationsByCode(typed));
        if (verdict.ok) {
          enterOperation(verdict.operation);
          return;
        }
        if (verdict.reason === 'closed') {
          flash('err', `الرمز ${formatOperationCode(typed)} صحيح، لكنّ عمليّته أُقفلت.`);
          return;
        }
        if (verdict.reason === 'ambiguous') {
          flash('err', `عمليّتان مفتوحتان بالرمز ${formatOperationCode(typed)} — راجع المدير قبل المسح.`);
          return;
        }
      }
      // والثاني: معرّف Firestore الخام — تبقى العمليّات المفتوحة قبل الرموز صالحة.
      const op = await getOperation(typed);
      if (!op || op.status !== 'open') {
        flash('err', 'لا عملية مفتوحة بهذا الرمز.');
        return;
      }
      enterOperation({ ...op, id: typed });
    } catch (e) {
      flash('err', e?.message ?? 'تعذّر الانضمام');
    }
  }

  /** رابط الدعوة الكامل — ما يُلصق في مجموعة اللجنة. */
  const inviteLink = useMemo(() => {
    if (typeof window === 'undefined' || !opCode) return '';
    return `${window.location.origin}${window.location.pathname}?op=${normalizeOperationCode(opCode)}`;
  }, [opCode]);

  /**
   * يفتح الجلسة بقرارٍ صريح من المدير — لا بأوّل مسح.
   * فالدعوة تُرسل **قبل** أن يُعدّ أحدٌ شيئًا، وهذا ترتيب العمل الحقيقيّ:
   * يُفتح الجرد، ويُرسل الرابط، ثمّ تبدأ اللجنة.
   */
  async function openSession() {
    if (!mode) {
      flash('err', 'اختر نوع الجلسة أوّلًا: جرد أو استلام أو صرف.');
      return;
    }
    setBusy(true);
    try {
      await ensureOperation(mode);
      flash('ok', 'فُتحت الجلسة — أرسل رابط الدعوة للجنة.');
    } catch (e) {
      flash('err', e?.message ?? 'تعذّر فتح الجلسة');
    } finally {
      setBusy(false);
    }
  }

  /** نسخُ رابط الدعوة — سطرٌ واحدٌ يُلصق في مجموعة اللجنة. */
  async function copyInvite() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      flash('ok', 'نُسخ رابط الدعوة — ألصقه للجنة.');
    } catch {
      flash('err', `تعذّر النسخ — الرابط: ${inviteLink}`);
    }
  }

  /** نسخُ الرمز إلى الحافظة — ليُرسل في مجموعة اللجنة بلا إملاء. */
  async function copyOpCode() {
    const shown = formatOperationCode(opCode) || opId;
    try {
      await navigator.clipboard.writeText(shown);
      flash('ok', `نُسخ الرمز ${shown}`);
    } catch {
      flash('err', `تعذّر النسخ — الرمز: ${shown}`);
    }
  }

  /**
   * تغيير الرمز — للمديرين بحكم قاعدة `operations`. ومَن دونهم يرتدّ طلبُه
   * من الخادم، فتُقال العلّة صراحةً بدل رسالة Firebase المبهمة.
   */
  async function editOpCode() {
    if (!opId) return;
    const raw = window.prompt(
      'رمز العملية الجديد — ستّة محارف (بلا I و L و O و U):',
      normalizeOperationCode(opCode)
    );
    if (raw === null) return;
    const next = normalizeOperationCode(raw);
    if (!isValidOperationCode(next)) {
      flash('err', 'الرمز ستّة محارف من الأرقام والحروف — بلا I و L و O و U.');
      return;
    }
    setCodeBusy(true);
    try {
      const clash = (await findOperationsByCode(next)).filter((o) => o.status === 'open' && o.id !== opId);
      if (clash.length) {
        flash('err', `الرمز ${formatOperationCode(next)} مستعمَلٌ في عمليةٍ مفتوحة — اختر غيره.`);
        return;
      }
      await setOperationCode(opId, next);
      setOpCode(next);
      flash('ok', `صار رمز العملية ${formatOperationCode(next)}`);
    } catch (e) {
      const denied = String(e?.code || e?.message || '').includes('permission-denied');
      flash('err', denied ? 'تغيير الرمز للمديرين وحدهم.' : e?.message ?? 'تعذّر تغيير الرمز');
    } finally {
      setCodeBusy(false);
    }
  }

  async function finishOperation() {
    if (!opId) return;
    const ok = window.confirm(`إنهاء العملية؟ (${int(summary.scanCount)} قيدًا · ${int(summary.itemCount)} صنفًا)`);
    if (!ok) return;
    try {
      await closeOperation(opId);
      localStorage.removeItem(OP_KEY);
      setOpId(null);
      setPanel(null);
      flash('ok', 'أُقفلت العملية — عملٌ جديد يبدأ عمليةً جديدة.');
    } catch (e) {
      flash('err', e?.message ?? 'تعذّر الإقفال');
    }
  }

  /** كاميرا عتاديّة فقط — فحصٌ كلّ ٣٠٠م.ث، ولا فكّ على المعالج (سبب تجمّد القديم). */
  async function startCamera() {
    setCameraErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      setCameraOn(true);
      await new Promise((r) => setTimeout(r, 60));
      const video = videoRef.current;
      if (!video) throw new Error('تعذّر فتح العرض');
      video.srcObject = stream;
      await video.play();
      const detector = new window.BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'],
      });
      const timer = setInterval(async () => {
        try {
          const found = await detector.detect(video);
          if (found?.length) {
            const value = found[0].rawValue;
            stop();
            handleCode(value);
          }
        } catch {
          /* إطارٌ لم يكتمل — نحاول في النبضة التالية */
        }
      }, 300);
      const stop = () => {
        clearInterval(timer);
        stream.getTracks().forEach((t) => t.stop());
        setCameraOn(false);
        cameraStopRef.current = null;
      };
      cameraStopRef.current = stop;
    } catch (e) {
      setCameraOn(false);
      setCameraErr(
        e?.name === 'NotAllowedError'
          ? 'أذن الكاميرا مرفوض — فعّله من إعدادات المتصفّح، أو امسح بلوحة المفاتيح.'
          : 'تعذّر فتح الكاميرا — امسح بلوحة المفاتيح أو اكتب الباركود.'
      );
    }
  }

  return (
    <div className="o_theme" dir="rtl" style={{ maxWidth: '760px', margin: '0 auto' }}>
      {note && <div className={`o_alert ${note.kind === 'err' ? 'danger' : 'success'}`}>{note.text}</div>}

      {/* ١ — الوضع */}
      <p style={{ margin: '0 0 8px', fontSize: 'var(--o-font-size-sm)', color: 'var(--o-main-color-muted)' }}>
        ١ — اختر الوضع:
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
        {SCAN_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={mode === m.id ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '14px 8px', minHeight: '76px' }}
            title={m.hint}
          >
            <Icon name={m.icon} size={22} />
            <span style={{ fontWeight: 'var(--o-font-weight-bold)' }}>{m.label}</span>
          </button>
        ))}
      </div>

      {/*
        ١ب — النطاق ‹CAP-201 · CAP-202›: يُطلب ويُقترح ولا يُلزم (ق-٣).

        ★ ولا يُعرض إلّا حين يكون فيه اختيارٌ فعليّ: بلا مواقعَ معرَّفةٍ لا
        منسدلةَ تُملأ، وبطاقةٌ تشغل ثلث الشاشة لتقول «لا مواقع» **تعقيدٌ بلا
        مقابل** — والمسار المطلوب خمس خطوات: دخول ⇐ قراءة ⇐ عدّ ⇐ تأكيد ⇐ حفظ.
        فتظهر حين توجد مواقع، أو حين يكون للجلسة نطاقٌ فعليٌّ يُذكَر.
      */}
      {(locations.length > 0 || shownScope.declared) && (
        <>
          <p style={{ margin: '0 0 8px', fontSize: 'var(--o-font-size-sm)', color: 'var(--o-main-color-muted)' }}>
            ١ب — أين تعدّ؟ <span style={{ opacity: 0.75 }}>(اختياريّ — والجلسة تُفتح بدونه)</span>
          </p>
          <div className="o_ds_card o_ds_pad" style={{ marginBottom: '16px' }}>
            {opId ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <Icon name="mapPin" size={16} />
                <span style={{ fontWeight: 'var(--o-font-weight-bold)' }}>{scopeLabel(shownScope)}</span>
                {shownScope.declared && (
                  <span style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
                    — يُجمَّد عند فتح الجلسة، فلا يتغيّر تحت العادّين.
                  </span>
                )}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                <label style={{ display: 'block' }}>
                  <span style={{ display: 'block', fontSize: '11px', fontWeight: 'var(--o-font-weight-bold)', marginBottom: '4px' }}>المستودع</span>
                  <select
                    className="o_input"
                    value={scopeWh}
                    onChange={(e) => { setScopeWh(e.target.value); setScopeZone(''); }}
                    style={{ width: '100%' }}
                  >
                    <option value="">— كلّ المستودعات —</option>
                    {choices.warehouses.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                  </select>
                </label>
                <label style={{ display: 'block' }}>
                  <span style={{ display: 'block', fontSize: '11px', fontWeight: 'var(--o-font-weight-bold)', marginBottom: '4px' }}>المنطقة</span>
                  <select
                    className="o_input"
                    value={scopeZone}
                    onChange={(e) => setScopeZone(e.target.value)}
                    disabled={!scopeWh}
                    style={{ width: '100%' }}
                  >
                    <option value="">{scopeWh ? '— المستودع كلّه —' : '— اختر المستودع أوّلًا —'}</option>
                    {choices.zones.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
                  </select>
                </label>
              </div>
            )}
            {/* ما أُسقط من مُدخَلٍ يُقال — أمّا «بلا نطاق» فحالٌ لا عيب، ووسمُها
                موضعُه الكشفُ المختوم لا شاشةُ العدّ (‹CAP-204›). */}
            {(shownScope.notes || []).map((n, i) => (
              <p key={i} style={{ margin: '8px 0 0', fontSize: '11px', color: 'var(--o-main-color-muted)', lineHeight: 1.7 }}>{n}</p>
            ))}
          </div>
        </>
      )}

      {/* ٢ — المسح */}
      {/*
        رمز العملية — مفتاح دخول اللجنة.
        كان يُعرض معرّف Firestore الخام في حاشيةٍ بحجم عشر نقاط: عشرون محرفًا
        عشوائيًّا حسّاسًا لحالة الأحرف، لا يُملى صوتًا ولا يُكتب على هاتف. فصار
        رمزًا من ستّة محارف في بطاقةٍ تُرى، يُنسخ بزرّ ويُغيّره المدير.
      */}
      {opId && (
        <div className="o_ds_card o_ds_pad" style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 'var(--o-font-weight-bold)' }}>الجلسة مفتوحة</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={copyInvite} data-op-invite disabled={!inviteLink}>
              نسخ رابط الدعوة
            </button>
            <a
              className="btn btn-secondary btn-sm"
              href={inviteLink ? `https://wa.me/?text=${encodeURIComponent(`دعوة لجلسة ${mode || 'جرد'} — افتح الرابط وادخل بحسابك:
${inviteLink}`)}` : undefined}
              target="_blank"
              rel="noopener noreferrer"
              data-op-whatsapp
              style={inviteLink ? undefined : { pointerEvents: 'none', opacity: 0.5 }}
            >
              إرسال بواتساب
            </a>
            <span style={{ fontSize: '11px', color: 'var(--o-main-color-muted)' }}>
              يفتحه العضو ويدخل بحسابه — فيجد نفسه داخل الجلسة مباشرةً.
            </span>
          </div>
          <span style={{ fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
            وللإملاء صوتًا — الرمز:
          </span>
          <strong
            data-op-code
            style={{
              fontFamily: 'monospace', direction: 'ltr', fontSize: '20px',
              letterSpacing: '2px', padding: '2px 10px', borderRadius: '6px',
              background: 'var(--o-gray-100, #f1f1f1)',
            }}
          >
            {formatOperationCode(opCode) || '—'}
          </strong>
          <button type="button" className="btn btn-secondary btn-sm" onClick={copyOpCode} data-op-copy>
            نسخ
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={editOpCode} disabled={codeBusy} data-op-edit>
            تغيير الرمز
          </button>
          {!opCode && (
            <span style={{ fontSize: '11px', color: 'var(--o-main-color-muted)' }}>
              عمليةٌ فُتحت قبل الرموز — اضغط «تغيير الرمز» لتُعطيها واحدًا.
            </span>
          )}
        </div>
      )}

      <p style={{ margin: '0 0 8px', fontSize: 'var(--o-font-size-sm)', color: 'var(--o-main-color-muted)' }}>
        ٢ — امسح الباركود أو اكتبه ثم Enter:
      </p>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        <input
          ref={scanInputRef}
          type="text"
          inputMode="text"
          enterKeyHint="go"
          autoComplete="off"
          placeholder="الباركود…"
          aria-label="حقل المسح"
          className="o_input"
          disabled={!mode}
          style={{ flex: 1, fontSize: '18px', padding: '12px', direction: 'ltr', textAlign: 'center', fontFamily: 'monospace' }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleCode(e.currentTarget.value);
            }
          }}
        />
        {supportsCamera && !cameraOn && (
          <button type="button" className="btn btn-secondary" onClick={startCamera} disabled={!mode} title="مسح بالكاميرا">
            <Icon name="target" size={20} />
          </button>
        )}
      </div>
      {!mode && (
        <p style={{ margin: '0 0 8px', fontSize: '11px', color: 'var(--o-main-color-muted)' }}>اختر الوضع أوّلًا ليُفتح المسح.</p>
      )}
      {!supportsCamera && (
        <p style={{ margin: '0 0 8px', fontSize: '11px', color: 'var(--o-main-color-muted)' }}>
          على آيفون: اضغط داخل الحقل واستخدم زرّ مسح النصوص في لوحة المفاتيح — يكتب الباركود مباشرةً.
        </p>
      )}
      {cameraErr && <p style={{ margin: '0 0 8px', fontSize: '11px', color: 'var(--o-text-warning, #8a6d1b)' }}>{cameraErr}</p>}

      {cameraOn && (
        <div style={{ position: 'relative', marginBottom: '12px', borderRadius: 'var(--o-border-radius-lg)', overflow: 'hidden', border: '1px solid var(--o-border-color)' }}>
          <video ref={videoRef} playsInline muted style={{ width: '100%', maxHeight: '260px', objectFit: 'cover', display: 'block' }} />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => cameraStopRef.current?.()}
            style={{ position: 'absolute', top: '8px', insetInlineEnd: '8px' }}
          >
            <Icon name="close" size={14} /> إيقاف
          </button>
        </div>
      )}

      {/* ٣أ — تصادمُ باركود: الشاشة تسأل ولا تختار (CAP-106) */}
      {collision && (
        <div className="o_ds_card o_ds_pad" style={{ marginBottom: '14px', borderInlineStart: '4px solid var(--o-text-warning, #8a6d1b)' }}>
          <p style={{ margin: '0 0 4px', fontSize: '11px', color: 'var(--o-main-color-muted)' }}>
            باركودٌ واحد، أكثرُ من صنف
            <span style={{ marginInlineStart: '8px', fontFamily: 'monospace', direction: 'ltr', display: 'inline-block' }}>{collision.code}</span>
          </p>
          <p style={{ margin: '0 0 10px', fontSize: 'var(--o-font-size-sm)', fontWeight: 'var(--o-font-weight-bold)' }}>
            أيُّهما على الرفّ أمامك؟ — لن يُختار عنك.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {collision.candidates.map((it) => (
              <button
                key={it.sku}
                type="button"
                className="btn btn-secondary"
                onClick={() => openPanel(collision.code, it, true)}
                style={{ textAlign: 'right', padding: '10px 12px' }}
              >
                <span style={{ fontWeight: 'var(--o-font-weight-bold)' }}>
                  {[it.nameAr, it.shade].filter(Boolean).join(' — ') || it.sku}
                </span>
                <span style={{ marginInlineStart: '8px', fontFamily: 'monospace', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
                  {it.sku}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-link btn-sm"
            onClick={() => { setCollision(null); setTimeout(() => scanInputRef.current?.focus(), 50); }}
            style={{ marginTop: '6px', padding: 0 }}
          >
            إلغاء هذا المسح
          </button>
        </div>
      )}

      {/* ٣ — خانة التعبئة */}
      {panel && (
        <div className="o_ds_card o_ds_pad" style={{ marginBottom: '14px', borderInlineStart: '4px solid var(--o-brand-primary, #714B67)' }}>
          <p style={{ margin: '0 0 4px', fontSize: '11px', color: 'var(--o-main-color-muted)' }}>
            ٣ — خانة التعبئة
            <span style={{ marginInlineStart: '8px', fontFamily: 'monospace', direction: 'ltr', display: 'inline-block' }}>{panel.barcode}</span>
          </p>

          {panel.known ? (
            <p style={{ margin: '0 0 10px', fontSize: '17px', fontWeight: 'var(--o-font-weight-bold)' }}>
              {panel.name}
              <span style={{ marginInlineStart: '8px', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)', fontFamily: 'monospace' }}>
                {panel.sku}
              </span>
            </p>
          ) : (
            <>
              <p style={{ margin: '0 0 6px', fontSize: 'var(--o-font-size-sm)', color: 'var(--o-text-warning, #8a6d1b)', fontWeight: 'var(--o-font-weight-bold)' }}>
                غير معرّف في الماستر — سمِّه ليُحفظ ويُعرض على المدير للاعتماد:
              </p>
              <input
                ref={nameInputRef}
                type="text"
                className="o_input"
                placeholder="اسم الصنف…"
                aria-label="اسم الصنف الجديد"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{ marginBottom: '10px', fontSize: '16px', padding: '10px' }}
              />
            </>
          )}

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              ref={qtyInputRef}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              className="o_input"
              placeholder="الكمّيّة"
              aria-label="الكمّيّة"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  save();
                }
              }}
              style={{ flex: 1, fontSize: '20px', padding: '12px', textAlign: 'center' }}
            />
            {/* الوحدة تُختار من وحدات الصنف وحدها — لا خانةَ نصّ (CAP-104) */}
            {uomChoices.length > 1 ? (
              <select
                className="o_input"
                aria-label="وحدة العدّ"
                value={panelUom}
                onChange={(e) => setPanelUom(e.target.value)}
                style={{ fontSize: 'var(--o-font-size-sm)', padding: '10px', maxWidth: '46%' }}
              >
                {uomChoices.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : (
              panel.unitLabel && (
                <span style={{ fontSize: 'var(--o-font-size-sm)', color: 'var(--o-main-color-muted)', whiteSpace: 'nowrap' }}>
                  {panel.unitLabel}
                </span>
              )
            )}
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy} style={{ padding: '12px 22px', fontSize: '16px' }}>
              {busy ? 'جارٍ…' : 'حفظ'}
            </button>
          </div>

          {/* أثرُ الوحدة يُرى قبل الحفظ لا بعده (CAP-104) */}
          {basePreview && (
            <p style={{ margin: '6px 0 0', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
              {basePreview}
            </p>
          )}

          <button
            type="button"
            className="btn btn-link btn-sm"
            onClick={() => { setPanel(null); setPanelItem(null); setPanelUom(''); setPanelCollision(false); setTimeout(() => scanInputRef.current?.focus(), 50); }}
            style={{ marginTop: '6px', padding: 0 }}
          >
            إلغاء هذا المسح
          </button>
        </div>
      )}

      {/* لصق باركودات دفعةً — تكامل الأداة القديمة */}
      {mode && (
        <div style={{ marginBottom: '12px' }}>
          {!bulkOpen ? (
            <button type="button" className="btn btn-link btn-sm" style={{ padding: 0 }} onClick={() => setBulkOpen(true)}>
              <Icon name="paperclip" size={13} /> لصق باركودات دفعةً…
            </button>
          ) : (
            <div className="o_ds_card o_ds_pad">
              <p style={{ margin: '0 0 6px', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
                ألصق الباركودات (سطرًا سطرًا أو بفواصل) — كلّ باركودٍ قيدُ كمّيّةٍ ١، والتكرار يتراكم:
              </p>
              <textarea
                className="o_input"
                rows={4}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                style={{ width: '100%', direction: 'ltr', fontFamily: 'monospace', marginBottom: '8px' }}
                aria-label="لصق باركودات"
              />
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={applyBulk} disabled={busy || !bulkText.trim()}>
                  {busy ? 'جارٍ…' : `معالجة (${int(parseBulkBarcodes(bulkText).count)})`}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setBulkOpen(false); setBulkText(''); }}>
                  إلغاء
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* جدول الجلسة — مشتقٌّ من دفتر العملية الملحق-فقط، حيًّا لكلّ الأجهزة.
          وفي الجرد: قاعدة الماستر كاملةً — ما مُسح وما لم يُمسح بعد. */}
      {(opId || withBaseline) ? (
        <div className="o_ds_card o_ds_pad" style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            <p style={{ margin: 0, fontSize: 'var(--o-font-size-sm)', fontWeight: 'var(--o-font-weight-bold)' }}>
              {withBaseline
                ? `الجرد — ${int(progress.scanned)} من ${int(progress.total)} (${int(progress.pct)}٪) · متبقٍّ ${int(progress.remaining)}`
                : `الجلسة الجارية — ${int(summary.scanCount)} قيدًا · إجمالي ${num(summary.totalQty)}`}
            </p>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={exportExcel} disabled={!filteredRows.length}>
                <Icon name="fileUp" size={14} /> تصدير إكسل
              </button>
              {opId && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={finishOperation}>
                  <Icon name="checkCircle" size={14} /> إنهاء العملية
                </button>
              )}
            </div>
          </div>

          {/* شريط الإنجاز — نفس أرقام رأس الأداة القديمة */}
          {withBaseline && progress.total > 0 && (
            <div style={{ height: '6px', borderRadius: '999px', background: 'var(--o-chip, #f4f4f6)', marginBottom: '10px', overflow: 'hidden' }}>
              <div style={{ width: `${progress.pct}%`, height: '100%', background: 'var(--o-brand-primary, #714B67)', transition: 'width .3s' }} />
            </div>
          )}

          {/* تبويبات الجدول + البحث — كما في الأداة القديمة */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px', alignItems: 'center' }}>
            {tabs.map((f) => (
              <button
                key={f.id}
                type="button"
                className={tableFilter === f.id ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                onClick={() => setTableFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
            <input
              type="search"
              className="o_input"
              placeholder="بحث بالباركود أو الاسم أو الكود…"
              aria-label="بحث في الجدول"
              value={tableTerm}
              onChange={(e) => setTableTerm(e.target.value)}
              style={{ flex: 1, minWidth: '180px', fontSize: 'var(--o-font-size-xs)', padding: '6px 10px' }}
            />
          </div>

          {filteredRows.length === 0 ? (
            <p style={{ margin: 0, fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
              {rows.length === 0 ? 'لا صفوف بعد — امسح أوّل باركود.' : 'لا نتائج في هذا التبويب/البحث.'}
            </p>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--o-font-size-xs)' }}>
                  <thead>
                    <tr style={{ textAlign: 'right', color: 'var(--o-main-color-muted)' }}>
                      <th style={{ padding: '4px 6px' }}>الصنف</th>
                      <th style={{ padding: '4px 6px' }}>المعدود</th>
                      <th style={{ padding: '4px 6px' }}>الوحدة</th>
                      <th style={{ padding: '4px 6px' }}>القيود</th>
                      <th style={{ padding: '4px 6px' }} aria-label="إجراءات" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => (
                      <tr key={`${r.sku}|${r.barcode}`} style={{ borderTop: '1px solid var(--o-border-color, #e5e5ea)', opacity: r.known && !r.scanned ? 0.65 : 1 }}>
                        <td style={{ padding: '6px' }}>
                          <div style={{ fontWeight: 'var(--o-font-weight-bold)' }}>
                            {r.name || '—'}
                            {!r.known && (
                              <span style={{ marginInlineStart: '6px', fontSize: '10px', color: 'var(--o-text-warning, #8a6d1b)' }}>
                                بانتظار الاعتماد
                              </span>
                            )}
                            {r.known && !r.scanned && (
                              <span style={{ marginInlineStart: '6px', fontSize: '10px', color: 'var(--o-main-color-muted)' }}>
                                لم يُمسح
                              </span>
                            )}
                          </div>
                          <div style={{ fontFamily: 'monospace', direction: 'ltr', textAlign: 'right', color: 'var(--o-main-color-muted)', fontSize: '10px' }}>
                            {r.barcode}
                          </div>
                        </td>
                        <td style={{ padding: '6px', fontVariantNumeric: 'tabular-nums', fontWeight: 'var(--o-font-weight-bold)' }}>
                          {r.scanned ? num(r.countedQty) : '—'}
                          {r.uncertain && (
                            <span
                              title="فيه قيدٌ بوحدةٍ لم يُعرَّف معاملها — المجموع بوحدة الأساس غير مضمون"
                              style={{ marginInlineStart: '4px', fontSize: '10px', color: 'var(--o-text-warning, #8a6d1b)' }}
                            >
                              غير مضمون
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '6px', color: 'var(--o-main-color-muted)' }}>
                          {r.baseUom ? (
                            uomLabel(r.baseUom)
                          ) : (
                            <span
                              title="بلا وحدة أساس — عُدّ وحُفظ، ويُحسم في المراجعة قبل الختم (ق-٢)"
                              style={{ color: 'var(--o-text-warning, #8a6d1b)' }}
                            >
                              بلا وحدة
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '6px', fontVariantNumeric: 'tabular-nums', color: 'var(--o-main-color-muted)' }}>
                          {r.scanned ? int(r.scanCount) : '—'}
                        </td>
                        <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>
                          {r.scanned ? (
                            <>
                              <button type="button" className="btn btn-link btn-sm" style={{ padding: '2px 6px' }} onClick={() => askCorrection(r)}>
                                تصحيح
                              </button>
                              <button type="button" className="btn btn-link btn-sm" style={{ padding: '2px 6px' }} onClick={() => askRemoval(r)}>
                                حذف
                              </button>
                            </>
                          ) : (
                            <button type="button" className="btn btn-link btn-sm" style={{ padding: '2px 6px' }} onClick={() => handleCode(r.barcode)}>
                              عدّ الآن
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredRows.length > PAGE_SIZE && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <Pager total={filteredRows.length} page={page} size={PAGE_SIZE} onPage={setPage} />
                </div>
              )}
            </>
          )}
          <p style={{ margin: '8px 0 0', fontSize: '10px', color: 'var(--o-main-color-muted)' }}>
            هذه الشاشة تلتقط ما على الرفّ ولا تُحاسِب — لا رصيد ولا فرق · التصحيح والحذف قيودُ فرقٍ تبقى في السجلّ
          </p>
        </div>
      ) : null}

      {/* العمل الجماعيّ: الانضمام لعملية زميلٍ برمزها — يظهر ما دامت لا عملية جارية */}
      {!opId && (
        <div className="o_ds_card o_ds_pad" style={{ marginBottom: '14px' }}>
          <p style={{ margin: '0 0 6px', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
            لا جلسة جارية. <strong>افتح جلسةً</strong> ثمّ أرسل رابطها للجنة — أو انضمّ إلى جلسةِ زميلٍ برمزها.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={openSession}
            disabled={busy || !mode}
            data-op-open
            style={{ width: '100%', marginBottom: '10px' }}
          >
            {mode ? `افتح جلسة ${mode}` : 'اختر النوع أوّلًا لتفتح جلسة'}
          </button>
          <p style={{ margin: '0 0 6px', fontSize: 'var(--o-font-size-xs)', color: 'var(--o-main-color-muted)' }}>
            أو ادخل بالرمز إن أُملي عليك (ستّة محارف مثل H4K-9TM):
          </p>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              type="text"
              className="o_input"
              placeholder="H4K-9TM"
              aria-label="رمز العملية"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              style={{ flex: 1, direction: 'ltr', textAlign: 'center', fontFamily: 'monospace' }}
            />
            <button type="button" className="btn btn-secondary btn-sm" onClick={joinByCode} disabled={!joinCode.trim()}>
              انضمام
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
