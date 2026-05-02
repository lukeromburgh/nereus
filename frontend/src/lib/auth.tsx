import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Navigate, useLocation } from "react-router-dom";
import apiClient, { ensureCsrfCookie, isAxiosError } from "./apiClient";

export interface AuthTeam {
  id: number;
  name: string;
}

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  teams: AuthTeam[];
}

interface LoginCredentials {
  username: string;
  password: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<AuthUser | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function AuthLoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-nereus-base">
      <div
        className="h-6 w-6 animate-spin border-2 border-nereus-accent border-t-transparent"
        style={{ borderRadius: "2px" }}
      />
    </div>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await apiClient.get<AuthUser>("/api/auth/me/");
      setUser(data);
      return data;
    } catch (error) {
      if (isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) {
        setUser(null);
        return null;
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function bootstrapAuth() {
      try {
        await ensureCsrfCookie();
        const { data } = await apiClient.get<AuthUser>("/api/auth/me/");
        if (active) {
          setUser(data);
        }
      } catch (error) {
        if (active) {
          if (isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) {
            setUser(null);
          } else {
            console.error("Failed to bootstrap auth session", error);
          }
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    bootstrapAuth();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    await ensureCsrfCookie();
    const { data } = await apiClient.post<AuthUser>("/api/auth/login/", credentials);
    setUser(data);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.post("/api/auth/logout/");
    } catch (error) {
      if (!(isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0))) {
        throw error;
      }
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      login,
      logout,
      refreshUser,
    }),
    [user, isLoading, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}