import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { apiRequest } from "./queryClient";

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

interface AuthContext {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
}

const AuthCtx = createContext<AuthContext>({
  user: null,
  token: null,
  isLoading: true,
  login: async () => {},
  logout: () => {},
  isAdmin: false,
});

// Token storage using a simple in-memory + URL hash approach
// We store the token in memory and persist it via a simple mechanism
let storedToken: string | null = null;

function getPersistedToken(): string | null {
  try {
    // Use a hidden input in the DOM as token storage (iframe-safe)
    const el = document.getElementById("__auth_token") as HTMLInputElement | null;
    if (el && el.value) return el.value;
  } catch {}
  return storedToken;
}

function persistToken(token: string | null) {
  storedToken = token;
  try {
    let el = document.getElementById("__auth_token") as HTMLInputElement | null;
    if (!el) {
      el = document.createElement("input");
      el.type = "hidden";
      el.id = "__auth_token";
      document.body.appendChild(el);
    }
    el.value = token || "";
  } catch {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, try to restore session
  useEffect(() => {
    const saved = getPersistedToken();
    if (saved) {
      setToken(saved);
      fetchMe(saved);
    } else {
      setIsLoading(false);
    }
  }, []);

  async function fetchMe(t: string) {
    try {
      const res = await fetch(
        `${("__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__")}/api/auth/me`,
        { headers: { Authorization: `Bearer ${t}` } }
      );
      if (res.ok) {
        const u = await res.json();
        setUser(u);
        setToken(t);
        persistToken(t);
      } else {
        persistToken(null);
        setToken(null);
        setUser(null);
      }
    } catch {
      persistToken(null);
      setToken(null);
      setUser(null);
    }
    setIsLoading(false);
  }

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiRequest("POST", "/api/auth/login", { email, password });
    const data = await res.json();
    setUser(data.user);
    setToken(data.token);
    persistToken(data.token);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    persistToken(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, token, isLoading, login, logout, isAdmin: user?.role === "admin" }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);

// Helper to add auth header to API requests
export function authHeaders(token: string | null): Record<string, string> {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
