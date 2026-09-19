// POST /functions/v1/create-payment-session
// Body: { orderId, productId }
// Header: Authorization: Bearer <supabase access_token>
//
// Called by the mobile app's services/paymentService.ts right before it
// opens the hosted checkout page. Exchanges the user's real session for a
// short-lived, single-use, narrowly-scoped "payment session" id - only
// that opaque id goes into the URL that opens in an external browser, so
// a long-lived bearer token never ends up in browser history / OS
// "recent links" / proxy logs / server access logs the way a URL-embedded
// JWT would.
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { supabaseAdmin, getUserFromAuthHeader } from "../_shared/supabaseAdmin.ts";

const SESSION_TTL_SECONDS = 10 * 60; // 10 minutes - long enough to open the browser and pay, short enough that a leaked id is nearly worthless soon after.

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) {
      return new Response(JSON.stringify({ error: "Please log in before purchasing." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { orderId, productId } = (await req.json().catch(() => ({}))) as {
      orderId?: string;
      productId?: string;
    };

    if (!orderId || !productId) {
      return new Response(JSON.stringify({ error: "Missing orderId or productId." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // The order was written client-side (see mobile's ordersService.ts -
    // createOrderForProduct), so its amount/status can't be fully trusted
    // yet - it's only used here to confirm this order belongs to this
    // user and is still awaiting payment. The actual price is re-derived
    // from the product row in /pay, never from this order.
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, user_id, product_id, status")
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Order not found." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (order.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "This order does not belong to you." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (order.product_id !== productId) {
      return new Response(JSON.stringify({ error: "Order/product mismatch." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (order.status !== "created") {
      return new Response(
        JSON.stringify({ error: "This order has already been started or completed." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: product, error: productErr } = await supabaseAdmin
      .from("products")
      .select("id, active, price")
      .eq("id", productId)
      .maybeSingle();

    if (productErr || !product || !product.active || !product.price || product.price <= 0) {
      return new Response(JSON.stringify({ error: "This product is no longer available." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

    const { error: insertErr } = await supabaseAdmin.from("payment_sessions").insert({
      id: sessionId,
      order_id: orderId,
      user_id: user.id,
      product_id: productId,
      expires_at: expiresAt,
      used: false,
    });

    if (insertErr) {
      console.error("create-payment-session: insert failed", insertErr);
      return new Response(JSON.stringify({ error: "Could not start payment. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ paymentSession: sessionId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-payment-session: unhandled error", err);
    return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
