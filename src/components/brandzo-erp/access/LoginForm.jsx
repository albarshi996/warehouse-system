import { useEffect, useState } from 'react';
import {
  signIn,
  subscribeAuth,
  authErrorMessage,
  getBasePath,
  sendPasswordReset,
} from '../../../services/auth/authService.js';

/**
 * شاشة تسجيل الدخول العربية لبوابة برند زو.
 * - إن كان المستخدم مسجّلًا مسبقًا → تحويل مباشر للوحة التحكم.
 * - عند النجاح → تحويل للوحة التحكم.
 * - رسائل الأخطاء بالعربية.
 */
export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [resetting, setResetting] = useState(false);

  const base = getBasePath();

  useEffect(() => {
    const unsub = subscribeAuth((user) => {
      if (user) {
        window.location.replace(`${base}/dashboard`);
      } else {
        setChecking(false);
      }
    });
    return () => unsub();
  }, [base]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setResetMsg('');
    if (!email || !password) {
      setError('أدخل البريد الإلكتروني وكلمة المرور.');
      return;
    }
    setLoading(true);
    try {
      await signIn(email, password);
      window.location.replace(`${base}/dashboard`);
    } catch (err) {
      setError(authErrorMessage(err && err.code));
      setLoading(false);
    }
  }

  /** «نسيت كلمة المرور؟» — يرسل رابط إعادة التعيين للبريد المكتوب في الحقل. */
  async function handleReset() {
    setError('');
    setResetMsg('');
    if (!email) {
      setError('اكتب بريدك الإلكتروني في الحقل أولًا ثم اضغط «نسيت كلمة المرور؟».');
      return;
    }
    setResetting(true);
    try {
      await sendPasswordReset(email);
      setResetMsg(
        'أرسلنا رابط إعادة تعيين كلمة المرور إلى بريدك. افتح الرسالة (تفقّد أيضًا "غير المرغوب") واتبع الرابط، ثم عُد وسجّل الدخول بكلمتك الجديدة.'
      );
    } catch (err) {
      setError(authErrorMessage(err && err.code));
    }
    setResetting(false);
  }

  if (checking) {
    return (
      <div className="flex flex-col items-center gap-3 text-white/80">
        <div className="w-10 h-10 border-4 border-white/20 border-t-brand-gold rounded-full animate-spin" />
        <span className="text-sm font-medium">جارٍ التحقّق...</span>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md" dir="rtl">
      <div className="bg-brand-navy/70 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-8 sm:p-10">
        {/* الهوية */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 bg-brand-red rounded-2xl flex items-center justify-center font-bold text-3xl text-white shadow-lg mb-4">
            B
          </div>
          <h1 className="text-2xl font-bold text-white">بوابة عمليات برند زو</h1>
          <p className="text-gray-300 text-sm mt-1">سجّل دخولك للمتابعة</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-gray-200 mb-1.5">
              البريد الإلكتروني
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@brandzo.ly"
              className="w-full text-left bg-white/5 border border-white/15 rounded-xl text-white px-4 py-3 focus:outline-none focus:border-brand-gold/60 focus:ring-2 focus:ring-brand-gold/20 transition"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-semibold text-gray-200 mb-1.5">
              كلمة المرور
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPass ? 'text' : 'password'}
                autoComplete="current-password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full text-left bg-white/5 border border-white/15 rounded-xl text-white px-4 py-3 pl-12 focus:outline-none focus:border-brand-gold/60 focus:ring-2 focus:ring-brand-gold/20 transition"
              />
              <button
                type="button"
                onClick={() => setShowPass((s) => !s)}
                className="absolute inset-y-0 left-0 px-3 flex items-center text-gray-400 hover:text-brand-gold transition text-xs font-bold"
                aria-label={showPass ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPass ? 'إخفاء' : 'إظهار'}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-brand-red/15 border border-brand-red/40 text-red-200 text-sm rounded-xl px-4 py-3 text-center">
              {error}
            </div>
          )}

          {resetMsg && (
            <div className="bg-green-500/10 border border-green-500/40 text-green-200 text-sm rounded-xl px-4 py-3 text-center">
              ✉️ {resetMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-brand-red hover:bg-brand-red-dark disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl px-4 py-3 shadow-lg transition"
          >
            {loading ? (
              <>
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>جارٍ الدخول...</span>
              </>
            ) : (
              <span>تسجيل الدخول</span>
            )}
          </button>

          <button
            type="button"
            onClick={handleReset}
            disabled={resetting}
            className="w-full text-center text-xs text-gray-400 hover:text-brand-gold disabled:opacity-60 transition pt-1"
          >
            {resetting ? 'جارٍ إرسال رابط إعادة التعيين...' : 'نسيت كلمة المرور؟'}
          </button>
        </form>
      </div>

      <p className="text-center text-gray-400 text-xs mt-6">
        نظام إدارة مستودعات برند زو &copy; 2026
      </p>
    </div>
  );
}
