import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./support/load-ts.mjs";

// Real lib/rideStore.ts. State lives in memory for the whole file, so tests run in order
// and each one uses its own passenger id to stay independent.
const store = await loadTs("lib/rideStore.ts");
const {
  listActiveOffers,
  getOffer,
  createOffer,
  createRequest,
  respondToRequest,
  markDriverArrived,
  verifyRideOtp,
  completeRide,
  cancelRequest,
  listRequestsForDriver,
  listRequestsForPassenger,
  getRequest,
  updateDriverLocation,
  getDriverLocation,
  canViewDriverLocation,
  countActiveOffersForDriver,
  listTripHistoryForUser,
  sendRideMessage,
  listRideMessages,
  createTrackingToken,
  revokeTrackingToken,
  getPublicRideTracking,
  toDriverView,
  subscribeRideEvents,
  pruneStore,
  PENDING_TTL_MS,
  TERMINAL_TTL_MS,
  COMPLETED_TRACKING_TTL_MS,
  STALE_LOCATION_MS,
} = store;

const CAR_OFFER = "offer_seed_001"; // driver usr_driver_demo_01, 3 seats
const BIKE_OFFER = "offer_seed_002"; // driver usr_driver_demo_02, 1 seat
const SCOOTY_OFFER = "offer_seed_003"; // driver usr_driver_demo_03, 1 seat

const requestFor = (offerId, passengerId) => ({
  offerId,
  passengerId,
  passengerName: `Passenger ${passengerId}`,
  passengerRating: 4.9,
  pickup: "Kristu Jayanti University",
  pickupLat: 13.0583,
  pickupLng: 77.6426,
  dropoff: "Manyata Tech Park",
  dropoffLat: 13.0458,
  dropoffLng: 77.6206,
});

const isError = (r) => typeof r === "object" && r !== null && "error" in r;

test("seed offers (car, bike, scooty) are available on startup", () => {
  const ids = listActiveOffers().map((o) => o.id);
  for (const id of [CAR_OFFER, BIKE_OFFER, SCOOTY_OFFER]) {
    assert.ok(ids.includes(id), `missing seed offer ${id}`);
  }
  assert.equal(getOffer(CAR_OFFER).seatsLeft, 3);
  assert.equal(getOffer(BIKE_OFFER).seatsLeft, 1);
});

test("createRequest rejects unknown offers", () => {
  const r = createRequest(requestFor("offer_does_not_exist", "p_unknown"));
  assert.ok(isError(r));
  assert.equal(r.error, "Ride offer not found.");
});

test("createRequest creates a pending request and blocks duplicates", () => {
  const first = createRequest(requestFor(CAR_OFFER, "p_dup"));
  assert.ok(!isError(first));
  assert.equal(first.status, "pending");
  assert.ok(first.id.startsWith("req_"));

  const again = createRequest(requestFor(CAR_OFFER, "p_dup"));
  assert.ok(isError(again));
  assert.equal(again.error, "You already have an active ride request.");
});

test("only the offer's driver can respond, and only once", () => {
  const req = createRequest(requestFor(BIKE_OFFER, "p_respond"));
  assert.ok(!isError(req));

  const wrongDriver = respondToRequest(req.id, "usr_driver_demo_01", "accept");
  assert.ok(isError(wrongDriver));
  assert.equal(wrongDriver.error, "Not authorised.");

  const accepted = respondToRequest(req.id, "usr_driver_demo_02", "accept");
  assert.ok(!isError(accepted));
  assert.equal(accepted.status, "accepted");

  const twice = respondToRequest(req.id, "usr_driver_demo_02", "accept");
  assert.ok(isError(twice));
  assert.equal(twice.error, "Request already handled.");
});

test("accepting the last seat marks the offer full and hides it", () => {
  // BIKE_OFFER's single seat was taken in the previous test.
  const offer = getOffer(BIKE_OFFER);
  assert.equal(offer.seatsLeft, 0);
  assert.equal(offer.status, "full");
  assert.ok(!listActiveOffers().some((o) => o.id === BIKE_OFFER));

  const blocked = createRequest(requestFor(BIKE_OFFER, "p_late"));
  assert.ok(isError(blocked));
  assert.equal(blocked.error, "This ride is no longer available.");
});

