import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ToastContext";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const poppins = Poppins({
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HopOn | Student Ride-Sharing Platform",
  description: "Affordable and trusted campus rides made exclusively for university students. Your campus. Your ride. Your community.",
  keywords: ["ride-sharing", "students", "carpool", "campus rides", "HopOn"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${poppins.variable} h-full antialiased`}>
      {/* suppressHydrationWarning: browser extensions often mutate <body> attributes before React hydrates */}
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
