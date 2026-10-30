import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./support/load-ts.mjs";

// These load the REAL source files, so they fail if the app code regresses.
const session = await loadTs("lib/session.ts");
const accounts = await loadTs("lib/accounts.ts");
const db = await loadTs("lib/db.ts");
const rate = await loadTs("lib/rateLimit.ts");
const ttl = await loadTs("lib/ttlCache.ts");
const validate = await loadTs("lib/validate.ts");
const campus = await loadTs("lib/campus.ts");

const SECRET = "unit-test-secret-0123456789";
const NOW = 1_800_000_000_000; // fixed clock in ms

// ---------- sessions ----------

test("a session token round-trips and carries the user id", () => {
  const token = session.createSessionToken("usr_1", 60, SECRET, NOW);
  const payload = session.verifySessionToken(token, SECRET, NOW + 30_000);
  assert.equal(payload.uid, "usr_1");
  assert.equal(payload.exp - payload.iat, 60);
});

test("expired tokens and tokens signed with another secret are rejected", () => {
  const token = session.createSessionToken("usr_1", 60, SECRET, NOW);
  assert.equal(session.verifySessionToken(token, SECRET, NOW + 61_000), null, "expired");
  assert.equal(session.verifySessionToken(token, "a-different-secret-value", NOW), null, "wrong secret");
});

test("forged or malformed tokens are rejected", () => {
  const token = session.createSessionToken("usr_krish_rai_01", 60, SECRET, NOW);
  const [, signature] = token.split(".");

  // Swap in a payload for another user but keep the old signature
  const forgedBody = Buffer.from(
    JSON.stringify({ uid: "usr_driver_demo_01", iat: 1, exp: 4_000_000_000 })
  ).toString("base64url");
  assert.equal(session.verifySessionToken(`${forgedBody}.${signature}`, SECRET, NOW), null);

  for (const bad of ["", "abc", "a.b.c", ".", "a.", ".b", null, undefined, "x".repeat(3000)]) {
    assert.equal(session.verifySessionToken(bad, SECRET, NOW), null, `should reject ${String(bad).slice(0, 10)}`);
  }
});

test("getSessionSecret demands a real secret in production only", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalSecret = process.env.SESSION_SECRET;
  try {
    process.env.NODE_ENV = "production";
    delete process.env.SESSION_SECRET;
    assert.throws(() => session.getSessionSecret(), /SESSION_SECRET/);

    process.env.SESSION_SECRET = "too-short";
    assert.throws(() => session.getSessionSecret(), /SESSION_SECRET/);

    process.env.SESSION_SECRET = "a-long-enough-production-secret";
    assert.equal(session.getSessionSecret(), "a-long-enough-production-secret");

    process.env.NODE_ENV = "development";
    delete process.env.SESSION_SECRET;
    assert.ok(session.getSessionSecret().length >= 16, "dev falls back to a built-in secret");
  } finally {
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
  }
});

// ---------- accounts ----------

test("authenticate accepts the demo accounts and rejects everything else", () => {
  delete process.env.HOPON_DEMO_PASSWORD;
  const student = accounts.authenticate("student@hopon.demo", "hopon123");
  assert.equal(student.id, "usr_krish_rai_01");
  assert.equal(student.role, "passenger");
  assert.equal(accounts.authenticate("  DRIVER@Hopon.Demo ", "hopon123").role, "driver");

  assert.equal(accounts.authenticate("student@hopon.demo", "wrong"), null);
  assert.equal(accounts.authenticate("nobody@hopon.demo", "hopon123"), null);
  assert.equal(accounts.authenticate("student@hopon.demo", ""), null);
  assert.equal(accounts.authenticate("nobody@hopon.demo", "no-such-account-placeholder"), null);
});

test("the demo password can be overridden with HOPON_DEMO_PASSWORD", () => {
  process.env.HOPON_DEMO_PASSWORD = "another-password";
  try {
    assert.equal(accounts.authenticate("student@hopon.demo", "hopon123"), null);
    assert.ok(accounts.authenticate("student@hopon.demo", "another-password"));
  } finally {
    delete process.env.HOPON_DEMO_PASSWORD;
  }
});

test("account lookups return copies and never expose passwords", () => {
  const user = accounts.getUserById("usr_driver_demo_01");
  assert.equal(user.name, "Aarav Mehta");
  assert.ok(!("password" in user));
  user.name = "Changed";
  assert.equal(accounts.getUserById("usr_driver_demo_01").name, "Aarav Mehta");
  assert.equal(accounts.getUserById("usr_unknown"), null);
});

