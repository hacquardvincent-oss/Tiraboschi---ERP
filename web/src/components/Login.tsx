import { useState, type FormEvent } from 'react';
import { useAuth } from '../store';
import { useI18n } from '../i18n';
import { Logo } from './Logo';

export function Login() {
  const { login } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await login(email.trim(), password);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full flex items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm">
        <div className="mb-6 mt-2 flex justify-center">
          <Logo />
        </div>
        <label className="text-xs font-semibold">{t('login.email')}</label>
        <input
          className="field mt-1 mb-3"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label className="text-xs font-semibold">{t('login.password')}</label>
        <input
          className="field mt-1 mb-4"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn w-full" disabled={busy}>
          {busy ? t('common.loading') : t('login.submit')}
        </button>
        {err && <p className="text-red-400 text-sm mt-3">{err}</p>}
      </form>
    </div>
  );
}
