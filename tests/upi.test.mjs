import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./support/load-ts.mjs";

const upiModule = await loadTs("lib/upi.ts");
const validateModule = await loadTs("lib/validate.ts");

const { buildUpiUri, buildUpiNote, formatUpiAmount, maskUpiId } = upiModule;
const { cleanUpiId, cleanUpiQrImage, parseFare, parsePaymentMethod } = validateModule;

test("cleanUpiId validates and trims VPAs", () => {
  assert.equal(cleanUpiId("aarav.mehta@okaxis"), "aarav.mehta@okaxis");
  assert.equal(cleanUpiId("  Student_01@okhdfcbank  "), "student_01@okhdfcbank");
  assert.equal(cleanUpiId("user-name@paytm"), "user-name@paytm");
  assert.equal(cleanUpiId(""), null);
  assert.equal(cleanUpiId("notanemail"), null);
  assert.equal(cleanUpiId("@okaxis"), null);
  assert.equal(cleanUpiId("name@"), null);
  assert.equal(cleanUpiId(123), null);
  assert.equal(cleanUpiId(null), null);
});

test("parsePaymentMethod returns 'wallet' or 'upi' and defaults to 'wallet'", () => {
  assert.equal(parsePaymentMethod(undefined), "wallet");
  assert.equal(parsePaymentMethod(null), "wallet");
  assert.equal(parsePaymentMethod(""), "wallet");
  assert.equal(parsePaymentMethod("wallet"), "wallet");
  assert.equal(parsePaymentMethod("WALLET"), "wallet");
  assert.equal(parsePaymentMethod("upi"), "upi");
  assert.equal(parsePaymentMethod("UPI"), "upi");
  assert.equal(parsePaymentMethod("cash"), null);
  assert.equal(parsePaymentMethod("crypto"), null);
  assert.equal(parsePaymentMethod(99), null);
});

test("formatUpiAmount formats strictly as two decimals", () => {
  assert.equal(formatUpiAmount(35), "35.00");
  assert.equal(formatUpiAmount(75), "75.00");
  assert.equal(formatUpiAmount(120), "120.00");
  assert.throws(() => formatUpiAmount(0), /positive finite number/);
  assert.throws(() => formatUpiAmount(-1), /positive finite number/);
  assert.throws(() => formatUpiAmount(NaN), /positive finite number/);
});

test("buildUpiNote generates safe note with last 6 chars of request id and no PII", () => {
  assert.equal(buildUpiNote("req_1794028812345_abc123"), "HopOn ride abc123");
  assert.equal(buildUpiNote("short"), "HopOn ride short");
});

test("maskUpiId masks the handle while preserving handle prefix and bank suffix", () => {
  assert.equal(maskUpiId("aarav.mehta@okaxis"), "aa***@okaxis");
  assert.equal(maskUpiId("rohan@okhdfcbank"), "ro***@okhdfcbank");
  assert.equal(maskUpiId("ab@icici"), "ab***@icici");
});

test("buildUpiUri generates exact URI with encoded params and payee name capped to 40 chars", () => {
  const uri = buildUpiUri({
    vpa: "aarav.mehta@okaxis",
    payeeName: "Aarav Mehta & Co. Campus Drivers Long Name That Exceeds Forty Characters",
    amountRupees: 75,
    requestId: "req_1794028812345_def456",
  });

  assert.ok(uri.startsWith("upi://pay?"));
  const url = new URL(uri);
  assert.equal(url.searchParams.get("pa"), "aarav.mehta@okaxis");
  // Payee name should be trimmed to <= 40 chars
  const pn = url.searchParams.get("pn");
  assert.ok(pn && pn.length <= 40);
  assert.equal(url.searchParams.get("am"), "75.00");
  assert.equal(url.searchParams.get("cu"), "INR");
  assert.equal(url.searchParams.get("tn"), "HopOn ride def456");

  // Verify passenger name or locations are NOT leaked in URL
  assert.ok(!uri.includes("Aarav Mehta & Co. Campus Drivers Long Name That Exceeds Forty Characters"));
});

test("buildUpiUri rejects invalid parameters", () => {
  assert.throws(
    () =>
      buildUpiUri({
        vpa: "invalid",
        payeeName: "Aarav",
        amountRupees: 50,
        requestId: "req_123456",
      }),
    /Invalid UPI VPA/
  );

  assert.throws(
    () =>
      buildUpiUri({
        vpa: "aarav@okaxis",
        payeeName: "Aarav",
        amountRupees: 0,
        requestId: "req_123456",
      }),
    /positive finite number/
  );
});

test("cleanUpiQrImage validates safe image data URLs and rejects invalid/oversized payloads", () => {
  const validPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  assert.equal(cleanUpiQrImage(validPng), validPng);
  assert.equal(cleanUpiQrImage("data:image/svg+xml;base64,PHN2Zz4="), null);
  assert.equal(cleanUpiQrImage("javascript:alert(1)"), null);
  assert.equal(cleanUpiQrImage(""), null);
  assert.equal(cleanUpiQrImage(null), null);
  assert.equal(cleanUpiQrImage(`data:image/png;base64,${"A".repeat(760_000)}`), null);
});

test("parseFare strips rupee currency formatting while rejecting invalid values", () => {
  assert.equal(parseFare("₹35"), "35");
  assert.equal(parseFare("₹ 1,200"), "1200");
  assert.equal(parseFare("75.4"), "75");
  assert.equal(parseFare(35), "35");
  assert.equal(parseFare("-5"), null);
  assert.equal(parseFare("abc"), null);
  assert.equal(parseFare("₹abc"), null);
});
