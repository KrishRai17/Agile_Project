"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export type ToastType = "info" | "success" | "warning" | "error";

export interface ToastItem {
  id: string;
  title: string;
  message?: string;
  type?: ToastType;
}

interface ToastContextType {
  showToast: (title: string, message?: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback(
    (title: string, message?: string, type: ToastType = "info") => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { id, title, message, type }]);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast viewport */}
      <div
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0 pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const isSuccess = toast.type === "success";
          const isWarning = toast.type === "warning";
          const isError = toast.type === "error";

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto transform transition-all duration-300 ease-out flex items-start gap-3 p-4 rounded-xl shadow-xl border backdrop-blur-md animate-in slide-in-from-bottom-3 ${
                isSuccess
                  ? "bg-emerald-950/90 border-emerald-700/60 text-emerald-50"
                  : isError
                  ? "bg-rose-950/90 border-rose-700/60 text-rose-50"
                  : isWarning
                  ? "bg-amber-950/90 border-amber-700/60 text-amber-50"
                  : "bg-slate-900/95 border-slate-700/80 text-white"
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {isSuccess ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : isError ? (
                  <AlertCircle className="w-5 h-5 text-rose-400" />
                ) : isWarning ? (
                  <AlertCircle className="w-5 h-5 text-amber-400" />
                ) : (
                  <Info className="w-5 h-5 text-blue-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold tracking-wide leading-tight">
                  {toast.title}
                </p>
                {toast.message && (
                  <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                    {toast.message}
                  </p>
                )}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="shrink-0 p-1 rounded-md text-slate-400 hover:text-white transition-colors"
                aria-label="Close notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
