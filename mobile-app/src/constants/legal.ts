// Business/legal details shown in the app. Keep in sync with website/scripts/build.mjs.
export const LEGAL = {
  companyName: "MedVeda",
  address: "Dhule, Maharashtra, India",
  email: "medvedaforu@gmail.com",
  phoneDisplay: "+91 76206 16068",
  whatsappUrl: "https://wa.me/917620616068",
  supportHours: "Monday to Saturday, 10:00 AM – 6:00 PM IST (excluding public holidays)",
  grievanceOfficer: "Ashwini",
  grievanceAck: "within 48 hours",
  grievanceResolution: "within 15 working days (and in any case within one month)",
  jurisdiction: "Dhule, Maharashtra",
  effectiveDate: "20 September 2026",
} as const;

const SITE = "https://www.medveda.in";
export const WEB = {
  privacy: `${SITE}/privacy-policy`,
  terms: `${SITE}/terms`,
  refund: `${SITE}/refund-policy`,
  shipping: `${SITE}/shipping-policy`,
  disclaimer: `${SITE}/disclaimer`,
  deleteAccount: `${SITE}/delete-account`,
  contact: `${SITE}/contact`,
} as const;
