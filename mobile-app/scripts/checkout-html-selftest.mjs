import { buildCheckoutHtml } from "../src/screens/payment/checkoutHtmlTemplate.ts";
const evil = `</script><img src=x onerror=alert(1)> <!--<script> "quote" 'q' ${String.fromCharCode(0x2028)} & `;
const html = buildCheckoutHtml({ keyId: "rzp_live_x", razorpayOrderId: "order_1", amountPaise: 4900, productTitle: evil, prefillName: evil, prefillEmail: 'a"b@x.com' });
const h1 = html.match(/<h1>(.*?)<\/h1>/s)[1];
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const checks = {
  "h1 has no raw tag": !/[<>]/.test(h1),
  "exactly 2 script blocks (checkout.js + inline)": scripts.length === 2,
  "no injected <img> anywhere": !/<img/i.test(html),
  "no '<!--' in inline script": !scripts[1].includes("<!--"),
  "no U+2028 inside any <script>": !scripts.join("").includes(String.fromCharCode(0x2028)),
};
// the inline script's options object must still parse and round-trip the hostile values
const m = scripts[1].match(/var options = (\{[\s\S]*?\});\n/);
const opts = JSON.parse(m[1]);
checks["options JSON parses"] = true;
checks["description round-trips exactly"] = opts.description === evil;
checks["prefill name round-trips exactly"] = opts.prefill.name === evil;
checks["amount unchanged"] = opts.amount === 4900 && opts.order_id === "order_1";
for (const [k, v] of Object.entries(checks)) console.log(v ? "PASS" : "FAIL", k);