test("cancelling an accepted request frees the seat and lets the passenger re-book", () => {
  const accepted = listRequestsForPassenger("p_respond").find((r) => r.status === "accepted");
  assert.ok(accepted, "expected the accepted request from the earlier test");

  const stranger = cancelRequest(accepted.id, "someone_else");
  assert.ok(isError(stranger));
  assert.equal(stranger.error, "Not authorised.");

  const cancelled = cancelRequest(accepted.id, "p_respond");
  assert.ok(!isError(cancelled));
  assert.equal(cancelled.status, "cancelled");
  assert.equal(getRequest(accepted.id).status, "cancelled");

  const offer = getOffer(BIKE_OFFER);
  assert.equal(offer.seatsLeft, 1, "seat is given back");
  assert.equal(offer.status, "active", "offer is bookable again");
  assert.ok(listActiveOffers().some((o) => o.id === BIKE_OFFER));

  const again = cancelRequest(accepted.id, "p_respond");
  assert.ok(isError(again));
  assert.equal(again.error, "This request can no longer be cancelled.");

  // Regression: a cancelled request must not block booking the same offer again (used to 409).
  const rebook = createRequest(requestFor(BIKE_OFFER, "p_respond"));
  assert.ok(!isError(rebook), "re-booking after cancel should succeed");
  assert.equal(rebook.status, "pending");

  // Accepting driver can also finish/close an accepted request, freeing the seat
  const reAccepted = respondToRequest(rebook.id, "usr_driver_demo_02", "accept");
  assert.ok(!isError(reAccepted));
  assert.equal(getOffer(BIKE_OFFER).seatsLeft, 0);
  const completedByDriver = cancelRequest(rebook.id, "usr_driver_demo_02");
  assert.ok(!isError(completedByDriver));
  assert.equal(completedByDriver.status, "cancelled");
  assert.equal(getOffer(BIKE_OFFER).seatsLeft, 1);
});

test("cancelling a pending request does not change seat counts", () => {
  const before = getOffer(CAR_OFFER).seatsLeft;
  const req = createRequest(requestFor(CAR_OFFER, "p_pending_cancel"));
  assert.ok(!isError(req));

  const cancelled = cancelRequest(req.id, "p_pending_cancel");
  assert.equal(cancelled.status, "cancelled");
  assert.equal(getOffer(CAR_OFFER).seatsLeft, before);
});

test("rejecting a request keeps the seat and cannot be cancelled afterwards", () => {
  const before = getOffer(SCOOTY_OFFER).seatsLeft;
  const req = createRequest(requestFor(SCOOTY_OFFER, "p_rejected"));
  assert.ok(!isError(req));

  const rejected = respondToRequest(req.id, "usr_driver_demo_03", "reject");
  assert.equal(rejected.status, "rejected");
  assert.equal(getOffer(SCOOTY_OFFER).seatsLeft, before, "rejection must not consume a seat");

  const cancel = cancelRequest(req.id, "p_rejected");
  assert.ok(isError(cancel));

  // A rejected passenger may try the same offer again.
  const retry = createRequest(requestFor(SCOOTY_OFFER, "p_rejected"));
  assert.ok(!isError(retry));
});

test("seat count never exceeds the offer's capacity after cancels", () => {
  const offer = createOffer({
    driverId: "drv_cap",
    driverName: "Cap Driver",
    driverUniversity: "KJU",
    driverRating: 5,
    vehicleModel: "Test Car",
    vehicleNumber: "KA 00 TT 0001",
    vehicleType: "Car",
    from: "A",
    fromLat: 13.05,
    fromLng: 77.64,
    to: "B",
    toLat: 13.04,
    toLng: 77.62,
    departureTime: "Now",
    departureDate: "Today",
    seats: 2,
    farePerSeat: "40",
  });

  const req = createRequest(requestFor(offer.id, "p_cap"));
  respondToRequest(req.id, "drv_cap", "accept");
  assert.equal(getOffer(offer.id).seatsLeft, 1);
  cancelRequest(req.id, "p_cap");
  assert.equal(getOffer(offer.id).seatsLeft, 2);
  assert.ok(getOffer(offer.id).seatsLeft <= getOffer(offer.id).seats);
});

