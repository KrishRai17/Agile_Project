export interface User {
  id: string;
  name: string;
  email: string;
  university: string;
  studentIdVerified: boolean;
  studentRollNumber?: string;
  walletBalance?: number;
  avatarUrl?: string;
  rating: number;
  ridesCompleted: number;
  role?: "passenger" | "driver" | "both";
  vehicleModel?: string;
  vehicleNumber?: string;
  vehicleType?: string;
}

export const DEMO_ACCOUNT = {
  email: "student@hopon.demo",
  passwordHint: "hopon123",
};

export const AUTH_STORAGE_KEY = "hopon_user_auth";

/**
 * The browser copy of the user is only a UI cache. The real login is the signed, httpOnly
 * `hopon_session` cookie that the server checks on every API call (see syncSession below).
 */
export function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const data =
      localStorage.getItem(AUTH_STORAGE_KEY) ?? sessionStorage.getItem(AUTH_STORAGE_KEY);
    return data ? (JSON.parse(data) as User) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: User, remember: boolean = true): void {
  if (typeof window === "undefined") return;
  try {
    const payload = JSON.stringify(user);
    if (remember) {
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.setItem(AUTH_STORAGE_KEY, payload);
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      sessionStorage.setItem(AUTH_STORAGE_KEY, payload);
    }
    // Notify listeners in same window
    window.dispatchEvent(new Event("storage"));
  } catch (error) {
    console.error("Failed to save auth state:", error);
  }
}

/** Clears the local UI cache only. Use logout() to also end the server session. */
export function clearStoredUser(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    window.dispatchEvent(new Event("storage"));
  } catch (error) {
    console.error("Failed to clear auth state:", error);
  }
}

export function isAuthenticated(): boolean {
  return getStoredUser() !== null;
}

/**
 * Asks the server who is signed in. The httpOnly session cookie can only be removed by the
 * server, so sign-out has to go through /api/auth/logout.
 */
export async function logout(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  } catch {
    // Network error: still clear the local copy below.
  }
  clearStoredUser();
}

/**
 * Confirms the signed session cookie with the server and refreshes the local user cache.
 * Returns null (and clears the cache) when there is no valid session. If the server can't be
 * reached we keep whatever is cached rather than signing the user out while offline.
 */
export async function syncSession(): Promise<User | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
    if (res.status === 401) {
      clearStoredUser();
      return null;
    }
    if (!res.ok) return getStoredUser();

    const data = (await res.json()) as { user?: User };
    if (!data.user) {
      clearStoredUser();
      return null;
    }

    if (JSON.stringify(getStoredUser()) !== JSON.stringify(data.user)) {
      // Keep the user wherever it already lived (remember-me vs. session-only).
      const wasRemembered = localStorage.getItem(AUTH_STORAGE_KEY) !== null;
      setStoredUser(data.user, wasRemembered);
    }
    return data.user;
  } catch {
    return getStoredUser();
  }
}
