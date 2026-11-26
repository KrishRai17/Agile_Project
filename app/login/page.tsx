"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { getStoredUser, isAdminUser, syncSession } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    const cached = getStoredUser();
    if (cached) {
      router.replace(isAdminUser(cached) ? "/admin" : "/home");
      return;
    }
    void syncSession().then((user) => {
      if (user) {
        router.replace(isAdminUser(user) ? "/admin" : "/home");
      }
    });
  }, [router]);

  return (
    <div className="min-h-screen w-full bg-[#FFFFFF] text-[#080808] flex flex-col lg:flex-row antialiased selection:bg-[#70C8F5]/30 selection:text-[#080808]">
      {/* Left Section (50% on Desktop) */}
      <section className="hidden lg:flex lg:w-1/2 min-h-screen bg-[#F4F9FC] border-r border-[#080808]/[0.06] flex-col justify-between p-12 xl:p-16 relative overflow-hidden">
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
          <div className="flex items-center gap-3.5">
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
          </div>
        </div>

        {/* Center Hero Copy & Minimal Mobility Visual */}
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
                  Verified Campus Ride
                </span>
              </div>

              {/* Bottom floating Uber-style route bar */}
              <div className="absolute inset-x-4 bottom-4 rounded-xl bg-[#FFFFFF]/95 backdrop-blur-md border border-[#080808]/[0.08] px-4 py-3 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#080808]" />
                    <span className="w-5 border-t border-dashed border-[#70C8F5]" />
                    <span className="h-2 w-2 rounded-full bg-[#70C8F5]" />
                  </div>
                  <div className="text-xs font-semibold text-[#080808]">
                    Main Campus Gate <span className="text-[#080808]/40 mx-1">→</span> Student Hub
                  </div>
                </div>
                <span className="rounded-lg bg-[#70C8F5]/20 px-2.5 py-1 text-[11px] font-bold text-[#080808]">
                  2 min away
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

      {/* Right Section (50% on Desktop, Full Single-Column on Mobile/Tablet) */}
      <main className="w-full lg:w-1/2 min-h-screen bg-[#FFFFFF] flex flex-col justify-between px-6 py-8 sm:px-12 md:px-16 lg:px-14 xl:px-24">
        {/* Mobile & Tablet Top Header (Logo at the top, login form below) */}
        <header className="lg:hidden flex items-center justify-between pb-6 border-b border-[#080808]/[0.06]">
          <div className="flex items-center gap-3">
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
          </div>
          <span className="rounded-full bg-[#F4F9FC] border border-[#70C8F5]/40 px-3 py-1 text-[11px] font-semibold text-[#080808]">
            Exclusively for students.
          </span>
        </header>

        {/* Vertically Centered Login Form */}
        <div className="my-auto w-full max-w-[420px] mx-auto py-8">
          <LoginForm />
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
