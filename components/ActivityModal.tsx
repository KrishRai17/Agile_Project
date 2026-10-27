"use client";

import React from "react";
import { X, Clock, MapPin, Receipt, ArrowRight, CheckCircle2 } from "lucide-react";
import { PAST_ACTIVITIES } from "@/lib/mapData";

interface ActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ActivityModal({ isOpen, onClose }: ActivityModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-700">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-neutral-900 leading-tight">Your Activity</h2>
              <p className="text-xs text-slate-500">Past trips & upcoming scheduled rides</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Trips List */}
        <div className="p-6 max-h-[460px] overflow-y-auto space-y-4">
          {PAST_ACTIVITIES.map((trip) => (
            <div
              key={trip.id}
              className="p-4 rounded-2xl border border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/60 transition-all flex flex-col gap-2.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-bold">
                    {trip.vehicle}
                  </span>
                  <span>{trip.date} · {trip.time}</span>
                </div>
                <div className="text-sm font-bold text-slate-900">{trip.amount}</div>
              </div>

              <div className="space-y-1.5 text-xs text-slate-600 pl-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-black shrink-0" />
                  <span className="truncate">{trip.from}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-black shrink-0" />
                  <span className="truncate">{trip.to}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {trip.status}
                </span>
                <span className="text-blue-600 font-medium hover:underline cursor-pointer">
                  View receipt →
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-500">
            Need help with a past trip? Visit Help or contact support.
          </p>
        </div>
      </div>
    </div>
  );
}
