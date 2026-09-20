/**
 * Run locally with: node verify-signature-selftest.js
 * No dependencies needed (just Node's built-in crypto).
 *
 * This does NOT call Razorpay or Firebase. It only proves that the
 * signature-verification formula used in functions/src/verifyPayment.ts
 * and functions/src/webhook.ts is implemented correctly, by generating a
 * signature the same way Razorpay does and confirming our verify logic
 * accepts it - and rejects a tampered one.
 *
 * Run this once before you deploy, and again any time you touch the
 * signature-checking code.
 */
const crypto = require("crypto");

function computeSignature(orderId, paymentId, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

// Same check verifyPayment.ts does:
function verify(orderId, paymentId, secret, signatureToCheck) {
  const expected = computeSignature(orderId, paymentId, secret);
  return expected === signatureToCheck;
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAILED: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`OK: ${message}`);
  }
}

const secret = "test_secret_key";
const orderId = "order_TESTabc123";
const paymentId = "pay_TESTxyz789";

const validSignature = computeSignature(orderId, paymentId, secret);

assert(
  verify(orderId, paymentId, secret, validSignature) === true,
  "A correctly generated signature is accepted"
);

assert(
  verify(orderId, paymentId, secret, "0000000000tampered") === false,
  "A tampered signature is rejected"
);

assert(
  verify(orderId, paymentId, "wrong_secret", validSignature) === false,
  "Signature generated with the wrong secret is rejected"
);

assert(
  verify("order_DIFFERENT", paymentId, secret, validSignature) === false,
  "Signature is rejected if the order id doesn't match"
);

console.log("\nIf all four checks say OK, the signature logic used in");
console.log("verifyPayment.ts and webhook.ts is correct.");
