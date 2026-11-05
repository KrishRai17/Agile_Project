// Route-level tests: invoke the REAL Next.js App Router handlers (app/api/**/route.ts)
// with real NextRequest objects and signed session cookies.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { loadTs } from "./support/load-ts.mjs";

const projectRequire = createRequire(join(process.cwd(), "package.json"));
const { NextRequest } = projectRequire("next/server");

const session = await loadTs("lib/session.ts");
const store = await loadTs("lib/rideStore.ts");
const { limiters } = await loadTs("lib/limiters.ts");

const streamRoute = await loadTs("app/api/rides/stream/route.ts");
const requestsRoute = await loadTs("app/api/rides/requests/route.ts");
const respondRoute = await loadTs("app/api/rides/requests/respond/route.ts");
const trackRoute = await loadTs("app/api/rides/track/route.ts");
const rateRoute = await loadTs("app/api/rides/rate/route.ts");
const walletRoute = await loadTs("app/api/wallet/route.ts");
const loginRoute = await loadTs("app/api/auth/login/route.ts");
const registerRoute = await loadTs("app/api/auth/register/route.ts");
const verifyRoute = await loadTs("app/api/auth/verify/route.ts");
const cashierRoute = await loadTs("app/api/cashier/verify-student/route.ts");
const locationRoute = await loadTs("app/api/rides/location/route.ts");
const logoutRoute = await loadTs("app/api/auth/logout/route.ts");
const dbStatusRoute = await loadTs("app/api/db/status/route.ts");
const rateLimit = await loadTs("lib/rateLimit.ts");
const mailer = await loadTs("lib/mailer.ts");
const dbModule = await loadTs("lib/db.ts");
const accounts = await loadTs("lib/accounts.ts");

const PASSENGER = "usr_krish_rai_01";
const DRIVER_CAR = "usr_driver_demo_01"; // seed offer_seed_001 (Car, ₹75)
const DRIVER_BIKE = "usr_driver_demo_02"; // seed offer_seed_002 (Bike, ₹35)
const FORBIDDEN_DRIVER_FIELDS = ["otp", "otpAttempts", "otpLockedUntil", "shareToken", "declinedBy", "passengerId"];

function call(handler, url, { method = "GET", userId, body, headers = {} } = {}) {
  const h = new Headers(headers);
  if (userId) h.set("cookie", `${session.SESSION_COOKIE}=${session.createSessionToken(userId)}`);
  if (body !== undefined) h.set("content-type", "application/json");
  const req = new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers: h,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return handler(req);
}

function newRequest(passengerId, offerId) {
  const req = store.createRequest({
    offerId,
    passengerId,
    passengerName: `Passenger Full ${passengerId}`,
    passengerRating: 4.9,
    pickup: "Kristu Jayanti University",
    pickupLat: 13.0583,
    pickupLng: 77.6426,
    dropoff: "Manyata Tech Park",
    dropoffLat: 13.0458,
    dropoffLng: 77.6206,
  });
  assert.ok(!("error" in req), `createRequest failed: ${req.error}`);
  return req;
}

async function readFirstSseEvent(response) {
  const reader = response.body.getReader();
  const { value } = await reader.read();
  await reader.cancel();
  const text = new TextDecoder().decode(value);
  const dataLine = text.split("\n").find((l) => l.startsWith("data: "));
  return { event: text.split("\n")[0], data: JSON.parse(dataLine.slice(6)) };
}

function assertDriverView(view, label) {
  for (const f of FORBIDDEN_DRIVER_FIELDS) {
    assert.ok(!(f in view), `${label} must not expose ${f}`);
  }
}

// Drives an accepted ride to completion through the real respond route; returns the request id.
async function completeRideViaRoutes(driverId, passengerId) {
  const req = newRequest(passengerId);
  const acc = await call(respondRoute.PATCH, "/api/rides/requests/respond", {
    method: "PATCH",
    userId: driverId,
    body: { requestId: req.id, action: "accept" },
  });
  assert.equal(acc.status, 200, "accept succeeds");
  await call(respondRoute.PATCH, "/api/rides/requests/respond", {
    method: "PATCH",
    userId: driverId,
    body: { requestId: req.id, action: "arrive" },
  });
  // Passenger sees their own OTP through the passenger branch of GET /api/rides/requests
  const mine = await (
    await call(requestsRoute.GET, `/api/rides/requests?passengerId=${passengerId}`, { userId: passengerId })
  ).json();
  const otp = mine.requests.find((r) => r.id === req.id).otp;
  assert.match(otp, /^\d{4}$/);
  const ver = await call(respondRoute.PATCH, "/api/rides/requests/respond", {
    method: "PATCH",
    userId: driverId,
    body: { requestId: req.id, action: "verify_otp", otp },
  });
  assert.equal(ver.status, 200);
  const done = await call(respondRoute.PATCH, "/api/rides/requests/respond", {
    method: "PATCH",
    userId: driverId,
    body: { requestId: req.id, action: "complete" },
  });
  assert.equal(done.status, 200);
  assert.equal((await done.json()).request.status, "completed");
  return req.id;
}

