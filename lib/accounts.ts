/**
 * Server-side user directory backed by SQLite (`users` and `ride_ratings` tables in `.data/hopon.sqlite`).
 * Never import this from client components.
 *
 * Automatically seeds the default campus accounts on first run and supports registering new
 * verified student passengers and student drivers with salted SHA-256 password hashing,
 * university roll numbers, HopOn wallet balances, and two-way post-ride ratings.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { User } from "./auth";
import { getDb } from "./db";

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  university: string;
  student_id_verified: number;
  student_roll_number: string | null;
  wallet_balance: number;
  rating: number;
  rides_completed: number;
  role: "passenger" | "driver";
  vehicle_model: string | null;
  vehicle_number: string | null;
  vehicle_type: string | null;
  created_at: number;
}

const DEMO_USERS: Array<
  User & { email: string; role: "passenger" | "driver"; studentRollNumber: string; walletBalance: number }
> = [
  {
    id: "usr_krish_rai_01",
    name: "Krish Rai",
    email: "student@hopon.demo",
    university: "Kristu Jayanti University",
    studentIdVerified: true,
    studentRollNumber: "23BCAC41",
    walletBalance: 250,
    rating: 4.95,
    ridesCompleted: 18,
    role: "passenger",
  },
  {
    id: "usr_driver_demo_01",
    name: "Aarav Mehta",
    email: "driver@hopon.demo",
    university: "Kristu Jayanti University",
    studentIdVerified: true,
    studentRollNumber: "22BCOM19",
    walletBalance: 640,
    rating: 4.8,
    ridesCompleted: 42,
    role: "driver",
  },
  {
    id: "usr_driver_demo_02",
    name: "Rohan Varma",
    email: "rohan@hopon.demo",
    university: "Kristu Jayanti University",
    studentIdVerified: true,
    studentRollNumber: "23BBAA08",
    walletBalance: 410,
    rating: 4.9,
    ridesCompleted: 27,
    role: "driver",
  },
  {
    id: "usr_driver_demo_03",
    name: "Priya Nair",
    email: "priya@hopon.demo",
    university: "Kristu Jayanti University",
    studentIdVerified: true,
    studentRollNumber: "23MSCS12",
    walletBalance: 520,
    rating: 4.85,
    ridesCompleted: 31,
    role: "driver",
  },
];

const DEMO_EMAILS = new Set(DEMO_USERS.map((u) => u.email));

function demoPassword(): string {
  return process.env.HOPON_DEMO_PASSWORD || "hopon123";
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function hashPassword(password: string, salt?: string): string {
  const s = salt ?? randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(`${s}:${password}`).digest("hex");
  return `${s}:${hash}`;
}

function verifyPasswordHash(password: string, stored: string): boolean {
  if (!stored.includes(":")) {
    return timingSafeEqual(digest(stored), digest(password));
  }
  const [salt, expectedHex] = stored.split(":", 2);
  const actualHex = createHash("sha256").update(`${salt}:${password}`).digest("hex");
  if (expectedHex.length !== actualHex.length) return false;
  return timingSafeEqual(Buffer.from(expectedHex, "utf8"), Buffer.from(actualHex, "utf8"));
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    university: row.university,
    studentIdVerified: Boolean(row.student_id_verified),
    ...(row.student_roll_number ? { studentRollNumber: row.student_roll_number } : {}),
    walletBalance: typeof row.wallet_balance === "number" ? row.wallet_balance : 250,
    rating: Math.round(row.rating * 100) / 100,
    ridesCompleted: row.rides_completed,
    role: row.role,
  };
}

function ensureDemoAccountsSeeded(): void {
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO users (
      id, name, email, password_hash, university, student_id_verified,
      student_roll_number, wallet_balance, rating, rides_completed, role, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = Date.now();
  const defaultHash = hashPassword(demoPassword(), "hopon_demo_salt");
  for (const u of DEMO_USERS) {
    insert.run(
      u.id,
      u.name,
      u.email,
      defaultHash,
      u.university,
      u.studentIdVerified ? 1 : 0,
      u.studentRollNumber,
      u.walletBalance,
      u.rating,
      u.ridesCompleted,
      u.role,
      now
    );
  }
}

/** Returns the user for valid credentials, otherwise null. Always does constant-time comparison. */
export function authenticate(email: string, password: string): User | null {
  ensureDemoAccountsSeeded();
  const normalizedEmail = email.trim().toLowerCase();
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(normalizedEmail) as UserRow | undefined;

  if (!row) {
    // Constant-time dummy work when user does not exist
    timingSafeEqual(digest("no-such-account-placeholder"), digest(password));
    return null;
  }

  // Demo accounts respect HOPON_DEMO_PASSWORD dynamically
  if (DEMO_EMAILS.has(normalizedEmail)) {
    const matches = timingSafeEqual(digest(demoPassword()), digest(password));
    return matches ? rowToUser(row) : null;
  }

  return verifyPasswordHash(password, row.password_hash) ? rowToUser(row) : null;
}

