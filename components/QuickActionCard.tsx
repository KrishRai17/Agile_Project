"use client";

import React from "react";
import { Search, Car, Calendar, ArrowRight, LucideIcon } from "lucide-react";
import { QuickActionItem } from "@/lib/mockData";
import { useToast } from "@/components/ToastContext";

const iconMap: Record<QuickActionItem["iconName"], LucideIcon> = {
  Search,
  Car,
  Calendar,
};

interface QuickActionCardProps {
  action: QuickActionItem;
}

export default function QuickActionCard({ action }: QuickActionCardProps) {
  const { showToast } = useToast();
  const Icon = iconMap[action.iconName];

  const handleClick = () => {
    showToast(
      action.title,
      `${action.title} is coming soon in the next release.`,
      "info"
    );
  };

  return (
    <div className="group relative bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm hover:shadow-xl hover:shadow-slate-200/60 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
      <div>
        {/* Top bar with icon and optional badge */}
        <div className="flex items-center justify-between mb-5">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 group-hover:bg-blue-600 text-blue-600 group-hover:text-white flex items-center justify-center transition-colors duration-300 shadow-xs">
            <Icon className="w-6 h-6 transition-transform group-hover:scale-110 duration-200" />
          </div>
          {action.badge && (
            <span className="px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase rounded-full bg-blue-50 text-blue-700 border border-blue-200/60">
              {action.badge}
            </span>
          )}
        </div>

        {/* Title and Description */}
        <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors font-heading">
          {action.title}
        </h3>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          {action.description}
        </p>
      </div>

      {/* Action Button */}
      <div className="mt-6 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={handleClick}
          className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs uppercase tracking-wider bg-slate-50 hover:bg-blue-600 text-slate-700 hover:text-white border border-slate-200 hover:border-blue-600 flex items-center justify-center gap-2 transition-all duration-200 group-hover:shadow-md group-hover:shadow-blue-500/20 active:scale-[0.99]"
        >
          <span>{action.actionText}</span>
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </div>
  );
}
