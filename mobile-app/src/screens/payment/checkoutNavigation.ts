// Hosts used by Razorpay checkout, its India bank handoffs, and UPI web fallbacks.
// Add a bank host only after verifying its checkout redirect in a local test build.
const HOSTS = [
  'razorpay.com', 'razorpay.in', 'razorpaypayments.com',
  'hdfcbank.com', 'icicibank.com', 'onlinesbi.sbi', 'axisbank.co.in',
  'billdesk.com', 'paytm.com', 'phonepe.com', 'npci.org.in',
];
export const CHECKOUT_ORIGIN_WHITELIST = [
  'about:blank',
  ...HOSTS.flatMap(host => [`https://${host}`, `https://*.${host}`]),
];
export function isAllowedCheckoutWebUrl(raw: string): boolean {
  if (raw === 'about:blank') return true;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    const host = url.hostname.toLowerCase();
    return HOSTS.some(allowed => host === allowed || host.endsWith(`.${allowed}`));
  } catch { return false; }
}
