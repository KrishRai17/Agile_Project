"use client";

import React, { useState, useEffect } from "react";
import {
  LayoutGrid,
  Car,
  MapPin,
  CreditCard,
  HelpCircle,
  LogOut,
  ShieldCheck,
  Calendar,
  ArrowRight,
  TrendingUp,
  Building,
  Briefcase,
  Wallet,
  ChevronRight,
  CheckCircle2,
  Plus,
  User as UserIcon,
  Phone,
  GraduationCap,
  Copy,
  Check,
} from "lucide-react";
import { User, logout } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastContext";

interface UserDashboardViewProps {
  user: User;
  onFindRide: () => void;
  onViewRideDetails: () => void;
  initialNav?: "overview" | "rides" | "places" | "payments" | "settings";
}

export default function UserDashboardView({
  user,
  onFindRide,
  onViewRideDetails,
  initialNav = "overview",
}: UserDashboardViewProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [prevInitialNav, setPrevInitialNav] = useState(initialNav);
  const [activeNav, setActiveNav] = useState<"overview" | "rides" | "places" | "payments" | "settings">(initialNav);

  if (initialNav !== prevInitialNav) {
    setPrevInitialNav(initialNav);
    setActiveNav(initialNav);
  }

  const [copiedRoll, setCopiedRoll] = useState(false);
  const [activeRide, setActiveRide] = useState<{
    id: string;
    pickup: string;
    dropoff: string;
    status: string;
    driverName?: string;
    vehicleModel?: string;
    vehicleNumber?: string;
    fare?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const queryParam = user.role === "driver" ? `driverId=${user.id}` : `passengerId=${user.id}`;
        const res = await fetch(`/api/rides/requests?${queryParam}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const active = (data.requests || []).find(
          (r: { status: string }) => r.status === "accepted" || r.status === "pending"
        );
        if (active && !cancelled) {
          setActiveRide({
            id: active.id,
            pickup: active.pickup,
            dropoff: active.dropoff,
            status: active.status,
            driverName: active.offer?.driverName || (user.role === "driver" ? user.name : "Student Driver"),
            vehicleModel: active.offer?.vehicleModel || user.vehicleModel || "Campus Vehicle",
            vehicleNumber: active.offer?.vehicleNumber || user.vehicleNumber || "KA 04 EK 7142",
            fare: active.agreedFare || active.offer?.farePerSeat || "₹35",
          });
        }
      } catch {
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id, user.role, user.name, user.vehicleModel, user.vehicleNumber]);
  const handleCopyRoll = (roll: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(roll);
    }
    setCopiedRoll(true);
    showToast("Copied", "Student roll number copied to clipboard.", "success");
    setTimeout(() => setCopiedRoll(false), 2000);
  };

  const handleLogout = async () => {
    await logout();
    showToast("Signed out", "You have been logged out.", "info");
    router.replace("/login");
  };

  const recentTrips = [
    {
      id: "t1",
      route: "Campus → Manyata Tech Park",
      subRoute: "Main Gate to Gate 5",
      date: "2 Nov 2026",
      driver: "Rohan Mehta",
      fare: "₹75",
      status: "Completed",
    },
    {
      id: "t2",
      route: "Manyata Tech Park → Campus",
      subRoute: "Gate 5 to Main Gate",
      date: "1 Nov 2026",
      driver: "Ananya Rao",
      fare: "₹85",
      status: "Completed",
    },
    {
      id: "t3",
      route: "Campus → Elements Mall",
      subRoute: "Main Gate to north entrance",
      date: "31 Oct 2026",
      driver: "Aditya Shah",
      fare: "₹70",
      status: "Completed",
    },
    {
      id: "t4",
      route: "Campus → Manyata Tech Park",
      subRoute: "Main Gate to Gate 5",
      date: "30 Oct 2026",
      driver: "Rohan Mehta",
      fare: "₹75",
      status: "Completed",
    },
  ];

  return (
    <div className="w-full min-h-[calc(100vh-65px)] bg-slate-50/70 p-4 sm:p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto flex flex-col lg:flex-row gap-6">
        {/* Left Sidebar Navigation */}
        <aside className="w-full lg:w-64 shrink-0 flex flex-col justify-between space-y-6">
          <div className="space-y-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 mb-2">
                MY ACCOUNT
              </p>
              <nav className="space-y-1">
                <button
                  type="button"
                  onClick={() => setActiveNav("overview")}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-colors cursor-pointer ${
                    activeNav === "overview"
                      ? "bg-sky-50 text-sky-700 font-bold"
                      : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span>Overview</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveNav("rides")}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-colors cursor-pointer ${
                    activeNav === "rides"
                      ? "bg-sky-50 text-sky-700 font-bold"
                      : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Car className="w-4 h-4" />
                    <span>My rides</span>
                  </div>
                  <span className="w-5 h-5 rounded-full bg-slate-200/80 text-slate-700 text-[10px] font-bold flex items-center justify-center">
                    1
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveNav("places")}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-colors cursor-pointer ${
                    activeNav === "places"
                      ? "bg-sky-50 text-sky-700 font-bold"
                      : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                  }`}
                >
                  <MapPin className="w-4 h-4" />
                  <span>Saved places</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveNav("payments")}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-colors cursor-pointer ${
                    activeNav === "payments"
                      ? "bg-sky-50 text-sky-700 font-bold"
                      : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Payments</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveNav("settings")}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-colors cursor-pointer ${
                    activeNav === "settings"
                      ? "bg-sky-50 text-sky-700 font-bold"
                      : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                  }`}
                >
                  <UserIcon className="w-4 h-4" />
                  <span>Profile</span>
                </button>
              </nav>
            </div>

            {/* Campus Connected Card */}
            <div className="p-4 rounded-2xl bg-sky-50/70 border border-sky-100 text-left space-y-2">
              <div className="w-7 h-7 rounded-xl bg-sky-100 text-[#27a8f5] flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">Your campus, connected.</p>
                <p className="text-[11px] text-slate-500">{user.university}</p>
              </div>
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white text-sky-700 border border-sky-200 text-[10px] font-bold">
                <span>✓ Verified member</span>
              </div>
            </div>
          </div>

          {/* Help & Logout */}
          <div className="pt-4 border-t border-slate-200 space-y-1">
            <button
              type="button"
              onClick={() => showToast("Help & Support", "Campus emergency & support: support@hopon.campus", "info")}
              className="w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Help & support</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign out</span>
            </button>
          </div>
        </aside>

        {/* Main Dashboard Grid */}
        <main className="flex-1 space-y-6">
          {activeNav === "settings" ? (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    CAMPUS PROFILE & ACCOUNT
                  </p>
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight font-heading">
                    Student Profile
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Your university student credentials, campus verification and ride settings
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onFindRide}
                    className="px-4 py-2.5 rounded-xl bg-[#27a8f5] hover:bg-[#1f96de] active:scale-[0.98] text-white font-bold text-xs sm:text-sm shadow-md shadow-sky-500/25 transition-all cursor-pointer flex items-center gap-2 shrink-0"
                  >
                    <span>Find a ride</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Profile Hero Card */}
              <div className="p-6 sm:p-7 rounded-3xl bg-white border border-slate-200/90 shadow-2xs relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-sky-100/50 via-blue-50/20 to-transparent rounded-full -mr-20 -mt-20 pointer-events-none" />
                <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-4 sm:gap-5">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-[#27a8f5] to-indigo-600 text-white font-black text-2xl sm:text-3xl flex items-center justify-center shadow-md shadow-sky-500/20 shrink-0">
                      {user.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                          {user.name}
                        </h2>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                          user.role === "both"
                            ? "bg-purple-50 text-purple-700 border-purple-200"
                            : user.role === "driver"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-sky-50 text-[#0284c7] border-sky-200"
                        }`}>
                          {user.role === "both"
                            ? "🚗🎒 Rider & Passenger"
                            : user.role === "driver"
                            ? "🚗 Student Driver"
                            : "🎒 Student Passenger"}
                        </span>
                        {user.studentIdVerified && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            <span>ID Verified</span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
                        {user.email}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                        <GraduationCap className="w-3.5 h-3.5 text-slate-400" />
                        <span>{user.university || "Kristu Jayanti University"}</span>
                        {user.studentRollNumber && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className="font-semibold text-slate-700">Roll: {user.studentRollNumber}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* 3 Metric Pills */}
                  <div className="grid grid-cols-3 gap-3 md:border-l md:border-slate-100 md:pl-6 shrink-0">
                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-center">
                      <p className="text-[10px] font-bold uppercase text-slate-400">RATING</p>
                      <p className="text-base sm:text-lg font-black text-slate-900 mt-0.5 flex items-center justify-center gap-1">
                        <span>⭐</span> {user.rating}
                      </p>
                      <p className="text-[9px] text-slate-500">5-star rating</p>
                    </div>
                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-center">
                      <p className="text-[10px] font-bold uppercase text-slate-400">RIDES</p>
                      <p className="text-base sm:text-lg font-black text-slate-900 mt-0.5">
                        {user.ridesCompleted || 0}
                      </p>
                      <p className="text-[9px] text-slate-500">completed</p>
                    </div>
                    <div className="p-3 rounded-2xl bg-sky-50/70 border border-sky-100 text-center">
                      <p className="text-[10px] font-bold uppercase text-[#0284c7]">WALLET</p>
                      <p className="text-base sm:text-lg font-black text-[#0284c7] mt-0.5">
                        ₹{user.walletBalance ?? 250}
                      </p>
                      <p className="text-[9px] text-sky-600/80">balance</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Two Column Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column (8 cols): Academic Credentials & Vehicle Details */}
                <div className="lg:col-span-8 space-y-6">
                  {/* Academic & University Details */}
                  <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <GraduationCap className="w-4 h-4 text-sky-600" />
                        <h3 className="text-sm font-bold text-slate-900">Academic & University Details</h3>
                      </div>
                      <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" /> Verified Student
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <p className="text-[10px] font-bold uppercase text-slate-400">FULL NAME</p>
                        <p className="font-bold text-slate-900 text-sm mt-0.5">{user.name}</p>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <p className="text-[10px] font-bold uppercase text-slate-400">UNIVERSITY EMAIL</p>
                        <p className="font-semibold text-slate-900 text-sm mt-0.5 truncate">{user.email}</p>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-bold uppercase text-slate-400">STUDENT ROLL NUMBER</p>
                          {user.studentRollNumber && (
                            <button
                              type="button"
                              onClick={() => handleCopyRoll(user.studentRollNumber!)}
                              className="text-[10px] font-bold text-sky-600 hover:text-sky-800 flex items-center gap-1 cursor-pointer"
                            >
                              {copiedRoll ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedRoll ? "Copied" : "Copy"}</span>
                            </button>
                          )}
                        </div>
                        <p className="font-bold text-slate-900 text-sm mt-0.5 font-mono">
                          {user.studentRollNumber || "Not registered"}
                        </p>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <p className="text-[10px] font-bold uppercase text-slate-400">CAMPUS</p>
                        <p className="font-semibold text-slate-900 text-sm mt-0.5">
                          {user.university || "Kristu Jayanti University"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Registered Vehicle Details (if driver or both) or Commute Preferences (if passenger) */}
                  {user.role === "driver" || user.role === "both" || Boolean(user.vehicleModel) ? (
                    <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <Car className="w-4 h-4 text-emerald-600" />
                          <h3 className="text-sm font-bold text-slate-900">Registered Vehicle Details</h3>
                        </div>
                        <span className="text-[11px] font-semibold text-slate-500">
                          {user.vehicleType || "Car"}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                          <p className="text-[10px] font-bold uppercase text-slate-400">VEHICLE MODEL</p>
                          <p className="font-bold text-slate-900 text-sm mt-0.5">
                            {user.vehicleModel || "Campus Vehicle"}
                          </p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                          <p className="text-[10px] font-bold uppercase text-slate-400">LICENSE PLATE</p>
                          <p className="font-bold text-slate-900 text-sm mt-0.5 font-mono">
                            {user.vehicleNumber || "KA 04 EK 7142"}
                          </p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                          <p className="text-[10px] font-bold uppercase text-slate-400">CAMPUS CORRIDOR</p>
                          <p className="font-semibold text-slate-900 text-sm mt-0.5">
                            KJU ↔ Manyata Tech Park
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-sky-600" />
                          <h3 className="text-sm font-bold text-slate-900">Campus Commute Settings</h3>
                        </div>
                        <span className="text-[11px] font-semibold text-slate-500">Student Rider</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                          <p className="text-[10px] font-bold uppercase text-slate-400">PRIMARY PICKUP GATE</p>
                          <p className="font-bold text-slate-900 text-sm mt-0.5">Main Gate 1, KJU</p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                          <p className="text-[10px] font-bold uppercase text-slate-400">USUAL DESTINATION</p>
                          <p className="font-bold text-slate-900 text-sm mt-0.5">Manyata Tech Park Gate 5</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Campus Safety Helpline Card */}
                  <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-sky-50 to-blue-50/50 border border-sky-100 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-[#27a8f5]" />
                        <h3 className="text-sm font-bold text-slate-900">Campus Safety & Helpline</h3>
                      </div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-700 bg-white px-2.5 py-0.5 rounded-full border border-sky-200">
                        24/7 SUPPORT
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      All rides on HopOn are student-exclusive and require university email verification. In case of emergency or safety questions, reach campus security immediately.
                    </p>
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <a
                        href="tel:+918028465130"
                        className="px-3.5 py-2 rounded-xl bg-[#27a8f5] hover:bg-[#1f96de] text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Security: +91 80 2846 5130</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => showToast("Health Clinic", "Campus clinic located at Ground Floor, Main Block.", "info")}
                        className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold transition-colors cursor-pointer"
                      >
                        Health Clinic
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Column (4 cols): Wallet & Account Actions */}
                <div className="lg:col-span-4 space-y-6">
                  {/* HopOn Wallet Card */}
                  <div className="p-6 rounded-3xl bg-slate-950 text-white shadow-xl flex flex-col justify-between space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                        <Wallet className="w-4 h-4 text-[#27a8f5]" />
                        <span>HopOn Student Wallet</span>
                      </div>
                      <span className="text-[10px] font-bold bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded-full border border-sky-500/30">
                        Zero Fees
                      </span>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        CURRENT BALANCE
                      </p>
                      <p className="text-3xl font-black text-white mt-0.5">
                        ₹{user.walletBalance ?? 250}.00
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Usable for all campus rides and instant student payouts.
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveNav("payments")}
                        className="flex-1 py-2 px-3 rounded-xl bg-[#27a8f5] hover:bg-[#1f96de] text-white font-bold text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Money</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveNav("payments")}
                        className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors cursor-pointer"
                      >
                        History
                      </button>
                    </div>
                  </div>

                  {/* Account Actions Card */}
                  <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">
                      Account & Preferences
                    </h3>

                    <button
                      type="button"
                      onClick={() => showToast("Preferences Saved", "Your notification preferences are enabled.", "success")}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 text-left transition-colors text-xs font-semibold text-slate-700 cursor-pointer"
                    >
                      <span>Trip notifications</span>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        Active
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => showToast("Live Sharing", "Live trip sharing is enabled for safety contacts.", "info")}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 text-left transition-colors text-xs font-semibold text-slate-700 cursor-pointer"
                    >
                      <span>Live GPS safety sharing</span>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        Active
                      </span>
                    </button>

                    <div className="pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign out of HopOn</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                YOUR DASHBOARD
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight font-heading">
                Good morning, {user.name.split(" ")[0]}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                A better commute starts with a shared ride.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 shadow-2xs">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  {new Date().toLocaleDateString("en-US", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>

              <button
                type="button"
                onClick={onFindRide}
                className="px-4 py-2.5 rounded-xl bg-[#27a8f5] hover:bg-[#1f96de] active:scale-[0.98] text-white font-bold text-xs sm:text-sm shadow-md shadow-sky-500/25 transition-all cursor-pointer flex items-center gap-2 shrink-0"
              >
                <span>Find a ride</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Top 4 Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Rides Completed */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs relative">
              <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center absolute top-4 right-4">
                <Car className="w-4 h-4" />
              </div>
              <p className="text-xs font-semibold text-slate-500">Rides completed</p>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
                {user.ridesCompleted ?? 0}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Verified campus trips</p>
            </div>

            {/* Total Spent / Contributed */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs relative">
              <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center absolute top-4 right-4">
                <CreditCard className="w-4 h-4" />
              </div>
              <p className="text-xs font-semibold text-slate-500">Wallet balance</p>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
                ₹{user.walletBalance ?? 0}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">HopOn Student Balance</p>
            </div>

            {/* You Saved */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs relative">
              <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center absolute top-4 right-4">
                <Wallet className="w-4 h-4 text-[#27a8f5]" />
              </div>
              <p className="text-xs font-semibold text-slate-500">Estimated savings</p>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
                ₹{Math.round((user.ridesCompleted ?? 0) * 45)}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Compared with solo autos</p>
            </div>

            {/* CO2 Avoided */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs relative">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center absolute top-4 right-4">
                <span className="text-base">🌱</span>
              </div>
              <p className="text-xs font-semibold text-slate-500">CO₂ avoided</p>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
                {((user.ridesCompleted ?? 0) * 0.95).toFixed(1)} kg
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Campus carbon offset</p>
            </div>
          </div>

          {/* Row 2: Upcoming Ride (2 cols) & Riding Rhythm (1 col) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Upcoming Ride Card */}
            <div className="lg:col-span-8 p-5 sm:p-6 rounded-3xl bg-white border border-slate-200/90 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-slate-900">Upcoming ride</span>
                    {activeRide ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>{activeRide.status === "accepted" ? "Confirmed" : "Requested"}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                        <span>No Active Ride</span>
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    {activeRide ? "Live Session" : "Ready when you are"}
                  </span>
                </div>

                {activeRide ? (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mt-4 items-center">
                    {/* Left: Route details */}
                    <div className="md:col-span-7 space-y-3.5">
                      <div className="space-y-3 relative pl-6 border-l-2 border-slate-200 ml-2">
                        <div className="relative">
                          <div className="absolute -left-[31px] top-1 w-3 h-3 rounded-full border-2 border-slate-900 bg-white" />
                          <p className="text-xs font-bold text-slate-900">{activeRide.pickup}</p>
                          <p className="text-[11px] text-slate-500">Designated Student Pickup</p>
                        </div>

                        <div className="relative">
                          <div className="absolute -left-[31px] top-1 w-3 h-3 rounded-xs bg-slate-900" />
                          <p className="text-xs font-bold text-slate-900">{activeRide.dropoff}</p>
                          <p className="text-[11px] text-slate-500">Destination Dropoff</p>
                        </div>
                      </div>

                      {/* Driver snippet */}
                      <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center">
                            <Car className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900">{activeRide.driverName}</p>
                            <p className="text-[11px] text-slate-500">
                              {activeRide.vehicleModel} · {activeRide.vehicleNumber}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-extrabold text-slate-900">{activeRide.fare}</p>
                          <p className="text-[10px] text-slate-500">Agreed Fare</p>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={onViewRideDetails}
                          className="flex-1 py-2.5 px-4 rounded-xl bg-[#27a8f5] hover:bg-[#1f96de] text-white font-bold text-xs transition-colors cursor-pointer text-center"
                        >
                          View ride details
                        </button>
                      </div>
                    </div>

                    {/* Right: Route map graphic */}
                    <div className="md:col-span-5 h-44 rounded-2xl bg-slate-100 border border-slate-200/90 overflow-hidden relative flex flex-col justify-between p-3 select-none">
                      <div className="flex items-center justify-between text-[10px] font-bold z-10">
                        <span className="px-2 py-0.5 rounded-full bg-white/90 text-slate-800 shadow-2xs">
                          {activeRide.dropoff}
                        </span>
                      </div>

                      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 200 120" preserveAspectRatio="none">
                        <path
                          d="M 40 25 Q 110 50 160 95"
                          fill="none"
                          stroke="#ffffff"
                          strokeWidth="8"
                          strokeLinecap="round"
                        />
                        <path
                          d="M 40 25 Q 110 50 160 95"
                          fill="none"
                          stroke="#27a8f5"
                          strokeWidth="4"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 px-4 text-center space-y-3">
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-sky-50 text-[#27a8f5] flex items-center justify-center">
                      <Car className="w-6 h-6" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">No active campus rides right now</h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      Ready to head to class or back home? Match with verified classmates heading along the KJU commuter corridor.
                    </p>
                    <button
                      type="button"
                      onClick={onFindRide}
                      className="px-4 py-2 rounded-xl bg-[#27a8f5] hover:bg-[#1f96de] text-white text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      <span>Find or Offer a Ride</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Riding Rhythm (Weekly Chart) */}
            <div className="lg:col-span-4 p-5 sm:p-6 rounded-3xl bg-white border border-slate-200/90 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <span className="text-base font-bold text-slate-900">Your riding rhythm</span>
                  <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 cursor-pointer">
                    <span>Last 7 days</span>
                    <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                  </span>
                </div>

                <div className="mt-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-slate-900 tracking-tight">12</span>
                    <span className="text-xs font-semibold text-slate-500">shared rides</span>
                    <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[10px] font-bold">
                      <TrendingUp className="w-3 h-3" />
                      <span>3 vs. last week</span>
                    </span>
                  </div>

                  {/* Bar Chart Visualization */}
                  <div className="mt-6 flex items-end justify-between gap-2 h-28 pt-4">
                    {[
                      { day: "Wed", count: 1, height: "35%", isToday: false },
                      { day: "Thu", count: 2, height: "60%", isToday: false },
                      { day: "Fri", count: 1, height: "35%", isToday: false },
                      { day: "Sat", count: 3, height: "85%", isToday: false },
                      { day: "Sun", count: 2, height: "60%", isToday: false },
                      { day: "Mon", count: 1, height: "35%", isToday: false },
                      { day: "Tue", count: 2, height: "60%", isToday: true },
                    ].map((bar) => (
                      <div key={bar.day} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                        <span className="text-[10px] font-bold text-slate-400">{bar.count}</span>
                        <div
                          style={{ height: bar.height }}
                          className={`w-full rounded-md transition-all ${
                            bar.isToday ? "bg-[#27a8f5]" : "bg-sky-100/80 hover:bg-sky-200"
                          }`}
                        />
                        <span className={`text-[10px] font-semibold ${bar.isToday ? "text-slate-900 font-bold" : "text-slate-400"}`}>
                          {bar.day}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 mt-4 pt-3 border-t border-slate-100">
                28 Oct – 3 Nov · Every shared ride counts.
              </p>
            </div>
          </div>

          {/* Row 3: Recent Rides Table (8 cols) & Right Column (4 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Recent Rides Table */}
            <div className="lg:col-span-8 p-5 sm:p-6 rounded-3xl bg-white border border-slate-200/90 shadow-2xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-base font-bold text-slate-900">Recent rides</span>
                <button
                  type="button"
                  onClick={() => showToast("Activity", "Showing all past rides...", "info")}
                  className="text-xs font-semibold text-[#27a8f5] hover:text-sky-700 flex items-center gap-1 cursor-pointer"
                >
                  <span>View all rides</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="overflow-x-auto mt-2">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                      <th className="py-2.5 font-bold">ROUTE</th>
                      <th className="py-2.5 font-bold">DATE</th>
                      <th className="py-2.5 font-bold">DRIVER</th>
                      <th className="py-2.5 font-bold">FARE</th>
                      <th className="py-2.5 font-bold text-right">STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentTrips.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 font-semibold text-slate-900">
                          <div>{t.route}</div>
                          <div className="text-[10px] text-slate-400 font-normal">{t.subRoute}</div>
                        </td>
                        <td className="py-3 text-slate-600">{t.date}</td>
                        <td className="py-3 font-medium text-slate-800">{t.driver}</td>
                        <td className="py-3 font-bold text-slate-900">{t.fare}</td>
                        <td className="py-3 text-right">
                          <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                            {t.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Column: Saved Places + HopOn Wallet */}
            <div className="lg:col-span-4 space-y-4">
              {/* Saved Places */}
              <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-2xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                  <span className="text-sm font-bold text-slate-900">Saved places</span>
                  <button
                    type="button"
                    onClick={() => showToast("Saved Places", "Campus locations managed.", "info")}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Manage
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center">
                        <Building className="w-4 h-4 text-[#27a8f5]" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">Campus</p>
                        <p className="text-[11px] text-slate-500">Kristu Jayanti University · Main Gate</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                        <Briefcase className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">Work</p>
                        <p className="text-[11px] text-slate-500">Manyata Tech Park · Gate 5</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              </div>

              {/* HopOn Wallet Card */}
              <div
                className={`p-5 sm:p-6 rounded-3xl bg-slate-950 text-white shadow-xl flex flex-col justify-between transition-all ${
                  activeNav === "payments" ? "ring-4 ring-sky-400 ring-offset-2 ring-offset-slate-50" : ""
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <Wallet className="w-4 h-4 text-[#27a8f5]" />
                  <span>HopOn wallet</span>
                </div>

                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      AVAILABLE BALANCE
                    </p>
                    <p className="text-2xl sm:text-3xl font-extrabold text-white mt-0.5">
                      ₹{Number(user.walletBalance ?? 0).toFixed(2)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      showToast(
                        "Campus Cashier Desk",
                        "Visit the KJU Finance & Cashier desk with your roll number to deposit cash and top up your student wallet.",
                        "info"
                      )
                    }
                    className="px-3.5 py-2 rounded-xl bg-[#27a8f5] hover:bg-[#1f96de] active:scale-[0.98] text-white font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-md shadow-sky-500/20"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add money</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
        )}
      </main>
      </div>
    </div>
  );
}
