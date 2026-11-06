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
  assert.equal(created.walletBalance, 0, "unverified accounts start with ₹0 wallet balance");

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

  // Verifying student email unlocks ₹250 welcome bonus
  const tok = accounts.createEmailVerificationToken(created.id);
  assert.ok(!("error" in tok));
  const verified = accounts.verifyEmailToken(tok.token);
  assert.ok(!("error" in verified));
  assert.equal(verified.user.walletBalance, 250);

  // Wallet balance can be paid and topped up
  const paid = accounts.adjustWalletBalance(created.id, -60);
  assert.ok(!("error" in paid));
  assert.equal(paid.walletBalance, 190);
  assert.ok("error" in accounts.adjustWalletBalance(created.id, -500), "blocks overdraft");

  // 2-way post-ride rating requires a Completed trip in trip_history for that request and participants
  assert.ok(
    "error" in
      accounts.submitUserRating({
        requestId: "req_nonexistent",
        raterId: created.id,
        targetUserId: "usr_driver_demo_01",
        stars: 5,
      }),
    "rejects rating when ride was not completed"
  );

  db.getDb()
    .prepare(
      `INSERT INTO trip_history (
        id, request_id, offer_id, passenger_id, passenger_name,
        driver_id, driver_name, vehicle, origin, destination, amount, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Completed', ?)`
    )
    .run(
      "trip_test_rating_1",
      "req_test_rating_1",
      "offer_seed_001",
      created.id,
      created.name,
      "usr_driver_demo_01",
      "Aarav Mehta",
      "HopOn Car (White Swift Dzire)",
      "Kristu Jayanti University",
      "Manyata Tech Park",
      "₹75",
      Date.now()
    );

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

  // Duplicate rating for the same (requestId, raterId) is rejected
  const dupRating = accounts.submitUserRating({
    requestId: "req_test_rating_1",
    raterId: created.id,
    targetUserId: "usr_driver_demo_01",
    stars: 1,
  });
  assert.ok("error" in dupRating, "duplicate rating rejected");

  // Stranger who was not part of the ride cannot rate either participant
  const strangerRating = accounts.submitUserRating({
    requestId: "req_test_rating_1",
    raterId: "usr_driver_demo_02",
    targetUserId: "usr_driver_demo_01",
    stars: 1,
  });
  assert.ok("error" in strangerRating, "non-participant cannot rate");

  // Participant cannot rate someone who wasn't the other participant on that request
  const wrongTargetRating = accounts.submitUserRating({
    requestId: "req_test_rating_1",
    raterId: created.id,
    targetUserId: "usr_driver_demo_02",
    stars: 5,
  });
  assert.ok("error" in wrongTargetRating, "wrong target user rejected");

  // Accepting driver CAN rate the passenger of that completed request
  const driverRatesPassenger = accounts.submitUserRating({
    requestId: "req_test_rating_1",
    raterId: "usr_driver_demo_01",
    targetUserId: created.id,
    stars: 5,
    tags: ["Polite", "On Time", "Extra1", "Extra2", "Extra3", "Extra4", "Extra5_Dropped"],
    comment: "x".repeat(400),
  });
  assert.ok(!("error" in driverRatesPassenger));

  // Verify tags and comment were capped in SQLite
  const ratingRow = db
    .getDb()
    .prepare("SELECT tags, comment FROM ride_ratings WHERE request_id = ? AND rater_id = ?")
    .get("req_test_rating_1", "usr_driver_demo_01");
  assert.equal(JSON.parse(ratingRow.tags).length, 6, "tags capped at 6");
  assert.equal(ratingRow.comment.length, 300, "comment capped at 300 chars");

  // Database stats report tables without leaking the absolute filesystem path
  const stats = db.getDatabaseStats();
  assert.equal(stats.engine, "SQLite 3 (WAL)");
  assert.ok(!("path" in stats), "getDatabaseStats must not return absolute path");
  assert.ok(stats.users >= 5);
  assert.ok(stats.ratings >= 1);
});

