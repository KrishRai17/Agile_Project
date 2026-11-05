/**
 * Server-side ride store backed by SQLite (`ride_offers`, `ride_requests`, `driver_locations`,
 * and `trip_history` tables in `.data/hopon.sqlite`), with optional JSON snapshot compatibility
 * via `HOPON_PERSIST_FILE`.
 */
import { randomBytes, randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isDemoEnabled, isDriverVerified } from "./accounts";
import { getDb, recordWalletLedger } from "./db";
import { haversineKm, KJU_COORDS } from "./campus";

export type RideOfferStatus = "active" | "full" | "cancelled";
export type RideRequestStatus = "pending" | "accepted" | "rejected" | "cancelled" | "completed";
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
  /** Fare per seat agreed and locked when the driver accepts the ride request. */
  agreedFare?: string;
  /** 4-digit random OTP generated when a driver accepts the request; changes on every new ride. */
  otp?: string;
  /** Number of consecutive wrong OTP attempts on this request. */
  otpAttempts?: number;
  /** Timestamp (ms) until which OTP verification is locked after 5 wrong tries. */
  otpLockedUntil?: number;
  /** Random unguessable token for public tracking (`/track/[token]`). */
  shareToken?: string;
  /** Live trip progression once accepted: en_route_pickup -> arrived_pickup -> in_progress (heading to dropoff). */
  tripStage?: RideTripStage;
  arrivedAt?: number;
  startedAt?: number;
  completedAt?: number;
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

export interface TripHistoryRecord {
  id: string;
  requestId?: string | null;
  offerId?: string | null;
  passengerId: string;
  passengerName: string;
  driverId?: string | null;
  driverName?: string | null;
  vehicle: string;
  from: string;
  to: string;
  amount: string;
  status: "Completed" | "Cancelled";
  createdAt: number;
}

export interface RideMessage {
  id: string;
  requestId: string;
  senderId: string;
  senderName: string;
  senderRole: "passenger" | "driver";
  text: string;
  createdAt: number;
}

export type RideEventListener = (event: {
  type: "offer" | "request" | "location" | "message";
  requestId?: string;
  userId?: string;
  timestamp: number;
}) => void;

const globalListeners = (
  globalThis as unknown as { __hoponRideListeners?: Set<RideEventListener> }
).__hoponRideListeners ?? new Set<RideEventListener>();
(globalThis as unknown as { __hoponRideListeners?: Set<RideEventListener> }).__hoponRideListeners =
  globalListeners;

export function subscribeRideEvents(listener: RideEventListener): () => void {
  globalListeners.add(listener);
  return () => {
    globalListeners.delete(listener);
  };
}

export function emitRideEvent(
  type: "offer" | "request" | "location" | "message" | "offers:changed",
  meta?: { requestId?: string; userId?: string }
): void {
  const normalizedType = type === "offers:changed" ? "offer" : type;
  const payload = {
    type: normalizedType,
    requestId: meta?.requestId,
    userId: meta?.userId,
    timestamp: Date.now(),
  };
  for (const listener of globalListeners) {
    try {
      listener(payload);
    } catch {
      // Ignore individual subscriber errors
    }
  }
}

// ---------- Retention ----------

/** Finished requests and old offers are dropped after this long. */
export const TERMINAL_TTL_MS = 24 * 60 * 60 * 1000;
/** Public tracking links remain valid for 10 minutes after a ride is completed so viewers see "Trip Completed". */
export const COMPLETED_TRACKING_TTL_MS = 10 * 60 * 1000;
/** A pending request nobody answered within this long is cancelled automatically. */
export const PENDING_TTL_MS = 2 * 60 * 60 * 1000;
/** Live driver locations older than this are dropped. */
export const STALE_LOCATION_MS = 10 * 60 * 1000;

// ---------- Optional JSON snapshot persistence + SQLite ----------

const PERSIST_FILE = process.env.HOPON_PERSIST_FILE?.trim() || "";

interface PersistedState {
  version: 1;
  offers: RideOffer[];
  requests: RideRequest[];
  counters: { offer: number; request: number };
  lastOtp?: string;
}

interface HoponStore {
  offers: Map<string, RideOffer>;
  requests: Map<string, RideRequest>;
  shareTokenIndex: Map<string, string>;
  driverLiveLocations: Map<string, DriverLiveLocation>;
  counters: { offer: number; request: number };
  lastOtp?: string;
}

interface DbOfferRow {
  id: string;
  driver_id: string;
  driver_name: string;
  driver_university: string;
  driver_rating: number;
  vehicle_model: string;
  vehicle_number: string;
  vehicle_type: "Bike" | "Car" | "Scooty";
  origin: string;
  from_lat: number;
  from_lng: number;
  destination: string;
  to_lat: number;
  to_lng: number;
  departure_time: string;
  departure_date: string;
  seats: number;
  seats_left: number;
  fare_per_seat: string;
  status: RideOfferStatus;
  created_at: number;
}

interface DbRequestRow {
  id: string;
  offer_id: string | null;
  declined_by: string;
  passenger_id: string;
  passenger_name: string;
  passenger_rating: number;
  pickup: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff: string;
  dropoff_lat: number;
  dropoff_lng: number;
  status: RideRequestStatus;
  note: string | null;
  agreed_fare: string | null;
  otp: string | null;
  otp_attempts: number | null;
  otp_locked_until: number | null;
  share_token: string | null;
  trip_stage: RideTripStage | null;
  arrived_at: number | null;
  started_at: number | null;
  completed_at: number | null;
  created_at: number;
  responded_at: number | null;
}

