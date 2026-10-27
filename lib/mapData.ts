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
    lng: 77.6534,
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

// Initial vehicles on the map — only bike, scooty, and car types
export interface DriverCar {
  id: string;
  lat: number;
  lng: number;
  rotation: number;
  type: "bike" | "scooty" | "car";
  model: string;
  plate: string;
}

export const INITIAL_DRIVER_CARS: DriverCar[] = [
  // Cars
  { id: "v-1",  lat: 12.9815, lng: 77.5895, rotation: 18,  type: "car",    model: "Maruti Swift Dzire",  plate: "KA 01 MJ 4210" },
  { id: "v-2",  lat: 12.9772, lng: 77.5935, rotation: 110, type: "car",    model: "Tata Tigor",          plate: "KA 03 HM 2901" },
  { id: "v-3",  lat: 12.9832, lng: 77.5925, rotation: 290, type: "car",    model: "Honda Amaze",         plate: "KA 01 TR 7721" },
  { id: "v-4",  lat: 12.9718, lng: 77.5955, rotation: 195, type: "car",    model: "WagonR",              plate: "KA 05 KT 6620" },
  // Scooties
  { id: "v-5",  lat: 12.9798, lng: 77.5945, rotation: 75,  type: "scooty", model: "Honda Activa 6G",     plate: "KA 05 EM 1092" },
  { id: "v-6",  lat: 12.9750, lng: 77.5912, rotation: 340, type: "scooty", model: "TVS Jupiter",         plate: "KA 02 AB 9123" },
  { id: "v-7",  lat: 12.9805, lng: 77.5855, rotation: 130, type: "scooty", model: "Suzuki Access 125",   plate: "KA 02 YZ 5110" },
  // Bikes
  { id: "v-8",  lat: 12.9735, lng: 77.5878, rotation: 145, type: "bike",   model: "Hero Splendor Plus",  plate: "KA 03 EQ 4589" },
  { id: "v-9",  lat: 12.9782, lng: 77.5885, rotation: 215, type: "bike",   model: "Bajaj Pulsar 150",    plate: "KA 04 MP 8812" },
  { id: "v-10", lat: 12.9768, lng: 77.5862, rotation: 80,  type: "bike",   model: "Royal Enfield Bullet", plate: "KA 04 NX 3014" },
];

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
    vehicle: "UberGo",
    status: "Completed",
  },
  {
    id: "trip-02",
    date: "Oct 7, 2026",
    time: "8:45 AM",
    from: "Hennur Bus Depot",
    to: "Vidhana Soudha Metro",
    amount: "₹185",
    vehicle: "Premier",
    status: "Completed",
  },
  {
    id: "trip-03",
    date: "Oct 5, 2026",
    time: "2:30 PM",
    from: "KJU Campus Gate 2",
    to: "Elements Mall, Nagavara",
    amount: "₹65",
    vehicle: "Uber Auto",
    status: "Completed",
  },
];
