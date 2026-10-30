export interface LocationItem {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category?: "campus" | "transit" | "work" | "landmark";
}

// Popular locations centered around Bengaluru (matching the user's screenshot)
export const BENGALURU_LOCATIONS: LocationItem[] = [
  {
    id: "loc_vidhana_soudha",
    name: "Vidhana Soudha",
    address: "Ambedkar Veedhi, Sampangi Rama Nagar, Bengaluru",
    lat: 12.9797,
    lng: 77.5908,
    category: "landmark",
  },
  {
    id: "loc_kju",
    name: "Kristu Jayanti University",
    address: "K. Narayanapura, Kothanur, Bengaluru, Karnataka 560077",
    lat: 13.0583,
    lng: 77.6426,
    category: "campus",
  },
  {
    id: "loc_cubbon_park",
    name: "Cubbon Park",
    address: "Kasturba Road, Sampangi Rama Nagara, Bengaluru",
    lat: 12.9763,
    lng: 77.5929,
    category: "landmark",
  },
  {
    id: "loc_majestic",
    name: "Majestic Bus Station (KSR Bengaluru)",
    address: "Kempegowda, Sevashrama, Bengaluru",
    lat: 12.9767,
    lng: 77.5713,
    category: "transit",
  },
  {
    id: "loc_manyata",
    name: "Manyata Tech Park",
    address: "Outer Ring Road, Nagavara, Bengaluru",
    lat: 13.0458,
    lng: 77.6206,
    category: "work",
  },
  {
    id: "loc_mg_road",
    name: "MG Road Metro Station",
    address: "Mahatma Gandhi Road, Craig Park Layout, Bengaluru",
    lat: 12.9754,
    lng: 77.6066,
    category: "transit",
  },
  {
    id: "loc_indiranagar",
    name: "Indiranagar 100 Feet Road",
    address: "HAL 2nd Stage, Indiranagar, Bengaluru",
    lat: 12.9719,
    lng: 77.6412,
    category: "landmark",
  },
  {
    id: "loc_koramangala",
    name: "Koramangala 5th Block",
    address: "Jyoti Nivas College Road, Koramangala, Bengaluru",
    lat: 12.9352,
    lng: 77.6245,
    category: "landmark",
  },
  {
    id: "loc_airport",
    name: "Kempegowda Int'l Airport (BLR)",
    address: "KIAL Rd, Devanahalli, Bengaluru",
    lat: 13.1986,
    lng: 77.7066,
    category: "transit",
  },
  {
    id: "loc_chickpet",
    name: "Chickpet Metro Station",
    address: "Chickpet, Bengaluru",
    lat: 12.9682,
    lng: 77.5768,
    category: "transit",
  },
  {
    id: "loc_vasanth_nagar",
    name: "Vasanth Nagar",
    address: "Miller Road, Vasanth Nagar, Bengaluru",
    lat: 12.9912,
    lng: 77.5898,
    category: "landmark",
  },
];

// High-precision designated campus pickup locations for Kristu Jayanti University
export const CAMPUS_PICKUP_POINTS: LocationItem[] = [
  {
    id: "kju_gate1",
    name: "Main Gate 1",
    address: "K. Narayanapura Main Road, KJU Front Entrance",
    lat: 13.0583,
    lng: 77.6426,
    category: "campus",
  },
  {
    id: "kju_gate2",
    name: "Gate 2 (Sports Arena)",
    address: "Near Kristu Jayanti Sports Complex & Grounds",
    lat: 13.0628,
    lng: 77.6433,
    category: "campus",
  },
  {
    id: "kju_quad",
    name: "Admin Quadrangle",
    address: "Main College Administrative Quadrangle",
    lat: 13.0579,
    lng: 77.6424,
    category: "campus",
  },
  {
    id: "kju_pg_block",
    name: "PG & MBA Block",
    address: "Post Graduate Centre & Management Block, KJU",
    lat: 13.059,
    lng: 77.6428,
    category: "campus",
  },
  {
    id: "kju_bus_bay",
    name: "Campus Bus Bay",
    address: "College Bus Stop & Auto Stand, K. Narayanapura",
    lat: 13.0572,
    lng: 77.6418,
    category: "transit",
  },
];