// ---------- 1. stream / inbox / respond response shapes ----------

test("driver stream snapshot, inbox and respond responses use toDriverView (no otp/shareToken/etc.)", async () => {
  const req = newRequest(PASSENGER);
  // Give the request every sensitive field before the driver looks at it
  const tok = store.createTrackingToken(req.id, PASSENGER);
  assert.ok(!("error" in tok));
  store.respondToRequest(req.id, DRIVER_BIKE, "reject"); // populates declinedBy

  const respond = await call(respondRoute.PATCH, "/api/rides/requests/respond", {
    method: "PATCH",
    userId: DRIVER_CAR,
    body: { requestId: req.id, action: "accept" },
  });
  assert.equal(respond.status, 200);
  const respondBody = await respond.json();
  assert.equal(respondBody.request.status, "accepted");
  assert.equal(respondBody.request.agreedFare, "75", "agreed fare is stored and visible");
  assertDriverView(respondBody.request, "respond");
  assert.match(store.getRequest(req.id).otp, /^\d{4}$/, "OTP exists server-side");

  const inbox = await call(requestsRoute.GET, `/api/rides/requests?driverId=${DRIVER_CAR}`, { userId: DRIVER_CAR });
  assert.equal(inbox.status, 200);
  const inboxBody = await inbox.json();
  const inboxItem = inboxBody.requests.find((r) => r.id === req.id);
  assert.ok(inboxItem);
  inboxBody.requests.forEach((r) => assertDriverView(r, "inbox"));

  const stream = await call(streamRoute.GET, "/api/rides/stream", { userId: DRIVER_CAR });
  assert.equal(stream.headers.get("content-type"), "text/event-stream");
  const { event, data } = await readFirstSseEvent(stream);
  assert.equal(event, "event: snapshot");
  assert.equal(data.role, "driver");
  assert.ok(data.requests.some((r) => r.id === req.id));
  data.requests.forEach((r) => assertDriverView(r, "stream"));

  // The passenger still sees their own OTP in their own stream snapshot
  const pStream = await call(streamRoute.GET, "/api/rides/stream", { userId: PASSENGER });
  const pSnap = (await readFirstSseEvent(pStream)).data;
  assert.equal(pSnap.requests.find((r) => r.id === req.id).otp, store.getRequest(req.id).otp);

  store.cancelRequest(req.id, PASSENGER);
});

test("a driver cannot read another driver's inbox, and unauthenticated calls get 401", async () => {
  const forbidden = await call(requestsRoute.GET, `/api/rides/requests?driverId=${DRIVER_BIKE}`, { userId: DRIVER_CAR });
  assert.equal(forbidden.status, 403);
  const anon = await call(streamRoute.GET, "/api/rides/stream");
  assert.equal(anon.status, 401);
});

// ---------- 2. tracking token auth ----------

test("tracking: only the passenger creates/revokes tokens; GET needs the token and returns a minimal payload", async () => {
  const req = newRequest(PASSENGER);
  store.respondToRequest(req.id, DRIVER_CAR, "accept");

  const byDriver = await call(trackRoute.POST, "/api/rides/track", { method: "POST", userId: DRIVER_CAR, body: { requestId: req.id } });
  assert.equal(byDriver.status, 403);
  const anon = await call(trackRoute.POST, "/api/rides/track", { method: "POST", body: { requestId: req.id } });
  assert.equal(anon.status, 401);

  const created = await call(trackRoute.POST, "/api/rides/track", { method: "POST", userId: PASSENGER, body: { requestId: req.id } });
  assert.equal(created.status, 200);
  const { token } = await created.json();
  assert.ok(token.length >= 20);

  const byRequestId = await call(trackRoute.GET, `/api/rides/track?token=${req.id}`);
  assert.equal(byRequestId.status, 404, "the guessable request id is not a valid token");

  const pub = await call(trackRoute.GET, `/api/rides/track?token=${encodeURIComponent(token)}`);
  assert.equal(pub.status, 200);
  const { tracking } = await pub.json();
  assert.equal(tracking.passengerFirstName, "Passenger");
  for (const f of ["otp", "vehicleNumber", "passengerName", "passengerId", "shareToken"]) {
    assert.ok(!(f in tracking), `public tracking must not expose ${f}`);
  }

  const revokeByDriver = await call(trackRoute.DELETE, "/api/rides/track", { method: "DELETE", userId: DRIVER_CAR, body: { requestId: req.id } });
  assert.equal(revokeByDriver.status, 403);
  const revoked = await call(trackRoute.DELETE, "/api/rides/track", { method: "DELETE", userId: PASSENGER, body: { requestId: req.id } });
  assert.equal(revoked.status, 200);
  assert.equal((await call(trackRoute.GET, `/api/rides/track?token=${encodeURIComponent(token)}`)).status, 404);

  store.cancelRequest(req.id, PASSENGER);
});

