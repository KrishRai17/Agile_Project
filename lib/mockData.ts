export interface UpcomingRideData {
  id: string;
  driverName: string;
  driverAvatar?: string;
  driverRating: number;
  driverUniversity: string;
  driverVerified: boolean;
  from: string;
  to: string;
  time: string;
  date: string;
  status: "Confirmed" | "Pending" | "Completed" | "Cancelled";
  vehicleModel: string;
  vehicleNumber: string;
  vehicleType: "Bike" | "Car";
  fare: string;
  seatsBooked: number;
  totalSeats: number;
  pickupNote: string;
}

export const MOCK_UPCOMING_RIDE: UpcomingRideData = {
  id: "ride_8921_kju",
  driverName: "Arjun Sharma",
  driverRating: 4.9,
  driverUniversity: "Kristu Jayanti University · BCA 3rd Year",
  driverVerified: true,
  from: "Kristu Jayanti University",
  to: "Manyata Tech Park",
  time: "5:30 PM",
  date: "Today",
  status: "Confirmed",
  vehicleModel: "White Swift Dzire",
  vehicleNumber: "KA 04 EK 7142",
  vehicleType: "Car",
  fare: "₹50",
  seatsBooked: 2,
  totalSeats: 3,
  pickupNote: "Main Campus Gate 2 (Near Bus Bay)",
};

export interface QuickActionItem {
  id: string;
  title: string;
  description: string;
  actionText: string;
  iconName: "Search" | "Car" | "Calendar";
  badge?: string;
}

export const QUICK_ACTIONS: QuickActionItem[] = [
  {
    id: "find",
    title: "Find a Ride",
    description: "Find students travelling your way.",
    actionText: "Find Ride",
    iconName: "Search",
    badge: "Popular",
  },
  {
    id: "offer",
    title: "Offer a Ride",
    description: "Share your route and help another student get there.",
    actionText: "Offer Ride",
    iconName: "Car",
    badge: "Earn Rewards",
  },
  {
    id: "my-rides",
    title: "My Rides",
    description: "View your upcoming and previous rides.",
    actionText: "View Rides",
    iconName: "Calendar",
  },
];

export interface TrustPillar {
  title: string;
  description: string;
  iconName: "ShieldCheck" | "BadgePercent" | "Users";
  stats: string;
}

export const TRUST_PILLARS: TrustPillar[] = [
  {
    title: "Verified Students",
    description: "Only verified university students will be able to use HopOn.",
    iconName: "ShieldCheck",
    stats: "100% ID Verified",
  },
  {
    title: "Affordable Rides",
    description: "Share rides and reduce your daily travel costs.",
    iconName: "BadgePercent",
    stats: "Up to 70% Cheaper",
  },
  {
    title: "Safer Community",
    description: "Connect with students from your university community.",
    iconName: "Users",
    stats: "Campus-Exclusive",
  },
];

export const POPULAR_CAMPUS_ROUTES = [
  "Kristu Jayanti University ↔ Manyata Tech Park",
  "KJU Campus ↔ Hennur Cross",
  "Campus ↔ Kammanahalli",
  "Campus ↔ Baiyappanahalli Metro",
];
