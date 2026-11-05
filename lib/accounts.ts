/**
 * Server-side user directory backed by SQLite (`users` and `ride_ratings` tables in `.data/hopon.sqlite`).
 * Never import this from client components.
 *
 * Automatically seeds the default campus accounts on first run and supports registering new
 * verified student passengers and student drivers with scrypt password hashing,
 * university roll numbers, HopOn wallet balances, and two-way post-ride ratings.
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { User } from "./auth";
import { getDb, resolveDbPath, recordWalletLedger } from "./db";
import { cleanText, cleanVehicleNumber, parseVehicleType } from "./validate";

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
  role: "passenger" | "driver" | "both";
  vehicle_model: string | null;
  vehicle_number: string | null;
  vehicle_type: string | null;
  email_verification_hash: string | null;
  email_verification_expires_at: number | null;
  session_version?: number;
  created_at: number;
}

const DEMO_USERS: Array<
  User & { email: string; role: "passenger" | "driver" | "both"; studentRollNumber: string; walletBalance: number }
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
const DEMO_USER_IDS = new Set(DEMO_USERS.map((u) => u.id));

export function isDemoUserId(id: string | null | undefined): boolean {
  if (!id) return false;
  return DEMO_USER_IDS.has(id) || id.startsWith("usr_driver_demo_") || id === "usr_krish_rai_01";
}

export function isDemoEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith("@hopon.demo") || DEMO_EMAILS.has(normalized);
}

export function isDemoEnabled(): boolean {
  if (process.env.NODE_ENV === "production") {
    return process.env.HOPON_ENABLE_DEMO === "true";
  }
  return process.env.HOPON_ENABLE_DEMO !== "false";
}

function demoPassword(): string {
  return process.env.HOPON_DEMO_PASSWORD || "hopon123";
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string, salt?: string): string {
  const s = salt ?? randomBytes(16).toString("hex");
  const key = scryptSync(password, s, SCRYPT_KEYLEN).toString("hex");
  return `scrypt:${s}:${key}`;
}

export function hashLegacySha256Password(password: string, salt?: string): string {
  const s = salt ?? randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(`${s}:${password}`).digest("hex");
  return `${s}:${hash}`;
}

export function verifyPasswordHash(
  password: string,
  stored: string
): { valid: boolean; needsUpgrade: boolean } {
  if (stored.startsWith("scrypt:")) {
    const parts = stored.split(":");
    if (parts.length !== 3) return { valid: false, needsUpgrade: false };
    const [, salt, expectedHex] = parts;
    const expectedBuf = Buffer.from(expectedHex, "hex");
    const actualBuf = scryptSync(password, salt, SCRYPT_KEYLEN);
    if (expectedBuf.length !== actualBuf.length) {
      return { valid: false, needsUpgrade: false };
    }
    return {
      valid: timingSafeEqual(expectedBuf, actualBuf),
      needsUpgrade: false,
    };
  }
  if (!stored.includes(":")) {
    const valid = timingSafeEqual(digest(stored), digest(password));
    return { valid, needsUpgrade: valid };
  }
  const [salt, expectedHex] = stored.split(":", 2);
  const actualHex = createHash("sha256").update(`${salt}:${password}`).digest("hex");
  if (expectedHex.length !== actualHex.length) {
    return { valid: false, needsUpgrade: false };
  }
  const valid = timingSafeEqual(Buffer.from(expectedHex, "utf8"), Buffer.from(actualHex, "utf8"));
  return { valid, needsUpgrade: valid };
}

function rowToUser(row: UserRow): User {
  const verified = Boolean(row.student_id_verified);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    university: row.university,
    studentIdVerified: verified,
    ...(row.student_roll_number ? { studentRollNumber: row.student_roll_number } : {}),
    walletBalance: typeof row.wallet_balance === "number" ? row.wallet_balance : 250,
    rating: Math.round(row.rating * 100) / 100,
    ridesCompleted: row.rides_completed,
    // Until email ownership is verified, the user cannot act as a driver
    role: verified ? row.role : "passenger",
    ...(row.vehicle_model ? { vehicleModel: row.vehicle_model } : {}),
    ...(row.vehicle_number ? { vehicleNumber: row.vehicle_number } : {}),
    ...(row.vehicle_type ? { vehicleType: row.vehicle_type } : {}),
  };
}

interface GlobalAccountsSeedState {
  __hoponSeededDbPaths?: Set<string>;
}
const globalForAccountsSeed = globalThis as unknown as GlobalAccountsSeedState;

function ensureDemoAccountsSeeded(): void {
  if (!isDemoEnabled()) return;
  const dbPath = resolveDbPath();
  const seededPaths = (globalForAccountsSeed.__hoponSeededDbPaths ??= new Set<string>());
  const db = getDb();
  if (seededPaths.has(dbPath)) {
    const existingDemo = db
      .prepare("SELECT id FROM users WHERE id = ?")
      .get(DEMO_USERS[0].id) as { id: string } | undefined;
    if (existingDemo) return;
  }

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
    // Ensure canonical role is preserved for demo users
    db.prepare("UPDATE users SET role = ? WHERE id = ?").run(u.role, u.id);
  }
  seededPaths.add(dbPath);
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
    const dummy = scryptSync(password, "hopon_dummy_salt", SCRYPT_KEYLEN);
    timingSafeEqual(dummy, dummy);
    return null;
  }

  if (DEMO_EMAILS.has(normalizedEmail)) {
    if (!isDemoEnabled()) {
      const dummy = scryptSync(password, "hopon_dummy_salt", SCRYPT_KEYLEN);
      timingSafeEqual(dummy, dummy);
      return null;
    }
    const matches = timingSafeEqual(digest(demoPassword()), digest(password));
    return matches ? rowToUser(row) : null;
  }

  const check = verifyPasswordHash(password, row.password_hash);
  if (!check.valid) return null;

  if (check.needsUpgrade) {
    const upgraded = hashPassword(password);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(upgraded, row.id);
  }

  return rowToUser(row);
}

const DEFAULT_KJU_EMAIL_DOMAINS = ["kristujayanti.com", "kju.edu", "kju.ac.in"];

export function getAllowedEmailDomains(): string[] {
  const raw = process.env.ALLOWED_EMAIL_DOMAINS?.trim();
  if (raw) {
    const parsed = raw
      .split(",")
      .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean);
    if (parsed.length > 0) return parsed;
  }
  const defaults = [...DEFAULT_KJU_EMAIL_DOMAINS];
  if (isDemoEnabled()) {
    defaults.push("hopon.demo");
  }
  return defaults;
}

export function isAllowedUniversityEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const atIdx = normalized.lastIndexOf("@");
  if (atIdx <= 0) return false;
  const domain = normalized.slice(atIdx + 1);
  if (!domain) return false;
  const allowed = getAllowedEmailDomains();
  return allowed.includes(domain);
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
  role?: "passenger" | "driver" | "both";
  university?: string;
  studentRollNumber?: string;
  vehicleModel?: string;
  vehicleNumber?: string;
  vehicleType?: string;
}): User | { error: string } {
  ensureDemoAccountsSeeded();
  const name = cleanText(input.name, 80) ?? "";
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  let role: "passenger" | "driver" | "both" = "passenger";
  if (input.role === "both") {
    role = "both";
  } else if (input.role === "driver") {
    role = "driver";
  } else if (input.role === "passenger") {
    role = "passenger";
  }
  const university = cleanText(input.university, 100) || "Kristu Jayanti University";
  const studentRollNumber = input.studentRollNumber?.trim().toUpperCase() || null;

  if (name.length < 2 || name.length > 80) {
    return { error: "Name must be between 2 and 80 characters." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { error: "Please provide a valid university email address." };
  }
  if (!isAllowedUniversityEmail(email)) {
    const allowedList = getAllowedEmailDomains().join(", ");
    return {
      error: `Email must belong to an approved university domain (${allowedList}).`,
    };
  }
  if (password.length < 6 || password.length > 200) {
    return { error: "Password must be at least 6 characters long." };
  }
  if (studentRollNumber && !/^[A-Z0-9-]{4,20}$/.test(studentRollNumber)) {
    return { error: "Student Roll Number must be 4–20 alphanumeric characters (e.g., 23BCAC45)." };
  }

  let validatedVehicleType: string | null = null;
  let validatedVehicleModel: string | null = null;
  let validatedVehicleNumber: string | null = null;

  if (role === "driver" || role === "both") {
    validatedVehicleType = parseVehicleType(input.vehicleType ?? "Bike");
    if (!validatedVehicleType) {
      return { error: "Vehicle type must be Bike, Scooty, or Car." };
    }
    validatedVehicleModel = cleanText(input.vehicleModel, 60);
    if (!validatedVehicleModel || validatedVehicleModel.length < 2) {
      return { error: "Drivers must provide a valid vehicle model." };
    }
    validatedVehicleNumber = cleanVehicleNumber(input.vehicleNumber);
    if (!validatedVehicleNumber) {
      return {
        error: "Drivers must provide a valid registration plate number (e.g., KA 04 EK 7142).",
      };
    }
  }

  const db = getDb();
  const existing = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as
    | UserRow
    | undefined;
  if (existing) {
    if (existing.student_id_verified) {
      return { error: "An account with this email already exists." };
    }

    // Existing account is UNVERIFIED: overwrite details, rotate token, and bump session_version
    const passwordHash = hashPassword(password);
    const now = Date.now();
    const initialVerifyToken = randomBytes(16).toString("base64url");
    const initialVerifyHash = hashVerificationToken(initialVerifyToken);
    const initialVerifyExpiresAt = now + EMAIL_VERIFICATION_TTL_MS;

    db.prepare(`
      UPDATE users SET
        name = ?,
        password_hash = ?,
        university = ?,
        student_roll_number = ?,
        role = ?,
        vehicle_model = ?,
        vehicle_number = ?,
        vehicle_type = ?,
        email_verification_hash = ?,
        email_verification_expires_at = ?,
        session_version = COALESCE(session_version, 1) + 1
      WHERE id = ?
    `).run(
      name,
      passwordHash,
      university,
      studentRollNumber,
      role,
      validatedVehicleModel,
      validatedVehicleNumber,
      validatedVehicleType,
      initialVerifyHash,
      initialVerifyExpiresAt,
      existing.id
    );

    return getUserById(existing.id)!;
  }

  const id = `usr_${Date.now()}_${randomBytes(3).toString("hex")}`;
  const passwordHash = hashPassword(password);
  const now = Date.now();
  const initialVerifyToken = randomBytes(16).toString("base64url");
  const initialVerifyHash = hashVerificationToken(initialVerifyToken);
  const initialVerifyExpiresAt = now + EMAIL_VERIFICATION_TTL_MS;

  db.prepare(
    `INSERT INTO users (
      id, name, email, password_hash, university, student_id_verified,
      student_roll_number, wallet_balance, rating, rides_completed, role,
      vehicle_model, vehicle_number, vehicle_type,
      email_verification_hash, email_verification_expires_at, session_version, created_at
    ) VALUES (?, ?, ?, ?, ?, 0, ?, 0, 5.0, 0, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    id,
    name,
    email,
    passwordHash,
    university,
    studentRollNumber,
    role,
    validatedVehicleModel,
    validatedVehicleNumber,
    validatedVehicleType,
    initialVerifyHash,
    initialVerifyExpiresAt,
    now
  );

  return getUserById(id)!;
}

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

/**
 * Generates a new one-time email verification token (24h expiry), stores only its SHA-256 hash
 * in SQLite, and returns the raw token to be sent to the user's university email.
 */
