import type { Request, Response } from "express";

import { db, auth, FieldValue } from "./admin";
import { getRazorpayClient, getRazorpayKeyId } from "./razorpay";
import { renderCheckoutPage, renderErrorPage } from "./pages";
import { OrderDoc, ProductDoc } from "./types";

export async function handlePay(req: Request, res: Response): Promise<void> {
  const productId = String(req.query.productId || "");
  const idToken = String(req.query.token || "");

  if (!productId || !idToken) {
    res.status(400).send(renderErrorPage("Missing product or login token."));
    return;
  }

  // 1. Verify the Firebase ID token - this is the only thing that
  // identifies who's paying. Never trust a uid passed as a plain query
  // param, since that would let anyone buy a product "as" someone else.
  let uid: string;
  let tokenEmail: string | undefined;
  try {
    const decoded = await auth.verifyIdToken(idToken);
    uid = decoded.uid;
    tokenEmail = decoded.email;
  } catch (err) {
    console.error("pay: invalid ID token", err);
    res
      .status(401)
      .send(renderErrorPage("Your session has expired. Please log in again and retry."));
    return;
  }

  // 2. Look up the product server-side - price and scope always come from
  // Firestore, never from the client, so a tampered query string can't
  // change what's charged or what gets unlocked.
  const productSnap = await db.collection("products").doc(productId).get();
  if (!productSnap.exists) {
    res.status(404).send(renderErrorPage("This product is no longer available."));
    return;
  }

  const product = productSnap.data() as ProductDoc;
  if (!product.active) {
    res.status(400).send(renderErrorPage("This product is no longer available."));
    return;
  }
  if (!product.price || product.price <= 0) {
    res.status(400).send(renderErrorPage("This product doesn't have a valid price."));
    return;
  }

  // 3. Prefer the user's saved profile (services/usersService.ts on the
  // mobile app writes this) for name/email; fall back to the token's
  // email claim if the profile doc hasn't been created yet.
  let displayName = "";
  let email = tokenEmail || "";
  try {
    const userSnap = await db.collection("users").doc(uid).get();
    if (userSnap.exists) {
      const userData = userSnap.data() as any;
      displayName = userData.name || "";
      email = userData.email || email;
    }
  } catch (err) {
    console.error("pay: failed to read user profile (non-fatal)", err);
  }

  // 4. Create the Razorpay order. amount is in paise.
  const amountPaise = Math.round(product.price * 100);
  const razorpay = getRazorpayClient();

  let razorpayOrder;
  try {
    razorpayOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `${uid}_${Date.now()}`,
      notes: { uid, productId },
    });
  } catch (err) {
    console.error("pay: Razorpay order creation failed", err);
    res
      .status(502)
      .send(renderErrorPage("Could not start the payment. Please try again."));
    return;
  }

  // 5. Record a pending order. The product's scope fields are snapshotted
  // here (not re-fetched at verify time) so a product edit/delete between
  // "start payment" and "payment completes" can't change what a
  // successful payment unlocks.
  const orderDoc: OrderDoc = {
    userId: uid,
    userName: displayName,
    userEmail: email,
    productId,
    productTitle: product.title,
    amount: product.price,
    status: "pending",
    razorpayOrderId: razorpayOrder.id,
    scope: product.scope,
    chapterId: product.chapterId,
    subjectId: product.subjectId,
    yearId: product.yearId,
    yearIds: product.yearIds,
    createdAt: FieldValue.serverTimestamp(),
  };

  const orderRef = await db.collection("orders").add(orderDoc);

  // 6. Serve the checkout page. verifyUrl is derived from the incoming
  // request's own host, so this works under whatever region/project it's
  // actually deployed to without hardcoding a URL here.
  const verifyUrl = `${req.protocol}://${req.get("host")}/verifyPayment`;

  res.status(200).send(
    renderCheckoutPage({
      keyId: getRazorpayKeyId(),
      razorpayOrderId: razorpayOrder.id,
      amountPaise,
      productTitle: product.title,
      internalOrderId: orderRef.id,
      verifyUrl,
      prefillName: displayName,
      prefillEmail: email,
    })
  );
}
