"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Car,
  PlusCircle,
  CalendarDays,
  FileText,
  ChevronDown,
  LogOut,
  Wallet,
  ShieldCheck,
  HelpCircle,
  Bell,
  User as UserIcon,
} from "lucide-react";
import { User, logout } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastContext";

interface HopOnNavbarProps {
  user: User;
  activeTab: "find" | "offer" | "my-rides" | "wallet" | "profile";
  onTabChange: (tab: "find" | "offer" | "my-rides" | "wallet" | "profile") => void;
  onOpenActivity: () => void;
  onOpenProfile?: () => void;
  pendingRequestCount?: number;
}

export default function HopOnNavbar({
  user,
  activeTab,
  onTabChange,
  onOpenActivity,
  onOpenProfile,
  pendingRequestCount = 0,
}: HopOnNavbarProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { showToast } = useToast();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    // Ends the server session (clears the httpOnly cookie) and the local cache
    await logout();
    showToast("Logged out", "You have signed out successfully.", "info");
    router.replace("/login");
  };

  const hasVehicle = Boolean(user.vehicleModel || user.vehicleNumber);
  const canOfferRide = hasVehicle || user.role === "driver" || user.role === "both";
  const isDriver = canOfferRide;

  const navTabs = [
    { id: "find" as const, label: "Find a ride", icon: Car, driverOnly: false },
    { id: "my-rides" as const, label: "My rides", icon: CalendarDays, driverOnly: false },
    { id: "wallet" as const, label: "Wallet", icon: Wallet, driverOnly: false },
    ...(canOfferRide ? [{ id: "offer" as const, label: "Offer a ride", icon: PlusCircle, driverOnly: true }] : []),
  ];

  return (
    <header className="w-full bg-white border-b border-slate-200/80 z-30 sticky top-0 shadow-xs">
      <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: Brand Logo & Navigation Tabs */}
          <div className="flex items-center gap-6 sm:gap-10">
            {/* HopOn Logo */}
            <Link
              href="/home"
              className="flex items-center gap-2.5 group focus:outline-none"
            >
              <div className="w-8 h-8 rounded-lg bg-[#27a8f5] flex items-center justify-center text-white shadow-sm transition-transform group-hover:scale-105">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-4 h-4 text-white"
                >
                  <line x1="7" y1="17" x2="17" y2="7" />
                  <polyline points="7 7 17 7 17 17" />
                </svg>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight text-slate-900 font-heading">
                  HopOn
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] uppercase font-bold tracking-wider bg-sky-50 text-sky-600 rounded-full border border-sky-100">
                  <ShieldCheck className="w-3 h-3 text-sky-500" />
                  CAMPUS VERIFIED
                </span>
              </div>
            </Link>

            {/* Middle Nav Tabs */}
            <nav className="flex items-center gap-1 sm:gap-2 h-16">
              {navTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onTabChange(tab.id)}
                    className={`relative flex items-center gap-2 px-3 sm:px-4 h-16 text-sm font-semibold transition-colors cursor-pointer select-none ${
                      isActive
                        ? "text-slate-900 font-bold"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 sm:w-4.5 sm:h-4.5 ${
                        isActive ? "text-slate-900" : "text-slate-500"
                      }`}
                    />
                    <span>{tab.label}</span>
                    {/* Active Underline Indicator matching UI */}
                    {isActive && (
                      <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#27a8f5] rounded-t-sm" />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Right: Activity button, Notification & Profile */}
          <div className="flex items-center gap-2.5">
            {/* Activity Button */}
            <button
              type="button"
              onClick={onOpenActivity}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200/80 text-xs sm:text-sm font-semibold text-slate-700 transition-colors cursor-pointer active:scale-95"
            >
              <FileText className="w-4 h-4 text-slate-600" />
              <span>Activity</span>
            </button>

            {/* Notification Bell */}
            <button
              type="button"
              onClick={() => onTabChange(isDriver ? "offer" : "my-rides")}
              className="relative flex items-center justify-center w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200/80 text-slate-700 transition-colors cursor-pointer"
              title="Notifications"
            >
              <Bell className="w-4 h-4 text-slate-700" />
              {isDriver && pendingRequestCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#27a8f5] text-white text-[9px] font-black flex items-center justify-center shadow-xs">
                  {pendingRequestCount}
                </span>
              )}
            </button>

            {/* Profile Avatar Button */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 p-1.5 px-3 rounded-full hover:bg-slate-100 border border-slate-200 transition-all cursor-pointer"
                aria-label="User Profile"
              >
                <div className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-[10px] tracking-tight">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-semibold text-slate-800">
                  {user.name.split(" ")[0]}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              </button>

              {/* Profile Dropdown Menu */}
              {profileOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 py-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                  {/* User Overview */}
                  <div className="px-4 py-2 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                        {user.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{user.name}</p>
                        <p className="text-xs text-slate-500 truncate">{user.email}</p>
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-blue-700 font-medium bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                      <span>{user.university}</span>
                    </div>
                    <div className={`mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isDriver
                        ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                        : "bg-slate-100 text-slate-600 border border-slate-200"
                    }`}>
                      {isDriver ? "🚗 Student Driver" : "🎒 Student Rider"}
                    </div>
                  </div>

                  {/* Wallet Balance */}
                  <div className="px-4 py-2.5 flex items-center justify-between border-b border-slate-100 hover:bg-slate-50 cursor-pointer">
                    <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-700">
                      <Wallet className="w-4 h-4 text-blue-600" />
                      <span>Student Wallet</span>
                    </div>
                    <span className="text-xs font-bold text-blue-600">₹150.00</span>
                  </div>

                  {/* Actions */}
                  <div className="py-1">
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        onOpenActivity();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 text-left transition-colors"
                    >
                      <FileText className="w-4 h-4 text-slate-400" />
                      <span>My Campus Trips</span>
                    </button>
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        if (onOpenProfile) {
                          onOpenProfile();
                        } else {
                          onTabChange("profile");
                        }
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-sky-50 hover:text-[#0284c7] text-left transition-colors cursor-pointer"
                    >
                      <UserIcon className="w-4 h-4 text-slate-400" />
                      <span>Profile</span>
                    </button>
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        showToast("Campus Safety", "Campus security hotline: +91 80 2846 5130", "info");
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 text-left transition-colors"
                    >
                      <HelpCircle className="w-4 h-4 text-slate-400" />
                      <span>Campus Safety Helpline</span>
                    </button>
                  </div>

                  {/* Logout */}
                  <div className="pt-1 border-t border-slate-100">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 text-left transition-colors"
                    >
                      <LogOut className="w-4 h-4 text-rose-500" />
                      <span>Sign out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
