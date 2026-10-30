import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./support/load-ts.mjs";

// These tests load the REAL source files (not copies), so they fail if the app code regresses.
const mapData = await loadTs("lib/mapData.ts");
const routeUtils = await loadTs("lib/routeUtils.ts");

const { haversineKm, calculateRideOptions, estimateRoute, bearingDegrees, BENGALURU_LOCATIONS, INITIAL_DRIVER_CARS } =
  mapData;
const { generateCurvedFallbackRoute, FALLBACK_ROUTE_STEPS } = routeUtils;

const loc = (id) => BENGALURU_LOCATIONS.find((l) => l.id === id);

test("haversineKm measures KJU -> Manyata Tech Park at roughly 2.8 km", () => {
  const kju = loc("loc_kju");
  const manyata = loc("loc_manyata");
  const dist = haversineKm(kju.lat, kju.lng, manyata.lat, manyata.lng);
  assert.ok(dist > 2.5 && dist < 3.2, `Expected ~2.8km, got ${dist.toFixed(2)}km`);
});

test("haversineKm is zero for identical points and symmetric", () => {
  assert.equal(haversineKm(13.05, 77.64, 13.05, 77.64), 0);
  const a = haversineKm(13.0583, 77.6426, 12.9797, 77.5908);
  const b = haversineKm(12.9797, 77.5908, 13.0583, 77.6426);
  assert.ok(Math.abs(a - b) < 1e-9);
});

test("calculateRideOptions scales fares with distance (bike / scooty / car)", () => {
  const byId = (opts, id) => opts.find((o) => o.id === id).price;

  const short = calculateRideOptions(3);
  const medium = calculateRideOptions(10);
  const long = calculateRideOptions(25);

  // Bike: max(30, 15 + 5d)
  assert.equal(byId(short, "hopon-bike"), 30, "minimum bike fare is 30");
  assert.equal(byId(medium, "hopon-bike"), 65);
  assert.equal(byId(long, "hopon-bike"), 140);

  // Scooty: max(25, 12 + 4.5d)
  assert.equal(byId(short, "hopon-scooty"), 26);
  assert.equal(byId(medium, "hopon-scooty"), 57);

  // Car: max(70, 40 + 9d)
  assert.equal(byId(short, "hopon-car"), 70, "minimum car fare is 70");
  assert.equal(byId(medium, "hopon-car"), 130);
  assert.equal(byId(long, "hopon-car"), 265);

  assert.ok(byId(short, "hopon-bike") < byId(medium, "hopon-bike"));
  assert.ok(byId(medium, "hopon-bike") < byId(long, "hopon-bike"));
});

test("calculateRideOptions returns exactly bike, scooty and car", () => {
  const ids = calculateRideOptions().map((o) => o.id);
  assert.deepEqual(ids, ["hopon-bike", "hopon-scooty", "hopon-car"]);
});

test("estimateRoute applies minimums and a road factor", () => {
  const same = estimateRoute({ lat: 13.05, lng: 77.64 }, { lat: 13.05, lng: 77.64 });
  assert.equal(same.distanceKm, 0.5, "min distance is 0.5 km");
  assert.equal(same.durationMin, 3, "min duration is 3 min");

  const kju = loc("loc_kju");
  const manyata = loc("loc_manyata");
  const r = estimateRoute(kju, manyata);
  const straight = haversineKm(kju.lat, kju.lng, manyata.lat, manyata.lng);
  assert.ok(Math.abs(r.distanceKm - straight * 1.3) < 1e-9, "uses a 1.3x road factor");
  assert.ok(r.durationMin >= 3);
});

test("bearingDegrees returns compass headings (0=N, 90=E, 180=S, 270=W)", () => {
  assert.equal(Math.round(bearingDegrees(13.05, 77.64, 13.06, 77.64)), 0);
  assert.equal(Math.round(bearingDegrees(13.05, 77.64, 13.05, 77.65)), 90);
  assert.equal(Math.round(bearingDegrees(13.06, 77.64, 13.05, 77.64)), 180);
  assert.equal(Math.round(bearingDegrees(13.05, 77.65, 13.05, 77.64)), 270);
});

test("bearingDegrees always stays within [0, 360)", () => {
  for (let lat = -1; lat <= 1; lat += 0.5) {
    for (let lng = -1; lng <= 1; lng += 0.5) {
      if (lat === 0 && lng === 0) continue;
      const b = bearingDegrees(0, 0, lat, lng);
      assert.ok(b >= 0 && b < 360, `bearing ${b} out of range for (${lat}, ${lng})`);
    }
  }
});

test("generateCurvedFallbackRoute builds a curved line with the real step count", () => {
  const start = [77.6426, 13.0583];
  const end = [77.62, 13.045];
  const points = generateCurvedFallbackRoute(start[0], start[1], end[0], end[1]);

  assert.equal(points.length, FALLBACK_ROUTE_STEPS + 1);
  assert.deepEqual(points[0], start, "starts at the start point");
  assert.deepEqual(points[points.length - 1], end, "ends at the end point");

  const mid = points[Math.floor(points.length / 2)];
  const linearMidLng = (start[0] + end[0]) / 2;
  assert.ok(Math.abs(mid[0] - linearMidLng) > 0.001, "midpoint bulges away from the straight line");

  for (const [lng, lat] of points) {
    assert.ok(Number.isFinite(lng) && Number.isFinite(lat));
  }
});

test("seeded patrol vehicles are well-formed and anchored to their start position", () => {
  assert.ok(INITIAL_DRIVER_CARS.length > 0);
  const ids = new Set();
  for (const car of INITIAL_DRIVER_CARS) {
    assert.ok(!ids.has(car.id), `duplicate vehicle id ${car.id}`);
    ids.add(car.id);
    assert.ok(["bike", "scooty", "car"].includes(car.type), `bad type ${car.type}`);
    assert.equal(car.homeLat, car.lat);
    assert.equal(car.homeLng, car.lng);
    assert.ok(car.rotation >= 0 && car.rotation < 360);
  }
});
