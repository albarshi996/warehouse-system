/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  مقبسُ المصادقة — كلُّ دخولٍ وخروجٍ وقراءةِ ملفٍّ يمرّ من هنا
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * نظيرُ `_db/index.js`: يصل المحوَّلَ المختارَ ولا يقرّر شيئًا بنفسه. الافتراضُ
 * Firebase، فالبناءُ الحيُّ (GitHub Pages) لا يتغيّر، و`authService.js` يُعيد
 * التصدير من هنا فيبقى مستعملوه الستّةُ والثمانون بلا لمس. ويومَ يصل الدخولُ
 * المحليّ يُسجَّل محوَّلٌ ثانٍ في الجدول ويُختار بـ`PUBLIC_AUTH_BACKEND`.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { authBackendNameFrom, pickAuthBackend } from './backend.js';
import * as firebase from './firebaseAuth.js';
import * as local from './localAuth.js';

/** بيئةُ البناء — محروسةٌ كي لا تنكسر أدواتُ السطر في Node العاري. */
const ENV = (typeof import.meta !== 'undefined' && import.meta.env) || {};

/**
 * المحوّلاتُ المتاحة. `firebase` الافتراضُ (البناءُ الحيّ)، و`local` الدخولُ على
 * الجهاز بلا إنترنت — يُختار بـ`PUBLIC_AUTH_BACKEND=local` في بناء سطح المكتب.
 */
const BACKENDS = { firebase, local };

/** اسمُ محوَّل المصادقة العامل — يُقرأ في التشخيص. */
export const AUTH_BACKEND = authBackendNameFrom(ENV);

const impl = pickAuthBackend(AUTH_BACKEND, BACKENDS);

export const subscribeAuth = impl.subscribeAuth;
export const signIn = impl.signIn;
export const signOutUser = impl.signOutUser;
export const sendPasswordReset = impl.sendPasswordReset;
export const fetchUserProfile = impl.fetchUserProfile;
