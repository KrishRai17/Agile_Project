"use client";

import dynamic from "next/dynamic";
import React from "react";
import { DriverCar, LocationItem, AcceptedRideRoute } from "@/lib/mapData";

// Dynamically import MapLibreMap with ssr: false for browser vector rendering
const MapLibreMap = dynamic(() => import("@/components/MapLibreMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[500px] bg-slate-100 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-9 h-9 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Loading OpenFreeMap (Bengaluru)...
        </span>
      </div>
    </div>
  ),
});

interface MapWrapperProps {
  pickup: LocationItem | null;
  dropoff: LocationItem | null;
  driverCars: DriverCar[];
  userLocation?: { lat: number; lng: number; accuracy?: number } | null;
  onSelectMapLocation?: (type: "pickup" | "dropoff", location: LocationItem) => void;
  targetMode?: "pickup" | "dropoff" | null;
  onLocateCurrentLocation?: () => void;
  onRouteInfo?: (distanceKm: number, durationMin: number) => void;
  onGpsUpdate?: (loc: { lat: number; lng: number; accuracy?: number }) => void;
  acceptedRideRoute?: AcceptedRideRoute | null;
  onClearAcceptedRoute?: () => void;
  isDriver?: boolean;
  onDriverLocationUpdate?: (loc: { lat: number; lng: number }) => void;
  onRidePhaseChange?: (phase: "pickup" | "dropoff") => void;
  onDriverArrived?: () => Promise<void> | void;
  onVerifyRideOtp?: (otp: string) => Promise<boolean>;
}

export default function MapWrapper(props: MapWrapperProps) {
  return <MapLibreMap {...props} />;
}
