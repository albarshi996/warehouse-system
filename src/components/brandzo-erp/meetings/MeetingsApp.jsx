import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMeetingRecorder } from '../MeetingAssistant/useMeetingRecorder.js';
import SEED from '../../../data/meetings-seed.json';
import {
  ORG_DEPARTMENTS,
  ITEM_STATES,
  MEETING_STATES,
  meetingProgress,
  overallSummary,
  newGroupItem,
  groupMinutesVerdict,
  groupAgendaVerdict,
  meetingFromTemplate,
  ORGANIZING_DEPARTMENT,
} from '../../../services/meetings/groupMeetingsModel.js';
import { consolidate } from '../../../services/meetings/meetingsModel.js';
import {
  listenGroupMeetings,
  createGroupMeeting,
  createGroupMeetingFrom,
  saveGroupMeeting,
  issueGroupMinutes,
  signGroupMinutes,
  archiveGroupMeeting,
} from '../../../services/meetings/groupMeetingsService.js';
import {
  groupMinutesHtml,
  slideHtml,
  systemReportHtml,
} from '../../../services/meetings/meetingsView.js';
import { openOverlay, closeOverlay } from '../../../services/ui/overlayHistory.js';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';

/**
 * أداة المحاضر الموحّدة — سطحُ صفحة الاجتماعات الوحيد.
 *
 * كلّ اجتماعٍ يُنشأ **يدويًّا**: عنوان · تاريخ · إدارات/كيانات تُختار بالنقر أو
 * تُكتب حرّةً · بنودٌ تُكتب بخطّ اليد. والاجتماعات السبعة المبذورة صارت
 * **قوالب** يبدأ منها المالك بنقرة (نسخةٌ قابلة للتحرير) بدل أجندةٍ ثابتة
 * تُفرَض عليه. يعيد استعمال محرّك الاجتماعات الجماعية الناضج بلا تكرار:
 * الحالات · التقدّم · إصدار المحضر المرقّم · التسجيل · العرض · التقرير المجمّع.
 */

const WRITER_ROLES = ['admin', 'warehouse_manager'];

/** جذر الأصول العامة — لصور التوقيعات المعتمدة في المحضر والتقرير. */
const ASSET_BASE = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : import.meta.env.BASE_URL + '/';

