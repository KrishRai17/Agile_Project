/**
 * Student ID Card Text Extraction & 3-Point Verification Engine.
 *
 * Verifies three required conditions from the extracted OCR text of a Student ID Card:
 *  a) Institution Keyword: Matches "University", "Institution", or "College"
 *  b) Student Name: Matches the student name with the registered name on the website
 *  c) Expiration / Academic Year: Confirms active enrollment (ID card is not expired)
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export interface IdCheckDetail {
  passed: boolean;
  detail: string;
  matchedValue?: string | null;
}

export interface StudentIdVerificationResult {
  verified: boolean;
  extractedText: string;
  checks: {
    institution: IdCheckDetail;
    name: IdCheckDetail;
    rollNumber: IdCheckDetail;
    expiration: IdCheckDetail;
  };
  error?: string;
}

const INSTITUTION_KEYWORDS: Array<{ match: string; label: string }> = [
  { match: "university", label: "University" },
  { match: "institution", label: "Institution" },
  { match: "college", label: "College" },
  { match: "institute", label: "Institution" },
  { match: "autonomous", label: "Institution" },
  { match: "kristu jayanti", label: "University" },
  { match: "academy", label: "Institution" },
];

// Common OCR character confusions for University / Institution / College
const INSTITUTION_OCR_PATTERNS: Array<{ keyword: string; regex: RegExp }> = [
  {
    keyword: "University",
    regex: /\bun[i1l|]vers[i1l|]t[yie]|\buniv\b/i,
  },
  {
    keyword: "Institution",
    regex: /\b[i1l|]nst[i1l|]tut[i1l|][o0]n|\b[i1l|]nst[i1l|]tute\b/i,
  },
  {
    keyword: "College",
    regex: /\bc[o0][l1i|]{1,2}eg[e3]?\b/i,
  },
];

/**
 * Computes Levenshtein edit distance between two lowercase strings for minor OCR typo tolerance.
 */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

/**
 * Condition (a): Matches keyword University, Institution, or College.
 */
export function checkInstitutionKeyword(extractedText: string): IdCheckDetail {
  const normalized = extractedText.toLowerCase();

  for (const { match, label } of INSTITUTION_KEYWORDS) {
    if (normalized.includes(match)) {
      return {
        passed: true,
        matchedValue: label,
        detail: `Matched institution keyword "${label}".`,
      };
    }
  }

  for (const { keyword, regex } of INSTITUTION_OCR_PATTERNS) {
    if (regex.test(extractedText)) {
      return {
        passed: true,
        matchedValue: keyword,
        detail: `Matched institution keyword "${keyword}".`,
      };
    }
  }

  return {
    passed: false,
    matchedValue: null,
    detail:
      'ID card must contain at least one institution keyword: "University", "Institution", or "College".',
  };
}

/**
 * Condition (b): Matches the student name on the ID card with the registered name on the website.
 */
export function checkStudentNameMatch(
  extractedText: string,
  registeredName: string
): IdCheckDetail {
  const cleanRegName = registeredName
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleanRegName || cleanRegName.length < 2) {
    return {
      passed: false,
      matchedValue: null,
      detail: "Registered student name is missing or too short.",
    };
  }

  const cleanExtracted = extractedText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleanExtracted) {
    return {
      passed: false,
      matchedValue: null,
      detail: `Could not match registered name "${registeredName}" because no text was extracted from the ID card.`,
    };
  }

  // Direct substring match
  if (cleanExtracted.includes(cleanRegName)) {
    return {
      passed: true,
      matchedValue: registeredName.trim(),
      detail: `Matched student name "${registeredName.trim()}" on ID card.`,
    };
  }

  // Token-level match (ignoring 1-character initials unless the entire name is 1 token)
  const rawTokens = cleanRegName.split(" ").filter(Boolean);
  const significantTokens = rawTokens.filter((t) => t.length >= 2);
  const tokensToVerify = significantTokens.length > 0 ? significantTokens : rawTokens;
  const extractedWords = cleanExtracted.split(" ").filter(Boolean);

  const matchedTokens: string[] = [];

  for (const token of tokensToVerify) {
    const exactOrSubstring = extractedWords.some(
      (w) => w === token || (token.length >= 3 && (w.includes(token) || token.includes(w) && w.length >= 3))
    );
    if (exactOrSubstring) {
      matchedTokens.push(token);
      continue;
    }

    // Allow 1-character OCR typo for name tokens >= 3 chars (or 2 chars for >= 6 chars)
    if (token.length >= 3) {
      const maxDist = token.length >= 6 ? 2 : 1;
      const fuzzyMatch = extractedWords.some(
        (w) =>
          Math.abs(w.length - token.length) <= maxDist &&
          levenshteinDistance(w, token) <= maxDist
      );
      if (fuzzyMatch) {
        matchedTokens.push(token);
      }
    }
  }

  const requiredMatches =
    tokensToVerify.length <= 2 ? tokensToVerify.length : Math.ceil(tokensToVerify.length * 0.6);

  if (tokensToVerify.length > 0 && matchedTokens.length >= requiredMatches) {
    return {
      passed: true,
      matchedValue: registeredName.trim(),
      detail: `Matched student name "${registeredName.trim()}" on ID card.`,
    };
  }

  return {
    passed: false,
    matchedValue: null,
    detail: `Student name on the ID card does not match the registered name "${registeredName.trim()}".`,
  };
}

