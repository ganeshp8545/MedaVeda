import * as crypto from "crypto";
import Razorpay from "razorpay";

// Read at call time (not module load time) so this works correctly with
// Cloud Functions' secret injection, which sets process.env only once the
// function instance actually starts handling a request.
function getKeys() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error(
      "Razorpay keys are not configured. Run:\n" +
        "  firebase functions:secrets:set RAZORPAY_KEY_ID\n" +
        "  firebase functions:secrets:set RAZORPAY_KEY_SECRET"
    );
  }

  return { keyId, keySecret };
}

export function getRazorpayClient(): Razorpay {
  const { keyId, keySecret } = getKeys();
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export function getRazorpayKeyId(): string {
  return getKeys().keyId;
}

// Razorpay's documented signature scheme for Checkout (Orders API):
// signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret)
// Must match exactly what the client (Checkout.js) sends back.
export function verifyPaymentSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean {
  const { keySecret } = getKeys();

  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
    .digest("hex");

  // Constant-time comparison to avoid timing attacks. Both buffers must be
  // the same length for timingSafeEqual - mismatched lengths mean an
  // automatic "not equal" rather than a thrown error.
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(params.razorpaySignature, "utf8");

  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
