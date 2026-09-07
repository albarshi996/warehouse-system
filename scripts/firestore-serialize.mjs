/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  تسلسلُ قيم Firestore — تعريفٌ واحدٌ يستعمله المُصدِّرُ والمزامنة
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★ انتُزع من `firestore-export.mjs` حين احتاجته حاويةُ المزامنة. والسببُ
 *    ليس ترتيبًا: **نسختان من التسلسل تنحرفان**، وانحرافُهما يعني أنّ ما
 *    صدّرناه مرّةً ليس ما نزامنه كلَّ دقيقتين — فرقٌ في `_import.sql` لا
 *    يفسّره أحد، ومصدرُه سطرٌ مختلفٌ في ملفّين.
 *
 * ★ والأنواعُ الخاصّةُ تُوسم بـ`__type` كي يعرفها المحمِّلُ ولا يخمّن.
 *   و`pg-import.mjs` يقرأ `{__type:'timestamp', iso}` بعينه.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { Timestamp, GeoPoint, Bytes, DocumentReference } from 'firebase/firestore';

/**
 * يحوّل قيمةَ Firestore إلى JSON بلا فقد.
 * @param {unknown} v
 * @returns {unknown}
 */
export function serialize(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Timestamp) return { __type: 'timestamp', iso: v.toDate().toISOString() };
  if (v instanceof GeoPoint) return { __type: 'geopoint', lat: v.latitude, lng: v.longitude };
  if (v instanceof Bytes) return { __type: 'bytes', b64: v.toBase64() };
  if (v instanceof DocumentReference) return { __type: 'ref', path: v.path };
  if (Array.isArray(v)) return v.map(serialize);
  if (typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = serialize(val);
    return out;
  }
  return v;
}
