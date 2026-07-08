import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, ApiResponse, setAccessToken, setSessionExpiredHandler } from "./api";
import type { AuthUser } from "./types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (mobile: string, password: string, rememberMe: boolean) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  can: (resource: string, action: string) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On first load, try to restore the session from the refresh cookie.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.post<ApiResponse<{ accessToken: string; user: AuthUser }>>(
          "/auth/refresh"
        );
        if (!cancelled) {
          setAccessToken(res.data.data.accessToken);
          setUser(res.data.data.user);
        }
      } catch {
        // not logged in
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setAccessToken(null);
      setUser(null);
    });
  }, []);

  const login = useCallback(async (mobile: string, password: string, rememberMe: boolean) => {
    const res = await api.post<ApiResponse<{ accessToken: string; user: AuthUser }>>(
      "/auth/login",
      { mobile, password, rememberMe }
    );
    setAccessToken(res.data.data.accessToken);
    setUser(res.data.data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const logoutAll = useCallback(async () => {
    try {
      await api.post("/auth/logout-all");
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const res = await api.get<ApiResponse<AuthUser>>("/auth/me");
    setUser(res.data.data);
  }, []);

  const can = useCallback(
    (resource: string, action: string) => {
      if (!user) return false;
      if (user.role.name === "Super Admin") return true;
      return (
        user.permissions.includes(`${resource}:${action}`) ||
        user.permissions.includes(`${resource}:manage`)
      );
    },
    [user]
  );

  const value = useMemo(
    () => ({ user, loading, login, logout, logoutAll, can, refreshUser }),
    [user, loading, login, logout, logoutAll, can, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
