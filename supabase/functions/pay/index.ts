// GET /functions/v1/pay?session=...
// Called directly by the app (fetch, not Linking.openURL) with the
// opaque, short-lived session id from create-payment-session - never a
// raw access token or a bare productId (see that function's header
// comment for why). Returns the checkout data as JSON; the app renders
// the actual Razorpay Checkout UI itself, inside PaymentCheckoutScreen's
// WebView. See _shared/cors.ts's jsonResponse comment for why this is no
// longer an HTML page.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createRazorpayOrder, getRazorpayKeyId, isLiveMode } from "../_shared/razorpay.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session") || "";

    if (!sessionId) {
      return jsonResponse({ error: "Missing payment session." }, 400);
    }

    // 1. Look up the payment session - this is the only thing that
    // identifies who's paying and for what, once we're past the app's
    // own auth. Single-use and short-lived by design.
    const { data: session, error: sessionErr } = await supabaseAdmin
      .from("payment_sessions")
      .select("id, order_id, user_id, product_id, expires_at, used")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionErr || !session) {
      return jsonResponse(
        { error: "This payment link is invalid. Please try again from the app." },
        404
      );
    }
    if (session.used) {
      return jsonResponse(
        { error: "This payment link has already been used. Please start a new purchase from the app." },
        400
      );
    }
    if (new Date(session.expires_at).getTime() < Date.now()) {
      return jsonResponse(
        { error: "This payment link has expired. Please start a new purchase from the app." },
        400
      );
    }

    // 2. Look up the product server-side - price and title always come
    // from the DB, never from the client, so a tampered query string
    // can't change what's charged.
    const { data: product, error: productErr } = await supabaseAdmin
      .from("products")
      .select("id, title, active, price, scope, chapter_id, subject_id, year_id, year_ids, course_id")
      .eq("id", session.product_id)
      .maybeSingle();

    if (productErr || !product) {
      return jsonResponse({ error: "This product is no longer available." }, 404);
    }
    if (!product.active) {
      return jsonResponse({ error: "This product is no longer available." }, 400);
    }
    if (!product.price || product.price <= 0) {
      return jsonResponse({ error: "This product doesn't have a valid price." }, 400);
    }

    // 3. Prefill name/email from the user's profile.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, email")
      .eq("id", session.user_id)
      .maybeSingle();

    const displayName = profile?.name || "";
    const email = profile?.email || "";

    // 4. Atomically claim this session before creating an external Razorpay
    // order. The earlier read is only for validation; without this compare-
    // and-set, two simultaneous GETs could both see `used = false` and
    // create two chargeable Razorpay orders.
    const { data: claimedSession, error: claimErr } = await supabaseAdmin
      .from("payment_sessions")
      .update({ used: true })
      .eq("id", session.id)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .select("id")
      .maybeSingle();

    if (claimErr || !claimedSession) {
      return jsonResponse(
        { error: "This payment link has already been used or expired. Please start a new purchase from the app." },
        409
      );
    }

    // 5. Create the Razorpay order. amount is in paise.
    const amountPaise = Math.round(product.price * 100);

    let razorpayOrder: { id: string };
    try {
      razorpayOrder = await createRazorpayOrder({
        amountPaise,
        // BUG FIX: this used to be `${session.user_id}_${Date.now()}` -
        // a UUID (36 chars) + "_" + a 13-digit ms timestamp comes to ~50
        // characters, but Razorpay's Orders API rejects any `receipt`
        // over 40 characters (https://razorpay.com/docs/api/orders/create/).
        // That 400 from Razorpay was the actual cause of the 502 seen in
        // the app - order creation never succeeded, so nothing after it
        // (including the checkout screen) ever ran. session.order_id
        // alone is 36 characters, and is already guaranteed unique (it's
        // the orders table's primary key), so it's a safe receipt on its
        // own - no need to append anything to it.
        receipt: session.order_id,
        notes: { uid: session.user_id, productId: product.id, orderId: session.order_id },
      });
    } catch (err) {
      console.error("pay: Razorpay order creation failed", err);
      return jsonResponse({ error: "Could not start the payment. Please try again." }, 502);
    }

    // 6. Snapshot the product's scope fields onto the order now (not
    // re-fetched at verify time) so a product edit/delete between "start
    // payment" and "payment completes" can't change what a successful
    // payment unlocks. Also record the Razorpay order id so verify-payment
    // can cross-check it.
    const { error: updateErr } = await supabaseAdmin
      .from("orders")
      .update({
        razorpay_order_id: razorpayOrder.id,
        amount: product.price,
        scope: product.scope,
        chapter_id: product.chapter_id,
        subject_id: product.subject_id,
        year_id: product.year_id,
        year_ids: product.year_ids,
        course_id: product.course_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.order_id);

    if (updateErr) {
      console.error("pay: failed to update order with razorpay_order_id", updateErr);
      return jsonResponse({ error: "Something went wrong. Please try again." }, 500);
    }

    // 7. Hand back everything PaymentCheckoutScreen needs to open
    // Razorpay Checkout itself and then call verify-payment. verifyUrl is
    // derived from this function's own request origin, so this works
    // under whatever project/region it's actually deployed to without
    // hardcoding a URL.
    const verifyUrl = `${url.origin}/functions/v1/verify-payment`;

    return jsonResponse({
      keyId: getRazorpayKeyId(),
      isLiveMode: isLiveMode(),
      razorpayOrderId: razorpayOrder.id,
      amountPaise,
      productTitle: product.title,
      internalOrderId: session.order_id,
      verifyUrl,
      prefillName: displayName,
      prefillEmail: email,
    });
  } catch (err) {
    console.error("pay: unhandled error", err);
    return jsonResponse({ error: "Something went wrong. Please try again." }, 500);
  }
});
