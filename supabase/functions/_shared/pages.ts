// Minimal, dependency-free HTML - originally rendered inside the device's
// external browser (opened via Linking.openURL from the app).
//
// NOT USED by pay/verify-payment anymore. Supabase Edge Functions only
// serve real text/html on a custom domain (Pro plan) - on the default
// *.supabase.co domain, GET responses with Content-Type: text/html get
// rewritten to text/plain and any <script> in them is blocked from
// running (browser console: "Blocked script execution ... because the
// document's frame is sandboxed and the 'allow-scripts' permission is
// not set"). That's why the Buy button did nothing - the inline script
// that opened Razorpay Checkout never executed. pay and verify-payment
// now return JSON, and PaymentCheckoutScreen.tsx (in the app) builds its
// own HTML locally for the WebView instead of fetching it from here.
// Kept in case a custom domain gets set up later and someone wants to go
// back to serving this directly.

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shell(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MedVeda Checkout</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0f1a13;
      color: #f4f1ea;
      font-family: -apple-system, Roboto, "Segoe UI", sans-serif;
      padding: 24px;
    }
    .card {
      width: 100%;
      max-width: 420px;
      background: #16241a;
      border: 1px solid #2a3d2e;
      border-radius: 20px;
      padding: 28px 24px;
      text-align: center;
    }
    h1 { font-size: 20px; margin: 0 0 8px; }
    p { font-size: 15px; color: #b9c4b8; line-height: 1.5; margin: 0 0 20px; }
    .price { font-size: 28px; font-weight: 700; margin: 12px 0 20px; color: #ff8a3d; }
    button {
      width: 100%;
      padding: 15px;
      border: none;
      border-radius: 12px;
      background: #ff8a3d;
      color: #17140f;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
    }
    button:disabled { opacity: 0.6; }
    .icon { font-size: 42px; margin-bottom: 6px; }
    .muted { font-size: 13px; color: #7f8c7e; margin-top: 18px; }
  </style>
</head>
<body>
  <div class="card">
    ${bodyHtml}
  </div>
</body>
</html>`;
}

export function renderErrorPage(message: string): string {
  return shell(`
    <div class="icon">⚠️</div>
    <h1>Something went wrong</h1>
    <p>${escapeHtml(message)}</p>
    <p class="muted">Please go back to the MedVeda app and try again.</p>
  `);
}

export function renderResultPage(params: {
  success: boolean;
  title: string;
  message: string;
}): string {
  return shell(`
    <div class="icon">${params.success ? "✅" : "❌"}</div>
    <h1>${escapeHtml(params.title)}</h1>
    <p>${escapeHtml(params.message)}</p>
    <p class="muted">You can close this page and return to the MedVeda app.</p>
  `);
}

export function renderCheckoutPage(params: {
  keyId: string;
  razorpayOrderId: string;
  amountPaise: number;
  productTitle: string;
  internalOrderId: string;
  verifyUrl: string;
  prefillName?: string;
  prefillEmail?: string;
}): string {
  const rupees = (params.amountPaise / 100).toFixed(2);

  // Checkout.js's `handler` callback fires only on a *successful* payment.
  // We still verify the signature server-side in verify-payment before
  // ever writing a purchase row - this client step only forwards the
  // three fields Razorpay hands back, it does not itself grant access.
  return shell(`
    <div class="icon">🌿</div>
    <h1>${escapeHtml(params.productTitle)}</h1>
    <div class="price">₹${rupees}</div>
    <p>Secure payment powered by Razorpay - UPI, Cards, Net Banking supported.</p>
    <button id="payBtn">Pay ₹${rupees}</button>
    <p class="muted" id="status"></p>

    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
    <script>
      var payBtn = document.getElementById("payBtn");
      var statusEl = document.getElementById("status");

      function setStatus(text) { statusEl.textContent = text; }

      payBtn.addEventListener("click", function () {
        payBtn.disabled = true;
        setStatus("Opening secure payment...");

        var options = {
          key: ${JSON.stringify(params.keyId)},
          amount: ${JSON.stringify(params.amountPaise)},
          currency: "INR",
          name: "MedVeda",
          description: ${JSON.stringify(params.productTitle)},
          order_id: ${JSON.stringify(params.razorpayOrderId)},
          prefill: {
            name: ${JSON.stringify(params.prefillName || "")},
            email: ${JSON.stringify(params.prefillEmail || "")}
          },
          theme: { color: "#ff8a3d" },
          handler: function (response) {
            setStatus("Verifying payment...");

            fetch(${JSON.stringify(params.verifyUrl)}, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                internalOrderId: ${JSON.stringify(params.internalOrderId)},
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              })
            })
              .then(function (res) { return res.text(); })
              .then(function (html) { document.open(); document.write(html); document.close(); })
              .catch(function () {
                setStatus("Payment succeeded but verification failed to load. Please contact support with your payment ID: " + response.razorpay_payment_id);
              });
          },
          modal: {
            ondismiss: function () {
              payBtn.disabled = false;
              setStatus("Payment cancelled. You can try again.");
            }
          }
        };

        var rzp = new Razorpay(options);
        rzp.on("payment.failed", function (response) {
          payBtn.disabled = false;
          setStatus("Payment failed: " + response.error.description);
        });
        rzp.open();
      });
    </script>
  `);
}