interface DbLocationRow {
  driver_id: string;
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  updated_at: number;
}

function saveOfferToDb(offer: RideOffer, emit: boolean = true): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT OR REPLACE INTO ride_offers (
        id, driver_id, driver_name, driver_university, driver_rating,
        vehicle_model, vehicle_number, vehicle_type,
        origin, from_lat, from_lng, destination, to_lat, to_lng,
        departure_time, departure_date, seats, seats_left, fare_per_seat, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      offer.id,
      offer.driverId,
      offer.driverName,
      offer.driverUniversity,
      offer.driverRating,
      offer.vehicleModel,
      offer.vehicleNumber,
      offer.vehicleType,
      offer.from,
      offer.fromLat,
      offer.fromLng,
      offer.to,
      offer.toLat,
      offer.toLng,
      offer.departureTime,
      offer.departureDate,
      offer.seats,
      offer.seatsLeft,
      offer.farePerSeat,
      offer.status,
      offer.createdAt
    );
  } catch (err) {
    console.error("saveOfferToDb failed:", err);
    throw err;
  }
  if (emit) {
    emitRideEvent("offer", { userId: offer.driverId });
  }
}

function deleteOfferFromDb(id: string): void {
  try {
    getDb().prepare("DELETE FROM ride_offers WHERE id = ?").run(id);
  } catch (err) {
    console.error("deleteOfferFromDb failed:", err);
    throw err;
  }
}

function saveRequestToDb(req: RideRequest, emit: boolean = true): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT OR REPLACE INTO ride_requests (
        id, offer_id, declined_by, passenger_id, passenger_name, passenger_rating,
        pickup, pickup_lat, pickup_lng, dropoff, dropoff_lat, dropoff_lng,
        status, note, agreed_fare, otp, otp_attempts, otp_locked_until, share_token,
        trip_stage, arrived_at, started_at, completed_at, created_at, responded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      req.id,
      req.offerId ?? null,
      JSON.stringify(req.declinedBy ?? []),
      req.passengerId,
      req.passengerName,
      req.passengerRating,
      req.pickup,
      req.pickupLat,
      req.pickupLng,
      req.dropoff,
      req.dropoffLat,
      req.dropoffLng,
      req.status,
      req.note ?? null,
      req.agreedFare ?? null,
      req.otp ?? null,
      req.otpAttempts ?? 0,
      req.otpLockedUntil ?? null,
      req.shareToken ?? null,
      req.tripStage ?? null,
      req.arrivedAt ?? null,
      req.startedAt ?? null,
      req.completedAt ?? null,
      req.createdAt,
      req.respondedAt ?? null
    );
  } catch (err) {
    console.error("saveRequestToDb failed:", err);
    throw err;
  }
  if (emit) {
    emitRideEvent("request", { requestId: req.id, userId: req.passengerId });
  }
}

function deleteRequestFromDb(id: string): void {
  try {
    const db = getDb();
    db.prepare("DELETE FROM ride_messages WHERE request_id = ?").run(id);
    db.prepare("DELETE FROM ride_requests WHERE id = ?").run(id);
  } catch (err) {
    console.error("deleteRequestFromDb failed:", err);
    throw err;
  }
}