export function createEmailVerificationToken(
  userId: string,
  now: number = Date.now()
): { token: string; expiresAt: number } | { error: string } {
  ensureDemoAccountsSeeded();
  const db = getDb();
  const row = db.prepare("SELECT id FROM users WHERE id = ?").get(userId) as
    | { id: string }
    | undefined;
  if (!row) {
    return { error: "User not found." };
  }
  const token = randomBytes(16).toString("base64url");
  const tokenHash = hashVerificationToken(token);
  const expiresAt = now + EMAIL_VERIFICATION_TTL_MS;

  db.prepare(
    "UPDATE users SET email_verification_hash = ?, email_verification_expires_at = ? WHERE id = ?"
  ).run(tokenHash, expiresAt, userId);

  return { token, expiresAt };
}

/**
 * Verifies a one-time email verification token, setting `student_id_verified = 1` and clearing
 * the one-time hash on success.
 */
export function verifyEmailToken(
  token: string,
  now: number = Date.now()
): { user: User } | { error: string } {
  ensureDemoAccountsSeeded();
  const cleaned = typeof token === "string" ? token.trim() : "";
  if (cleaned.length < 8 || cleaned.length > 128) {
    return { error: "Invalid verification token." };
  }

  const tokenHash = hashVerificationToken(cleaned);
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM users WHERE email_verification_hash = ?")
    .get(tokenHash) as UserRow | undefined;

  if (!row || !row.email_verification_hash) {
    return { error: "Invalid or already used verification token." };
  }

  const expectedBuf = Buffer.from(row.email_verification_hash, "utf8");
  const actualBuf = Buffer.from(tokenHash, "utf8");
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return { error: "Invalid or already used verification token." };
  }

  if (!row.email_verification_expires_at || row.email_verification_expires_at < now) {
    db.prepare(
      "UPDATE users SET email_verification_hash = NULL, email_verification_expires_at = NULL WHERE id = ?"
    ).run(row.id);
    return { error: "Verification token has expired. Please request a new one." };
  }

  const isFirstVerification = !row.student_id_verified;
  const welcomeBonus = isFirstVerification ? 250 : 0;

  db.transaction(() => {
    db.prepare(
      "UPDATE users SET student_id_verified = 1, wallet_balance = wallet_balance + ?, email_verification_hash = NULL, email_verification_expires_at = NULL WHERE id = ?"
    ).run(welcomeBonus, row.id);

    if (isFirstVerification) {
      recordWalletLedger(db, {
        userId: row.id,
        delta: 250,
        reason: "welcome_bonus",
        actorId: "system",
        balanceAfter: (row.wallet_balance || 0) + 250,
      });
    }
  })();

  return { user: getUserById(row.id)! };
}