test("createOffer starts active with all seats free and a unique id", () => {
  const base = {
    driverId: "drv_new",
    driverName: "New Driver",
    driverUniversity: "KJU",
    driverRating: 4.5,
    vehicleModel: "Activa",
    vehicleNumber: "KA 01 AA 1111",
    vehicleType: "Scooty",
    from: "Kristu Jayanti University",
    fromLat: 13.0583,
    fromLng: 77.6426,
    to: "Hennur Cross",
    toLat: 13.0373,
    toLng: 77.6409,
    departureTime: "5:30 PM",
    departureDate: "Today",
    seats: 1,
    farePerSeat: "30",
  };
  const a = createOffer(base);
  const b = createOffer(base);

  assert.notEqual(a.id, b.id);
  assert.equal(a.status, "active");
  assert.equal(a.seatsLeft, a.seats);
  assert.ok(listActiveOffers().some((o) => o.id === a.id));
  // The coordinates the driver published are kept as-is (regression: they used to be hardcoded).
  assert.equal(a.fromLat, 13.0583);
  assert.equal(a.toLat, 13.0373);
});

test("driver and passenger request lists are scoped correctly", () => {
  const driverRequests = listRequestsForDriver("usr_driver_demo_01");
  // Open requests (offerId === null) are visible to every driver; addressed ones only to their offer's driver.
  assert.ok(
    driverRequests.every((r) => r.offerId === null || getOffer(r.offerId).driverId === "usr_driver_demo_01")
  );
  assert.ok(driverRequests.some((r) => r.passengerId === "p_dup"));

  const mine = listRequestsForPassenger("p_dup");
  assert.ok(mine.length >= 1);
  assert.ok(mine.every((r) => r.passengerId === "p_dup"));
  assert.deepEqual(listRequestsForPassenger("nobody"), []);
});

test("driver live location is stored and overwritten", () => {
  assert.equal(getDriverLocation("drv_live"), undefined);
  updateDriverLocation("drv_live", 13.05, 77.64);
  assert.equal(getDriverLocation("drv_live").lat, 13.05);

  const moved = updateDriverLocation("drv_live", 13.06, 77.65, 90, 12);
  assert.equal(getDriverLocation("drv_live").lat, 13.06);
  assert.equal(moved.heading, 90);
  assert.ok(moved.updatedAt <= Date.now());
});

const offerFor = (driverId, overrides = {}) => ({
  driverId,
  driverName: `Driver ${driverId}`,
  driverUniversity: "KJU",
  driverRating: 4.7,
  vehicleModel: "Test Car",
  vehicleNumber: "KA 00 TT 0002",
  vehicleType: "Car",
  from: "Kristu Jayanti University",
  fromLat: 13.0583,
  fromLng: 77.6426,
  to: "Manyata Tech Park",
  toLat: 13.0458,
  toLng: 77.6206,
  departureTime: "Now",
  departureDate: "Today",
  seats: 2,
  farePerSeat: "40",
  ...overrides,
});

test("open requests: a driver needs a live ride to accept, declining only hides it, first accept wins", () => {
  const open = createRequest(requestFor(undefined, "p_open"));
  assert.ok(!isError(open));
  assert.equal(open.offerId, null);
  assert.deepEqual(open.declinedBy, []);

  // Every driver sees an open pending request
  assert.ok(listRequestsForDriver("usr_driver_demo_01").some((r) => r.id === open.id));
  assert.ok(listRequestsForDriver("drv_no_offer").some((r) => r.id === open.id));

  // A driver without a live ride can't accept it
  const noOffer = respondToRequest(open.id, "drv_no_offer", "accept");
  assert.ok(isError(noOffer));
  assert.match(noOffer.error, /Post a ride first/);

  // Declining hides it for that driver only and leaves the request pending
  const declined = respondToRequest(open.id, "usr_driver_demo_01", "reject");
  assert.equal(declined.status, "pending");
  assert.ok(!listRequestsForDriver("usr_driver_demo_01").some((r) => r.id === open.id));
  assert.ok(listRequestsForDriver("drv_no_offer").some((r) => r.id === open.id));

  // A driver with a live ride accepts: their offer is attached and a seat is used
  const offer = createOffer(offerFor("drv_open"));
  const accepted = respondToRequest(open.id, "drv_open", "accept");
  assert.ok(!isError(accepted));
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.offerId, offer.id);
  assert.equal(getOffer(offer.id).seatsLeft, 1);

  // Everyone else is too late
  const late = respondToRequest(open.id, "usr_driver_demo_01", "accept");
  assert.ok(isError(late));
  assert.equal(late.error, "Request already handled.");
});