function saveLocationToDb(loc: DriverLiveLocation, emit: boolean = true): void {
  try {
    getDb()
      .prepare(
        `INSERT OR REPLACE INTO driver_locations (driver_id, lat, lng, heading, speed, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(loc.driverId, loc.lat, loc.lng, loc.heading ?? null, loc.speed ?? null, loc.updatedAt);
  } catch (err) {
    console.error("saveLocationToDb failed:", err);
    throw err;
  }
  if (emit) {
    emitRideEvent("location", { userId: loc.driverId });
  }
}

function deleteLocationFromDb(driverId: string): void {
  try {
    getDb().prepare("DELETE FROM driver_locations WHERE driver_id = ?").run(driverId);
  } catch (err) {
    console.error("deleteLocationFromDb failed:", err);
    throw err;
  }
}

function recordTripHistory(req: RideRequest, offer: RideOffer | undefined, status: "Completed" | "Cancelled"): void {
  try {
    const db = getDb();
    const id = `trip_${Date.now()}_${randomInt(1000, 9999)}`;
    const vehicle = offer ? `HopOn ${offer.vehicleType} (${offer.vehicleModel})` : "HopOn Campus Ride";
    const amount = `₹${offer?.farePerSeat ?? "50"}`;
    db.prepare(
      `INSERT INTO trip_history (
        id, request_id, offer_id, passenger_id, passenger_name,
        driver_id, driver_name, vehicle, origin, destination, amount, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      req.id,
      offer?.id ?? null,
      req.passengerId,
      req.passengerName,
      offer?.driverId ?? null,
      offer?.driverName ?? null,
      vehicle,
      req.pickup,
      req.dropoff,
      amount,
      status,
      Date.now()
    );
    if (status === "Completed") {
      db.prepare("UPDATE users SET rides_completed = rides_completed + 1 WHERE id = ?").run(req.passengerId);
      if (offer?.driverId) {
        db.prepare("UPDATE users SET rides_completed = rides_completed + 1 WHERE id = ?").run(offer.driverId);
      }
    }
  } catch (err) {
    console.error("recordTripHistory failed:", err);
    throw err;
  }
}

function hydrateFromSqlite(target: HoponStore): void {
  try {
    const db = getDb();
    const offerRows = db.prepare("SELECT * FROM ride_offers").all() as DbOfferRow[];
    for (const r of offerRows) {
      target.offers.set(r.id, {
        id: r.id,
        driverId: r.driver_id,
        driverName: r.driver_name,
        driverUniversity: r.driver_university,
        driverRating: r.driver_rating,
        vehicleModel: r.vehicle_model,
        vehicleNumber: r.vehicle_number,
        vehicleType: r.vehicle_type,
        from: r.origin,
        fromLat: r.from_lat,
        fromLng: r.from_lng,
        to: r.destination,
        toLat: r.to_lat,
        toLng: r.to_lng,
        departureTime: r.departure_time,
        departureDate: r.departure_date,
        seats: r.seats,
        seatsLeft: r.seats_left,
        farePerSeat: r.fare_per_seat,
        status: r.status,
        createdAt: r.created_at,
      });
      const tail = Number(r.id.split("_").pop());
      if (Number.isFinite(tail)) {
        target.counters.offer = Math.max(target.counters.offer, tail + 1);
      }
    }

    const reqRows = db.prepare("SELECT * FROM ride_requests").all() as DbRequestRow[];
    for (const r of reqRows) {
      let declinedBy: string[] = [];
      try {
        declinedBy = JSON.parse(r.declined_by || "[]");
      } catch {
        declinedBy = [];
      }
      target.requests.set(r.id, {
        id: r.id,
        offerId: r.offer_id,
        declinedBy,
        passengerId: r.passenger_id,
        passengerName: r.passenger_name,
        passengerRating: r.passenger_rating,
        pickup: r.pickup,
        pickupLat: r.pickup_lat,
        pickupLng: r.pickup_lng,
        dropoff: r.dropoff,
        dropoffLat: r.dropoff_lat,
        dropoffLng: r.dropoff_lng,
        status: r.status,
        note: r.note ?? undefined,
        agreedFare: r.agreed_fare ?? undefined,
        otp: r.otp ?? undefined,
        otpAttempts: r.otp_attempts ?? 0,
        otpLockedUntil: r.otp_locked_until ?? undefined,
        shareToken: r.share_token ?? undefined,
        tripStage: r.trip_stage ?? undefined,
        arrivedAt: r.arrived_at ?? undefined,
        startedAt: r.started_at ?? undefined,
        completedAt: r.completed_at ?? undefined,
        createdAt: r.created_at,
        respondedAt: r.responded_at ?? undefined,
      });
      if (r.share_token) {
        target.shareTokenIndex.set(r.share_token, r.id);
      }
      const tail = Number(r.id.split("_").pop());
      if (Number.isFinite(tail)) {
        target.counters.request = Math.max(target.counters.request, tail + 1);
      }
    }

    const locRows = db.prepare("SELECT * FROM driver_locations").all() as DbLocationRow[];
    for (const l of locRows) {
      target.driverLiveLocations.set(l.driver_id, {
        driverId: l.driver_id,
        lat: l.lat,
        lng: l.lng,
        heading: l.heading ?? undefined,
        speed: l.speed ?? undefined,
        updatedAt: l.updated_at,
      });
    }
  } catch (err) {
    console.error("hydrateFromSqlite failed:", err);
  }
}

function hydrate(target: HoponStore): void {
  hydrateFromSqlite(target);
  if (PERSIST_FILE) {
    if (!existsSync(PERSIST_FILE)) return;
    try {
      const parsed = JSON.parse(readFileSync(PERSIST_FILE, "utf8")) as PersistedState;
      if (parsed.version !== 1) return;
      for (const offer of parsed.offers ?? []) {
        target.offers.set(offer.id, offer);
        saveOfferToDb(offer, false);
      }
      for (const request of parsed.requests ?? []) {
        target.requests.set(request.id, request);
        if (request.shareToken) {
          target.shareTokenIndex.set(request.shareToken, request.id);
        }
        saveRequestToDb(request, false);
      }
      target.counters.offer = Math.max(target.counters.offer, parsed.counters?.offer ?? 1);
      target.counters.request = Math.max(target.counters.request, parsed.counters?.request ?? 1);
    } catch (error) {
      console.warn("Could not load persisted ride store, starting empty:", error);
    }
  }
}

function createStore(): HoponStore {
  const fresh: HoponStore = {
    offers: new Map(),
    requests: new Map(),
    shareTokenIndex: new Map(),
    driverLiveLocations: new Map(),
    counters: { offer: 1, request: 1 },
  };
  hydrate(fresh);
  return fresh;
}

const globalForStore = globalThis as unknown as { __hoponStore?: HoponStore };
const store: HoponStore = (globalForStore.__hoponStore ??= createStore());
const shareTokenIndex = (store.shareTokenIndex ??= new Map<string, string>());

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
  if (!isDemoEnabled()) return;
  if (offers.size === 0) {
    const seeds: RideOffer[] = [
      {
        id: `${SEED_PREFIX}001`,
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
      },
      {
        id: `${SEED_PREFIX}002`,
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
      },
      {
        id: `${SEED_PREFIX}003`,
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
      },
    ];
    for (const s of seeds) {
      offers.set(s.id, s);
      saveOfferToDb(s, false);
    }
  }
}

