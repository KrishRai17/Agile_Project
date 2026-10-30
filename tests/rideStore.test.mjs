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
  cancelRequest,
  listRequestsForDriver,
  listRequestsForPassenger,
  getRequest,
  updateDriverLocation,
  getDriverLocation,
  canViewDriverLocation,
  countActiveOffersForDriver,
  pruneStore,
  PENDING_TTL_MS,
  TERMINAL_TTL_MS,
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
  assert.ok(!canViewDriverLocation("p_open", "usr_driver_demo_01"), "but not other drivers");
  assert.ok(!canViewDriverLocation("stranger", "drv_open"), "strangers can't track anyone");

  const accepted = listRequestsForPassenger("p_open").find((r) => r.status === "accepted");
  cancelRequest(accepted.id, "p_open");
  assert.ok(!canViewDriverLocation("p_open", "drv_open"), "tracking ends when the ride is cancelled");
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

  // Complete first ride and book a new ride -> gets a new 4-digit OTP that differs from the previous one
  cancelRequest(req1.id, "drv_otp");
  const req2 = createRequest(requestFor(offer.id, "p_otp_1"));
  assert.ok(!isError(req2));
  const accepted2 = respondToRequest(req2.id, "drv_otp", "accept");
  assert.ok(!isError(accepted2));
  assert.match(accepted2.otp, /^\d{4}$/);
  assert.notEqual(accepted2.otp, accepted1.otp, "new ride gets a new OTP");
  cancelRequest(req2.id, "drv_otp");
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
