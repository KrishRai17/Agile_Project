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
const meRoute = await loadTs("app/api/auth/me/route.ts");
const adminOverviewRoute = await loadTs("app/api/admin/overview/route.ts");
const verifyIdCardRoute = await loadTs("app/api/auth/verify-id-card/route.ts");
const studentIdVerifier = await loadTs("lib/studentIdVerifier.ts");
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

test("Fix 1: a passenger with a pending or rejected request gets no driverLocation", async () => {
  store.updateDriverLocation(DRIVER_CAR, 13.0583, 77.6426);
  const pendingReq = newRequest(PASSENGER, "offer_seed_001");
  const pendingRes = await call(requestsRoute.GET, `/api/rides/requests?passengerId=${PASSENGER}`, { userId: PASSENGER });
  assert.equal(pendingRes.status, 200);
  const pendingData = await pendingRes.json();
  const pendingItem = pendingData.requests.find((r) => r.id === pendingReq.id);
  assert.ok(pendingItem);
  assert.equal(pendingItem.driverLocation, undefined, "pending request must not expose driverLocation");

  store.respondToRequest(pendingReq.id, DRIVER_CAR, "reject");
  const rejectedRes = await call(requestsRoute.GET, `/api/rides/requests?passengerId=${PASSENGER}`, { userId: PASSENGER });
  const rejectedData = await rejectedRes.json();
  const rejectedItem = rejectedData.requests.find((r) => r.id === pendingReq.id);
  assert.ok(rejectedItem);
  assert.equal(rejectedItem.driverLocation, undefined, "rejected request must not expose driverLocation");

  store.cancelRequest(pendingReq.id, PASSENGER);
});

test("Fix 2: a failed complete leaves the client UI unchanged and returns server error", async () => {
  const invalidRes = await call(respondRoute.PATCH, "/api/rides/requests/respond", {
    method: "PATCH",
    userId: DRIVER_CAR,
    body: { requestId: "req_nonexistent_99999", action: "complete" },
  });
  assert.equal(invalidRes.status, 409);
  const data = await invalidRes.json();
  assert.ok(data.error);
});

test("Fix 5: registration of an unverified account issues no session cookie, verification does", async () => {
  const email = `cookie.check.${Date.now()}@kju.edu`;
  const regRes = await call(registerRoute.POST, "/api/auth/register", {
    method: "POST",
    body: { name: "Cookie Student", email, password: "password123", role: "passenger" },
  });
  assert.equal(regRes.status, 201);
  const regCookie = regRes.headers.get("set-cookie");
  assert.equal(regCookie, null, "unverified registration must NOT issue a session cookie");

  const regData = await regRes.json();
  assert.ok(regData.verificationToken);

  // Now verify the account
  const verifyRes = await call(verifyRoute.POST, "/api/auth/verify", {
    method: "POST",
    body: { token: regData.verificationToken },
  });
  assert.equal(verifyRes.status, 200);
  const verifyCookie = verifyRes.headers.get("set-cookie");
  assert.ok(verifyCookie && verifyCookie.includes("hopon_session="), "verification issues session cookie");
});