seedDefaultOffer();

// ---------- Cleanup ----------

/**
 * Removes expired data so the in-memory maps and SQLite tables stay clean:
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
      saveRequestToDb(req);
    }
    if (req.status !== "pending" && now - (req.respondedAt ?? req.createdAt) > TERMINAL_TTL_MS) {
      if (req.shareToken) {
        shareTokenIndex.delete(req.shareToken);
      }
      requests.delete(id);
      deleteRequestFromDb(id);
      removedRequests++;
    }
  }

  for (const [id, offer] of offers) {
    if (id.startsWith(SEED_PREFIX)) continue;
    if (now - offer.createdAt > TERMINAL_TTL_MS) {
      offers.delete(id);
      deleteOfferFromDb(id);
      removedOffers++;
    }
  }

  for (const [driverId, loc] of driverLiveLocations) {
    if (now - loc.updatedAt > STALE_LOCATION_MS) {
      driverLiveLocations.delete(driverId);
      deleteLocationFromDb(driverId);
      removedLocations++;
    }
  }

  try {
    const db = getDb();
    db.prepare(
      `DELETE FROM ride_messages
       WHERE created_at < ? OR request_id NOT IN (SELECT id FROM ride_requests)`
    ).run(now - TERMINAL_TTL_MS);
    db.prepare("DELETE FROM driver_locations WHERE updated_at < ?").run(now - STALE_LOCATION_MS);
  } catch (err) {
    console.error("pruneStore SQLite cleanup failed:", err);
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
  if (!isDriverVerified(data.driverId)) {
    throw new Error("Please verify your university email before posting ride offers.");
  }
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
  saveOfferToDb(offer);
  schedulePersist();
  return offer;
}

export function listRequestsForDriver(driverId: string): RideRequest[] {
  if (!isDriverVerified(driverId)) {
    return [];
  }
  const driverOfferIds = new Set(
    Array.from(offers.values())
      .filter((o) => o.driverId === driverId)
      .map((o) => o.id)
  );

  const driverLiveLoc = driverLiveLocations.get(driverId);
  const driverActiveOffer = Array.from(offers.values()).find(
    (o) => o.driverId === driverId && o.status === "active"
  );
  const anchorLat = driverLiveLoc?.lat ?? driverActiveOffer?.fromLat ?? KJU_COORDS.lat;
  const anchorLng = driverLiveLoc?.lng ?? driverActiveOffer?.fromLng ?? KJU_COORDS.lng;
  const snap = (n: number) => Math.round(n * 100) / 100;
  const snappedAnchorLat = snap(anchorLat);
  const snappedAnchorLng = snap(anchorLng);

  // A driver sees requests tied to their own offers, plus nearby open pending requests
  // within the university service area (~30 km of their active route origin or current GPS position).
  return Array.from(requests.values()).filter((r) => {
    if (r.offerId) {
      return driverOfferIds.has(r.offerId);
    }
    if (r.status !== "pending" || r.declinedBy.includes(driverId)) {
      return false;
    }
    const dist = haversineKm(snappedAnchorLat, snappedAnchorLng, snap(r.pickupLat), snap(r.pickupLng));
    return dist <= 30.0;
  });
}

export interface DriverRideRequestView {
  id: string;
  offerId: string | null;
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
  agreedFare?: string;
  tripStage?: RideTripStage;
  createdAt: number;
  respondedAt?: number;
  arrivedAt?: number;
  startedAt?: number;
  completedAt?: number;
  offer?: RideOffer;
}

/**
 * Whitelists the fields of a `RideRequest` that a driver is allowed to see.
 * Never includes `otp`, `otpAttempts`, `otpLockedUntil`, `shareToken`, `declinedBy`, or `passengerId`.
 * For unaccepted requests, masks exact coordinates to ~1km and strips curb notes until accepted.
 */
export function toDriverView(req: RideRequest): DriverRideRequestView {
  const offer = req.offerId ? offers.get(req.offerId) : undefined;
  const isAcceptedOrBeyond =
    req.status === "accepted" || req.status === "completed";

  // For unaccepted requests, coarse the pickup coordinates (~1.1km) and mask specific curb notes
  const pickupLat = isAcceptedOrBeyond
    ? req.pickupLat
    : Math.round(req.pickupLat * 100) / 100;
  const pickupLng = isAcceptedOrBeyond
    ? req.pickupLng
    : Math.round(req.pickupLng * 100) / 100;
  const dropoffLat = isAcceptedOrBeyond
    ? req.dropoffLat
    : Math.round(req.dropoffLat * 100) / 100;
  const dropoffLng = isAcceptedOrBeyond
    ? req.dropoffLng
    : Math.round(req.dropoffLng * 100) / 100;

  const pickup = isAcceptedOrBeyond
    ? req.pickup
    : req.pickup.replace(/\s*\([^)]*\)/g, "").trim();

  const dropoff = isAcceptedOrBeyond
    ? req.dropoff
    : req.dropoff.replace(/\s*\([^)]*\)/g, "").trim();

  return {
    id: req.id,
    offerId: req.offerId,
    passengerName: req.passengerName,
    passengerRating: req.passengerRating,
    pickup,
    pickupLat,
    pickupLng,
    dropoff,
    dropoffLat,
    dropoffLng,
    status: req.status,
    ...(isAcceptedOrBeyond && req.note !== undefined ? { note: req.note } : {}),
    ...(req.agreedFare !== undefined ? { agreedFare: req.agreedFare } : {}),
    ...(req.tripStage !== undefined ? { tripStage: req.tripStage } : {}),
    createdAt: req.createdAt,
    ...(req.respondedAt !== undefined ? { respondedAt: req.respondedAt } : {}),
    ...(req.arrivedAt !== undefined ? { arrivedAt: req.arrivedAt } : {}),
    ...(req.startedAt !== undefined ? { startedAt: req.startedAt } : {}),
    ...(req.completedAt !== undefined ? { completedAt: req.completedAt } : {}),
    ...(offer !== undefined ? { offer } : {}),
  };
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
  saveRequestToDb(req);
  schedulePersist();
  return req;
}

