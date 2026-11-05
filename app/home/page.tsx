"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { syncSession, User } from "@/lib/auth";
import HopOnNavbar from "@/components/HopOnNavbar";
import GetRidePanel from "@/components/GetRidePanel";
import MapWrapper from "@/components/MapWrapper";
import ActivityModal from "@/components/ActivityModal";
import RatingModal from "@/components/RatingModal";
import UpcomingRide from "@/components/UpcomingRide";
import QuickActionCard from "@/components/QuickActionCard";
import UserDashboardView from "@/components/UserDashboardView";
import Footer from "@/components/Footer";
import {
  BENGALURU_LOCATIONS,
  INITIAL_DRIVER_CARS,
  DRIVER_ROAM_RADIUS_DEG,
  DriverCar,
  LocationItem,
  estimateRoute,
  haversineKm,
  bearingDegrees,
  AcceptedRideRoute,
  MatchingCampusRide,
  DEFAULT_MATCHING_RIDES,
} from "@/lib/mapData";
import { QUICK_ACTIONS } from "@/lib/mockData";
import {
  ChevronDown,
  ChevronUp,
  MapPin,
  ShieldCheck,
  Clock,
  ArrowRight,
  Car,
  Building,
  Briefcase,
  Share2,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { useGeolocation, recordKnownGpsFix } from "@/lib/useGeolocation";
import { useToast } from "@/components/ToastContext";

let cachedUserRaw: string | null = null;
let cachedUser: User | null = null;

function subscribeAuth(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function getClientUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw =
    localStorage.getItem("hopon_user_auth") ?? sessionStorage.getItem("hopon_user_auth");
  if (raw !== cachedUserRaw) {
    cachedUserRaw = raw;
    try {
      cachedUser = raw ? (JSON.parse(raw) as User) : null;
    } catch {
      cachedUser = null;
    }
  }
  return cachedUser;
}

function getServerUser(): User | null {
  return null;
}

export default function HomePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { requestLocation } = useGeolocation();
  const user = useSyncExternalStore(subscribeAuth, getClientUser, getServerUser);

  const hasVehicle = Boolean(user?.vehicleModel || user?.vehicleNumber);
  const canOfferRide = hasVehicle || user?.role === "driver" || user?.role === "both";

  // Active top navigation tab (defaults to "offer" for drivers with vehicle, "find" for passengers)
  const [activeTab, setActiveTab] = useState<"find" | "offer" | "my-rides" | "wallet" | "profile">("find");
  const [prevUserId, setPrevUserId] = useState<string | undefined>(user?.id);
  const [prevCanOffer, setPrevCanOffer] = useState<boolean>(canOfferRide);
  if (user?.id !== prevUserId || canOfferRide !== prevCanOffer) {
    setPrevUserId(user?.id);
    setPrevCanOffer(canOfferRide);
    if (!canOfferRide && activeTab === "offer") {
      setActiveTab("find");
    } else if (canOfferRide && user?.id !== prevUserId) {
      setActiveTab("offer");
    }
  }

  // Activity modal open state
  const [isActivityOpen, setIsActivityOpen] = useState(false);

  // Driver pending request count (for notification bell)
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  // Whether rider has put up a search / request for rides
  const [isRiderSearching, setIsRiderSearching] = useState(false);

  // Selected matching ride from rider dashboard
  const [selectedMatchingRide, setSelectedMatchingRide] = useState<MatchingCampusRide | null>(
    DEFAULT_MATCHING_RIDES[0] || null
  );
  const onRequestSeatRef = useRef<((ride?: MatchingCampusRide) => Promise<void>) | null>(null);

  // Active accepted ride route state (Driver -> Pickup -> Dropoff)
  const [activeAcceptedRide, setActiveAcceptedRide] = useState<AcceptedRideRoute | null>(null);
  const [ratingTarget, setRatingTarget] = useState<{
    requestId: string;
    targetUserId: string;
    targetName: string;
    targetRole: "driver" | "passenger";
    fare?: string;
  } | null>(null);

  // Selected Pickup and Dropoff locations
  const [pickup, setPickup] = useState<LocationItem | null>(() => {
    return BENGALURU_LOCATIONS.find((l) => l.id === "loc_kju") || BENGALURU_LOCATIONS[1];
  });
  const [dropoff, setDropoff] = useState<LocationItem | null>(null);

  // Driver cars state
  const [driverCars, setDriverCars] = useState<DriverCar[]>(INITIAL_DRIVER_CARS);

  // Real road distance/duration reported by the map (matched to endpoints)
  const [routeInfo, setRouteInfo] = useState<{
    key: string;
    distanceKm: number;
    durationMin: number;
  } | null>(null);

  const currentRouteKey = `${pickup?.id ?? ""}->${dropoff?.id ?? ""}`;

  // Use the real route when available, otherwise a coordinate-based estimate
  const route = useMemo(() => {
    if (routeInfo && routeInfo.key === currentRouteKey) {
      return { distanceKm: routeInfo.distanceKm, durationMin: routeInfo.durationMin };
    }
    if (pickup && dropoff) return estimateRoute(pickup, dropoff);
    return null;
  }, [routeInfo, currentRouteKey, pickup, dropoff]);

  // Toggle for campus extras section
  const [showCampusDetails, setShowCampusDetails] = useState(false);

  // User location beacon state (GPS / Wi-Fi detected position)
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
    accuracy?: number;
  } | null>(null);

  // GPS auto-fill of the pickup is applied once (or when explicitly requested), and never
  // overrides a pickup the user chose manually. Continuous GPS ticks only update the beacon.
  const gpsPickupLockedRef = useRef(false);
  const manualPickupVersionRef = useRef(0);

  const markPickupManual = useCallback(() => {
    gpsPickupLockedRef.current = true;
    manualPickupVersionRef.current += 1;
  }, []);

  // Handle live device GPS update from hardware sensor or map control
  const handleDeviceGpsUpdate = useCallback(
    async (loc: { lat: number; lng: number; accuracy?: number }, force = false) => {
      recordKnownGpsFix(loc.lat, loc.lng, loc.accuracy);
      setUserLocation(loc);

      // Broadcast live GPS location for both drivers and passengers so active rides reflect real movement
      if (user) {
        fetch("/api/rides/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: loc.lat,
            lng: loc.lng,
          }),
        }).catch(() => {});

        if (user.role === "driver") {
          const exactLat = Number(loc.lat.toFixed(6));
          const exactLng = Number(loc.lng.toFixed(6));
          setActiveAcceptedRide((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              driverLocation: {
                lat: exactLat,
                lng: exactLng,
                name: prev.driverLocation.name || "Rider (Live GPS)",
              },
            };
          });
        } else if (user.role === "passenger") {
          setActiveAcceptedRide((prev) => {
            if (!prev) return null;
            if (prev.tripStage === "in_progress") return prev;
            // Only refine pickup pin with live GPS if the passenger is within 800m of their booked pickup
            const distFromBookedPickupKm = haversineKm(
              loc.lat,
              loc.lng,
              prev.pickupLocation.lat,
              prev.pickupLocation.lng
            );
            const distFromDriverKm = haversineKm(
              loc.lat,
              loc.lng,
              prev.driverLocation.lat,
              prev.driverLocation.lng
            );
            if (distFromBookedPickupKm > 0.8 || distFromDriverKm < 0.03) {
              return prev;
            }
            return {
              ...prev,
              pickupLocation: {
                lat: loc.lat,
                lng: loc.lng,
                name: prev.pickupLocation.name,
              },
            };
          });
        }
      }

      if (!force) return;
      gpsPickupLockedRef.current = true;
      const versionAtStart = manualPickupVersionRef.current;
      const applyPickup = (item: LocationItem) => {
        // Drop the result if the user picked a pickup while we were reverse-geocoding
        if (!force && manualPickupVersionRef.current !== versionAtStart) return;
        setPickup(item);
      };

      try {
        const res = await fetch(`/api/geocode/reverse?lat=${loc.lat}&lng=${loc.lng}`);
        if (res.ok) {
          const data = await res.json();
          applyPickup({
            id: `gps_${Date.now()}`,
            name: data.shortName || `Current Location (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)})`,
            address: data.displayName || `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`,
            lat: loc.lat,
            lng: loc.lng,
            category: "landmark",
          });
        }
      } catch {
        applyPickup({
          id: `gps_${Date.now()}`,
          name: `Current Location (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)})`,
          address: `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`,
          lat: loc.lat,
          lng: loc.lng,
          category: "landmark",
        });
      }
    },
    [user]
  );

  // Keep the latest handler in a ref so the mount-time GPS request runs exactly once
  const handleDeviceGpsUpdateRef = useRef(handleDeviceGpsUpdate);
  useEffect(() => {
    handleDeviceGpsUpdateRef.current = handleDeviceGpsUpdate;
  }, [handleDeviceGpsUpdate]);

  // Direct live GPS update callback from MapLibre GeolocateControl / hardware GPS
  const handleDriverLocationUpdate = useCallback(
    async (loc: { lat: number; lng: number }) => {
      if (!user) return;
      fetch("/api/rides/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: loc.lat,
          lng: loc.lng,
        }),
      }).catch(() => {});

      setActiveAcceptedRide((prev) => {
        if (!prev) return null;
        if (user.role === "driver") {
          return {
            ...prev,
            driverLocation: {
              lat: loc.lat,
              lng: loc.lng,
              name: "Driver (Live GPS)",
            },
          };
        }
        if (prev.tripStage !== "in_progress") {
          return {
            ...prev,
            pickupLocation: {
              lat: loc.lat,
              lng: loc.lng,
              name: prev.pickupLocation.name,
            },
          };
        }
        return prev;
      });
    },
    [user]
  );

  const activeRequestId = activeAcceptedRide?.requestId;
  const activeDriverId = activeAcceptedRide?.driverId;
  const activePassengerId = activeAcceptedRide?.passengerId;
  const userRole = user?.role;

  // Continuously watch real device GPS movement when signed in so both rider and passenger move live
  useEffect(() => {
    if (!user?.id || typeof window === "undefined" || !("geolocation" in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 1e6) / 1e6;
        const lng = Math.round(pos.coords.longitude * 1e6) / 1e6;
        const accuracy = pos.coords.accuracy ? Math.round(pos.coords.accuracy) : undefined;
        void handleDeviceGpsUpdateRef.current({ lat, lng, accuracy });
      },
      () => {
        // Fallback to manual/map geolocate control if watchPosition is denied
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 10000,
      }
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [user?.id]);

  // Poll counterparty live GPS location when an accepted ride is active:
  // - Passenger tracks Driver's real-time GPS location
  // - Driver tracks Passenger's real-time GPS location (until passenger boards at OTP verification)
  useEffect(() => {
    if (!activeRequestId) return;
    const targetUserId = userRole === "driver" ? activePassengerId : activeDriverId;
    if (!targetUserId) return;

    const syncCounterpartyLocation = async () => {
      try {
        const res = await fetch(`/api/rides/location?userId=${encodeURIComponent(targetUserId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data.location?.lat === "number" && typeof data.location?.lng === "number") {
          const { lat, lng } = data.location;
          setActiveAcceptedRide((prev) => {
            if (!prev) return null;
            if (userRole === "driver") {
              if (prev.tripStage === "in_progress") return prev;
              const dLat = Math.abs(prev.pickupLocation.lat - lat);
              const dLng = Math.abs(prev.pickupLocation.lng - lng);
              if (dLat < 0.00002 && dLng < 0.00002) return prev;
              const distFromBookedPickupKm = haversineKm(
                lat,
                lng,
                prev.pickupLocation.lat,
                prev.pickupLocation.lng
              );
              const distFromDriverKm = haversineKm(
                lat,
                lng,
                prev.driverLocation.lat,
                prev.driverLocation.lng
              );
              if (distFromBookedPickupKm > 0.8 || distFromDriverKm < 0.03) return prev;
              return {
                ...prev,
                pickupLocation: {
                  lat,
                  lng,
                  name: prev.pickupLocation.name,
                },
              };
            } else {
              const dLat = Math.abs(prev.driverLocation.lat - lat);
              const dLng = Math.abs(prev.driverLocation.lng - lng);
              if (dLat < 0.00001 && dLng < 0.00001) return prev;
              return {
                ...prev,
                driverLocation: {
                  lat: Number(lat.toFixed(6)),
                  lng: Number(lng.toFixed(6)),
                  name: prev.driverLocation.name || "Rider (Live GPS)",
                },
              };
            }
          });
        }
      } catch {
        // silent
      }
    };

    void syncCounterpartyLocation();
    const interval = setInterval(syncCounterpartyLocation, 2000);

    // Also subscribe to the real-time Server-Sent Events stream (/api/rides/stream)
    // for sub-second counterparty location and ride stage push updates
    let es: EventSource | null = null;
    if (typeof window !== "undefined" && "EventSource" in window) {
      es = new EventSource("/api/rides/stream");
      const onStreamPayload = (ev: MessageEvent) => {
        try {
          const payload = JSON.parse(ev.data);
          const loc = payload?.counterpartyLocation;
          if (typeof loc?.lat === "number" && typeof loc?.lng === "number") {
            setActiveAcceptedRide((prev) => {
              if (!prev) return null;
              if (userRole === "driver") {
                if (prev.tripStage === "in_progress") return prev;
                const distFromBookedPickupKm = haversineKm(
                  loc.lat,
                  loc.lng,
                  prev.pickupLocation.lat,
                  prev.pickupLocation.lng
                );
                const distFromDriverKm = haversineKm(
                  loc.lat,
                  loc.lng,
                  prev.driverLocation.lat,
                  prev.driverLocation.lng
                );
                if (distFromBookedPickupKm > 0.8 || distFromDriverKm < 0.03) return prev;
                return {
                  ...prev,
                  pickupLocation: {
                    lat: loc.lat,
                    lng: loc.lng,
                    name: prev.pickupLocation.name,
                  },
                };
              } else {
                return {
                  ...prev,
                  driverLocation: {
                    lat: Number(loc.lat.toFixed(6)),
                    lng: Number(loc.lng.toFixed(6)),
                    name: prev.driverLocation.name || "Rider (Live GPS)",
                  },
                };
              }
            });
          }
        } catch {
          // ignore parse error
        }
      };
      es.addEventListener("snapshot", onStreamPayload);
      es.addEventListener("update", onStreamPayload);
    }

    return () => {
      clearInterval(interval);
      if (es) es.close();
    };
  }, [activeRequestId, activeDriverId, activePassengerId, userRole]);

  // Automatically acquire device GPS coordinates on page mount (once)
  useEffect(() => {
    let cancelled = false;
    requestLocation().then((loc) => {
      if (cancelled || !loc) return;
      handleDeviceGpsUpdateRef.current({ lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy });
    });
    return () => {
      cancelled = true;
    };
  }, [requestLocation]);

  // Handle locate current location from map crosshair button
  const handleLocateCurrentLocation = async () => {
    showToast("Detecting Location", "Reading device GPS coordinates...", "info");
    const loc = await requestLocation();
    if (loc) {
      await handleDeviceGpsUpdate({ lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy }, true);
      const accMsg = loc.accuracy ? ` (±${Math.round(loc.accuracy)}m)` : "";
      showToast("GPS Located", `Pickup set to: ${loc.shortName}${accMsg}`, "success");
    } else {
      showToast("GPS unavailable", "Please allow location access in your device settings.", "error");
    }
  };

  // Check auth — the signed server session is the source of truth (local storage is only a UI cache).
  // Visitors without a valid session are sent to the login page.
  useEffect(() => {
    let cancelled = false;
    syncSession().then((sessionUser) => {
      if (cancelled || sessionUser) return;
      try {
        window.location.replace("/login");
      } catch {
        router.replace("/login");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Realistic campus car patrol animation
  useEffect(() => {
    const interval = setInterval(() => {
      setDriverCars((prevCars) =>
        prevCars.map((car) => {
          // Heading is degrees clockwise from north (0° = North / +lat, 90° = East / +lng)
          const rad = (car.rotation * Math.PI) / 180;
          const speed = 0.00016;
          const deltaLat = Math.cos(rad) * speed;
          const deltaLng = (Math.sin(rad) * speed) / Math.cos((car.lat * Math.PI) / 180);
          const nextLat = car.lat + deltaLat;
          const nextLng = car.lng + deltaLng;

          // Check distance from home patrol anchor
          const offLat = car.homeLat - nextLat;
          const offLng = car.homeLng - nextLng;
          const dist = Math.hypot(offLat, offLng);

          let newRotation = car.rotation;
          if (dist > DRIVER_ROAM_RADIUS_DEG) {
            // Steer back towards home anchor
            const targetBearing = bearingDegrees(nextLat, nextLng, car.homeLat, car.homeLng);
            newRotation = Math.round(targetBearing);
          } else {
            // Turn naturally at simulated street intersections
            const r = Math.random();
            if (r < 0.15) {
              newRotation = (car.rotation + 90) % 360;
            } else if (r < 0.3) {
              newRotation = (car.rotation + 270) % 360;
            } else if (r < 0.55) {
              newRotation = (car.rotation + (Math.random() > 0.5 ? 15 : -15) + 360) % 360;
            }
          }

          return { ...car, lat: nextLat, lng: nextLng, rotation: Math.round(newRotation) };
        })
      );
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  const handleSelectMapLocation = (type: "pickup" | "dropoff", location: LocationItem) => {
    if (type === "pickup") {
      markPickupManual();
      setPickup(location);
    } else setDropoff(location);
  };

  const handleClearAcceptedRoute = useCallback(() => {
    const rideSnapshot = activeAcceptedRide;
    const reqId = rideSnapshot?.requestId || `KJU-RIDE-${Date.now()}`;
    const isCompletedTrip =
      rideSnapshot?.tripStage === "in_progress" ||
      rideSnapshot?.phase === "dropoff";

    setActiveAcceptedRide(null);

    if (rideSnapshot?.requestId) {
      fetch("/api/rides/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: rideSnapshot.requestId,
          action: isCompletedTrip ? "complete" : "cancel",
        }),
      }).catch(() => {});
    }

    if (isCompletedTrip) {
      const counterpartyId =
        user?.role === "driver"
          ? (rideSnapshot?.passengerId || "passenger_demo")
          : (rideSnapshot?.driverId || "driver_rohan");
      const counterpartyName =
        user?.role === "driver"
          ? (rideSnapshot?.passengerName || "Student Passenger")
          : (rideSnapshot?.driverName || "Rohan Mehta");

      setRatingTarget({
        requestId: reqId,
        targetUserId: counterpartyId,
        targetName: counterpartyName,
        targetRole: user?.role === "driver" ? "passenger" : "driver",
        fare: rideSnapshot?.fare || "75",
      });
    }
  }, [activeAcceptedRide, user?.role]);

  const handleDriverArrived = useCallback(async () => {
    const reqId = activeAcceptedRide?.requestId;
    if (!reqId) return;
    try {
      const res = await fetch("/api/rides/requests/respond", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: reqId, action: "arrive" }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast("Error", data.error || "Could not mark arrival.", "error");
        return;
      }
      setActiveAcceptedRide((prev) => {
        if (!prev) return null;
        if (user) {
          fetch("/api/rides/location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              driverId: user.id,
              lat: prev.pickupLocation.lat,
              lng: prev.pickupLocation.lng,
            }),
          }).catch(() => {});
        }
        return {
          ...prev,
          phase: "pickup",
          tripStage: "arrived_pickup",
          driverLocation: {
            lat: prev.pickupLocation.lat,
            lng: prev.pickupLocation.lng,
            name: prev.pickupLocation.name,
          },
        };
      });
      showToast(
        "Arrived at Pickup 📍",
        "Passenger notified! Ask for their 4-digit OTP to start the dropoff route.",
        "success"
      );
    } catch {
      showToast("Network Error", "Could not notify passenger.", "error");
    }
  }, [activeAcceptedRide?.requestId, showToast, user]);

  const handleVerifyRideOtp = useCallback(
    async (otpCode: string): Promise<boolean> => {
      const reqId = activeAcceptedRide?.requestId;
      if (!reqId) return false;
      try {
        const res = await fetch("/api/rides/requests/respond", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: reqId, action: "verify_otp", otp: otpCode.trim() }),
        });
        const data = await res.json();
        if (!res.ok) {
          showToast("Invalid OTP", data.error || "Incorrect 4-digit OTP.", "error");
          return false;
        }
        setActiveAcceptedRide((prev) =>
          prev
            ? {
                ...prev,
                phase: "dropoff",
                tripStage: "in_progress",
                driverLocation: {
                  lat: prev.pickupLocation.lat,
                  lng: prev.pickupLocation.lng,
                  name: prev.pickupLocation.name,
                },
              }
            : null
        );
        showToast(
          "OTP Verified! 🏁",
          "Starting trip — dropoff route is now live on the map.",
          "success"
        );
        return true;
      } catch {
        showToast("Network Error", "Could not verify OTP.", "error");
        return false;
      }
    },
    [activeAcceptedRide?.requestId, showToast]
  );

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <div>
            <h2 className="text-base font-bold text-slate-900">Opening HopOn Campus Rides...</h2>
            <p className="text-xs text-slate-500 mt-1">Please sign in to view your campus rides.</p>
          </div>
          <Link
            href="/login"
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/70 selection:bg-blue-100 selection:text-blue-900">
      {/* 1. HopOn Navbar matching login page brand */}
      <HopOnNavbar
        user={user}
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === "offer" && !canOfferRide) return;
          setActiveTab(tab);
        }}
        onOpenActivity={() => setIsActivityOpen(true)}
        onOpenProfile={() => setActiveTab("profile")}
        pendingRequestCount={pendingRequestCount}
      />

      {/* 2. Main Body: User Dashboard vs Rider Dashboard/Booking View */}
      {activeTab === "my-rides" || activeTab === "wallet" || activeTab === "profile" ? (
        <UserDashboardView
          user={user}
          initialNav={activeTab === "wallet" ? "payments" : activeTab === "profile" ? "settings" : "overview"}
          onFindRide={() => setActiveTab("find")}
          onViewRideDetails={() => setActiveTab("find")}
        />
      ) : (
        <main className="flex-1 w-full max-w-[1720px] mx-auto p-3 sm:p-5 lg:p-6 flex flex-col">
          {/* Rider Dashboard Title Header (matching UI mockup) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                RIDER DASHBOARD
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight font-heading">
                Your ride. Your day.
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Welcome back, {user.name.split(" ")[0]}. Your next journey is ready.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 shadow-2xs">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
                <span>Campus verified</span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setActiveAcceptedRide(null);
                  showToast("Campus Search", "Ready to find your next campus ride.", "info");
                }}
                className="px-4 py-2 rounded-xl bg-[#27a8f5] hover:bg-[#1f96de] active:scale-[0.98] text-white font-bold text-xs sm:text-sm shadow-md shadow-sky-500/25 transition-all cursor-pointer flex items-center gap-2 shrink-0"
              >
                <span>Find your next ride</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col lg:flex-row gap-5 items-stretch min-h-[calc(100vh-180px)]">
            {/* Left Panel */}
            <div className="w-full lg:w-[420px] xl:w-[450px] shrink-0 z-10 flex flex-col justify-start">
              <GetRidePanel
                activeTab={activeTab}
                pickup={pickup}
                dropoff={dropoff}
                onSetPickup={(loc) => {
                  markPickupManual();
                  setPickup(loc);
                }}
                onSetDropoff={(loc) => setDropoff(loc)}
                onClearPickup={() => setPickup(null)}
                onClearDropoff={() => setDropoff(null)}
                route={route}
                onLocateUser={(loc) => setUserLocation(loc)}
                user={user}
                onPendingCount={setPendingRequestCount}
                onAcceptedRideRoute={setActiveAcceptedRide}
                activeAcceptedRide={activeAcceptedRide}
                onDriverArrived={handleDriverArrived}
                onVerifyRideOtp={handleVerifyRideOtp}
                onCompleteAcceptedRide={handleClearAcceptedRoute}
                selectedMatchingRide={selectedMatchingRide}
                onSelectMatchingRide={setSelectedMatchingRide}
                onRequestSeatRef={onRequestSeatRef}
                onSearchingRidesChange={setIsRiderSearching}
              />

              {/* Map helper + campus schedule toggle */}
              <div className="mt-3 px-2 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-blue-600" /> Click on the map to place pins
                </span>
                <button
                  type="button"
                  onClick={() => setShowCampusDetails(!showCampusDetails)}
                  className="text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <span>{showCampusDetails ? "Hide Campus Schedule" : "Campus Schedule"}</span>
                  {showCampusDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>
            </div>

            {/* Right Area: OpenFreeMap + MapLibre GL */}
            <div className="flex-1 rounded-3xl overflow-hidden border border-slate-200/80 shadow-lg relative min-h-[460px] lg:min-h-0 bg-slate-100">
              <MapWrapper
                pickup={pickup}
                dropoff={dropoff}
                driverCars={driverCars}
                userLocation={userLocation}
                onSelectMapLocation={handleSelectMapLocation}
                onLocateCurrentLocation={handleLocateCurrentLocation}
                onGpsUpdate={handleDeviceGpsUpdate}
                acceptedRideRoute={activeAcceptedRide}
                onClearAcceptedRoute={handleClearAcceptedRoute}
                isDriver={user?.role === "driver"}
                onDriverLocationUpdate={handleDriverLocationUpdate}
                onRidePhaseChange={(phase) =>
                  setActiveAcceptedRide((prev) => (prev ? { ...prev, phase } : null))
                }
                onDriverArrived={handleDriverArrived}
                onVerifyRideOtp={handleVerifyRideOtp}
                onRouteInfo={(distanceKm, durationMin) =>
                  setRouteInfo({
                    key: `${pickup?.id ?? ""}->${dropoff?.id ?? ""}`,
                    distanceKm,
                    durationMin,
                  })
                }
              />

              {/* Bottom Floating Card: YOUR RIDE MATCH (only shown once rider searches / requests rides AND a matching ride exists) */}
              {!activeAcceptedRide && activeTab === "find" && isRiderSearching && selectedMatchingRide && (
                <div className="absolute bottom-5 left-4 right-4 sm:left-6 sm:right-6 lg:left-8 lg:right-8 z-30 bg-white/98 backdrop-blur-md rounded-3xl p-4 sm:p-5 shadow-2xl border border-slate-200/90 animate-in slide-in-from-bottom-3 duration-200">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Driver and Car info */}
                    <div className="flex-1 min-w-0">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[10px] font-extrabold uppercase tracking-wider border border-sky-200 mb-1">
                        <span>YOUR RIDE MATCH</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                          Ride with {selectedMatchingRide.driverName}
                        </h3>
                        <span className="w-4 h-4 rounded-full bg-sky-500 text-white flex items-center justify-center text-[10px] font-bold">
                          ✓
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {selectedMatchingRide.vehicleModel} · {selectedMatchingRide.vehicleNumber}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200/80">
                          ⭐ {selectedMatchingRide.driverRating}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="text-slate-600 font-medium">Campus verified</span>
                        <span className="text-slate-300">·</span>
                        <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200/80">
                          {selectedMatchingRide.seatsLeft} seat{selectedMatchingRide.seatsLeft !== 1 ? "s" : ""} left
                        </span>
                      </div>
                    </div>

                    {/* Middle: Timing and walking distance */}
                    <div className="flex flex-row lg:flex-col justify-between lg:justify-center border-y lg:border-y-0 lg:border-x border-slate-100 py-2.5 lg:py-0 lg:px-6 gap-2 text-xs">
                      <div className="flex items-center gap-2 text-slate-700">
                        <Clock className="w-4 h-4 text-[#27a8f5] shrink-0" />
                        <div>
                          <span className="font-bold text-slate-900">{selectedMatchingRide.departureTime}</span>
                          <span className="text-slate-500 block text-[11px]">(Leaves in {selectedMatchingRide.leavesIn})</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700">
                        <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div>
                          <span className="font-bold text-slate-900">Main Gate</span>
                          <span className="text-slate-500 block text-[11px]">2 min walk</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Fare and Request Button */}
                    <div className="flex items-center justify-between lg:justify-end gap-5">
                      <div className="text-left lg:text-right">
                        <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                          ₹{selectedMatchingRide.price}
                          <span className="text-xs font-normal text-slate-500 ml-1">per seat</span>
                        </div>
                        <div className="text-[11px] text-slate-400">No hidden charges</div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (onRequestSeatRef.current) {
                            onRequestSeatRef.current(selectedMatchingRide);
                          }
                        }}
                        className="px-5 py-3 rounded-2xl bg-[#27a8f5] hover:bg-[#1f96de] active:scale-[0.98] text-white font-bold text-sm shadow-lg shadow-sky-500/25 transition-all cursor-pointer flex items-center gap-2 shrink-0"
                      >
                        <span>Request a seat</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#27a8f5]" />
                    <span>Your seat is confirmed once the driver accepts.</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 4 Cards Row from Rider Dashboard UI */}
          <section className="mt-8 pt-6 border-t border-slate-200/90 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            {/* Card 1: Recent rides */}
            <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
                  <span className="text-sm font-bold text-slate-900">Recent rides</span>
                  <button
                    type="button"
                    onClick={() => setActiveTab("my-rides")}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    View all
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                        <Car className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">Manyata Tech Park</p>
                        <p className="text-[10px] text-slate-400">2 Nov · Campus → Work</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-extrabold text-slate-900">₹75</p>
                      <p className="text-[10px] text-emerald-600 font-bold">✓</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                        <Car className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">Kristu Jayanti University</p>
                        <p className="text-[10px] text-slate-400">1 Nov · Work → Campus</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-extrabold text-slate-900">₹85</p>
                      <p className="text-[10px] text-emerald-600 font-bold">✓</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                        <Car className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">Elements Mall</p>
                        <p className="text-[10px] text-slate-400">31 Oct · Campus → Mall</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-extrabold text-slate-900">₹70</p>
                      <p className="text-[10px] text-emerald-600 font-bold">✓</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Impact / Better together (Dark card) */}
            <div className="p-5 sm:p-6 rounded-3xl bg-slate-950 text-white shadow-xl flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  SMALL RIDES. BIG DIFFERENCE.
                </p>
                <h3 className="text-xl font-extrabold text-white mt-1">Better together.</h3>
                <p className="text-xs text-slate-400 mt-0.5">Your impact over the last 30 days.</p>

                <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-slate-800">
                  <div>
                    <p className="text-2xl font-black text-white">₹960</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">saved on rides</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-white">18.6 kg</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">CO₂ avoided</p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center gap-2 text-[11px] text-slate-400">
                <span className="text-emerald-400">🌱</span>
                <span>24 shared rides. One lighter footprint.</span>
              </div>
            </div>

            {/* Card 3: Your go-to places */}
            <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                  <span className="text-sm font-bold text-slate-900">Your go-to places</span>
                  <button
                    type="button"
                    onClick={() => showToast("Saved Places", "Managing campus locations...", "info")}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Manage
                  </button>
                </div>

                <div className="space-y-2">
                  <div
                    onClick={() => {
                      setPickup({
                        id: "campus-main",
                        name: "Kristu Jayanti University · Main Gate",
                        lat: 13.0583,
                        lng: 77.6426,
                        address: "K. Narayanapura, Kothanur, Bengaluru",
                      });
                      showToast("Pickup Set", "Kristu Jayanti University · Main Gate", "info");
                    }}
                    className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center">
                        <Building className="w-4 h-4 text-[#27a8f5]" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">Campus</p>
                        <p className="text-[10px] text-slate-500">Kristu Jayanti University</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>

                  <div
                    onClick={() => {
                      setDropoff({
                        id: "manyata-gate-5",
                        name: "Manyata Tech Park · Gate 5",
                        lat: 13.0475,
                        lng: 77.6202,
                        address: "Thanisandra Main Rd, Nagavara, Bengaluru",
                      });
                      showToast("Dropoff Set", "Manyata Tech Park · Gate 5", "info");
                    }}
                    className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                        <Briefcase className="w-4 h-4 text-slate-700" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">Work</p>
                        <p className="text-[10px] text-slate-500">Manyata Tech Park · Gate 5</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => showToast("Add Place", "Select a pin on the map to save a new place.", "info")}
                className="w-full mt-3 py-2 rounded-xl border border-dashed border-slate-300 hover:border-[#27a8f5] hover:text-[#27a8f5] text-xs font-semibold text-slate-600 transition-colors cursor-pointer text-center"
              >
                + Save a place
              </button>
            </div>

            {/* Card 4: Ride with peace of mind (Light blue card) */}
            <div className="p-5 sm:p-6 rounded-3xl bg-sky-50/70 border border-sky-100 text-left flex flex-col justify-between">
              <div>
                <div className="w-9 h-9 rounded-xl bg-white border border-sky-200 text-[#27a8f5] flex items-center justify-center shadow-2xs mb-3">
                  <ShieldCheck className="w-5 h-5 text-sky-600" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Ride with peace of mind.</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Keep someone you trust in the loop during your campus journey.
                </p>
              </div>

              <div className="mt-5 space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    showToast("Trip Link Copied", "Shareable tracking link copied to clipboard.", "success");
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-50 border border-sky-200 text-slate-800 text-xs font-bold shadow-2xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 text-sky-600" />
                  <span>Share my trip</span>
                </button>

                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 justify-center">
                  <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
                  <span>Safety center & emergency help</span>
                </div>
              </div>
            </div>
          </section>

          {/* Collapsible Campus Details */}
          {showCampusDetails && (
            <section className="mt-10 pt-8 border-t border-slate-200 space-y-8 animate-in slide-in-from-top-4 duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 font-heading">Campus Shared Rides</h2>
                  <p className="text-xs text-slate-500">Student carpools from {user.university}</p>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full border border-blue-200">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Verified Students Only</span>
                </div>
              </div>
              <UpcomingRide />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {QUICK_ACTIONS.map((action) => (
                  <QuickActionCard key={action.id} action={action} />
                ))}
              </div>
            </section>
          )}
        </main>
      )}

      {/* Activity History Modal */}
      <ActivityModal isOpen={isActivityOpen} onClose={() => setIsActivityOpen(false)} />

      {/* 2-Way Post-Ride Rating Modal */}
      {ratingTarget && (
        <RatingModal
          isOpen={true}
          onClose={() => setRatingTarget(null)}
          requestId={ratingTarget.requestId}
          targetUserId={ratingTarget.targetUserId}
          targetName={ratingTarget.targetName}
          targetRole={ratingTarget.targetRole}
          fare={ratingTarget.fare}
        />
      )}

      <Footer />
    </div>
  );
}
