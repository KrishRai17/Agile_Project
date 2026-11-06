/**
 * SQLite database engine for HopOn (powered by better-sqlite3 in WAL mode).
 *
 * Automatically creates `.data/hopon.sqlite` (or the path in `HOPON_DB_FILE`, or `:memory:`) and
 * initializes the relational schema for:
 *  - `users`            (verified students & student drivers, credentials, wallet, ratings, completed ride counts)
 *  - `ride_offers`      (active/full/cancelled driver seat offers)
 *  - `ride_requests`    (student ride requests, 4-digit OTPs, arrival & trip stage progression)
 *  - `driver_locations` (real-time GPS telemetry for riders and passengers)
 *  - `trip_history`     (completed & cancelled ride receipts for passengers and drivers)
 *  - `ride_messages`    (in-ride real-time chat messages & quick replies)
 *  - `ride_ratings`     (2-way post-ride 1–5 star ratings and feedback tags)
 */
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import type BetterSqlite3 from "better-sqlite3";

const require = createRequire(join(process.cwd(), "package.json"));
const Database = require("better-sqlite3") as typeof BetterSqlite3;

export function resolveDbPath(): string {
  const envPath = process.env.HOPON_DB_FILE?.trim();
  if (envPath) {
    return envPath === ":memory:" ? ":memory:" : resolve(envPath);
  }
  // Use in-memory SQLite during isolated unit test runs unless HOPON_DB_FILE is explicitly set
  if (process.env.NODE_TEST_CONTEXT) {
    return ":memory:";
  }
  return resolve(process.cwd(), ".data", "hopon.sqlite");
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  university TEXT NOT NULL DEFAULT 'Kristu Jayanti University',
  student_id_verified INTEGER NOT NULL DEFAULT 0,
  student_roll_number TEXT,
  wallet_balance INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 5.0,
  rides_completed INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL CHECK(role IN ('passenger', 'driver', 'both')),
  vehicle_model TEXT,
  vehicle_number TEXT,
  vehicle_type TEXT,
  email_verification_hash TEXT,
  email_verification_expires_at INTEGER,
  session_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS ride_offers (
  id TEXT PRIMARY KEY,
  driver_id TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  driver_university TEXT NOT NULL,
  driver_rating REAL NOT NULL,
  vehicle_model TEXT NOT NULL,
  vehicle_number TEXT NOT NULL,
  vehicle_type TEXT NOT NULL CHECK(vehicle_type IN ('Bike', 'Car', 'Scooty')),
  origin TEXT NOT NULL,
  from_lat REAL NOT NULL,
  from_lng REAL NOT NULL,
  destination TEXT NOT NULL,
  to_lat REAL NOT NULL,
  to_lng REAL NOT NULL,
  departure_time TEXT NOT NULL,
  departure_date TEXT NOT NULL,
  seats INTEGER NOT NULL,
  seats_left INTEGER NOT NULL,
  fare_per_seat TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active', 'full', 'cancelled')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ride_offers_status ON ride_offers(status);
CREATE INDEX IF NOT EXISTS idx_ride_offers_driver ON ride_offers(driver_id);

CREATE TABLE IF NOT EXISTS ride_requests (
  id TEXT PRIMARY KEY,
  offer_id TEXT,
  declined_by TEXT NOT NULL DEFAULT '[]',
  passenger_id TEXT NOT NULL,
  passenger_name TEXT NOT NULL,
  passenger_rating REAL NOT NULL,
  pickup TEXT NOT NULL,
  pickup_lat REAL NOT NULL,
  pickup_lng REAL NOT NULL,
  dropoff TEXT NOT NULL,
  dropoff_lat REAL NOT NULL,
  dropoff_lng REAL NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'rejected', 'cancelled', 'completed')),
  note TEXT,
  agreed_fare TEXT,
  otp TEXT,
  otp_attempts INTEGER NOT NULL DEFAULT 0,
  otp_locked_until INTEGER,
  share_token TEXT,
  trip_stage TEXT CHECK(trip_stage IN ('en_route_pickup', 'arrived_pickup', 'in_progress')),
  arrived_at INTEGER,
  started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  responded_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ride_requests_passenger ON ride_requests(passenger_id);
CREATE INDEX IF NOT EXISTS idx_ride_requests_offer ON ride_requests(offer_id);
CREATE INDEX IF NOT EXISTS idx_ride_requests_status ON ride_requests(status);

CREATE TABLE IF NOT EXISTS driver_locations (
  driver_id TEXT PRIMARY KEY,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  heading REAL,
  speed REAL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trip_history (
  id TEXT PRIMARY KEY,
  request_id TEXT,
  offer_id TEXT,
  passenger_id TEXT NOT NULL,
  passenger_name TEXT NOT NULL,
  driver_id TEXT,
  driver_name TEXT,
  vehicle TEXT NOT NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  amount TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('Completed', 'Cancelled')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trip_history_passenger ON trip_history(passenger_id);
CREATE INDEX IF NOT EXISTS idx_trip_history_driver ON trip_history(driver_id);

CREATE TABLE IF NOT EXISTS ride_messages (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK(sender_role IN ('passenger', 'driver')),
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ride_messages_request ON ride_messages(request_id);

CREATE TABLE IF NOT EXISTS ride_ratings (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  rater_id TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
  tags TEXT NOT NULL DEFAULT '[]',
  comment TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(request_id, rater_id)
);

CREATE INDEX IF NOT EXISTS idx_ride_ratings_target ON ride_ratings(target_user_id);

CREATE TABLE IF NOT EXISTS verification_audit (
  id TEXT PRIMARY KEY,
  student_email TEXT,
  roll_number TEXT,
  method TEXT NOT NULL,
  ip TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verification_audit_email ON verification_audit(student_email);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  actor_id TEXT,
  ref TEXT,
  balance_after INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user ON wallet_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_created ON wallet_ledger(created_at);
`;

interface GlobalDbHolder {
  __hoponSqliteDb?: BetterSqlite3.Database;
  __hoponSqlitePath?: string;
}

const globalForDb = globalThis as unknown as GlobalDbHolder;

function ensureUserColumns(db: BetterSqlite3.Database): void {
  const cols = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("student_roll_number")) {
    db.exec("ALTER TABLE users ADD COLUMN student_roll_number TEXT");
  }
  if (!names.has("wallet_balance")) {
    db.exec("ALTER TABLE users ADD COLUMN wallet_balance INTEGER NOT NULL DEFAULT 250");
  }
  if (!names.has("email_verification_hash")) {
    db.exec("ALTER TABLE users ADD COLUMN email_verification_hash TEXT");
  }
  if (!names.has("email_verification_expires_at")) {
    db.exec("ALTER TABLE users ADD COLUMN email_verification_expires_at INTEGER");
  }
  if (!names.has("session_version")) {
    db.exec("ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1");
  }

  // Widen role CHECK constraint to include 'both' if existing DB table was created with only ('passenger', 'driver')
  const userTableSqlRow = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get() as { sql?: string } | undefined;
  if (userTableSqlRow?.sql && !userTableSqlRow.sql.includes("'both'")) {
    db.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        university TEXT NOT NULL DEFAULT 'Kristu Jayanti University',
        student_id_verified INTEGER NOT NULL DEFAULT 0,
        student_roll_number TEXT,
        wallet_balance INTEGER NOT NULL DEFAULT 0,
        rating REAL NOT NULL DEFAULT 5.0,
        rides_completed INTEGER NOT NULL DEFAULT 0,
        role TEXT NOT NULL CHECK(role IN ('passenger', 'driver', 'both')),
        vehicle_model TEXT,
        vehicle_number TEXT,
        vehicle_type TEXT,
        email_verification_hash TEXT,
        email_verification_expires_at INTEGER,
        session_version INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );
      INSERT INTO users_new (
        id, name, email, password_hash, university, student_id_verified,
        student_roll_number, wallet_balance, rating, rides_completed, role,
        vehicle_model, vehicle_number, vehicle_type,
        email_verification_hash, email_verification_expires_at, session_version, created_at
      )
      SELECT
        id, name, email, password_hash, university, student_id_verified,
        student_roll_number, wallet_balance, rating, rides_completed, role,
        vehicle_model, vehicle_number, vehicle_type,
        email_verification_hash, email_verification_expires_at,
        COALESCE(session_version, 1), created_at
      FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      COMMIT;
    `);
  }
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_history_completed_request ON trip_history(request_id) WHERE status = 'Completed'"
  );

  db.exec(`
    CREATE TABLE IF NOT EXISTS wallet_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      actor_id TEXT,
      ref TEXT,
      balance_after INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user ON wallet_ledger(user_id);
    CREATE INDEX IF NOT EXISTS idx_wallet_ledger_created ON wallet_ledger(created_at);
  `);

  const reqCols = db.prepare("PRAGMA table_info(ride_requests)").all() as Array<{ name: string }>;
  const reqNames = new Set(reqCols.map((c) => c.name));
  if (!reqNames.has("otp_attempts")) {
    db.exec("ALTER TABLE ride_requests ADD COLUMN otp_attempts INTEGER NOT NULL DEFAULT 0");
  }
  if (!reqNames.has("otp_locked_until")) {
    db.exec("ALTER TABLE ride_requests ADD COLUMN otp_locked_until INTEGER");
  }
  if (!reqNames.has("share_token")) {
    db.exec("ALTER TABLE ride_requests ADD COLUMN share_token TEXT");
    db.exec("CREATE INDEX IF NOT EXISTS idx_ride_requests_share_token ON ride_requests(share_token)");
  }
  if (!reqNames.has("agreed_fare")) {
    db.exec("ALTER TABLE ride_requests ADD COLUMN agreed_fare TEXT");
  }
  if (!reqNames.has("completed_at")) {
    db.exec("ALTER TABLE ride_requests ADD COLUMN completed_at INTEGER");
  }

  const tableSqlRow = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ride_requests'")
    .get() as { sql?: string } | undefined;
  if (tableSqlRow?.sql && !tableSqlRow.sql.includes("'completed'")) {
    db.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE ride_requests_new (
        id TEXT PRIMARY KEY,
        offer_id TEXT,
        declined_by TEXT NOT NULL DEFAULT '[]',
        passenger_id TEXT NOT NULL,
        passenger_name TEXT NOT NULL,
        passenger_rating REAL NOT NULL,
        pickup TEXT NOT NULL,
        pickup_lat REAL NOT NULL,
        pickup_lng REAL NOT NULL,
        dropoff TEXT NOT NULL,
        dropoff_lat REAL NOT NULL,
        dropoff_lng REAL NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'rejected', 'cancelled', 'completed')),
        note TEXT,
        agreed_fare TEXT,
        otp TEXT,
        otp_attempts INTEGER NOT NULL DEFAULT 0,
        otp_locked_until INTEGER,
        share_token TEXT,
        trip_stage TEXT CHECK(trip_stage IN ('en_route_pickup', 'arrived_pickup', 'in_progress')),
        arrived_at INTEGER,
        started_at INTEGER,
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        responded_at INTEGER
      );
      INSERT INTO ride_requests_new (
        id, offer_id, declined_by, passenger_id, passenger_name, passenger_rating,
        pickup, pickup_lat, pickup_lng, dropoff, dropoff_lat, dropoff_lng,
        status, note, agreed_fare, otp, otp_attempts, otp_locked_until, share_token,
        trip_stage, arrived_at, started_at, completed_at, created_at, responded_at
      )
      SELECT
        id, offer_id, declined_by, passenger_id, passenger_name, passenger_rating,
        pickup, pickup_lat, pickup_lng, dropoff, dropoff_lat, dropoff_lng,
        status, note, agreed_fare, otp, otp_attempts, otp_locked_until, share_token,
        trip_stage, arrived_at, started_at, completed_at, created_at, responded_at
      FROM ride_requests;
      DROP TABLE ride_requests;
      ALTER TABLE ride_requests_new RENAME TO ride_requests;
      CREATE INDEX IF NOT EXISTS idx_ride_requests_passenger ON ride_requests(passenger_id);
      CREATE INDEX IF NOT EXISTS idx_ride_requests_offer ON ride_requests(offer_id);
      CREATE INDEX IF NOT EXISTS idx_ride_requests_status ON ride_requests(status);
      CREATE INDEX IF NOT EXISTS idx_ride_requests_share_token ON ride_requests(share_token);
      COMMIT;
    `);
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_ride_requests_share_token ON ride_requests(share_token)");
  db.exec(`
    CREATE TABLE IF NOT EXISTS verification_audit (
      id TEXT PRIMARY KEY,
      student_email TEXT,
      roll_number TEXT,
      method TEXT NOT NULL,
      ip TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_verification_audit_email ON verification_audit(student_email);
  `);
}

export function getDb(): BetterSqlite3.Database {
  const targetPath = resolveDbPath();
  if (globalForDb.__hoponSqliteDb && globalForDb.__hoponSqlitePath === targetPath) {
    return globalForDb.__hoponSqliteDb;
  }

  if (targetPath !== ":memory:") {
    mkdirSync(dirname(targetPath), { recursive: true });
  }

  const db = new Database(targetPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  db.exec(SCHEMA_SQL);
  ensureUserColumns(db);

  globalForDb.__hoponSqliteDb = db;
  globalForDb.__hoponSqlitePath = targetPath;
  return db;
}

export function getDatabaseStats(): {
  engine: string;
  storage: string;
  users: number;
  activeOffers: number;
  totalOffers: number;
  pendingRequests: number;
  acceptedRequests: number;
  completedRequests: number;
  completedTrips: number;
  driverLocations: number;
  messages: number;
  ratings: number;
} {
  const db = getDb();
  const resolved = resolveDbPath();
  const count = (sql: string): number => {
    const row = db.prepare(sql).get() as { c: number } | undefined;
    return row?.c ?? 0;
  };
  return {
    engine: "SQLite 3 (WAL)",
    storage: resolved === ":memory:" ? ":memory:" : "sqlite-file",
    users: count("SELECT COUNT(*) AS c FROM users"),
    activeOffers: count("SELECT COUNT(*) AS c FROM ride_offers WHERE status = 'active'"),
    totalOffers: count("SELECT COUNT(*) AS c FROM ride_offers"),
    pendingRequests: count("SELECT COUNT(*) AS c FROM ride_requests WHERE status = 'pending'"),
    acceptedRequests: count("SELECT COUNT(*) AS c FROM ride_requests WHERE status = 'accepted'"),
    completedRequests: count("SELECT COUNT(*) AS c FROM ride_requests WHERE status = 'completed'"),
    completedTrips: count("SELECT COUNT(*) AS c FROM trip_history WHERE status = 'Completed'"),
    driverLocations: count("SELECT COUNT(*) AS c FROM driver_locations"),
    messages: count("SELECT COUNT(*) AS c FROM ride_messages"),
    ratings: count("SELECT COUNT(*) AS c FROM ride_ratings"),
  };
}

export function recordVerificationAudit(params: {
  studentEmail?: string | null;
  rollNumber?: string | null;
  method: string;
  ip: string;
}): void {
  const db = getDb();
  const id = `va_${Date.now()}_${randomBytes(4).toString("hex")}`;
  db.prepare(`
    INSERT INTO verification_audit (id, student_email, roll_number, method, ip, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.studentEmail || null,
    params.rollNumber || null,
    params.method,
    params.ip,
    Date.now()
  );
}

export interface WalletLedgerParams {
  userId: string;
  delta: number;
  reason: string;
  actorId?: string | null;
  ref?: string | null;
  balanceAfter: number;
  createdAt?: number;
}

export function recordWalletLedger(
  db: BetterSqlite3.Database,
  params: WalletLedgerParams
): void {
  const id = `wled_${Date.now()}_${randomBytes(4).toString("hex")}`;
  db.prepare(`
    INSERT INTO wallet_ledger (id, user_id, delta, reason, actor_id, ref, balance_after, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.userId,
    Math.round(params.delta),
    params.reason,
    params.actorId || null,
    params.ref || null,
    Math.round(params.balanceAfter),
    params.createdAt ?? Date.now()
  );
}