test("Fix 6: registration on non-localhost host does not leak verificationToken", async () => {
  const email = `lan.check.${Date.now()}@kju.edu`;
  const regRes = await call(registerRoute.POST, "http://192.168.1.50:3000/api/auth/register", {
    method: "POST",
    body: { name: "LAN Student", email, password: "password123", role: "passenger" },
  });
  assert.equal(regRes.status, 201);
  const regData = await regRes.json();
  assert.equal(regData.verificationToken, undefined, "non-localhost host must NOT leak verificationToken");
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

// ---------- 7. UPI direct payment & QR flows ----------

test("UPI rides: creation, refusal when driver has no UPI ID, acceptance with zero wallet, completion without wallet movement, and confirm_payment", async () => {
  const db = dbModule.getDb();

  // 1. Creation validates paymentMethod
  const badMethodRes = await call(requestsRoute.POST, "/api/rides/requests", {
    method: "POST",
    userId: PASSENGER,
    body: {
      offerId: "offer_seed_001",
      pickup: "Kristu Jayanti University",
      dropoff: "Manyata Tech Park",
      paymentMethod: "crypto",
    },
  });
  assert.equal(badMethodRes.status, 400, "invalid paymentMethod rejected with 400");

  // Create a driver without a UPI ID
  const noUpiDriverId = `usr_no_upi_${Date.now()}`;
  db.prepare(`
    INSERT INTO users (id, email, password_hash, name, university, rating, role, wallet_balance, student_id_verified, created_at, session_version, upi_id)
    VALUES (?, ?, 'hash', 'No UPI Driver', 'Kristu Jayanti University', 5.0, 'driver', 0, 1, ?, 1, NULL)
  `).run(noUpiDriverId, `noupi_${Date.now()}@kristujayanti.com`, Date.now());

  const noUpiOffer = store.createOffer({
    driverId: noUpiDriverId,
    driverName: "No UPI Driver",
    driverUniversity: "Kristu Jayanti University",
    driverRating: 5.0,
    vehicleType: "Bike",
    vehicleModel: "Honda Shine",
    vehicleNumber: "KA 01 AB 1234",
    from: "Kristu Jayanti University",
    fromLat: 13.0583,
    fromLng: 77.6426,
    to: "Manyata Tech Park",
    toLat: 13.045,
    toLng: 77.62,
    farePerSeat: "35",
    seats: 1,
    departureTime: "Immediate",
    departureDate: "Today",
  });

  // Create a passenger with ₹0 wallet balance
  const brokeUpiPassengerId = `usr_broke_upi_${Date.now()}`;
  db.prepare(`
    INSERT INTO users (id, email, password_hash, name, university, rating, role, wallet_balance, student_id_verified, created_at, session_version)
    VALUES (?, ?, 'hash', 'Broke UPI Passenger', 'Kristu Jayanti University', 5.0, 'passenger', 0, 1, ?, 1)
  `).run(brokeUpiPassengerId, `broke_upi_${Date.now()}@kristujayanti.com`, Date.now());

  // Request UPI ride to driver without UPI ID
  const upiReqToNoUpiDriver = store.createRequest({
    offerId: noUpiOffer.id,
    passengerId: brokeUpiPassengerId,
    passengerName: "Broke UPI Passenger",
    passengerRating: 5.0,
    pickup: "Kristu Jayanti University",
    pickupLat: 13.0583,
    pickupLng: 77.6426,
    dropoff: "Manyata Tech Park",
    dropoffLat: 13.0458,
    dropoffLng: 77.6206,
    paymentMethod: "upi",
  });

  // Driver with no UPI ID cannot accept a UPI ride
  const refuseAcceptRes = await call(respondRoute.PATCH, "/api/rides/requests/respond", {
    method: "PATCH",
    userId: noUpiDriverId,
    body: { requestId: upiReqToNoUpiDriver.id, action: "accept" },
  });
  assert.equal(refuseAcceptRes.status, 409);
  assert.equal((await refuseAcceptRes.json()).error, "This driver doesn't accept UPI.");
  store.cancelRequest(upiReqToNoUpiDriver.id, brokeUpiPassengerId);

  // Now test UPI ride with a driver who HAS a UPI ID (DRIVER_CAR has "aarav.mehta@okaxis")
  const upiReq = store.createRequest({
    offerId: "offer_seed_001",
    passengerId: brokeUpiPassengerId,
    passengerName: "Broke UPI Passenger",
    passengerRating: 5.0,
    pickup: "Kristu Jayanti University",
    pickupLat: 13.0583,
    pickupLng: 77.6426,
    dropoff: "Manyata Tech Park",
    dropoffLat: 13.0458,
    dropoffLng: 77.6206,
    paymentMethod: "upi",
  });
  assert.equal(upiReq.paymentMethod, "upi");
  assert.equal(upiReq.paymentStatus, "none");

  // DRIVER_CAR accepts: should succeed even though passenger wallet balance is 0
  const acceptRes = await call(respondRoute.PATCH, "/api/rides/requests/respond", {
    method: "PATCH",
    userId: DRIVER_CAR,
    body: { requestId: upiReq.id, action: "accept" },
  });
  assert.equal(acceptRes.status, 200, "accept succeeds for UPI ride without checking passenger wallet");

  // Step through arrive -> verify_otp
  await call(respondRoute.PATCH, "/api/rides/requests/respond", {
    method: "PATCH",
    userId: DRIVER_CAR,
    body: { requestId: upiReq.id, action: "arrive" },
  });
  const otp = store.getRequest(upiReq.id).otp;
  await call(respondRoute.PATCH, "/api/rides/requests/respond", {
    method: "PATCH",
    userId: DRIVER_CAR,
    body: { requestId: upiReq.id, action: "verify_otp", otp },
  });

  // Record wallet balances before completion
  const driverRowBefore = db.prepare("SELECT wallet_balance FROM users WHERE id = ?").get(DRIVER_CAR);
  const passengerRowBefore = db.prepare("SELECT wallet_balance FROM users WHERE id = ?").get(brokeUpiPassengerId);

  // Complete ride as driver
  const completeRes = await call(respondRoute.PATCH, "/api/rides/requests/respond", {
    method: "PATCH",
    userId: DRIVER_CAR,
    body: { requestId: upiReq.id, action: "complete" },
  });
  assert.equal(completeRes.status, 200);
  const completeData = await completeRes.json();
  assert.equal(completeData.paymentMethod, "upi");
  assert.equal(completeData.paymentStatus, "pending");
  assert.equal(completeData.amountRupees, 75);
  assert.ok(completeData.upiUri, "driver receives upiUri upon completion");
  assert.ok(completeData.upiUri.includes("pa=aarav.mehta%40okaxis"));
  assert.ok(completeData.upiUri.includes("am=75.00"));

  // Check wallets: NOT changed for UPI rides
  const driverRowAfter = db.prepare("SELECT wallet_balance FROM users WHERE id = ?").get(DRIVER_CAR);
  const passengerRowAfter = db.prepare("SELECT wallet_balance FROM users WHERE id = ?").get(brokeUpiPassengerId);
  assert.equal(driverRowAfter.wallet_balance, driverRowBefore.wallet_balance, "driver wallet unchanged for UPI");
  assert.equal(passengerRowAfter.wallet_balance, passengerRowBefore.wallet_balance, "passenger wallet unchanged for UPI");

  // Check trip history is recorded as Completed
  const tripRow = db.prepare("SELECT * FROM trip_history WHERE request_id = ?").get(upiReq.id);
  assert.ok(tripRow, "trip_history row recorded");
  assert.equal(tripRow.status, "Completed");

  // Privacy: Passenger endpoint must NEVER expose driver's UPI ID or upiUri
  const passGetRes = await call(requestsRoute.GET, `/api/rides/requests?passengerId=${brokeUpiPassengerId}`, {
    userId: brokeUpiPassengerId,
  });
  const passData = await passGetRes.json();
  const passReqView = passData.requests.find((r) => r.id === upiReq.id);
  assert.ok(passReqView);
  assert.equal(passReqView.upiUri, undefined, "passenger request view never leaks upiUri");
  assert.equal(passReqView.offer?.driverUpiId, undefined, "passenger offer view never leaks driver UPI ID");
  assert.equal(JSON.stringify(passData).includes("aarav.mehta@okaxis"), false, "driver UPI ID never in passenger payload");

  // Confirm payment: unauthorized user is rejected (403)
  const nonDriverConfirmRes = await call(respondRoute.PATCH, "/api/rides/requests/respond", {
    method: "PATCH",
    userId: brokeUpiPassengerId,
    body: { requestId: upiReq.id, action: "confirm_payment" },
  });
  assert.equal(nonDriverConfirmRes.status, 403, "only accepting driver can confirm payment");

  // Accepting driver confirms payment
  const confirmRes = await call(respondRoute.PATCH, "/api/rides/requests/respond", {
    method: "PATCH",
    userId: DRIVER_CAR,
    body: { requestId: upiReq.id, action: "confirm_payment" },
  });
  assert.equal(confirmRes.status, 200);
  const confirmData = await confirmRes.json();
  assert.equal(confirmData.paymentStatus, "paid");

  // In database, payment_status is 'paid' and payment_marked_at is a timestamp
  const dbReq = db.prepare("SELECT payment_status, payment_marked_at FROM ride_requests WHERE id = ?").get(upiReq.id);
  assert.equal(dbReq.payment_status, "paid");
  assert.ok(typeof dbReq.payment_marked_at === "number" && dbReq.payment_marked_at > 0);

  // Idempotent: confirming again succeeds and keeps paid status
  const reConfirmRes = await call(respondRoute.PATCH, "/api/rides/requests/respond", {
    method: "PATCH",
    userId: DRIVER_CAR,
    body: { requestId: upiReq.id, action: "confirm_payment" },
  });
  assert.equal(reConfirmRes.status, 200);
  assert.equal((await reConfirmRes.json()).paymentStatus, "paid");
});

test("Rider uploaded QR in profile settings: PATCH /api/auth/me saves QR, enables UPI ride accept, shows on completion, and never leaks to passenger", async () => {
  const db = dbModule.getDb();
  const sampleQr = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  const qrDriverId = `usr_qr_driver_${Date.now()}`;
  db.prepare(`
    INSERT INTO users (id, email, password_hash, name, university, rating, role, wallet_balance, student_id_verified, created_at, session_version, upi_id, upi_qr_image)
    VALUES (?, ?, 'hash', 'QR Only Driver', 'Kristu Jayanti University', 5.0, 'both', 0, 1, ?, 1, NULL, NULL)
  `).run(qrDriverId, `qrdriver_${Date.now()}@kristujayanti.com`, Date.now());

  // Reject invalid QR payload
  const badQrRes = await call(meRoute.PATCH, "/api/auth/me", {
    method: "PATCH",
    userId: qrDriverId,
    body: { upiQrImage: "data:image/svg+xml;base64,PHN2Zz4=" },
  });
  assert.equal(badQrRes.status, 400);

  // Upload valid QR image
  const uploadQrRes = await call(meRoute.PATCH, "/api/auth/me", {
    method: "PATCH",
    userId: qrDriverId,
    body: { upiQrImage: sampleQr },
  });
  assert.equal(uploadQrRes.status, 200);
  const uploadData = await uploadQrRes.json();
  assert.equal(uploadData.user.upiQrImage, sampleQr);

  const offer = store.createOffer({
    driverId: qrDriverId,
    driverName: "QR Only Driver",
    driverUniversity: "Kristu Jayanti University",
    driverRating: 5.0,
    vehicleType: "Bike",
    vehicleModel: "TVS Apache",
    vehicleNumber: "KA 04 QR 1234",
    from: "Kristu Jayanti University",
    fromLat: 13.0583,
    fromLng: 77.6426,
    to: "Manyata Tech Park",
    toLat: 13.045,
    toLng: 77.62,
    farePerSeat: "35",
    seats: 1,
    departureTime: "Immediate",
    departureDate: "Today",
  });

  const qrPassengerId = `usr_qr_pass_${Date.now()}`;
  db.prepare(`
    INSERT INTO users (id, email, password_hash, name, university, rating, role, wallet_balance, student_id_verified, created_at, session_version)
    VALUES (?, ?, 'hash', 'QR Passenger', 'Kristu Jayanti University', 5.0, 'passenger', 0, 1, ?, 1)
  `).run(qrPassengerId, `qrpass_${Date.now()}@kristujayanti.com`, Date.now());

  const req = store.createRequest({
    offerId: offer.id,
    passengerId: qrPassengerId,
    passengerName: "QR Passenger",
    passengerRating: 5.0,
    pickup: "Kristu Jayanti University",
    pickupLat: 13.0583,
    pickupLng: 77.6426,
    dropoff: "Manyata Tech Park",
    dropoffLat: 13.0458,
    dropoffLng: 77.6206,
    paymentMethod: "upi",
  });

  // Driver with uploaded QR (and no upiId) can accept UPI ride
  const acceptRes = await call(respondRoute.PATCH, "/api/rides/requests/respond", {
    method: "PATCH",
    userId: qrDriverId,
    body: { requestId: req.id, action: "accept" },
  });
  assert.equal(acceptRes.status, 200);

  await call(respondRoute.PATCH, "/api/rides/requests/respond", {
    method: "PATCH",
    userId: qrDriverId,
    body: { requestId: req.id, action: "arrive" },
  });
  const otp = store.getRequest(req.id).otp;
  await call(respondRoute.PATCH, "/api/rides/requests/respond", {
    method: "PATCH",
    userId: qrDriverId,
    body: { requestId: req.id, action: "verify_otp", otp },
  });

  const completeRes = await call(respondRoute.PATCH, "/api/rides/requests/respond", {
    method: "PATCH",
    userId: qrDriverId,
    body: { requestId: req.id, action: "complete" },
  });
  assert.equal(completeRes.status, 200);
  const completeData = await completeRes.json();
  assert.equal(completeData.paymentMethod, "upi");
  assert.equal(completeData.paymentStatus, "pending");
  assert.equal(completeData.driverQrImage, sampleQr, "driver receives uploaded QR on completion");

  // Passenger view must NEVER expose driverQrImage
  const passGetRes = await call(requestsRoute.GET, `/api/rides/requests?passengerId=${qrPassengerId}`, {
    userId: qrPassengerId,
  });
  const passData = await passGetRes.json();
  assert.equal(JSON.stringify(passData).includes(sampleQr), false, "driver QR image never leaks to passenger");
});

test("Admin login (admin@kristujayanti.com / 12345678) returns isAdmin user and accesses /api/admin/overview while blocking non-admins", async () => {
  const loginRes = await call(loginRoute.POST, "/api/auth/login", {
    method: "POST",
    body: { email: "admin@kristujayanti.com", password: "12345678" },
  });
  assert.equal(loginRes.status, 200);
  const loginData = await loginRes.json();
  assert.equal(loginData.user.email, "admin@kristujayanti.com");
  assert.equal(loginData.user.isAdmin, true);

  // Non-admin passenger gets 403
  const forbiddenRes = await call(adminOverviewRoute.GET, "/api/admin/overview", {
    userId: PASSENGER,
  });
  assert.equal(forbiddenRes.status, 403);

  // Admin gets 200 and full overview payload
  const adminRes = await call(adminOverviewRoute.GET, "/api/admin/overview", {
    userId: loginData.user.id,
  });
  assert.equal(adminRes.status, 200);
  const overview = await adminRes.json();
  assert.ok(typeof overview.stats.totalUsers === "number");
  assert.ok(Array.isArray(overview.users));
  assert.ok(Array.isArray(overview.offers));
  assert.ok(Array.isArray(overview.requests));
  assert.ok(Array.isArray(overview.ratings));
});

test("Student ID Card OCR verification checks (a) Institution keyword, (b) Student Name match, and (c) Expiration / Academic year for both Rider and Passenger", async () => {
  limiters.registerGlobal.reset("global:register");
  // 1. Direct unit check of all 3 conditions
  const validText =
    "KRISTU JAYANTI UNIVERSITY - Autonomous Institution & College\nStudent Name: Rohan Varma\nRoll No: 24BCAC88\nAcademic Year: 2024 - 2027\nValid Thru: 05/2027";
  const passAll = studentIdVerifier.verifyStudentIdText({
    extractedText: validText,
    registeredName: "Rohan Varma",
    referenceYear: 2025,
  });
  assert.equal(passAll.verified, true, "all 3 conditions match");
  assert.equal(passAll.checks.institution.passed, true);
  assert.equal(passAll.checks.name.passed, true);
  assert.equal(passAll.checks.expiration.passed, true);

  // Condition (a) failure: no University / Institution / College keyword
  const noInstitution = studentIdVerifier.verifyStudentIdText({
    extractedText: "CITY SPORTS CLUB\nMember Name: Rohan Varma\nValid Thru: 2027",
    registeredName: "Rohan Varma",
    referenceYear: 2025,
  });
  assert.equal(noInstitution.verified, false);
  assert.equal(noInstitution.checks.institution.passed, false);
  assert.equal(noInstitution.checks.name.passed, true);
  assert.equal(noInstitution.checks.expiration.passed, true);

  // Condition (b) failure: name on ID card does not match registered name
  const wrongName = studentIdVerifier.verifyStudentIdText({
    extractedText: validText,
    registeredName: "Ananya Nair",
    referenceYear: 2025,
  });
  assert.equal(wrongName.verified, false);
  assert.equal(wrongName.checks.institution.passed, true);
  assert.equal(wrongName.checks.name.passed, false);
  assert.equal(wrongName.checks.expiration.passed, true);

  // Condition (c) failure: expired academic year (2019-2022)
  const expiredCard = studentIdVerifier.verifyStudentIdText({
    extractedText:
      "Kristu Jayanti College\nStudent Name: Rohan Varma\nAcademic Year: 2019 - 2022",
    registeredName: "Rohan Varma",
    referenceYear: 2025,
  });
  assert.equal(expiredCard.verified, false);
  assert.equal(expiredCard.checks.institution.passed, true);
  assert.equal(expiredCard.checks.name.passed, true);
  assert.equal(expiredCard.checks.expiration.passed, false);

  // 2. Test /api/auth/verify-id-card with base64 SVG ID card image
  const makeSvgIdCard = (textLines) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360"><text>${textLines.join(" | ")}</text></svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
  };

  const validCardImage = makeSvgIdCard([
    "Kristu Jayanti University",
    "Student Name: Meera Krishnan",
    "Roll No: 24BCAC77",
    "Batch: 2024 - 2027",
  ]);

  const apiCheckRes = await call(verifyIdCardRoute.POST, "/api/auth/verify-id-card", {
    method: "POST",
    body: {
      idCardImage: validCardImage,
      registeredName: "Meera Krishnan",
      registeredRollNumber: "24BCAC77",
    },
  });
  assert.equal(apiCheckRes.status, 200);
  const apiCheckData = await apiCheckRes.json();
  assert.equal(apiCheckData.verified, true);
  assert.equal(apiCheckData.checks.rollNumber.passed, true);

  // Incorrect roll number in the textbox must fail verification
  const wrongRollRes = await call(verifyIdCardRoute.POST, "/api/auth/verify-id-card", {
    method: "POST",
    body: {
      idCardImage: validCardImage,
      registeredName: "Meera Krishnan",
      registeredRollNumber: "24BCAC99",
    },
  });
  assert.equal(wrongRollRes.status, 422, "Mismatched roll number in textbox fails verification");
  const wrongRollData = await wrongRollRes.json();
  assert.equal(wrongRollData.verified, false);
  assert.equal(wrongRollData.checks.rollNumber.passed, false);

  // 3. Test Passenger Registration with Valid ID Card -> Automatically verified + session cookie issued
  const passengerEmail = `id.passenger.${Date.now()}@kristujayanti.com`;
  const passRegRes = await call(registerRoute.POST, "/api/auth/register", {
    method: "POST",
    body: {
      name: "Meera Krishnan",
      email: passengerEmail,
      password: "password123",
      role: "passenger",
      studentRollNumber: "24BCAC77",
      idCardImage: validCardImage,
      requireIdCardVerification: true,
    },
  });
  assert.equal(passRegRes.status, 201);
  const passRegData = await passRegRes.json();
  assert.equal(passRegData.user.studentIdVerified, true, "Passenger automatically verified after 3-point ID check");
  assert.equal(passRegData.verificationRequired, false);
  assert.ok(passRegRes.headers.get("set-cookie")?.includes("hopon_session="), "Verified passenger receives session cookie immediately");

  // 4. Test Rider ('both') Registration with Valid ID Card -> Automatically verified with 'both' role unlocked
  const riderEmail = `id.rider.${Date.now()}@kristujayanti.com`;
  const riderCardImage = makeSvgIdCard([
    "Kristu Jayanti Institution of Management",
    "Student Name: Vikram Aditya",
    "Roll No: 25MBA102",
    "Academic Year: 2025 - 2028",
  ]);
  const riderRegRes = await call(registerRoute.POST, "/api/auth/register", {
    method: "POST",
    body: {
      name: "Vikram Aditya",
      email: riderEmail,
      password: "password123",
      role: "both",
      studentRollNumber: "25MBA102",
      vehicleType: "Bike",
      vehicleModel: "TVS Apache RTR",
      vehicleNumber: "KA 03 MN 8899",
      idCardImage: riderCardImage,
      requireIdCardVerification: true,
    },
  });
  assert.equal(riderRegRes.status, 201);
  const riderRegData = await riderRegRes.json();
  assert.equal(riderRegData.user.studentIdVerified, true, "Rider automatically verified after 3-point ID check");
  assert.equal(riderRegData.user.role, "both", "Rider role unlocked immediately upon ID card verification");

  // 5. Test Registration rejected when ID card fails verification (e.g. expired card)
  const expiredCardImage = makeSvgIdCard([
    "Kristu Jayanti College",
    "Student Name: Expired Student",
    "Academic Year: 2018 - 2021",
  ]);
  const failRegRes = await call(registerRoute.POST, "/api/auth/register", {
    method: "POST",
    body: {
      name: "Expired Student",
      email: `id.expired.${Date.now()}@kristujayanti.com`,
      password: "password123",
      role: "passenger",
      idCardImage: expiredCardImage,
      requireIdCardVerification: true,
    },
  });
  assert.equal(failRegRes.status, 400, "Expired ID card blocks registration verification");
  const failRegData = await failRegRes.json();
  assert.equal(failRegData.idVerification.verified, false);
  assert.equal(failRegData.idVerification.checks.expiration.passed, false);
});




