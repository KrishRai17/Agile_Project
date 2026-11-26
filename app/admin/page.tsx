"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Users,
  Car,
  Star,
  RefreshCw,
  LogOut,
  Search,
  CheckCircle2,
  XCircle,
  Trash2,
  MapPin,
  ArrowRight,
  Clock,
  Activity,
  MessageSquare,
  AlertCircle,
} from "lucide-react";
import { isAdminUser, logout, syncSession, User } from "@/lib/auth";
import { useToast } from "@/components/ToastContext";

interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  university: string;
  studentIdVerified: boolean;
  studentRollNumber: string | null;
  walletBalance: number;
  rating: number;
  ridesCompleted: number;
  role: "passenger" | "driver" | "both";
  vehicleModel: string | null;
  vehicleNumber: string | null;
  vehicleType: string | null;
  upiId: string | null;
  hasQrImage: boolean;
  isAdmin: boolean;
  createdAt: number;
}

interface AdminOfferRow {
  id: string;
  driverId: string;
  driverName: string;
  vehicleModel: string;
  vehicleNumber: string;
  vehicleType: string;
  origin: string;
  destination: string;
  departureTime: string;
  seats: number;
  seatsLeft: number;
  farePerSeat: string;
  status: string;
  createdAt: number;
}

interface AdminRequestRow {
  id: string;
  offerId: string | null;
  passengerId: string;
  passengerName: string;
  passengerRating: number;
  pickup: string;
  dropoff: string;
  status: string;
  agreedFare: string | null;
  tripStage: string | null;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: number;
  completedAt: number | null;
}

interface AdminRatingRow {
  id: string;
  requestId: string;
  raterId: string;
  raterName: string;
  targetUserId: string;
  targetName: string;
  stars: number;
  tags: string[];
  comment: string | null;
  createdAt: number;
}

interface AdminOverviewData {
  stats: {
    totalUsers: number;
    verifiedUsers: number;
    pendingVerificationUsers: number;
    driversCount: number;
    passengersCount: number;
    activeOffersCount: number;
    totalOffersCount: number;
    pendingRequestsCount: number;
    acceptedRequestsCount: number;
    completedRidesCount: number;
    cancelledRidesCount: number;
    totalRatingsCount: number;
    averagePlatformRating: number;
  };
  users: AdminUserRow[];
  offers: AdminOfferRow[];
  requests: AdminRequestRow[];
  ratings: AdminRatingRow[];
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "users" | "rides" | "ratings">("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "passenger" | "driver" | "both">("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchOverview = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch("/api/admin/overview", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (res.status === 403) {
        router.replace("/home");
        return;
      }
      if (res.ok) {
        const json = (await res.json()) as AdminOverviewData;
        setData(json);
      }
    } catch {
      // silent background poll error
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    syncSession().then((sessionUser) => {
      if (cancelled) return;
      if (!sessionUser) {
        router.replace("/login");
        return;
      }
      if (!isAdminUser(sessionUser)) {
        router.replace("/home");
        return;
      }
      setAdminUser(sessionUser);
      void fetchOverview();
    });
    const interval = setInterval(() => void fetchOverview(), 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [router, fetchOverview]);

  const handleAdminAction = async (payload: Record<string, string>, successMsg: string) => {
    const targetKey = payload.userId || payload.offerId || payload.requestId || "action";
    setBusyId(targetKey);
    try {
      const res = await fetch("/api/admin/overview", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast("Action Failed", json.error || "Could not complete action.", "error");
        return;
      }
      showToast("Admin Updated", successMsg, "success");
      await fetchOverview();
    } catch {
      showToast("Network Error", "Could not reach server.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleSignOut = async () => {
    await logout();
    showToast("Signed Out", "Logged out of HopOn Admin Console.", "info");
    router.push("/login");
  };

  const filteredUsers = (data?.users || []).filter((u) => {
    if (u.isAdmin) return false;
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.studentRollNumber || "").toLowerCase().includes(q) ||
      (u.vehicleNumber || "").toLowerCase().includes(q)
    );
  });

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 shadow-xl border border-slate-200/80 flex flex-col items-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-sky-50 text-[#0284c7] flex items-center justify-center animate-pulse">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-slate-900">Loading HopOn Admin Console…</p>
          <p className="text-xs text-slate-500">Kristu Jayanti University Campus Mobility</p>
        </div>
      </div>
    );
  }

  const stats = data?.stats;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Admin Navbar */}
      <header className="sticky top-0 z-30 bg-slate-900 text-white border-b border-slate-800 px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#27a8f5] flex items-center justify-center text-white shadow-md shadow-sky-500/20">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black tracking-tight font-heading">
                Hop<span className="text-[#27a8f5]">On</span> Admin
              </span>
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30">
                KJU Control Center
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Signed in as {adminUser?.email || "admin@kristujayanti.com"}
            </p>
          </div>
        </div>

