import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { api, getToken, setToken } from '@/lib/api';

export type User = { id: string; email: string; name?: string | null };

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // При старте — если есть токен, подтянуть профиль
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (token) {
          // a weak network at the start: a few tries before the login screen is shown
          for (let attempt = 0; ; attempt++) {
            try {
              const { user } = await api<{ user: User }>('/me');
              setUser(user);
              break;
            } catch (error: any) {
              if (error?.status === 401 || attempt >= 4) throw error;
              await new Promise((resolve) => setTimeout(resolve, 1500));
            }
          }
        }
      } catch (error: any) {
        // only a refused token logs out; no network at the start must not ask for the password again
        if (error?.status === 401) await setToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function login(email: string, password: string) {
    const res = await api<{ token: string; user: User }>('/auth/login', {
      auth: false,
      body: { email, password },
    });
    await setToken(res.token);
    setUser(res.user);
  }

  async function register(email: string, password: string, name?: string) {
    const res = await api<{ token: string; user: User }>('/auth/register', {
      auth: false,
      body: { email, password, name },
    });
    await setToken(res.token);
    setUser(res.user);
  }

  async function logout() {
    await setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth должен использоваться внутри AuthProvider');
  return ctx;
}
