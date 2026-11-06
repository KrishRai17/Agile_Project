"use client";

import React, { useState } from "react";
import { Star, X, CheckCircle2, Sparkles } from "lucide-react";

interface RatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  requestId: string;
  targetUserId: string;
  targetName: string;
  targetRole: "driver" | "passenger";
  fare?: string;
  onSubmitted?: (newRating: number) => void;
}

const DRIVER_TAGS = ["Safe Driver", "On Time", "Clean Vehicle", "Polite & Friendly", "Smooth Route"];
const PASSENGER_TAGS = ["Ready at Pickup", "Shared OTP Promptly", "Polite", "Clear Pickup Pin"];

export default function RatingModal({
  isOpen,
  onClose,
  requestId,
  targetUserId,
  targetName,
  targetRole,
  fare,
  onSubmitted,
}: RatingModalProps) {
  const [stars, setStars] = useState(5);
  const [selectedTags, setSelectedTags] = useState<string[]>(["On Time"]);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const availableTags = targetRole === "driver" ? DRIVER_TAGS : PASSENGER_TAGS;

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/rides/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          targetUserId,
          stars,
          tags: selectedTags,
          comment,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDone(true);
        if (typeof data.rating === "number") {
          onSubmitted?.(data.rating);
        }
        setTimeout(() => {
          setDone(false);
          onClose();
        }, 900);
      } else {
        setErrorMessage(data.error || "Could not submit rating.");
      }
    } catch {
      setErrorMessage("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-300" />
            <h2 className="text-base font-bold">Trip Completed! Rate Your Ride</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <div className="p-8 text-center space-y-2">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <p className="text-base font-bold text-slate-900">Thank you for your feedback!</p>
            <p className="text-xs text-slate-500">
              Your rating has been saved to {targetName}&apos;s campus profile.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                How was your trip with
              </p>
              <p className="text-lg font-bold text-slate-900 mt-0.5">{targetName}</p>
              {fare && (
                <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                  Fare: ₹{fare.replace(/^₹/, "")}
                </span>
              )}
            </div>

            {/* 1-5 Star Selector */}
            <div className="flex items-center justify-center gap-2 py-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStars(value)}
                  className="p-1.5 rounded-xl hover:scale-110 transition-transform cursor-pointer"
                >
                  <Star
                    className={`w-8 h-8 ${
                      value <= stars
                        ? "fill-amber-400 text-amber-400"
                        : "text-slate-300"
                    }`}
                  />
                </button>
              ))}
            </div>

            {/* Feedback Tags */}
            <div className="flex flex-wrap justify-center gap-1.5">
              {availableTags.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                      active
                        ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            <textarea
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optional note about your campus ride..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-600"
            />

            {errorMessage && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold text-center">
                {errorMessage}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs cursor-pointer"
              >
                Skip
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-[2] py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs shadow-md cursor-pointer"
              >
                {submitting ? "Saving Rating…" : `Submit ${stars}★ Rating`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