export function respondToRequest(
  requestId: string,
  driverId: string,
  action: "accept" | "reject",
  driverPosition?: { lat: number; lng: number; name?: string }
): RideRequest | { error: string } {
  const req = requests.get(requestId);
  if (!req) return { error: "Request not found." };
  if (req.passengerId === driverId) return { error: "You can't respond to your own request." };
  if (!isDriverVerified(driverId)) {
    return { error: "Please verify your university email before accepting or declining ride requests." };
  }
  // First driver to accept wins; later attempts land here.
  if (req.status !== "pending") return { error: "Request already handled." };

  if (action === "accept") {
    const activeDriverRide = Array.from(requests.values()).find((r) => {
      if (r.status !== "accepted" || !r.offerId) return false;
      const o = offers.get(r.offerId);
      return o?.driverId === driverId;
    });
    if (activeDriverRide) {
      return { error: "You already have an active accepted ride in progress." };
    }
  }

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
      saveRequestToDb(req);
      schedulePersist();
      return req;
    }
    offer = Array.from(offers.values()).find(
      (o) => o.driverId === driverId && o.status === "active" && o.seatsLeft > 0
    );
    if (!offer) return { error: "Post a ride first so passengers can see your vehicle." };
  }

  if (action === "accept") {
    const numericFare = Math.max(
      0,
      Math.round(Number(String(offer.farePerSeat ?? "0").replace(/[^\d.]/g, "")) || 0)
    );
    if (numericFare > 0) {
      const pRow = getDb()
        .prepare("SELECT wallet_balance FROM users WHERE id = ?")
        .get(req.passengerId) as { wallet_balance: number } | undefined;
      if (pRow && pRow.wallet_balance < numericFare) {
        return {
          error: "Passenger has insufficient HopOn Wallet balance to cover this ride fare.",
        };
      }
    }
    req.offerId = offer.id;
    req.agreedFare = offer.farePerSeat;
  }

  req.status = action === "accept" ? "accepted" : "rejected";
  req.respondedAt = Date.now();

  if (action === "accept") {
    req.otp = generateFourDigitOtp();
    req.tripStage = "en_route_pickup";
    offer.seatsLeft = Math.max(0, offer.seatsLeft - 1);
    if (offer.seatsLeft === 0) offer.status = "full";

    // Lock the rider's exact real-time GPS position into both driverLiveLocations and the offer start point
    if (
      driverPosition &&
      Number.isFinite(driverPosition.lat) &&
      Number.isFinite(driverPosition.lng)
    ) {
      const exactLat = Number(driverPosition.lat.toFixed(6));
      const exactLng = Number(driverPosition.lng.toFixed(6));
      offer.fromLat = exactLat;
      offer.fromLng = exactLng;
      if (driverPosition.name && driverPosition.name.trim()) {
        offer.from = driverPosition.name.trim();
      }
      updateDriverLocation(driverId, exactLat, exactLng);
    } else {
      const existingLive = driverLiveLocations.get(driverId);
      if (existingLive) {
        offer.fromLat = Number(existingLive.lat.toFixed(6));
        offer.fromLng = Number(existingLive.lng.toFixed(6));
      }
    }

    offers.set(offer.id, offer);
    saveOfferToDb(offer);
  }

  requests.set(requestId, req);
  saveRequestToDb(req);
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
    saveRequestToDb(req);
    schedulePersist();
  }
  return req;
}

export const MAX_OTP_ATTEMPTS = 5;
export const OTP_LOCKOUT_MS = 10 * 60 * 1000;

/**
 * Accepting driver submits the 4-digit OTP given by the passenger at pickup.
 * When matched, transitions `tripStage` to `"in_progress"` to unlock the dropoff route.
 * Locks verification for 10 minutes after 5 wrong tries.
 */
