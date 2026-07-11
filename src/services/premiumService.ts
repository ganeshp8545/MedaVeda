export type PremiumPlan =
  | "FREE"
  | "MONTHLY"
  | "THREE_MONTHS"
  | "YEARLY"
  | "LIFETIME";

export async function purchasePlan(plan: PremiumPlan) {

  console.log("Selected Plan:", plan);

  return {
    success: false,
    message: "Payment Gateway Coming Soon",
  };

}