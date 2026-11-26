"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Upload,
  FileCheck2,
  XCircle,
  ScanText,
  CreditCard,
} from "lucide-react";
import { clearStoredUser, syncSession } from "@/lib/auth";
import type { StudentIdVerificationResult } from "@/lib/studentIdVerifier";

export default function RegisterPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Role: "both" = Both Rider & Passenger, "passenger" = Passenger Only
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
  const [upiId, setUpiId] = useState("");

  // Step 1: Student ID Card Photo Upload state (Required for both Rider & Passenger)
  const [idCardImage, setIdCardImage] = useState<string | null>(null);
  const [idCardFileName, setIdCardFileName] = useState<string>("");

  // Optional Profile Photo state
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // Step 2 & 3: Popup Modal State ("verifying" | "success" | "failed" | null)
  const [popupState, setPopupState] = useState<"verifying" | "success" | "failed" | null>(null);
  const [verificationStage, setVerificationStage] = useState<
    "idle" | "extracting" | "checking" | "creating"
  >("idle");

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

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrorMessage("Please upload a valid image file (PNG, JPG, WEBP) for your profile photo.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const rawDataUrl = reader.result;
      const img = new window.Image();
      img.onload = () => {
        const size = 320;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const minSide = Math.min(img.width, img.height);
          const sx = Math.max(0, Math.round((img.width - minSide) / 2));
          const sy = Math.max(0, Math.round((img.height - minSide) / 2));
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, size, size);
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
          setAvatarUrl(canvas.toDataURL("image/jpeg", 0.88));
        } else {
          setAvatarUrl(rawDataUrl);
        }
        setErrorMessage(null);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleIdCardFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMessage("Please upload a valid image file (PNG, JPG, WEBP) of your Student ID card.");
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setErrorMessage("ID card image must be under 15 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const rawDataUrl = reader.result;

      // Normalize & compress large camera photos via canvas so upload is fast and reliable
      const img = new window.Image();
      img.onload = () => {
        const maxDim = 1400;
        let width = img.width || 800;
        let height = img.height || 500;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          const normalizedUrl = canvas.toDataURL("image/jpeg", 0.9);
          setIdCardImage(normalizedUrl);
        } else {
          setIdCardImage(rawDataUrl);
        }
        setIdCardFileName(file.name);
        setErrorMessage(null);
      };
      img.onerror = () => {
        setIdCardImage(rawDataUrl);
        setIdCardFileName(file.name);
        setErrorMessage(null);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage("Please enter your full name.");
      return;
    }
    if (!studentRollNumber.trim()) {
      setErrorMessage("Please enter your Student Roll / ID Number.");
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
    if (!idCardImage) {
      setErrorMessage("Please upload a photo of your Student ID card to verify your account.");
      return;
    }

    // Show "Verifying your student ID" popup while Step 2 (OCR extraction) and Step 3 (verification check) run
    setIsLoading(true);
    setPopupState("verifying");
    setVerificationStage("extracting");

    try {
      await new Promise((r) => setTimeout(r, 450));
      setVerificationStage("checking");

      // Step 2 & Step 3: Extract words via server OCR API and verify the conditions (including Roll Number)
      const verifyRes = await fetch("/api/auth/verify-id-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idCardImage,
          registeredName: name.trim(),
          registeredRollNumber: studentRollNumber.trim(),
        }),
      });

      const verifyData = (await verifyRes.json()) as StudentIdVerificationResult & {
        error?: string;
      };

      if (!verifyRes.ok || !verifyData.verified) {
        // Show "Verification Failed" popup only; do NOT add failure message inside the sign up UI
        setPopupState("failed");
        setVerificationStage("idle");
        setIsLoading(false);
        return;
      }

      // All 3 conditions matched! Automatically verify and create the account
      setVerificationStage("creating");

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
          ...(avatarUrl ? { avatarUrl } : {}),
          idCardImage,
          idCardText: verifyData.extractedText,
          requireIdCardVerification: true,
          redirectToLogin: true,
          ...(role === "both"
            ? {
                vehicleType,
                vehicleModel: vehicleModel.trim(),
                vehicleNumber: vehicleNumber.trim().toUpperCase(),
                ...(upiId.trim() ? { upiId: upiId.trim().toLowerCase() } : {}),
              }
            : {}),
          rememberMe: true,
        }),
      });

      const data = await res.json();
      if (res.ok && data.user) {
        clearStoredUser();
        setPopupState("success");
        setVerificationStage("idle");
        setTimeout(() => {
          router.push("/login");
        }, 1600);
      } else {
        if (data.idVerification && !data.idVerification.verified) {
          setPopupState("failed");
        } else {
          setPopupState(null);
          setErrorMessage(data.error || "Could not complete registration.");
        }
        setVerificationStage("idle");
      }
    } catch {
      setPopupState("failed");
      setVerificationStage("idle");
    } finally {
      setIsLoading(false);
    }
  };

  const inputClassName =
    "w-full h-11 rounded-xl bg-[#F4F9FC] border border-[#080808]/12 px-4 text-sm text-[#080808] placeholder:text-[#080808]/40 focus:bg-[#FFFFFF] focus:border-[#70C8F5] focus:outline-none focus:ring-2 focus:ring-[#70C8F5]/30 transition-all duration-150";

  return (
    <div className="min-h-screen w-full bg-[#FFFFFF] text-[#080808] flex flex-col lg:flex-row antialiased selection:bg-[#70C8F5]/30 selection:text-[#080808] relative">
      {/* Popup Modal for Verifying / Registered Successfully / Verification Failed */}
      {popupState !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-live="polite"
          className="fixed inset-0 z-50 bg-[#080808]/75 backdrop-blur-md flex items-center justify-center p-6"
        >
          {popupState === "verifying" && (
            <div className="w-full max-w-md rounded-3xl bg-[#FFFFFF] border border-[#080808]/10 p-8 shadow-2xl text-[#080808]">
              <div className="flex items-center gap-4 mb-6">
                <div className="h-12 w-12 rounded-2xl bg-[#080808] text-[#70C8F5] flex items-center justify-center shrink-0">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold tracking-tight text-[#080808]">
                    Verifying your student ID
                  </h3>
                  <p className="text-xs text-[#080808]/60 mt-0.5">
                    Extracting words and checking your campus credentials...
                  </p>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl bg-[#F4F9FC] border border-[#080808]/[0.08] p-5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#080808] flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-[#70C8F5] shrink-0" />
                    1. Student ID card photo uploaded
                  </span>
                  <span className="text-[11px] font-bold text-[#080808]">Done</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#080808] flex items-center gap-2.5">
                    {verificationStage === "extracting" ? (
                      <Loader2 className="h-4 w-4 text-[#70C8F5] animate-spin shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-[#70C8F5] shrink-0" />
                    )}
                    2. Extracting words from ID card image
                  </span>
                  <span className="text-[11px] font-bold text-[#080808]">
                    {verificationStage === "extracting" ? "Scanning..." : "Done"}
                  </span>
                </div>

                <div className="space-y-2 pt-2 border-t border-[#080808]/[0.08]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#080808] flex items-center gap-2.5">
                      {verificationStage === "checking" || verificationStage === "creating" ? (
                        <Loader2 className="h-4 w-4 text-[#70C8F5] animate-spin shrink-0" />
                      ) : (
                        <ScanText className="h-4 w-4 text-[#080808]/40 shrink-0" />
                      )}
                      3. Checking 3 verification conditions:
                    </span>
                  </div>
                  <ul className="pl-6 space-y-1 text-[11px] text-[#080808]/65 list-disc">
                    <li>Keyword match: University, Institution, or College</li>
                    <li>Student name matches &ldquo;{name.trim() || "Registered Name"}&rdquo;</li>
                    <li>Roll number matches &ldquo;{studentRollNumber.trim() || "Roll Number"}&rdquo;</li>
                    <li>Active academic year / expiration date check</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {popupState === "success" && (
            <div className="w-full max-w-sm rounded-3xl bg-[#FFFFFF] border border-[#080808]/10 p-8 shadow-2xl text-center text-[#080808]">
              <div className="mx-auto mb-5 h-16 w-16 rounded-full bg-emerald-500/15 border-2 border-emerald-500 flex items-center justify-center">
                <CheckCircle2 className="h-9 w-9 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-extrabold tracking-tight text-[#080808]">
                Registered Successfully
              </h3>
              <p className="mt-2 text-sm text-[#080808]/65">
                Your Student ID has been verified. Redirecting to the login page...
              </p>
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="mt-6 w-full h-11 rounded-xl bg-[#70C8F5] hover:bg-[#5ec0f2] text-[#080808] text-sm font-bold transition-colors cursor-pointer"
              >
                Continue to Sign In
              </button>
            </div>
          )}

          {popupState === "failed" && (
            <div className="w-full max-w-sm rounded-3xl bg-[#FFFFFF] border border-[#080808]/10 p-8 shadow-2xl text-center text-[#080808]">
              <div className="mx-auto mb-5 h-16 w-16 rounded-full bg-rose-500/15 border-2 border-rose-500 flex items-center justify-center">
                <XCircle className="h-9 w-9 text-rose-600" />
              </div>
              <h3 className="text-2xl font-extrabold tracking-tight text-[#080808]">
                Verification Failed
              </h3>
              <p className="mt-2 text-sm text-[#080808]/65">
                We could not verify your Student ID card. Please upload a valid, unexpired student
                ID card matching your registered name.
              </p>
              <button
                type="button"
                onClick={() => setPopupState(null)}
                className="mt-6 w-full h-11 rounded-xl bg-[#080808] hover:bg-[#080808]/85 text-[#FFFFFF] text-sm font-bold transition-colors cursor-pointer"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      )}

      {/* Left Section (50% on Desktop) — Matches Sign In Page */}
      <section className="hidden lg:flex lg:w-1/2 lg:sticky lg:top-0 lg:h-screen bg-[#F4F9FC] border-r border-[#080808]/[0.06] flex-col justify-between p-12 xl:p-16 relative overflow-hidden">
        {/* Subtle sky-blue ambient accents */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-28 -left-28 h-80 w-80 rounded-full bg-[#70C8F5]/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-12 right-12 h-64 w-64 rounded-full bg-[#70C8F5]/10 blur-3xl"
        />

        {/* Top Brand Header */}
        <div className="relative z-10 flex items-center justify-between">
          <Link href="/login" className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-xl bg-[#080808] flex items-center justify-center shadow-sm">
              <span className="text-lg font-black tracking-tighter text-[#FFFFFF]">
                H<span className="text-[#70C8F5]">O</span>
              </span>
            </div>
            <div>
              <span className="block text-2xl font-extrabold tracking-tight text-[#080808] leading-none">
                HopOn
              </span>
              <span className="mt-1 block text-xs font-medium tracking-wide text-[#080808]/60">
                Your campus. Your ride. Your people.
              </span>
            </div>
          </Link>
        </div>

        {/* Center Hero Copy & Studio Mobility Visual */}
        <div className="relative z-10 my-auto py-8 max-w-xl">
          <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight text-[#080808] leading-[1.1]">
            Your next ride starts here.
          </h1>
          <p className="mt-4 text-lg font-normal text-[#080808]/70 leading-relaxed">
            Affordable rides. Verified students. Better journeys.
          </p>

          {/* Studio Mobility Visual */}
          <div className="mt-10 relative rounded-3xl bg-[#FFFFFF] border border-[#080808]/[0.07] p-3 shadow-[0_12px_40px_rgb(8,8,8,0.04)] overflow-hidden">
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-[#F4F9FC]">
              <Image
                src="/hopon-hero-car.jpg"
                alt="Modern HopOn electric vehicle on a sky-blue campus route"
                fill
                priority
                sizes="(min-width: 1024px) 45vw, 100vw"
                className="object-cover object-center"
              />

              {/* Top-left minimal floating status pill */}
              <div className="absolute top-4 left-4 inline-flex items-center gap-2 rounded-full bg-[#FFFFFF]/90 backdrop-blur-md border border-[#080808]/[0.08] px-3.5 py-1.5 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-[#70C8F5]" />
                <span className="text-[11px] font-semibold tracking-wide text-[#080808]">
                  Instant OCR Student ID Verification
                </span>
              </div>

              {/* Bottom floating Uber-style verification pill */}
              <div className="absolute inset-x-4 bottom-4 rounded-xl bg-[#FFFFFF]/95 backdrop-blur-md border border-[#080808]/[0.08] px-4 py-3 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#080808]" />
                    <span className="w-5 border-t border-dashed border-[#70C8F5]" />
                    <span className="h-2 w-2 rounded-full bg-[#70C8F5]" />
                  </div>
                  <div className="text-xs font-semibold text-[#080808]">
                    Institution <span className="text-[#080808]/40 mx-1">·</span> Name{" "}
                    <span className="text-[#080808]/40 mx-1">·</span> Active Year
                  </div>
                </div>
                <span className="rounded-lg bg-[#70C8F5]/20 px-2.5 py-1 text-[11px] font-bold text-[#080808]">
                  Auto-Verified
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Small Text */}
        <div className="relative z-10 flex items-center justify-between pt-4 border-t border-[#080808]/[0.06]">
          <p className="text-xs font-semibold tracking-wide text-[#080808]/60">
            Exclusively for students.
          </p>
          <span className="inline-block h-2 w-2 rounded-full bg-[#70C8F5]" />
        </div>
      </section>

      {/* Right Section (50% on Desktop, Single-Column on Mobile/Tablet) */}
      <main className="w-full lg:w-1/2 min-h-screen bg-[#FFFFFF] flex flex-col justify-between px-6 py-8 sm:px-12 md:px-16 lg:px-12 xl:px-20">
        {/* Mobile & Tablet Top Header */}
        <header className="lg:hidden flex items-center justify-between pb-6 border-b border-[#080808]/[0.06]">
          <Link href="/login" className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#080808] flex items-center justify-center">
              <span className="text-base font-black tracking-tighter text-[#FFFFFF]">
                H<span className="text-[#70C8F5]">O</span>
              </span>
            </div>
            <div>
              <span className="block text-xl font-extrabold tracking-tight text-[#080808] leading-none">
                HopOn
              </span>
              <span className="mt-1 block text-[11px] font-medium text-[#080808]/60">
                Your campus. Your ride. Your people.
              </span>
            </div>
          </Link>
          <span className="rounded-full bg-[#F4F9FC] border border-[#70C8F5]/40 px-3 py-1 text-[11px] font-semibold text-[#080808]">
            Exclusively for students.
          </span>
        </header>

        {/* Vertically Centered Sign-Up Form */}
        <div className="my-auto w-full max-w-[480px] mx-auto py-6">
          {/* Heading & Subtitle */}
          <div className="mb-7">
            <h2 className="text-3xl sm:text-[34px] font-extrabold tracking-tight text-[#080808] leading-tight">
              Create your account.
            </h2>
            <p className="mt-2 text-base font-normal text-[#080808]/65">
              Upload your student ID card to start riding or sharing seats.
            </p>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mb-5 rounded-xl bg-[#F4F9FC] border border-[#080808]/20 px-4 py-3 text-xs font-medium text-[#080808]"
            >
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* 1. Role Selector: Rider & Passenger vs Passenger Only */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#080808]/80">
                Account type
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole("both")}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    role === "both"
                      ? "border-[#080808] bg-[#F4F9FC] ring-2 ring-[#70C8F5]/40"
                      : "border-[#080808]/12 bg-[#FFFFFF] hover:bg-[#F4F9FC]/60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[#080808]">Rider &amp; Passenger</span>
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        role === "both" ? "bg-[#70C8F5]" : "bg-[#080808]/15"
                      }`}
                    />
                  </div>
                  <p className="text-[11px] text-[#080808]/60 mt-1 leading-snug">
                    Offer seats on your vehicle &amp; book rides
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setRole("passenger")}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    role === "passenger"
                      ? "border-[#080808] bg-[#F4F9FC] ring-2 ring-[#70C8F5]/40"
                      : "border-[#080808]/12 bg-[#FFFFFF] hover:bg-[#F4F9FC]/60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[#080808]">Passenger Only</span>
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        role === "passenger" ? "bg-[#70C8F5]" : "bg-[#080808]/15"
                      }`}
                    />
                  </div>
                  <p className="text-[11px] text-[#080808]/60 mt-1 leading-snug">
                    Find &amp; book campus rides
                  </p>
                </button>
              </div>
            </div>

            {/* 1b. Profile Photo Upload */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F4F9FC] border border-[#080808]/12">
              <div className="flex items-center gap-3.5">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt="Profile photo preview"
                    className="h-12 w-12 rounded-full object-cover border-2 border-[#70C8F5] shrink-0"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-[#080808] text-[#FFFFFF] flex items-center justify-center text-sm font-extrabold shrink-0">
                    {name.trim() ? name.trim().slice(0, 2).toUpperCase() : "HO"}
                  </div>
                )}
                <div>
                  <span className="block text-xs font-bold uppercase tracking-wider text-[#080808]">
                    Profile photo
                  </span>
                  <span className="block text-[11px] text-[#080808]/60 mt-0.5">
                    Shown to classmates on campus rides
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl bg-[#FFFFFF] hover:bg-[#70C8F5]/20 border border-[#080808]/15 text-xs font-bold text-[#080808] transition-colors cursor-pointer"
                >
                  {avatarUrl ? "Change Photo" : "Add Photo"}
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl(null)}
                    className="px-2.5 py-1.5 rounded-xl bg-[#FFFFFF] hover:bg-[#080808]/10 border border-[#080808]/15 text-xs font-semibold text-[#080808]/70 transition-colors cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {/* 2. Name & Student Roll Number */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <label
                  htmlFor="reg-name"
                  className="block text-xs font-semibold uppercase tracking-wider text-[#080808]/80"
                >
                  Full name (as on ID card)
                </label>
                <input
                  id="reg-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Krish Rai"
                  className={inputClassName}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="reg-roll"
                  className="block text-xs font-semibold uppercase tracking-wider text-[#080808]/80"
                >
                  Roll / ID number
                </label>
                <input
                  id="reg-roll"
                  type="text"
                  required
                  value={studentRollNumber}
                  onChange={(e) => setStudentRollNumber(e.target.value.toUpperCase())}
                  placeholder="24BCAC45"
                  className={`${inputClassName} font-mono uppercase`}
                />
              </div>
            </div>

            {/* 3. University & Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <label
                  htmlFor="reg-university"
                  className="block text-xs font-semibold uppercase tracking-wider text-[#080808]/80"
                >
                  University / Institution
                </label>
                <input
                  id="reg-university"
                  type="text"
                  required
                  value={university}
                  onChange={(e) => setUniversity(e.target.value)}
                  className={inputClassName}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="reg-email"
                  className="block text-xs font-semibold uppercase tracking-wider text-[#080808]/80"
                >
                  University email
                </label>
                <input
                  id="reg-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@kristujayanti.com"
                  className={inputClassName}
                />
              </div>
            </div>

            {/* 4. STEP 1: Student ID Card Photo Upload (Mandatory for Both Rider & Passenger) */}
            <div className="p-4 rounded-2xl bg-[#F4F9FC] border border-[#080808]/12 space-y-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#080808] shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wider text-[#080808]">
                  Student ID card photo
                </span>
              </div>

              <p className="text-[11px] text-[#080808]/65 leading-relaxed">
                Upload a clear photo of your ID card. We automatically verify{" "}
                <strong className="text-[#080808]">University / Institution / College</strong>, your{" "}
                <strong className="text-[#080808]">registered name</strong>, and an{" "}
                <strong className="text-[#080808]">active academic year</strong>.
              </p>

              <input
                ref={fileInputRef}
                id="reg-id-card"
                type="file"
                accept="image/*"
                onChange={handleIdCardFileChange}
                className="hidden"
              />

              {idCardImage ? (
                <div className="rounded-xl bg-[#FFFFFF] border border-[#080808]/12 p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={idCardImage}
                      alt="Uploaded Student ID Card Preview"
                      className="h-14 w-24 object-cover rounded-lg border border-[#080808]/12 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[#080808]">
                        <FileCheck2 className="w-4 h-4 text-[#70C8F5] shrink-0" />
                        <span className="truncate">{idCardFileName || "student-id-card.png"}</span>
                      </div>
                      <p className="text-[11px] text-[#080808]/55 mt-0.5">
                        Ready for OCR text extraction
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg border border-[#080808]/15 bg-[#F4F9FC] hover:bg-[#70C8F5]/20 text-xs font-semibold text-[#080808] shrink-0 cursor-pointer transition-colors"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-4 px-4 rounded-xl bg-[#FFFFFF] hover:bg-[#70C8F5]/10 border border-dashed border-[#080808]/20 flex flex-col items-center justify-center gap-1.5 text-[#080808] transition-colors cursor-pointer"
                >
                  <Upload className="w-5 h-5 text-[#70C8F5]" />
                  <span className="text-xs font-bold text-[#080808]">
                    Upload your Student ID card photo
                  </span>
                  <span className="text-[11px] text-[#080808]/50">
                    PNG, JPG, or WEBP (up to 15 MB)
                  </span>
                </button>
              )}
            </div>

            {/* 5. Rider Vehicle Details (shown when registering as Rider) */}
            {role === "both" && (
              <div className="p-4 rounded-2xl bg-[#F4F9FC] border border-[#080808]/12 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#080808]">
                    Vehicle details
                  </span>
                  <span className="text-[11px] font-medium text-[#080808]/60">
                    Required for student riders
                  </span>
                </div>

                {/* Vehicle Type Pills */}
                <div className="grid grid-cols-3 gap-2">
                  {(["Bike", "Scooty", "Car"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleSelectVehicleType(t)}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        vehicleType === t
                          ? "bg-[#080808] text-[#FFFFFF] border-[#080808]"
                          : "bg-[#FFFFFF] text-[#080808] border-[#080808]/12 hover:bg-[#70C8F5]/15"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label
                      htmlFor="reg-vehicle-model"
                      className="block text-[11px] font-semibold uppercase tracking-wider text-[#080808]/75"
                    >
                      Vehicle model
                    </label>
                    <input
                      id="reg-vehicle-model"
                      type="text"
                      required
                      value={vehicleModel}
                      onChange={(e) => setVehicleModel(e.target.value)}
                      placeholder="Bajaj Pulsar 150"
                      className="w-full h-10 rounded-xl bg-[#FFFFFF] border border-[#080808]/12 px-3.5 text-xs text-[#080808] placeholder:text-[#080808]/40 focus:border-[#70C8F5] focus:outline-none focus:ring-2 focus:ring-[#70C8F5]/30"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="reg-vehicle-plate"
                      className="block text-[11px] font-semibold uppercase tracking-wider text-[#080808]/75"
                    >
                      License plate
                    </label>
                    <input
                      id="reg-vehicle-plate"
                      type="text"
                      required
                      value={vehicleNumber}
                      onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                      placeholder="KA 04 EK 7142"
                      className="w-full h-10 rounded-xl bg-[#FFFFFF] border border-[#080808]/12 px-3.5 text-xs font-mono uppercase text-[#080808] placeholder:text-[#080808]/40 focus:border-[#70C8F5] focus:outline-none focus:ring-2 focus:ring-[#70C8F5]/30"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="reg-upi-id"
                    className="block text-[11px] font-semibold uppercase tracking-wider text-[#080808]/75"
                  >
                    UPI ID for passenger payments (optional)
                  </label>
                  <input
                    id="reg-upi-id"
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value.trim().toLowerCase())}
                    placeholder="name@okaxis"
                    className="w-full h-10 rounded-xl bg-[#FFFFFF] border border-[#080808]/12 px-3.5 text-xs font-mono text-[#080808] placeholder:text-[#080808]/40 focus:border-[#70C8F5] focus:outline-none focus:ring-2 focus:ring-[#70C8F5]/30"
                  />
                </div>
              </div>
            )}

            {/* 6. Password & Confirm Password */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <label
                  htmlFor="reg-password"
                  className="block text-xs font-semibold uppercase tracking-wider text-[#080808]/80"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="reg-password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    className={`${inputClassName} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#080808]/45 hover:text-[#080808] cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="reg-confirm-password"
                  className="block text-xs font-semibold uppercase tracking-wider text-[#080808]/80"
                >
                  Confirm password
                </label>
                <input
                  id="reg-confirm-password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className={inputClassName}
                />
              </div>
            </div>

            {/* Large Sky-Blue Sign Up Button with Black Text */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 mt-2 rounded-xl bg-[#70C8F5] hover:bg-[#5ec0f2] active:scale-[0.995] text-[#080808] text-base font-bold tracking-tight transition-all duration-150 shadow-[0_2px_10px_rgb(112,200,245,0.25)] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying your student ID...</span>
                </>
              ) : (
                <span>Verify Student ID &amp; Sign Up</span>
              )}
            </button>
          </form>

          {/* Bottom Sign In Link */}
          <p className="mt-7 text-center text-sm font-normal text-[#080808]/65">
            Already have a HopOn account?{" "}
            <Link
              href="/login"
              className="font-bold text-[#080808] underline decoration-[#70C8F5] decoration-2 underline-offset-4 hover:text-[#70C8F5] transition-colors"
            >
              Sign in.
            </Link>
          </p>
        </div>

        {/* Subtle Mobile Footer */}
        <footer className="lg:hidden pt-4 text-center">
          <p className="text-xs font-medium text-[#080808]/50">
            Your next ride starts here. · Affordable rides. Verified students. Better journeys.
          </p>
        </footer>
      </main>
    </div>
  );
}
