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
  student_id_verified INTEGER NOT NULL DEFAULT 1,
  student_roll_number TEXT,
  wallet_balance INTEGER NOT NULL DEFAULT 250,
  rating REAL NOT NULL DEFAULT 5.0,
  rides_completed INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL CHECK(role IN ('passenger', 'driver')),
  vehicle_model TEXT,
  vehicle_number TEXT,
  vehicle_type TEXT,
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
  status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  note TEXT,
  otp TEXT,
  trip_stage TEXT CHECK(trip_stage IN ('en_route_pickup', 'arrived_pickup', 'in_progress')),
  arrived_at INTEGER,
  started_at INTEGER,
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
  path: string;
  users: number;
  activeOffers: number;
  totalOffers: number;
  pendingRequests: number;
  acceptedRequests: number;
  completedTrips: number;
  driverLocations: number;
  messages: number;
  ratings: number;
} {
  const db = getDb();
  const count = (sql: string): number => {
    const row = db.prepare(sql).get() as { c: number } | undefined;
    return row?.c ?? 0;
  };
  return {
    engine: "SQLite 3 (WAL)",
    path: resolveDbPath(),
    users: count("SELECT COUNT(*) AS c FROM users"),
    activeOffers: count("SELECT COUNT(*) AS c FROM ride_offers WHERE status = 'active'"),
    totalOffers: count("SELECT COUNT(*) AS c FROM ride_offers"),
    pendingRequests: count("SELECT COUNT(*) AS c FROM ride_requests WHERE status = 'pending'"),
    acceptedRequests: count("SELECT COUNT(*) AS c FROM ride_requests WHERE status = 'accepted'"),
    completedTrips: count("SELECT COUNT(*) AS c FROM trip_history WHERE status = 'Completed'"),
    driverLocations: count("SELECT COUNT(*) AS c FROM driver_locations"),
    messages: count("SELECT COUNT(*) AS c FROM ride_messages"),
    ratings: count("SELECT COUNT(*) AS c FROM ride_ratings"),
  };
}