test("account pre-hijacking fix: re-registering a pending email is refused while active, allowed when expired", () => {
  const email = `prehijack.${Date.now()}@kju.edu`;
  // 1. Initial registration creates unverified account with active verification TTL
  const userA = accounts.registerUser({
    name: "Initial Student",
    email,
    password: "studentPassword123",
    role: "passenger",
  });
  assert.ok(!("error" in userA));
  assert.equal(userA.studentIdVerified, false);

  // 2. Re-registering while verification is pending is refused to prevent hijacking
  const pendingAttempt = accounts.registerUser({
    name: "Attacker Hijack",
    email,
    password: "attackerPassword456",
    role: "passenger",
  });
  assert.ok("error" in pendingAttempt);
  assert.equal(
    pendingAttempt.error,
    "A verification email was already sent. Check your inbox or wait for it to expire."
  );

  // 3. Simulate token expiration in DB
  const dbConn = db.getDb();
  dbConn.prepare("UPDATE users SET email_verification_expires_at = ? WHERE email = ?").run(
    Date.now() - 1000,
    email
  );

  // 4. Now that the token is expired, re-registration succeeds and refreshes credentials
  const refreshed = accounts.registerUser({
    name: "Refreshed Student",
    email,
    password: "refreshedPassword789",
    role: "passenger",
  });
  assert.ok(!("error" in refreshed));
  assert.equal(refreshed.id, userA.id, "re-uses user ID");
  assert.equal(refreshed.name, "Refreshed Student");

  // 5. Verification succeeds with new token
  const token = accounts.createEmailVerificationToken(refreshed.id);
  assert.ok(!("error" in token));
  const verified = accounts.verifyEmailToken(token.token);
  assert.ok(!("error" in verified));
  assert.equal(verified.user.studentIdVerified, true);
  assert.equal(verified.user.walletBalance, 250);

  // 6. Once verified, further duplicate registration attempts are blocked
  const dupBlocked = accounts.registerUser({
    name: "Third Party",
    email,
    password: "anotherPassword789",
    role: "passenger",
  });
  assert.ok("error" in dupBlocked);
  assert.equal(dupBlocked.error, "An account with this email already exists.");
});

test("registers a 'both' (rider & passenger) user with vehicle details and unlocks dual role upon verification", () => {
  const email = `both.user.${Date.now()}@kju.edu`;
  const registered = accounts.registerUser({
    name: "Dual Role Student",
    email,
    password: "dualRolePass123",
    role: "both",
    vehicleType: "Bike",
    vehicleModel: "Yamaha FZ",
    vehicleNumber: "KA 03 HA 4321",
  });

  assert.ok(!("error" in registered), "both role registration succeeds in SQLite");
  assert.equal(registered.email, email);
  // Unverified defaults to passenger role until email verification
  assert.equal(registered.role, "passenger");
  assert.equal(registered.vehicleModel, "Yamaha FZ");
  assert.equal(registered.vehicleNumber, "KA 03 HA 4321");

  // Create verification token and verify
  const token = accounts.createEmailVerificationToken(registered.id);
  assert.ok(!("error" in token));
  const verified = accounts.verifyEmailToken(token.token);
  assert.ok(!("error" in verified));
  assert.equal(verified.user.role, "both", "role becomes 'both' upon verification");
  assert.equal(verified.user.studentIdVerified, true);

  // Check driver verification helper recognizes both role
  assert.ok(accounts.isDriverVerified(registered.id), "isDriverVerified recognises both role");
  const vehicle = accounts.getDriverVehicleInfo(registered.id);
  assert.ok(vehicle, "getDriverVehicleInfo returns vehicle for both role");
  assert.equal(vehicle.vehicleModel, "Yamaha FZ");
  assert.equal(vehicle.vehicleNumber, "KA 03 HA 4321");
  assert.equal(vehicle.vehicleType, "Bike");
});

