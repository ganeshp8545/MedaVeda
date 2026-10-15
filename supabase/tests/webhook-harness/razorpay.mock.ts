// Stand-in for Razorpay's API: the test decides what "Razorpay says" via globalThis.__rzp.
const st = () => (globalThis as any).__rzp;
export async function fetchPayment(id: string) { const p = st().payments[id]; if (!p) throw new Error(`no such payment ${id}`); return p; }
export async function fetchRefund(id: string) { const r = st().refunds[id]; if (!r) throw new Error(`no such refund ${id}`); return r; }
export async function fetchDispute(id: string) { const d = st().disputes[id]; if (!d) throw new Error(`Razorpay GET disputes failed (404)`); return d; }
export async function fetchRazorpayOrder(id: string) {
  const order = st().orders[id];
  if (st().beforeOrderFetch) { const callback = st().beforeOrderFetch; st().beforeOrderFetch = null; await callback(); }
  return order;
}
