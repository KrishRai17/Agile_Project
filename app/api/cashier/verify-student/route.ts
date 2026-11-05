import { NextRequest, NextResponse } from "next/server";
import { clientIp, readJsonObject, tooManyRequests } from "@/lib/apiAuth";
import { manuallyVerifyStudent } from "@/lib/accounts";
import { hasValidCashierSecret, isCashierSecretConfigured } from "@/lib/cashierAuth";
import { limiters } from "@/lib/limiters";
import { recordVerificationAudit } from "@/lib/db";

/**
 * POST /api/cashier/verify-student
 * Body: { studentEmail: string, studentRollNumber?: string, cashierSecret?: string }
 * Headers: x-cashier-secret
 *
 * Allows authorized campus staff/cashier with HOPON_CASHIER_SECRET to manually
 * verify a student ID card in person, immediately granting verified status and welcome bonus.
 */
export async function POST(req: NextRequest) {
  if (!isCashierSecretConfigured()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const ip = clientIp(req.headers);
  const rateKey = ip !== "unknown" ? ip : "global:cashier";
  const rateCheck = limiters.cashier.check(rateKey);
  if (!rateCheck.allowed) {
    return tooManyRequests(rateCheck.retryAfterSec);
  }

  try {
    const body = await readJsonObject(req);
    if (!body) {
      recordVerificationAudit({
        studentEmail: null,
        rollNumber: null,
        method: "cashier_secret",
        ip,
      });
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const studentEmail =
      typeof body.studentEmail === "string" ? body.studentEmail.trim().toLowerCase() : "";
    const studentRollNumber =
      typeof body.studentRollNumber === "string" ? body.studentRollNumber.trim() : undefined;

    if (!hasValidCashierSecret(req, body.cashierSecret)) {
      recordVerificationAudit({
        studentEmail: studentEmail || null,
        rollNumber: studentRollNumber || null,
        method: "cashier_secret",
        ip,
      });
      return NextResponse.json(
        { error: "Forbidden. Invalid cashier secret." },
        { status: 403 }
      );
    }

    if (!studentEmail) {
      recordVerificationAudit({
        studentEmail: null,
        rollNumber: studentRollNumber || null,
        method: "cashier_secret",
        ip,
      });
      return NextResponse.json(
        { error: "Student university email is required." },
        { status: 400 }
      );
    }

    const result = manuallyVerifyStudent(studentEmail, studentRollNumber);
    recordVerificationAudit({
      studentEmail,
      rollNumber: studentRollNumber || null,
      method: "cashier_secret",
      ip,
    });

    if (!result.success || !result.user) {
      return NextResponse.json({ error: result.error || "Verification failed." }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Student ${result.user.name} verified successfully.`,
      user: result.user,
    });
  } catch (err) {
    console.error("Cashier verify student error:", err);
    recordVerificationAudit({
      studentEmail: null,
      rollNumber: null,
      method: "cashier_secret",
      ip,
    });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
