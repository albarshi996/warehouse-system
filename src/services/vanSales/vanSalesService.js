/**
 * قراءة حركات مركبةٍ بعينها — الوقود الذي تُبنى منه التسوية.
 *
 * لماذا استعلامان لا واحد؟ لأنّ حركة المركبة تظهر في حقلَين مختلفين بحسب
 * اتّجاهها: `to` حين تُحمَّل، و`from` حين تُفرَّغ. وFirestore لا يفهرس شرطًا
 * على حقلين بـ«أو» بلا فهرسٍ مركّب، فنستمع للاثنين ونمزجهما هنا — أرخص من
 * فهرسٍ إضافيّ، ونتيجته هي هي.
 *
 * المزج يُزيل التكرار بالمعرّف الحتميّ (`docId__lineIndex`)، فلو ظهرت حركةٌ في
 * الاستعلامَين — وهو ما لا يقع إلّا في حركةٍ فاسدة طرفاها المركبة نفسها —
 * حُسبت مرّةً واحدة ولم تُضاعف الميزان.
 *
 * ⚠️ هذه الوحدة تلمس Firestore، فلا تُختبَر في Node. المنطق كلّه في
 * `settlement.js` الخالص — وهي القاعدة نفسها التي يتبعها بقيّة النظام.
 */
import { collection, onSnapshot, query, where, limit } from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { vehicleLocationCode } from '../ledger/locations.js';

const MOVES = 'stock_moves';

/**
 * استماعٌ لحظيّ لحركات مركبةٍ بلوحتها. يُعيد دالّة إلغاء الاشتراك تُلغي الاثنين.
 *
 * @param {string} plate لوحة المركبة
 * @param {(moves:Array)=>void} callback تُستدعى بكلّ الحركات مدمجةً ومرتّبة
 * @param {(err:Error)=>void} [onError]
 * @param {number} [max] سقف كلّ استعلام
 */
export function listenVanMoves(plate, callback, onError, max = 500) {
  const code = vehicleLocationCode(plate);
  if (!code) {
    callback([]);
    return () => {};
  }

  const byId = new Map();
  let seenIn = false;
  let seenOut = false;

  const emit = () => {
    // لا نُصدر قبل وصول الطرفين، وإلّا حُسبت تسويةٌ نصفها ناقص فظهر عجزٌ وهميّ.
    if (!seenIn || !seenOut) return;
    callback(
      [...byId.values()].sort((a, b) => (b.postedAt?.seconds || 0) - (a.postedAt?.seconds || 0))
    );
  };

  const subscribe = (field, mark) =>
    onSnapshot(
      query(collection(db, MOVES), where(field, '==', code), limit(max)),
      (snap) => {
        // نحذف ما كان من هذا الطرف ثم نُعيد بناءه، كي يختفي المحذوف حقًّا.
        for (const [id, row] of byId) if (row.__side === field) byId.delete(id);
        snap.docs.forEach((d) => byId.set(d.id, { id: d.id, ...d.data(), __side: field }));
        mark();
        emit();
      },
      (err) => onError?.(err)
    );

  const unsubIn = subscribe('to', () => { seenIn = true; });
  const unsubOut = subscribe('from', () => { seenOut = true; });

  return () => {
    unsubIn();
    unsubOut();
  };
}
