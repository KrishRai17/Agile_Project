import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadTs } from "./support/load-ts.mjs";

// Persistence is opt-in via HOPON_PERSIST_FILE, which the store reads when it is first loaded.
const dir = mkdtempSync(join(tmpdir(), "hopon-persist-"));
const file = join(dir, "nested", "store.json");
mkdirSync(join(dir, "nested"), { recursive: true });
process.env.HOPON_PERSIST_FILE = file;

after(() => {
  delete process.env.HOPON_PERSIST_FILE;
  rmSync(dir, { recursive: true, force: true });
});

const OFFER = {
  driverId: "drv_persist",
  driverName: "Persist Driver",
  driverUniversity: "KJU",
  driverRating: 4.9,
  vehicleModel: "Test Car",
  vehicleNumber: "KA 00 PP 0001",
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
};

test("offers and requests survive a simulated restart", async () => {
  const first = await loadTs("lib/rideStore.ts");

  const offer = first.createOffer(OFFER);
  const req = first.createRequest({
    offerId: offer.id,
    passengerId: "p_persist",
    passengerName: "Persist Passenger",
    passengerRating: 5,
    pickup: "Kristu Jayanti University",
    pickupLat: 13.0583,
    pickupLng: 77.6426,
    dropoff: "Manyata Tech Park",
    dropoffLat: 13.0458,
    dropoffLng: 77.6206,
  });
  first.respondToRequest(req.id, "drv_persist", "accept");
  first.flushStoreToDisk();
  assert.ok(existsSync(file), "snapshot file was written (parent folders are created automatically)");

  // "Restart": forget the in-memory singleton and load the module again.
  delete globalThis.__hoponStore;
  const second = await loadTs("lib/rideStore.ts");

  assert.equal(second.getOffer(offer.id).driverId, "drv_persist");
  assert.equal(second.getOffer(offer.id).seatsLeft, 1, "the accepted seat is still taken");
  assert.equal(second.getRequest(req.id).status, "accepted");
  assert.ok(second.getOffer("offer_seed_001"), "seed offers come back with the snapshot");

  // Counters were restored, so new ids don't collide with restored ones.
  const another = second.createOffer(OFFER);
  assert.notEqual(another.id, offer.id);
  assert.ok(second.getOffer(offer.id), "restored offer wasn't overwritten");
});

test("a corrupt snapshot doesn't stop the server from starting", async () => {
  writeFileSync(file, "{ this is not json");
  delete globalThis.__hoponStore;

  const warn = console.warn;
  console.warn = () => {};
  let fresh;
  try {
    fresh = await loadTs("lib/rideStore.ts");
  } finally {
    console.warn = warn;
  }

  assert.ok(fresh.listActiveOffers().length >= 3, "falls back to an empty store with the seed offers");
});
