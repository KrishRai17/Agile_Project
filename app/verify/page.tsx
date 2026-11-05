"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Car,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Mail,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { syncSession, User } from "@/lib/auth";

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() || "";

  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "error">(
    token ? "idle" : "error"
  );
  const [errorMessage, setErrorMessage] = useState(
    token ? "" : "No verification token was provided in the link. Please check your verification email."
  );

  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<"idle" | "sent" | "error">("idle");
  const [resendMessage, setResendMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    syncSession()
      .then((u) => {
        if (!cancelled) {
          setUser(u);
          setAuthChecked(true);
        }
      })
      .catch(() => {
        if (!cancelled) setAuthChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleConfirmVerification = async () => {
    if (!token) return;
    setStatus("verifying");
    setErrorMessage("");

    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error) {
        setStatus("error");
        setErrorMessage(data.error || "Verification failed. The link may have expired.");
        return;
      }

      setStatus("success");
      const updatedUser = await syncSession();
      setUser(updatedUser);

      // If already signed in in this browser, redirect automatically to home
      if (updatedUser) {
        setTimeout(() => {
          router.push("/home");
        }, 1500);
      }
    } catch {
      setStatus("error");
      setErrorMessage("Network error occurred while verifying. Please check your connection.");
    }
  };

  const handleResend = async () => {
    if (!user) return;
    setResending(true);
    setResendStatus("idle");
    setResendMessage("");

    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend" }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error) {
        setResendStatus("error");
        setResendMessage(data.error || "Unable to resend email right now. Please try again later.");
        return;
      }

      setResendStatus("sent");
      setResendMessage("A new verification link has been sent to your university inbox.");
    } catch {
      setResendStatus("error");
      setResendMessage("Failed to reach server. Please try again.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white rounded-3xl p-8 sm:p-10 shadow-2xl border border-slate-200/80 relative">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-2xl bg-[#27a8f5] flex items-center justify-center text-white shadow-md shadow-sky-500/25">
          <Car className="w-6 h-6 text-white" />
        </div>
        <div>
          <span className="text-2xl font-bold tracking-tight text-slate-900 font-heading">
            Hop<span className="text-[#27a8f5]">On</span>
          </span>
          <span className="ml-2 px-2 py-0.5 text-[10px] uppercase font-semibold tracking-wider bg-sky-50 text-[#0284c7] rounded-full border border-sky-200">
            Campus Verify
          </span>
        </div>
      </div>

      {status === "idle" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900 font-heading">
              Confirm Student Verification
            </h1>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Click below to verify your university student email and activate your account.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-sky-50/60 border border-sky-100 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-[#27a8f5] shrink-0 mt-0.5" />
            <div className="text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-800">Student safety protection</p>
              <p>
                Verification confirms your college affiliation and unlocks ride booking, offer posting, and the campus wallet.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleConfirmVerification}
            className="w-full py-3.5 px-4 rounded-xl bg-[#27a8f5] hover:bg-[#1f96de] active:scale-[0.99] text-white font-bold text-sm shadow-md shadow-sky-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Confirm verification</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {status === "verifying" && (
        <div className="py-10 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-sky-50 border border-sky-200 flex items-center justify-center mx-auto text-[#27a8f5]">
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 font-heading">
            Verifying student status…
          </h2>
          <p className="text-xs text-slate-500">
            Checking your university verification token.
          </p>
        </div>
      )}

      {status === "success" && (
        <div className="space-y-6 py-2 text-center animate-in fade-in duration-200">
          <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto text-emerald-600">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 font-heading">
              Student ID Verified!
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Your university email is confirmed and campus rides are fully unlocked.
            </p>
          </div>

          {user ? (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
              Redirecting to campus home…
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              <p className="text-xs text-slate-500">
                You can now sign in with your verified credentials.
              </p>
              <Link
                href="/login"
                className="w-full py-3 px-4 rounded-xl bg-[#27a8f5] hover:bg-[#1f96de] text-white font-bold text-sm shadow-md shadow-sky-500/25 transition-all flex items-center justify-center gap-2 inline-flex"
              >
                <span>Sign in to HopOn</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      )}

      {status === "error" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold">Verification Error</p>
              <p className="text-xs text-rose-700 mt-0.5">{errorMessage}</p>
            </div>
          </div>

          {authChecked && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              {user ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600">
                    Signed in as <span className="font-semibold text-slate-900">{user.email}</span>. Request a fresh verification link:
                  </p>
                  <button
                    type="button"
                    disabled={resending}
                    onClick={handleResend}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {resending ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-600" />
                    ) : (
                      <RefreshCw className="w-4 h-4 text-slate-600" />
                    )}
                    <span>Resend verification email</span>
                  </button>

                  {resendStatus === "sent" && (
                    <p className="text-xs text-emerald-600 font-medium">{resendMessage}</p>
                  )}
                  {resendStatus === "error" && (
                    <p className="text-xs text-rose-600 font-medium">{resendMessage}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">
                    Need a fresh link? Sign in to request another verification email.
                  </p>
                  <Link
                    href="/login"
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors flex items-center justify-center gap-2 inline-flex"
                  >
                    <span>Go to Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center gap-1">
          <Mail className="w-3.5 h-3.5 text-[#27a8f5]" /> University verification
        </span>
        <Link href="/login" className="text-slate-500 hover:text-slate-800 font-semibold">
          Back to Login
        </Link>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <main className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-50 selection:bg-blue-100 selection:text-blue-900">
      <Suspense
        fallback={
          <div className="w-full max-w-md bg-white rounded-3xl p-10 shadow-xl border border-slate-200 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#27a8f5] mx-auto" />
            <p className="text-xs text-slate-500 mt-3 font-medium">Loading verification…</p>
          </div>
        }
      >
        <VerifyContent />
      </Suspense>
    </main>
  );
}