test("people can't request or accept their own rides", () => {
  const own = createOffer(offerFor("drv_self"));
  const selfBook = createRequest(requestFor(own.id, "drv_self"));
  assert.ok(isError(selfBook));
  assert.equal(selfBook.error, "You can't request your own ride.");

  const open = createRequest(requestFor(undefined, "p_self_open"));
  assert.ok(!isError(open));
  const selfAccept = respondToRequest(open.id, "p_self_open", "accept");
  assert.ok(isError(selfAccept));
  assert.equal(selfAccept.error, "You can't respond to your own request.");
});

test("a driver's live location is visible only to them and passengers they accepted", () => {
  assert.ok(canViewDriverLocation("drv_open", "drv_open"), "drivers can see themselves");
  assert.ok(canViewDriverLocation("p_open", "drv_open"), "accepted passenger can track the driver");
  assert.ok(canViewDriverLocation("drv_open", "p_open"), "accepting driver can track the passenger");
  assert.ok(!canViewDriverLocation("p_open", "usr_driver_demo_01"), "but not other drivers");
  assert.ok(!canViewDriverLocation("stranger", "drv_open"), "strangers can't track anyone");

  const accepted = listRequestsForPassenger("p_open").find((r) => r.status === "accepted");
  cancelRequest(accepted.id, "p_open");
  assert.ok(!canViewDriverLocation("p_open", "drv_open"), "tracking ends when the ride is cancelled");
  assert.ok(!canViewDriverLocation("drv_open", "p_open"), "driver tracking of passenger also ends");
});

test("countActiveOffersForDriver counts only that driver's active offers", () => {
  assert.equal(countActiveOffersForDriver("drv_count"), 0);
  createOffer(offerFor("drv_count"));
  createOffer(offerFor("drv_count"));
  assert.equal(countActiveOffersForDriver("drv_count"), 2);
  assert.equal(countActiveOffersForDriver("someone_else"), 0);
});

