/**
 * Server-side ride store.
 *
 * Lives in memory for the lifetime of the Node process. Set HOPON_PERSIST_FILE to a path to also
 * snapshot offers and requests to a JSON file so they survive restarts (single server only; use a
 * real database if you deploy to serverless or several instances).
 */
import { randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type RideOfferStatus = "active" | "full" | "cancelled";
export type RideRequestStatus = "pending" | "accepted" | "rejected" | "cancelled";
export type RideTripStage = "en_route_pickup" | "arrived_pickup" | "in_progress";

export interface RideOffer {
  id: string;
  driverId: string;
  driverName: string;
  driverUniversity: string;
  driverRating: number;
  vehicleModel: string;
  vehicleNumber: string;
  vehicleType: "Bike" | "Car" | "Scooty";
  from: string;
  fromLat: number;
  fromLng: number;
  to: string;
  toLat: number;
  toLng: number;
  departureTime: string;
  departureDate: string;
  seats: number;
  seatsLeft: number;
  farePerSeat: string;
  status: RideOfferStatus;
  createdAt: number;
}

export interface RideRequest {
  id: string;
  /** null = open request: any driver may accept it (the accepting driver's offer is attached then). */
  offerId: string | null;
  /** Drivers who passed on this open request (hides it from their inbox only). */
  declinedBy: string[];
  passengerId: string;
  passengerName: string;
  passengerRating: number;
  pickup: string;
  pickupLat: number;
  pickupLng: number;
  dropoff: string;
  dropoffLat: number;
  dropoffLng: number;
  status: RideRequestStatus;
  note?: string;
  /** 4-digit random OTP generated when a driver accepts the request; changes on every new ride. */
  otp?: string;
  /** Live trip progression once accepted: en_route_pickup -> arrived_pickup -> in_progress (heading to dropoff). */
  tripStage?: RideTripStage;
  arrivedAt?: number;
  startedAt?: number;
  createdAt: number;
  respondedAt?: number;
}

export interface DriverLiveLocation {
  driverId: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  updatedAt: number;
}

// ---------- Retention ----------

/** Finished requests and old offers are dropped after this long. */
export const TERMINAL_TTL_MS = 24 * 60 * 60 * 1000;
/** A pending request nobody answered within this long is cancelled automatically. */
export const PENDING_TTL_MS = 2 * 60 * 60 * 1000;
/** Live driver locations older than this are dropped. */
export const STALE_LOCATION_MS = 10 * 60 * 1000;

// ---------- Optional persistence ----------

const PERSIST_FILE = process.env.HOPON_PERSIST_FILE?.trim() || "";

interface PersistedState {
  version: 1;
  offers: RideOffer[];
  requests: RideRequest[];
  counters: { offer: number; request: number };
  lastOtp?: string;
}

// ---------- Module-level singleton state ----------

// Stored on globalThis so dev hot-reloads (and separate route bundles) share one instance.
interface HoponStore {
  offers: Map<string, RideOffer>;
  requests: Map<string, RideRequest>;
  driverLiveLocations: Map<string, DriverLiveLocation>;
  counters: { offer: number; request: number };
  lastOtp?: string;
}

function hydrate(target: HoponStore): void {
  if (!PERSIST_FILE || !existsSync(PERSIST_FILE)) return;
  try {
    const parsed = JSON.parse(readFileSync(PERSIST_FILE, "utf8")) as PersistedState;
    if (parsed.version !== 1) return;
    for (const offer of parsed.offers ?? []) target.offers.set(offer.id, offer);
    for (const request of parsed.requests ?? []) target.requests.set(request.id, request);
    target.counters.offer = Math.max(target.counters.offer, parsed.counters?.offer ?? 1);
    target.counters.request = Math.max(target.counters.request, parsed.counters?.request ?? 1);
  } catch (error) {
    console.warn("Could not load persisted ride store, starting empty:", error);
  }
}

function createStore(): HoponStore {
  const fresh: HoponStore = {
    offers: new Map(),
    requests: new Map(),
    driverLiveLocations: new Map(),
    counters: { offer: 1, request: 1 },
  };
  hydrate(fresh);
  return fresh;
}

const globalForStore = globalThis as unknown as { __hoponStore?: HoponStore };
const store: HoponStore = (globalForStore.__hoponStore ??= createStore());

const offers = store.offers;
const requests = store.requests;
const driverLiveLocations = store.driverLiveLocations;

let persistTimer: ReturnType<typeof setTimeout> | null = null;

/** Writes the current offers/requests to HOPON_PERSIST_FILE right away (no-op when persistence is off). */
export function flushStoreToDisk(): void {
  if (!PERSIST_FILE) return;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  try {
    const state: PersistedState = {
      version: 1,
      offers: Array.from(offers.values()),
      requests: Array.from(requests.values()),
      counters: { ...store.counters },
    };
    mkdirSync(dirname(PERSIST_FILE), { recursive: true });
    const tmp = `${PERSIST_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(state));
    renameSync(tmp, PERSIST_FILE);
  } catch (error) {
    console.warn("Failed to persist ride store:", error);
  }
}

function schedulePersist(): void {
  if (!PERSIST_FILE || persistTimer) return;
  persistTimer = setTimeout(flushStoreToDisk, 200);
  (persistTimer as unknown as { unref?: () => void }).unref?.();
}

function offerKey(): string {
  return `offer_${Date.now()}_${store.counters.offer++}`;
}
function requestKey(): string {
  return `req_${Date.now()}_${store.counters.request++}`;
}
function generateFourDigitOtp(): string {
  let code = String(randomInt(1000, 10000));
  if (store.lastOtp && code === store.lastOtp) {
    code = String(((Number(code) - 1000 + randomInt(1, 9000)) % 9000) + 1000);
  }
  store.lastOtp = code;
  return code;
}

// ---------- Seed default driver offers so passengers always see some ----------

const SEED_PREFIX = "offer_seed_";

function seedDefaultOffer(): void {
  if (offers.size === 0) {
    const carId = `${SEED_PREFIX}001`;
    offers.set(carId, {
      id: carId,
      driverId: "usr_driver_demo_01",
      driverName: "Aarav Mehta",
      driverUniversity: "Kristu Jayanti University · BCA 2nd Year",
      driverRating: 4.8,
      vehicleModel: "White Swift Dzire",
      vehicleNumber: "KA 04 EK 7142",
      vehicleType: "Car",
      from: "Kristu Jayanti University",
      fromLat: 13.0583,
      fromLng: 77.6426,
      to: "Manyata Tech Park",
      toLat: 13.0458,
      toLng: 77.6206,
      departureTime: "Immediate",
      departureDate: "Today",
      seats: 3,
      seatsLeft: 3,
      farePerSeat: "75",
      status: "active",
      createdAt: Date.now(),
    });

    const bikeId = `${SEED_PREFIX}002`;
    offers.set(bikeId, {
      id: bikeId,
      driverId: "usr_driver_demo_02",
      driverName: "Rohan Varma",
      driverUniversity: "Kristu Jayanti University · B.Com 3rd Year",
      driverRating: 4.9,
      vehicleModel: "Hero Splendor Plus",
      vehicleNumber: "KA 03 EQ 4589",
      vehicleType: "Bike",
      from: "Kristu Jayanti University",
      fromLat: 13.0583,
      fromLng: 77.6426,
      to: "Manyata Tech Park",
      toLat: 13.0458,
      toLng: 77.6206,
      departureTime: "Immediate",
      departureDate: "Today",
      seats: 1,
      seatsLeft: 1,
      farePerSeat: "35",
      status: "active",
      createdAt: Date.now(),
    });

    const scootyId = `${SEED_PREFIX}003`;
    offers.set(scootyId, {
      id: scootyId,
      driverId: "usr_driver_demo_03",
      driverName: "Priya Nair",
      driverUniversity: "Kristu Jayanti University · MBA 1st Year",
      driverRating: 4.85,
      vehicleModel: "Honda Activa 6G",
      vehicleNumber: "KA 05 EM 1092",
      vehicleType: "Scooty",
      from: "Kristu Jayanti University",
      fromLat: 13.0583,
      fromLng: 77.6426,
      to: "Manyata Tech Park",
      toLat: 13.0458,
      toLng: 77.6206,
      departureTime: "Immediate",
      departureDate: "Today",
      seats: 1,
      seatsLeft: 1,
      farePerSeat: "30",
      status: "active",
      createdAt: Date.now(),
    });
  }
}

seedDefaultOffer();

// ---------- Cleanup ----------

/**
 * Removes expired data so the in-memory maps cannot grow forever:
 * unanswered pending requests are cancelled, finished requests and old offers are deleted
 * (seed demo offers are kept), and stale driver locations are dropped.
 */
export function pruneStore(now: number = Date.now()): { offers: number; requests: number; locations: number } {
  let removedRequests = 0;
  let removedOffers = 0;
  let removedLocations = 0;

  for (const [id, req] of requests) {
    if (req.status === "pending" && now - req.createdAt > PENDING_TTL_MS) {
      req.status = "cancelled";
      req.respondedAt = now;
    }
    if (req.status !== "pending" && now - (req.respondedAt ?? req.createdAt) > TERMINAL_TTL_MS) {
      requests.delete(id);
      removedRequests++;
    }
  }

  for (const [id, offer] of offers) {
    if (id.startsWith(SEED_PREFIX)) continue;
    if (now - offer.createdAt > TERMINAL_TTL_MS) {
      offers.delete(id);
      removedOffers++;
    }
  }

  for (const [driverId, loc] of driverLiveLocations) {
    if (now - loc.updatedAt > STALE_LOCATION_MS) {
      driverLiveLocations.delete(driverId);
      removedLocations++;
    }
  }

  if (removedRequests || removedOffers) schedulePersist();
  return { offers: removedOffers, requests: removedRequests, locations: removedLocations };
}

// ---------- Public API ----------

export function listActiveOffers(): RideOffer[] {
  seedDefaultOffer();
  return Array.from(offers.values()).filter((o) => o.status === "active");
}

export function countActiveOffersForDriver(driverId: string): number {
  return Array.from(offers.values()).filter((o) => o.driverId === driverId && o.status === "active").length;
}

export function getOffer(id: string): RideOffer | undefined {
  return offers.get(id);
}

export function createOffer(
  data: Omit<RideOffer, "id" | "createdAt" | "seatsLeft" | "status">
): RideOffer {
  pruneStore();
  const id = offerKey();
  const offer: RideOffer = {
    ...data,
    id,
    seatsLeft: data.seats,
    status: "active",
    createdAt: Date.now(),
  };
  offers.set(id, offer);
  schedulePersist();
  return offer;
}

export function listRequestsForDriver(driverId: string): RideRequest[] {
  const driverOfferIds = new Set(
    Array.from(offers.values())
      .filter((o) => o.driverId === driverId)
      .map((o) => o.id)
  );
  // A driver sees requests tied to their own offers, plus every open pending request
  // they haven't passed on.
  return Array.from(requests.values()).filter((r) =>
    r.offerId
      ? driverOfferIds.has(r.offerId)
      : r.status === "pending" && !r.declinedBy.includes(driverId)
  );
}

export function listRequestsForPassenger(passengerId: string): RideRequest[] {
  return Array.from(requests.values()).filter((r) => r.passengerId === passengerId);
}

export function getRequest(id: string): RideRequest | undefined {
  return requests.get(id);
}

/**
 * Create a ride request. Without `offerId` it is an open request that any driver can accept
 * (the passenger no longer picks the driver). With `offerId` it is addressed to that offer.
 */
export function createRequest(
  data: Omit<RideRequest, "id" | "createdAt" | "status" | "offerId" | "declinedBy"> & {
    offerId?: string | null;
  }
): RideRequest | { error: string } {
  pruneStore();
  const offerId = data.offerId ?? null;

  if (offerId) {
    const offer = offers.get(offerId);
    if (!offer) return { error: "Ride offer not found." };
    if (offer.driverId === data.passengerId) return { error: "You can't request your own ride." };
    if (offer.status !== "active") return { error: "This ride is no longer available." };
    if (offer.seatsLeft <= 0) return { error: "No seats left on this ride." };
  }

  const existing = Array.from(requests.values()).find(
    (r) =>
      r.passengerId === data.passengerId && (r.status === "pending" || r.status === "accepted")
  );
  if (existing) return { error: "You already have an active ride request." };

  const id = requestKey();
  const req: RideRequest = {
    ...data,
    offerId,
    id,
    status: "pending",
    declinedBy: [],
    createdAt: Date.now(),
  };
  requests.set(id, req);
  schedulePersist();
  return req;
}

export function respondToRequest(
  requestId: string,
  driverId: string,
  action: "accept" | "reject"
): RideRequest | { error: string } {
  const req = requests.get(requestId);
  if (!req) return { error: "Request not found." };
  if (req.passengerId === driverId) return { error: "You can't respond to your own request." };
  // First driver to accept wins; later attempts land here.
  if (req.status !== "pending") return { error: "Request already handled." };

  let offer: RideOffer | undefined;
  if (req.offerId) {
    // Request addressed to a specific offer: only that offer's driver may respond.
    offer = offers.get(req.offerId);
    if (!offer) return { error: "Offer not found." };
    if (offer.driverId !== driverId) return { error: "Not authorised." };
  } else {
    // Open request: declining only hides it for this driver; accepting claims it.
    if (action === "reject") {
      if (!req.declinedBy.includes(driverId)) req.declinedBy.push(driverId);
      requests.set(requestId, req);
      schedulePersist();
      return req;
    }
    offer = Array.from(offers.values()).find(
      (o) => o.driverId === driverId && o.status === "active" && o.seatsLeft > 0
    );
    if (!offer) return { error: "Post a ride first so passengers can see your vehicle." };
    req.offerId = offer.id;
  }

  req.status = action === "accept" ? "accepted" : "rejected";
  req.respondedAt = Date.now();

  if (action === "accept") {
    req.otp = generateFourDigitOtp();
    req.tripStage = "en_route_pickup";
    offer.seatsLeft = Math.max(0, offer.seatsLeft - 1);
    if (offer.seatsLeft === 0) offer.status = "full";
    offers.set(offer.id, offer);
  }

  requests.set(requestId, req);
  schedulePersist();
  return req;
}

/**
 * Accepting driver marks that they have arrived at the passenger's pickup location.
 * Transitions `tripStage` from `"en_route_pickup"` to `"arrived_pickup"` so the passenger is
 * notified and the driver's OTP verification input unlocks.
 */
export function markDriverArrived(
  requestId: string,
  driverId: string
): RideRequest | { error: string } {
  const req = requests.get(requestId);
  if (!req) return { error: "Request not found." };
  if (req.status !== "accepted" || !req.offerId) {
    return { error: "Ride is not currently active." };
  }
  const offer = offers.get(req.offerId);
  if (!offer || offer.driverId !== driverId) {
    return { error: "Not authorised." };
  }
  if (req.tripStage !== "in_progress") {
    req.tripStage = "arrived_pickup";
    req.arrivedAt = Date.now();
    requests.set(requestId, req);
    schedulePersist();
  }
  return req;
}

/**
 * Accepting driver submits the 4-digit OTP given by the passenger at pickup.
 * When matched, transitions `tripStage` to `"in_progress"` to unlock the dropoff route.
 */
export function verifyRideOtp(
  requestId: string,
  driverId: string,
  otpInput: string
): RideRequest | { error: string } {
  const req = requests.get(requestId);
  if (!req) return { error: "Request not found." };
  if (req.status !== "accepted" || !req.offerId) {
    return { error: "Ride is not currently active." };
  }
  const offer = offers.get(req.offerId);
  if (!offer || offer.driverId !== driverId) {
    return { error: "Not authorised." };
  }
  if (req.tripStage !== "arrived_pickup" && req.tripStage !== "in_progress") {
    return { error: "Please mark that you have arrived at the pickup location first." };
  }
  const normalized = String(otpInput ?? "").trim();
  if (!/^\d{4}$/.test(normalized) || !req.otp || normalized !== req.otp) {
    return { error: "Incorrect 4-digit OTP. Ask the passenger for their ride OTP." };
  }
  req.tripStage = "in_progress";
  req.startedAt = Date.now();
  requests.set(requestId, req);
  schedulePersist();
  return req;
}

/** Passenger (or the accepting driver) cancels/completes a pending or accepted request; accepted seats are given back. */
export function cancelRequest(
  requestId: string,
  userId: string
): RideRequest | { error: string } {
  const req = requests.get(requestId);
  if (!req) return { error: "Request not found." };
  const offer = req.offerId ? offers.get(req.offerId) : undefined;
  const isPassenger = req.passengerId === userId;
  const isAcceptingDriver = req.status === "accepted" && offer?.driverId === userId;
  if (!isPassenger && !isAcceptingDriver) return { error: "Not authorised." };
  if (req.status !== "pending" && req.status !== "accepted") {
    return { error: "This request can no longer be cancelled." };
  }

  const wasAccepted = req.status === "accepted";
  req.status = "cancelled";
  req.respondedAt = Date.now();
  requests.set(requestId, req);

  if (wasAccepted && offer) {
    offer.seatsLeft = Math.min(offer.seats, offer.seatsLeft + 1);
    if (offer.status === "full") offer.status = "active";
    offers.set(offer.id, offer);
  }
  schedulePersist();
  return req;
}

export function updateDriverLocation(
  driverId: string,
  lat: number,
  lng: number,
  heading?: number,
  speed?: number
): DriverLiveLocation {
  const loc: DriverLiveLocation = {
    driverId,
    lat,
    lng,
    heading,
    speed,
    updatedAt: Date.now(),
  };
  driverLiveLocations.set(driverId, loc);
  return loc;
}

export function getDriverLocation(driverId: string): DriverLiveLocation | undefined {
  return driverLiveLocations.get(driverId);
}

/**
 * Who may see a driver's live location: the driver themself, or a passenger whose request that
 * driver has accepted. Everyone else gets nothing.
 */
export function canViewDriverLocation(viewerId: string, driverId: string): boolean {
  if (viewerId === driverId) return true;
  for (const req of requests.values()) {
    if (req.passengerId !== viewerId || req.status !== "accepted" || !req.offerId) continue;
    if (offers.get(req.offerId)?.driverId === driverId) return true;
  }
  return false;
}
