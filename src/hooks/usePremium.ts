import { useState } from "react";

export default function usePremium() {

  // Future:
  // Firebase मधून Plan Load होईल

  const [plan] = useState("FREE");

  const isPremium = plan === "PREMIUM";

  return {
    plan,
    isPremium,
  };
}