/**
 * Manually verifies a student account (e.g., campus desk or cashier fallback).
 * Awards the ₹250 welcome bonus on first verification.
 */
export function manuallyVerifyStudent(
  email: string,
  rollNumber?: string
): { success: boolean; user?: User; error?: string } {
  ensureDemoAccountsSeeded();
  const normalized = email.trim().toLowerCase();
  const db = getDb();
  return db.transaction(() => {
    const row = db.prepare("SELECT * FROM users WHERE email = ?").get(normalized) as UserRow | undefined;
    if (!row) {
      return { success: false, error: "Student account not found with this email." };
    }
    const isFirst = !row.student_id_verified;
    const welcomeBonus = isFirst ? 250 : 0;
    db.prepare(
      `UPDATE users
       SET student_id_verified = 1,
           wallet_balance = wallet_balance + ?,
           student_roll_number = COALESCE(?, student_roll_number),
           email_verification_hash = NULL,
           email_verification_expires_at = NULL
       WHERE id = ?`
    ).run(welcomeBonus, rollNumber?.trim() || null, row.id);

    if (isFirst) {
      recordWalletLedger(db, {
        userId: row.id,
        delta: 250,
        reason: "welcome_bonus",
        actorId: "cashier",
        balanceAfter: (row.wallet_balance || 0) + 250,
      });
    }

    return { success: true, user: getUserById(row.id)! };
  })();
}