/**
 * Condition (c): Expiration / Academic Year check to confirm active enrollment
 * and verify the student ID card is not expired.
 */
export function checkExpirationOrAcademicYear(
  extractedText: string,
  referenceYear: number = 2025
): IdCheckDetail {
  const text = extractedText.replace(/[–—−]/g, "-");

  interface DetectedYearSpan {
    label: string;
    endYear: number;
    startYear?: number;
  }

  const detectedSpans: DetectedYearSpan[] = [];

  // 1. Match academic year ranges like "2023-2026", "2024 - 2027", "2024/2027", "2024 - 27", "2025-28"
  const rangeRegex = /\b(20\d{2})\s*[-/]\s*(20\d{2}|\d{2})\b/g;
  let match: RegExpExecArray | null;
  while ((match = rangeRegex.exec(text)) !== null) {
    const startYear = Number.parseInt(match[1], 10);
    const rawEnd = match[2];
    const endYear =
      rawEnd.length === 2
        ? Number.parseInt(`20${rawEnd}`, 10)
        : Number.parseInt(rawEnd, 10);

    if (
      startYear >= 2010 &&
      startYear <= 2035 &&
      endYear >= startYear &&
      endYear <= startYear + 8
    ) {
      detectedSpans.push({
        label: `${startYear}-${endYear}`,
        startYear,
        endYear,
      });
    }
  }

  // 2. Match explicit expiration / validity / batch / academic year labels
  // e.g. "Valid Thru: 05/2027", "Valid Till 2026", "Expiry: 2027", "Batch 2027", "Academic Year 2026"
  const labeledYearRegex =
    /\b(?:valid\s*(?:thru|through|till|upto|until)?|exp(?:iry|ires|iration)?|academic\s*year|batch|session|enrolled|year)\b[^0-9\n]{0,25}(?:(?:0?[1-9]|1[0-2])\s*[-/]\s*)?(20\d{2})\b/gi;
  while ((match = labeledYearRegex.exec(text)) !== null) {
    const year = Number.parseInt(match[1], 10);
    if (year >= 2010 && year <= 2035) {
      detectedSpans.push({
        label: `${year}`,
        endYear: year,
      });
    }
  }

  // 3. Match MM/YYYY or DD/MM/YYYY dates (e.g., "05/2027" or "31/05/2027")
  const dateYearRegex = /\b(?:[0-3]?\d\s*[-/]\s*)?(?:0?[1-9]|1[0-2])\s*[-/]\s*(20\d{2})\b/g;
  while ((match = dateYearRegex.exec(text)) !== null) {
    const year = Number.parseInt(match[1], 10);
    if (year >= 2010 && year <= 2035) {
      detectedSpans.push({
        label: match[0].trim(),
        endYear: year,
      });
    }
  }

  // 4. Fallback: standalone 4-digit years (2015..2035)
  if (detectedSpans.length === 0) {
    const standaloneYearRegex = /\b(20[1-3]\d)\b/g;
    while ((match = standaloneYearRegex.exec(text)) !== null) {
      const year = Number.parseInt(match[1], 10);
      if (year >= 2015 && year <= 2035) {
        detectedSpans.push({
          label: `${year}`,
          endYear: year,
        });
      }
    }
  }

  // 5. Fallback: Student Roll Number batch prefix (e.g. "23BCAC45", "24BCAC45", "25MBA102")
  // In Indian universities (including KJU), roll numbers begin with the 2-digit admission year (e.g. 23 -> 2023-2026)
  if (detectedSpans.length === 0) {
    const rollPrefixRegex = /\b(2[2-8])[A-Z]{2,6}\d{1,5}\b/i;
    const rollMatch = rollPrefixRegex.exec(text);
    if (rollMatch) {
      const admissionYear = Number.parseInt(`20${rollMatch[1]}`, 10);
      const graduationYear = admissionYear + 3;
      detectedSpans.push({
        label: `${admissionYear}-${graduationYear}`,
        startYear: admissionYear,
        endYear: graduationYear,
      });
    }
  }

  if (detectedSpans.length === 0) {
    return {
      passed: false,
      matchedValue: null,
      detail:
        "Could not detect an academic year or expiration date on the ID card (e.g., 2024-2027 or Valid Thru 2027).",
    };
  }

  // Find the highest endYear on the card
  const bestSpan = detectedSpans.reduce((best, curr) =>
    curr.endYear > best.endYear ? curr : best
  );

  if (bestSpan.endYear >= referenceYear) {
    return {
      passed: true,
      matchedValue: bestSpan.label,
      detail: `Confirmed active enrollment (${bestSpan.label} is valid and not expired).`,
    };
  }

  return {
    passed: false,
    matchedValue: bestSpan.label,
    detail: `Student ID card is expired (detected academic/expiration year ${bestSpan.label}, which is before ${referenceYear}).`,
  };
}

