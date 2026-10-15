// The legacy Razorpay harness contains no UCB orders; external reporting is inert.
export async function reportExternalOrder(_orderId: string): Promise<"skipped"> { return "skipped"; }
export async function reportExternalFullRefund(_orderId: string): Promise<"skipped"> { return "skipped"; }
export async function reportExternalRefundEvent(_refundId: string): Promise<"skipped"> { return "skipped"; }