export function verifyRideOtp(
  requestId: string,
  driverId: string,
  otpInput: string,
  now: number = Date.now()
): RideRequest | { error: string; locked?: boolean } {
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
  if (req.otpLockedUntil && req.otpLockedUntil > now) {
    const minsLeft = Math.max(1, Math.ceil((req.otpLockedUntil - now) / 60000));
    return {
      error: `Too many incorrect OTP attempts. Verification is locked for ${minsLeft} minute(s).`,
      locked: true,
    };
  }
  if (req.otpLockedUntil && req.otpLockedUntil <= now) {
    req.otpAttempts = 0;
    req.otpLockedUntil = undefined;
  }

  const normalized = String(otpInput ?? "").trim();
  if (!/^\d{4}$/.test(normalized) || !req.otp || normalized !== req.otp) {
    const attempts = (req.otpAttempts ?? 0) + 1;
    req.otpAttempts = attempts;
    if (attempts >= MAX_OTP_ATTEMPTS) {
      req.otpLockedUntil = now + OTP_LOCKOUT_MS;
      requests.set(requestId, req);
      saveRequestToDb(req);
      schedulePersist();
      return {
        error: "Too many incorrect OTP attempts. Verification is locked for 10 minutes.",
        locked: true,
      };
    }
    requests.set(requestId, req);
    saveRequestToDb(req);
    schedulePersist();
    return { error: "Incorrect 4-digit OTP. Ask the passenger for their ride OTP." };
  }
  req.otpAttempts = 0;
  req.otpLockedUntil = undefined;
  req.tripStage = "in_progress";
  req.startedAt = now;
  requests.set(requestId, req);
  saveRequestToDb(req);
  schedulePersist();
  return req;
}

/**
 * Accepting driver completes a ride at dropoff once `tripStage === "in_progress"`.
 * Atomically deducts the fare from the passenger's wallet, credits the driver's wallet,
 * records a `Completed` entry in `trip_history`, and increments `rides_completed` for both users.
 */
export function completeRide(
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
    return { error: "Ride cannot be completed before OTP verification at pickup." };
  }

  const agreedFareStr = req.agreedFare ?? offer.farePerSeat ?? "50";
  const numericFare = Math.max(
    0,
    Math.round(Number(String(agreedFareStr).replace(/[^\d.]/g, "")) || 0)
  );
  const now = Date.now();
  const tripId = `trip_${now}_${randomInt(1000, 9999)}`;
  const vehicle = `HopOn ${offer.vehicleType} (${offer.vehicleModel})`;
  const amount = `₹${agreedFareStr}`;

  const MAX_COUNTERPARTY_COMPLETIONS_24H = 5;

  const db = getDb();
  const tx = db.transaction(() => {
    // 1. Double completion guard
    const existingCompleted = db
      .prepare("SELECT id FROM trip_history WHERE request_id = ? AND status = 'Completed'")
      .get(req.id);
    if (existingCompleted) {
      throw new Error("This ride has already been completed.");
    }

    // 2. Anti-collusion / siphon check: limit repeated rides between the same counterparty within 24 hours
    const recentPairTrips = db
      .prepare(
        `SELECT COUNT(*) as count FROM trip_history
         WHERE passenger_id = ? AND driver_id = ? AND created_at > ? AND status = 'Completed'`
      )
      .get(req.passengerId, offer.driverId, now - 24 * 60 * 60 * 1000) as { count: number } | undefined;
    if (recentPairTrips && recentPairTrips.count >= MAX_COUNTERPARTY_COMPLETIONS_24H) {
      throw new Error("Daily ride limit between this driver and passenger reached for campus safety.");
    }

    const pRow = db
      .prepare("SELECT wallet_balance FROM users WHERE id = ?")
      .get(req.passengerId) as { wallet_balance: number } | undefined;
    if (pRow && numericFare > 0) {
      if (pRow.wallet_balance < numericFare) {
        throw new Error("Insufficient HopOn Wallet balance for passenger.");
      }
      db.prepare("UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?").run(
        numericFare,
        req.passengerId
      );
      recordWalletLedger(db, {
        userId: req.passengerId,
        delta: -numericFare,
        reason: "ride_fare_debit",
        actorId: offer.driverId,
        ref: req.id,
        balanceAfter: pRow.wallet_balance - numericFare,
      });

      const dRow = db
        .prepare("SELECT wallet_balance FROM users WHERE id = ?")
        .get(offer.driverId) as { wallet_balance: number } | undefined;
      const dBalanceAfter = (dRow?.wallet_balance ?? 0) + numericFare;

      db.prepare("UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?").run(
        numericFare,
        offer.driverId
      );
      recordWalletLedger(db, {
        userId: offer.driverId,
        delta: numericFare,
        reason: "ride_fare_credit",
        actorId: req.passengerId,
        ref: req.id,
        balanceAfter: dBalanceAfter,
      });
    }

    db.prepare(
      `INSERT INTO trip_history (
        id, request_id, offer_id, passenger_id, passenger_name,
        driver_id, driver_name, vehicle, origin, destination, amount, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Completed', ?)`
    ).run(
      tripId,
      req.id,
      offer.id,
      req.passengerId,
      req.passengerName,
      offer.driverId,
      offer.driverName,
      vehicle,
      req.pickup,
      req.dropoff,
      amount,
      now
    );

    db.prepare("UPDATE users SET rides_completed = rides_completed + 1 WHERE id = ?").run(
      req.passengerId
    );
    db.prepare("UPDATE users SET rides_completed = rides_completed + 1 WHERE id = ?").run(
      offer.driverId
    );

    // Atomic update of ride_requests in SQLite inside the same transaction
    db.prepare(
      `UPDATE ride_requests
       SET status = 'completed', completed_at = ?, responded_at = ?
       WHERE id = ?`
    ).run(now, now, req.id);

    // Atomic update of ride_offers seats in SQLite inside the same transaction
    db.prepare(
      `UPDATE ride_offers
       SET seats_left = MIN(seats, seats_left + 1),
           status = CASE WHEN status = 'full' THEN 'active' ELSE status END
       WHERE id = ?`
    ).run(offer.id);
  });

  try {
    tx();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not complete ride.";
    return { error: message };
  }

  req.status = "completed";
  req.completedAt = now;
  req.respondedAt = now;
  requests.set(requestId, req);

  offer.seatsLeft = Math.min(offer.seats, offer.seatsLeft + 1);
  if (offer.status === "full") offer.status = "active";
  offers.set(offer.id, offer);

  schedulePersist();
  return req;
}

