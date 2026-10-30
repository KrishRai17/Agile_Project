"use client";

import React from "react";
import {
  Car,
  Clock,
  ShieldCheck,
  ChevronRight,
  MessageSquare,
  Users,
} from "lucide-react";
import { MOCK_UPCOMING_RIDE } from "@/lib/mockData";
import { useToast } from "@/components/ToastContext";

export default function UpcomingRide() {
  const { showToast } = useToast();
  const ride = MOCK_UPCOMING_RIDE;

  const handleViewDetails = () => {
    showToast(
      "Upcoming Ride Details",
      "Live trip tracking, driver chat, and route map view are coming soon.",
      "info"
    );
  };

  const handleContactDriver = () => {
    showToast(
      "Student Chat",
      "In-app direct messaging with Arjun Sharma is coming soon.",
      "info"
    );
  };

  return (
    <section className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-md shadow-slate-200/50">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-6 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/70">
              {ride.status}
            </span>
            <span className="text-xs text-slate-400 font-medium">Ride ID: #KJU-8921</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 font-heading">
            Upcoming Ride
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleContactDriver}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 border border-slate-200 transition-colors flex items-center gap-1.5"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat Driver</span>
          </button>
          <button
            type="button"
            onClick={handleViewDetails}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors flex items-center gap-1 shadow-sm"
          >
            <span>View Details</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Route Details (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex flex-col items-center mt-1">
              <div className="w-3.5 h-3.5 rounded-full bg-blue-600 ring-4 ring-blue-100" />
              <div className="w-0.5 h-10 bg-slate-200 my-1 border-dashed" />
              <div className="w-3.5 h-3.5 rounded-full bg-indigo-600 ring-4 ring-indigo-100" />
            </div>

            <div className="flex-1 space-y-5">
              <div>
                <p className="text-xs font-medium text-slate-400">Pickup Location</p>
                <p className="text-sm sm:text-base font-semibold text-slate-900">
                  {ride.from}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{ride.pickupNote}</p>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-400">Destination</p>
                <p className="text-sm sm:text-base font-semibold text-slate-900">
                  {ride.to}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Driver & Trip Info Card (5 cols) */}
        <div className="lg:col-span-5 bg-slate-50/80 rounded-2xl p-5 border border-slate-200/60 space-y-4">
          {/* Driver profile */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center text-white font-bold text-sm shadow-sm ring-2 ring-white">
                AS
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-bold text-slate-900">
                    {ride.driverName}
                  </p>
                  <span title="Verified Student Driver">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  </span>
                </div>
                <p className="text-xs text-slate-500">{ride.driverUniversity}</p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs font-semibold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md border border-amber-200">
                ⭐ {ride.driverRating}
              </span>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-200/60 text-xs">
            <div>
              <span className="text-slate-400 block mb-0.5">Time</span>
              <span className="font-semibold text-slate-800 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                {ride.date} · {ride.time}
              </span>
            </div>

            <div>
              <span className="text-slate-400 block mb-0.5">Vehicle</span>
              <span className="font-semibold text-slate-800 flex items-center gap-1 truncate">
                <Car className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="truncate">{ride.vehicleModel}</span>
              </span>
            </div>

            <div>
              <span className="text-slate-400 block mb-0.5">Seats</span>
              <span className="font-semibold text-slate-800 flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-blue-600" />
                {ride.seatsBooked}/{ride.totalSeats} Booked
              </span>
            </div>

            <div>
              <span className="text-slate-400 block mb-0.5">Estimated Fare</span>
              <span className="font-bold text-emerald-600 text-sm">
                {ride.fare}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