test("tracking: GET is rate limited per client IP", async () => {
  const orig = process.env.TRUST_PROXY;
  process.env.TRUST_PROXY = "true";
  try {
    const headers = { "x-forwarded-for": "203.0.113.77" };
    let last;
    for (let i = 0; i < 61; i++) {
      last = await call(trackRoute.GET, "/api/rides/track?token=does-not-exist", { headers });
    }
    assert.equal(last.status, 429);
    assert.ok(Number(last.headers.get("retry-after")) >= 1);
    const otherIp = await call(trackRoute.GET, "/api/rides/track?token=does-not-exist", {
      headers: { "x-forwarded-for": "203.0.113.78" },
    });
    assert.equal(otherIp.status, 404, "a different IP has its own bucket");
  } finally {
    if (orig === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = orig;
  }
});

// ---------- 3. rating authorization (+ completed tracking window) ----------

test("rating: only completed rides, only the other participant, one rating per rater", async () => {
  // Not completed yet -> 403
  const pending = newRequest(PASSENGER);
  const early = await call(rateRoute.POST, "/api/rides/rate", {
    method: "POST",
    userId: PASSENGER,
    body: { requestId: pending.id, targetUserId: DRIVER_CAR, stars: 5 },
  });
  assert.equal(early.status, 403);
  store.cancelRequest(pending.id, PASSENGER);

  const requestId = await completeRideViaRoutes(DRIVER_CAR, PASSENGER);

  const stranger = await call(rateRoute.POST, "/api/rides/rate", {
    method: "POST",
    userId: DRIVER_BIKE,
    body: { requestId, targetUserId: DRIVER_CAR, stars: 1 },
  });
  assert.equal(stranger.status, 403, "non-participant cannot rate");

  const wrongTarget = await call(rateRoute.POST, "/api/rides/rate", {
    method: "POST",
    userId: PASSENGER,
    body: { requestId, targetUserId: DRIVER_BIKE, stars: 1 },
  });
  assert.equal(wrongTarget.status, 403, "target must be the other participant");

  const ok = await call(rateRoute.POST, "/api/rides/rate", {
    method: "POST",
    userId: PASSENGER,
    body: { requestId, targetUserId: DRIVER_CAR, stars: 5, tags: ["On Time"] },
  });
  assert.equal(ok.status, 200);

  const dup = await call(rateRoute.POST, "/api/rides/rate", {
    method: "POST",
    userId: PASSENGER,
    body: { requestId, targetUserId: DRIVER_CAR, stars: 1 },
  });
  assert.equal(dup.status, 409, "duplicate rating rejected");

  const driverRates = await call(rateRoute.POST, "/api/rides/rate", {
    method: "POST",
    userId: DRIVER_CAR,
    body: { requestId, targetUserId: PASSENGER, stars: 4 },
  });
  assert.equal(driverRates.status, 200, "driver can rate the passenger");
});

test("tracking stays readable as 'completed' right after the trip ends", async () => {
  const req = newRequest(PASSENGER);
  store.respondToRequest(req.id, DRIVER_CAR, "accept");
  const { token } = await (
    await call(trackRoute.POST, "/api/rides/track", { method: "POST", userId: PASSENGER, body: { requestId: req.id } })
  ).json();
  store.markDriverArrived(req.id, DRIVER_CAR);
  store.verifyRideOtp(req.id, DRIVER_CAR, store.getRequest(req.id).otp);
  store.completeRide(req.id, DRIVER_CAR);
  const res = await call(trackRoute.GET, `/api/rides/track?token=${encodeURIComponent(token)}`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).tracking.status, "completed");
});

// ---------- 4. wallet gating ----------

test("wallet: no free top-ups, no standalone pay, cash top-ups require cashier secret", async () => {
  const origDemo = process.env.HOPON_ALLOW_DEMO_TOPUP;
  const origSecret = process.env.HOPON_CASHIER_SECRET;
  try {
    delete process.env.HOPON_ALLOW_DEMO_TOPUP;
    process.env.HOPON_CASHIER_SECRET = "cashier-secret-for-tests-123";

    const free = await call(walletRoute.POST, "/api/wallet", { method: "POST", userId: PASSENGER, body: { action: "topup", amount: 100 } });
    assert.equal(free.status, 403, "demo top-up disabled by default");

    const pay = await call(walletRoute.POST, "/api/wallet", { method: "POST", userId: PASSENGER, body: { action: "pay", amount: 10 } });
    assert.equal(pay.status, 400, "standalone pay action removed");

    const selfCash = await call(walletRoute.POST, "/api/wallet", { method: "POST", userId: PASSENGER, body: { action: "cash_topup", amount: 100 } });
    assert.equal(selfCash.status, 403, "passenger cannot confirm their own cash top-up");

    const badSecret = await call(walletRoute.POST, "/api/wallet", {
      method: "POST",
      userId: PASSENGER,
      body: { action: "cash_topup", amount: 100 },
      headers: { "x-cashier-secret": "wrong-secret-value-xyz" },
    });
    assert.equal(badSecret.status, 403);

    const cashier = await call(walletRoute.POST, "/api/wallet", {
      method: "POST",
      userId: PASSENGER,
      body: { action: "cash_topup", amount: 100 },
      headers: { "x-cashier-secret": "cashier-secret-for-tests-123" },
    });
    assert.equal(cashier.status, 200);

    // Drivers cannot confirm cash top-ups; only cashier secret can
    const driverAttempt = await call(walletRoute.POST, "/api/wallet", {
      method: "POST",
      userId: DRIVER_BIKE,
      body: { action: "cash_topup", amount: 50, passengerId: PASSENGER },
    });
    assert.equal(driverAttempt.status, 403, "driver session cannot confirm cash top-up");

    const req = newRequest(PASSENGER);
    store.respondToRequest(req.id, DRIVER_BIKE, "accept");
    const driverWithActiveRide = await call(walletRoute.POST, "/api/wallet", {
      method: "POST",
      userId: DRIVER_BIKE,
      body: { action: "cash_topup", amount: 50, passengerId: PASSENGER },
    });
    assert.equal(driverWithActiveRide.status, 403, "even active-ride driver cannot confirm cash top-up");
    store.cancelRequest(req.id, PASSENGER);

    process.env.HOPON_ALLOW_DEMO_TOPUP = "true";
    const demo = await call(walletRoute.POST, "/api/wallet", { method: "POST", userId: PASSENGER, body: { action: "topup", amount: 10 } });
    assert.equal(demo.status, 200, "demo top-up only with HOPON_ALLOW_DEMO_TOPUP outside production");
  } finally {
    if (origDemo === undefined) delete process.env.HOPON_ALLOW_DEMO_TOPUP;
    else process.env.HOPON_ALLOW_DEMO_TOPUP = origDemo;
    if (origSecret === undefined) delete process.env.HOPON_CASHIER_SECRET;
    else process.env.HOPON_CASHIER_SECRET = origSecret;
  }
});

