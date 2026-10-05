import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, login as apiLogin, logout as apiLogout, me as apiMe, register as apiRegister } from './api';
import type { User } from './api';

/**
 * A 200 with an unusable payload must not be mistaken for a live session --
 * otherwise the UI would claim a user while /me answers 401.
 */
function requireUser(response: { user?: unknown } | null | undefined): User {
  const user = response?.user;
  if (!user || typeof user !== 'object' || typeof (user as User).id !== 'string') {
    throw new ApiError(0, 'malformed_response');
  }
  return user as User;
}

export interface AuthContextValue {
  user: User | null;
  /** True while the initial `me()` probe is in flight. */
  loading: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<User>;
  register: (email: string, password: string, isExecutive: boolean) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    apiMe()
      .then((response) => {
        if (active) setUser(response.user);
      })
      .catch(() => {
        // 401 (signed out) or an unreachable API both mean "no session".
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      // Guard against setState after unmount / StrictMode's double-invoke.
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string, remember?: boolean) => {
    const user = requireUser(await apiLogin(email, password, remember));
    setUser(user);
    return user;
  }, []);

  const register = useCallback(async (email: string, password: string, isExecutive: boolean) => {
    const user = requireUser(await apiRegister(email, password, isExecutive));
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      // Clear locally even if the server call failed, so the UI can never be
      // stuck showing a session the user believes they ended.
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}