export function getUserById(id: string): User | null {
  ensureDemoAccountsSeeded();
  const db = getDb();
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  return row ? rowToUser(row) : null;
}

export function registerUser(input: {
  name: string;
  email: string;
  password: string;
  role?: "passenger" | "driver";
  university?: string;
  studentRollNumber?: string;
  vehicleModel?: string;
  vehicleNumber?: string;
  vehicleType?: string;
}): User | { error: string } {
  ensureDemoAccountsSeeded();
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const role: "passenger" | "driver" = input.role === "driver" ? "driver" : "passenger";
  const university = input.university?.trim() || "Kristu Jayanti University";
  const studentRollNumber = input.studentRollNumber?.trim().toUpperCase() || null;

  if (name.length < 2 || name.length > 80) {
    return { error: "Name must be between 2 and 80 characters." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { error: "Please provide a valid university email address." };
  }
  if (password.length < 6 || password.length > 200) {
    return { error: "Password must be at least 6 characters long." };
  }
  if (studentRollNumber && !/^[A-Z0-9-]{4,20}$/.test(studentRollNumber)) {
    return { error: "Student Roll Number must be 4–20 alphanumeric characters (e.g., 23BCAC45)." };
  }

  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as
    | { id: string }
    | undefined;
  if (existing) {
    return { error: "An account with this email already exists." };
  }

  const id = `usr_${Date.now()}_${randomBytes(3).toString("hex")}`;
  const passwordHash = hashPassword(password);
  const now = Date.now();

  db.prepare(
    `INSERT INTO users (
      id, name, email, password_hash, university, student_id_verified,
      student_roll_number, wallet_balance, rating, rides_completed, role,
      vehicle_model, vehicle_number, vehicle_type, created_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, 250, 5.0, 0, ?, ?, ?, ?, ?)`
  ).run(
    id,
    name,
    email,
    passwordHash,
    university,
    studentRollNumber,
    role,
    input.vehicleModel?.trim() || null,
    input.vehicleNumber?.trim() || null,
    input.vehicleType?.trim() || null,
    now
  );

  return getUserById(id)!;
}

export function incrementUserRidesCompleted(userId: string): void {
  ensureDemoAccountsSeeded();
  const db = getDb();
  db.prepare("UPDATE users SET rides_completed = rides_completed + 1 WHERE id = ?").run(userId);
}

export function adjustWalletBalance(
  userId: string,
  deltaRupees: number
): User | { error: string } {
  ensureDemoAccountsSeeded();
  const db = getDb();
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow | undefined;
  if (!row) return { error: "User not found." };

  const currentBalance = typeof row.wallet_balance === "number" ? row.wallet_balance : 250;
  const nextBalance = currentBalance + Math.round(deltaRupees);
  if (nextBalance < 0) {
    return { error: "Insufficient HopOn Wallet balance." };
  }

  db.prepare("UPDATE users SET wallet_balance = ? WHERE id = ?").run(nextBalance, userId);
  return getUserById(userId)!;
}

export function submitUserRating(input: {
  requestId: string;
  raterId: string;
  targetUserId: string;
  stars: number;
  tags?: string[];
  comment?: string;
}): { rating: number; targetUser: User } | { error: string } {
  ensureDemoAccountsSeeded();
  const stars = Math.round(input.stars);
  if (!Number.isFinite(stars) || stars < 1 || stars > 5) {
    return { error: "Rating must be between 1 and 5 stars." };
  }
  if (input.raterId === input.targetUserId) {
    return { error: "You cannot rate yourself." };
  }

  const db = getDb();
  const target = db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(input.targetUserId) as UserRow | undefined;
  if (!target) {
    return { error: "Target user not found." };
  }

  const id = `rat_${Date.now()}_${randomBytes(3).toString("hex")}`;
  const tagsJson = JSON.stringify((input.tags || []).slice(0, 6));
  const cleanComment = input.comment?.trim().slice(0, 300) || null;

  db.prepare(
    `INSERT OR REPLACE INTO ride_ratings (
      id, request_id, rater_id, target_user_id, stars, tags, comment, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.requestId,
    input.raterId,
    input.targetUserId,
    stars,
    tagsJson,
    cleanComment,
    Date.now()
  );

  // Compute updated weighted average combining prior baseline rating and all recorded ratings
  const stats = db
    .prepare(
      "SELECT COUNT(*) AS cnt, AVG(stars) AS avg_stars FROM ride_ratings WHERE target_user_id = ?"
    )
    .get(input.targetUserId) as { cnt: number; avg_stars: number | null };

  const baselineWeight = Math.max(1, Math.min(10, target.rides_completed || 3));
  const totalCount = baselineWeight + (stats.cnt || 1);
  const newRating =
    Math.round(
      ((target.rating * baselineWeight + (stats.avg_stars ?? stars) * (stats.cnt || 1)) /
        totalCount) *
        100
    ) / 100;

  db.prepare("UPDATE users SET rating = ? WHERE id = ?").run(newRating, input.targetUserId);
  const updatedUser = getUserById(input.targetUserId)!;
  return { rating: updatedUser.rating, targetUser: updatedUser };
}
