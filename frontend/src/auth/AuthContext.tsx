import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useLayoutEffect,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { api, setTokenReader, setUnauthorizedHandler } from '@/api/client';
import type { AuthUser } from '@/api/types';

/**
 * Token storage.
 *
 * `localStorage` is a deliberate, documented tradeoff. It survives a reload,
 * which is what makes the app usable, but it is readable by any script on the
 * origin — so an XSS bug becomes a token leak. The production-grade answer is a
 * short-lived token in memory plus an httpOnly refresh cookie, which the API
 * does not implement in this scope. Noted in the README as known work.
 */
const TOKEN_KEY = 'rescue-rituals.token';

function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    // Private browsing and blocked site data both throw here. The app still
    // works; the session just will not survive a reload.
    return null;
  }
}

function writeStoredToken(token: string | null): void {
  try {
    if (token === null) window.localStorage.removeItem(TOKEN_KEY);
    else window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* Storage unavailable — the in-memory session continues regardless. */
  }
}

interface AuthState {
  user: AuthUser | null;
  /** True until the stored token has been checked against the API. */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readStoredToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(() => readStoredToken() !== null);

  // The API client reads the token through this, so there is exactly one place
  // the current token lives and no prop-threading through every call site.
  useLayoutEffect(() => {
    setTokenReader(() => token);
  }, [token]);

  const logout = useCallback(() => {
    setTokenReader(() => null);
    setToken(null);
    setUser(null);
    writeStoredToken(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, [logout]);

  /**
   * Validates a stored token on startup.
   *
   * A token in storage is not proof of a session: it may have expired, or the
   * account may be gone. Asking the API once on load means the UI never renders
   * a signed-in state that the next request will reject.
   */
  useEffect(() => {
    if (token === null) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;

    void api
      .me(controller.signal)
      .then((result) => {
        if (active) setUser(result);
      })
      .catch(() => {
        // setUnauthorizedHandler already clears the token on a 401; this covers
        // the network-failure case, where the token may still be perfectly good.
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.login({ email, password });
    setTokenReader(() => result.accessToken);
    writeStoredToken(result.accessToken);
    setToken(result.accessToken);
    setUser(result.user);
    setIsLoading(false);
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const result = await api.register({ name, email, password });
      setTokenReader(() => result.accessToken);
    writeStoredToken(result.accessToken);
      setToken(result.accessToken);
      setUser(result.user);
      setIsLoading(false);
    },
    [],
  );

  const value = useMemo<AuthState>(
    () => ({ user, isLoading, login, register, logout }),
    [user, isLoading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
}
