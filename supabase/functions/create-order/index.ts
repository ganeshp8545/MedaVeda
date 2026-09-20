// POST /functions/v1/create-order        Body: { productId }
// Header: Authorization: Bearer <user access token>   (verify_jwt = true)
//
// The ONLY way an order comes into existence. The client sends a product id and
// nothing else: price, scope and course are read from `products` here, the
// Razorpay order is created for exactly that amount, and product_id + amount +
// razorpay_order_id are stored together in ONE insert. The row is immutable
// afterwards (orders_01_immutable_columns) and clients have no write access to
// `orders`, so "pay Rs 49, then switch the order to Rs 1,999" is impossible.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin, getUserFromAuthHeader } from "../_shared/supabaseAdmin.ts";
import { createRazorpayOrder, getRazorpayKeyId, isLiveMode } from "../_shared/razorpay.ts";
import { withinLimit } from "../_shared/rateLimit.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) return jsonResponse({ error: "Please log in before purchasing." }, 401);

    const body = (await req.json().catch(() => ({}))) as { productId?: unknown };
    const productId = typeof body.productId === "string" ? body.productId : "";
    if (!productId || productId.length > 100) return jsonResponse({ error: "Missing productId." }, 400);

    if (!(await withinLimit(`create-order:${user.id}`, 10, 600))) {
      return jsonResponse({ error: "Too many attempts. Please wait a few minutes and try again." }, 429);
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, email, course_id, blocked")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile || profile.blocked) return jsonResponse({ error: "This account cannot make purchases." }, 403);
    if (!profile.course_id) return jsonResponse({ error: "Please select your course before purchasing." }, 400);

    // Price and scope ALWAYS come from the products table.
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("id, title, active, price, scope, chapter_id, subject_id, year_id, year_ids, course_id")
      .eq("id", productId)
      .maybeSingle();
    if (!product || !product.active || !(Number(product.price) > 0)) {
      return jsonResponse({ error: "This product is no longer available." }, 400);
    }
    if (profile.course_id !== product.course_id) {
      return jsonResponse({ error: "This product isn't available for your course." }, 403);
    }

    const amountPaise = Math.round(Number(product.price) * 100);
    if (!Number.isSafeInteger(amountPaise) || amountPaise < 100) {
      return jsonResponse({ error: "This product doesn't have a valid price." }, 400);
    }

    const orderId = crypto.randomUUID(); // <= 40 chars, valid Razorpay receipt
    let razorpayOrder: { id: string };
    try {
      razorpayOrder = await createRazorpayOrder({
        amountPaise,
        receipt: orderId,
        notes: { uid: user.id, productId: product.id, orderId },
      });
    } catch (err) {
      console.error("create-order: Razorpay order creation failed", err);
      return jsonResponse({ error: "Could not start the payment. Please try again." }, 502);
    }

    const { error: insertErr } = await supabaseAdmin.from("orders").insert({
      id: orderId,
      user_id: user.id,
      product_id: product.id,
      scope: product.scope,
      chapter_id: product.chapter_id,
      subject_id: product.subject_id,
      year_id: product.year_id,
      year_ids: product.year_ids,
      course_id: product.course_id,
      amount: product.price,
      status: "created",
      razorpay_order_id: razorpayOrder.id,
    });
    if (insertErr) {
      console.error("create-order: insert failed", insertErr.code, insertErr.message);
      return jsonResponse({ error: "Something went wrong. Please try again." }, 500);
    }

    return jsonResponse({
      keyId: getRazorpayKeyId(),
      isLiveMode: isLiveMode(),
      razorpayOrderId: razorpayOrder.id,
      amountPaise,
      productTitle: product.title,
      internalOrderId: orderId,
      verifyUrl: `${Deno.env.get("SUPABASE_URL")}/functions/v1/verify-payment`,
      prefillName: profile.name ?? "",
      prefillEmail: profile.email ?? "",
    });
  } catch (err) {
    console.error("create-order: unhandled error", err);
    return jsonResponse({ error: "Something went wrong. Please try again." }, 500);
  }
});