export function hasActiveAcceptedRide(userId: string): boolean {
  for (const req of requests.values()) {
    if (req.status === "accepted") {
      if (req.passengerId === userId) return true;
      if (req.offerId) {
        const offer = offers.get(req.offerId);
        if (offer && offer.driverId === userId) return true;
      }
    }
  }
  return false;
}

/** Passenger (or the accepting driver) cancels a pending or accepted request; accepted seats are given back. */
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
  saveRequestToDb(req);

  if (wasAccepted) {
    if (offer) {
      offer.seatsLeft = Math.min(offer.seats, offer.seatsLeft + 1);
      if (offer.status === "full") offer.status = "active";
      offers.set(offer.id, offer);
      saveOfferToDb(offer);
    }
    recordTripHistory(req, offer, "Cancelled");
  }
  schedulePersist();
  return req;
}

export function listTripHistoryForUser(userId: string): TripHistoryRecord[] {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT * FROM trip_history
         WHERE passenger_id = ? OR driver_id = ?
         ORDER BY created_at DESC
         LIMIT 50`
      )
      .all(userId, userId) as Array<{
      id: string;
      request_id: string | null;
      offer_id: string | null;
      passenger_id: string;
      passenger_name: string;
      driver_id: string | null;
      driver_name: string | null;
      vehicle: string;
      origin: string;
      destination: string;
      amount: string;
      status: "Completed" | "Cancelled";
      created_at: number;
    }>;

    return rows.map((r) => ({
      id: r.id,
      requestId: r.request_id,
      offerId: r.offer_id,
      passengerId: r.passenger_id,
      passengerName: r.passenger_name,
      driverId: r.driver_id,
      driverName: r.driver_name,
      vehicle: r.vehicle,
      from: r.origin,
      to: r.destination,
      amount: r.amount,
      status: r.status,
      createdAt: r.created_at,
    }));
  } catch (err) {
    console.error("listTripHistoryForUser failed:", err);
    return [];
  }
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
  saveLocationToDb(loc);
  return loc;
}

export function getDriverLocation(driverId: string): DriverLiveLocation | undefined {
  return driverLiveLocations.get(driverId);
}

/**
 * Who may see a user's live location: the user themself, a passenger whose request that
 * driver has accepted, or the accepting driver viewing their accepted passenger's live location.
 */
export function canViewDriverLocation(viewerId: string, targetId: string): boolean {
  if (viewerId === targetId) return true;
  for (const req of requests.values()) {
    if (req.status !== "accepted" || !req.offerId) continue;
    const offerDriverId = offers.get(req.offerId)?.driverId;
    if (req.passengerId === viewerId && offerDriverId === targetId) return true;
    if (offerDriverId === viewerId && req.passengerId === targetId) return true;
  }
  return false;
}

export function canAccessRequestChat(userId: string, requestId: string): boolean {
  const req = requests.get(requestId);
  if (!req) return false;
  if (req.passengerId === userId) return true;
  if (req.offerId) {
    const offer = offers.get(req.offerId);
    if (offer?.driverId === userId) return true;
  }
  return false;
}

export function sendRideMessage(input: {
  requestId: string;
  senderId: string;
  senderName: string;
  senderRole: "passenger" | "driver";
  text: string;
}): RideMessage | { error: string } {
  const req = requests.get(input.requestId);
  if (!req) return { error: "Ride request not found." };
  if (!canAccessRequestChat(input.senderId, input.requestId)) {
    return { error: "You are not a participant in this ride." };
  }
  const clean = input.text.trim().slice(0, 300);
  if (!clean) return { error: "Message cannot be empty." };

  const msg: RideMessage = {
    id: `msg_${Date.now()}_${randomInt(1000, 9999)}`,
    requestId: input.requestId,
    senderId: input.senderId,
    senderName: input.senderName,
    senderRole: input.senderRole,
    text: clean,
    createdAt: Date.now(),
  };

  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO ride_messages (id, request_id, sender_id, sender_name, sender_role, text, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      msg.id,
      msg.requestId,
      msg.senderId,
      msg.senderName,
      msg.senderRole,
      msg.text,
      msg.createdAt
    );
  } catch (err) {
    console.error("sendRideMessage DB insert failed:", err);
    return { error: "Failed to save message." };
  }

  emitRideEvent("message", { requestId: msg.requestId, userId: msg.senderId });
  return msg;
}

export function listRideMessages(
  requestId: string,
  viewerId: string
): RideMessage[] | { error: string } {
  if (!canAccessRequestChat(viewerId, requestId)) {
    return { error: "Not authorised to view messages for this ride." };
  }
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT * FROM ride_messages
         WHERE request_id = ?
         ORDER BY created_at ASC
         LIMIT 100`
      )
      .all(requestId) as Array<{
      id: string;
      request_id: string;
      sender_id: string;
      sender_name: string;
      sender_role: "passenger" | "driver";
      text: string;
      created_at: number;
    }>;

    return rows.map((r) => ({
      id: r.id,
      requestId: r.request_id,
      senderId: r.sender_id,
      senderName: r.sender_name,
      senderRole: r.sender_role,
      text: r.text,
      createdAt: r.created_at,
    }));
  } catch (err) {
    console.error("listRideMessages failed:", err);
    return [];
  }
}

function maskFirstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] || "Student";
  return first;
}

/**
 * Generates (or returns the existing) unguessable share token for a ride request.
 * Only the passenger of that request is permitted to generate a share token.
 */
export function createTrackingToken(
  requestId: string,
  userId: string
): { token: string } | { error: string } {
  const req = requests.get(requestId);
  if (!req) return { error: "Ride request not found." };
  if (req.passengerId !== userId) {
    return { error: "Only the passenger can generate a tracking link." };
  }
  if (req.status === "cancelled" || req.status === "rejected") {
    return { error: "Cannot share a cancelled or rejected ride." };
  }
  if (!req.shareToken) {
    req.shareToken = randomBytes(16).toString("base64url");
    shareTokenIndex.set(req.shareToken, requestId);
    requests.set(requestId, req);
    saveRequestToDb(req);
    schedulePersist();
  } else {
    shareTokenIndex.set(req.shareToken, requestId);
  }
  return { token: req.shareToken };
}

/**
 * Revokes the public tracking share token for a ride request.
 * Only the passenger of that request is permitted to revoke it.
 */
export function revokeTrackingToken(
  requestId: string,
  userId: string
): { ok: true } | { error: string } {
  const req = requests.get(requestId);
  if (!req) return { error: "Ride request not found." };
  if (req.passengerId !== userId) {
    return { error: "Only the passenger can revoke a tracking link." };
  }
  if (req.shareToken) {
    shareTokenIndex.delete(req.shareToken);
  }
  req.shareToken = undefined;
  requests.set(requestId, req);
  saveRequestToDb(req);
  schedulePersist();
  return { ok: true };
}

/**
 * Public read-only tracking snapshot for `/track/[token]` (shared with friends/family).
 * Uses the O(1) `shareTokenIndex` Map (not a linear scan or guessable requestId), returns a minimal payload
 * (passenger first name only, no vehicleNumber, no OTP), remains valid for 10 minutes after completion
 * so viewers see "Trip Completed", and stops working immediately if cancelled/rejected or older than 24h.
 */
export function getPublicRideTracking(
  token: string,
  now: number = Date.now()
): {
  status: RideRequestStatus;
  tripStage: RideTripStage;
  passengerFirstName: string;
  pickup: string;
  pickupLat: number;
  pickupLng: number;
  dropoff: string;
  dropoffLat: number;
  dropoffLng: number;
  driverName?: string;
  vehicleModel?: string;
  vehicleType?: string;
  driverLiveLocation?: { lat: number; lng: number; updatedAt: number } | null;
  passengerLiveLocation?: { lat: number; lng: number; updatedAt: number } | null;
  createdAt: number;
  arrivedAt?: number;
  startedAt?: number;
  completedAt?: number;
} | null {
  const cleanToken = typeof token === "string" ? token.trim() : "";
  if (!cleanToken) return null;

  const requestId = shareTokenIndex.get(cleanToken);
  const req = requestId ? requests.get(requestId) : undefined;
  if (!req || req.shareToken !== cleanToken) return null;
  if (req.status === "cancelled" || req.status === "rejected") return null;
  if (req.status === "completed") {
    const finishedAt = req.completedAt ?? req.respondedAt ?? req.createdAt;
    if (now - finishedAt > COMPLETED_TRACKING_TTL_MS) return null;
  }
  if (now - req.createdAt > TERMINAL_TTL_MS) return null;

  const offer = req.offerId ? offers.get(req.offerId) : undefined;
  const driverLoc = offer?.driverId ? driverLiveLocations.get(offer.driverId) : undefined;
  const passengerLoc = driverLiveLocations.get(req.passengerId);

  return {
    status: req.status,
    tripStage: req.tripStage ?? "en_route_pickup",
    passengerFirstName: maskFirstName(req.passengerName),
    pickup: req.pickup,
    pickupLat: req.pickupLat,
    pickupLng: req.pickupLng,
    dropoff: req.dropoff,
    dropoffLat: req.dropoffLat,
    dropoffLng: req.dropoffLng,
    driverName: offer ? maskFirstName(offer.driverName) : undefined,
    vehicleModel: offer?.vehicleModel,
    vehicleType: offer?.vehicleType,
    driverLiveLocation: driverLoc
      ? { lat: driverLoc.lat, lng: driverLoc.lng, updatedAt: driverLoc.updatedAt }
      : offer
      ? { lat: offer.fromLat, lng: offer.fromLng, updatedAt: offer.createdAt }
      : null,
    passengerLiveLocation: passengerLoc
      ? { lat: passengerLoc.lat, lng: passengerLoc.lng, updatedAt: passengerLoc.updatedAt }
      : { lat: req.pickupLat, lng: req.pickupLng, updatedAt: req.createdAt },
    createdAt: req.createdAt,
    arrivedAt: req.arrivedAt,
    startedAt: req.startedAt,
    completedAt: req.completedAt,
  };
}
