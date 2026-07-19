/**
 * أداة تقييم مرشّح «مدير المستودعات» — محميّة بالدور داخل اللوحة.
 *
 * الوثيقة سرّية (نماذج إجابات المُقيِّم)، فلا تُنشر كملف عام برابط مكشوف:
 *  · تُستورد نصًّا (?raw) داخل هذا المكوّن فقط، فتبقى في حزمة JS لا في
 *    HTML الصفحة الثابت ولا في خصائص الجزيرة — لا رابط نظيف يُخمَّن ولا
 *    فهرسة في محرّكات البحث.
 *  · لا تُعرض إلا بعد التحقّق من الدور (المدير العام + مستخدم الإدارة).
 *  · تُعرض في إطار معزول (iframe srcDoc) فلا يتعارض تصميمها مع اللوحة،
 *    وحفظها المحلّي (localStorage) خاصّ بمتصفّح كل مستخدم.
 *
 * ملاحظة أمنية: الموقع استاتيكي (GitHub Pages) فالحماية = إخفاء خلف الدخول
 * والدور، لا تشفير على الخادم. الإلزام الحقيقي للبيانات الحسّاسة يبقى في
 * قواعد Firestore — وهذه الأداة لا تكتب في السحابة أصلًا.
 */
import { useEffect, useState } from 'react';
import { subscribeAuth, fetchUserProfile } from '../../../services/auth/authService.js';
import evalHtml from './warehouse-manager-eval.html?raw';

/** الأدوار المخوّلة برؤية الأداة (قرار المالك: المدير العام + مستخدم الإدارة). */
const ALLOWED_ROLES = ['admin', 'department_user'];

export default function WarehouseManagerEval() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = subscribeAuth(async (u) => {
      setMe(u ? await fetchUserProfile(u) : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  if (!ready) return <p className="text-gray-300 text-sm py-10 text-center">جارٍ التحقّق…</p>;

  if (!me || !ALLOWED_ROLES.includes(me.role)) {
    return (
      <div className="bg-brand-red/10 border border-brand-red/40 text-red-200 rounded-2xl p-6 text-center" dir="rtl">
        <p className="font-bold text-lg mb-1">🚫 غير مصرّح</p>
        <p className="text-sm">أداة تقييم سرّية — للمدير العام ومستخدم الإدارة فقط.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/20">
      <iframe
        title="تقييم مرشّح — مدير المستودعات"
        srcDoc={evalHtml}
        /* صلاحيات مفوَّضة للإطار المعزول: التفريغ الصوتي + التقاط صوت الاجتماع + ملء الشاشة + النسخ */
        allow="microphone; display-capture; fullscreen; clipboard-write"
        allowFullScreen
        className="w-full block"
        style={{ height: 'calc(100vh - 96px)', minHeight: '620px', border: '0' }}
      />
    </div>
  );
}