test("scrypt password hashing and transparent upgrade from legacy SHA-256 on login", () => {
  const legacyUser = accounts.registerUser({
    name: "Legacy Hash Student",
    email: "legacy.student@kju.edu",
    password: "initialPassword123",
    role: "passenger",
  });
  assert.ok(!("error" in legacyUser));

  // Simulate an old SHA-256 hash stored in SQLite
  const oldSha256Hash = accounts.hashLegacySha256Password("myLegacyPass99", "old_salt_123");
  assert.ok(!oldSha256Hash.startsWith("scrypt:"));
  db.getDb()
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run(oldSha256Hash, legacyUser.id);

  // Wrong password fails and does not upgrade
  assert.equal(accounts.authenticate("legacy.student@kju.edu", "wrongPass"), null);
  const beforeRow = db
    .getDb()
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .get(legacyUser.id);
  assert.equal(beforeRow.password_hash, oldSha256Hash);

  // Successful login transparently upgrades the stored hash to scrypt
  const loggedIn = accounts.authenticate("legacy.student@kju.edu", "myLegacyPass99");
  assert.ok(loggedIn);
  assert.equal(loggedIn.id, legacyUser.id);

  const afterRow = db
    .getDb()
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .get(legacyUser.id);
  assert.ok(
    afterRow.password_hash.startsWith("scrypt:"),
    `expected scrypt hash after login, got ${afterRow.password_hash.slice(0, 20)}`
  );

  // Subsequent login verifies against the upgraded scrypt hash
  assert.ok(accounts.authenticate("legacy.student@kju.edu", "myLegacyPass99"));
});

test("registration enforces ALLOWED_EMAIL_DOMAINS and validates driver vehicle details", () => {
  const origDomains = process.env.ALLOWED_EMAIL_DOMAINS;
  try {
    process.env.ALLOWED_EMAIL_DOMAINS = "kristujayanti.com,kju.edu";

    const badDomain = accounts.registerUser({
      name: "Outside User",
      email: "outside@gmail.com",
      password: "password123",
      role: "passenger",
    });
    assert.ok("error" in badDomain);
    assert.match(badDomain.error, /university domain/i);

    const missingVehicle = accounts.registerUser({
      name: "Driver Without Plate",
      email: "driver.noplate@kju.edu",
      password: "password123",
      role: "driver",
      vehicleType: "Bike",
      vehicleModel: "Pulsar",
      vehicleNumber: "INVALID_PLATE",
    });
    assert.ok("error" in missingVehicle);
    assert.match(missingVehicle.error, /registration plate/i);
  } finally {
    if (origDomains === undefined) delete process.env.ALLOWED_EMAIL_DOMAINS;
    else process.env.ALLOWED_EMAIL_DOMAINS = origDomains;
  }
});

