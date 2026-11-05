"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Car,
  CheckCircle2,
  Sparkles,
  User as UserIcon,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Loader2,
  GraduationCap,
} from "lucide-react";
import { setStoredUser, syncSession } from "@/lib/auth";
import { useToast } from "@/components/ToastContext";

export default function RegisterPage() {
  const router = useRouter();
  const { showToast } = useToast();

  // Role: "both" = Both Rider & Passenger (offers rides with Bike/Scooty/Car AND books rides), "passenger" = Passenger Only (books rides)
  const [role, setRole] = useState<"both" | "passenger">("both");
  const [name, setName] = useState("");
  const [studentRollNumber, setStudentRollNumber] = useState("");
  const [university, setUniversity] = useState("Kristu Jayanti University");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Rider Vehicle Details (shown when role === "both")
  const [vehicleType, setVehicleType] = useState<"Bike" | "Scooty" | "Car">("Bike");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const handleSelectVehicleType = (type: "Bike" | "Scooty" | "Car") => {
    setVehicleType(type);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage("Please enter your full name.");
      return;
    }
    if (!email.trim()) {
      setErrorMessage("Please enter your university email address.");
      return;
    }
    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }
    if (role === "both" && (!vehicleModel.trim() || !vehicleNumber.trim())) {
      setErrorMessage("Please enter your vehicle model and registration plate number.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          university: university.trim() || "Kristu Jayanti University",
          studentRollNumber: studentRollNumber.trim() || undefined,
          ...(role === "both"
            ? {
                vehicleType,
                vehicleModel: vehicleModel.trim(),
                vehicleNumber: vehicleNumber.trim().toUpperCase(),
              }
            : {}),
          rememberMe: true,
        }),
      });

      const data = await res.json();
      if (res.ok && data.user) {
        let finalUser = data.user;
        if (data.verificationToken) {
          try {
            await fetch("/api/auth/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: data.verificationToken }),
            });
            const refreshed = await syncSession();
            if (refreshed) finalUser = refreshed;
          } catch {
            // silent fallback
          }
        }
        setStoredUser(finalUser, true);
        showToast(
          role === "both" ? "Passenger & Rider Account Created! 🏍️" : "Student Account Created! 🎓",
          role === "both"
            ? `Welcome ${finalUser.name}! Your ${vehicleType} is registered on HopOn.`
            : `Welcome ${finalUser.name}! You can now book campus rides.`,
          "success"
        );
        router.push("/home");
      } else {
        setErrorMessage(data.error || "Could not complete registration.");
      }
    } catch {
      setErrorMessage("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen w-full flex flex-col lg:flex-row bg-slate-50 selection:bg-blue-100 selection:text-blue-900">
      {/* Left Section: Brand Showcase */}
      <section className="lg:w-5/12 bg-gradient-to-br from-blue-700 via-indigo-700 to-slate-900 text-white p-6 sm:p-10 lg:p-12 flex flex-col justify-between relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />

        {/* Logo */}
        <div className="relative z-10 flex items-center justify-between">
          <Link href="/login" className="flex items-center gap-3">
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
          </Link>
        </div>

        {/* Middle Pitch */}
        <div className="relative z-10 my-8 lg:my-0 max-w-lg">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-blue-200 text-xs font-medium mb-5 backdrop-blur-xs">
            <Sparkles className="w-3.5 h-3.5 text-blue-300" />
            <span>Join the Verified Campus Network</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight font-heading">
            Ride together. <br />
            Share costs. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-200 via-blue-200 to-sky-200">
              Register as a Rider or Passenger.
            </span>
          </h1>

          <p className="mt-4 text-sm sm:text-base text-blue-100/90 leading-relaxed">
            Have a bike, scooty, or car? Register as a <strong>Student Rider</strong> to offer empty
            seats on your daily commute and earn ₹30–₹80 per trip. Or join as a{" "}
            <strong>Passenger</strong> to book instant campus rides.
          </p>

          <div className="mt-6 space-y-2.5 text-xs">
            <div className="p-3.5 rounded-2xl bg-white/10 border border-white/15 flex items-center gap-3">
              <span className="text-xl">🏍️</span>
              <div>
                <p className="font-bold text-white">Student Riders (Bike / Scooty / Car)</p>
                <p className="text-blue-200">
                  Accept nearby student requests, verify 4-digit pickup OTP, and share fuel costs.
                </p>
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-white/10 border border-white/15 flex items-center gap-3">
              <span className="text-xl">🎒</span>
              <div>
                <p className="font-bold text-white">Student Passengers</p>
                <p className="text-blue-200">
                  Get picked up at KJU gates, track live GPS, and pay via UPI or HopOn Wallet.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Badges */}
        <div className="relative z-10 pt-5 border-t border-white/15 grid grid-cols-3 gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-blue-50">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>ID Verified</span>
          </div>
          <div className="flex items-center gap-1.5 text-blue-50">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>4-Digit OTP</span>
          </div>
          <div className="flex items-center gap-1.5 text-blue-50">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Live GPS</span>
          </div>
        </div>
      </section>

      {/* Right Section: Dedicated Registration Form */}
      <section className="lg:w-7/12 flex items-center justify-center p-6 sm:p-10 lg:p-12 bg-white overflow-y-auto">
        <div className="w-full max-w-xl">
          {/* Back to Login */}
          <div className="mb-4">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Sign In</span>
            </Link>
          </div>

          {/* Header */}
          <div className="mb-6">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 font-heading">
              Create your student account 🎓
            </h2>
            <p className="mt-1.5 text-sm text-slate-600">
              Choose how you want to use HopOn and fill in your campus details below.
            </p>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-2.5"
            >
              <div className="w-2 h-2 rounded-full bg-rose-600 shrink-0" />
              <span className="font-medium">{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 1. Prominent Role Selector: Register as Rider vs Passenger */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                Select Account Type
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole("both")}
                  className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-start gap-3 ${
                    role === "both"
                      ? "border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/15"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg ${
                      role === "both"
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    🏍️
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-extrabold text-slate-900">
                        Both Rider &amp; Passenger
                      </span>
                      {role === "both" && (
                        <span className="px-1.5 py-0.2 rounded bg-emerald-600 text-white text-[9px] font-bold uppercase">
                          Selected
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                      Offer rides with your Bike, Scooty, or Car AND book rides as a passenger
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setRole("passenger")}
                  className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-start gap-3 ${
                    role === "passenger"
                      ? "border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/15"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg ${
                      role === "passenger"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    🎒
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-extrabold text-slate-900">
                        Passenger Only
                      </span>
                      {role === "passenger" && (
                        <span className="px-1.5 py-0.2 rounded bg-blue-600 text-white text-[9px] font-bold uppercase">
                          Selected
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                      Find &amp; book campus rides across campus (no vehicle required)
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* 2. Name & Student Roll Number */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label
                  htmlFor="reg-name"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
                >
                  Full Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="h-4 w-4" />
                  </div>
                  <input
                    id="reg-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Krish Rai"
                    className="block w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="reg-roll"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
                >
                  Student Roll / ID Number
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <input
                    id="reg-roll"
                    type="text"
                    required
                    value={studentRollNumber}
                    onChange={(e) => setStudentRollNumber(e.target.value.toUpperCase())}
                    placeholder="23BCAC45"
                    className="block w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 py-2.5 text-sm font-mono uppercase text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            </div>

            {/* 3. University & Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label
                  htmlFor="reg-university"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
                >
                  University / Campus
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <GraduationCap className="h-4 w-4" />
                  </div>
                  <input
                    id="reg-university"
                    type="text"
                    required
                    value={university}
                    onChange={(e) => setUniversity(e.target.value)}
                    className="block w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="reg-email"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
                >
                  University Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    id="reg-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@kristujayanti.com"
                    className="block w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            </div>

            {/* 4. Rider Vehicle Details (shown when registering as Rider) */}
            {role === "both" && (
              <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/90 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-900">
                    🛵 Rider Vehicle Registration
                  </span>
                  <span className="text-[11px] font-semibold text-emerald-700">
                    Auto-creates your rider profile
                  </span>
                </div>

                {/* Vehicle Type Pills */}
                <div className="grid grid-cols-3 gap-2">
                  {(["Bike", "Scooty", "Car"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleSelectVehicleType(t)}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        vehicleType === t
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-emerald-50"
                      }`}
                    >
                      <span>{t === "Bike" ? "🏍️" : t === "Scooty" ? "🛵" : "🚗"}</span>
                      <span>{t}</span>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="reg-vehicle-model"
                      className="block text-[11px] font-bold uppercase text-slate-700 mb-1"
                    >
                      Vehicle Model
                    </label>
                    <input
                      id="reg-vehicle-model"
                      type="text"
                      required
                      value={vehicleModel}
                      onChange={(e) => setVehicleModel(e.target.value)}
                      placeholder="e.g. Bajaj Pulsar 150"
                      className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="reg-vehicle-plate"
                      className="block text-[11px] font-bold uppercase text-slate-700 mb-1"
                    >
                      License Plate Number
                    </label>
                    <input
                      id="reg-vehicle-plate"
                      type="text"
                      required
                      value={vehicleNumber}
                      onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                      placeholder="KA 04 EK 7142"
                      className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono uppercase text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 5. Password & Confirm Password */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label
                  htmlFor="reg-password"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    id="reg-password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    className="block w-full rounded-xl border border-slate-300 bg-white pl-10 pr-9 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="reg-confirm-password"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    id="reg-confirm-password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="block w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full mt-2 flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-white font-bold text-sm sm:text-base shadow-md transition-all cursor-pointer disabled:opacity-70 ${
                role === "both"
                  ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-500/20"
                  : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/20"
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating your account...</span>
                </>
              ) : (
                <>
                  <span>
                    {role === "both"
                      ? `Complete Passenger & Rider Registration (${vehicleType})`
                      : "Complete Student Passenger Registration"}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-xs sm:text-sm text-slate-600">
            Already have a HopOn account?{" "}
            <Link
              href="/login"
              className="font-bold text-blue-600 hover:text-blue-700 hover:underline"
            >
              Sign in here
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