test("registerUser creates a new SQLite user and authenticates with hashed password", () => {
  const created = accounts.registerUser({
    name: "Ananya Verma",
    email: "ananya.verma@kju.edu",
    password: "securePass123",
    role: "passenger",
    university: "Kristu Jayanti University",
    studentRollNumber: "23bcac45",
  });
  assert.ok(!("error" in created), "registration succeeds");
  assert.equal(created.name, "Ananya Verma");
  assert.equal(created.email, "ananya.verma@kju.edu");
  assert.equal(created.role, "passenger");
  assert.equal(created.studentRollNumber, "23BCAC45");
  assert.equal(created.walletBalance, 250);

  // Duplicate email is rejected
  const dup = accounts.registerUser({
    name: "Duplicate",
    email: "ANANYA.VERMA@kju.edu",
    password: "anotherPassword",
    role: "driver",
  });
  assert.ok("error" in dup);

  // Can authenticate with the newly registered account
  const authed = accounts.authenticate("ananya.verma@kju.edu", "securePass123");
  assert.ok(authed);
  assert.equal(authed.id, created.id);
  assert.equal(accounts.authenticate("ananya.verma@kju.edu", "wrongPass"), null);

  // Wallet balance can be paid and topped up
  const paid = accounts.adjustWalletBalance(created.id, -60);
  assert.ok(!("error" in paid));
  assert.equal(paid.walletBalance, 190);
  assert.ok("error" in accounts.adjustWalletBalance(created.id, -500), "blocks overdraft");

  // 2-way post-ride rating updates target user rating
  const rated = accounts.submitUserRating({
    requestId: "req_test_rating_1",
    raterId: created.id,
    targetUserId: "usr_driver_demo_01",
    stars: 5,
    tags: ["Safe Driver", "On Time"],
    comment: "Great campus ride!",
  });
  assert.ok(!("error" in rated));
  assert.ok(rated.rating >= 4.8 && rated.rating <= 5.0);

  // Database stats report tables
  const stats = db.getDatabaseStats();
  assert.equal(stats.engine, "SQLite 3 (WAL)");
  assert.ok(stats.users >= 5);
  assert.ok(stats.ratings >= 1);
});

// ---------- rate limiting ----------

test("rate limiter blocks after the limit and recovers when the window ends", () => {
  const limiter = rate.createRateLimiter({ limit: 3, windowMs: 1000 });
  assert.equal(limiter.check("k", NOW).allowed, true);
  assert.equal(limiter.check("k", NOW).allowed, true);
  const third = limiter.check("k", NOW);
  assert.equal(third.allowed, true);
  assert.equal(third.remaining, 0);

  const blocked = limiter.check("k", NOW + 100);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 1);

  assert.equal(limiter.check("other", NOW + 100).allowed, true, "keys are independent");
  assert.equal(limiter.check("k", NOW + 1001).allowed, true, "new window");
});

test("rate limiter reset() clears a key and maxKeys bounds memory", () => {
  const limiter = rate.createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 3 });
  assert.equal(limiter.check("a", NOW).allowed, true);
  assert.equal(limiter.check("a", NOW).allowed, false);
  limiter.reset("a");
  assert.equal(limiter.check("a", NOW).allowed, true);

  for (let i = 0; i < 20; i++) limiter.check(`key${i}`, NOW);
  assert.ok(limiter.size() <= 3, `size ${limiter.size()} should stay within maxKeys`);
});

