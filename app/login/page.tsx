"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Car,
  CheckCircle2,
  Navigation,
  Sparkles,
} from "lucide-react";
import LoginForm from "@/components/LoginForm";
import { syncSession } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    syncSession().then((user) => {
      if (!cancelled && user) {
        router.replace("/home");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="min-h-screen w-full flex flex-col lg:flex-row bg-slate-50 selection:bg-blue-100 selection:text-blue-900">
      {/* Left Section: Brand Showcase & Student Community Visual */}
      <section className="lg:w-1/2 bg-gradient-to-br from-blue-700 via-indigo-700 to-slate-900 text-white p-6 sm:p-10 lg:p-14 flex flex-col justify-between relative overflow-hidden">
        {/* Subtle decorative glowing mesh */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />

        {/* Top: Logo & Name */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-inner">
              <Car className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-2xl font-bold tracking-tight text-white font-heading">
                Hop<span className="text-blue-300">On</span>
              </span>
              <span className="ml-2 px-2 py-0.5 text-[10px] uppercase font-semibold tracking-wider bg-white/15 text-blue-100 rounded-full border border-white/20">
                Student Only
              </span>
            </div>
          </div>
        </div>

        {/* Middle: Brand Pitch & Modern Visual */}
        <div className="relative z-10 my-10 lg:my-0 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-blue-200 text-xs font-medium mb-6 backdrop-blur-xs">
            <Sparkles className="w-3.5 h-3.5 text-blue-300" />
            <span>Redefining Daily Student Commute</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight font-heading">
            Your campus. <br />
            Your ride. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-200 via-indigo-200 to-sky-200">
              Your community.
            </span>
          </h1>

          <p className="mt-4 text-base sm:text-lg text-blue-100/90 leading-relaxed max-w-md">
            Affordable and trusted rides, made exclusively for university students.
          </p>

          {/* Transportation / Commuter Visual Card */}
          <div className="mt-8 p-5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-white/15 text-xs text-blue-100">
              <span className="font-semibold flex items-center gap-1.5 text-white">
                <Navigation className="w-3.5 h-3.5 text-blue-300" /> Active Campus Route
              </span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[11px] font-medium">
                Live Matching
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-3 h-3 rounded-full bg-blue-300 mt-1 ring-4 ring-blue-400/20" />
                <div>
                  <p className="text-xs text-blue-200">Pickup</p>
                  <p className="text-sm font-semibold text-white">Kristu Jayanti University</p>
                </div>
              </div>
              <div className="ml-1.5 border-l-2 border-dashed border-white/30 h-4" />
              <div className="flex items-start gap-3">
                <div className="w-3 h-3 rounded-full bg-indigo-300 mt-1 ring-4 ring-indigo-400/20" />
                <div>
                  <p className="text-xs text-blue-200">Destination</p>
                  <p className="text-sm font-semibold text-white">Manyata Tech Park / Hennur</p>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-blue-300/20 flex items-center justify-center font-bold text-white text-xs border border-white/30">
                  AS
                </div>
                <div>
                  <p className="font-medium text-white">Arjun Sharma</p>
                  <p className="text-[11px] text-blue-200">BCA 3rd Year · ⭐ 4.9</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs text-blue-200">Fare:</span>{" "}
                <span className="text-sm font-bold text-emerald-300">₹50</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: 3 Trust Indicators */}
        <div className="relative z-10 pt-6 border-t border-white/15">
          <p className="text-xs uppercase tracking-wider text-blue-200 font-semibold mb-3">
            Why Students Choose HopOn
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-center gap-2 text-sm text-blue-50 bg-white/5 py-2 px-3 rounded-xl border border-white/10">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-medium">Verified Students</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-blue-50 bg-white/5 py-2 px-3 rounded-xl border border-white/10">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-medium">Affordable Rides</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-blue-50 bg-white/5 py-2 px-3 rounded-xl border border-white/10">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-medium">Student Community</span>
            </div>
          </div>
        </div>
      </section>

      {/* Right Section: Interactive Login Card */}
      <section className="lg:w-1/2 flex items-center justify-center p-6 sm:p-10 lg:p-16 bg-white min-h-[600px]">
        <div className="w-full max-w-md">
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