test("accept is rejected when the passenger's wallet cannot cover the fare", async () => {
  const reg = await call(registerRoute.POST, "/api/auth/register", {
    method: "POST",
    body: { name: "Broke Student", email: "broke.student@kju.edu", password: "password123", role: "passenger" },
  });
  assert.equal(reg.status, 201);
  const broke = (await reg.json()).user;
  const db = await loadTs("lib/db.ts");
  db.getDb().prepare("UPDATE users SET wallet_balance = 20 WHERE id = ?").run(broke.id);

  const req = newRequest(broke.id);
  const res = await call(respondRoute.PATCH, "/api/rides/requests/respond", {
    method: "PATCH",
    userId: DRIVER_CAR,
    body: { requestId: req.id, action: "accept" },
  });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /insufficient/i);
  assert.equal(store.getRequest(req.id).status, "pending");
  store.cancelRequest(req.id, broke.id);
});

// ---------- email verification gating ----------

test("unverified drivers are blocked from driver routes until they verify their email", async () => {
  const reg = await call(registerRoute.POST, "/api/auth/register", {
    method: "POST",
    body: {
      name: "New Rider",
      email: "new.rider@kju.edu",
      password: "password123",
      role: "driver",
      vehicleType: "Bike",
      vehicleModel: "TVS Apache",
      vehicleNumber: "KA 01 MN 4455",
    },
  });
  assert.equal(reg.status, 201);
  const regBody = await reg.json();
  assert.equal(regBody.user.studentIdVerified, false);
  assert.equal(regBody.verificationRequired, true);
  const uid = regBody.user.id;

  const inbox = await call(requestsRoute.GET, `/api/rides/requests?driverId=${uid}`, { userId: uid });
  assert.equal(inbox.status, 403);
  const respond = await call(respondRoute.PATCH, "/api/rides/requests/respond", {
    method: "PATCH",
    userId: uid,
    body: { requestId: "req_x", action: "accept" },
  });
  assert.equal(respond.status, 403);
  assert.match((await respond.json()).error, /verify your university email/i);

  const bad = await call(verifyRoute.POST, "/api/auth/verify", { method: "POST", body: { token: "not-a-real-token-123" } });
  assert.equal(bad.status, 400);

  const ok = await call(verifyRoute.POST, "/api/auth/verify", { method: "POST", body: { token: regBody.verificationToken } });
  assert.equal(ok.status, 200);
  const verified = (await ok.json()).user;
  assert.equal(verified.studentIdVerified, true);
  assert.equal(verified.role, "driver");

  const inboxAfter = await call(requestsRoute.GET, `/api/rides/requests?driverId=${uid}`, { userId: uid });
  assert.equal(inboxAfter.status, 200);
});

// ---------- 5. login limiter behaviour ----------