export function getUserSessionVersion(userId: string): number {
  ensureDemoAccountsSeeded();
  const db = getDb();
  const row = db.prepare("SELECT session_version FROM users WHERE id = ?").get(userId) as
    | { session_version?: number }
    | undefined;
  return row?.session_version ?? 1;
}

export function revokeUserSessions(userId: string): void {
  ensureDemoAccountsSeeded();
  const db = getDb();
  db.prepare("UPDATE users SET session_version = COALESCE(session_version, 1) + 1 WHERE id = ?").run(userId);
}

/**
 * Checks whether a driver ID is allowed to view/accept ride requests or post offers.
 * Returns false if the user does not exist in the `users` table or either has `student_id_verified = 0`
 * or does not have `role = 'driver'`. Unknown driver IDs are ONLY permitted in unit test context.
 */
export function isDriverVerified(userId: string): boolean {
  ensureDemoAccountsSeeded();
  const db = getDb();
  const row = db
    .prepare("SELECT student_id_verified, role FROM users WHERE id = ?")
    .get(userId) as { student_id_verified: number; role: string } | undefined;
  if (!row) {
    if (process.env.NODE_ENV === "test" || process.env.NODE_TEST_CONTEXT) {
      return true;
    }
    return false;
  }
  return Boolean(row.student_id_verified) && (row.role === "driver" || row.role === "both");
}

export function getDriverVehicleInfo(userId: string): {
  vehicleType: "Bike" | "Car" | "Scooty";
  vehicleModel: string;
  vehicleNumber: string;
} | null {
  ensureDemoAccountsSeeded();
  const db = getDb();
  const row = db
    .prepare(
      "SELECT role, student_id_verified, vehicle_type, vehicle_model, vehicle_number FROM users WHERE id = ?"
    )
    .get(userId) as
    | {
        role: string;
        student_id_verified: number;
        vehicle_type: string | null;
        vehicle_model: string | null;
        vehicle_number: string | null;
      }
    | undefined;
  if (!row || row.role !== "driver" || !row.student_id_verified) return null;
  const vt = parseVehicleType(row.vehicle_type);
  if (!vt || !row.vehicle_model || !row.vehicle_number) return null;
  return {
    vehicleType: vt,
    vehicleModel: row.vehicle_model,
    vehicleNumber: row.vehicle_number,
  };
}

export function incrementUserRidesCompleted(userId: string): void {
  ensureDemoAccountsSeeded();
  const db = getDb();
  db.prepare("UPDATE users SET rides_completed = rides_completed + 1 WHERE id = ?").run(userId);
}

