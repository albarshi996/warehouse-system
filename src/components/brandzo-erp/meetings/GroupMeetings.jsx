import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMeetingRecorder } from '../MeetingAssistant/useMeetingRecorder.js';
import {
  ORG_DEPARTMENTS,
  ITEM_STATES,
  MEETING_STATES,
  meetingProgress,
  newGroupItem,
  groupMinutesVerdict,
  groupAgendaVerdict,
} from '../../../services/meetings/groupMeetingsModel.js';
import {
  listenGroupMeetings,
  createGroupMeeting,
  saveGroupMeeting,
  issueGroupMinutes,
  signGroupMinutes,
  archiveGroupMeeting,
} from '../../../services/meetings/groupMeetingsService.js';
import { groupMinutesHtml } from '../../../services/meetings/meetingsView.js';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';

const WRITER_ROLES = ['admin', 'warehouse_manager'];

/** جذر الأصول العامة — لصور التوقيعات المعتمدة في المحضر. */
const ASSET_BASE = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : import.meta.env.BASE_URL + '/';

const fmtTime = (sec) =>
  `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

/* ═══════════════ الحاوية ═══════════════ */

export default function GroupMeetings() {
  const [profile, setProfile] = useState(null);
  const [canWrite, setCanWrite] = useState(false);
  const [meetings, setMeetings] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [localDraft, setLocalDraft] = useState(null);
  const [creating, setCreating] = useState(false);
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

  const handleCreate = async (fields) => {
    if (!canWrite) return;
    try {
      const draft = await createGroupMeeting(fields, profile);
      setLocalDraft(draft);
      setSelectedId(draft.id);
      setCreating(false);
      showToast(`أُنشئ الاجتماع «${draft.title || 'بلا عنوان'}»`);
    } catch (e) {
      showToast('تعذّر الإنشاء: ' + e.message);
    }
  };

  // ── الغرفة مفتوحة ──
  if (selected) {
    return (
      <>
        <GroupMeetingRoom
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
  return (
    <div className="gm-wrap">
      <div className="kcard no-present">
        <div className="kchead">
          <h3>🗂 الاجتماعات الجماعية — إداراتنا معًا على طاولة واحدة</h3>
          {canWrite && (
            <button className="kbtn b-gold" onClick={() => setCreating(true)}>
              ＋ اجتماع جماعي جديد
            </button>
          )}
        </div>
        <div className="kcbody">
          <p style={{ fontSize: '.84rem', lineHeight: 1.9, color: '#334155', marginBottom: 12 }}>
            بخلاف الاجتماعات التحضيرية الثنائية، هذا اجتماعٌ يجمع عدّة إدارات في غرفة واحدة —
            تُسجّله صوتًا ونصًّا، وتخرج منه بمحضرٍ رسميٍّ مرقَّم. <b>التسجيل الصوتي والتفريغ
            الحيّ مدمجان في الغرفة</b>، والصوت يُنزَّل على جهازك (لا يُرفع للسحابة)، بينما يُحفظ
            التفريغ النصّي سحابيًّا مع المحضر.
          </p>

          {loading && <div className="kempty">جارٍ تحميل الاجتماعات…</div>}
          {!loading && active.length === 0 && (
            <div className="kempty">
              لا اجتماعات جماعية بعد.
              {canWrite ? ' أنشئ أول اجتماع من الزرّ أعلاه.' : ' الإنشاء للمديرَين.'}
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
        <CreateForm
          onCancel={() => setCreating(false)}
          onCreate={handleCreate}
        />
      )}
      <Toast msg={toastMsg} />
    </div>
  );
}

/* ═══════════════ بطاقة اجتماع جماعي ═══════════════ */

function GroupCard({ meeting, onOpen }) {
  const p = meetingProgress(meeting);
  const st = MEETING_STATES[meeting.state] || { label: meeting.state, emoji: '', color: '#64748b' };
  return (
    <button className="mcard" onClick={onOpen}>
      <div className="mc-top">
        <span className="mc-no">جماعي</span>
        <span className="mc-dept">{meeting.title || 'بلا عنوان'}</span>
      </div>
      <div className="mc-state" style={{ color: st.color }}>
        {st.emoji} {st.label}
      </div>
      <div className="mc-bar">
        <span style={{ width: `${p.percent}%` }} />
      </div>
      <div className="mc-meta">
        {meeting.date || 'بلا تاريخ'} · {p.settled}/{p.total} بندًا محسومًا
        {meeting.number ? ` · ${meeting.number}` : ''}
        {(meeting.departments || []).length ? ` · ${meeting.departments.length} إدارات` : ''}
      </div>
    </button>
  );
}

/* ═══════════════ نموذج إنشاء اجتماع ═══════════════ */

function CreateForm({ onCancel, onCreate }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [place, setPlace] = useState('');
  const [departments, setDepartments] = useState([]);

  const toggleDept = (d) =>
    setDepartments((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const submit = () => {
    if (!title.trim()) return;
    onCreate({ title: title.trim(), date, place: place.trim(), departments });
  };

  return (
    <div className="dlg on" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dlgbox" role="dialog" aria-modal="true">
        <div className="dlghead">
          <h3>＋ اجتماع جماعي جديد</h3>
          <button className="kbtn b-ghost" onClick={onCancel}>✕ إغلاق</button>
        </div>
        <div className="dlgbody">
          <div className="fld">
            <label>عنوان الاجتماع *</label>
            <input
              type="text"
              value={title}
              autoFocus
              placeholder="مثال: اجتماع تنسيقي شهري بين الإدارات"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
          <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="fld">
              <label>التاريخ</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="fld">
              <label>المكان</label>
              <input
                type="text"
                value={place}
                placeholder="قاعة الاجتماعات…"
                onChange={(e) => setPlace(e.target.value)}
              />
            </div>
          </div>
          <div className="fld">
            <label>الإدارات المشاركة</label>
            <div className="chips" style={{ marginTop: 4 }}>
              {ORG_DEPARTMENTS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`chip ${departments.includes(d) ? 'on' : ''}`}
                  style={departments.includes(d) ? { background: '#c89d3b' } : undefined}
                  onClick={() => toggleDept(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="dlgfoot">
          <button className="kbtn b-gold" onClick={submit} disabled={!title.trim()}>
            💾 إنشاء وفتح الغرفة
          </button>
          <button className="kbtn b-ghost" onClick={onCancel}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ غرفة الاجتماع الجماعي ═══════════════ */

function GroupMeetingRoom({ meeting, canWrite, profile, showToast, onBack }) {
  const [draft, setDraft] = useState(meeting);
  const [cloud, setCloud] = useState('saved'); // saved | saving | error
  const draftRef = useRef(draft);
  const saveTimer = useRef(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const gate = groupAgendaVerdict(draft);
  const editable = canWrite && gate.ok;

  const recorder = useMeetingRecorder({
    lang: 'ar-SA',
    onError: (m) => showToast('⚠️ ' + m),
    onNotice: (m) => showToast('🎙️ ' + m),
  });

  // التفريغ السابق يملأ المسجّل عند الفتح، فالتسجيل الجديد يُلحق ولا يمحو.
  useEffect(() => {
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
      showToast('❌ تعذّر الحفظ: ' + e.message);
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

  const setItem = (id, field, value) => {
    setDraft((d) => ({
      ...d,
      items: d.items.map((it) => (it.id === id ? { ...it, [field]: value } : it)),
    }));
    queueSave();
  };

  const addItem = () => {
    if (!editable) {
      if (gate.reason) showToast('🔒 ' + gate.reason);
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
    const base = (draft.title || 'اجتماع-جماعي').replace(/\s+/g, '-').slice(0, 40);
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
      showToast(`📜 صدر المحضر برقم ${number}`);
    } catch (e) {
      showToast('❌ ' + e.message);
    }
  };
  const doSign = async () => {
    try {
      await signGroupMinutes(draftRef.current, profile);
      setDraft((d) => ({ ...d, state: 'signed' }));
      showToast('✅ اعتُمد المحضر');
    } catch (e) {
      showToast('❌ ' + e.message);
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
      showToast('🗄 أُرشف الاجتماع');
      onBack();
    } catch (e) {
      showToast('❌ ' + e.message);
    }
  };

  const p = meetingProgress(draft);
  const st = MEETING_STATES[draft.state] || {};
  const cloudLabel = cloud === 'saving' ? 'يُحفظ…' : cloud === 'error' ? 'تعذّر الحفظ' : 'محفوظ سحابيًّا';
  const recording = recorder.isRecording && !recorder.isPaused;

  return (
    <div className="gm-room">
      {/* شريط علوي */}
      <div className="kcard no-present">
        <div className="kchead">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button className="mini" onClick={onBack}>→ رجوع للقائمة</button>
            <h3 style={{ margin: 0 }}>{draft.title || 'اجتماع جماعي جديد'}</h3>
            <span className="mc-state" style={{ color: st.color, fontSize: '.78rem' }}>
              {st.emoji} {st.label}
            </span>
          </div>
          {canWrite && (
            <span className={`kchip ${cloud === 'saving' ? 'pending' : cloud === 'error' ? 'dirty' : 'online'}`}>
              <span className="dot" />
              {cloudLabel}
            </span>
          )}
        </div>
        <div className="kcbody">
          {gate.warn && (
            <div className="dlgwarn" style={{ marginBottom: 12 }}>{gate.warn}</div>
          )}
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
              <input type="text" value={draft.number || '—'} readOnly style={{ background: '#fdf9ee', fontWeight: 800 }} />
            </div>
          </div>
          <div className="fld" style={{ marginBottom: 12 }}>
            <label>هدف الاجتماع</label>
            <textarea value={draft.goal} disabled={!editable}
              onChange={(e) => patch({ goal: e.target.value })} />
          </div>
          <div className="fld">
            <label>الإدارات المشاركة</label>
            <div className="chips" style={{ marginTop: 4 }}>
              {ORG_DEPARTMENTS.map((d) => {
                const on = draft.departments.includes(d);
                return (
                  <button key={d} type="button" className={`chip ${on ? 'on' : ''}`}
                    style={on ? { background: '#1b3a5c' } : undefined}
                    disabled={!editable} onClick={() => toggleDept(d)}>
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* المسجّل */}
      <div className="kcard no-present">
        <div className="kchead">
          <h3>🎙 التسجيل والتفريغ الحيّ</h3>
          <span style={{ color: 'rgba(255,255,255,.6)', fontSize: '.76rem' }}>
            الصوت يُنزَّل محليًّا · النصّ يُحفظ مع المحضر
          </span>
        </div>
        <div className="kcbody">
          {!recorder.speechSupported && (
            <div className="dlgwarn" style={{ marginBottom: 12 }}>
              متصفّحك لا يدعم التفريغ الصوتي (جرّب Chrome/Edge). التسجيل الصوتي قد يعمل، ويمكنك
              الكتابة يدويًّا في البنود.
            </div>
          )}
          <div className="rec-bar">
            <button className={`rec-btn ${recording ? 'live' : ''}`} onClick={toggleRec} disabled={!canWrite}
              title={recording ? 'تعليق' : recorder.isRecording ? 'استئناف' : 'بدء التسجيل'}>
              {recording ? '⏸' : recorder.isRecording ? '▶' : '🎙'}
            </button>
            <div className="rec-meta">
              <span className="rec-time" dir="ltr">{fmtTime(recorder.elapsedSec)}</span>
              <span className="rec-dot-lbl">
                {recording ? '● جارٍ التسجيل' : recorder.isRecording ? 'متوقّف مؤقتًا' : 'جاهز'}
              </span>
            </div>
            <button className="kbtn b-ghost" onClick={recorder.stop} disabled={!recorder.isRecording}>
              ⏹ إيقاف
            </button>
            <button className="kbtn b-navy" onClick={downloadAudio} disabled={!recorder.audioBlob}>
              ⬇ تنزيل الصوت (webm)
            </button>
          </div>
          <div className="rec-transcript">
            {recorder.segments.length === 0 ? (
              <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                سيظهر التفريغ هنا لحظةً بلحظة عند التسجيل…
              </span>
            ) : (
              recorder.segments.map((s, i) => (
                <p key={`${s.ts}-${i}`} style={{ marginBottom: 5 }}>
                  <span style={{ color: '#c89d3b', fontWeight: 700, fontSize: '.72rem' }}>
                    {i + 1}.
                  </span>{' '}
                  {s.text}
                </p>
              ))
            )}
          </div>
          {recorder.segments.length > 0 && canWrite && (
            <button className="mini" style={{ marginTop: 8 }} onClick={() => recorder.setSegments([])}>
              🗑 مسح التفريغ
            </button>
          )}
        </div>
      </div>

      {/* البنود */}
      <div className="kcard no-present">
        <div className="kchead">
          <h3>📋 بنود الاجتماع وقراراته</h3>
          {editable && (
            <button className="mini" onClick={addItem}>＋ أضف بندًا</button>
          )}
        </div>
        <div className="kcbody">
          {draft.items.length === 0 && (
            <div className="kempty">لا بنود بعد.{editable ? ' أضف أول بند.' : ''}</div>
          )}
          {draft.items.map((it, i) => (
            <div key={it.id} className={`item st-${it.state}`}>
              <div className="it-head" style={{ cursor: 'default' }}>
                <span className="it-n">{i + 1}</span>
                <input
                  type="text"
                  className="gm-item-title"
                  value={it.title}
                  disabled={!editable}
                  placeholder="عنوان البند / الموضوع"
                  onChange={(e) => setItem(it.id, 'title', e.target.value)}
                />
                {editable && (
                  <button className="iact del" title="حذف" onClick={() => deleteItem(it.id)}>🗑</button>
                )}
              </div>
              <div className="it-body">
                <div className="chips">
                  {Object.values(ITEM_STATES).map((s) => (
                    <button key={s.id} type="button"
                      className={`chip ${it.state === s.id ? 'on' : ''}`}
                      style={it.state === s.id ? { background: s.color } : undefined}
                      disabled={!editable}
                      onClick={() => setItem(it.id, 'state', s.id)}>
                      {s.emoji} {s.label}
                    </button>
                  ))}
                </div>
                <div className="fld" style={{ marginBottom: 9 }}>
                  <label>ما نوقش</label>
                  <textarea value={it.discussion} disabled={!editable}
                    onChange={(e) => setItem(it.id, 'discussion', e.target.value)} />
                </div>
                <div className="fld" style={{ marginBottom: 9 }}>
                  <label>✅ القرار المتفق عليه (يُكتب في المحضر)</label>
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
        <div className="kchead"><h3>👥 الحاضرون والموقّعون</h3></div>
        <div className="kcbody">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <PeopleList title="👥 الحاضرون" kind="attendees" list={draft.attendees}
              editable={editable} withDept
              onSet={setPerson} onAdd={addPerson} onRemove={removePerson} />
            <PeopleList title="✍️ الموقّعون على المحضر" kind="signatories" list={draft.signatories}
              editable={editable} withDept
              onSet={setPerson} onAdd={addPerson} onRemove={removePerson} />
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
        <div className="kcbody" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 180, fontSize: '.82rem', color: '#475569' }}>
            {p.settled}/{p.total} بندًا محسومًا · {p.agreed} متفق عليه
          </div>
          <button className="kbtn b-ghost" onClick={printMinutes}>🖨 طباعة المحضر</button>
          {canWrite && draft.state !== 'signed' && (
            <button className="kbtn b-gold" onClick={doIssue}>📜 إصدار المحضر برقم رسمي</button>
          )}
          {canWrite && draft.number && draft.state !== 'signed' && (
            <button className="kbtn b-ok" onClick={doSign}>✅ اعتماد بعد التوقيع</button>
          )}
          {canWrite && (
            <button className="mini" onClick={doArchive} style={{ marginInlineStart: 'auto' }}>🗄 أرشفة</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ قائمة أشخاص ═══════════════ */

function PeopleList({ title, kind, list, editable, withDept, onSet, onAdd, onRemove }) {
  const rows = list && list.length ? list : [];
  return (
    <div>
      <label style={{ fontSize: '.74rem', fontWeight: 800, color: '#64748b' }}>{title}</label>
      <div style={{ marginTop: 6 }}>
        {rows.map((p, i) => (
          <div className="prow" key={i}
            style={{ gridTemplateColumns: withDept ? '1fr 1fr 1fr auto' : '1fr 1fr auto' }}>
            <input type="text" value={p.name || ''} placeholder="الاسم" disabled={!editable}
              onChange={(e) => onSet(kind, i, 'name', e.target.value)} />
            <input type="text" value={p.role || ''} placeholder="المسمّى" disabled={!editable}
              onChange={(e) => onSet(kind, i, 'role', e.target.value)} />
            {withDept && (
              <input type="text" value={p.dept || ''} placeholder="الإدارة" disabled={!editable}
                onChange={(e) => onSet(kind, i, 'dept', e.target.value)} />
            )}
            {editable && (
              <button className="mini" onClick={() => onRemove(kind, i)}>🗑</button>
            )}
          </div>
        ))}
      </div>
      {editable && (
        <button className="mini" onClick={() => onAdd(kind)}>＋ أضف</button>
      )}
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