test("accepted rides generate a fresh 4-digit OTP and progress through arrive -> verifyRideOtp", () => {
  const offer = createOffer(offerFor("drv_otp", { seats: 3 }));
  const req1 = createRequest(requestFor(offer.id, "p_otp_1"));
  assert.ok(!isError(req1));

  const accepted1 = respondToRequest(req1.id, "drv_otp", "accept");
  assert.ok(!isError(accepted1));
  assert.match(accepted1.otp, /^\d{4}$/, "4-digit OTP generated on accept");
  assert.equal(accepted1.tripStage, "en_route_pickup");

  // Cannot verify OTP before marking arrival at pickup
  const premature = verifyRideOtp(req1.id, "drv_otp", accepted1.otp);
  assert.ok(isError(premature));
  assert.match(premature.error, /arrived/i);

  // Driver marks arrival at pickup
  const arrived = markDriverArrived(req1.id, "drv_otp");
  assert.ok(!isError(arrived));
  assert.equal(arrived.tripStage, "arrived_pickup");
  assert.ok(typeof arrived.arrivedAt === "number");

  // Wrong OTP is rejected
  const wrongCode = accepted1.otp === "1234" ? "9999" : "1234";
  const badOtp = verifyRideOtp(req1.id, "drv_otp", wrongCode);
  assert.ok(isError(badOtp));
  assert.match(badOtp.error, /Incorrect 4-digit OTP/);

  // Correct OTP unlocks dropoff stage (in_progress)
  const verified = verifyRideOtp(req1.id, "drv_otp", accepted1.otp);
  assert.ok(!isError(verified));
  assert.equal(verified.tripStage, "in_progress");
  assert.ok(typeof verified.startedAt === "number");

  // In-ride chat messages and public tracking link work and never leak OTP
  const events = [];
  const unsub = subscribeRideEvents((e) => events.push(e));
  const msg1 = sendRideMessage({
    requestId: req1.id,
    senderId: "p_otp_1",
    senderName: "Passenger p_otp_1",
    senderRole: "passenger",
    text: "I'm at Gate 1",
  });
  unsub();
  assert.ok(!isError(msg1));
  assert.ok(events.some((e) => e.type === "message" && e.requestId === req1.id));
  const msgs = listRideMessages(req1.id, "drv_otp");
  assert.ok(Array.isArray(msgs) && msgs.length === 1);
  assert.equal(msgs[0].text, "I'm at Gate 1");
  assert.ok(isError(listRideMessages(req1.id, "stranger")));

  const tokenResult = createTrackingToken(req1.id, "p_otp_1");
  assert.ok(!isError(tokenResult));
  assert.equal(getPublicRideTracking(req1.id), null, "requestId alone cannot track a ride");

  const pub = getPublicRideTracking(tokenResult.token);
  assert.ok(pub);
  assert.equal(pub.tripStage, "in_progress");
  assert.equal(pub.passengerFirstName, "Passenger");
  assert.ok(!("otp" in pub), "public tracking never exposes OTP");
  assert.ok(!("vehicleNumber" in pub), "public tracking never exposes vehicle plate");
  assert.ok(!("passengerName" in pub), "public tracking never exposes full passenger name");

  // Verify toDriverView whitelists allowed fields and strips otp, otpAttempts, otpLockedUntil, shareToken, declinedBy
  const driverSerialized = toDriverView(getRequest(req1.id));
  assert.equal(driverSerialized.id, req1.id);
  assert.equal(driverSerialized.passengerName, "Passenger p_otp_1");
  assert.ok(driverSerialized.offer);
  for (const forbidden of ["otp", "otpAttempts", "otpLockedUntil", "shareToken", "declinedBy"]) {
    assert.ok(!(forbidden in driverSerialized), `toDriverView must not expose ${forbidden}`);
  }

  // Passenger can revoke the share token, or regenerate it
  assert.ok(!isError(revokeTrackingToken(req1.id, "p_otp_1")));
  assert.equal(getPublicRideTracking(tokenResult.token), null, "revoked token stops working");
  const tokenResult2 = createTrackingToken(req1.id, "p_otp_1");
  assert.ok(!isError(tokenResult2));

  // Complete first ride and book a new ride -> gets a new 4-digit OTP that differs from the previous one
  const completed1 = completeRide(req1.id, "drv_otp");
  assert.ok(!isError(completed1));
  assert.equal(completed1.status, "completed");
  const afterComplete = getPublicRideTracking(tokenResult2.token);
  assert.ok(afterComplete, "tracking stays valid briefly after completion");
  assert.equal(afterComplete.status, "completed");
  assert.equal(
    getPublicRideTracking(tokenResult2.token, completed1.completedAt + COMPLETED_TRACKING_TTL_MS + 1),
    null,
    "tracking stops 10 minutes after completion"
  );
  const history = listTripHistoryForUser("p_otp_1");
  assert.equal(history.length, 1, "completed OTP-verified trip is recorded in trip_history");
  assert.equal(history[0].status, "Completed");

  const req2 = createRequest(requestFor(offer.id, "p_otp_1"));
  assert.ok(!isError(req2));
  const accepted2 = respondToRequest(req2.id, "drv_otp", "accept");
  assert.ok(!isError(accepted2));
  assert.match(accepted2.otp, /^\d{4}$/);
  assert.notEqual(accepted2.otp, accepted1.otp, "new ride gets a new OTP");
  cancelRequest(req2.id, "drv_otp");
});

test("verifyRideOtp locks verification for 10 minutes after 5 wrong attempts", () => {
  const offer = createOffer(offerFor("drv_lockout", { seats: 2 }));
  const req = createRequest(requestFor(offer.id, "p_lockout"));
  assert.ok(!isError(req));
  const accepted = respondToRequest(req.id, "drv_lockout", "accept");
  assert.ok(!isError(accepted));
  markDriverArrived(req.id, "drv_lockout");

  const wrongCode = accepted.otp === "0000" ? "9999" : "0000";
  const t0 = Date.now();

  for (let i = 1; i <= 4; i++) {
    const attempt = verifyRideOtp(req.id, "drv_lockout", wrongCode, t0);
    assert.ok(isError(attempt));
    assert.ok(!attempt.locked, `attempt ${i} should not lock yet`);
  }

  // 5th wrong try triggers the 10-minute lockout
  const fifth = verifyRideOtp(req.id, "drv_lockout", wrongCode, t0);
  assert.ok(isError(fifth));
  assert.equal(fifth.locked, true);
  assert.match(fifth.error, /locked for 10 minutes/i);

  // Even the RIGHT OTP is rejected while locked
  const whileLocked = verifyRideOtp(req.id, "drv_lockout", accepted.otp, t0 + 5 * 60 * 1000);
  assert.ok(isError(whileLocked));
  assert.equal(whileLocked.locked, true);

  // After 10 minutes + 1s, the lock expires and the right OTP succeeds
  const afterExpiry = verifyRideOtp(req.id, "drv_lockout", accepted.otp, t0 + 10 * 60 * 1000 + 1000);
  assert.ok(!isError(afterExpiry));
  assert.equal(afterExpiry.tripStage, "in_progress");
  cancelRequest(req.id, "drv_lockout");
});