/**
 * Normalizes common OCR character confusions in alphanumeric roll/ID numbers
 * (e.g. O <-> 0, I/L <-> 1, S <-> 5, B <-> 8, Z <-> 2).
 */
function normalizeOcrAlphanumeric(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/S/g, "5")
    .replace(/B/g, "8")
    .replace(/Z/g, "2");
}

/**
 * Verifies that the Student Roll / ID Number entered in the form matches the roll / ID number
 * extracted from the Student ID card image.
 */
export function checkRollNumberMatch(
  extractedText: string,
  registeredRollNumber?: string
): IdCheckDetail {
  if (registeredRollNumber === undefined) {
    return {
      passed: true,
      matchedValue: null,
      detail: "Roll number check not requested.",
    };
  }

  const cleanRoll = registeredRollNumber
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();

  if (!cleanRoll || cleanRoll.length < 3) {
    return {
      passed: false,
      matchedValue: null,
      detail: "Student Roll / ID Number is missing or too short.",
    };
  }

  const compactExtracted = extractedText.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!compactExtracted) {
    return {
      passed: false,
      matchedValue: null,
      detail: `Could not match Roll Number "${registeredRollNumber.trim()}" because no text was extracted from the ID card.`,
    };
  }

  // 1. Direct alphanumeric match
  if (compactExtracted.includes(cleanRoll)) {
    return {
      passed: true,
      matchedValue: registeredRollNumber.trim().toUpperCase(),
      detail: `Matched student Roll / ID Number "${registeredRollNumber.trim().toUpperCase()}" on ID card.`,
    };
  }

  // 2. OCR confusion-tolerant match (O/0, I/1, S/5, B/8, Z/2) across tokens or compact string
  const normalizedTarget = normalizeOcrAlphanumeric(cleanRoll);
  const normalizedCompact = normalizeOcrAlphanumeric(compactExtracted);

  if (normalizedTarget.length >= 4 && normalizedCompact.includes(normalizedTarget)) {
    return {
      passed: true,
      matchedValue: registeredRollNumber.trim().toUpperCase(),
      detail: `Matched student Roll / ID Number "${registeredRollNumber.trim().toUpperCase()}" on ID card.`,
    };
  }

  return {
    passed: false,
    matchedValue: null,
    detail: `Roll / ID Number on the ID card does not match the entered Roll Number "${registeredRollNumber.trim().toUpperCase()}".`,
  };
}

/**
 * Step 3 Script: Runs all verification conditions on the extracted text from the Student ID Card.
 */
export function verifyStudentIdText(params: {
  extractedText: string;
  registeredName: string;
  registeredRollNumber?: string;
  referenceYear?: number;
}): StudentIdVerificationResult {
  const extractedText = (params.extractedText ?? "").trim();
  const registeredName = (params.registeredName ?? "").trim();
  const referenceYear = params.referenceYear ?? 2025;

  const institution = checkInstitutionKeyword(extractedText);
  const name = checkStudentNameMatch(extractedText, registeredName);
  const rollNumber = checkRollNumberMatch(extractedText, params.registeredRollNumber);
  const expiration = checkExpirationOrAcademicYear(extractedText, referenceYear);

  const verified =
    institution.passed && name.passed && rollNumber.passed && expiration.passed;

  const failedReasons: string[] = [];
  if (!institution.passed) failedReasons.push(institution.detail);
  if (!name.passed) failedReasons.push(name.detail);
  if (!rollNumber.passed) failedReasons.push(rollNumber.detail);
  if (!expiration.passed) failedReasons.push(expiration.detail);

  return {
    verified,
    extractedText,
    checks: {
      institution,
      name,
      rollNumber,
      expiration,
    },
    ...(failedReasons.length > 0 ? { error: failedReasons.join(" ") } : {}),
  };
}

