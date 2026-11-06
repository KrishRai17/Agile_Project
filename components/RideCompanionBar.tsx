"use client";

import React, { useEffect, useState } from "react";
import {
  MessageSquare,
  Share2,
  ShieldAlert,
  QrCode,
  Send,
  Wallet,
  CheckCircle2,
  X,
  PhoneCall,
} from "lucide-react";
import type { RideMessage } from "@/lib/rideStore";
import { useToast } from "@/components/ToastContext";
import { playNotificationChime } from "@/lib/notifications";

interface RideCompanionBarProps {
  requestId: string;
  userRole: "passenger" | "driver" | "both";
  userId: string;
  counterpartyName: string;
  fare?: string;
}

const PASSENGER_QUICK_REPLIES = [
  "I'm at Gate 1",
  "Be there in 2 mins",
  "Wearing a blue backpack",
  "Waiting near security cabin",
];

const DRIVER_QUICK_REPLIES = [
  "On my way!",
  "Reached pickup gate",
  "Stuck at signal, 2 mins",
  "Hazard lights are on",
];

export default function RideCompanionBar({
  requestId,
  userRole,
  userId,
  counterpartyName,
  fare = "50",
}: RideCompanionBarProps) {
  const { showToast } = useToast();
  const [activeDrawer, setActiveDrawer] = useState<"chat" | "pay" | "sos" | null>(null);
  const [messages, setMessages] = useState<RideMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const numericFare = Math.max(10, Number(String(fare).replace(/[^\d.]/g, "")) || 50);

  useEffect(() => {
    if (!requestId) return;
    let cancelled = false;
    async function loadMessages() {
      try {
        const res = await fetch(`/api/rides/messages?requestId=${encodeURIComponent(requestId)}`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.messages)) {
          setMessages((prev) => {
            if (
              data.messages.length > prev.length &&
              prev.length > 0 &&
              data.messages[data.messages.length - 1]?.senderId !== userId
            ) {
              playNotificationChime("info");
            }
            return data.messages;
          });
        }
      } catch {
        // silent
      }
    }
    void loadMessages();
    const interval = setInterval(loadMessages, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [requestId, userId]);

  const handleSendMessage = async (textToSend: string) => {
    const clean = textToSend.trim();
    if (!clean || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/rides/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, text: clean }),
      });
      const data = await res.json();
      if (res.ok && data.message) {
        setMessages((prev) => [...prev, data.message]);
        setDraft("");
      }
    } catch {
      showToast("Message Error", "Could not send message.", "error");
    } finally {
      setSending(false);
    }
  };

  const handleShareTrip = async () => {
    if (userRole !== "passenger" && userRole !== "both") {
      showToast(
        "Passenger Privacy Feature",
        "For student safety, only the passenger can generate or share the live tracking link.",
        "info"
      );
      return;
    }
    try {
      const res = await fetch("/api/rides/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        showToast("Share Error", data.error || "Could not create tracking link.", "error");
        return;
      }
      const shareUrl = `${window.location.origin}/track/${data.token}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast(
          "Live Tracking Link Copied! 🔗",
          `Share ${shareUrl} with friends or family to track this ride live.`,
          "success"
        );
      } catch {
        showToast("Live Trip URL", shareUrl, "info");
      }
    } catch {
      showToast("Network Error", "Could not generate tracking link.", "error");
    }
  };

  const quickReplies = userRole === "driver" ? DRIVER_QUICK_REPLIES : PASSENGER_QUICK_REPLIES;

  return (
    <div className="space-y-2">
      {/* Compact Action Strip */}
      <div className="grid grid-cols-4 gap-1.5">
        <button
          type="button"
          onClick={() => setActiveDrawer(activeDrawer === "chat" ? null : "chat")}
          className={`py-2 px-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
            activeDrawer === "chat"
              ? "bg-blue-600 text-white border-blue-600 shadow-xs"
              : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5 shrink-0" />
          <span>Chat</span>
          {messages.length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                activeDrawer === "chat" ? "bg-white text-blue-600" : "bg-blue-600 text-white"
              }`}
            >
              {messages.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveDrawer(activeDrawer === "pay" ? null : "pay")}
          className={`py-2 px-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
            activeDrawer === "pay"
              ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
              : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
          }`}
        >
          <QrCode className="w-3.5 h-3.5 shrink-0" />
          <span>₹{numericFare} Fare</span>
        </button>

        <button
          type="button"
          onClick={() => void handleShareTrip()}
          className="py-2 px-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
        >
          <Share2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
          <span>Share</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDrawer(activeDrawer === "sos" ? null : "sos")}
          className={`py-2 px-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
            activeDrawer === "sos"
              ? "bg-rose-600 text-white border-rose-600"
              : "bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200"
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          <span>SOS</span>
        </button>
      </div>

      {/* 1. In-Ride Chat Drawer */}
      {activeDrawer === "chat" && (
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2.5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-slate-800">
              💬 Live Ride Chat with {counterpartyName}
            </span>
            <button
              type="button"
              onClick={() => setActiveDrawer(null)}
              className="text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
            {messages.length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-2">
                No messages yet — tap a quick reply below or type a message.
              </p>
            ) : (
              messages.map((m) => {
                const isMine = m.senderId === userId;
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] max-w-[85%] ${
                        isMine
                          ? "bg-blue-600 text-white font-medium"
                          : "bg-white border border-slate-200 text-slate-800"
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 1-Tap Quick Reply Pills */}
          <div className="flex flex-wrap gap-1">
            {quickReplies.map((pill) => (
              <button
                key={pill}
                type="button"
                onClick={() => void handleSendMessage(pill)}
                className="px-2 py-1 rounded-lg bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 text-[10px] font-semibold transition-colors cursor-pointer"
              >
                {pill}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendMessage(draft);
            }}
            className="flex gap-1.5"
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Message ${counterpartyName}...`}
              className="flex-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* 2. UPI QR & HopOn Wallet Drawer */}
      {activeDrawer === "pay" && (
        <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-indigo-950">
              💳 Campus Fare · ₹{numericFare}
            </span>
            <button
              type="button"
              onClick={() => setActiveDrawer(null)}
              className="text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-indigo-100">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0">
              <Wallet className="w-6 h-6 text-indigo-600" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-xs font-bold text-slate-900">
                HopOn Student Wallet Settlement
              </p>
              <p className="text-[11px] text-slate-500">
                ₹{numericFare} auto-transfers from passenger wallet to driver upon dropoff.
              </p>
              <div className="mt-1 py-1 px-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                <span>Zero cash needed · Verified campus student ledger</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. SOS / Campus Security Drawer */}
      {activeDrawer === "sos" && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 space-y-2.5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-rose-900">
              🚨 Campus Emergency &amp; Safety Contacts
            </span>
            <button
              type="button"
              onClick={() => setActiveDrawer(null)}
              className="text-rose-400 hover:text-rose-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-rose-800 leading-snug">
            In any urgent or safety situation, contact emergency response or campus security immediately:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <a
              href="tel:112"
              className="py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>National 112</span>
            </a>
            <a
              href="tel:08068737777"
              className="py-2 px-3 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>KJU Security</span>
            </a>
            <button
              type="button"
              onClick={() => {
                void handleShareTrip();
              }}
              className="py-2 px-3 rounded-xl bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 text-xs font-bold cursor-pointer flex items-center justify-center gap-1"
            >
              <span>Copy Live Link</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
