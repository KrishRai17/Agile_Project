import { NextRequest, NextResponse } from "next/server";
import {
  createEmailVerificationToken,
  getUserSessionVersion,
  manuallyVerifyStudent,
  registerUser,
} from "@/lib/accounts";
import { recordVerificationAudit } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/mailer";
import { clientIp, readJsonObject, tooManyRequests } from "@/lib/apiAuth";
import { limiters } from "@/lib/limiters";
import {
  REMEMBER_ME_SECONDS,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
} from "@/lib/session";
import {
  extractTextFromIdCardImage,
  validateIdCardImageDataUrl,
  verifyStudentIdText,
  type StudentIdVerificationResult,
} from "@/lib/studentIdVerifier";
import { cleanText, cleanUpiId, cleanVehicleNumber, parseVehicleType } from "@/lib/validate";

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonObject(req);
    if (!body) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const name = cleanText(body.name, 80) ?? "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    let role: "passenger" | "driver" | "both" = "passenger";
    if (body.role === "both" || body.role === "rider") {
      role = "both";
    } else if (body.role === "driver") {
      role = "driver";
    } else if (body.role === "passenger") {
      role = "passenger";
    }
    const university = cleanText(body.university, 100) ?? undefined;
    const studentRollNumber =
      typeof body.studentRollNumber === "string" ? body.studentRollNumber.trim() : undefined;

    const vehicleType = parseVehicleType(body.vehicleType);
    const vehicleModel = cleanText(body.vehicleModel, 60);
    const vehicleNumber = cleanVehicleNumber(body.vehicleNumber);
    const upiId = typeof body.upiId === "string" ? body.upiId.trim() : undefined;
    const avatarUrl = typeof body.avatarUrl === "string" ? body.avatarUrl.trim() : undefined;

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, university email, and password are required." },
        { status: 400 }
      );
    }

    if (upiId && !cleanUpiId(upiId)) {
      return NextResponse.json(
        { error: "Invalid UPI ID. Format should be username@bank (e.g., name@okaxis)." },
        { status: 400 }
      );
    }

    if (role === "driver" || role === "both") {
      if (!vehicleType) {
        return NextResponse.json(
          { error: "Vehicle type must be Bike, Scooty, or Car." },
          { status: 400 }
        );
      }
      if (!vehicleModel || !vehicleNumber) {
        return NextResponse.json(
          {
            error:
              "Drivers and riders must supply a valid vehicle model and registration plate number (e.g., KA 04 EK 7142).",
          },
          { status: 400 }
        );
      }
    }

    const ip = clientIp(req.headers);
    if (ip === "unknown") {
      const globalCheck = limiters.registerGlobal.check("global:register");
      if (!globalCheck.allowed) {
        return tooManyRequests(globalCheck.retryAfterSec);
      }
    }
    const registerKey = ip !== "unknown" ? ip : `email:${email}`;
    const regCheck = limiters.register.check(registerKey);
    if (!regCheck.allowed) {
      return tooManyRequests(regCheck.retryAfterSec);
    }

    // Student ID Card OCR & 3-Condition Verification (when provided by registration form)
    const hasIdCardPayload =
      body.requireIdCardVerification === true ||
      body.idCardImage !== undefined ||
      body.idCardText !== undefined;

    let idVerificationResult: StudentIdVerificationResult | null = null;

    if (hasIdCardPayload) {
      const validatedImage = validateIdCardImageDataUrl(body.idCardImage);
      const clientExtractedText =
        typeof body.idCardText === "string" ? body.idCardText.trim() : undefined;

      if (!validatedImage && !clientExtractedText) {
        return NextResponse.json(
          {
            error: "Please upload a photo of your Student ID card to verify your account.",
          },
          { status: 400 }
        );
      }

      const { text: extractedText } = validatedImage
        ? await extractTextFromIdCardImage(validatedImage, clientExtractedText)
        : { text: clientExtractedText ?? "" };

      const referenceYear =
        typeof body.referenceYear === "number" &&
        Number.isInteger(body.referenceYear) &&
        body.referenceYear >= 2020 &&
        body.referenceYear <= 2035
          ? body.referenceYear
          : undefined;

      idVerificationResult = verifyStudentIdText({
        extractedText,
        registeredName: name,
        registeredRollNumber: studentRollNumber,
        referenceYear,
      });

      if (!idVerificationResult.verified) {
        return NextResponse.json(
          {
            error:
              idVerificationResult.error ??
              "Student ID card verification failed. Please upload a clear, valid Student ID card.",
            idVerification: idVerificationResult,
          },
          { status: 400 }
        );
      }
    }

    const result = registerUser({
      name,
      email,
      password,
      role,
      university,
      studentRollNumber,
      ...(upiId ? { upiId } : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
      ...(role === "driver" || role === "both"
        ? {
            vehicleType: vehicleType!,
            vehicleModel: vehicleModel!,
            vehicleNumber: vehicleNumber!,
          }
        : {}),
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    let finalUser = result;
    let emailSent = false;
    let message = "Verification link sent to your university email.";
    let verifyTokenForLocalDev: string | undefined;

    if (idVerificationResult?.verified) {
      // Automatically verify the student account once all 3 ID card checks pass
      const verifiedRes = manuallyVerifyStudent(email, studentRollNumber);
      if (verifiedRes.success && verifiedRes.user) {
        finalUser = verifiedRes.user;
      }
      recordVerificationAudit({
        studentEmail: email,
        rollNumber: studentRollNumber ?? null,
        method: "student_id_ocr",
        ip,
      });
      message = "Student ID card verified automatically.";
    } else {
      const verifyIssued = createEmailVerificationToken(result.id);
      if (!("error" in verifyIssued)) {
        verifyTokenForLocalDev = verifyIssued.token;
        const sendRes = await sendVerificationEmail(email, verifyIssued.token, name);
        if (sendRes.success) {
          emailSent = true;
        } else {
          emailSent = false;
          message =
            "Account registered, but we could not send the verification email. Please try resending from your account.";
        }
      }
    }

    const isLocalHost = ["localhost", "127.0.0.1"].includes(req.nextUrl.hostname);

    const response = NextResponse.json(
      {
        success: true,
        user: finalUser,
        verificationRequired: !finalUser.studentIdVerified,
        emailSent,
        message,
        ...(idVerificationResult ? { idVerification: idVerificationResult } : {}),
        ...(isLocalHost && verifyTokenForLocalDev
          ? { verificationToken: verifyTokenForLocalDev }
          : {}),
      },
      { status: 201 }
    );

    if (finalUser.studentIdVerified && body.redirectToLogin !== true) {
      const sessionVer = getUserSessionVersion(finalUser.id);
      const rememberMe = body.rememberMe !== false;
      const token = createSessionToken(
        finalUser.id,
        rememberMe ? REMEMBER_ME_SECONDS : SESSION_TTL_SECONDS,
        undefined,
        Date.now(),
        sessionVer
      );
      const isHttps =
        req.nextUrl.protocol === "https:" ||
        req.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https";

      response.cookies.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production" && isHttps,
        sameSite: "lax",
        path: "/",
        ...(rememberMe ? { maxAge: REMEMBER_ME_SECONDS } : {}),
      });
    }

    return response;
  } catch (error) {
    console.error("Auth register error:", error);
    return NextResponse.json(
      { error: "Internal server error during registration." },
      { status: 500 }
    );
  }
}