// Initial vehicles on the map — only bike, scooty, and car types
export interface DriverCar {
  id: string;
  lat: number;
  lng: number;
  /** Heading in degrees clockwise from north (0 = up/north, 90 = east). Matches the CSS rotate() of the icon. */
  rotation: number;
  /** Anchor the vehicle patrols around so it never drifts off the map. */
  homeLat: number;
  homeLng: number;
  type: "bike" | "scooty" | "car";
  model: string;
  plate: string;
}

type RawDriverCar = Omit<DriverCar, "homeLat" | "homeLng">;

const RAW_DRIVER_CARS: RawDriverCar[] = [
  // Cars around KJU and Manyata corridor
  { id: "v-1",  lat: 13.0592, lng: 77.6435, rotation: 18,  type: "car",    model: "Maruti Swift Dzire",  plate: "KA 01 MJ 4210" },
  { id: "v-2",  lat: 13.0565, lng: 77.6410, rotation: 110, type: "car",    model: "Tata Tigor",          plate: "KA 03 HM 2901" },
  { id: "v-3",  lat: 13.0610, lng: 77.6450, rotation: 290, type: "car",    model: "Honda Amaze",         plate: "KA 01 TR 7721" },
  { id: "v-4",  lat: 13.0520, lng: 77.6380, rotation: 195, type: "car",    model: "WagonR",              plate: "KA 05 KT 6620" },
  // Scooties
  { id: "v-5",  lat: 13.0585, lng: 77.6455, rotation: 75,  type: "scooty", model: "Honda Activa 6G",     plate: "KA 05 EM 1092" },
  { id: "v-6",  lat: 13.0570, lng: 77.6395, rotation: 340, type: "scooty", model: "TVS Jupiter",         plate: "KA 02 AB 9123" },
  { id: "v-7",  lat: 13.0605, lng: 77.6415, rotation: 130, type: "scooty", model: "Suzuki Access 125",   plate: "KA 02 YZ 5110" },
  // Bikes
  { id: "v-8",  lat: 13.0558, lng: 77.6445, rotation: 145, type: "bike",   model: "Hero Splendor Plus",  plate: "KA 03 EQ 4589" },
  { id: "v-9",  lat: 13.0598, lng: 77.6385, rotation: 215, type: "bike",   model: "Bajaj Pulsar 150",    plate: "KA 04 MP 8812" },
  { id: "v-10", lat: 13.0545, lng: 77.6420, rotation: 80,  type: "bike",   model: "Royal Enfield Bullet", plate: "KA 04 NX 3014" },
  // Near KJU gates and Manyata
  { id: "v-11", lat: 13.0588, lng: 77.6460, rotation: 45,  type: "car",    model: "Hyundai Aura",        plate: "KA 03 NB 1182" },
  { id: "v-12", lat: 13.0575, lng: 77.6475, rotation: 200, type: "scooty", model: "Honda Dio",           plate: "KA 02 CD 7741" },
  { id: "v-13", lat: 13.0602, lng: 77.6468, rotation: 310, type: "bike",   model: "TVS Apache 160",      plate: "KA 05 FG 2290" },
];

export const INITIAL_DRIVER_CARS: DriverCar[] = RAW_DRIVER_CARS.map((c) => ({
  ...c,
  homeLat: c.lat,
  homeLng: c.lng,
}));

/** Max distance (in degrees, ~650m) a vehicle may roam from its campus anchor. */
export const DRIVER_ROAM_RADIUS_DEG = 0.006;

/** Great-circle distance between two coordinates, in km. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Compass heading in degrees clockwise from north (0 = N, 90 = E, 180 = S, 270 = W)
 * pointing from one coordinate towards another. Flat-earth approximation, fine for campus distances.
 */