test("email verification stores hashed 24h token, unlocks driver role, and strips hopon.demo in production", () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origDemo = process.env.HOPON_ENABLE_DEMO;
  const origDomains = process.env.ALLOWED_EMAIL_DOMAINS;
  try {
    delete process.env.ALLOWED_EMAIL_DOMAINS;
    process.env.NODE_ENV = "production";
    delete process.env.HOPON_ENABLE_DEMO;
    assert.ok(
      !accounts.getAllowedEmailDomains().includes("hopon.demo"),
      "hopon.demo must not be in default ALLOWED_EMAIL_DOMAINS in production when demo is disabled"
    );
    process.env.HOPON_ENABLE_DEMO = "true";
    assert.ok(
      accounts.getAllowedEmailDomains().includes("hopon.demo"),
      "hopon.demo is kept when HOPON_ENABLE_DEMO=true"
    );
  } finally {
    if (origNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = origNodeEnv;
    if (origDemo === undefined) delete process.env.HOPON_ENABLE_DEMO;
    else process.env.HOPON_ENABLE_DEMO = origDemo;
    if (origDomains === undefined) delete process.env.ALLOWED_EMAIL_DOMAINS;
    else process.env.ALLOWED_EMAIL_DOMAINS = origDomains;
  }

  const unverifiedDriver = accounts.registerUser({
    name: "Unverified Driver",
    email: "verify.driver@kju.edu",
    password: "password123",
    role: "driver",
    vehicleType: "Bike",
    vehicleModel: "Yamaha FZ",
    vehicleNumber: "KA 04 AB 9988",
  });
  assert.ok(!("error" in unverifiedDriver));
  assert.equal(unverifiedDriver.studentIdVerified, false);
  assert.equal(unverifiedDriver.role, "passenger", "role is passenger until email is verified");

  const t0 = Date.now();
  const issued = accounts.createEmailVerificationToken(unverifiedDriver.id, t0);
  assert.ok(!("error" in issued));

  // Verify the raw token is NOT stored in plaintext in SQLite
  const row = db
    .getDb()
    .prepare("SELECT email_verification_hash, email_verification_expires_at FROM users WHERE id = ?")
    .get(unverifiedDriver.id);
  assert.notEqual(row.email_verification_hash, issued.token, "token must be stored hashed");
  assert.equal(row.email_verification_hash, accounts.hashVerificationToken(issued.token));

  // Expired token (>24h) is rejected
  const expiredAttempt = accounts.verifyEmailToken(
    issued.token,
    t0 + accounts.EMAIL_VERIFICATION_TTL_MS + 1000
  );
  assert.ok("error" in expiredAttempt, "expired token rejected");

  // Re-issue and verify within 24h window
  const reissued = accounts.createEmailVerificationToken(unverifiedDriver.id, t0);
  assert.ok(!("error" in reissued));
  const verified = accounts.verifyEmailToken(reissued.token, t0 + 5000);
  assert.ok(!("error" in verified));
  assert.equal(verified.user.studentIdVerified, true);
  assert.equal(verified.user.role, "driver", "driver role unlocked after verification");

  // One-time token cannot be reused
  const replay = accounts.verifyEmailToken(reissued.token, t0 + 6000);
  assert.ok("error" in replay, "one-time token cannot be reused");
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

test("clientIp only trusts X-Forwarded-For when TRUST_PROXY=true", () => {
  const headers = (map) => ({ get: (name) => map[name] ?? null });
  const origTrust = process.env.TRUST_PROXY;
  try {
    delete process.env.TRUST_PROXY;
    assert.equal(rate.clientIp(headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" })), "unknown");
    assert.equal(rate.clientIp(headers({ "x-real-ip": " 5.6.7.8 " })), "unknown");

    process.env.TRUST_PROXY = "true";
    assert.equal(rate.clientIp(headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" })), "10.0.0.1");
    assert.equal(rate.clientIp(headers({ "x-real-ip": " 5.6.7.8 " })), "5.6.7.8");
    assert.equal(rate.clientIp(headers({})), "unknown");
  } finally {
    if (origTrust === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = origTrust;
  }
});

test("warnIfUntrustedProxyInProduction warns in production when TRUST_PROXY is not true, and exponential backoff slows attempts without 15-min lockout", () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origTrust = process.env.TRUST_PROXY;
  try {
    process.env.NODE_ENV = "production";
    delete process.env.TRUST_PROXY;
    assert.equal(rate.warnIfUntrustedProxyInProduction(), true);
    process.env.TRUST_PROXY = "true";
    assert.equal(rate.warnIfUntrustedProxyInProduction(), false);
  } finally {
    if (origNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = origNodeEnv;
    if (origTrust === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = origTrust;
  }

  const backoff = rate.createExponentialBackoffLimiter({
    freeAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 8000,
    ttlMs: 60_000,
  });

  // First 3 attempts have 0 delay
  assert.equal(backoff.check("student@kju.edu", NOW).allowed, true);
  assert.equal(backoff.check("student@kju.edu", NOW).allowed, true);
  const third = backoff.check("student@kju.edu", NOW);
  assert.equal(third.allowed, true);
  assert.equal(third.delayMs, 1000, "3rd attempt schedules a 1s cooldown before 4th");

  // Immediate 4th attempt is slowed down (1s cooldown, NOT 15 minutes)
  const blockedEarly = backoff.check("student@kju.edu", NOW + 200);
  assert.equal(blockedEarly.allowed, false);
  assert.equal(blockedEarly.retryAfterSec, 1);

  // After 1s, 4th attempt is allowed and schedules a 2s cooldown
  const fourth = backoff.check("student@kju.edu", NOW + 1000);
  assert.equal(fourth.allowed, true);
  assert.equal(fourth.delayMs, 2000);

  // Reset clears the backoff
  backoff.reset("student@kju.edu");
  assert.equal(backoff.check("student@kju.edu", NOW + 1100).delayMs, 0);
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
