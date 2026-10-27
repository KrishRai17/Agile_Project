"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  User as UserIcon,
  Car,
  Wallet,
  Settings,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { User, clearStoredUser } from "@/lib/auth";
import { useToast } from "@/components/ToastContext";

interface ProfileDropdownProps {
  user: User;
}

export default function ProfileDropdown({ user }: ProfileDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { showToast } = useToast();

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    clearStoredUser();
    showToast("Logged out", "You have been safely signed out.", "info");
    router.replace("/login");
  };

  const handleComingSoon = (featureName: string) => {
    setIsOpen(false);
    showToast(featureName, `${featureName} is coming soon in the next release.`, "info");
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="flex items-center gap-2.5 p-1.5 pr-3 rounded-full hover:bg-slate-100 border border-slate-200/80 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-semibold text-xs shadow-xs ring-2 ring-white">
          KR
        </div>
        <div className="hidden sm:block text-left">
          <p className="text-xs font-semibold text-slate-800 leading-tight">
            {user.name}
          </p>
          <p className="text-[10px] text-slate-500 flex items-center gap-0.5">
            <ShieldCheck className="w-2.5 h-2.5 text-emerald-600" />
            Verified
          </p>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white border border-slate-200 shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
          {/* User info banner inside dropdown */}
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-900">{user.name}</p>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
            <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-medium border border-emerald-200">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              <span>{user.university}</span>
            </div>
          </div>

          {/* Links */}
          <div className="py-1">
            <button
              onClick={() => handleComingSoon("My Profile")}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors text-left"
            >
              <UserIcon className="w-4 h-4 text-slate-400" />
              <span>My Profile</span>
            </button>
            <button
              onClick={() => handleComingSoon("My Rides")}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors text-left"
            >
              <Car className="w-4 h-4 text-slate-400" />
              <span>My Rides</span>
            </button>
            <button
              onClick={() => handleComingSoon("Wallet")}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <Wallet className="w-4 h-4 text-slate-400" />
                <span>Wallet</span>
              </div>
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">
                ₹150
              </span>
            </button>
            <button
              onClick={() => handleComingSoon("Settings")}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors text-left"
            >
              <Settings className="w-4 h-4 text-slate-400" />
              <span>Settings</span>
            </button>
          </div>

          {/* Logout */}
          <div className="pt-1 border-t border-slate-100">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors text-left"
            >
              <LogOut className="w-4 h-4 text-rose-500" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
