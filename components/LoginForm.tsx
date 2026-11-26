"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import {
  clearStoredUser,
  isAdminUser,
  setStoredUser,
  type User,
} from "@/lib/auth";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password, remember: rememberMe }),
      });

      const data = (await res.json()) as {
        error?: string;
        user?: User;
      };

      if (!res.ok || !data.user) {
        setError(data.error ?? "Invalid email or password.");
        setIsLoading(false);
        return;
      }

      clearStoredUser();
      setStoredUser(data.user, rememberMe);
      router.replace(isAdminUser(data.user) ? "/admin" : "/home");
    } catch {
      setError("Network error while signing in. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full text-[#080808]">
      {/* Heading & Subtitle */}
      <div className="mb-8">
        <h2 className="text-3xl sm:text-[34px] font-extrabold tracking-tight text-[#080808] leading-tight">
          Welcome to HopOn.
        </h2>
        <p className="mt-2 text-base font-normal text-[#080808]/65">
          Sign in to continue your journey.
        </p>
      </div>

      {/* Continue with Google Button */}
      <button
        type="button"
        className="w-full h-12 rounded-xl bg-[#FFFFFF] border border-[#080808]/15 hover:bg-[#F4F9FC] hover:border-[#080808]/30 active:scale-[0.995] transition-all duration-150 flex items-center justify-center gap-3 text-sm font-semibold text-[#080808] shadow-[0_1px_2px_rgb(8,8,8,0.03)] cursor-pointer"
      >
        <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        <span>Continue with Google</span>
      </button>

      {/* OR Divider */}
      <div className="relative my-6 flex items-center" role="separator" aria-label="OR">
        <div className="flex-grow border-t border-[#080808]/10" />
        <span className="mx-4 shrink-0 text-xs font-semibold uppercase tracking-widest text-[#080808]/45">
          OR
        </span>
        <div className="flex-grow border-t border-[#080808]/10" />
      </div>

      {/* Login Form */}
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error && (
          <div
            role="alert"
            className="rounded-xl bg-[#F4F9FC] border border-[#080808]/15 px-4 py-3 text-xs font-medium text-[#080808]"
          >
            {error}
          </div>
        )}

        {/* Email Address Input */}
        <div className="space-y-2">
          <label
            htmlFor="login-email"
            className="block text-xs font-semibold uppercase tracking-wider text-[#080808]/80"
          >
            Email address
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError("");
            }}
            placeholder="name@university.edu"
            required
            className="w-full h-12 rounded-xl bg-[#F4F9FC] border border-[#080808]/12 px-4 text-sm text-[#080808] placeholder:text-[#080808]/40 focus:bg-[#FFFFFF] focus:border-[#70C8F5] focus:outline-none focus:ring-2 focus:ring-[#70C8F5]/30 transition-all duration-150"
          />
        </div>

        {/* Password Input with Eye Icon */}
        <div className="space-y-2">
          <label
            htmlFor="login-password"
            className="block text-xs font-semibold uppercase tracking-wider text-[#080808]/80"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError("");
              }}
              placeholder="Enter your password"
              required
              className="w-full h-12 rounded-xl bg-[#F4F9FC] border border-[#080808]/12 pl-4 pr-11 text-sm text-[#080808] placeholder:text-[#080808]/40 focus:bg-[#FFFFFF] focus:border-[#70C8F5] focus:outline-none focus:ring-2 focus:ring-[#70C8F5]/30 transition-all duration-150"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#080808]/45 hover:text-[#080808] transition-colors cursor-pointer"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Remember Me & Forgot Password */}
        <div className="flex items-center justify-between pt-0.5">
          <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-[#080808]/25 bg-[#F4F9FC] text-[#70C8F5] focus:ring-[#70C8F5] focus:ring-offset-0 accent-[#70C8F5] cursor-pointer"
            />
            <span className="text-sm font-medium text-[#080808]/75">
              Remember me
            </span>
          </label>

          <a
            href="#forgot-password"
            onClick={(e) => e.preventDefault()}
            className="text-sm font-semibold text-[#080808] hover:text-[#70C8F5] transition-colors"
          >
            Forgot password?
          </a>
        </div>

        {/* Large Sky-Blue Sign In Button with Black Text */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full h-12 rounded-xl bg-[#70C8F5] hover:bg-[#5ec0f2] active:scale-[0.995] text-[#080808] text-base font-bold tracking-tight transition-all duration-150 shadow-[0_2px_10px_rgb(112,200,245,0.25)] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
        >
          {isLoading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      {/* Bottom Sign Up Link */}
      <p className="mt-8 text-center text-sm font-normal text-[#080808]/65">
        New to HopOn?{" "}
        <Link
          href="/register"
          className="font-bold text-[#080808] underline decoration-[#70C8F5] decoration-2 underline-offset-4 hover:text-[#70C8F5] transition-colors"
        >
          Sign up.
        </Link>
      </p>
    </div>
  );
}