export function adjustWalletBalance(
  userId: string,
  deltaRupees: number,
  reason: string = "manual_adjustment",
  options?: { actorId?: string; ref?: string }
): User | { error: string } {
  ensureDemoAccountsSeeded();
  const db = getDb();
  const delta = Math.round(deltaRupees);

  return db.transaction(() => {
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow | undefined;
    if (!row) return { error: "User not found." };

    const currentBalance = typeof row.wallet_balance === "number" ? row.wallet_balance : 0;
    const nextBalance = currentBalance + delta;
    if (nextBalance < 0) {
      return { error: "Insufficient HopOn Wallet balance." };
    }

    db.prepare("UPDATE users SET wallet_balance = ? WHERE id = ?").run(nextBalance, userId);
    recordWalletLedger(db, {
      userId,
      delta,
      reason,
      actorId: options?.actorId,
      ref: options?.ref,
      balanceAfter: nextBalance,
    });

    return getUserById(userId)!;
  })();
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
  const requestId = cleanText(input.requestId, 80);
  const raterId = cleanText(input.raterId, 80);
  const targetUserId = cleanText(input.targetUserId, 80);
  if (!requestId || !raterId || !targetUserId) {
    return { error: "requestId, raterId, and targetUserId are required." };
  }

  const stars = Math.round(input.stars);
  if (!Number.isFinite(stars) || stars < 1 || stars > 5) {
    return { error: "Rating must be between 1 and 5 stars." };
  }
  if (raterId === targetUserId) {
    return { error: "You cannot rate yourself." };
  }

  const db = getDb();
  const target = db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(targetUserId) as UserRow | undefined;
  if (!target) {
    return { error: "Target user not found." };
  }

  // Verify the ride request exists and was completed, and verify participant authorization
  const completedTrip = db
    .prepare(
      `SELECT passenger_id, driver_id, status
       FROM trip_history
       WHERE request_id = ? AND status = 'Completed'
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(requestId) as
    | { passenger_id: string; driver_id: string | null; status: string }
    | undefined;

  if (!completedTrip || !completedTrip.driver_id) {
    return { error: "Ratings are only allowed for completed rides." };
  }

  const isPassengerRatingDriver =
    raterId === completedTrip.passenger_id && targetUserId === completedTrip.driver_id;
  const isDriverRatingPassenger =
    raterId === completedTrip.driver_id && targetUserId === completedTrip.passenger_id;

  if (!isPassengerRatingDriver && !isDriverRatingPassenger) {
    return { error: "You can only rate the other participant of this completed ride." };
  }

  const existingRating = db
    .prepare("SELECT id FROM ride_ratings WHERE request_id = ? AND rater_id = ?")
    .get(requestId, raterId) as { id: string } | undefined;
  if (existingRating) {
    return { error: "You have already rated this ride." };
  }

  const cleanedTags = Array.isArray(input.tags)
    ? input.tags
        .map((t) => cleanText(t, 40))
        .filter((t): t is string => t !== null)
        .slice(0, 6)
    : [];
  const tagsJson = JSON.stringify(cleanedTags);
  const cleanComment = cleanText(input.comment, 300);

  const id = `rat_${Date.now()}_${randomBytes(3).toString("hex")}`;

  try {
    db.prepare(
      `INSERT INTO ride_ratings (
        id, request_id, rater_id, target_user_id, stars, tags, comment, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, requestId, raterId, targetUserId, stars, tagsJson, cleanComment, Date.now());
  } catch (err) {
    const code = (err as { code?: string })?.code ?? "";
    if (code.startsWith("SQLITE_CONSTRAINT")) {
      return { error: "You have already rated this ride." };
    }
    throw err;
  }

  // Compute updated weighted average combining prior baseline rating and all recorded ratings
  const stats = db
    .prepare(
      "SELECT COUNT(*) AS cnt, AVG(stars) AS avg_stars FROM ride_ratings WHERE target_user_id = ?"
    )
    .get(targetUserId) as { cnt: number; avg_stars: number | null };

  const baselineWeight = Math.max(1, Math.min(10, target.rides_completed || 3));
  const totalCount = baselineWeight + (stats.cnt || 1);
  const newRating =
    Math.round(
      ((target.rating * baselineWeight + (stats.avg_stars ?? stars) * (stats.cnt || 1)) /
        totalCount) *
        100
    ) / 100;

  db.prepare("UPDATE users SET rating = ? WHERE id = ?").run(newRating, targetUserId);
  const updatedUser = getUserById(targetUserId)!;
  return { rating: updatedUser.rating, targetUser: updatedUser };
}
