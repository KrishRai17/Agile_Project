"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, User, DEFAULT_USER } from "@/lib/auth";
import UberNavbar from "@/components/UberNavbar";
import GetRidePanel from "@/components/GetRidePanel";
import MapWrapper from "@/components/MapWrapper";
import ActivityModal from "@/components/ActivityModal";
import UpcomingRide from "@/components/UpcomingRide";
import QuickActionCard from "@/components/QuickActionCard";
import Footer from "@/components/Footer";
import {
  BENGALURU_LOCATIONS,
  INITIAL_DRIVER_CARS,
  DriverCar,
  LocationItem,
} from "@/lib/mapData";
import { QUICK_ACTIONS } from "@/lib/mockData";
import { ChevronDown, ChevronUp, MapPin, ShieldCheck } from "lucide-react";
import { useGeolocation } from "@/lib/useGeolocation";
import { useToast } from "@/components/ToastContext";

export default function HomePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { requestLocation } = useGeolocation();
  const [user, setUser] = useState<User | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Active top navigation tab
  const [activeTab, setActiveTab] = useState<"find" | "offer" | "my-rides">("find");

  // Activity modal open state
  const [isActivityOpen, setIsActivityOpen] = useState(false);

  // Selected Pickup and Dropoff locations
  const [pickup, setPickup] = useState<LocationItem | null>(() => {
    return BENGALURU_LOCATIONS.find((l) => l.id === "loc_kju") || BENGALURU_LOCATIONS[1];
  });
  const [dropoff, setDropoff] = useState<LocationItem | null>(null);

  // Driver cars state
  const [driverCars, setDriverCars] = useState<DriverCar[]>(INITIAL_DRIVER_CARS);

  // Toggle for campus extras section
  const [showCampusDetails, setShowCampusDetails] = useState(false);

  // Handle locate current location from map crosshair button
  const handleLocateCurrentLocation = async () => {
    showToast("Detecting Location", "Requesting GPS coordinates...", "info");
    const loc = await requestLocation();
    if (loc) {
      const locationItem: LocationItem = {
        id: `geo_${Date.now()}`,
        name: loc.shortName,
        address: loc.displayName,
        lat: loc.lat,
        lng: loc.lng,
        category: "landmark",
      };
      setPickup(locationItem);
      showToast("Location detected", `Pickup set to: ${loc.shortName}`, "success");
    } else {
      showToast("Location unavailable", "Please allow location access in browser settings.", "error");
    }
  };

  // Check auth — fall back to DEFAULT_USER in demo mode
  useEffect(() => {
    const stored = getStoredUser();
    if (!stored) {
      setUser(DEFAULT_USER);
      setIsCheckingAuth(false);
    } else {
      setUser(stored);
      setIsCheckingAuth(false);
    }
  }, [router]);

  // Gentle car animation
  useEffect(() => {
    const interval = setInterval(() => {
      setDriverCars((prevCars) =>
        prevCars.map((car) => {
          const rad = (car.rotation * Math.PI) / 180;
          const deltaLat = Math.sin(rad) * 0.00015;
          const deltaLng = Math.cos(rad) * 0.00015;
          const newRotation =
            Math.random() > 0.6
              ? (car.rotation + (Math.random() > 0.5 ? 15 : -15) + 360) % 360
              : car.rotation;
          return { ...car, lat: car.lat + deltaLat, lng: car.lng + deltaLng, rotation: newRotation };
        })
      );
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectMapLocation = (type: "pickup" | "dropoff", location: LocationItem) => {
    if (type === "pickup") setPickup(location);
    else setDropoff(location);
  };

  if (isCheckingAuth || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Loading HopOn...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/70 selection:bg-blue-100 selection:text-blue-900">
      {/* 1. HopOn Navbar matching login page brand */}
      <UberNavbar
        user={user}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        onOpenActivity={() => setIsActivityOpen(true)}
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
              onSetPickup={(loc) => setPickup(loc)}
              onSetDropoff={(loc) => setDropoff(loc)}
              onClearPickup={() => setPickup(null)}
              onClearDropoff={() => setDropoff(null)}
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
              onSelectMapLocation={handleSelectMapLocation}
              onLocateCurrentLocation={handleLocateCurrentLocation}
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
