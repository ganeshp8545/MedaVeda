import type { Request, Response } from "express";

import { db, FieldValue } from "./admin";
import { verifyPaymentSignature } from "./razorpay";
import { renderErrorPage, renderResultPage } from "./pages";
import { OrderDoc, PaymentDoc, PurchaseDoc } from "./types";

export async function handleVerifyPayment(req: Request, res: Response): Promise<void> {
  const {
    internalOrderId,
    razorpay_order_id: razorpayOrderId,
    razorpay_payment_id: razorpayPaymentId,
    razorpay_signature: razorpaySignature,
  } = (req.body || {}) as Record<string, string>;

  if (!internalOrderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    res.status(400).send(renderErrorPage("Missing payment details for verification."));
    return;
  }

  // 1. Verify the signature BEFORE touching Firestore at all - this is
  // the step that actually proves the payment is genuine and wasn't
  // tampered with in transit.
  const signatureValid = verifyPaymentSignature({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  });

  const orderRef = db.collection("orders").doc(internalOrderId);
  const orderSnap = await orderRef.get();

  if (!orderSnap.exists) {
    res.status(404).send(renderErrorPage("Order not found. Please contact support."));
    return;
  }

  const order = orderSnap.data() as OrderDoc;

  // Defense in depth: the Razorpay order id returned by Checkout must
  // match the one we created for this exact internal order. This blocks
  // someone from replaying a signature from a *different, already-paid*
  // order against this one.
  if (!signatureValid || order.razorpayOrderId !== razorpayOrderId) {
    console.error("verifyPayment: signature/order mismatch", {
      internalOrderId,
      razorpayOrderId,
      expected: order.razorpayOrderId,
    });
    await orderRef.update({ status: "failed" }).catch(() => {});
    res
      .status(400)
      .send(
        renderResultPage({
          success: false,
          title: "Payment Verification Failed",
          message:
            "We couldn't verify this payment. If money was deducted, it will be refunded automatically within a few days. Please contact support if you don't see it unlocked.",
        })
      );
    return;
  }

  // 2. Idempotency: payments/{razorpayPaymentId} uses the payment id as
  // its own doc id, so if this handler ever runs twice for the same
  // payment (retry, duplicate tab, etc.), the second run detects the
  // existing record and skips re-granting a duplicate purchase.
  const paymentRef = db.collection("payments").doc(razorpayPaymentId);

  const alreadyProcessed = await db.runTransaction(async (tx) => {
    const existing = await tx.get(paymentRef);
    if (existing.exists) return true;

    const paymentDoc: PaymentDoc = {
      orderId: internalOrderId,
      userId: order.userId,
      productId: order.productId,
      amount: order.amount,
      razorpayOrderId,
      razorpayPaymentId,
      status: "success",
      verifiedAt: FieldValue.serverTimestamp(),
    };
    tx.set(paymentRef, paymentDoc);

    tx.update(orderRef, {
      status: "paid",
      paymentId: razorpayPaymentId,
    });

    const purchaseDoc: PurchaseDoc = {
      userId: order.userId,
      scope: order.scope,
      chapterId: order.chapterId,
      subjectId: order.subjectId,
      yearId: order.yearId,
      yearIds: order.yearIds,
      productTitle: order.productTitle,
      amount: order.amount,
      status: "success",
      orderId: internalOrderId,
      razorpayOrderId,
      createdAt: FieldValue.serverTimestamp(),
    };
    tx.set(db.collection("purchases").doc(), purchaseDoc);

    return false;
  });

  if (alreadyProcessed) {
    console.log("verifyPayment: duplicate callback for", razorpayPaymentId, "- skipped re-grant");
  }

  res.status(200).send(
    renderResultPage({
      success: true,
      title: "Payment Successful 🎉",
      message: `"${order.productTitle}" is now unlocked. Open the AyurPulse app to start learning.`,
    })
  );
}
