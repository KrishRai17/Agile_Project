/**
 * Server-side demo account directory. Never import this from client components.
 *
 * These are DEMO accounts for the campus pilot. The password comes from HOPON_DEMO_PASSWORD
 * (defaults to the documented demo value) and is compared in constant time. Replace this module
 * with a real user database before onboarding real students.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { User } from "./auth";

const ACCOUNTS: Record<string, User> = {
  "student@hopon.demo": {
    id: "usr_krish_rai_01",
    name: "Krish Rai",
    email: "student@hopon.demo",
    university: "Kristu Jayanti University",
    studentIdVerified: true,
    rating: 4.95,
    ridesCompleted: 18,
    role: "passenger",
  },
  "driver@hopon.demo": {
    id: "usr_driver_demo_01",
    name: "Aarav Mehta",
    email: "driver@hopon.demo",
    university: "Kristu Jayanti University",
    studentIdVerified: true,
    rating: 4.8,
    ridesCompleted: 42,
    role: "driver",
  },
};

function demoPassword(): string {
  return process.env.HOPON_DEMO_PASSWORD || "hopon123";
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Returns the user for valid credentials, otherwise null. Always does the same amount of work. */
export function authenticate(email: string, password: string): User | null {
  const user = ACCOUNTS[email.trim().toLowerCase()];
  const expected = digest(user ? demoPassword() : "no-such-account-placeholder");
  const matches = timingSafeEqual(expected, digest(password));
  return user && matches ? { ...user } : null;
}

export function getUserById(id: string): User | null {
  const user = Object.values(ACCOUNTS).find((u) => u.id === id);
  return user ? { ...user } : null;
}
