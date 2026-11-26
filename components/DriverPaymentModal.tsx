"use client";

import React, { useState, useMemo } from "react";
import QRCode from "qrcode";
import { CheckCircle2, AlertCircle, X, Loader2, ArrowRight, ShieldCheck, Wallet } from "lucide-react";
import { maskUpiId } from "@/lib/upi";

interface DriverPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  requestId: string;
  from: string;
  to: string;
  fareAmount: number;
  paymentMethod: "wallet" | "upi";
  paymentStatus: "none" | "wallet_paid" | "pending" | "paid";
  upiUri?: string;
  driverUpiId?: string;
  driverQrImage?: string;
  onPaymentConfirmed?: () => void;
}

interface UpiQrCodeProps {
  uri: string;
  amountRupees: number;
}

function UpiQrCode({ uri, amountRupees }: UpiQrCodeProps) {
  const qr = useMemo(() => {
    try {
      return QRCode.create(uri, { errorCorrectionLevel: "M" });
    } catch {
      return null;
    }
  }, [uri]);

  if (!qr) {
    return (
      <div className="w-[220px] h-[220px] rounded-2xl bg-slate-100 flex items-center justify-center text-xs text-slate-500 font-semibold p-4 text-center">
        QR code unavailable
      </div>
    );
  }

  const size = qr.modules.size;
  const margin = 4;
  const totalSize = size + margin * 2;

  let path = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (qr.modules.get(x, y)) {
        path += `M${x + margin},${y + margin}h1v1h-1z `;
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${totalSize} ${totalSize}`}
      role="img"
      aria-label={`UPI payment QR code for ₹${amountRupees.toFixed(2)}`}
      className="w-[220px] h-[220px] rounded-2xl bg-white p-2 shadow-inner border border-slate-200"
      shapeRendering="crispEdges"
    >
      <rect width="100%" height="100%" fill="#ffffff" />
      <path d={path} fill="#0f172a" />
    </svg>
  );
}

export default function DriverPaymentModal({
  isOpen,
  onClose,
  requestId,
  from,
  to,
  fareAmount,
  paymentMethod,
  paymentStatus,
  upiUri,
  driverUpiId,
  driverQrImage,
  onPaymentConfirmed,
}: DriverPaymentModalProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(paymentStatus === "paid");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [qrMode, setQrMode] = useState<"uploaded" | "generated">(
    driverQrImage ? "uploaded" : "generated"
  );

  if (!isOpen) return null;

  const isWallet = paymentMethod === "wallet";
  const isPaid = confirmed || paymentStatus === "paid" || paymentStatus === "wallet_paid";

  const handleConfirmPayment = async () => {
    setIsConfirming(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/rides/requests/respond", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          action: "confirm_payment",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error || "Could not confirm payment. Please try again.");
        return;
      }
      setConfirmed(true);
      onPaymentConfirmed?.();
    } catch {
      setErrorMsg("Network error. Please try again.");
    } finally {
      setIsConfirming(false);
    }
  };

  const maskedVpa = driverUpiId ? maskUpiId(driverUpiId) : "unavailable";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="driver-payment-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 sm:p-6 pb-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              isWallet ? "bg-emerald-50 text-emerald-600" : "bg-sky-50 text-[#0284c7]"
            }`}>
              {isWallet ? <Wallet className="w-5 h-5" /> : <span className="font-black text-sm">UPI</span>}
            </div>
            <div>
              <h2 id="driver-payment-title" className="text-base font-black text-slate-900 font-heading">
                {isWallet ? "Trip Completed" : "Passenger Fare Collection"}
              </h2>
              <p className="text-xs text-slate-500">
                {isWallet ? "HopOn Wallet Settlement" : "Direct In-Person UPI Payment"}
              </p>
            </div>
          </div>
          {(isWallet || isPaid) && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 text-center">
          {/* Fare Amount */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Trip Fare
            </span>
            <div className="text-4xl font-black text-slate-900 mt-0.5">
              ₹{Number(fareAmount || 0)}
            </div>
            {/* Route Summary */}
            <div className="mt-2 text-xs text-slate-600 flex items-center justify-center gap-1.5 font-medium px-3 py-1 bg-slate-50 rounded-full border border-slate-100 max-w-sm mx-auto truncate">
              <span className="truncate">{from || "Campus"}</span>
              <ArrowRight className="w-3 h-3 shrink-0 text-slate-400" />
              <span className="truncate">{to || "Destination"}</span>
            </div>
          </div>

          {/* Wallet Ride State */}
          {isWallet && (
            <div className="p-5 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <p className="text-sm font-extrabold text-emerald-950">
                Paid via HopOn wallet ₹{Number(fareAmount || 0)} ✓
              </p>
              <p className="text-xs text-emerald-800">
                The fare has been credited to your student wallet balance.
              </p>
            </div>
          )}

          {/* UPI Ride State */}
          {!isWallet && (
            <>
              {isPaid ? (
                <div className="p-5 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <p className="text-sm font-extrabold text-emerald-950">
                    Payment Confirmed! ✓
                  </p>
                  <p className="text-xs text-emerald-800">
                    You confirmed receipt of ₹{Number(fareAmount || 0)} via UPI.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* QR Code Container */}
                  <div className="flex flex-col items-center justify-center">
                    {driverQrImage && upiUri && (
                      <div className="inline-flex rounded-xl bg-slate-100 p-1 mb-3 text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={() => setQrMode("uploaded")}
                          className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                            qrMode === "uploaded"
                              ? "bg-white text-slate-900 shadow-xs"
                              : "text-slate-500 hover:text-slate-700"
                          }`}
                        >
                          My Uploaded QR
                        </button>
                        <button
                          type="button"
                          onClick={() => setQrMode("generated")}
                          className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                            qrMode === "generated"
                              ? "bg-white text-slate-900 shadow-xs"
                              : "text-slate-500 hover:text-slate-700"
                          }`}
                        >
                          Amount-Locked QR
                        </button>
                      </div>
                    )}

                    {qrMode === "uploaded" && driverQrImage ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={driverQrImage}
                        alt="Rider uploaded UPI QR code"
                        className="w-[220px] h-[220px] object-contain rounded-2xl bg-white p-2 shadow-inner border border-slate-200"
                      />
                    ) : upiUri ? (
                      <UpiQrCode uri={upiUri} amountRupees={fareAmount} />
                    ) : driverQrImage ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={driverQrImage}
                        alt="Rider uploaded UPI QR code"
                        className="w-[220px] h-[220px] object-contain rounded-2xl bg-white p-2 shadow-inner border border-slate-200"
                      />
                    ) : (
                      <div className="w-[220px] h-[220px] rounded-2xl bg-slate-100 flex flex-col items-center justify-center text-xs text-slate-500 font-semibold p-4 text-center space-y-1">
                        <AlertCircle className="w-6 h-6 text-amber-500" />
                        <span>UPI QR unavailable</span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          Upload a QR code or set your UPI ID in Profile Settings
                        </span>
                      </div>
                    )}
                    <p className="text-xs font-bold text-slate-800 mt-2">
                      Scan with any UPI app
                    </p>
                    {driverUpiId && (
                      <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                        UPI ID: {maskedVpa}
                      </p>
                    )}
                  </div>

                  {/* Honest Disclosure / Warning */}
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-left text-[11px] text-amber-900 flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Check your UPI app</p>
                      <p className="mt-0.5 text-amber-800">
                        Confirm only after you see the payment in your UPI app. There is no server-side verification.
                      </p>
                    </div>
                  </div>

                  {errorMsg && (
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold flex items-center gap-1.5 justify-center">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{errorMsg}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Action Buttons */}
          <div className="pt-2 space-y-2">
            {isWallet || isPaid ? (
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition-all cursor-pointer shadow-md"
              >
                Close &amp; Rate Passenger
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={isConfirming}
                  onClick={() => void handleConfirmPayment()}
                  className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-sm shadow-md shadow-emerald-600/25 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  {isConfirming ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Confirming...</span>
                    </>
                  ) : (
                    <span>Payment received</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 px-4 rounded-xl hover:bg-slate-100 text-slate-600 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Collect later (accessible from My Rides)
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