test("a driver cannot accept a second request while they already have an unfinished accepted ride", () => {
  const offer = createOffer(offerFor("drv_single_active", { seats: 3 }));
  const r1 = createRequest(requestFor(offer.id, "p_single_1"));
  const r2 = createRequest(requestFor(offer.id, "p_single_2"));
  assert.ok(!isError(r1) && !isError(r2));

  const firstAccept = respondToRequest(r1.id, "drv_single_active", "accept");
  assert.ok(!isError(firstAccept));

  const secondAccept = respondToRequest(r2.id, "drv_single_active", "accept");
  assert.ok(isError(secondAccept));
  assert.match(secondAccept.error, /already have an active accepted ride/i);

  // Once the first ride is finished/cancelled, the driver can accept the next request
  cancelRequest(r1.id, "drv_single_active");
  const retrySecond = respondToRequest(r2.id, "drv_single_active", "accept");
  assert.ok(!isError(retrySecond));
  cancelRequest(r2.id, "drv_single_active");
});

test("tracking tokens enforce passenger-only auth and 24-hour expiry", () => {
  const offer = createOffer(offerFor("drv_track_auth", { seats: 1 }));
  const req = createRequest(requestFor(offer.id, "p_track_auth"));
  assert.ok(!isError(req));
  respondToRequest(req.id, "drv_track_auth", "accept");

  // Driver or stranger cannot generate or revoke the passenger's tracking token
  assert.ok(isError(createTrackingToken(req.id, "drv_track_auth")));
  assert.ok(isError(createTrackingToken(req.id, "stranger")));

  const tok = createTrackingToken(req.id, "p_track_auth");
  assert.ok(!isError(tok));
  assert.ok(isError(revokeTrackingToken(req.id, "drv_track_auth")));

  // Valid now, but expires after 24 hours
  assert.ok(getPublicRideTracking(tok.token, req.createdAt + 1000));
  assert.equal(
    getPublicRideTracking(tok.token, req.createdAt + TERMINAL_TTL_MS + 1000),
    null,
    "tracking link expires after 24h"
  );
  cancelRequest(req.id, "drv_track_auth");
});

