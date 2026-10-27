"use client";

import React from "react";
import { ShieldCheck, BadgePercent, Users, CheckCircle2 } from "lucide-react";
import { TRUST_PILLARS } from "@/lib/mockData";

export default function TrustSection() {
  const icons = {
    ShieldCheck,
    BadgePercent,
    Users,
  };

  return (
    <section className="py-8 sm:py-12">
      {/* Section Header */}
      <div className="text-center max-w-2xl mx-auto mb-10">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-xs font-semibold mb-3">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
          <span>Why HopOn</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-heading">
          Built for students. Built for trust.
        </h2>
        <p className="mt-3 text-sm sm:text-base text-slate-600">
          We’re solving campus commute hassles with student-verified safety and fair shared fares.
        </p>
      </div>

      {/* 3 Trust Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {TRUST_PILLARS.map((pillar) => {
          const Icon = icons[pillar.iconName];
          return (
            <div
              key={pillar.title}
              className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/80 shadow-sm hover:shadow-md hover:border-blue-200 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white mb-5 shadow-sm shadow-blue-500/20">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2 font-heading">
                  {pillar.title}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {pillar.description}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs font-semibold text-blue-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>{pillar.stats}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
