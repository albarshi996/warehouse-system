import { useEffect, useState } from 'react';
import { signIn, subscribeAuth, authErrorMessage, getBasePath } from '../../../services/auth/authService.js';
import { localUserCount, localSignup } from '../../../services/auth/_auth/localAuth.js';
import { validatePassword } from '../../../services/auth/_auth/localCrypto.js';
import { returnPathFrom } from '../../../services/auth/returnTo.js';

/**
 * شاشةُ الدخول المحلّيّة — بلا إنترنت، لبناء سطح المكتب (`PUBLIC_AUTH_BACKEND=local`).
 *
 * ★ اسمُ مستخدمٍ لا بريد، وبلا إعادةِ تعيينٍ بالبريد. وأوّلُ تشغيلٍ (لا مستخدمَ على
 *   الجهاز) يُنشئ **حسابَ المالك** ثمّ يدخل. الدخولُ والجلسةُ عبر `authService`
 *   (المقبس ⟵ المحوَّل المحليّ)، والتمهيدُ عبر `localSignup` على نفس المخزن.
 */
export default function LocalLoginForm() {
  const [mode, setMode] = useState('checking'); // checking | bootstrap | login
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const base = getBasePath();
  const afterLogin = () =>
    returnPathFrom(typeof window === 'undefined' ? '' : window.location.search, base) ||
    `${base}/dashboard`;

  useEffect(() => {
    let alive = true;
    const unsub = subscribeAuth((user) => {
      if (user) {
        window.location.replace(afterLogin());
        return;
      }
      // لا جلسة: أهو أوّلُ تشغيلٍ (لا مستخدم) أم دخولٌ عاديّ؟
      Promise.resolve(localUserCount())
        .then((n) => {
          if (alive) setMode(n > 0 ? 'login' : 'bootstrap');
        })
        .catch(() => {
          if (alive) setMode('login');
        });
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [base]);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    if (!username || !password) {
      setError('أدخل اسم المستخدم وكلمة المرور.');
      return;
    }
    setLoading(true);
    try {
      await signIn(username, password);
      window.location.replace(afterLogin());
    } catch (err) {
      setError(authErrorMessage(err && err.code));
      setLoading(false);
    }
  }

  async function handleBootstrap(e) {
    e.preventDefault();
    setError('');
    if (!username.trim()) {
      setError('اختر اسم مستخدمٍ للمالك.');
      return;
    }
    const pol = validatePassword(password);
    if (!pol.ok) {
      setError(pol.reason);
      return;
    }
    if (password !== confirm) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    setLoading(true);
    try {
      await localSignup({ username: username.trim(), name: name.trim(), password });
      await signIn(username.trim(), password);
      window.location.replace(afterLogin());
    } catch (err) {
      setError((err && err.message) || 'تعذّر إنشاء الحساب.');
      setLoading(false);
    }
  }

  if (mode === 'checking') {
    return (
      <div className="flex flex-col items-center gap-3 text-ink/80">
        <div className="w-10 h-10 border-4 border-line border-t-accent rounded-full animate-spin" />
        <span className="text-sm font-medium">جارٍ التحقّق...</span>
      </div>
    );
  }

  const isBootstrap = mode === 'bootstrap';

  return (
    <div className="w-full max-w-md" dir="rtl">
      <div className="bg-surface border border-line rounded-2xl shadow-card p-8 sm:p-10">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 bg-brand-red rounded-2xl flex items-center justify-center font-bold text-3xl text-white shadow-lg mb-4">
            B
          </div>
          <h1 className="text-2xl font-bold text-ink">BHOME — الدخول المحلّيّ</h1>
          <p className="text-ink-2 text-sm mt-1">
            {isBootstrap ? 'أوّلُ تشغيل: أنشئ حساب المالك' : 'سجّل دخولك للمتابعة (بلا إنترنت)'}
          </p>
        </div>

        <form onSubmit={isBootstrap ? handleBootstrap : handleLogin} className="space-y-5">
          <div>
            <label htmlFor="username" className="block text-sm font-semibold text-ink-2 mb-1.5">
              اسم المستخدم
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="owner"
              className="w-full text-left bg-chip border border-line rounded-xl text-ink px-4 py-3 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition"
            />
          </div>

          {isBootstrap && (
            <div>
              <label htmlFor="name" className="block text-sm font-semibold text-ink-2 mb-1.5">
                الاسم (اختياريّ)
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="محمد البرشي"
                className="w-full bg-chip border border-line rounded-xl text-ink px-4 py-3 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition"
              />
            </div>
          )}

          <div>
            <label htmlFor="password" className="block text-sm font-semibold text-ink-2 mb-1.5">
              كلمة المرور
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPass ? 'text' : 'password'}
                autoComplete={isBootstrap ? 'new-password' : 'current-password'}
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full text-left bg-chip border border-line rounded-xl text-ink px-4 py-3 pl-12 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition"
              />
              <button
                type="button"
                onClick={() => setShowPass((s) => !s)}
                className="absolute inset-y-0 left-0 px-3 flex items-center text-muted hover:text-accent transition text-xs font-bold"
                aria-label={showPass ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPass ? 'إخفاء' : 'إظهار'}
              </button>
            </div>
          </div>

          {isBootstrap && (
            <div>
              <label htmlFor="confirm" className="block text-sm font-semibold text-ink-2 mb-1.5">
                تأكيد كلمة المرور
              </label>
              <input
                id="confirm"
                type={showPass ? 'text' : 'password'}
                autoComplete="new-password"
                dir="ltr"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                className="w-full text-left bg-chip border border-line rounded-xl text-ink px-4 py-3 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition"
              />
            </div>
          )}

          {error && (
            <div className="bg-brand-red/15 border border-brand-red/40 text-red-200 text-sm rounded-xl px-4 py-3 text-center">
              {error}
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
                <span>{isBootstrap ? 'جارٍ الإنشاء...' : 'جارٍ الدخول...'}</span>
              </>
            ) : (
              <span>{isBootstrap ? 'إنشاء حساب المالك والدخول' : 'تسجيل الدخول'}</span>
            )}
          </button>
        </form>
      </div>

      <p className="text-center text-muted text-xs mt-6">
        BHOME — الدخول المحلّيّ على الجهاز &copy; 2026
      </p>
    </div>
  );
}