const MAX_ID_CARD_IMAGE_CHARS = 5_000_000; // ~3.5 MB base64 image limit

export function validateIdCardImageDataUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_ID_CARD_IMAGE_CHARS) return null;
  const match = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/i.exec(
    trimmed
  );
  if (!match) return null;
  return trimmed;
}

/**
 * Runs native macOS Vision OCR on a base64 image data URL using `.data/bin/vision_ocr`.
 */
function runLocalVisionOcr(imageDataUrl: string): string {
  const visionBin = resolve(process.cwd(), ".data", "bin", "vision_ocr");
  if (!existsSync(visionBin)) return "";

  const commaIdx = imageDataUrl.indexOf(",");
  if (commaIdx < 0) return "";
  const header = imageDataUrl.slice(0, commaIdx).toLowerCase();
  const base64Data = imageDataUrl.slice(commaIdx + 1);

  let ext = "png";
  if (header.includes("jpeg") || header.includes("jpg")) ext = "jpg";
  else if (header.includes("webp")) ext = "webp";

  const tempFile = join(
    tmpdir(),
    `hopon_id_${Date.now()}_${randomBytes(4).toString("hex")}.${ext}`
  );

  try {
    writeFileSync(tempFile, Buffer.from(base64Data, "base64"));
    const output = execFileSync(visionBin, [tempFile], {
      encoding: "utf8",
      timeout: 8000,
    });
    return output.trim();
  } catch {
    return "";
  } finally {
    try {
      unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Step 2 Helper: Extracts words from an ID card image using:
 *  1. SVG text decoding if the image is a base64 SVG
 *  2. Local macOS Vision Framework OCR (`VNRecognizeTextRequest`) on the uploaded image
 *  3. External OCR Text Extract API (OCR.space) if OCR_SPACE_API_KEY is configured
 *  4. Client-provided OCR text if present
 */
export async function extractTextFromIdCardImage(
  imageDataUrl: string,
  clientExtractedText?: string
): Promise<{ text: string; engine: string }> {
  // 1. If base64 SVG image, extract text nodes directly
  if (imageDataUrl.startsWith("data:image/svg+xml;base64,")) {
    try {
      const b64 = imageDataUrl.slice("data:image/svg+xml;base64,".length);
      const svgXml = Buffer.from(b64, "utf8").length > 0
        ? Buffer.from(b64, "base64").toString("utf8")
        : "";
      const textContent = svgXml
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (textContent) {
        return { text: textContent, engine: "svg-text-extract" };
      }
    } catch {
      // Fall through
    }
  }

  // 2. Run fast local Vision OCR on the uploaded image pixels
  const visionText = runLocalVisionOcr(imageDataUrl);
  if (visionText) {
    const combined = clientExtractedText
      ? `${visionText}\n${clientExtractedText}`
      : visionText;
    return { text: combined.trim(), engine: "vision-ocr" };
  }

  // 3. If OCR_SPACE_API_KEY is configured, call the OCR Text Extract API
  const ocrApiKey = process.env.OCR_SPACE_API_KEY?.trim();
  if (ocrApiKey) {
    try {
      const formData = new URLSearchParams();
      formData.append("base64Image", imageDataUrl);
      formData.append("language", "eng");
      formData.append("isOverlayRequired", "false");
      formData.append("OCREngine", "2");

      const res = await fetch("https://api.ocr.space/parse/image", {
        method: "POST",
        headers: {
          apikey: ocrApiKey,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          ParsedResults?: Array<{ ParsedText?: string }>;
        };
        const parsed = data.ParsedResults?.map((r) => r.ParsedText ?? "")
          .join("\n")
          .trim();
        if (parsed) {
          return { text: parsed, engine: "ocr.space-api" };
        }
      }
    } catch {
      // Fall through
    }
  }

  // 4. Use client-extracted text if available
  if (typeof clientExtractedText === "string" && clientExtractedText.trim().length > 0) {
    return { text: clientExtractedText.trim(), engine: "client-ocr" };
  }

  return { text: "", engine: "ocr-empty" };
}