test("completeRide atomically transfers fare between passenger and driver wallets and cancellation after start is Cancelled", async () => {
  const accounts = await loadTs("lib/accounts.ts");
  const pUser = accounts.registerUser({
    name: "Wallet Passenger",
    email: "wallet.passenger@kju.edu",
    password: "password123",
    role: "passenger",
  });
  const dUser = accounts.registerUser({
    name: "Wallet Driver",
    email: "wallet.driver@kju.edu",
    password: "password123",
    role: "driver",
    vehicleType: "Car",
    vehicleModel: "Honda City",
    vehicleNumber: "KA 01 AB 1234",
  });
  assert.ok(!isError(pUser) && !isError(dUser));
  assert.equal(pUser.studentIdVerified, false, "newly registered user starts unverified");
  assert.equal(dUser.studentIdVerified, false, "newly registered driver starts unverified");
  assert.equal(
    dUser.role,
    "passenger",
    "unverified user cannot act as a driver until email is verified"
  );
  assert.deepEqual(
    listRequestsForDriver(dUser.id),
    [],
    "unverified driver cannot see open ride requests"
  );
  assert.throws(
    () => createOffer(offerFor(dUser.id, { farePerSeat: "60", seats: 2 })),
    /verify your university email/i,
    "unverified driver cannot post offers"
  );

  // Verify driver and passenger email ownership to unlock verified state and grant starting wallet bonus
  const pTok = accounts.createEmailVerificationToken(pUser.id);
  assert.ok(!isError(pTok));
  accounts.verifyEmailToken(pTok.token);

  const verifyTok = accounts.createEmailVerificationToken(dUser.id);
  assert.ok(!isError(verifyTok));
  const verifiedRes = accounts.verifyEmailToken(verifyTok.token);
  assert.ok(!isError(verifiedRes));
  assert.equal(verifiedRes.user.studentIdVerified, true);
  assert.equal(verifiedRes.user.role, "driver");

  const offer = createOffer(offerFor(dUser.id, { farePerSeat: "60", seats: 2 }));
  const req = createRequest(requestFor(offer.id, pUser.id));
  assert.ok(!isError(req));

  // If passenger's wallet balance is below the offer fare at accept time, respondToRequest rejects the accept
  accounts.adjustWalletBalance(pUser.id, -220); // balance becomes 30 (< 60)
  const rejectedLowBalance = respondToRequest(req.id, dUser.id, "accept");
  assert.ok(isError(rejectedLowBalance), "accept must fail when passenger balance < fare");
  assert.match(rejectedLowBalance.error, /insufficient HopOn Wallet balance/i);
  assert.equal(getRequest(req.id).status, "pending");

  // Restore passenger wallet balance to 250 and accept
  accounts.adjustWalletBalance(pUser.id, 220);
  const accepted = respondToRequest(req.id, dUser.id, "accept");
  assert.ok(!isError(accepted));
  assert.equal(accepted.agreedFare, "60", "agreedFare stored on request when accepted");
  assert.equal(toDriverView(accepted).agreedFare, "60");

  markDriverArrived(req.id, dUser.id);
  const currentReq = getRequest(req.id);
  verifyRideOtp(req.id, dUser.id, currentReq.otp);

  const shareTok = createTrackingToken(req.id, pUser.id);
  assert.ok(!isError(shareTok));

  const completed = completeRide(req.id, dUser.id);
  assert.ok(!isError(completed));
  assert.equal(completed.status, "completed", "completeRide sets status to completed, not cancelled");
  assert.ok(completed.completedAt, "completedAt timestamp is set");

  // Tracking link stays valid for 10 minutes after completion showing status === 'completed', then expires
  const trackDuring10Min = getPublicRideTracking(
    shareTok.token,
    completed.completedAt + 5 * 60 * 1000
  );
  assert.ok(trackDuring10Min, "tracking link valid within 10 minutes after completion");
  assert.equal(trackDuring10Min.status, "completed");

  const trackAfter10Min = getPublicRideTracking(
    shareTok.token,
    completed.completedAt + COMPLETED_TRACKING_TTL_MS + 1000
  );
  assert.equal(
    trackAfter10Min,
    null,
    "tracking link expires 10 minutes after completion"
  );

  const pAfter = accounts.getUserById(pUser.id);
  const dAfter = accounts.getUserById(dUser.id);
  assert.equal(pAfter.walletBalance, 250 - 60, "fare deducted from passenger wallet");
  assert.equal(dAfter.walletBalance, 250 + 60, "fare credited to driver wallet");
  assert.equal(pAfter.ridesCompleted, 1);
  assert.equal(dAfter.ridesCompleted, 1);

  // Now test that cancelling even after OTP verification (in_progress) records 'Cancelled', not 'Completed'
  const reqCancel = createRequest(requestFor(offer.id, pUser.id));
  assert.ok(!isError(reqCancel));
  respondToRequest(reqCancel.id, dUser.id, "accept");
  markDriverArrived(reqCancel.id, dUser.id);
  verifyRideOtp(reqCancel.id, dUser.id, getRequest(reqCancel.id).otp);
  cancelRequest(reqCancel.id, dUser.id);

  const history = listTripHistoryForUser(pUser.id);
  const cancelledEntry = history.find((h) => h.requestId === reqCancel.id);
  assert.ok(cancelledEntry);
  assert.equal(cancelledEntry.status, "Cancelled", "cancellation after start must not count as Completed");
});

// Keep this test last: it fast-forwards time and deletes old data.
test("pruneStore cancels stale pending requests and removes old data but keeps seed offers", () => {
  const req = createRequest(requestFor(undefined, "p_prune"));
  assert.ok(!isError(req));
  updateDriverLocation("drv_stale", 13.05, 77.64);
  const now = Date.now();

  // Unanswered for too long -> cancelled (not deleted yet)
  pruneStore(now + PENDING_TTL_MS + 1000);
  assert.equal(getRequest(req.id).status, "cancelled");

  // Stale driver locations are dropped
  pruneStore(now + STALE_LOCATION_MS + 1000);
  assert.equal(getDriverLocation("drv_stale"), undefined);

  // A day later finished requests and non-seed offers are removed
  const result = pruneStore(now + TERMINAL_TTL_MS * 2);
  assert.ok(result.requests >= 1);
  assert.equal(getRequest(req.id), undefined);
  assert.equal(countActiveOffersForDriver("drv_count"), 0);
  assert.ok(getOffer(CAR_OFFER), "seed offers are kept");
});
