import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/apiAuth";
import { cleanText } from "@/lib/validate";
import {
  extractTextFromIdCardImage,
  validateIdCardImageDataUrl,
  verifyStudentIdText,
} from "@/lib/studentIdVerifier";

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonObject(req);
    if (!body) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }

    const registeredName = cleanText(body.registeredName, 80) ?? "";
    if (!registeredName || registeredName.length < 2) {
      return NextResponse.json(
        { error: "Please enter your full name before verifying your Student ID card." },
        { status: 400 }
      );
    }

    const validatedImage = validateIdCardImageDataUrl(body.idCardImage);
    const clientExtractedText =
      typeof body.idCardText === "string" ? body.idCardText.trim() : undefined;

    if (!validatedImage && !clientExtractedText) {
      return NextResponse.json(
        { error: "Please upload a valid photo of your Student ID card." },
        { status: 400 }
      );
    }

    const { text: extractedText, engine } = validatedImage
      ? await extractTextFromIdCardImage(validatedImage, clientExtractedText)
      : { text: clientExtractedText ?? "", engine: "text-input" };

    const referenceYear =
      typeof body.referenceYear === "number" &&
      Number.isInteger(body.referenceYear) &&
      body.referenceYear >= 2020 &&
      body.referenceYear <= 2035
        ? body.referenceYear
        : undefined;

    const registeredRollNumber =
      typeof body.registeredRollNumber === "string"
        ? body.registeredRollNumber.trim()
        : undefined;

    const verification = verifyStudentIdText({
      extractedText,
      registeredName,
      registeredRollNumber,
      referenceYear,
    });

    return NextResponse.json(
      {
        ...verification,
        engine,
      },
      { status: verification.verified ? 200 : 422 }
    );
  } catch (error) {
    console.error("Student ID verification error:", error);
    return NextResponse.json(
      { error: "Failed to process Student ID card image." },
      { status: 500 }
    );
  }
}
