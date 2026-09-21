// Builds the HTML given directly to <WebView source={{ html }} /> in
// PaymentCheckoutScreen. This runs INSIDE the app's own WebView, not on
// Supabase's domain - so it isn't affected by Supabase's "GET requests
// that return text/html get rewritten to text/plain, scripts blocked"
// restriction on Edge Functions (see _shared/cors.ts's jsonResponse
// comment in the supabase-migration project for the full story). The
// checkout.js script loaded here comes straight from Razorpay's own CDN,
// which is a normal https script load a WebView has no trouble with.
//
// Communicates back to PaymentCheckoutScreen via
// window.ReactNativeWebView.postMessage(JSON.stringify(...)), handled by
// the screen's onMessage prop. Three message shapes:
//   { type: "success", razorpay_order_id, razorpay_payment_id, razorpay_signature }
//   { type: "failed", reason }
//   { type: "cancelled" }

// The page is built from strings that are NOT all fixed: the product title comes from the
// database and the prefill name is typed by the student. Both used to be interpolated with
// only a "</script" guard, so a title like `<img src=x onerror=...>` ran as script inside a
// WebView that has a postMessage bridge to the app. Everything variable is now escaped for the
// context it lands in.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// JSON that is safe to place inside an inline <script>: no "<", ">" or "&" (so neither
// "</script>" nor "<!--" can appear) and no U+2028 / U+2029 line terminators.
function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function buildCheckoutHtml(params: {
  keyId: string;
  razorpayOrderId: string;
  timeoutSeconds?: number;
  amountPaise: number;
  productTitle: string;
  prefillName?: string;
  prefillEmail?: string;
}): string {
  const rupees = (Number(params.amountPaise) / 100).toFixed(2);

  const optionsJson = jsonForScript(
    {
      key: params.keyId,
      amount: params.amountPaise,
      currency: "INR",
      name: "MedVeda",
      description: params.productTitle,
      order_id: params.razorpayOrderId,
      // Checkout stops accepting payment when the order expires (server-driven).
      ...(params.timeoutSeconds ? { timeout: params.timeoutSeconds } : {}),
      prefill: {
        name: params.prefillName || "",
        email: params.prefillEmail || "",
      },
      theme: { color: "#E2703D" },
      config: {
        display: {
          blocks: {
            upi: {
              name: "Pay via UPI",
              instruments: [{ method: "upi" }],
            },
            other: {
              name: "Other payment methods",
              instruments: [
                { method: "card" },
                { method: "netbanking" },
                { method: "wallet" },
              ],
            },
          },
          sequence: ["block.upi", "block.other"],
          preferences: { show_default_blocks: false },
        },
      },
    }
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MedVeda Checkout</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      height: 100%;
      background: #100C0A;
      color: #F5EDE7;
      font-family: -apple-system, Roboto, "Segoe UI", sans-serif;
    }
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      width: 100%;
      max-width: 420px;
      background: #1B1512;
      border: 1px solid #2E2420;
      border-radius: 20px;
      padding: 28px 24px;
      text-align: center;
    }
    h1 { font-size: 20px; margin: 0 0 8px; }
    .price { font-size: 28px; font-weight: 700; margin: 12px 0 4px; color: #E2703D; }
    .status { font-size: 13px; color: #A6968A; margin-top: 18px; min-height: 18px; }
    .icon { font-size: 42px; margin-bottom: 6px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🌿</div>
    <h1>${escapeHtml(params.productTitle)}</h1>
    <div class="price">₹${rupees}</div>
    <div class="status" id="status">Opening secure payment...</div>
  </div>

  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <script>
    function post(message) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
      }
    }

    function setStatus(text) {
      var el = document.getElementById("status");
      if (el) el.textContent = text;
    }

    try {
      var options = ${optionsJson};

      options.handler = function (response) {
        setStatus("Verifying payment...");
        post({
          type: "success",
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature
        });
      };

      options.modal = {
        ondismiss: function () {
          post({ type: "cancelled" });
        }
      };

      var rzp = new Razorpay(options);
      rzp.on("payment.failed", function (response) {
        setStatus("Payment failed.");
        post({ type: "failed", reason: response.error && response.error.description });
      });

      // The app already created the order before opening this screen,
      // so open the modal immediately - no extra button tap needed.
      rzp.open();
    } catch (err) {
      setStatus("Could not start payment.");
      post({ type: "failed", reason: String(err && err.message ? err.message : err) });
    }
  </script>
</body>
</html>`;
}