test("login: unknown IP never shares a bucket; per-email backoff slows (not locks) and resets on success", async () => {
  const origTrust = process.env.TRUST_PROXY;
  delete process.env.TRUST_PROXY; // every request has ip === "unknown"
  try {
    const login = (email, password) =>
      call(loginRoute.POST, "/api/auth/login", { method: "POST", body: { email, password } });

    // 3 free wrong attempts for the student account, then the next immediate one is slowed
    for (let i = 0; i < 3; i++) {
      assert.equal((await login("student@hopon.demo", "wrong-password")).status, 401);
    }
    const slowed = await login("student@hopon.demo", "hopon123");
    assert.equal(slowed.status, 429);
    const retry = Number(slowed.headers.get("retry-after"));
    assert.ok(retry >= 1 && retry <= 2, `short exponential delay, not a 15 minute lock (got ${retry}s)`);

    // Another account from the same (unknown) IP is not affected: no shared "unknown" bucket
    assert.equal((await login("driver@hopon.demo", "hopon123")).status, 200);
    assert.equal(limiters.loginIp.size(), 0, "loginIp is never keyed by 'unknown'");

    // After the short delay the correct password works and resets the backoff
    await new Promise((r) => setTimeout(r, 1100));
    assert.equal((await login("student@hopon.demo", "hopon123")).status, 200);
    assert.equal((await login("student@hopon.demo", "wrong-password")).status, 401, "backoff was reset");
  } finally {
    if (origTrust === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = origTrust;
  }
});

test("registration uses its own limiter, not the login IP limiter", async () => {
  const origTrust = process.env.TRUST_PROXY;
  process.env.TRUST_PROXY = "true";
  try {
    const ip = "198.51.100.23";
    for (let i = 0; i < 3; i++) {
      await call(registerRoute.POST, "/api/auth/register", {
        method: "POST",
        headers: { "x-forwarded-for": ip },
        body: { name: "Spam", email: `spam${i}@gmail.com`, password: "password123" },
      });
    }
    assert.equal(limiters.loginIp.check(ip).remaining, 99, "registration did not consume the login IP budget");
    assert.equal(limiters.register.check(ip).remaining, 15 - 4, "registration counted in its own limiter");
  } finally {
    if (origTrust === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = origTrust;
  }
});

test("cashier verify-student requires configured secret (404), rejects wrong secret or driver session (403), verifies with right secret, writes audit row, and rate limits", async () => {
  const origSecret = process.env.HOPON_CASHIER_SECRET;
  delete process.env.HOPON_CASHIER_SECRET;

  try {
    // 1. Unset or too short secret returns 404
    const resNoSecret = await call(cashierRoute.POST, "/api/cashier/verify-student", {
      method: "POST",
      body: { studentEmail: "someone@kju.edu", cashierSecret: "short" },
    });
    assert.equal(resNoSecret.status, 404, "unset or short secret fails closed with 404");

    // Configure valid 16+ char secret
    const SECRET = "super_secure_cashier_secret_2026";
    process.env.HOPON_CASHIER_SECRET = SECRET;

    // Register an unverified student for testing
    const unverifiedEmail = `cashier.test.${Date.now()}@kju.edu`;
    const regRes = accounts.registerUser({
      name: "Cashier Test User",
      email: unverifiedEmail,
      password: "password123",
      role: "passenger",
    });
    assert.ok(!("error" in regRes));
    assert.equal(regRes.studentIdVerified, false);

    // 2. Wrong secret returns 403
    const resWrongSecret = await call(cashierRoute.POST, "/api/cashier/verify-student", {
      method: "POST",
      body: { studentEmail: unverifiedEmail, cashierSecret: "wrong_secret_12345678" },
    });
    assert.equal(resWrongSecret.status, 403, "wrong secret returns 403");

    // 3. Driver session alone returns 403 (driver role is NOT cashier)
    const resDriverOnly = await call(cashierRoute.POST, "/api/cashier/verify-student", {
      method: "POST",
      userId: DRIVER_CAR,
      body: { studentEmail: unverifiedEmail },
    });
    assert.equal(resDriverOnly.status, 403, "driver session alone without secret returns 403");

    // 4. Right secret verifies student and pays welcome bonus
    const initialAuditCount = dbModule.getDb().prepare("SELECT COUNT(*) as c FROM verification_audit").get().c;
    const resValid = await call(cashierRoute.POST, "/api/cashier/verify-student", {
      method: "POST",
      headers: { "x-cashier-secret": SECRET },
      body: { studentEmail: unverifiedEmail, studentRollNumber: "23BCAC99" },
    });
    assert.equal(resValid.status, 200, "valid secret verifies student");
    const validData = await resValid.json();
    assert.equal(validData.success, true);
    assert.equal(validData.user.studentIdVerified, true);
    assert.equal(validData.user.walletBalance, 250);

    // 5. Verification audit row is written
    const finalAuditCount = dbModule.getDb().prepare("SELECT COUNT(*) as c FROM verification_audit").get().c;
    assert.ok(finalAuditCount > initialAuditCount, "audit row was written");
    const lastAudit = dbModule.getDb().prepare("SELECT * FROM verification_audit ORDER BY created_at DESC LIMIT 1").get();
    assert.equal(lastAudit.student_email, unverifiedEmail);
    assert.equal(lastAudit.method, "cashier_secret");

    // 6. Rate limiter triggers after limit (20 per 15 min)
    const ip = "192.0.2.77";
    process.env.TRUST_PROXY = "true";
    for (let i = 0; i < 20; i++) {
      limiters.cashier.check(ip);
    }
    const resLimited = await call(cashierRoute.POST, "/api/cashier/verify-student", {
      method: "POST",
      headers: { "x-cashier-secret": SECRET, "x-forwarded-for": ip },
      body: { studentEmail: unverifiedEmail },
    });
    assert.equal(resLimited.status, 429, "exceeding limit triggers 429");
  } finally {
    delete process.env.TRUST_PROXY;
    if (origSecret === undefined) delete process.env.HOPON_CASHIER_SECRET;
    else process.env.HOPON_CASHIER_SECRET = origSecret;
  }
});

test("Phase 2: Email verification and mailer hardening", async () => {
  // 1. escapeHtml prevents XSS injection
  assert.equal(mailer.escapeHtml('<script>alert("xss")</script>'), "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");

  // 2. Production fail-closed without provider
  const origEnv = process.env.NODE_ENV;
  const origResend = process.env.RESEND_API_KEY;
  const origWebhook = process.env.EMAIL_WEBHOOK_URL;
  const origAppUrl = process.env.APP_URL;
  const origNextPublic = process.env.NEXT_PUBLIC_APP_URL;
  const origVercel = process.env.VERCEL_URL;

  try {
    process.env.NODE_ENV = "production";
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_WEBHOOK_URL;
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;

    // getAppBaseUrl throws in production when APP_URL is missing
    assert.throws(() => mailer.getAppBaseUrl(), /APP_URL or NEXT_PUBLIC_APP_URL is required in production/);

    // sendEmail fails closed in production
    const sendRes = await mailer.sendEmail({
      to: "student@kristujayanti.com",
      subject: "Test",
      text: "hello",
      html: "<p>hello</p>",
    });
    assert.equal(sendRes.success, false);
    assert.equal(sendRes.error, "Email delivery is not configured");

    // Resend requires EMAIL_FROM in production
    process.env.RESEND_API_KEY = "re_test_key";
    delete process.env.EMAIL_FROM;
    const resendNoFrom = await mailer.sendEmail({
      to: "student@kristujayanti.com",
      subject: "Test",
      text: "hello",
      html: "<p>hello</p>",
    });
    assert.equal(resendNoFrom.success, false);
    assert.match(resendNoFrom.error, /EMAIL_FROM is required/);
  } finally {
    process.env.NODE_ENV = origEnv;
    if (origResend) process.env.RESEND_API_KEY = origResend; else delete process.env.RESEND_API_KEY;
    if (origWebhook) process.env.EMAIL_WEBHOOK_URL = origWebhook; else delete process.env.EMAIL_WEBHOOK_URL;
    if (origAppUrl) process.env.APP_URL = origAppUrl; else delete process.env.APP_URL;
    if (origNextPublic) process.env.NEXT_PUBLIC_APP_URL = origNextPublic; else delete process.env.NEXT_PUBLIC_APP_URL;
    if (origVercel) process.env.VERCEL_URL = origVercel; else delete process.env.VERCEL_URL;
  }

  // 3. Resend rate limiter (verifyResend: max 3 per hour)
  const testUser = `usr_resend_test_${Date.now()}`;
  const testEmail = `resend_${Date.now()}@kristujayanti.com`;
  dbModule.getDb().prepare(`
    INSERT INTO users (id, email, password_hash, name, university, rating, role, wallet_balance, student_id_verified, created_at, session_version)
    VALUES (?, ?, 'hash', 'Test Resend', 'Kristu Jayanti University', 5.0, 'passenger', 0, 0, ?, 1)
  `).run(testUser, testEmail, Date.now());

  // 3 sends succeed
  for (let i = 0; i < 3; i++) {
    const res = await call(verifyRoute.POST, "/api/auth/verify", {
      method: "POST",
      userId: testUser,
      body: { action: "resend" },
    });
    assert.equal(res.status, 200, `send ${i + 1} succeeds`);
  }

  // 4th send hits rate limit (429)
  const resLimited = await call(verifyRoute.POST, "/api/auth/verify", {
    method: "POST",
    userId: testUser,
    body: { action: "resend" },
  });
  assert.equal(resLimited.status, 429, "4th send within 1 hour is rate limited");

  // 4. In production without mailer, resend returns 503
  const testUserProd = `usr_resend_prod_${Date.now()}`;
  const testEmailProd = `resend_prod_${Date.now()}@kristujayanti.com`;
  dbModule.getDb().prepare(`
    INSERT INTO users (id, email, password_hash, name, university, rating, role, wallet_balance, student_id_verified, created_at, session_version)
    VALUES (?, ?, 'hash', 'Test Resend Prod', 'Kristu Jayanti University', 5.0, 'passenger', 0, 0, ?, 1)
  `).run(testUserProd, testEmailProd, Date.now());

  const prevEnv = process.env.NODE_ENV;
  const prevSessionSecret = process.env.SESSION_SECRET;
  try {
    process.env.NODE_ENV = "production";
    process.env.SESSION_SECRET = "production_test_secret_for_routes_123";
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_WEBHOOK_URL;
    process.env.APP_URL = "https://hopon.demo";

    const resProdFail = await call(verifyRoute.POST, "/api/auth/verify", {
      method: "POST",
      userId: testUserProd,
      body: { action: "resend" },
    });
    assert.equal(resProdFail.status, 503, "mail failure in production returns 503");
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevSessionSecret) process.env.SESSION_SECRET = prevSessionSecret; else delete process.env.SESSION_SECRET;
    delete process.env.APP_URL;
  }
});

test("Phase 3: Money integrity, wallet ledger, and client IP proxy hops", async () => {
  const db = dbModule.getDb();
  const testUser = `usr_phase3_${Date.now()}`;
  db.prepare(`
    INSERT INTO users (id, email, password_hash, name, university, rating, role, wallet_balance, student_id_verified, created_at, session_version)
    VALUES (?, ?, 'hash', 'Phase3 User', 'Kristu Jayanti University', 5.0, 'passenger', 100, 1, ?, 1)
  `).run(testUser, `p3_${Date.now()}@kristujayanti.com`, Date.now());

  // 1. Balance never goes negative
  const overdraft = accounts.adjustWalletBalance(testUser, -200);
  assert.ok("error" in overdraft, "cannot overdraft balance");

  // 2. Adjust balance writes to wallet_ledger
  const credited = accounts.adjustWalletBalance(testUser, 50, "test_credit", { actorId: "admin", ref: "ref_1" });
  assert.equal(credited.walletBalance, 150);

  const newLedgerRow = db.prepare("SELECT * FROM wallet_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(testUser);
  assert.equal(newLedgerRow.delta, 50);
  assert.equal(newLedgerRow.reason, "test_credit");
  assert.equal(newLedgerRow.balance_after, 150);
  assert.equal(newLedgerRow.actor_id, "admin");
  assert.equal(newLedgerRow.ref, "ref_1");

  // 3. Cash top-up via API records wallet_ledger row
  const origSecret = process.env.HOPON_CASHIER_SECRET;
  process.env.HOPON_CASHIER_SECRET = "super-secret-cashier-key-999";
  try {
    const cashRes = await call(walletRoute.POST, "/api/wallet", {
      method: "POST",
      userId: testUser,
      headers: { "x-cashier-secret": "super-secret-cashier-key-999" },
      body: { action: "cash_topup", amount: 75, userId: testUser },
    });
    assert.equal(cashRes.status, 200);
    const lastRow = db.prepare("SELECT * FROM wallet_ledger WHERE user_id = ? AND reason = 'cashier_topup' LIMIT 1").get(testUser);
    assert.equal(lastRow.delta, 75);
    assert.equal(lastRow.reason, "cashier_topup");
    assert.equal(lastRow.balance_after, 225);
  } finally {
    if (origSecret) process.env.HOPON_CASHIER_SECRET = origSecret;
    else delete process.env.HOPON_CASHIER_SECRET;
  }

  // 4. clientIp with TRUSTED_PROXY_HOPS
  const origTrust = process.env.TRUST_PROXY;
  const origHops = process.env.TRUSTED_PROXY_HOPS;
  try {
    process.env.TRUST_PROXY = "true";

    // 1 hop: takes the rightmost element
    process.env.TRUSTED_PROXY_HOPS = "1";
    const h1 = new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" });
    assert.equal(rateLimit.clientIp(h1), "2.2.2.2");

    // 2 hops: takes length - 2
    process.env.TRUSTED_PROXY_HOPS = "2";
    const h2 = new Headers({ "x-forwarded-for": "10.0.0.1, 198.51.100.42, 172.16.0.5" });
    assert.equal(rateLimit.clientIp(h2), "198.51.100.42");

    // Fewer hops than requested falls back to x-real-ip
    process.env.TRUSTED_PROXY_HOPS = "5";
    const h3 = new Headers({ "x-forwarded-for": "10.0.0.1", "x-real-ip": "203.0.113.19" });
    assert.equal(rateLimit.clientIp(h3), "203.0.113.19");
  } finally {
    if (origTrust) process.env.TRUST_PROXY = origTrust; else delete process.env.TRUST_PROXY;
    if (origHops) process.env.TRUSTED_PROXY_HOPS = origHops; else delete process.env.TRUSTED_PROXY_HOPS;
  }

  // 5. Unknown IP registration triggers global bucket after 30 calls
  for (let i = 0; i < 30; i++) {
    limiters.registerGlobal.check("global:register");
  }
  const regLimited = await call(registerRoute.POST, "/api/auth/register", {
    method: "POST",
    body: { name: "Bot", email: `bot_${Date.now()}@kristujayanti.com`, password: "password123" },
  });
  assert.equal(regLimited.status, 429, "unknown IP hits global register limiter after 30 calls");
});

test("Phase 4: Session version enforcement, privacy and location probing defense", async () => {
  const db = dbModule.getDb();
  const testUser = `usr_phase4_${Date.now()}`;
  db.prepare(`
    INSERT INTO users (id, email, password_hash, name, university, rating, role, wallet_balance, student_id_verified, created_at, session_version)
    VALUES (?, ?, 'hash', 'Phase4 User', 'Kristu Jayanti University', 5.0, 'passenger', 100, 1, ?, 1)
  `).run(testUser, `p4_${Date.now()}@kristujayanti.com`, Date.now());

  // 1. Session token without 'ver' is rejected
  const tokenNoVer = session.createSessionToken(testUser, undefined, undefined, undefined, null);
  const reqNoVer = new NextRequest(new URL("/api/rides/requests?passengerId=" + testUser, "http://localhost:3000"), {
    headers: new Headers({ cookie: `${session.SESSION_COOKIE}=${tokenNoVer}` }),
  });
  const resNoVer = await requestsRoute.GET(reqNoVer);
  assert.equal(resNoVer.status, 401, "session token without ver is rejected");

  // 2. Session token with outdated 'ver' is rejected
  const tokenOldVer = session.createSessionToken(testUser, undefined, undefined, undefined, 0);
  const reqOldVer = new NextRequest(new URL("/api/rides/requests?passengerId=" + testUser, "http://localhost:3000"), {
    headers: new Headers({ cookie: `${session.SESSION_COOKIE}=${tokenOldVer}` }),
  });
  const resOldVer = await requestsRoute.GET(reqOldVer);
  assert.equal(resOldVer.status, 401, "session token with old ver is rejected");

  // 3. Logout increments session_version and revokes token
  const validToken = session.createSessionToken(testUser, undefined, undefined, undefined, 1);
  const logoutRes = await call(logoutRoute.POST, "/api/auth/logout", {
    method: "POST",
    headers: { cookie: `${session.SESSION_COOKIE}=${validToken}` },
  });
  assert.equal(logoutRes.status, 200);

  const versionAfter = accounts.getUserSessionVersion(testUser);
  assert.ok(versionAfter > 1, "session version incremented on logout");

  const postLogoutCall = await call(requestsRoute.GET, "/api/rides/requests?passengerId=" + testUser, {
    headers: { cookie: `${session.SESSION_COOKIE}=${validToken}` },
  });
  assert.equal(postLogoutCall.status, 401, "old token is rejected after logout");

  // 4. toDriverView strips dropoff parenthesized details before accept
  const reqObj = store.createRequest({
    passengerId: testUser,
    passengerName: "Test Passenger",
    passengerRating: 5.0,
    pickup: "Kristu Jayanti University (Admin Block)",
    pickupLat: 13.0583,
    pickupLng: 77.6426,
    dropoff: "Manyata Tech Park (Back Gate 2)",
    dropoffLat: 13.0458,
    dropoffLng: 77.6206,
  });
  assert.ok(!("error" in reqObj));

  const viewBefore = store.toDriverView(reqObj);
  assert.equal(viewBefore.dropoff, "Manyata Tech Park", "parenthetical dropoff detail stripped before accept");
  assert.equal(viewBefore.pickup, "Kristu Jayanti University", "parenthetical pickup detail stripped before accept");

  // 5. Idle driver location rate limit (20/min)
  const idleDriver = `usr_idle_driver_${Date.now()}`;
  db.prepare(`
    INSERT INTO users (id, email, password_hash, name, university, rating, role, wallet_balance, student_id_verified, created_at, session_version)
    VALUES (?, ?, 'hash', 'Idle Driver', 'Kristu Jayanti University', 5.0, 'driver', 0, 1, ?, 1)
  `).run(idleDriver, `driver_${Date.now()}@kristujayanti.com`, Date.now());

  for (let i = 0; i < 20; i++) {
    limiters.locationIdle.check(idleDriver);
  }
  const locResLimited = await call(locationRoute.POST, "/api/rides/location", {
    method: "POST",
    userId: idleDriver,
    body: { lat: 13.058, lng: 77.642 },
  });
  assert.equal(locResLimited.status, 429, "idle driver location rate limited to 20/min");

  // 6. DB status endpoint uses timingSafeEqual on ADMIN_SECRET in production
  const origEnv = process.env.NODE_ENV;
  const origAdmin = process.env.ADMIN_SECRET;
  const origSession = process.env.SESSION_SECRET;
  try {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_SECRET = "super_admin_secret_key_1234";
    process.env.SESSION_SECRET = "production_session_secret_123456789";

    const adminUser = `usr_admin_${Date.now()}`;
    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, university, rating, role, wallet_balance, student_id_verified, created_at, session_version)
      VALUES (?, ?, 'hash', 'Admin User', 'Kristu Jayanti University', 5.0, 'passenger', 0, 1, ?, 1)
    `).run(adminUser, `admin_${Date.now()}@kristujayanti.com`, Date.now());

    const noSecretRes = await call(dbStatusRoute.GET, "/api/db/status", { userId: adminUser });
    assert.equal(noSecretRes.status, 404);

    const wrongSecretRes = await call(dbStatusRoute.GET, "/api/db/status", {
      userId: adminUser,
      headers: { "x-admin-secret": "wrong_secret_here" },
    });
    assert.equal(wrongSecretRes.status, 404);

    const rightSecretRes = await call(dbStatusRoute.GET, "/api/db/status", {
      userId: adminUser,
      headers: { "x-admin-secret": "super_admin_secret_key_1234" },
    });
    assert.equal(rightSecretRes.status, 200);
  } finally {
    process.env.NODE_ENV = origEnv;
    if (origAdmin) process.env.ADMIN_SECRET = origAdmin; else delete process.env.ADMIN_SECRET;
    if (origSession) process.env.SESSION_SECRET = origSession; else delete process.env.SESSION_SECRET;
  }
});