export function bearingDegrees(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): number {
  const dLat = toLat - fromLat;
  const dLng = toLng - fromLng;
  return ((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360;
}

/**
 * Rough road distance/duration estimate used until a real route arrives:
 * straight-line distance with a 1.3x road factor and ~22 km/h city speed.
 */
export function estimateRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): { distanceKm: number; durationMin: number } {
  const distanceKm = Math.max(0.5, haversineKm(from.lat, from.lng, to.lat, to.lng) * 1.3);
  return { distanceKm, durationMin: Math.max(3, Math.round((distanceKm / 22) * 60)) };
}

export interface RideOption {
  id: string;
  name: string;
  etaMinutes: number;
  capacity: number;
  price: number;
  description: string;
  iconType: "bike" | "scooty" | "car";
  badge?: string;
}

export function calculateRideOptions(distanceKm: number = 8.5): RideOption[] {
  // Student campus friendly fares: Bike, Scooty, and Car only
  const baseBike = Math.max(30, Math.round(15 + distanceKm * 5));
  const baseScooty = Math.max(25, Math.round(12 + distanceKm * 4.5));
  const baseCar = Math.max(70, Math.round(40 + distanceKm * 9));

  return [
    {
      id: "hopon-bike",
      name: "HopOn Bike",
      etaMinutes: 2,
      capacity: 1,
      price: baseBike,
      description: "Fast single rider motorcycle",
      iconType: "bike",
      badge: "Fastest",
    },
    {
      id: "hopon-scooty",
      name: "HopOn Scooty",
      etaMinutes: 3,
      capacity: 1,
      price: baseScooty,
      description: "Comfortable scooty ride",
      iconType: "scooty",
      badge: "Pocket Friendly",
    },
    {
      id: "hopon-car",
      name: "HopOn Car",
      etaMinutes: 4,
      capacity: 4,
      price: baseCar,
      description: "Campus cab for up to 4 students",
      iconType: "car",
    },
  ];
}

export interface ActivityTrip {
  id: string;
  date: string;
  time: string;
  from: string;
  to: string;
  amount: string;
  vehicle: string;
  status: "Completed" | "Cancelled" | "Upcoming";
}

export const PAST_ACTIVITIES: ActivityTrip[] = [
  {
    id: "trip-01",
    date: "Yesterday",
    time: "6:15 PM",
    from: "Manyata Tech Park Gate 4",
    to: "Kristu Jayanti University",
    amount: "₹118",
    vehicle: "HopOn Car",
    status: "Completed",
  },
  {
    id: "trip-02",
    date: "Oct 7, 2026",
    time: "8:45 AM",
    from: "Hennur Bus Depot",
    to: "Vidhana Soudha Metro",
    amount: "₹185",
    vehicle: "HopOn Car",
    status: "Completed",
  },
  {
    id: "trip-03",
    date: "Oct 5, 2026",
    time: "2:30 PM",
    from: "KJU Campus Gate 2",
    to: "Elements Mall, Nagavara",
    amount: "₹65",
    vehicle: "HopOn Scooty",
    status: "Completed",
  },
];

export type RidePhase = "pickup" | "dropoff";
export type RideTripStage = "en_route_pickup" | "arrived_pickup" | "in_progress";

export interface AcceptedRideRoute {
  requestId: string;
  driverId?: string;
  driverName: string;
  driverVehicle?: string;
  driverPlate?: string;
  passengerName: string;
  fare?: string;
  phase?: RidePhase;
  tripStage?: RideTripStage;
  /** 4-digit OTP shown to the passenger so they can share it with the driver at pickup. */
  otp?: string;
  driverLocation: {
    lat: number;
    lng: number;
    name: string;
  };
  pickupLocation: {
    lat: number;
    lng: number;
    name: string;
  };
  dropoffLocation: {
    lat: number;
    lng: number;
    name: string;
  };
}