        {/* Navigation Pills */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-800/90 p-1 rounded-xl border border-slate-700/70">
          {(
            [
              { id: "overview", label: "Overview", icon: Activity },
              { id: "users", label: `Students & Riders (${stats?.totalUsers ?? 0})`, icon: Users },
              { id: "rides", label: `Rides & Offers (${(stats?.activeOffersCount ?? 0) + (stats?.acceptedRequestsCount ?? 0)})`, icon: Car },
              { id: "ratings", label: `Feedback (${stats?.totalRatingsCount ?? 0})`, icon: Star },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? "bg-[#27a8f5] text-white shadow-xs"
                    : "text-slate-300 hover:text-white hover:bg-slate-700/60"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void fetchOverview(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-sky-400" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      {/* Mobile Tab Bar */}
      <div className="md:hidden flex items-center gap-1.5 overflow-x-auto bg-white border-b border-slate-200 px-4 py-2">
        {(
          [
            { id: "overview", label: "Overview" },
            { id: "users", label: "Users" },
            { id: "rides", label: "Rides" },
            { id: "ratings", label: "Feedback" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 cursor-pointer ${
              activeTab === tab.id ? "bg-[#27a8f5] text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-2xs flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Campus Accounts
              </p>
              <p className="text-3xl font-black text-slate-900 mt-1">
                {stats?.totalUsers ?? 0}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                <span className="font-bold text-emerald-600">{stats?.verifiedUsers ?? 0} verified</span>
                {" · "}
                <span>{stats?.driversCount ?? 0} riders</span>
                {" · "}
                <span>{stats?.passengersCount ?? 0} passengers</span>
              </p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-sky-50 text-[#0284c7] flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-2xs flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Live Offers & Active Trips
              </p>
              <p className="text-3xl font-black text-slate-900 mt-1">
                {(stats?.activeOffersCount ?? 0) + (stats?.acceptedRequestsCount ?? 0)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                <span className="font-bold text-sky-600">{stats?.activeOffersCount ?? 0} active offers</span>
                {" · "}
                <span className="font-bold text-indigo-600">{stats?.acceptedRequestsCount ?? 0} in-ride</span>
                {" · "}
                <span>{stats?.pendingRequestsCount ?? 0} pending</span>
              </p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Car className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-2xs flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Completed Campus Trips
              </p>
              <p className="text-3xl font-black text-emerald-600 mt-1">
                {stats?.completedRidesCount ?? 0}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                <span>{stats?.cancelledRidesCount ?? 0} cancelled</span>
                {" · "}
                <span>{stats?.totalOffersCount ?? 0} total offers posted</span>
              </p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-2xs flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Campus Trust & Rating
              </p>
              <p className="text-3xl font-black text-amber-500 mt-1 flex items-center gap-1">
                <span>★</span>
                <span>{stats?.averagePlatformRating ?? 5.0}</span>
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Based on <span className="font-bold text-slate-700">{stats?.totalRatingsCount ?? 0}</span> post-ride reviews
              </p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center">
              <Star className="w-5 h-5 fill-amber-400" />
            </div>
          </div>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 7 Cols: Recent Ride Requests */}
            <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Recent Campus Ride Requests</h2>
                  <p className="text-xs text-slate-500">Real-time passenger requests and trip statuses</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("rides")}
                  className="text-xs font-bold text-[#0284c7] hover:underline cursor-pointer"
                >
                  View all →
                </button>
              </div>

              <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
                {(data?.requests || []).length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No ride requests recorded yet.
                  </div>
                ) : (
                  (data?.requests || []).slice(0, 12).map((r) => (
                    <div key={r.id} className="p-4 hover:bg-slate-50/80 flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-extrabold text-slate-900">{r.passengerName}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              r.status === "completed"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : r.status === "accepted"
                                ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                : r.status === "pending"
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {r.status}
                          </span>
                          <span className="text-[11px] font-bold text-slate-700">
                            ₹{String(r.agreedFare || "35").replace(/^₹\s*/, "")} ({r.paymentMethod.toUpperCase()} · {r.paymentStatus})
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 truncate">
                          <MapPin className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                          <span className="truncate">{r.pickup}</span>
                          <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{r.dropoff}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(r.createdAt).toLocaleString()}</span>
                        </p>
                      </div>

                      {(r.status === "pending" || r.status === "accepted") && (
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() =>
                            void handleAdminAction(
                              { action: "cancel_request", requestId: r.id },
                              `Cancelled request ${r.id}.`
                            )
                          }
                          className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold shrink-0 cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right 5 Cols: Latest Ratings & Feedback */}
            <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Student Feedback & Ratings</h2>
                  <p className="text-xs text-slate-500">Latest post-ride reviews from passengers and riders</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("ratings")}
                  className="text-xs font-bold text-[#0284c7] hover:underline cursor-pointer"
                >
                  All reviews →
                </button>
              </div>

              <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
                {(data?.ratings || []).length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No post-ride ratings submitted yet.
                  </div>
                ) : (
                  (data?.ratings || []).slice(0, 10).map((rev) => (
                    <div key={rev.id} className="p-4 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-slate-900">
                          <span>{rev.raterName}</span>
                          <span className="text-slate-400 font-normal mx-1.5">rated</span>
                          <span className="text-[#0284c7]">{rev.targetName}</span>
                        </div>
                        <div className="flex items-center gap-0.5 text-amber-500 text-xs font-black">
                          {"★".repeat(rev.stars)}
                          <span className="text-slate-300">{"★".repeat(Math.max(0, 5 - rev.stars))}</span>
                        </div>
                      </div>
                      {rev.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {rev.tags.map((t) => (
                            <span
                              key={t}
                              className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      {rev.comment && (
                        <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 italic">
                          &ldquo;{rev.comment}&rdquo;
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400">
                        {new Date(rev.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: STUDENTS & RIDERS DIRECTORY */}
        {activeTab === "users" && (
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Students & Riders Directory</h2>
                <p className="text-xs text-slate-500">
                  Manage campus verification, vehicles, UPI QR status, and student accounts
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search name, email, roll, vehicle…"
                    className="pl-9 pr-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:bg-white focus:border-[#27a8f5] w-60"
                  />
                </div>

                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                  {(["all", "passenger", "driver", "both"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRoleFilter(r)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize cursor-pointer ${
                        roleFilter === r ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/60">
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Role & Roll No</th>
                    <th className="py-3 px-4">Vehicle</th>
                    <th className="py-3 px-4">UPI / QR Setup</th>
                    <th className="py-3 px-4">Performance</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No matching student accounts found.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/70">
                        <td className="py-3.5 px-4">
                          <p className="font-bold text-slate-900">{u.name}</p>
                          <p className="text-[11px] text-slate-500">{u.email}</p>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              u.role === "driver" || u.role === "both"
                                ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {u.role === "both" ? "Rider & Passenger" : u.role === "driver" ? "Rider" : "Passenger"}
                          </span>
                          {u.studentRollNumber && (
                            <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                              {u.studentRollNumber}
                            </p>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          {u.vehicleType || u.vehicleModel ? (
                            <div>
                              <p className="font-semibold text-slate-800">
                                {u.vehicleType || "Vehicle"} · {u.vehicleModel || "Campus"}
                              </p>
                              <p className="text-[11px] font-mono text-slate-500">
                                {u.vehicleNumber || "—"}
                              </p>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          {u.upiId || u.hasQrImage ? (
                            <div className="space-y-0.5">
                              {u.upiId && (
                                <p className="font-mono text-[11px] text-slate-700">{u.upiId}</p>
                              )}
                              {u.hasQrImage && (
                                <span className="inline-block px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-bold">
                                  Custom QR Uploaded ✓
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">Not configured</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-bold text-slate-900">
                            ⭐ {u.rating} <span className="text-slate-400 font-normal">({u.ridesCompleted} rides)</span>
                          </p>
                        </td>
                        <td className="py-3.5 px-4">
                          {u.studentIdVerified ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                              <CheckCircle2 className="w-3 h-3" /> Verified
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
                              <AlertCircle className="w-3 h-3" /> Unverified
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {u.studentIdVerified ? (
                              <button
                                type="button"
                                disabled={busyId === u.id}
                                onClick={() =>
                                  void handleAdminAction(
                                    { action: "unverify_user", userId: u.id },
                                    `Marked ${u.name} as unverified.`
                                  )
                                }
                                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold cursor-pointer"
                              >
                                Revoke
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busyId === u.id}
                                onClick={() =>
                                  void handleAdminAction(
                                    { action: "verify_user", userId: u.id },
                                    `Verified ${u.name}.`
                                  )
                                }
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer"
                              >
                                Verify
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busyId === u.id}
                              onClick={() => {
                                if (!window.confirm(`Delete student account ${u.name} (${u.email})?`)) return;
                                void handleAdminAction(
                                  { action: "delete_user", userId: u.id },
                                  `Deleted user ${u.name}.`
                                );
                              }}
                              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 cursor-pointer"
                              title="Delete account"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: RIDES & OFFERS */}
        {activeTab === "rides" && (
          <div className="space-y-6">
            {/* Active & Recent Driver Ride Offers */}
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <h2 className="text-base font-bold text-slate-900">Posted Rider Offers</h2>
                <p className="text-xs text-slate-500">All campus bike, scooter, and car offers posted by verified riders</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/60">
                      <th className="py-3 px-4">Rider</th>
                      <th className="py-3 px-4">Vehicle</th>
                      <th className="py-3 px-4">Route</th>
                      <th className="py-3 px-4">Seats & Fare</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {(data?.offers || []).map((o) => (
                      <tr key={o.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-bold text-slate-900">{o.driverName}</td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-slate-800">{o.vehicleType} · {o.vehicleModel}</span>
                          <p className="text-[11px] font-mono text-slate-500">{o.vehicleNumber}</p>
                        </td>
                        <td className="py-3 px-4 max-w-xs truncate">
                          <span className="font-medium text-slate-800">{o.origin}</span>
                          <span className="mx-1.5 text-slate-400">→</span>
                          <span className="font-medium text-slate-800">{o.destination}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-slate-900">
                            ₹{String(o.farePerSeat).replace(/^₹\s*/, "")}
                          </span>
                          <span className="text-slate-500 ml-1.5">
                            ({o.seatsLeft}/{o.seats} seats left)
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              o.status === "active"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {o.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {o.status === "active" && (
                            <button
                              type="button"
                              disabled={busyId === o.id}
                              onClick={() =>
                                void handleAdminAction(
                                  { action: "cancel_offer", offerId: o.id },
                                  `Cancelled offer ${o.id}.`
                                )
                              }
                              className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold cursor-pointer"
                            >
                              Cancel Offer
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* All Ride Requests */}
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <h2 className="text-base font-bold text-slate-900">All Student Ride Requests</h2>
                <p className="text-xs text-slate-500">Complete log of pending, active, completed, and cancelled requests</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/60">
                      <th className="py-3 px-4">Passenger</th>
                      <th className="py-3 px-4">Pickup → Dropoff</th>
                      <th className="py-3 px-4">Fare & Payment</th>
                      <th className="py-3 px-4">Stage / Status</th>
                      <th className="py-3 px-4">Requested At</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {(data?.requests || []).map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-bold text-slate-900">{r.passengerName}</td>
                        <td className="py-3 px-4 max-w-sm truncate">
                          <span className="text-slate-800">{r.pickup}</span>
                          <span className="mx-1.5 text-slate-400">→</span>
                          <span className="text-slate-800">{r.dropoff}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-slate-900">
                            ₹{String(r.agreedFare || "35").replace(/^₹\s*/, "")}
                          </span>
                          <span className="ml-1.5 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                            {r.paymentMethod} · {r.paymentStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              r.status === "completed"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : r.status === "accepted"
                                ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                : r.status === "pending"
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {r.status}
                          </span>
                          {r.tripStage && (
                            <span className="ml-1.5 text-[11px] text-slate-500">({r.tripStage})</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {new Date(r.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {(r.status === "pending" || r.status === "accepted") && (
                            <button
                              type="button"
                              disabled={busyId === r.id}
                              onClick={() =>
                                void handleAdminAction(
                                  { action: "cancel_request", requestId: r.id },
                                  `Cancelled request ${r.id}.`
                                )
                              }
                              className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold cursor-pointer"
                            >
                              <XCircle className="w-3.5 h-3.5 inline mr-1" />
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: FEEDBACK & RATINGS */}
        {activeTab === "ratings" && (
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Campus Ride Ratings & Written Feedback</h2>
                <p className="text-xs text-slate-500">
                  All reviews submitted by passengers and riders after trip completion
                </p>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{(data?.ratings || []).length} total reviews</span>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {(data?.ratings || []).length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-400">
                  No ride ratings have been submitted yet.
                </div>
              ) : (
                (data?.ratings || []).map((rev) => (
                  <div key={rev.id} className="p-5 hover:bg-slate-50/70 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-extrabold text-slate-900">{rev.raterName}</span>
                        <span className="text-slate-400">reviewed</span>
                        <span className="font-extrabold text-[#0284c7]">{rev.targetName}</span>
                        <span className="text-[11px] font-mono text-slate-400">
                          (Ride #{rev.requestId.slice(-6)})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-amber-500">
                          {"★".repeat(rev.stars)}
                          <span className="text-slate-200">
                            {"★".repeat(Math.max(0, 5 - rev.stars))}
                          </span>
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {new Date(rev.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {rev.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {rev.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200 text-[10px] font-bold"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {rev.comment && (
                      <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                        &ldquo;{rev.comment}&rdquo;
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