test("clientIp prefers the first X-Forwarded-For entry", () => {
  const headers = (map) => ({ get: (name) => map[name] ?? null });
  assert.equal(rate.clientIp(headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" })), "1.2.3.4");
  assert.equal(rate.clientIp(headers({ "x-real-ip": " 5.6.7.8 " })), "5.6.7.8");
  assert.equal(rate.clientIp(headers({})), "unknown");
});

// ---------- bounded cache ----------

test("ttl cache expires entries and never exceeds its size", () => {
  const cache = ttl.createTtlCache(3);
  cache.set("a", 1, 1000, NOW);
  assert.equal(cache.get("a", NOW + 500), 1);
  assert.equal(cache.get("a", NOW + 1000), undefined, "expired");

  for (let i = 0; i < 10; i++) cache.set(`k${i}`, i, 60_000, NOW);
  assert.ok(cache.size() <= 3, `size ${cache.size()} should stay within the cap`);
  assert.equal(cache.get("k9", NOW), 9, "newest entry is kept");
  assert.equal(cache.get("k0", NOW), undefined, "oldest entry was evicted");
});

// ---------- validation ----------

test("coordinate validation rejects non-numbers and out-of-range values", () => {
  assert.ok(validate.isValidLatLng(13.05, 77.64));
  assert.ok(!validate.isValidLatLng(91, 0));
  assert.ok(!validate.isValidLatLng(0, 181));
  assert.ok(!validate.isValidLatLng(NaN, 0));
  assert.ok(!validate.isValidLatLng("13", "77"));

  assert.deepEqual(validate.parseLngLat("77.6426,13.0583"), [77.6426, 13.0583]);
  for (const bad of ["", ",", "abc,1", "200,10", "1,2,3", "77.6,"]) {
    assert.equal(validate.parseLngLat(bad), null, `should reject "${bad}"`);
  }
});

test("route point lists are capped and validated", () => {
  assert.equal(validate.parseLngLatList("77.6,13.0;77.7,13.1").length, 2);
  assert.equal(validate.parseLngLatList("77.6,13.0;bad"), null);
  assert.equal(validate.parseLngLatList(""), null);
  const tooMany = Array.from({ length: validate.MAX_ROUTE_POINTS + 1 }, () => "77.6,13.0").join(";");
  assert.equal(validate.parseLngLatList(tooMany), null);
});

test("cleanText trims, strips control characters and caps length", () => {
  assert.equal(validate.cleanText("  Main   Gate\n\t1  ", 50), "Main Gate 1");
  assert.equal(validate.cleanText("a\u0000b", 50), "a b");
  assert.equal(validate.cleanText("abcdefghij", 5), "abcde");
  assert.equal(validate.cleanText("   ", 5), null);
  assert.equal(validate.cleanText(42, 5), null);
  assert.equal(validate.cleanText(undefined, 5), null);
});

test("seats depend on vehicle type and must be whole numbers", () => {
  assert.equal(validate.parseSeats(3, "Car"), 3);
  assert.equal(validate.parseSeats("4", "Car"), 4);
  assert.equal(validate.parseSeats(7, "Car"), null);
  assert.equal(validate.parseSeats(0, "Car"), null);
  assert.equal(validate.parseSeats(2.5, "Car"), null);
  assert.equal(validate.parseSeats(NaN, "Car"), null);
  assert.equal(validate.parseSeats(1, "Bike"), 1);
  assert.equal(validate.parseSeats(2, "Scooty"), null);

  assert.equal(validate.parseVehicleType("Car"), "Car");
  assert.equal(validate.parseVehicleType("Truck"), null);
  assert.equal(validate.parseVehicleType(undefined), null);
});

test("fares must be sensible whole-rupee amounts", () => {
  assert.equal(validate.parseFare("50"), "50");
  assert.equal(validate.parseFare(49.6), "50");
  assert.equal(validate.parseFare(0), "0");
  for (const bad of [-1, 2001, "abc", "", null, undefined, NaN, Infinity]) {
    assert.equal(validate.parseFare(bad), null, `should reject ${String(bad)}`);
  }
});

test("optional coordinates fall back only when both are missing", () => {
  const fallback = { lat: 13.0583, lng: 77.6426 };
  assert.deepEqual(validate.resolveCoords(undefined, undefined, fallback), fallback);
  assert.deepEqual(validate.resolveCoords(13.1, 77.5, fallback), { lat: 13.1, lng: 77.5 });
  assert.equal(validate.resolveCoords(13.1, undefined, fallback), null);
  assert.equal(validate.resolveCoords(200, 77.5, fallback), null);
});

test("optional numbers stay undefined when absent and reject out-of-range values", () => {
  assert.equal(validate.parseOptionalNumber(undefined, 0, 360), undefined);
  assert.equal(validate.parseOptionalNumber(90, 0, 360), 90);
  assert.equal(validate.parseOptionalNumber(361, 0, 360), null);
  assert.equal(validate.parseOptionalNumber("abc", 0, 360), null);
});

// ---------- campus helpers ----------

test("campus helpers recognise gates and the campus area", () => {
  assert.equal(campus.matchCampusSpot(13.0583, 77.6426), "KJU Main Gate 1");
  assert.equal(campus.matchCampusSpot(13.0628, 77.6433), "KJU Gate 2 (Sports Arena)");
  assert.equal(campus.matchCampusSpot(12.9797, 77.5908), null, "Vidhana Soudha is not a campus spot");

  assert.ok(campus.isOnCampus(13.0583, 77.6426));
  assert.ok(!campus.isOnCampus(campus.MANYATA_COORDS.lat, campus.MANYATA_COORDS.lng));
  assert.equal(campus.metersBetween(13.05, 77.64, 13.05, 77.64), 0);
});
