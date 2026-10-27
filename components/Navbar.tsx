"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Car,
  Bell,
  Menu,
  X,
  Search,
  PlusCircle,
  CalendarDays,
  Home as HomeIcon,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { User, clearStoredUser } from "@/lib/auth";
import ProfileDropdown from "@/components/ProfileDropdown";
import { useToast } from "@/components/ToastContext";
import { useRouter } from "next/navigation";

interface NavbarProps {
  user: User;
}

export default function Navbar({ user }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { showToast } = useToast();
  const router = useRouter();

  const handleNavClick = (label: string) => {
    if (label === "Home") {
      setMobileMenuOpen(false);
      return;
    }
    setMobileMenuOpen(false);
    showToast(label, `${label} feature is coming soon in the next update.`, "info");
  };

  const handleNotificationClick = () => {
    showToast(
      "Notifications",
      "Ride updates and match alerts will appear here. No new alerts.",
      "info"
    );
  };

  const handleMobileLogout = () => {
    clearStoredUser();
    showToast("Logged Out", "You have been safely signed out.", "info");
    router.replace("/login");
  };

  const navLinks = [
    { label: "Home", icon: HomeIcon, active: true },
    { label: "Find a Ride", icon: Search, active: false },
    { label: "Offer a Ride", icon: PlusCircle, active: false },
    { label: "My Rides", icon: CalendarDays, active: false },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-white/90 backdrop-blur-md border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: Brand Logo */}
          <div className="flex items-center gap-8">
            <a
              href="/home"
              className="flex items-center gap-2.5 group focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
                <Car className="w-5 h-5 text-white" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-bold tracking-tight text-slate-900 font-heading">
                  Hop<span className="text-blue-600">On</span>
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider bg-blue-50 text-blue-700 rounded-full border border-blue-200/60">
                  Campus
                </span>
              </div>
            </a>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <button
                  key={link.label}
                  type="button"
                  onClick={() => handleNavClick(link.label)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    link.active
                      ? "bg-blue-50 text-blue-700 font-bold"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  {link.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Right: Notifications & Profile Dropdown */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Notification Bell */}
            <button
              type="button"
              onClick={handleNotificationClick}
              aria-label="View notifications"
              className="relative p-2 rounded-full text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-600 ring-2 ring-white" />
            </button>

            {/* Desktop Profile Dropdown */}
            <div className="hidden sm:block">
              <ProfileDropdown user={user} />
            </div>

            {/* Mobile Hamburger Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-6 space-y-3 shadow-xl animate-in slide-in-from-top-2 duration-200">
          {/* User Preview */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/60">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
              KR
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">
                {user.name}
              </p>
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                <span>{user.university}</span>
              </p>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="space-y-1 pt-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              return (
                <button
                  key={link.label}
                  type="button"
                  onClick={() => handleNavClick(link.label)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
                    link.active
                      ? "bg-blue-50 text-blue-700 font-bold"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="w-4 h-4 text-blue-600" />
                  <span>{link.label}</span>
                </button>
              );
            })}
          </div>

          {/* Extra Mobile Actions */}
          <div className="pt-2 border-t border-slate-100 space-y-1">
            <button
              onClick={() => handleNavClick("Wallet")}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-xl"
            >
              <span>Wallet Balance</span>
              <span className="font-semibold text-blue-600">₹150</span>
            </button>
            <button
              onClick={() => handleNavClick("Settings")}
              className="w-full flex items-center px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-xl"
            >
              Settings
            </button>
            <button
              onClick={handleMobileLogout}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
            >
              <LogOut className="w-4 h-4 text-rose-500" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
