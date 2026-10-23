// POST /functions/v1/create-order        Body: { productId, useWallet?: boolean }
// Header: Authorization: Bearer <user access token>   (verify_jwt = true)
//
// The ONLY way an order comes into existence. The client sends a product id and
// an optional "use my referral balance" flag, never an amount. The database
// (create_priced_order) reads the price from `products`, applies the friend's
// first-purchase discount and the wallet (eligible product types and max share) from
// referral_settings and the ledger, and stores list price + discount + wallet +
// final amount on the order. The Razorpay order is then created for exactly
// that final amount. The row is immutable afterwards (orders_01_immutable_columns)
// and clients have no write access to `orders`, so "pay Rs 49, then switch the
// order to Rs 1,999" - or "claim a bigger discount" - is impossible.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin, getUserFromAuthHeader } from "../_shared/supabaseAdmin.ts";
import { createRazorpayOrder, getRazorpayKeyId, isLiveMode } from "../_shared/razorpay.ts";
import { withinLimit } from "../_shared/rateLimit.ts";
import { INDIA_ADMINISTRATIVE_AREAS } from "../_shared/ucbStates.ts";
import { paymentGate } from "../_shared/paymentGate.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) return jsonResponse({ error: "Please log in before purchasing." }, 401);
    // Current/legacy native callers send this header. Website Razorpay calls
    // do not. This is a routing guard, not proof of platform or authentication;
    // clients that omit the header cannot be identified as Android here.
    if (req.headers.has("x-medveda-app-version"))
      return jsonResponse({ error: "Android purchases use Google Play Billing. Please update the app.",
        code: "play_billing_required" }, 403);

    const body = (await req.json().catch(() => ({}))) as {
      productId?: unknown; useWallet?: unknown; ucbOrderId?: unknown; buyerState?: unknown;
    };
    const productId = typeof body.productId === "string" ? body.productId : "";
    const useWallet = body.useWallet === true; // anything else = false; no amounts are ever read from the body
    if (!productId || productId.length > 100) return jsonResponse({ error: "Missing productId." }, 400);
    const ucbOrderId = typeof body.ucbOrderId === "string" ? body.ucbOrderId : "";
    const buyerState = typeof body.buyerState === "string" ? body.buyerState : "";
    if (ucbOrderId) {
      if (!UUID.test(ucbOrderId) || !INDIA_ADMINISTRATIVE_AREAS.has(buyerState))
        return jsonResponse({ error: "Select a valid Indian billing state." }, 400);
      const { data: choice, error: choiceError } = await supabaseAdmin.from("orders")
        .select("id,user_id,product_id,provider,status,external_transaction_token,expires_at")
        .eq("id", ucbOrderId).maybeSingle();
      if (choiceError || !choice || choice.user_id !== user.id || choice.product_id !== productId
          || choice.provider !== "play" || choice.status !== "created" || !choice.external_transaction_token
          || (choice.expires_at && Date.parse(choice.expires_at) < Date.now()))
        return jsonResponse({ error: "Billing choice has expired. Please start again." }, 409);
    }
    const gate = await paymentGate(req, !!ucbOrderId);
    if (gate !== "allow") return jsonResponse({ error: gate === "upgrade"
      ? "Update the app before purchasing." : gate === "choice"
      ? "Start checkout with the Play billing choice." : "Billing configuration unavailable." },
      gate === "unavailable" ? 503 : 403);

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

    // Only the course check lives here; price, scope, discount and wallet are
    // all decided inside create_priced_order().
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("id, course_id, active")
      .eq("id", productId)
      .maybeSingle();
    if (!product || !product.active) {
      return jsonResponse({ error: "This product is no longer available." }, 400);
    }
    if (profile.course_id !== product.course_id) {
      return jsonResponse({ error: "This product isn't available for your course." }, 403);
    }

    const { data: priced, error: pricedErr } = await supabaseAdmin.rpc("create_priced_order", {
      p_user_id: user.id,
      p_product_id: product.id,
      p_use_wallet: useWallet,
    });
    if (pricedErr || !priced) {
      console.error("create-order: create_priced_order failed", pricedErr?.code, pricedErr?.message);
      return jsonResponse({ error: "Something went wrong. Please try again." }, 500);
    }
    if (!priced.ok) {
      const messages: Record<string, string> = {
        product_unavailable: "This product is no longer available.",
        wallet_not_allowed: "Referral balance can only be used on notes purchases.",
        invalid_price: "This product doesn't have a valid price.",
        already_owned: "You already own this. It is in your library.",
      };
      return jsonResponse({ error: messages[priced.code] ?? "This order could not be created." }, 400);
    }

    const orderId: string = priced.order_id; // uuid, <= 40 chars, valid Razorpay receipt
    const amountPaise = Math.round(Number(priced.amount) * 100);
    if (!Number.isSafeInteger(amountPaise) || amountPaise < 100) {
      await supabaseAdmin.from("orders").update({ status: "failed" }).eq("id", orderId);
      return jsonResponse({ error: "This product doesn't have a valid price." }, 400);
    }

    let razorpayOrder: { id: string };
    try {
      razorpayOrder = await createRazorpayOrder({
        amountPaise,
        receipt: orderId,
        notes: { uid: user.id, productId: product.id, orderId },
      });
    } catch (err) {
      console.error("create-order: Razorpay order creation failed", err);
      // Release any wallet hold / discount reserved for this attempt.
      await supabaseAdmin.from("orders").update({ status: "failed" }).eq("id", orderId);
      return jsonResponse({ error: "Could not start the payment. Please try again." }, 502);
    }

    // One-time NULL -> value (the immutability trigger allows exactly this).
    const { error: attachErr } = await supabaseAdmin
      .from("orders")
      .update({ razorpay_order_id: razorpayOrder.id })
      .eq("id", orderId)
      .is("razorpay_order_id", null);
    if (attachErr) {
      console.error("create-order: attach razorpay id failed", attachErr.code, attachErr.message);
      await supabaseAdmin.from("orders").update({ status: "failed" }).eq("id", orderId);
      return jsonResponse({ error: "Something went wrong. Please try again." }, 500);
    }

    if (ucbOrderId) {
      const { data: bound, error: bindError } = await supabaseAdmin.rpc("bind_ucb_razorpay_order", {
        p_user_id: user.id, p_choice_id: ucbOrderId, p_razorpay_id: razorpayOrder.id, p_buyer_state: buyerState,
      });
      if (bindError || !bound?.ok) {
        console.error("create-order: UCB binding failed", bindError?.code, bound?.code);
        await supabaseAdmin.from("orders").update({ status: "failed" }).eq("id", orderId);
        return jsonResponse({ error: "Could not bind billing choice. Please start again." }, 409);
      }
    }

    return jsonResponse({
      keyId: getRazorpayKeyId(),
      isLiveMode: isLiveMode(),
      razorpayOrderId: razorpayOrder.id,
      amountPaise,
      productTitle: priced.title,
      internalOrderId: orderId,
      // Display only: the amount actually charged is amountPaise, decided above.
      breakdown: {
        listPrice: Number(priced.list_price),
        referralDiscount: Number(priced.referral_discount),
        walletAmount: Number(priced.wallet_amount),
        amount: Number(priced.amount),
      },
      // Checkout is told to stop accepting payment when the order expires. Razorpay
      // orders themselves cannot expire, so the database enforces it at settlement.
      timeoutSeconds: Number(priced.timeout_seconds) || 1800,
      verifyUrl: `${Deno.env.get("SUPABASE_URL")}/functions/v1/verify-payment`,
      prefillName: profile.name ?? "",
      prefillEmail: profile.email ?? "",
    });
  } catch (err) {
    console.error("create-order: unhandled error", err);
    return jsonResponse({ error: "Something went wrong. Please try again." }, 500);
  }
});
