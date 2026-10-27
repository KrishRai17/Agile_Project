"use client";

import React, { useState } from "react";
import {
  MapPin,
  Navigation,
  Calendar,
  Clock,
  Search,
  ArrowUpDown,
  Car,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/components/ToastContext";
import { POPULAR_CAMPUS_ROUTES } from "@/lib/mockData";

export default function RideSearch() {
  const { showToast } = useToast();

  const [fromLocation, setFromLocation] = useState("Kristu Jayanti University");
  const [toLocation, setToLocation] = useState("Manyata Tech Park");
  const [date, setDate] = useState("Today");
  const [time, setTime] = useState("Now");

  const handleSwap = () => {
    const temp = fromLocation;
    setFromLocation(toLocation);
    setToLocation(temp);
  };

  const handleFindRide = (e: React.FormEvent) => {
    e.preventDefault();
    showToast(
      "Ride matching is coming soon.",
      `Searching rides from "${fromLocation || "Current location"}" to "${toLocation || "Destination"}"`,
      "info"
    );
  };

  const handleOfferRide = () => {
    showToast(
      "Ride matching is coming soon.",
      "Offering seats and scheduling routes will be enabled in the upcoming release.",
      "info"
    );
  };

  const handleSelectRoute = (route: string) => {
    const parts = route.split("↔").map((p) => p.trim());
    if (parts.length === 2) {
      setFromLocation(parts[0]);
      setToLocation(parts[1]);
    }
  };

  return (
    <div className="w-full bg-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 border border-slate-200/80 transition-all">
      <form onSubmit={handleFindRide}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* From Location */}
          <div className="relative">
            <label
              htmlFor="search-from"
              className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5"
            >
              From
            </label>
            <div className="relative rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-white focus-within:bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-blue-600">
                <Navigation className="w-4 h-4" />
              </div>
              <input
                id="search-from"
                type="text"
                value={fromLocation}
                onChange={(e) => setFromLocation(e.target.value)}
                placeholder="Your current location"
                className="w-full pl-10 pr-4 py-3 bg-transparent text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </div>
          </div>

          {/* To Location */}
          <div className="relative">
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="search-to"
                className="block text-xs font-semibold text-slate-500 uppercase tracking-wider"
              >
                To
              </label>
              <button
                type="button"
                onClick={handleSwap}
                title="Swap locations"
                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium transition-colors"
              >
                <ArrowUpDown className="w-3 h-3" />
                <span className="hidden sm:inline text-[11px]">Swap</span>
              </button>
            </div>
            <div className="relative rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-white focus-within:bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-rose-500">
                <MapPin className="w-4 h-4" />
              </div>
              <input
                id="search-to"
                type="text"
                value={toLocation}
                onChange={(e) => setToLocation(e.target.value)}
                placeholder="Where do you want to go?"
                className="w-full pl-10 pr-4 py-3 bg-transparent text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Date */}
          <div className="relative">
            <label
              htmlFor="search-date"
              className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5"
            >
              Date
            </label>
            <div className="relative rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-white focus-within:bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Calendar className="w-4 h-4" />
              </div>
              <select
                id="search-date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full pl-10 pr-8 py-3 bg-transparent text-sm font-medium text-slate-900 focus:outline-none appearance-none cursor-pointer"
              >
                <option value="Today">Today</option>
                <option value="Tomorrow">Tomorrow</option>
                <option value="Friday">This Friday</option>
                <option value="Saturday">This Saturday</option>
              </select>
            </div>
          </div>

          {/* Time */}
          <div className="relative">
            <label
              htmlFor="search-time"
              className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5"
            >
              Time
            </label>
            <div className="relative rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-white focus-within:bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Clock className="w-4 h-4" />
              </div>
              <select
                id="search-time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full pl-10 pr-8 py-3 bg-transparent text-sm font-medium text-slate-900 focus:outline-none appearance-none cursor-pointer"
              >
                <option value="Now">Now</option>
                <option value="In 30 mins">In 30 mins</option>
                <option value="In 1 hour">In 1 hour</option>
                <option value="5:30 PM">5:30 PM (Evening Commute)</option>
                <option value="6:00 PM">6:00 PM</option>
              </select>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Quick campus presets */}
          <div className="w-full sm:w-auto flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-blue-500" /> Popular:
            </span>
            {POPULAR_CAMPUS_ROUTES.slice(0, 2).map((route) => (
              <button
                key={route}
                type="button"
                onClick={() => handleSelectRoute(route)}
                className="text-xs px-2.5 py-1 rounded-full bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-700 transition-colors border border-slate-200/60 font-medium"
              >
                {route}
              </button>
            ))}
          </div>

          {/* Search and Offer Buttons */}
          <div className="w-full sm:w-auto flex flex-col sm:flex-row items-center gap-3">
            <button
              type="button"
              onClick={handleOfferRide}
              className="w-full sm:w-auto px-5 py-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm transition-all hover:border-slate-300 shadow-xs flex items-center justify-center gap-2 active:scale-[0.99]"
            >
              <Car className="w-4 h-4 text-slate-500" />
              <span>Offer a Ride</span>
            </button>

            <button
              type="submit"
              className="w-full sm:w-auto px-7 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/35 transition-all flex items-center justify-center gap-2 active:scale-[0.99]"
            >
              <Search className="w-4 h-4" />
              <span>Find a Ride</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
