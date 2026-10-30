"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { syncSession, User } from "@/lib/auth";
import HopOnNavbar from "@/components/HopOnNavbar";
import GetRidePanel from "@/components/GetRidePanel";
import MapWrapper from "@/components/MapWrapper";
import ActivityModal from "@/components/ActivityModal";
import UpcomingRide from "@/components/UpcomingRide";
import QuickActionCard from "@/components/QuickActionCard";
import Footer from "@/components/Footer";
import {
  BENGALURU_LOCATIONS,
  INITIAL_DRIVER_CARS,
  DRIVER_ROAM_RADIUS_DEG,
  DriverCar,
  LocationItem,
  estimateRoute,
  bearingDegrees,
  AcceptedRideRoute,
} from "@/lib/mapData";
import { QUICK_ACTIONS } from "@/lib/mockData";
import { ChevronDown, ChevronUp, MapPin, ShieldCheck } from "lucide-react";
import { useGeolocation } from "@/lib/useGeolocation";
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

  // Active top navigation tab (defaults to "offer" for drivers, "find" for passengers)
  const [activeTab, setActiveTab] = useState<"find" | "offer" | "my-rides">(() =>
    getClientUser()?.role === "driver" ? "offer" : "find"
  );
  const [prevUserId, setPrevUserId] = useState<string | undefined>(user?.id);
  if (user?.id !== prevUserId) {
    setPrevUserId(user?.id);
    if (user?.role === "driver") {
      setActiveTab("offer");
    } else if (user?.role === "passenger") {
      setActiveTab("find");
    }
  }

  // Activity modal open state
  const [isActivityOpen, setIsActivityOpen] = useState(false);

  // Driver pending request count (for notification bell)
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  // Active accepted ride route state (Driver -> Pickup -> Dropoff)
  const [activeAcceptedRide, setActiveAcceptedRide] = useState<AcceptedRideRoute | null>(null);

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
      setUserLocation(loc);

      // If user is a driver, broadcast their live GPS location to all passengers
      if (user?.role === "driver") {
        fetch("/api/rides/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            driverId: user.id,
            lat: loc.lat,
            lng: loc.lng,
          }),
        }).catch(() => {});

        // Update driver position on active accepted route if active
        setActiveAcceptedRide((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            driverLocation: {
              lat: loc.lat,
              lng: loc.lng,
              name: "Driver (Live GPS)",
            },
          };
        });
      }

      if (!force && gpsPickupLockedRef.current) return;
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

  // Manual/simulated driver step update (e.g. for testing movement across devices)
  const handleDriverLocationUpdate = useCallback(
    async (loc: { lat: number; lng: number }) => {
      if (!user) return;
      fetch("/api/rides/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverId: user.id,
          lat: loc.lat,
          lng: loc.lng,
        }),
      }).catch(() => {});

      setActiveAcceptedRide((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          driverLocation: {
            lat: loc.lat,
            lng: loc.lng,
            name: "Driver (Live)",
          },
        };
      });
    },
    [user]
  );

  const activeRequestId = activeAcceptedRide?.requestId;
  const activeDriverId = activeAcceptedRide?.driverId;
  const userRole = user?.role;

  // Poll driver live GPS location when an accepted ride is active on passenger screen
  useEffect(() => {
    if (!activeRequestId || !activeDriverId || userRole === "driver") return;

    const syncDriverLocation = async () => {
      try {
        const res = await fetch(`/api/rides/location?driverId=${activeDriverId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data.location?.lat === "number" && typeof data.location?.lng === "number") {
          const { lat, lng } = data.location;
          setActiveAcceptedRide((prev) => {
            if (!prev) return null;
            const dLat = Math.abs(prev.driverLocation.lat - lat);
            const dLng = Math.abs(prev.driverLocation.lng - lng);
            if (dLat < 0.00002 && dLng < 0.00002) return prev;
            return {
              ...prev,
              driverLocation: {
                lat,
                lng,
                name: "Driver (Live GPS)",
              },
            };
          });
        }
      } catch {
        // silent
      }
    };

    syncDriverLocation();
    const interval = setInterval(syncDriverLocation, 2500);
    return () => clearInterval(interval);
  }, [activeRequestId, activeDriverId, userRole]);

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
    const reqId = activeAcceptedRide?.requestId;
    setActiveAcceptedRide(null);
    if (reqId) {
      fetch("/api/rides/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: reqId, action: "cancel" }),
      }).catch(() => {});
    }
  }, [activeAcceptedRide?.requestId]);

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
        onTabChange={(tab) => setActiveTab(tab)}
        onOpenActivity={() => setIsActivityOpen(true)}
        pendingRequestCount={pendingRequestCount}
      />

      {/* 2. Main Body: Left Panel + Map */}
      <main className="flex-1 w-full max-w-[1720px] mx-auto p-3 sm:p-5 lg:p-6 flex flex-col">
        <div className="flex-1 flex flex-col lg:flex-row gap-5 items-stretch min-h-[calc(100vh-120px)]">

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
                <span>{showCampusDetails ? "Hide Campus Rides" : "Campus Schedule"}</span>
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
          </div>
        </div>

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

      {/* Activity History Modal */}
      <ActivityModal isOpen={isActivityOpen} onClose={() => setIsActivityOpen(false)} />

      <Footer />
    </div>
  );
}
