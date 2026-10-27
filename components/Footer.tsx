"use client";

import React from "react";
import { Car, ShieldCheck, Heart } from "lucide-react";
import { useToast } from "@/components/ToastContext";

export default function Footer() {
  const { showToast } = useToast();

  const handleLinkClick = (name: string) => {
    showToast(name, `${name} documentation will be published before campus launch.`, "info");
  };

  return (
    <footer className="mt-16 border-t border-slate-200/80 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Brand */}
          <div className="flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white">
                <Car className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-bold text-slate-900 font-heading">
                Hop<span className="text-blue-600">On</span>
              </span>
            </div>
            <span className="hidden sm:inline text-slate-300">|</span>
            <p className="text-xs text-slate-500">
              Your campus. Your ride. Your community.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap justify-center gap-6 text-xs text-slate-600">
            <button
              onClick={() => handleLinkClick("Safety Guidelines")}
              className="hover:text-blue-600 transition-colors"
            >
              Safety Guidelines
            </button>
            <button
              onClick={() => handleLinkClick("Student Verification")}
              className="hover:text-blue-600 transition-colors"
            >
              ID Verification
            </button>
            <button
              onClick={() => handleLinkClick("Terms of Service")}
              className="hover:text-blue-600 transition-colors"
            >
              Terms of Service
            </button>
            <button
              onClick={() => handleLinkClick("Privacy Policy")}
              className="hover:text-blue-600 transition-colors"
            >
              Privacy Policy
            </button>
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-3">
          <p>© {new Date().getFullYear()} HopOn Technologies. Student-only ride-sharing.</p>
          <div className="flex items-center gap-1.5 text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Kristu Jayanti University Campus Pilot</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
