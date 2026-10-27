export interface User {
  id: string;
  name: string;
  email: string;
  university: string;
  studentIdVerified: boolean;
  avatarUrl?: string;
  rating: number;
  ridesCompleted: number;
}

export const DEMO_CREDENTIALS = {
  email: "student@hopon.demo",
  password: "hopon123",
};

export const DEFAULT_USER: User = {
  id: "usr_krish_rai_01",
  name: "Krish Rai",
  email: "student@hopon.demo",
  university: "Kristu Jayanti University",
  studentIdVerified: true,
  rating: 4.95,
  ridesCompleted: 18,
};

const AUTH_STORAGE_KEY = "hopon_user_auth";

export function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const data = localStorage.getItem(AUTH_STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: User): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  } catch (error) {
    console.error("Failed to save auth state to localStorage:", error);
  }
}

export function clearStoredUser(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear auth state:", error);
  }
}

export function isAuthenticated(): boolean {
  return getStoredUser() !== null;
}