const fmtTime = (sec) =>
  `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

/** يربط طبقةً تملأ الشاشة بزرّ الرجوع (يُغلقها لا يغادر الصفحة). */
function useBackClose(onClose, name) {
  const cbRef = useRef(onClose);
  useEffect(() => {
    cbRef.current = onClose;
  });
  useEffect(() => {
    const key = openOverlay(() => cbRef.current && cbRef.current(), name);
    return () => {
      closeOverlay(key);
    };
  }, []);
}

/* ─── أيقونات خطّية مصغّرة (بدل الإيموجي) ─── */
function Glyph({ d, fill = false, size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {d}
    </svg>
  );
}
const RecMicGlyph = () => (
  <Glyph d={<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>} />
);
const RecPauseGlyph = () => (
  <Glyph fill d={<><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>} />
);
const RecPlayGlyph = () => <Glyph fill d={<path d="M8 5v14l11-7z" />} />;

/* ═══════════════ الحاوية ═══════════════ */

export default function MeetingsApp() {
  const [profile, setProfile] = useState(null);
  const [canWrite, setCanWrite] = useState(false);
  const [meetings, setMeetings] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [localDraft, setLocalDraft] = useState(null);
  const [creating, setCreating] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 4200);
  }, []);

  useEffect(() => {
    const unsubAuth = subscribeAuth(async (user) => {
      const p = user ? await fetchUserProfile(user) : null;
      setProfile(p);
      setCanWrite(Boolean(p) && WRITER_ROLES.includes(p.role));
    });
    const unsubM = listenGroupMeetings((list) => {
      setMeetings(list);
      setLoading(false);
    });
    return () => {
      unsubAuth();
      unsubM();
    };
  }, []);

  const selected =
    meetings.find((m) => m.id === selectedId) ||
    (localDraft && localDraft.id === selectedId ? localDraft : null);

  const openDraft = (draft, msg) => {
    setLocalDraft(draft);
    setSelectedId(draft.id);
    setCreating(false);
    if (msg) showToast(msg);
  };

  const handleCreate = async (fields) => {
    if (!canWrite) return;
    try {
      const draft = await createGroupMeeting(fields, profile);
      openDraft(draft, `أُنشئ الاجتماع «${draft.title || 'بلا عنوان'}»`);
    } catch (e) {
      showToast('تعذّر الإنشاء: ' + e.message);
    }
  };

  const handleTemplate = async (seed) => {
    if (!canWrite) return;
    try {
      const built = meetingFromTemplate(seed);
      const draft = await createGroupMeetingFrom(built, profile);
      openDraft(draft, `أُنشئ اجتماعٌ من قالب «${seed.dept}» — عدّله كما تشاء`);
    } catch (e) {
      showToast('تعذّر الإنشاء: ' + e.message);
    }
  };

  // ── الغرفة مفتوحة ──
  if (selected) {
    return (
      <>
        <MeetingRoom
          key={selected.id}
          meeting={selected}
          canWrite={canWrite}
          profile={profile}
          showToast={showToast}
          onBack={() => {
            setSelectedId(null);
            setLocalDraft(null);
          }}
        />
        <Toast msg={toastMsg} />
      </>
    );
  }

  // ── القائمة ──
  const active = meetings.filter((m) => !m.archived);
  const s = overallSummary(active);

  return (
    <div className="gm-wrap">
      {/* رأس + مؤشّرات */}
      <div className="mt-hero no-present">
        <div className="mt-hero-in">
          <div>
            <h2>الاجتماعات ومحاضرها</h2>
            <p>
              أنشئ اجتماعًا، اختر الإدارات أو الأطراف بنفسك، واكتب بنوده بخطّ يدك —
              ثمّ اخرج بمحضرٍ رسميٍّ مرقَّم. أو ابدأ من قالبٍ جاهز وعدّله كما تشاء.
            </p>
          </div>
          <div className="mt-kpis">
            <div className="mt-kpi"><span className="n">{active.length}</span><span className="l">اجتماعًا</span></div>
            <div className="mt-kpi"><span className="n">{s.signed}</span><span className="l">موقّع</span></div>
            <div className="mt-kpi"><span className="n">{s.agreed}</span><span className="l">قرارًا</span></div>
            <div className="mt-kpi"><span className="n">{s.pending}</span><span className="l">لم يُحسم</span></div>
            {s.escalate > 0 && (
              <div className="mt-kpi alert"><span className="n">{s.escalate}</span><span className="l">للتصعيد</span></div>
            )}
          </div>
        </div>
        {canWrite && (
          <div className="mt-hero-actions">
            <button className="kbtn b-accent" onClick={() => setCreating(true)}>＋ اجتماع جديد</button>
            <button className="kbtn b-ghost" onClick={() => setReporting(true)}>التقرير المجمّع</button>
          </div>
        )}
      </div>

      {/* قوالب جاهزة */}
      {canWrite && (
        <div className="kcard no-present">
          <div className="kchead"><h3>ابدأ من قالب جاهز</h3>
            <span className="kchead-hint">قوالب اجتماعاتك التحضيرية السبعة — تُنسَخ نقطةَ بدايةٍ قابلة للتحرير الكامل</span></div>
          <div className="kcbody">
            <div className="chips">
              {SEED.meetings.map((seed) => (
                <button key={seed.id} type="button" className="chip tpl" onClick={() => handleTemplate(seed)}
                  title={`ابدأ اجتماعًا من قالب: ${seed.dept}`}>
                  {seed.dept}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* قائمة الاجتماعات */}
      <div className="kcard no-present">
        <div className="kchead">
          <h3>اجتماعاتك</h3>
          {canWrite && (
            <button className="kbtn b-accent sm" onClick={() => setCreating(true)}>＋ اجتماع جديد</button>
          )}
        </div>
        <div className="kcbody">
          {loading && <div className="kempty">جارٍ تحميل الاجتماعات…</div>}
          {!loading && active.length === 0 && (
            <div className="kempty">
              لا اجتماعات بعد.
              {canWrite ? ' أنشئ اجتماعًا جديدًا أو ابدأ من قالب أعلاه.' : ' الإنشاء للمديرَين.'}
            </div>
          )}
          {active.length > 0 && (
            <div className="mgrid" style={{ marginBottom: 0 }}>
              {active.map((m) => (
                <GroupCard key={m.id} meeting={m} onOpen={() => setSelectedId(m.id)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {creating && (
        <CreateForm onCancel={() => setCreating(false)} onCreate={handleCreate} />
      )}
      {reporting && (
        <ConsolidatedReport meetings={active} onClose={() => setReporting(false)} />
      )}
      <Toast msg={toastMsg} />
    </div>
  );
}

/* ═══════════════ بطاقة اجتماع ═══════════════ */

function GroupCard({ meeting, onOpen }) {
  const p = meetingProgress(meeting);
  const st = MEETING_STATES[meeting.state] || { label: meeting.state, color: '#6b7280' };
  return (
    <button className="mcard" onClick={onOpen}>
      <div className="mc-top">
        <span className="mc-dept">{meeting.title || 'بلا عنوان'}</span>
      </div>
      <div className="mc-state" style={{ color: st.color }}>{st.label}</div>
      <div className="mc-bar"><span style={{ width: `${p.percent}%` }} /></div>
      <div className="mc-meta">
        {meeting.date || 'بلا تاريخ'} · {p.settled}/{p.total} بندًا محسومًا
        {meeting.number ? ` · ${meeting.number}` : ''}
        {(meeting.departments || []).length ? ` · ${meeting.departments.length} أطراف` : ''}
      </div>
    </button>
  );
}

/* ═══════════════ اختيار الإدارات/الكيانات يدويًّا ═══════════════ */

function DepartmentPicker({ departments, editable, onToggle, onAddEntity, onRemoveEntity }) {
  const [entity, setEntity] = useState('');
  const custom = (departments || []).filter((d) => !ORG_DEPARTMENTS.includes(d));

  const add = () => {
    const v = entity.trim();
    if (!v) return;
    onAddEntity(v);
    setEntity('');
  };

  return (
    <div>
      <div className="chips" style={{ marginTop: 4 }}>
        {ORG_DEPARTMENTS.map((d) => {
          const on = departments.includes(d);
          return (
            <button key={d} type="button" className={`chip ${on ? 'on' : ''}`} disabled={!editable}
              onClick={() => onToggle(d)}>{d}</button>
          );
        })}
        {custom.map((d) => (
          <span key={d} className="chip on entity">
            {d}
            {editable && (
              <button type="button" className="chip-x" title="إزالة" onClick={() => onRemoveEntity(d)}>✕</button>
            )}
          </span>
        ))}
      </div>
      {editable && (
        <div className="entity-add">
          <input type="text" value={entity} placeholder="أضف إدارة أو كيانًا آخر (طرف خارجي، لجنة…)"
            onChange={(e) => setEntity(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} />
          <button type="button" className="mini" onClick={add} disabled={!entity.trim()}>＋ إضافة</button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════ نموذج إنشاء اجتماع ═══════════════ */

function CreateForm({ onCancel, onCreate }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [place, setPlace] = useState('');
  const [departments, setDepartments] = useState([ORGANIZING_DEPARTMENT]);
  useBackClose(onCancel, 'meeting-create');

  const toggleDept = (d) =>
    setDepartments((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  const addEntity = (v) => setDepartments((prev) => (prev.includes(v) ? prev : [...prev, v]));
  const removeEntity = (v) => setDepartments((prev) => prev.filter((x) => x !== v));

  const submit = () => {
    if (!title.trim()) return;
    onCreate({ title: title.trim(), date, place: place.trim(), departments });
  };

  return (
    <div className="dlg on" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dlgbox" role="dialog" aria-modal="true">
        <div className="dlghead">
          <h3>اجتماع جديد</h3>
          <button className="kbtn b-ghost" onClick={onCancel}>✕ إغلاق</button>
        </div>
        <div className="dlgbody">
          <div className="fld">
            <label>عنوان الاجتماع *</label>
            <input type="text" value={title} autoFocus
              placeholder="مثال: اجتماع تنسيقي مع الإدارة المالية"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </div>
          <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="fld">
              <label>التاريخ</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="fld">
              <label>المكان</label>
              <input type="text" value={place} placeholder="قاعة الاجتماعات…"
                onChange={(e) => setPlace(e.target.value)} />
            </div>
          </div>
          <div className="fld">
            <label>الإدارات / الأطراف المشاركة</label>
            <DepartmentPicker departments={departments} editable
              onToggle={toggleDept} onAddEntity={addEntity} onRemoveEntity={removeEntity} />
          </div>
        </div>
        <div className="dlgfoot">
          <button className="kbtn b-accent" onClick={submit} disabled={!title.trim()}>حفظ وفتح الغرفة</button>
          <button className="kbtn b-ghost" onClick={onCancel}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ غرفة الاجتماع ═══════════════ */

function MeetingRoom({ meeting, canWrite, profile, showToast, onBack }) {
  const [draft, setDraft] = useState(meeting);
  const [cloud, setCloud] = useState('saved'); // saved | saving | error
  const [presenting, setPresenting] = useState(false);
  const draftRef = useRef(draft);
  const saveTimer = useRef(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const gate = groupAgendaVerdict(draft);
  const editable = canWrite && gate.ok;

  const recorder = useMeetingRecorder({
    lang: 'ar-SA',
    onError: (m) => showToast('تعذّر التسجيل: ' + m),
    onNotice: (m) => showToast(m),
  });

  // التفريغ السابق يملأ المسجّل عند الفتح، فالتسجيل الجديد يُلحق ولا يمحو.
  useEffect(() => {
    // فتحُ الغرفة يملأ المسجّل بالتفريغ المحفوظ مرّةً واحدة (لا نُعيده كلّ رسم).
    recorder.setSegments(meeting.transcript || []);
  }, []);

  // ── الحفظ السحابي المؤجَّل ──
  const saveNow = useCallback(async () => {
    if (!canWrite) return;
    setCloud('saving');
    try {
      await saveGroupMeeting(draftRef.current, profile);
      setCloud('saved');
    } catch (e) {
      setCloud('error');
      showToast('تعذّر الحفظ: ' + e.message);
    }
  }, [canWrite, profile, showToast]);

  const queueSave = useCallback(() => {
    if (!canWrite) return;
    setCloud('saving');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveNow, 900);
  }, [canWrite, saveNow]);

  // التفريغ الحيّ يتدفّق إلى المسودّة ويُحفظ سحابيًّا (بتأجيل).
  useEffect(() => {
    setDraft((d) => ({ ...d, transcript: recorder.segments }));
    if (recorder.segments.length) queueSave();
  }, [recorder.segments]);

  // ── محرّرات الحقول ──
  const patch = (changes) => {
    setDraft((d) => ({ ...d, ...changes }));
    queueSave();
  };

  const toggleDept = (dep) => {
    if (!editable) return;
    setDraft((d) => {
      const has = d.departments.includes(dep);
      return { ...d, departments: has ? d.departments.filter((x) => x !== dep) : [...d.departments, dep] };
    });
    queueSave();
  };
  const addEntity = (v) => {
    if (!editable) return;
    setDraft((d) => (d.departments.includes(v) ? d : { ...d, departments: [...d.departments, v] }));
    queueSave();
  };
  const removeEntity = (v) => {
    if (!editable) return;
    setDraft((d) => ({ ...d, departments: d.departments.filter((x) => x !== v) }));
    queueSave();
  };

  const setItem = (id, field, value) => {
    setDraft((d) => ({
      ...d,
      items: d.items.map((it) => (it.id === id ? { ...it, [field]: value } : it)),
    }));
    queueSave();
  };

  const addItem = () => {
    if (!editable) {
      if (gate.reason) showToast('محظور: ' + gate.reason);
      return;
    }
    setDraft((d) => {
      const it = newGroupItem(d, { title: '' });
      return { ...d, items: [...d.items, it] };
    });
    queueSave();
  };

  const deleteItem = (id) => {
    if (!editable) return;
    const it = draftRef.current.items.find((x) => x.id === id);
    const written = it && [it.discussion, it.decision].some((t) => String(t || '').trim());
    if (written && !window.confirm(`في البند «${it.title || 'بلا عنوان'}» نقاشٌ أو قرار — حذفه يُخرجه من المحضر. أتحذفه؟`)) {
      return;
    }
    setDraft((d) => ({ ...d, items: d.items.filter((x) => x.id !== id) }));
    queueSave();
  };

  // ── الأشخاص (حاضرون / موقّعون) ──
  const setPerson = (kind, i, field, value) => {
    setDraft((d) => {
      const list = [...(d[kind] || [])];
      list[i] = { ...list[i], [field]: value };
      return { ...d, [kind]: list };
    });
    queueSave();
  };
  const addPerson = (kind) => {
    setDraft((d) => ({ ...d, [kind]: [...(d[kind] || []), { name: '', role: '', dept: '' }] }));
    queueSave();
  };
  const removePerson = (kind, i) => {
    setDraft((d) => ({ ...d, [kind]: (d[kind] || []).filter((_, j) => j !== i) }));
    queueSave();
  };

  // ── المسجّل ──
  const toggleRec = () => {
    if (recorder.isRecording) {
      recorder.isPaused ? recorder.resume() : recorder.pause();
    } else {
      recorder.start();
    }
  };
  const downloadAudio = () => {
    const base = (draft.title || 'اجتماع').replace(/\s+/g, '-').slice(0, 40);
    const ok = recorder.downloadAudio(`${base}-${draft.date || ''}`);
    if (!ok) showToast('لا يوجد تسجيل صوتي بعد');
  };

  // ── المحضر ──
  const doIssue = async () => {
    const v = groupMinutesVerdict(draftRef.current);
    if (!v.ok) {
      showToast('المحضر غير مكتمل: ' + v.problems[0]);
      return;
    }
    try {
      await saveNow();
      const { number } = await issueGroupMinutes(draftRef.current, profile);
      setDraft((d) => ({ ...d, number, state: 'issued' }));
      showToast(`صدر المحضر برقم ${number}`);
    } catch (e) {
      showToast('تعذّر الإصدار: ' + e.message);
    }
  };
  const doSign = async () => {
    try {
      await signGroupMinutes(draftRef.current, profile);
      setDraft((d) => ({ ...d, state: 'signed' }));
      showToast('اعتُمد المحضر');
    } catch (e) {
      showToast('تعذّر الاعتماد: ' + e.message);
    }
  };
  const printMinutes = () => {
    const host = document.getElementById('docPrint');
    if (!host) return;
    host.innerHTML = groupMinutesHtml(draftRef.current, { assetBase: ASSET_BASE });
    window.print();
  };
  const doArchive = async () => {
    if (!window.confirm('أرشفة هذا الاجتماع؟ يُخفى من القائمة ويبقى قابلًا للاسترجاع.')) return;
    try {
      await archiveGroupMeeting(draftRef.current, profile, true);
      showToast('أُرشف الاجتماع');
      onBack();
    } catch (e) {
      showToast('تعذّرت الأرشفة: ' + e.message);
    }
  };

  const p = meetingProgress(draft);
  const st = MEETING_STATES[draft.state] || {};
  const cloudLabel = cloud === 'saving' ? 'يُحفظ…' : cloud === 'error' ? 'تعذّر الحفظ' : 'محفوظ سحابيًّا';
  const recording = recorder.isRecording && !recorder.isPaused;

  return (
    <div className="gm-room">
      {presenting && <PresentOverlay meeting={draft} onClose={() => setPresenting(false)} />}

      {/* شريط علوي */}
      <div className="kcard no-present">
        <div className="kchead">
          <div className="kchead-lead">
            <button className="mini" onClick={onBack}>→ رجوع للقائمة</button>
            <h3 style={{ margin: 0 }}>{draft.title || 'اجتماع جديد'}</h3>
            <span className="mc-state" style={{ color: st.color, fontSize: '.78rem' }}>{st.label}</span>
          </div>
          {canWrite && (
            <span className={`kchip ${cloud === 'saving' ? 'pending' : cloud === 'error' ? 'dirty' : 'online'}`}>
              <span className="dot" />{cloudLabel}
            </span>
          )}
        </div>
        <div className="kcbody">
          {gate.warn && <div className="dlgwarn" style={{ marginBottom: 12 }}>{gate.warn}</div>}
          {!canWrite && (
            <div className="dlgwarn" style={{ marginBottom: 12 }}>
              أنت في وضع المشاهدة — التحرير والتسجيل للمديرَين.
            </div>
          )}
          <div className="frow" style={{ marginBottom: 12 }}>
            <div className="fld">
              <label>عنوان الاجتماع</label>
              <input type="text" value={draft.title} disabled={!editable}
                onChange={(e) => patch({ title: e.target.value })} />
            </div>
            <div className="fld">
              <label>التاريخ</label>
              <input type="date" value={draft.date} disabled={!editable}
                onChange={(e) => patch({ date: e.target.value })} />
            </div>
            <div className="fld">
              <label>المكان</label>
              <input type="text" value={draft.place} disabled={!editable}
                onChange={(e) => patch({ place: e.target.value })} />
            </div>
            <div className="fld">
              <label>رقم المحضر</label>
              <input type="text" value={draft.number || '—'} readOnly className="ro" />
            </div>
          </div>
          <div className="fld" style={{ marginBottom: 12 }}>
            <label>هدف الاجتماع</label>
            <textarea value={draft.goal} disabled={!editable}
              onChange={(e) => patch({ goal: e.target.value })} />
          </div>
          <div className="fld">
            <label>الإدارات / الأطراف المشاركة</label>
            <DepartmentPicker departments={draft.departments} editable={editable}
              onToggle={toggleDept} onAddEntity={addEntity} onRemoveEntity={removeEntity} />
          </div>
        </div>
      </div>

      {/* المسجّل */}
      <div className="kcard no-present">
        <div className="kchead">
          <h3>التسجيل والتفريغ الحيّ</h3>
          <span className="kchead-hint">الصوت يُنزَّل محليًّا · النصّ يُحفظ مع المحضر</span>
        </div>
        <div className="kcbody">
          {!recorder.speechSupported && (
            <div className="dlgwarn" style={{ marginBottom: 12 }}>
              متصفّحك لا يدعم التفريغ الصوتي (جرّب Chrome/Edge). التسجيل الصوتي قد يعمل،
              ويمكنك الكتابة يدويًّا في البنود.
            </div>
          )}
          <div className="rec-bar">
            <button className={`rec-btn ${recording ? 'live' : ''}`} onClick={toggleRec} disabled={!canWrite}
              title={recording ? 'تعليق' : recorder.isRecording ? 'استئناف' : 'بدء التسجيل'}>
              {recording ? <RecPauseGlyph /> : recorder.isRecording ? <RecPlayGlyph /> : <RecMicGlyph />}
            </button>
            <div className="rec-meta">
              <span className="rec-time" dir="ltr">{fmtTime(recorder.elapsedSec)}</span>
              <span className="rec-dot-lbl">
                {recording ? 'جارٍ التسجيل' : recorder.isRecording ? 'متوقّف مؤقتًا' : 'جاهز'}
              </span>
            </div>
            <button className="kbtn b-ghost" onClick={recorder.stop} disabled={!recorder.isRecording}>إيقاف</button>
            <button className="kbtn b-navy" onClick={downloadAudio} disabled={!recorder.audioBlob}>تنزيل الصوت (webm)</button>
          </div>
          <div className="rec-transcript">
            {recorder.segments.length === 0 ? (
              <span className="rec-empty">سيظهر التفريغ هنا لحظةً بلحظة عند التسجيل…</span>
            ) : (
              recorder.segments.map((seg, i) => (
                <p key={`${seg.ts}-${i}`} style={{ marginBottom: 5 }}>
                  <span className="rec-n">{i + 1}.</span> {seg.text}
                </p>
              ))
            )}
          </div>
          {recorder.segments.length > 0 && canWrite && (
            <button className="mini" style={{ marginTop: 8 }} onClick={() => recorder.setSegments([])}>مسح التفريغ</button>
          )}
        </div>
      </div>

      {/* البنود */}
      <div className="kcard no-present">
        <div className="kchead">
          <h3>بنود الاجتماع وقراراته</h3>
          {editable && <button className="mini" onClick={addItem}>＋ أضف بندًا</button>}
        </div>
        <div className="kcbody">
          {draft.items.length === 0 && (
            <div className="kempty">لا بنود بعد.{editable ? ' أضف أول بند بالزرّ أعلاه.' : ''}</div>
          )}
          {draft.items.map((it, i) => (
            <div key={it.id} className={`item st-${it.state}`}>
              <div className="it-head" style={{ cursor: 'default' }}>
                <span className="it-n">{i + 1}</span>
                <input type="text" className="gm-item-title" value={it.title} disabled={!editable}
                  placeholder="عنوان البند / الموضوع"
                  onChange={(e) => setItem(it.id, 'title', e.target.value)} />
                {editable && (
                  <button className="iact del" title="حذف" onClick={() => deleteItem(it.id)}>حذف</button>
                )}
              </div>
              <div className="it-body">
                <div className="chips">
                  {Object.values(ITEM_STATES).map((sOpt) => (
                    <button key={sOpt.id} type="button"
                      className={`chip ${it.state === sOpt.id ? 'on' : ''}`}
                      style={it.state === sOpt.id ? { background: sOpt.color, borderColor: sOpt.color } : undefined}
                      disabled={!editable}
                      onClick={() => setItem(it.id, 'state', sOpt.id)}>{sOpt.label}</button>
                  ))}
                </div>
                <div className="fld" style={{ marginBottom: 9 }}>
                  <label>ما نوقش</label>
                  <textarea value={it.discussion} disabled={!editable}
                    onChange={(e) => setItem(it.id, 'discussion', e.target.value)} />
                </div>
                <div className="fld" style={{ marginBottom: 9 }}>
                  <label>القرار المتفق عليه (يُكتب في المحضر)</label>
                  <textarea value={it.decision} disabled={!editable}
                    onChange={(e) => setItem(it.id, 'decision', e.target.value)} />
                </div>
                <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="fld">
                    <label>المسؤول</label>
                    <input type="text" value={it.ownerUs} disabled={!editable}
                      onChange={(e) => setItem(it.id, 'ownerUs', e.target.value)} />
                  </div>
                  <div className="fld">
                    <label>الموعد</label>
                    <input type="date" value={it.due} disabled={!editable}
                      onChange={(e) => setItem(it.id, 'due', e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* الحاضرون والموقّعون */}
      <div className="kcard no-present">
        <div className="kchead"><h3>الحاضرون والموقّعون</h3></div>
        <div className="kcbody">
          <div className="people-grid">
            <PeopleList title="الحاضرون" kind="attendees" list={draft.attendees}
              editable={editable} onSet={setPerson} onAdd={addPerson} onRemove={removePerson} />
            <PeopleList title="الموقّعون على المحضر" kind="signatories" list={draft.signatories}
              editable={editable} onSet={setPerson} onAdd={addPerson} onRemove={removePerson} />
          </div>
          <div className="fld" style={{ marginTop: 12 }}>
            <label>ملاحظات عامة</label>
            <textarea value={draft.notes} disabled={!editable}
              onChange={(e) => patch({ notes: e.target.value })} />
          </div>
        </div>
      </div>

      {/* أزرار المحضر */}
      <div className="kcard no-present">
        <div className="kcbody mt-actions">
          <div className="mt-actions-info">
            {p.settled}/{p.total} بندًا محسومًا · {p.agreed} متفق عليه
          </div>
          <button className="kbtn b-ghost" onClick={() => setPresenting(true)} disabled={!draft.items.length}>وضع العرض</button>
          <button className="kbtn b-ghost" onClick={printMinutes}>طباعة المحضر</button>
          {canWrite && draft.state !== 'signed' && (
            <button className="kbtn b-accent" onClick={doIssue}>إصدار المحضر برقم رسمي</button>
          )}
          {canWrite && draft.number && draft.state !== 'signed' && (
            <button className="kbtn b-ok" onClick={doSign}>اعتماد بعد التوقيع</button>
          )}
          {canWrite && (
            <button className="mini" onClick={doArchive} style={{ marginInlineStart: 'auto' }}>أرشفة</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ قائمة أشخاص ═══════════════ */

function PeopleList({ title, kind, list, editable, onSet, onAdd, onRemove }) {
  const rows = list && list.length ? list : [];
  return (
    <div>
      <label className="people-lbl">{title}</label>
      <div style={{ marginTop: 6 }}>
        {rows.map((p, i) => (
          <div className="prow" key={i} style={{ gridTemplateColumns: '1fr 1fr 1fr auto' }}>
            <input type="text" value={p.name || ''} placeholder="الاسم" disabled={!editable}
              onChange={(e) => onSet(kind, i, 'name', e.target.value)} />
            <input type="text" value={p.role || ''} placeholder="المسمّى" disabled={!editable}
              onChange={(e) => onSet(kind, i, 'role', e.target.value)} />
            <input type="text" value={p.dept || ''} placeholder="الإدارة" disabled={!editable}
              onChange={(e) => onSet(kind, i, 'dept', e.target.value)} />
            {editable && (
              <button className="mini" onClick={() => onRemove(kind, i)} title="إزالة">✕</button>
            )}
          </div>
        ))}
      </div>
      {editable && <button className="mini" onClick={() => onAdd(kind)}>＋ أضف</button>}
    </div>
  );
}

/* ═══════════════ وضع العرض (شرائح على الشاشة) ═══════════════ */

function PresentOverlay({ meeting, onClose }) {
  const items = meeting.items || [];
  const [idx, setIdx] = useState(0);
  useBackClose(onClose, 'meeting-present');
  const touchX = useRef(null);

  const move = useCallback(
    (d) => setIdx((i) => Math.max(0, Math.min(items.length - 1, i + d))),
    [items.length]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (['ArrowLeft', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { move(1); e.preventDefault(); }
      else if (['ArrowRight', 'ArrowUp', 'PageUp'].includes(e.key)) { move(-1); e.preventDefault(); }
      else if (e.key === 'Home') setIdx(0);
      else if (e.key === 'End') setIdx(items.length - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, onClose, items.length]);

  if (!items.length) return null;
  const cur = Math.max(0, Math.min(idx, items.length - 1));
  const pct = Math.round(((cur + 1) / items.length) * 100);

  return (
    <div className="mt-present"
      onTouchStart={(e) => { touchX.current = e.changedTouches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 60) move(dx < 0 ? 1 : -1);
      }}>
      <div className="mt-stage"
        dangerouslySetInnerHTML={{
          __html: slideHtml(items[cur], { index: cur, total: items.length, dept: meeting.title }),
        }} />
      <div className="sl-nav">
        <button className="kbtn b-ghost" onClick={onClose}>✕ إنهاء</button>
        <button className="kbtn b-navy" onClick={() => move(-1)} disabled={cur === 0}>→ السابق</button>
        <div className="sl-prog"><span style={{ width: `${pct}%` }} /></div>
        <button className="kbtn b-accent" onClick={() => move(1)} disabled={cur === items.length - 1}>التالي ←</button>
        <span className="sl-hint">الأسهم للتنقّل · زرّ الرجوع أو Esc للخروج</span>
      </div>
    </div>
  );
}

/* ═══════════════ التقرير المجمّع ═══════════════ */

/** يوحّد شكل الاجتماعات لمولّد التقرير (dept = العنوان للاجتماع اليدويّ). */
function normalizeForReport(meetings) {
  return (meetings || []).map((m) => ({
    ...m,
    dept: m.dept || m.title || 'اجتماع',
    no: m.no || '',
    icon: '',
  }));
}

function ConsolidatedReport({ meetings, onClose }) {
  const [showPreview, setShowPreview] = useState(false);
  useBackClose(onClose, 'meeting-report');

  const html = systemReportHtml(consolidate(normalizeForReport(meetings)), {
    meta: SEED.meta,
    orgTitle: ORGANIZING_DEPARTMENT,
    date: '',
    signatories: SEED.reportSignatories,
    assetBase: ASSET_BASE,
  });

  const print = () => {
    const host = document.getElementById('docPrint');
    if (!host) return;
    host.innerHTML = html;
    window.print();
  };

  return (
    <div className="dlg on" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dlgbox wide" role="dialog" aria-modal="true">
        <div className="dlghead">
          <h3>التقرير المجمّع — النظام الإداري التعاوني الموحّد</h3>
          <button className="kbtn b-ghost" onClick={onClose}>✕ إغلاق</button>
        </div>
        <div className="dlgbody">
          <p className="mt-report-note">
            وثيقةٌ تجمع القرارات المعتمدة عبر اجتماعاتك في نظامٍ واحد يُرفع للإدارة العامة.
            كلّ قرارٍ فيها مردودٌ إلى محضره المرقَّم.
          </p>
          <div className="rpactions">
            <button className="kbtn b-ghost" onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? 'إخفاء المعاينة' : 'معاينة'}
            </button>
            <button className="kbtn b-accent" onClick={print}>طباعة</button>
          </div>
          {showPreview && (
            <div className="rpreview on" dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ توست ═══════════════ */

function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div className="toastw">
      <div className="toast">{msg}</div>
    </div>
  );
}
