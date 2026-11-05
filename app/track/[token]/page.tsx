"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  Navigation,
  MapPin,
  Car,
  PhoneCall,
  CheckCircle2,
  Clock,
  RefreshCw,
} from "lucide-react";

interface TrackingSnapshot {
  status: "pending" | "accepted" | "rejected" | "cancelled" | "completed";
  tripStage: "en_route_pickup" | "arrived_pickup" | "in_progress";
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
}

export default function LiveTripTrackingPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [tracking, setTracking] = useState<TrackingSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const fetchTracking = async () => {
      try {
        const res = await fetch(`/api/rides/track?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.tracking) {
          setTracking(data.tracking);
          setError(null);
        } else {
          setTracking(null);
          setError(data.error || "Live ride tracking link expired or not found.");
        }
      } catch {
        if (!cancelled) setError("Unable to reach tracking server.");
      }
    };

    void fetchTracking();
    const interval = setInterval(fetchTracking, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl border border-slate-200/80 overflow-hidden">
        {/* Top Banner */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 text-white flex items-center justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/15 text-[11px] font-bold mb-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>HopOn Campus Safety · Live Share</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight">Live Ride Telemetry</h1>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-300/40 text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>LIVE</span>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {error ? (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
              {error}
            </div>
          ) : !tracking ? (
            <div className="py-10 flex flex-col items-center justify-center gap-2 text-slate-500 text-sm">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
              <span>Loading live trip telemetry…</span>
            </div>
          ) : (
            <>
              {/* Status Banner */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                    {tracking.status === "completed" ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <Navigation className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                      {tracking.status === "completed"
                        ? "Trip Completed"
                        : tracking.tripStage === "in_progress"
                        ? "En Route to Destination (OTP Verified)"
                        : tracking.tripStage === "arrived_pickup"
                        ? "Driver Arrived at Pickup Point"
                        : "Driver En Route to Pickup"}
                    </p>
                    <p className="text-xs text-slate-500">
                      Passenger:{" "}
                      <span className="font-semibold text-slate-800">
                        {tracking.passengerFirstName}
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Driver & Vehicle Details */}
              {tracking.driverName && (
                <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                      <Car className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{tracking.driverName}</p>
                      <p className="text-xs text-slate-600">
                        {tracking.vehicleModel} ({tracking.vehicleType})
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Route Timeline */}
              <div className="p-4 rounded-2xl border border-slate-200 space-y-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400">Pickup</span>
                    <p className="font-bold text-slate-900">{tracking.pickup}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <Navigation className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400">Dropoff</span>
                    <p className="font-bold text-slate-900">{tracking.dropoff}</p>
                  </div>
                </div>
              </div>

              {/* Live GPS Telemetry Coordinates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                {tracking.driverLiveLocation && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-emerald-700">
                      📡 Rider Live GPS
                    </span>
                    <p className="font-mono font-bold text-slate-800 mt-0.5">
                      {tracking.driverLiveLocation.lat.toFixed(5)},{" "}
                      {tracking.driverLiveLocation.lng.toFixed(5)}
                    </p>
                  </div>
                )}
                {tracking.passengerLiveLocation && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-blue-700">
                      📍 Passenger Live GPS
                    </span>
                    <p className="font-mono font-bold text-slate-800 mt-0.5">
                      {tracking.passengerLiveLocation.lat.toFixed(5)},{" "}
                      {tracking.passengerLiveLocation.lng.toFixed(5)}
                    </p>
                  </div>
                )}
              </div>

              {/* Campus Safety Helpline */}
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-amber-900 font-semibold">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>KJU 24×7 Campus Security Desk</span>
                </div>
                <a
                  href="tel:112"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold text-[11px]"
                >
                  <PhoneCall className="w-3 h-3" /> SOS 112
                </a>
              </div>
            </>
          )}

          <div className="pt-2 text-center">
            <Link
              href="/home"
              className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline"
            >
              ← Back to HopOn Campus Map
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

