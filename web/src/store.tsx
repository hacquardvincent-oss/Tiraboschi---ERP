import { createContext, useContext, useState, type ReactNode } from 'react';
import { api, setToken } from './lib/api';

// ─── Auth ─────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  role: string;
  firstName?: string | null;
  lastName?: string | null;
}

interface AuthCtx {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem('tiraboschi_user');
    return raw ? (JSON.parse(raw) as User) : null;
  });

  const login = async (email: string, password: string) => {
    const res = await api<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setToken(res.token);
    localStorage.setItem('tiraboschi_user', JSON.stringify(res.user));
    setUser(res.user);
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem('tiraboschi_user');
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth hors provider');
  return ctx;
}

// ─── Devise (EUR/USD) ─────────────────────────────────────────────────────────
export type Currency = 'EUR' | 'USD';

interface CurrencyCtx {
  currency: Currency;
  setCurrency: (c: Currency) => void;
}

const CurrencyContext = createContext<CurrencyCtx | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>(
    (localStorage.getItem('tiraboschi_currency') as Currency) || 'EUR',
  );
  const setCurrency = (c: Currency) => {
    setCurrencyState(c);
    localStorage.setItem('tiraboschi_currency', c);
  };
  return (
    <CurrencyContext.Provider value={{ currency, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyCtx {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency hors provider');
  return ctx;
}
